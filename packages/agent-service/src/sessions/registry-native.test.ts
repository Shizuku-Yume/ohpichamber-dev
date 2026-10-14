import { expect, test } from 'bun:test';
import { watch } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { RuntimeSessionSchema, type RuntimeSession } from '@openchamber/agent-contract';
import type { WorkerBootstrap } from '../protocol.ts';
import { WorkerRegistry } from '../supervisor/workers.ts';
import { SessionRegistry } from './registry.ts';

const rootSessionId = 'retained-public-root';
const assistant = (text: string) => ({ role: 'assistant' as const, content: [{ type: 'text' as const, text }], api: 'openai-completions' as const,
  provider: 'fixture', model: 'fixture', stopReason: 'stop' as const, timestamp: Date.now(),
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
const admit = (input: WorkerBootstrap, launch: (input: WorkerBootstrap) => Promise<RuntimeSession>) => launch(input);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-session-relocation-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const sourceCwd = join(root, 'source');
  const destinationCwd = join(root, 'destination');
  const agentDirectory = join(root, 'agent');
  await Promise.all([sourceCwd, destinationCwd, agentDirectory].map(directory => mkdir(directory)));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(sourceCwd, agentDirectory);
  const manager = SessionManager.create(sourceCwd, sessionsDirectory);
  const createRegistry = () => {
    const workers: WorkerRegistry = new WorkerRegistry({ workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
      startupTimeoutMs: 30000, policyCheck: async () => ({ allowed: true }), callbacks: {
        onOpened: (...args) => sessions.onOpened(...args), onEvents: (...args) => sessions.onEvents(...args),
        onInteraction: (...args) => sessions.onInteraction(...args), onExit: (...args) => sessions.onExit(...args),
      } });
    const sessions: SessionRegistry = new SessionRegistry(join(root, 'service-state'), workers);
    return { workers, sessions };
  };
  let { workers, sessions } = createRegistry();
  try {
    manager.appendMessage({ role: 'user', content: 'Retained root prompt', timestamp: Date.now() });
    manager.appendMessage(assistant('Retained root reply'));
    await manager.ensureOnDisk();
    await manager.flush();
    const sourceFile = manager.getSessionFile();
    const sourceArtifacts = manager.getArtifactsDir();
    if (!sourceFile || !sourceArtifacts) throw new Error('Real native storage is required');
    const childDirectory = join(sourceArtifacts, 'task', 'retained-child');
    await mkdir(childDirectory, { recursive: true });
    const child = SessionManager.create(sourceCwd, childDirectory);
    child.appendMessage({ role: 'user', content: 'Retained child task', timestamp: Date.now() });
    child.appendMessage(assistant('Retained child reply'));
    await child.ensureOnDisk();
    await child.flush();
    const childFile = child.getSessionFile();
    if (!childFile) throw new Error('Native descendant storage is required');
    const childRelative = relative(sourceArtifacts, childFile);
    const childBytes = await readFile(childFile, 'utf8');
    await child.close();
    await writeFile(join(sourceArtifacts, 'retained-tool-output.txt'), 'Native artifact bytes');
    await manager.close();
    await sessions.initialize();
    const source = { rootSessionId, projectId: 'project', workspaceId: 'source-workspace', cwd: sourceCwd,
      agentDirectory, agentDirectoryId: 'retained-owner', displayPath: 'source', sessionFile: sourceFile, sessionsDirectory,
      env: { HOME: root, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data') } };
    await sessions.open(source);
    const destination = { rootSessionId, projectId: 'project', workspaceId: 'destination-workspace', cwd: destinationCwd,
      agentDirectory, agentDirectoryId: 'retained-owner', displayPath: 'destination', env: source.env };
    return { root, source, destination, sourceArtifacts, childRelative, childBytes,
      get sessions() { return sessions; }, get workers() { return workers; },
      destinationFile: join(SessionManager.getDefaultSessionDir(destinationCwd, agentDirectory), basename(sourceFile)),
      restart: async () => { await sessions.close(); await workers.close(); ({ workers, sessions } = createRegistry()); await sessions.initialize(); },
      close: async () => { await sessions.close(); await workers.close(); await manager.close();
        if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
        await rm(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    await sessions.close();
    await workers.close();
    await manager.close();
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

test('native SDK relocation replaces worker scope and preserves public identity, transcript and descendant artifacts', async () => {
  const harness = await fixture();
  try {
    const before = harness.sessions.journal(rootSessionId).snapshot();
    const priorScope = harness.workers.authorizationScope(rootSessionId)!;
    const prepared = await harness.sessions.prepareRelocation(rootSessionId, { transactionId: 'move-commit',
      sourceWorkspaceId: harness.source.workspaceId, destination: harness.destination }, admit);
    expect(prepared.session).toMatchObject({ sessionId: rootSessionId, rootSessionId, workspaceId: harness.destination.workspaceId, runtimeStatus: 'idle' });
    const destinationScope = harness.workers.authorizationScope(rootSessionId)!;
    expect(destinationScope).toMatchObject({ cwd: harness.destination.cwd, workspaceId: harness.destination.workspaceId, agentDirectoryId: harness.source.agentDirectoryId });
    expect(destinationScope.workerGeneration).not.toBe(priorScope.workerGeneration);
    await expect(harness.sessions.open(harness.source)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await expect(harness.sessions.prompt(rootSessionId, { type: 'prompt', runId: 'blocked', request: { input: { text: 'blocked', context: [], attachments: [] },
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } } })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    const finalized = await harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'move-commit', action: 'commit' }, admit);
    expect(finalized.session).toMatchObject({ sessionId: rootSessionId, workspaceId: harness.destination.workspaceId });
    const after = harness.sessions.journal(rootSessionId).snapshot();
    expect(after.messages).toEqual(before.messages);
    expect(after.branch).toEqual(before.branch);
    expect(after.session.epoch).not.toBe(before.session.epoch);
    expect(harness.sessions.relocation(rootSessionId).relocation).toBeNull();
    const moved = await SessionManager.open(harness.destinationFile, dirname(harness.destinationFile), undefined, { initialCwd: harness.destination.cwd, throwIfMissing: true });
    try {
      expect(moved.getHeader()?.cwd).toBe(harness.destination.cwd);
      const artifacts = moved.getArtifactsDir();
      if (!artifacts) throw new Error('Moved native artifacts are required');
      expect(await readFile(join(artifacts, harness.childRelative), 'utf8')).toBe(harness.childBytes);
      expect(await readFile(join(artifacts, 'retained-tool-output.txt'), 'utf8')).toBe('Native artifact bytes');
    } finally { await moved.close(); }
    await expect(readFile(harness.source.sessionFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const published = Promise.withResolvers<void>();
    const watcher = watch(harness.destination.cwd, (_event, filename) => { if (filename === 'cwd-proof.txt') published.resolve(); });
    try {
      const shell = await harness.workers.request(rootSessionId, { type: 'shell', operation: { type: 'start', request: {
        command: 'pwd > cwd-proof.tmp && mv cwd-proof.tmp cwd-proof.txt', background: false,
      } } });
      if (shell.type !== 'shell' || shell.result.type !== 'start') throw new Error('Real native shell start is required');
      await published.promise;
      expect((await readFile(join(harness.destination.cwd, 'cwd-proof.txt'), 'utf8')).trim()).toBe(harness.destination.cwd);
    } finally { watcher.close(); }
    await harness.restart();
    await harness.sessions.reopen(harness.destination);
    expect(harness.sessions.runtime(rootSessionId).workspaceId).toBe(harness.destination.workspaceId);
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(before.messages);
  } finally { await harness.close(); }
}, 60000);

test('native relocation durable pending cutover rolls back after restart even if source cwd disappeared', async () => {
  const harness = await fixture();
  try {
    const before = harness.sessions.journal(rootSessionId).snapshot();
    await rm(harness.source.cwd, { recursive: true });
    await harness.sessions.prepareRelocation(rootSessionId, { transactionId: 'move-rollback', sourceWorkspaceId: harness.source.workspaceId,
      destination: harness.destination }, admit);
    await harness.restart();
    expect(harness.sessions.relocation(rootSessionId).relocation).toEqual({ transactionId: 'move-rollback',
      sourceWorkspaceId: harness.source.workspaceId, destinationWorkspaceId: harness.destination.workspaceId });
    const rolledBack = await harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'move-rollback', action: 'rollback' }, admit);
    expect(RuntimeSessionSchema.parse(rolledBack.session)).toMatchObject({ sessionId: rootSessionId, workspaceId: harness.source.workspaceId, runtimeStatus: 'unavailable' });
    expect(harness.workers.authorizationScope(rootSessionId)).toBeUndefined();
    const restored = await SessionManager.open(harness.source.sessionFile, harness.source.sessionsDirectory, undefined, { initialCwd: harness.source.cwd, throwIfMissing: true });
    try { expect(restored.getHeader()?.cwd).toBe(harness.source.cwd); } finally { await restored.close(); }
    expect(await readFile(join(harness.sourceArtifacts, harness.childRelative), 'utf8')).toBe(harness.childBytes);
    await mkdir(harness.source.cwd);
    await harness.sessions.reopen(harness.source);
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(before.messages);
    expect(harness.sessions.relocation(rootSessionId).relocation).toBeNull();
  } finally { await harness.close(); }
}, 60000);

test('failed native destination worker launch restores source storage and owner without a success acknowledgement', async () => {
  const harness = await fixture();
  try {
    await expect(harness.sessions.prepareRelocation(rootSessionId, { transactionId: 'failed-worker', sourceWorkspaceId: harness.source.workspaceId,
      destination: harness.destination }, async (input, launch) => {
        await rm(harness.destination.cwd, { recursive: true });
        return launch(input);
      })).rejects.toBeDefined();
    expect(harness.sessions.runtime(rootSessionId)).toMatchObject({ sessionId: rootSessionId, workspaceId: harness.source.workspaceId, runtimeStatus: 'unavailable' });
    expect(harness.sessions.relocation(rootSessionId).relocation).toBeNull();
    expect(await readFile(join(harness.sourceArtifacts, harness.childRelative), 'utf8')).toBe(harness.childBytes);
    await harness.sessions.reopen(harness.source);
    expect(harness.workers.authorizationScope(rootSessionId)?.cwd).toBe(harness.source.cwd);
  } finally { await harness.close(); }
}, 60000);

test('native destination cutover can commit after restart and a failed reference publish retains recoverable intent', async () => {
  const harness = await fixture();
  const index = join(harness.root, 'service-state', 'session-references.json');
  try {
    const before = harness.sessions.journal(rootSessionId).snapshot();
    await harness.sessions.prepareRelocation(rootSessionId, { transactionId: 'recover-commit', sourceWorkspaceId: harness.source.workspaceId,
      destination: harness.destination }, admit);
    await harness.restart();
    await rename(index, `${index}.previous`);
    await mkdir(index);
    try {
      await expect(harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'recover-commit', action: 'commit' }, admit))
        .rejects.toMatchObject({ code: 'SESSION_RESTORE_FAILED' });
      expect(harness.sessions.relocation(rootSessionId).relocation?.transactionId).toBe('recover-commit');
      await expect(harness.sessions.reopen(harness.source)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    } finally { await rm(index, { recursive: true }); await rename(`${index}.previous`, index); }
    const committed = await harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'recover-commit', action: 'commit' }, admit);
    expect(committed.session).toMatchObject({ sessionId: rootSessionId, workspaceId: harness.destination.workspaceId, runtimeStatus: 'idle' });
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(before.messages);
    expect(harness.sessions.relocation(rootSessionId).relocation).toBeNull();
  } finally { await harness.close(); }
}, 60000);

test('service native branch selection expires stream epochs and survives cold reopen with stable public messages', async () => {
  const harness = await fixture();
  try {
    const journal = harness.sessions.journal(rootSessionId);
    const before = journal.snapshot();
    const generation = harness.workers.authorizationScope(rootSessionId)?.workerGeneration;
    const invalidations: string[] = [];
    const subscription = journal.subscribe(before.cursor, event => { if (event.type === 'stream.invalidated') invalidations.push(event.reason); });
    try {
      const reverted = await harness.sessions.branch(rootSessionId, { action: 'revert', messageId: before.messages[0]!.messageId,
        branchId: before.branch.branchId, branchVersion: before.branch.branchVersion });
      expect(reverted).toMatchObject({ sessionId: rootSessionId, branch: { revert: { messageId: before.messages[0]!.messageId } } });
      expect(journal.snapshot().messages).toEqual([]);
      expect(journal.runtime().epoch).not.toBe(before.session.epoch);
      expect(invalidations).toEqual(['EPOCH_CHANGED']);
      expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(generation);
      await harness.restart();
      await harness.sessions.reopen(harness.source);
      const reopened = harness.sessions.journal(rootSessionId).snapshot();
      expect(reopened.branch).toEqual(reverted.branch);
      expect(reopened.messages).toEqual([]);
      await harness.sessions.branch(rootSessionId, { action: 'restore', branchId: reopened.branch.branchId, branchVersion: reopened.branch.branchVersion });
      expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(before.messages);
    } finally { subscription.unsubscribe(); }
  } finally { await harness.close(); }
}, 60000);
