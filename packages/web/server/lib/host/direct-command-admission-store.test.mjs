import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from './session-state.js';
import { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';

const options = {
  providerId: 'provider',
  modelId: 'model',
  agentId: null,
  variant: 'variant',
  reasoningEffort: 'high',
};
const sharedRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-command-scope-'));
const sharedAgentDir = path.join(sharedRepoDir, '.agents');
fs.mkdirSync(sharedAgentDir, { recursive: true });
const scopeFor = (sessionId) => ({
  sessionId,
  rootSessionId: sessionId,
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  cwd: sharedRepoDir,
  agentDirectoryId: 'agent-directory-1',
  agentDirectory: sharedAgentDir,
  displayPath: 'app',
});
const promptFor = (text = 'Ship the change') => ({
  input: {
    text,
    attachments: [{ attachmentId: 'attachment-1', name: 'plan.txt', mediaType: 'text/plain', size: 4, uri: 'attachment://attachment-1' }],
    context: [{ kind: 'context', text: 'Review context', metadata: { issue: 'ISSUE-1' }, deliveryReceiptId: 'context-receipt-1' }],
  },
  options,
});
const runAck = (sessionId, runId) => ({ run: { runId, sessionId, status: 'pending', createdAt: 100 } });
const runtimeAck = (body) => ({
  sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: body.projectId, workspaceId: body.workspaceId,
  displayPath: body.displayPath, createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, continuationPending: false,
});
const steerAck = (sessionId, runId) => ({ sessionId, runId, acceptedAt: 101 });
const followUpAck = (sessionId, followUpId) => ({ sessionId, followUpId, acceptedAt: 102 });

const fixtures = new Set();
const makeHarness = async ({ dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-command-admission-')), nativeHandler } = {}) => {
  const state = createHostSessionState({ dataDir });
  await state.initialize();
  await state.agentScopeStore.ensureWorkspace({
    hostProjectId: 'project-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    projectDirectory: sharedRepoDir,
    workspaceDirectory: sharedRepoDir,
    agentDirectory: sharedAgentDir,
    name: 'Project',
  });
  const nativeCalls = [];
  const captures = [];
  const receipts = [];
  const handler = nativeHandler ?? (async ({ pathname, body }) => {
    if (pathname.endsWith('/runs')) return runAck(body.request.input.text === 'Ship the change' ? 'session-a' : 'session-b', body.runId);
    if (pathname.endsWith('/steer')) return steerAck('session-a', 'run-steered');
    return followUpAck('session-a', 'follow-up-1');
  });
  const service = createOpenChamberSessionService({
    agentScopeStore: state.agentScopeStore,
    service: {
      request: async (pathname, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : undefined;
        // Reopen is admission plumbing, not the dispatch this suite counts.
        if (pathname.endsWith('/reopen')) return Response.json(runtimeAck(body));
        nativeCalls.push({ pathname, body });
        const result = await handler({ pathname, body, nativeCalls });
        return Response.json(result);
      },
    },
    resolveWorkspaceScope: async () => ({ ...scopeFor('workspace-1'), projectId: 'project-1', workspaceId: 'workspace-1' }),
    resolveSessionScope: async (sessionId) => scopeFor(sessionId),
    resolveHostSessionScope: async (sessionId) => scopeFor(sessionId),
    registerSessionScope: async () => true,
    resolveAttachments: async (scope, attachments) => {
      captures.push({ kind: 'attachments', scope, attachments });
      return attachments.map(({ attachmentId }) => ({ attachmentId, path: `/host/attachments/${attachmentId}` }));
    },
    capturePrompt: async (scope, request) => {
      captures.push({ kind: 'prompt', scope, request });
      return request;
    },
    beforeDispatch: async (scope, capture) => {
      captures.push({ kind: 'beforeDispatch', scope, capture });
    },
    onPromptAccepted: async (scope, capture, receipt) => {
      receipts.push({ scope, capture, receipt });
    },
    directCommandAdmissionStore: state.directCommandAdmissionStore,
    archiveStore: state.archiveStore,
    sessionMetadataStore: state.sessionMetadataStore,
  });
  const fixture = { dataDir, state, service, nativeCalls, captures, receipts, close: () => state.close() };
  fixtures.add(fixture);
  return fixture;
};
const countAdmissionRows = (state) => {
  const db = new DatabaseSync(state.databasePath);
  try { return db.prepare('SELECT COUNT(*) AS count FROM host_direct_command').get().count; } finally { db.close(); }
};
const expectAdmissionError = async (promise, statusCode, code) => {
  await expect(promise).rejects.toMatchObject({ statusCode, code });
};

afterEach(async () => {
  for (const fixture of fixtures) await fixture.close();
  for (const fixture of fixtures) fs.rmSync(fixture.dataDir, { recursive: true, force: true });
  fixtures.clear();
});
afterAll(() => {
  fs.rmSync(sharedRepoDir, { recursive: true, force: true });
});

describe('real SQLite direct command admission', () => {
  it.each([
    ['send', 'send', (service, session, request, commandId) => service.send(session, request, commandId)],
    ['steer', 'steer', (service, session, request, commandId) => service.steer(session, { request }, commandId)],
    ['followUp', 'follow-up', (service, session, request, commandId) => service.followUp(session, { request }, commandId)],
  ])('replays an accepted %s command exactly without a second native dispatch', async (operation, _path, invoke) => {
    const fixture = await makeHarness();
    const request = promptFor();
    const first = await invoke(fixture.service, 'session-a', request, `command-${operation}`);
    const second = await invoke(fixture.service, 'session-a', request, `command-${operation}`);

    expect(second).toEqual(first);
    expect(fixture.nativeCalls).toHaveLength(1);
    expect(fixture.captures.filter(({ kind }) => kind === 'prompt')).toHaveLength(1);
    expect(fixture.captures.find(({ kind }) => kind === 'attachments').attachments).toEqual(request.input.attachments);
    expect(fixture.nativeCalls[0].body.request).toEqual(request);
    expect(fixture.nativeCalls[0].body.attachments).toEqual([{ attachmentId: 'attachment-1', path: '/host/attachments/attachment-1' }]);
    expect(fixture.receipts).toHaveLength(1);
  });

  it('rejects a concurrent duplicate while native acceptance is pending', async () => {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const fixture = await makeHarness({ nativeHandler: async ({ pathname, body }) => {
      entered.resolve();
      await release.promise;
      return pathname.endsWith('/runs') ? runAck('session-a', body.runId) : steerAck('session-a', 'run-1');
    } });
    const request = promptFor();
    const first = fixture.service.send('session-a', request, 'held-command');
    await entered.promise;
    await expectAdmissionError(fixture.service.send('session-a', request, 'held-command'), 409, 'COMMAND_IN_FLIGHT');
    expect(fixture.nativeCalls).toHaveLength(1);
    release.resolve();
    await expect(first).resolves.toMatchObject({ run: { sessionId: 'session-a' } });
  });

  it('conflicts on changed input, options, context, and operation under one command key', async () => {
    const fixture = await makeHarness();
    const request = promptFor();
    await fixture.service.send('session-a', request, 'conflict-command');
    await expectAdmissionError(fixture.service.send('session-a', promptFor('Different text'), 'conflict-command'), 400, 'IDEMPOTENCY_CONFLICT');
    await expectAdmissionError(fixture.service.send('session-a', { ...request, options: { ...options, modelId: 'other-model' } }, 'conflict-command'), 400, 'IDEMPOTENCY_CONFLICT');
    await expectAdmissionError(fixture.service.send('session-a', { ...request, input: { ...request.input, context: [{ kind: 'context', text: 'Changed context', metadata: { issue: 'ISSUE-1' } }] } }, 'conflict-command'), 400, 'IDEMPOTENCY_CONFLICT');
    await expectAdmissionError(fixture.service.steer('session-a', { request }, 'conflict-command'), 400, 'IDEMPOTENCY_CONFLICT');
    expect(fixture.nativeCalls).toHaveLength(1);
  });

  it('allows the same command key independently in separate session scopes', async () => {
    const fixture = await makeHarness({ nativeHandler: async ({ pathname, body }) => pathname.endsWith('/runs') ? runAck(body.request.input.text === 'A' ? 'session-a' : 'session-b', body.runId) : steerAck('session-a', 'run') });
    const first = await fixture.service.send('session-a', promptFor('A'), 'shared-command');
    const second = await fixture.service.send('session-b', promptFor('B'), 'shared-command');

    expect(first).not.toEqual(second);
    expect(fixture.nativeCalls).toHaveLength(2);
    expect(countAdmissionRows(fixture.state)).toBe(2);
  });

  it('rejects malformed parsed input before claiming or dispatching native work', async () => {
    const fixture = await makeHarness();
    await expectAdmissionError(fixture.service.send('session-a', { input: { text: 'missing options', attachments: [], context: [] } }, 'invalid-command'), 400, 'INVALID_REQUEST');
    expect(fixture.nativeCalls).toHaveLength(0);
    expect(countAdmissionRows(fixture.state)).toBe(0);
  });
  it.each([
    ['agentId', request => ({ ...request, options: { ...request.options, agentId: 'build' } })],
    ['agentMention', request => ({ ...request, input: { ...request.input, agentMention: { agentId: 'build' } } })],
  ])('rejects root %s before the Host claim or native dispatch', async (_field, mutate) => {
    const fixture = await makeHarness();
    await expectAdmissionError(fixture.service.send('session-a', mutate(promptFor()), 'rejected-root'), 400, 'INVALID_REQUEST');
    expect(fixture.nativeCalls).toHaveLength(0);
    expect(fixture.captures).toHaveLength(0);
    expect(countAdmissionRows(fixture.state)).toBe(0);
  });

  it('retains accepted commands across a Host restart', async () => {
    const first = await makeHarness();
    const request = promptFor();
    const acknowledgment = await first.service.send('session-a', request, 'durable-command');
    await first.close();
    const second = await makeHarness({ dataDir: first.dataDir });

    await expect(second.service.send('session-a', request, 'durable-command')).resolves.toEqual(acknowledgment);
    expect(second.nativeCalls).toHaveLength(0);
  });

  it('retains a pending command across a Host restart as ambiguous', async () => {
    const first = await makeHarness();
    const scope = scopeFor('session-a');
    const request = promptFor();
    await first.state.directCommandAdmissionStore.claim(scope, 'pending-command', 'send', request);
    await first.close();
    const second = await makeHarness({ dataDir: first.dataDir });

    await expectAdmissionError(second.state.directCommandAdmissionStore.claim(scope, 'pending-command', 'send', request), 409, 'COMMAND_IN_FLIGHT');
    expect(second.nativeCalls).toHaveLength(0);
  });

  it('keeps a claim failure isolated from sibling sessions and native dispatch', async () => {
    const fixture = await makeHarness();
    const db = new DatabaseSync(fixture.state.databasePath);
    try {
      db.exec("CREATE TRIGGER fail_claim BEFORE INSERT ON host_direct_command WHEN NEW.command_id = 'claim-fail' BEGIN SELECT RAISE(ABORT, 'injected claim failure'); END");
      await expectAdmissionError(fixture.service.send('session-a', promptFor(), 'claim-fail'), 503, 'METADATA_WRITE_FAILED');
      expect(fixture.nativeCalls).toHaveLength(0);
      await expect(fixture.service.send('session-b', promptFor('sibling'), 'sibling-command')).resolves.toMatchObject({ run: { sessionId: 'session-b' } });
      expect(fixture.nativeCalls).toHaveLength(1);
      expect(countAdmissionRows(fixture.state)).toBe(1);
    } finally { db.close(); }
  });

  it('keeps an acknowledgement failure pending and never redispatches it', async () => {
    const fixture = await makeHarness();
    const db = new DatabaseSync(fixture.state.databasePath);
    try {
      db.exec("CREATE TRIGGER fail_ack BEFORE UPDATE OF state ON host_direct_command WHEN NEW.command_id = 'ack-fail' AND NEW.state = 'accepted' BEGIN SELECT RAISE(ABORT, 'injected acknowledgement failure'); END");
      await expectAdmissionError(fixture.service.send('session-a', promptFor(), 'ack-fail'), 503, 'METADATA_WRITE_FAILED');
      await expectAdmissionError(fixture.service.send('session-a', promptFor(), 'ack-fail'), 409, 'COMMAND_IN_FLIGHT');
      await expect(fixture.service.send('session-b', promptFor('sibling'), 'ack-sibling')).resolves.toMatchObject({ run: { sessionId: 'session-b' } });
      expect(fixture.nativeCalls).toHaveLength(2);
    } finally { db.close(); }
  });

  it.each([
    ['disconnect', async () => { throw new Error('native disconnected'); }],
    ['invalid acknowledgement', async ({ pathname, body }) => pathname.endsWith('/runs') ? runAck('session-a', 'different-run') : steerAck('session-a', 'run')],
  ])('does not fake success after a keyed native %s', async (_label, nativeHandler) => {
    const fixture = await makeHarness({ nativeHandler });
    const request = promptFor();
    await expectAdmissionError(fixture.service.send('session-a', request, 'ambiguous-command'), 409, 'COMMAND_IN_FLIGHT');
    await expectAdmissionError(fixture.service.send('session-a', request, 'ambiguous-command'), 409, 'COMMAND_IN_FLIGHT');
    expect(fixture.nativeCalls).toHaveLength(1);
  });

  it('preserves the native error for an unkeyed command', async () => {
    const fixture = await makeHarness({ nativeHandler: async () => { throw new Error('native disconnected'); } });
    await expect(fixture.service.send('session-a', promptFor())).rejects.toThrow('native disconnected');
    expect(fixture.nativeCalls).toHaveLength(1);
  });

  it('expires accepted rows 24 hours after acceptance and dispatches a stale key anew', async () => {
    const fixture = await makeHarness();
    const request = promptFor();
    await fixture.service.send('session-a', request, 'expiring-command');
    expect(fixture.nativeCalls).toHaveLength(1);
    const db = new DatabaseSync(fixture.state.databasePath);
    try {
      const stale = Date.now() - 24 * 60 * 60 * 1000 - 1000;
      db.prepare('UPDATE host_direct_command SET created_at = ? WHERE command_id = ?').run(stale, 'expiring-command');
    } finally { db.close(); }
    // The replay window is closed: the same key admits again instead of
    // answering a response older than the Gateway's 24 hour retention.
    await fixture.service.send('session-a', request, 'expiring-command');
    expect(fixture.nativeCalls).toHaveLength(2);
  });

  it('keeps accepted rows inside the 24 hour window replayable', async () => {
    const fixture = await makeHarness();
    const request = promptFor();
    const first = await fixture.service.send('session-a', request, 'fresh-command');
    const db = new DatabaseSync(fixture.state.databasePath);
    try {
      const recent = Date.now() - 23 * 60 * 60 * 1000;
      db.prepare('UPDATE host_direct_command SET created_at = ? WHERE command_id = ?').run(recent, 'fresh-command');
    } finally { db.close(); }
    await expect(fixture.service.send('session-a', request, 'fresh-command')).resolves.toEqual(first);
    expect(fixture.nativeCalls).toHaveLength(1);
  });

  it('never expires pending rows: an uncertain acceptance stays ambiguous past the window', async () => {
    const fixture = await makeHarness();
    const scope = scopeFor('session-a');
    const request = promptFor();
    await fixture.state.directCommandAdmissionStore.claim(scope, 'stale-pending', 'send', request);
    const db = new DatabaseSync(fixture.state.databasePath);
    try {
      const stale = Date.now() - 48 * 60 * 60 * 1000;
      db.prepare('UPDATE host_direct_command SET created_at = ? WHERE command_id = ?').run(stale, 'stale-pending');
    } finally { db.close(); }
    await expectAdmissionError(fixture.state.directCommandAdmissionStore.claim(scope, 'stale-pending', 'send', request), 409, 'COMMAND_IN_FLIGHT');
    expect(fixture.nativeCalls).toHaveLength(0);
  });

  it('sweeps expired accepted rows on open without touching pending or fresh rows', async () => {
    const first = await makeHarness();
    const request = promptFor();
    await first.service.send('session-a', request, 'old-accepted');
    await first.state.directCommandAdmissionStore.claim(scopeFor('session-a'), 'old-pending', 'send', request);
    const db = new DatabaseSync(first.state.databasePath);
    try {
      const stale = Date.now() - 25 * 60 * 60 * 1000;
      db.prepare('UPDATE host_direct_command SET created_at = ?').run(stale);
    } finally { db.close(); }
    expect(countAdmissionRows(first.state)).toBe(2);
    await first.close();
    // Reopening the same data dir sweeps the expired accepted row; the pending
    // row survives because expiry never applies to uncertain acceptance.
    const second = await makeHarness({ dataDir: first.dataDir });
    expect(countAdmissionRows(second.state)).toBe(1);
    await expectAdmissionError(second.state.directCommandAdmissionStore.claim(scopeFor('session-a'), 'old-pending', 'send', request), 409, 'COMMAND_IN_FLIGHT');
    // The swept key admits as a fresh command rather than replaying.
    await second.service.send('session-a', request, 'old-accepted');
    expect(second.nativeCalls).toHaveLength(1);
  });

  it('release deletes a still-pending claim, leaves accepted rows untouched, and tolerates an absent key', async () => {
    const fixture = await makeHarness();
    const scope = scopeFor('session-a');
    const request = promptFor();
    const readRow = (commandId) => {
      const db = new DatabaseSync(fixture.state.databasePath);
      try { return db.prepare('SELECT state FROM host_direct_command WHERE command_id = ?').get(commandId); } finally { db.close(); }
    };

    await fixture.state.directCommandAdmissionStore.claim(scope, 'release-pending', 'send', request);
    expect(readRow('release-pending')?.state).toBe('pending');
    await fixture.state.directCommandAdmissionStore.release(scope, 'release-pending');
    expect(readRow('release-pending')).toBeUndefined();
    await expect(fixture.service.send('session-a', request, 'release-pending')).resolves.toMatchObject({ run: { sessionId: 'session-a' } });

    await fixture.service.send('session-a', request, 'release-accepted');
    expect(readRow('release-accepted')?.state).toBe('accepted');
    await fixture.state.directCommandAdmissionStore.release(scope, 'release-accepted');
    expect(readRow('release-accepted')?.state).toBe('accepted');
    const calls = fixture.nativeCalls.length;
    await fixture.service.send('session-a', request, 'release-accepted');
    expect(fixture.nativeCalls.length).toBe(calls);

    await fixture.state.directCommandAdmissionStore.release(scope, 'release-absent');
    expect(readRow('release-absent')).toBeUndefined();
  });

  it('pre-migration rows without a timestamp are never swept', async () => {
    const first = await makeHarness();
    const request = promptFor();
    const acknowledgment = await first.service.send('session-a', request, 'legacy-row');
    const db = new DatabaseSync(first.state.databasePath);
    try {
      db.prepare('UPDATE host_direct_command SET created_at = 0 WHERE command_id = ?').run('legacy-row');
    } finally { db.close(); }
    await first.close();
    const second = await makeHarness({ dataDir: first.dataDir });
    await expect(second.service.send('session-a', request, 'legacy-row')).resolves.toEqual(acknowledgment);
    expect(second.nativeCalls).toHaveLength(0);
  });
});
