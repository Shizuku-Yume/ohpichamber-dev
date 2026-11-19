import { expect, test } from 'bun:test';
import { existsSync, watch } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { JsonValueSchema, RuntimeSessionSchema, SessionControlAckSchema, SubagentSchema, type RuntimeSession } from '@openchamber/agent-contract';
import type { WorkerBootstrap, WorkerOperationResult } from '../protocol.ts';
import { z } from 'zod';
import { WorkerRegistry } from '../supervisor/workers.ts';
import { SessionRegistry } from './registry.ts';

const rootSessionId = 'retained-public-root';
const assistant = (text: string) => ({ role: 'assistant' as const, content: [{ type: 'text' as const, text }], api: 'openai-completions' as const,
  provider: 'fixture', model: 'fixture', stopReason: 'stop' as const, timestamp: Date.now(),
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
const admit = (input: WorkerBootstrap, launch: (input: WorkerBootstrap) => Promise<RuntimeSession>) => launch(input);
// Native storage appends timestamped `custom` records (private roots, session exit) when a runtime opens or
// disposes, so whole-file byte equality is not stable. The transcript invariant is the parsed message log.
const nativeMessages = async (file: string) => {
  const records: { type?: string; id?: string; parentId?: string | null; message?: unknown }[] =
    (await readFile(file, 'utf8')).split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  return records.filter(record => record.type === 'message').map(({ id, parentId, message }) => ({ id, parentId, message }));
};

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
  const policyLoads: { sessionId: string; workspaceId: string; forkOf?: string; workerStarted: boolean }[] = [];
  const createRegistry = () => {
    const workers: WorkerRegistry = new WorkerRegistry({ workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
      startupTimeoutMs: 30000, policyCheck: async () => ({ allowed: true }), callbacks: {
        onOpened: (...args) => sessions.onOpened(...args), onEvents: (...args) => sessions.onEvents(...args),
        onInteraction: (...args) => sessions.onInteraction(...args), onExit: (...args) => sessions.onExit(...args),
      } });
    const sessions: SessionRegistry = new SessionRegistry(join(root, 'service-state'), workers, undefined, async request => {
      policyLoads.push({ ...request, workerStarted: workers.authorizationScope(request.sessionId) !== undefined });
      return [];
    });
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
    const child = await SessionManager.open(join(childDirectory, 'child.jsonl'), childDirectory, undefined, { initialCwd: sourceCwd, parentSession: sourceFile });
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
      env: { HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
        OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
        XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache') } };
    await sessions.open(source);
    const destination = { rootSessionId, projectId: 'project', workspaceId: 'destination-workspace', cwd: destinationCwd,
      agentDirectory, agentDirectoryId: 'retained-owner', displayPath: 'destination', env: source.env };
    return { root, source, destination, sourceArtifacts, childFile, childRelative, childBytes, policyLoads,
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

test('worktree archive deletion replays the exact native family after service restart', async () => {
  const harness = await fixture();
  try {
    const scope = harness.workers.authorizationScope(rootSessionId)!;
    await harness.sessions.onSubagent(rootSessionId, scope.workerGeneration, {
      subagentId: 'archive-child', status: 'completed', role: 'child-proof', sessionFile: harness.childFile,
    });
    const childId = harness.sessions.listSubagents(rootSessionId)[0]?.childSessionId;
    if (!childId) throw new Error('Native child identity is required');
    await harness.workers.evict(rootSessionId);
    await rm(harness.source.cwd, { recursive: true, force: true });
    const input = { operationId: 'archive-operation', projectId: harness.source.projectId, workspaceId: harness.source.workspaceId,
      agentDirectoryId: harness.source.agentDirectoryId, sessionIds: [rootSessionId, childId] };
    const first = await harness.sessions.deleteWorktreeArchiveFamily(rootSessionId, input);
    expect(first.deletedSessionIds.sort()).toEqual([...input.sessionIds].sort());
    await harness.restart();
    expect(await harness.sessions.deleteWorktreeArchiveFamily(rootSessionId, input)).toEqual(first);
    await harness.sessions.retireWorktreeArchiveDelete(rootSessionId, input);
    expect(await readFile(harness.childFile, 'utf8').catch(() => null)).toBeNull();
  } finally { await harness.close(); }
}, 60000);

test('pending worktree delete reconciles a transcript removed before its owned artifacts', async () => {
  const harness = await fixture();
  try {
    await harness.workers.evict(rootSessionId);
    await rm(harness.source.cwd, { recursive: true, force: true });
    await harness.sessions.close(); await harness.workers.close();
    const referenceFile = join(harness.root, 'service-state', 'session-references.json');
    const state = JSON.parse(await readFile(referenceFile, 'utf8'));
    const header = (await readFile(harness.source.sessionFile, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)).find(record => record.type === 'session');
    if (!header?.id) throw new Error('Native session header is required');
    const stat = await lstat(harness.sourceArtifacts, { bigint: true });
    state.worktreeDeletes = { [rootSessionId]: { operationId: 'partial-delete', nativeSessionId: header.id,
      reference: state.references[rootSessionId], children: [], artifacts: { device: stat.dev.toString(), inode: stat.ino.toString() }, state: 'pending' } };
    await writeFile(referenceFile, JSON.stringify(state));
    await rm(harness.source.sessionFile);
    await harness.restart();
    const input = { operationId: 'partial-delete', projectId: harness.source.projectId, workspaceId: harness.source.workspaceId,
      agentDirectoryId: harness.source.agentDirectoryId, sessionIds: [rootSessionId] };
    expect(await harness.sessions.deleteWorktreeArchiveFamily(rootSessionId, input)).toMatchObject({ deletedSessionIds: [rootSessionId] });
    expect(await readFile(harness.childFile, 'utf8').catch(() => null)).toBeNull();
    await harness.sessions.retireWorktreeArchiveDelete(rootSessionId, input);
  } finally { await harness.close(); }
}, 60000);

test('native SDK relocation replaces worker scope and preserves public identity, transcript and descendant artifacts', async () => {
  const harness = await fixture();
  try {
    const before = harness.sessions.journal(rootSessionId).snapshot();
    const priorScope = harness.workers.authorizationScope(rootSessionId)!;
    await harness.sessions.onSubagent(rootSessionId, priorScope.workerGeneration, {
      subagentId: 'relocated-child', status: 'completed', role: 'child-proof', sessionFile: harness.childFile,
    });
    const childSessionId = harness.sessions.listSubagents(rootSessionId)[0]?.childSessionId;
    if (!childSessionId) throw new Error('Native child session identity is required');
    const prepared = await harness.sessions.prepareRelocation(rootSessionId, { transactionId: 'move-commit',
      sourceWorkspaceId: harness.source.workspaceId, destination: harness.destination }, admit);
    expect(prepared.session).toMatchObject({ sessionId: rootSessionId, rootSessionId, workspaceId: harness.destination.workspaceId, runtimeStatus: 'idle' });
    const destinationScope = harness.workers.authorizationScope(rootSessionId)!;
    expect(destinationScope).toMatchObject({ cwd: harness.destination.cwd, workspaceId: harness.destination.workspaceId, agentDirectoryId: harness.source.agentDirectoryId });
    expect(destinationScope.workerGeneration).not.toBe(priorScope.workerGeneration);
    await expect(harness.sessions.open(harness.source)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await expect(harness.sessions.prompt(rootSessionId, { type: 'prompt', runId: 'blocked', request: { input: { text: 'blocked', context: [], attachments: [] },
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } } })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await expect(harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'mismatched-transaction', action: 'commit' }, admit))
      .rejects.toMatchObject({ code: 'SESSION_RELOCATION_CONFLICT' });
    expect(harness.sessions.relocation(rootSessionId).relocation?.transactionId).toBe('move-commit');
    await expect(harness.sessions.history({ sessionId: childSessionId })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    const finalized = await harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'move-commit', action: 'commit' }, admit);
    expect(JSON.stringify(await harness.sessions.history({ sessionId: childSessionId }))).toContain('Retained child reply');
    expect(finalized.session).toMatchObject({ sessionId: rootSessionId, workspaceId: harness.destination.workspaceId });
    const after = harness.sessions.journal(rootSessionId).snapshot();
    expect(after.messages).toEqual(before.messages);
    expect(after.branch).toEqual(before.branch);
    expect(after.session.epoch).not.toBe(before.session.epoch);
    expect(harness.sessions.relocation(rootSessionId).relocation).toBeNull();
    await expect(harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'move-commit', action: 'commit' }, admit))
      .rejects.toMatchObject({ code: 'SESSION_RELOCATION_CONFLICT' });
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
    expect(JSON.stringify(await harness.sessions.history({ sessionId: childSessionId }))).toContain('Retained child reply');
  } finally { await harness.close(); }
}, 60000);

test('durable relocation intent repairs child paths when restart follows native move before index rewrite', async () => {
  const harness = await fixture();
  const index = join(harness.root, 'service-state', 'session-references.json');
  try {
    const generation = harness.workers.authorizationScope(rootSessionId)?.workerGeneration;
    if (!generation) throw new Error('Live root worker generation is required');
    await harness.sessions.onSubagent(rootSessionId, generation, {
      subagentId: 'recovery-child', status: 'completed', role: 'recovery-proof', sessionFile: harness.childFile,
    });
    const child = harness.sessions.listSubagents(rootSessionId)[0];
    if (!child) throw new Error('Native child reference is required');
    await harness.sessions.prepareRelocation(rootSessionId, { transactionId: 'repair-child-path',
      sourceWorkspaceId: harness.source.workspaceId, destination: harness.destination }, admit);
    const childReferenceSchema = SubagentSchema.extend({ rootSessionId: z.string(), workspaceId: z.string(), projectId: z.string(), sessionFile: z.string() });
    const referenceIndexSchema = z.object({
      references: z.record(z.string(), JsonValueSchema),
      subagents: z.record(z.string(), z.array(childReferenceSchema)),
      relocations: z.record(z.string(), JsonValueSchema),
    });
    const state = referenceIndexSchema.parse(JSON.parse(await readFile(index, 'utf8')));
    state.subagents[rootSessionId]![0] = { ...state.subagents[rootSessionId]![0]!, sessionFile: harness.childFile, workspaceId: harness.source.workspaceId };
    await writeFile(index, JSON.stringify(state));
    await harness.restart();
    await harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'repair-child-path', action: 'commit' }, admit);
    expect(JSON.stringify(await harness.sessions.history({ sessionId: child.childSessionId }))).toContain('Retained child reply');
    const repaired = referenceIndexSchema.parse(JSON.parse(await readFile(index, 'utf8')));
    expect(repaired.subagents[rootSessionId]?.[0]).toMatchObject({
      childSessionId: child.childSessionId, workspaceId: harness.destination.workspaceId,
    });
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
    await expect(harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'mismatched-transaction', action: 'commit' }, admit))
      .rejects.toMatchObject({ code: 'SESSION_RELOCATION_CONFLICT' });
    expect(harness.sessions.relocation(rootSessionId).relocation?.transactionId).toBe('recover-commit');
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
    await expect(harness.sessions.finalizeRelocation(rootSessionId, { transactionId: 'recover-commit', action: 'commit' }, admit))
      .rejects.toMatchObject({ code: 'SESSION_RELOCATION_CONFLICT' });
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

test('native child lifecycle preserves nested parent links and history across cold reopen', async () => {
  const harness = await fixture();
  let parentManager: SessionManager | undefined;
  let grandchildManager: SessionManager | undefined;
  try {
    let scope = harness.workers.authorizationScope(rootSessionId);
    if (!scope) throw new Error('Live root worker generation is required');
    parentManager = await SessionManager.open(harness.childFile, dirname(harness.childFile), undefined, { throwIfMissing: true });
    const parentArtifacts = parentManager.getArtifactsDir();
    if (!parentArtifacts) throw new Error('Native child artifacts are required');
    const grandchildDirectory = join(parentArtifacts, 'task', 'nested-child');
    await mkdir(grandchildDirectory, { recursive: true });
    grandchildManager = await SessionManager.open(join(grandchildDirectory, 'grandchild.jsonl'), grandchildDirectory, undefined,
      { initialCwd: harness.source.cwd, parentSession: harness.childFile });
    grandchildManager.appendMessage({ role: 'user', content: 'Nested child task', timestamp: Date.now() });
    grandchildManager.appendMessage(assistant('Nested child reply'));
    await grandchildManager.ensureOnDisk();
    await grandchildManager.flush();
    const grandchildFile = grandchildManager.getSessionFile();
    if (!grandchildFile) throw new Error('Native nested session file is required');

    const direct = { subagentId: 'child-lifecycle', toolCallId: 'native-parent-task', role: 'child-proof', sessionFile: harness.childFile };
    await harness.sessions.onSubagent(rootSessionId, scope.workerGeneration, { ...direct, status: 'started' });
    let child = harness.sessions.listSubagents(rootSessionId)[0];
    if (!child) throw new Error('Direct native child was not persisted');
    expect(child.toolCallId).toBe('native-parent-task');
    const idleRootChild = RuntimeSessionSchema.parse(harness.sessions.runtime(child.childSessionId));
    expect(idleRootChild).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, rootSessionId });
    await harness.restart();
    expect(RuntimeSessionSchema.parse(harness.sessions.runtime(child.childSessionId))).toMatchObject({ runtimeStatus: 'unavailable', activeRunId: null });
    await harness.sessions.reopen(harness.source);
    scope = harness.workers.authorizationScope(rootSessionId);
    if (!scope) throw new Error('Reopened root worker generation is required');
    const { toolCallId: _toolCallId, ...settled } = direct;
    await harness.sessions.onSubagent(rootSessionId, scope.workerGeneration, { ...settled, status: 'completed' });
    child = harness.sessions.listSubagents(rootSessionId)[0]!;
    expect(child.toolCallId).toBe('native-parent-task');
    await harness.sessions.onSubagent(rootSessionId, scope.workerGeneration, {
      subagentId: 'grandchild-lifecycle', status: 'completed', role: 'nested-proof', sessionFile: grandchildFile,
    });
    expect(harness.sessions.listSubagents(rootSessionId)).toHaveLength(1);
    const nested = harness.sessions.listSubagents(child.childSessionId);
    expect(nested).toHaveLength(1);
    expect(nested[0]).toMatchObject({ subagentId: 'grandchild-lifecycle', parentSessionId: child.childSessionId, role: 'nested-proof' });
    expect(JSON.stringify(await harness.sessions.history({ sessionId: nested[0]!.childSessionId }))).toContain('Nested child reply');
    await grandchildManager.close(); grandchildManager = undefined;
    await parentManager.close(); parentManager = undefined;

    await harness.restart();
    expect(harness.sessions.listSubagents(rootSessionId)).toEqual([child]);
    expect(harness.sessions.listSubagents(child.childSessionId)).toEqual(nested);
    expect(JSON.stringify(await harness.sessions.history({ sessionId: nested[0]!.childSessionId }))).toContain('Nested child reply');
  } finally {
    await grandchildManager?.close();
    await parentManager?.close();
    await harness.close();
  }
}, 60000);

test('root deletion drains pending child lifecycle writes and removes persisted child indexes', async () => {
  const harness = await fixture();
  try {
    const scope = harness.workers.authorizationScope(rootSessionId);
    if (!scope) throw new Error('Live root worker generation is required');
    const pending = harness.sessions.onSubagent(rootSessionId, scope.workerGeneration, {
      subagentId: 'deleting-child', status: 'completed', role: 'delete-proof', sessionFile: harness.childFile,
    });
    const deletion = harness.sessions.delete(rootSessionId);
    await Promise.all([pending, deletion]);
    expect(() => harness.sessions.listSubagents(rootSessionId)).toThrow();
    await harness.restart();
    expect(() => harness.sessions.listSubagents(rootSessionId)).toThrow();
  } finally { await harness.close(); }
}, 60000);

test('explicit idle restart preserves native transcript files and publishes a new generation and epoch', async () => {
  const harness = await fixture();
  try {
    const previous = harness.workers.authorizationScope(rootSessionId)!;
    const before = harness.sessions.journal(rootSessionId).snapshot();
    const beforeNative = await nativeMessages(harness.source.sessionFile);
    const beforeChild = await nativeMessages(harness.childFile);
    let admissionInput: WorkerBootstrap | undefined;
    const observingAdmit = (input: WorkerBootstrap, launch: (input: WorkerBootstrap) => Promise<RuntimeSession>) => {
      admissionInput = { ...input };
      return admit(input, launch);
    };
    const outcomes = await harness.sessions.restartIdleSessions([previous], observingAdmit);
    expect(admissionInput).not.toHaveProperty('displayPath');
    const current = harness.workers.authorizationScope(rootSessionId)!;
    expect(outcomes).toEqual([{ rootSessionId, previousGeneration: previous.workerGeneration,
      outcome: 'restarted', workerGeneration: current.workerGeneration }]);
    expect(current.workerGeneration).not.toBe(previous.workerGeneration);
    expect(harness.workers.bootstrap(rootSessionId)?.sessionFile).toBe(harness.source.sessionFile);
    const after = harness.sessions.journal(rootSessionId).snapshot();
    expect(after.messages).toEqual(before.messages);
    expect(after.session.epoch).not.toBe(before.session.epoch);
    expect(await nativeMessages(harness.source.sessionFile)).toEqual(beforeNative);
    expect(await nativeMessages(harness.childFile)).toEqual(beforeChild);
  } finally { await harness.close(); }
}, 60000);

test('idle restart preflights all roots and preserves earlier generations when a later root has controls or commands pending', async () => {
  const harness = await fixture();
  try {
    const { sessionFile: _sourceFile, ...second } = harness.source;
    const secondId = 'second-idle-root';
    await harness.sessions.open({ ...second, rootSessionId: secondId });
    const first = harness.workers.authorizationScope(rootSessionId)!;
    const last = harness.workers.authorizationScope(secondId)!;
    const resolving = harness.sessions.resolveNativeEntry(secondId, 'unmapped-message').catch(error => error);
    await expect(harness.sessions.restartIdleSessions([first, last], admit)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await resolving;
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(first.workerGeneration);
    expect(harness.workers.authorizationScope(secondId)?.workerGeneration).toBe(last.workerGeneration);
    const pending = harness.workers.request(secondId, { type: 'shell', operation: { type: 'snapshot' } });
    await expect(harness.sessions.restartIdleSessions([first, last], admit)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await pending;
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(first.workerGeneration);
    expect(harness.workers.authorizationScope(secondId)?.workerGeneration).toBe(last.workerGeneration);
    // A refused preflight releases every reservation: a later explicit request can succeed.
    const outcomes = await harness.sessions.restartIdleSessions([first, last], admit);
    expect(outcomes.map(outcome => outcome.outcome)).toEqual(['restarted', 'restarted']);
  } finally { await harness.close(); }
}, 60000);

test('idle restart refuses background Shell work before retiring any selected root', async () => {
  const harness = await fixture();
  try {
    const { sessionFile: _sourceFile, ...second } = harness.source;
    const secondId = 'shell-busy-root';
    await harness.sessions.open({ ...second, rootSessionId: secondId });
    const first = harness.workers.authorizationScope(rootSessionId)!;
    const last = harness.workers.authorizationScope(secondId)!;
    const shell = await harness.workers.request(secondId, { type: 'shell', operation: { type: 'start', request: {
      command: 'sleep 30', background: true,
    } } });
    if (shell.type !== 'shell' || shell.result.type !== 'start') throw new Error('Real native background Shell is required');
    try {
      await expect(harness.sessions.restartIdleSessions([first, last], admit)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
      expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(first.workerGeneration);
      expect(harness.workers.authorizationScope(secondId)?.workerGeneration).toBe(last.workerGeneration);
    } finally {
      const { jobId, sessionId, epoch, workerGeneration } = shell.result.job;
      await harness.workers.request(secondId, { type: 'shell', operation: { type: 'stop', request: { job: { jobId, sessionId, epoch, workerGeneration } } } });
    }
  } finally { await harness.close(); }
}, 60000);

test('failed idle restart preserves native references for an explicit later reopen without reporting success', async () => {
  const harness = await fixture();
  const displaced = `${harness.source.cwd}-temporarily-unavailable`;
  let moved = false;
  try {
    const previous = harness.workers.authorizationScope(rootSessionId)!;
    const before = harness.sessions.journal(rootSessionId).snapshot();
    const beforeNative = await nativeMessages(harness.source.sessionFile);
    await rename(harness.source.cwd, displaced);
    moved = true;
    const outcomes = await harness.sessions.restartIdleSessions([previous], admit);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ rootSessionId, previousGeneration: previous.workerGeneration, outcome: 'failed' });
    expect(harness.sessions.runtime(rootSessionId).runtimeStatus).toBe('unavailable');
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(before.messages);
    expect(await nativeMessages(harness.source.sessionFile)).toEqual(beforeNative);
    await rename(displaced, harness.source.cwd);
    moved = false;
    await harness.sessions.reopen(harness.source);
    expect(harness.sessions.runtime(rootSessionId).runtimeStatus).toBe('idle');
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).not.toBe(previous.workerGeneration);
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(before.messages);
    expect(await nativeMessages(harness.source.sessionFile)).toEqual(beforeNative);
    const history = await harness.sessions.history({ sessionId: rootSessionId });
    expect(history.messages.map(({ messageId, role }) => ({ messageId, role })))
      .toEqual(before.messages.map(({ messageId, role }) => ({ messageId, role })));
    expect(JSON.stringify(history)).toContain('Retained root prompt');
    expect(JSON.stringify(history)).toContain('Retained root reply');
  } finally {
    if (moved) await rename(displaced, harness.source.cwd);
    await harness.close();
  }
}, 60000);

// Registry contract only: the route's admission skip and 403 scope refusals are covered by
// `service-live-reopen.test.ts` and the recorded real run.
test('live reopen returns the open runtime and defers unavailable, unloaded or stopping roots', async () => {
  const harness = await fixture();
  try {
    const generation = harness.workers.authorizationScope(rootSessionId)?.workerGeneration;
    if (!generation) throw new Error('Live root worker generation is required');
    const before = harness.sessions.runtime(rootSessionId);
    const beforeJournal = harness.sessions.journal(rootSessionId).snapshot();
    const beforeNative = await nativeMessages(harness.source.sessionFile);
    expect(await harness.sessions.liveReopenRuntime(harness.source)).toEqual(before);
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(generation);
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(beforeJournal.messages);
    expect(await nativeMessages(harness.source.sessionFile)).toEqual(beforeNative);
    for (const mismatch of [
      { projectId: 'other-project' },
      { workspaceId: 'other-workspace' },
      { cwd: harness.destination.cwd },
      { agentDirectory: join(harness.root, 'destination') },
      { agentDirectoryId: 'other-owner' },
    ]) {
      await expect(harness.sessions.liveReopenRuntime({ ...harness.source, ...mismatch }))
        .rejects.toMatchObject({ status: 409, code: 'INVALID_REQUEST' });
    }
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(generation);
    await expect(harness.sessions.liveReopenRuntime({ ...harness.source, rootSessionId: 'missing-root' }))
      .rejects.toMatchObject({ status: 503, code: 'SESSION_RESTORE_FAILED' });
    harness.sessions.journal(rootSessionId).unavailable();
    expect(await harness.sessions.liveReopenRuntime(harness.source)).toBeUndefined();
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(generation);
    const reAdmitted = await harness.sessions.reopen(harness.source);
    expect(reAdmitted.runtimeStatus).toBe('idle');
    const reAdmittedGeneration = harness.workers.authorizationScope(rootSessionId)?.workerGeneration;
    expect(reAdmittedGeneration).not.toBe(generation);
    expect(await harness.sessions.liveReopenRuntime(harness.source)).toEqual(reAdmitted);
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).toBe(reAdmittedGeneration);
    await harness.restart();
    expect(await harness.sessions.liveReopenRuntime(harness.source)).toBeUndefined();
    const cold = await harness.sessions.reopen(harness.source);
    expect(cold.runtimeStatus).toBe('idle');
    const coldGeneration = harness.workers.authorizationScope(rootSessionId)?.workerGeneration;
    expect(coldGeneration).toBeDefined();
    expect(coldGeneration).not.toBe(reAdmittedGeneration);
    expect(harness.sessions.journal(rootSessionId).snapshot().messages).toEqual(beforeJournal.messages);
    expect(await nativeMessages(harness.source.sessionFile)).toEqual(beforeNative);
    // A worker that is stopping or disconnected still has a live entry until exit; it is not a reopen target.
    const stopping = harness.workers.stop(rootSessionId);
    expect(await harness.sessions.liveReopenRuntime(harness.source)).toBeUndefined();
    expect(await stopping).toBe(true);
    const restarted = await harness.sessions.reopen(harness.source);
    expect(restarted.runtimeStatus).toBe('idle');
    expect(harness.workers.authorizationScope(rootSessionId)?.workerGeneration).not.toBe(coldGeneration);
  } finally { await harness.close(); }
}, 60000);

test('stateless identity changes preserve active commands and recreate an idle worker under its actual new profile', async () => {
  const harness = await fixture();
  try {
    const input = { rootSessionId: 'stateless-profile-owner', workspaceId: harness.source.workspaceId,
      projectId: harness.source.projectId, cwd: harness.source.cwd, agentDirectory: harness.source.agentDirectory,
      agentDirectoryId: harness.source.agentDirectoryId, catalogRevision: '0', env: harness.source.env };
    const first = await harness.workers.startStateless(input);
    const reused = await harness.workers.startStateless({ ...input, catalogRevision: '7' });
    expect(reused.workerGeneration).toBe(first.workerGeneration);
    const pending = harness.workers.request(input.rootSessionId, { type: 'catalog', revision: '0', operation: { type: 'plugins.owner' } });
    // A named profile resolves its own config root, so the Host hands the worker
    // that profile's agent directory; the runtime rejects a mismatched pair.
    const profileName = 'refreshed-native-profile';
    const profileAgentDirectory = join(harness.root, '.omp', 'profiles', profileName, 'agent');
    await mkdir(profileAgentDirectory, { recursive: true });
    const changed = { ...input, agentDirectory: profileAgentDirectory, agentDirectoryId: 'refreshed-owner',
      env: { ...input.env, OMP_PROFILE: profileName } };
    await expect(harness.workers.startStateless(changed)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    expect(harness.workers.authorizationScope(input.rootSessionId)?.workerGeneration).toBe(first.workerGeneration);
    const oldOwner = await pending;
    if (oldOwner.type !== 'catalog' || oldOwner.result.type !== 'plugins.owner') throw new Error('Actual native plugin owner is required');
    const current = await harness.workers.startStateless(changed);
    expect(current.workerGeneration).not.toBe(first.workerGeneration);
    const currentOwner = await harness.workers.request(input.rootSessionId, { type: 'catalog', revision: '0', operation: { type: 'plugins.owner' } });
    if (currentOwner.type !== 'catalog' || currentOwner.result.type !== 'plugins.owner') throw new Error('Refreshed native plugin owner is required');
    expect(currentOwner.result.rootPath).not.toBe(oldOwner.result.rootPath);
    await expect(harness.workers.request(input.rootSessionId, { type: 'catalog', revision: '0', operation: { type: 'plugins.owner' } }, first.workerGeneration))
      .rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect((await harness.workers.startStateless(changed)).workerGeneration).toBe(current.workerGeneration);
  } finally { await harness.close(); }
}, 60000);

test('fork loads the child policy scope from the captured source before starting its worker', async () => {
  const harness = await fixture();
  try {
    harness.policyLoads.length = 0;
    const forked = await harness.sessions.fork(rootSessionId, null, 'full', 'fork-ticket-1');
    expect(forked.sourceSessionId).toBe(rootSessionId);
    expect(forked.sessionId).not.toBe(rootSessionId);
    expect(harness.policyLoads).toEqual([
      { sessionId: forked.sessionId, workspaceId: 'source-workspace', forkOf: rootSessionId, forkTicketId: 'fork-ticket-1', workerStarted: false },
    ]);
    expect(harness.workers.authorizationScope(forked.sessionId)).toBeDefined();
  } finally { await harness.close(); }
}, 60000);

test('registry prompt blocks idle sessions during a pending continuation and admits after projected clear', async () => {
  const harness = await fixture();
  try {
    const generation = harness.workers.authorizationScope(rootSessionId)?.workerGeneration;
    if (!generation) throw new Error('Live root worker generation is required');
    const operation = { type: 'prompt' as const, runId: 'continuation-prompt', request: {
      input: { text: 'after continuation', context: [], attachments: [] },
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
    } };
    await harness.sessions.onEvents(rootSessionId, generation, [{ timestamp: Date.now(), event: { type: 'session.updated', continuationPending: true } }]);
    expect(harness.sessions.runtime(rootSessionId)).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, continuationPending: true });

    let requests = 0;
    const originalRequest = harness.workers.request;
    harness.workers.request = async (): Promise<WorkerOperationResult> => {
      requests += 1;
      return { type: 'prompt', run: { runId: 'continuation-prompt', sessionId: rootSessionId, status: 'pending', createdAt: Date.now() } };
    };
    try {
      await expect(harness.sessions.prompt(rootSessionId, operation)).rejects.toMatchObject({ code: 'RUN_ACTIVE' });
      expect(requests).toBe(0);
      await harness.sessions.onEvents(rootSessionId, generation, [{ timestamp: Date.now(), event: { type: 'session.updated', continuationPending: false } }]);
      expect(harness.sessions.runtime(rootSessionId)).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, continuationPending: false });
      await expect(harness.sessions.prompt(rootSessionId, operation)).resolves.toMatchObject({ runId: 'continuation-prompt' });
      expect(requests).toBe(1);
    } finally { harness.workers.request = originalRequest; }
  } finally { await harness.close(); }
}, 60000);
test('prepareRelocation is refused before moving session files when destination worktree is leased', async () => {
  const harness = await fixture();
  try {
    await harness.workers.acquireWorktreeLease('lease-dest-1', harness.destination.cwd);
    let admitCalled = false;
    await expect(harness.sessions.prepareRelocation(rootSessionId, {
      transactionId: 'lease-refusal-before-move',
      sourceWorkspaceId: harness.source.workspaceId,
      destination: harness.destination,
    }, async (input, launch) => {
      admitCalled = true;
      return launch(input);
    })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });

    expect(admitCalled).toBe(false);
    expect(existsSync(harness.destinationFile)).toBe(false);
    expect(existsSync(harness.source.sessionFile)).toBe(true);
    expect(harness.sessions.relocation(rootSessionId).relocation).toBeNull();
  } finally { await harness.close(); }
}, 60000);

test('worktree archive lease cannot acquire destination or source while relocation is in flight', async () => {
  const harness = await fixture();
  try {
    const moveStarted = Promise.withResolvers<void>();
    const allowMove = Promise.withResolvers<void>();
    let leaseError: Error | undefined;

    const relocationPromise = harness.sessions.prepareRelocation(rootSessionId, {
      transactionId: 'lease-race-during-move',
      sourceWorkspaceId: harness.source.workspaceId,
      destination: harness.destination,
    }, async (input, launch) => {
      moveStarted.resolve();
      await allowMove.promise;
      return launch(input);
    });

    await moveStarted.promise;
    // Relocation fence is active; lease acquire against destination must be rejected with 409
    try {
      await harness.workers.acquireWorktreeLease('lease-racing', harness.destination.cwd);
    } catch (error) {
      if (error instanceof Error) {
        leaseError = error;
      } else {
        throw error;
      }
    }
    expect(leaseError).toMatchObject({ status: 409, code: 'COMMAND_IN_FLIGHT' });

    allowMove.resolve();
    const prepared = await relocationPromise;
    expect(prepared.session).toMatchObject({ sessionId: rootSessionId, workspaceId: harness.destination.workspaceId });

    // Once relocation finishes, the fence is released and lease can be acquired
    const lease = await harness.workers.acquireWorktreeLease('lease-post-relocation', harness.destination.cwd);
    expect(lease.leaseId).toBe('lease-post-relocation');
    await harness.workers.releaseWorktreeLease('lease-post-relocation');
  } finally { await harness.close(); }
}, 60000);

test('creates and persists child session with parentSessionId linkage across restart and listing', async () => {
  const harness = await fixture();
  try {
    const childSessionId = 'retained-child-session';
    const childManager = SessionManager.create(harness.source.cwd, harness.source.sessionsDirectory);
    childManager.appendMessage({ role: 'user', content: 'Child prompt', timestamp: Date.now() });
    await childManager.ensureOnDisk();
    await childManager.flush();
    const childFile = childManager.getSessionFile()!;
    await childManager.close();

    const childInput: WorkerBootstrap & { displayPath: string } = {
      rootSessionId: childSessionId,
      projectId: harness.source.projectId,
      workspaceId: harness.source.workspaceId,
      cwd: harness.source.cwd,
      agentDirectory: harness.source.agentDirectory,
      agentDirectoryId: harness.source.agentDirectoryId,
      displayPath: 'source',
      sessionFile: childFile,
      sessionsDirectory: harness.source.sessionsDirectory,
      parentSessionId: rootSessionId,
      env: harness.source.env,
    };
    const opened = await harness.sessions.open(childInput);
    expect(opened.parentSessionId).toBe(rootSessionId);
    expect(harness.sessions.runtime(childSessionId).parentSessionId).toBe(rootSessionId);
    expect(harness.sessions.journal(childSessionId).snapshot().session.parentSessionId).toBe(rootSessionId);

    const listed = await harness.sessions.list(harness.source);
    const childInList = listed.items.find(s => s.sessionId === childSessionId);
    expect(childInList?.parentSessionId).toBe(rootSessionId);

    await harness.restart();
    const restored = harness.sessions.runtime(childSessionId);
    expect(restored.parentSessionId).toBe(rootSessionId);
    const restoredList = await harness.sessions.list(harness.source);
    expect(restoredList.items.find(s => s.sessionId === childSessionId)?.parentSessionId).toBe(rootSessionId);

    const inventory = await harness.sessions.archiveManifest();
    const archivedChild = inventory.chats.find(c => c.id === childSessionId);
    expect(archivedChild?.parentSessionId).toBe(rootSessionId);

    const reopened = await harness.sessions.reopen({ ...childInput, parentSessionId: undefined });
    expect(reopened.parentSessionId).toBe(rootSessionId);
    expect(harness.sessions.runtime(childSessionId).parentSessionId).toBe(rootSessionId);
  } finally { await harness.close(); }
}, 60000);

test('cold snapshot of unloaded root session preserves parentSessionId without starting worker', async () => {
  const harness = await fixture();
  try {
    const linkedRootId = 'cold-linked-root';
    const manager = SessionManager.create(harness.source.cwd, harness.source.sessionsDirectory);
    manager.appendMessage({ role: 'user', content: 'Cold linked prompt', timestamp: Date.now() });
    await manager.ensureOnDisk();
    await manager.flush();
    const sessionFile = manager.getSessionFile()!;
    await manager.close();

    const input: WorkerBootstrap & { displayPath: string } = {
      rootSessionId: linkedRootId,
      projectId: harness.source.projectId,
      workspaceId: harness.source.workspaceId,
      cwd: harness.source.cwd,
      agentDirectory: harness.source.agentDirectory,
      agentDirectoryId: harness.source.agentDirectoryId,
      displayPath: 'source',
      sessionFile,
      sessionsDirectory: harness.source.sessionsDirectory,
      parentSessionId: rootSessionId,
      env: harness.source.env,
    };
    await harness.sessions.open(input);
    await harness.restart();

    // Verify session is unloaded and no worker is live
    expect(harness.sessions.runtime(linkedRootId).runtimeStatus).toBe('unavailable');
    expect(harness.workers.authorizationScope(linkedRootId)).toBeUndefined();

    // Cold read snapshot must preserve parentSessionId from reference without starting worker
    const snapshot = await harness.sessions.snapshot(linkedRootId);
    expect(snapshot.session.parentSessionId).toBe(rootSessionId);
    expect(snapshot.session.sessionId).toBe(linkedRootId);
    expect(harness.workers.authorizationScope(linkedRootId)).toBeUndefined();
  } finally { await harness.close(); }
}, 60000);

test('btwBranch rekeys live session entry, worker, journal and reference to new minted session ID', async () => {
  const harness = await fixture();
  try {
    const originalRuntime = harness.sessions.runtime(rootSessionId);
    expect(originalRuntime.sessionId).toBe(rootSessionId);

    const newSessionId = 'minted-btw-session-id';
    const newFile = join(harness.source.sessionsDirectory, `2026-11-05_${newSessionId}.jsonl`);
    const origRequest = harness.workers.request.bind(harness.workers);
    harness.workers.request = async (sessionId, op) => {
      if (op.type === 'btw.branch') {
        return {
          type: 'btw.branch',
          sessionId: newSessionId,
          rootSessionId: newSessionId,
          sessionFile: newFile,
          branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null },
        };
      }
      return origRequest(sessionId, op);
    };

    const branchRes = await harness.sessions.btwBranch(rootSessionId, 'rec-1');
    expect(branchRes.sessionId).toBe(newSessionId);
    expect(branchRes.sessionFile).toBe(newFile);

    expect(harness.sessions['entries'].get(rootSessionId)).toBeUndefined();
    const newEntry = harness.sessions['entries'].get(newSessionId);
    expect(newEntry?.state).toBe('live');
    if (newEntry?.state === 'live') {
      expect(newEntry.opened.sessionFile).toBe(newFile);
      expect(newEntry.opened.journal.runtime().sessionId).toBe(newSessionId);
    }
    expect(harness.workers.info(newSessionId)).toBeDefined();
    const newRef = harness.sessions['references'].get(newSessionId);
    expect(newRef?.sessionFile).toBe(newFile);
    // The rekey moves the identity, so the pre-branch reference must not stay
    // listed: it would answer every root-addressed read with 404 for a session
    // the Host still binds.
    expect(harness.sessions['references'].get(rootSessionId)).toBeNull();
  } finally {
    await harness.close();
  }
}, 60000);

test('btwBranch leaves no root-addressed read pointing at the retired session id', async () => {
  const harness = await fixture();
  try {
    const newSessionId = 'minted-read-session-id';
    const origRequest = harness.workers.request.bind(harness.workers);
    harness.workers.request = async (sessionId, op) => {
      if (op.type === 'btw.branch') {
        return {
          type: 'btw.branch',
          sessionId: newSessionId,
          rootSessionId: newSessionId,
          sessionFile: join(harness.source.sessionsDirectory, `2026-11-05_${newSessionId}.jsonl`),
          branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null },
          // A real branch replies with the seed of its rekeyed projection, so the
          // journal history is re-addressed to the minted id as well.
          seed: { branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null }, createdAt: 0, updatedAt: 0, turns: [], messages: [], mode: { kind: 'main' } },
        };
      }
      return origRequest(sessionId, op);
    };
    const ack = await harness.sessions.btwBranch(rootSessionId, 'rec-1');
    expect(ack.type === 'btw.branch' && ack.sessionId).toBe(newSessionId);
    // Every route the composer reads after a Promote to Branch: the snapshot,
    // the roster runtime and the subagent list. Before the rekey fan-out these
    // answered 404 / "The session has no listed root" for the minted id because
    // the registry kept the retired one.
    expect((await harness.sessions.snapshot(newSessionId)).session.sessionId).toBe(newSessionId);
    expect(harness.sessions.runtime(newSessionId).sessionId).toBe(newSessionId);
    expect(harness.sessions.listSubagents(newSessionId)).toEqual([]);
    // The retired id must not resolve to the session the Host no longer binds.
    expect(() => harness.sessions.runtime(rootSessionId)).toThrow();
    expect(harness.workers.bootstrap(newSessionId)?.rootSessionId).toBe(newSessionId);
    expect(harness.workers.bootstrap(rootSessionId)).toBeUndefined();
  } finally { await harness.close(); }
}, 60000);

test('btwBranch leaves the interaction owner on the epoch a later pending request must carry', async () => {
  const harness = await fixture();
  try {
    const newSessionId = 'minted-epoch-session-id';
    const origRequest = harness.workers.request.bind(harness.workers);
    harness.workers.request = async (sessionId, op) => {
      if (op.type === 'btw.branch') {
        return {
          type: 'btw.branch',
          sessionId: newSessionId,
          rootSessionId: newSessionId,
          sessionFile: join(harness.source.sessionsDirectory, `2026-11-05_${newSessionId}.jsonl`),
          branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null },
          // A real branch replies with the seed of its rekeyed projection, which
          // also mints the journal epoch every request published after it needs.
          seed: { branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null }, createdAt: 0, updatedAt: 0, turns: [], messages: [], mode: { kind: 'main' } },
        };
      }
      // The plan review is minted by this test rather than by the worker, so the
      // answer has nowhere to go; reply as the worker would for its own dialog.
      if (op.type === 'question.resolve') return { type: 'question.resolve', questionId: op.questionId };
      return origRequest(sessionId, op);
    };
    await harness.sessions.btwBranch(rootSessionId, 'rec-1');
    const generation = harness.workers.authorizationScope(newSessionId)?.workerGeneration;
    if (!generation) throw new Error('The rekeyed worker generation is required');
    // A plan review reaches the user after the branch, so its request is minted
    // after the seed re-epoch. A stale epoch makes every snapshot poll answer
    // 503: the pending request would not belong to the captured session.
    harness.sessions.onInteraction(newSessionId, generation, {
      kind: 'question', questionId: 'plan-review', turnId: 'turn-1', prompt: 'Review plan',
      schema: { type: 'plan-review', title: 'Review plan', planReference: 'local://review-plan.md', planText: '# Plan\nImplement review.' },
    });
    const snapshot = await harness.sessions.snapshot(newSessionId);
    expect(snapshot.questions).toHaveLength(1);
    expect(snapshot.questions[0]?.epoch).toBe(snapshot.session.epoch);
    expect(snapshot.questions[0]?.sessionId).toBe(newSessionId);
    // The card must still be answerable under the epoch the snapshot advertises.
    const answered = await harness.sessions.resolveQuestion(newSessionId, 'plan-review', {
      action: 'answer', version: '1', epoch: snapshot.session.epoch,
      workerGeneration: snapshot.questions[0]!.workerGeneration, response: { action: 'approve' },
    });
    expect(answered).toMatchObject({ status: 'answered', sessionId: newSessionId });
  } finally { await harness.close(); }
}, 60000);

test('btwBranch returns an ack the strict public SessionControlAckSchema accepts', async () => {
  const harness = await fixture();
  try {
    const newSessionId = 'minted-ack-session-id';
    const origRequest = harness.workers.request.bind(harness.workers);
    harness.workers.request = async (sessionId, op) => {
      if (op.type === 'btw.branch') {
        return {
          type: 'btw.branch',
          sessionId: newSessionId,
          rootSessionId: newSessionId,
          sessionFile: join(harness.source.sessionsDirectory, `2026-11-05_${newSessionId}.jsonl`),
          branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null },
          // The worker replies with a projection seed the strict public ack does
          // not carry; a real branch reply always includes it.
          seed: { branch: { branchId: 'b-1', branchVersion: '1', leafMessageId: null }, createdAt: 0, updatedAt: 0, turns: [], messages: [], mode: { kind: 'main' } },
        };
      }
      return origRequest(sessionId, op);
    };
    const ack = SessionControlAckSchema.parse(await harness.sessions.btwBranch(rootSessionId, 'rec-1'));
    expect(ack.type).toBe('btw.branch');
    expect(ack.type === 'btw.branch' && ack.sessionId).toBe(newSessionId);
  } finally { await harness.close(); }
}, 60000);
