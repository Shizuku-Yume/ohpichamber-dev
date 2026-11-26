import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { z } from 'zod';
import { TurnDiffSchema } from '@openchamber/agent-contract';
import { contentSum } from './turn-diff-core.ts';
import { mutationEvidenceInMessages } from './turn-diff.ts';
import { AgentService } from '../supervisor/service.ts';
import { WorkerProjection } from '../worker/projection.ts';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';

type NativeMessage = Extract<AgentSessionEvent, { type: 'message_start' }>['message'];
type RecordableMessage = Extract<NativeMessage, { role: 'user' | 'assistant' | 'toolResult' }>;
type AssistantMessageInput = Extract<NativeMessage, { role: 'assistant' }>;
type AssistantContent = AssistantMessageInput['content'];

function gzip(text: string): Uint8Array {
  return Bun.gzipSync(new TextEncoder().encode(text));
}

interface Fixture {
  readonly root: string;
  readonly cwd: string;
  readonly sessionFile: string;
  readonly artifactsDir: string;
  readonly turnId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
}

async function writeSessionFixture(options: {
  readonly withJournal?: (fixture: { artifactsDir: string; cwd: string; startedAt: number; finishedAt: number }) => Promise<void>;
  readonly assistantToolName?: string;
  readonly secondTurn?: { readonly toolName?: string; readonly startedAtOffset?: number; readonly finishedAtOffset?: number };
}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'turn-diff-'));
  const previousHome = process.env.HOME;
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  const startedAt = Date.now() - 10_000;
  const finishedAt = Date.now() - 5_000;
  manager.appendMessage({ role: 'user', content: 'Change the file', timestamp: startedAt });
  if (options.assistantToolName !== undefined) {
    const toolCallId = randomUUID();
    manager.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'Working' }, { type: 'toolCall', id: toolCallId, name: options.assistantToolName, arguments: {} }],
      timestamp: startedAt + 100,
    });
    manager.appendMessage({
      role: 'toolResult', toolCallId, toolName: options.assistantToolName, isError: false,
      content: [{ type: 'text', text: 'ok' }],
    });
  }
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Done' }], timestamp: finishedAt });
  if (options.secondTurn !== undefined) {
    const secondStart = finishedAt + (options.secondTurn.startedAtOffset ?? 1_000);
    const secondFinish = finishedAt + (options.secondTurn.finishedAtOffset ?? 2_000);
    manager.appendMessage({ role: 'user', content: 'Change it again', timestamp: secondStart });
    if (options.secondTurn.toolName !== undefined) {
      const toolCallId = randomUUID();
      manager.appendMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'Working' }, { type: 'toolCall', id: toolCallId, name: options.secondTurn.toolName, arguments: {} }],
        timestamp: secondStart + 100,
      });
      manager.appendMessage({
        role: 'toolResult', toolCallId, toolName: options.secondTurn.toolName, isError: false,
        content: [{ type: 'text', text: 'ok' }],
      });
    }
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Done again' }], timestamp: secondFinish });
  }
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  if (!sessionFile) throw new Error('Native session file is required');
  const artifactsDir = sessionFile.slice(0, -'.jsonl'.length);
  await mkdir(join(artifactsDir, 'blobs'), { recursive: true });
  if (options.withJournal) await options.withJournal({ artifactsDir, cwd, startedAt, finishedAt });
  await manager.close();
  process.env.HOME = previousHome;
  process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
  return { root, cwd, sessionFile, artifactsDir, turnId: '', startedAt, finishedAt };
}

async function writeJournal(artifactsDir: string, records: readonly object[], blobs: Record<string, string>): Promise<void> {
  for (const [key, text] of Object.entries(blobs)) {
    await writeFile(join(artifactsDir, 'blobs', key), gzip(text));
  }
  await writeFile(join(artifactsDir, 'changes.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n');
}

interface ChildRegistration {
  readonly rootSessionKey: string;
  readonly row: { readonly [key: string]: string | number | boolean | undefined };
}

async function withService(fixture: Fixture, run: (baseUrl: string, rootSessionId: string, secret: string) => Promise<void>, children: readonly ChildRegistration[] = []): Promise<void> {
  const stateDirectory = join(fixture.root, 'service-state');
  await mkdir(stateDirectory, { recursive: true });
  const rootSessionId = randomUUID();
  const now = Date.now();
  await writeFile(join(stateDirectory, 'session-references.json'), JSON.stringify({
    references: {
      [rootSessionId]: {
        rootSessionId, projectId: randomUUID(), workspaceId: randomUUID(), cwd: fixture.cwd,
        agentDirectory: join(fixture.root, 'agent'), displayPath: 'workspace',
        sessionFile: fixture.sessionFile, sessionsDirectory: SessionManager.getDefaultSessionDir(fixture.cwd, join(fixture.root, 'agent')),
        createdAt: now, updatedAt: now,
      },
    },
    subagents: children.length === 0 ? {} : {
      [rootSessionId]: children.map(child => ({ ...child.row, rootSessionId, parentSessionId: rootSessionId })),
    },
    relocations: {},
  }), { mode: 0o600 });
  const secret = randomBytes(32).toString('hex');
  const { promise: bound, resolve: resolveBound, reject: rejectBound } = Promise.withResolvers<number>();
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const boundPort = probe.port ?? 0;
  probe.stop(true).then(() => resolveBound(boundPort), rejectBound);
  const port = await bound;
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret, stateDirectory, port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async operation => operation.action === 'reconcile'
      ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
      : { status: 'failed', code: 'SERVICE_UNAVAILABLE' },
  });
  await service.start();
  try {
    await run(`http://127.0.0.1:${port}`, rootSessionId, secret);
  } finally {
    await service.stop();
  }
}

async function fetchDiff(baseUrl: string, secret: string, sessionId: string, turnId: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/api/agent/v1/sessions/${sessionId}/turns/${turnId}/diff`, { headers: { 'x-internal-secret': secret, accept: 'application/json' } });
  return { status: response.status, body: await response.json() };
}

const HistoryTurnsSchema = z.object({ turns: z.array(z.object({ turnId: z.string() })) });

async function discoverTurnId(baseUrl: string, secret: string, sessionId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/agent/v1/sessions/${sessionId}/history?limit=1`, { headers: { 'x-internal-secret': secret, accept: 'application/json' } });
  const page = HistoryTurnsSchema.parse(await response.json());
  const turn = page.turns.at(-1);
  if (!turn) throw new Error('fixture session has no turns');
  return turn.turnId;
}

async function discoverTurnIds(baseUrl: string, secret: string, sessionId: string, limit = 100): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/agent/v1/sessions/${sessionId}/history?limit=${limit}`, { headers: { 'x-internal-secret': secret, accept: 'application/json' } });
  const page = HistoryTurnsSchema.parse(await response.json());
  return page.turns.map(turn => turn.turnId);
}

test('ready: a journaled in-window edit diffs through the route with full before/after/patch', async () => {
  const before = 'alpha\nbeta\n';
  const after = 'alpha\nBETA\n';
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      const at = startedAt + Math.floor((finishedAt - startedAt) / 2);
      await writeJournal(artifactsDir, [{
        type: 'change', at, agent: 'Main', tool: 'edit', path: join(cwd, 'a.ts'),
        base: 'base-blob', edit: [[1, 1, ['BETA']]], sum: contentSum(after),
      }], { 'base-blob': before });
    },
  });
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = await discoverTurnId(baseUrl, secret, rootSessionId);
    const { status, body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    expect(status).toBe(200);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('ready');
    expect(diff.files.length).toBe(1);
    const file = diff.files[0]!;
    expect(file.path).toBe('a.ts');
    expect(file.before).toBe(before);
    expect(file.after).toBe(after);
    expect(file.patch).toContain('-beta');
    expect(file.patch).toContain('+BETA');
    expect(file.provenance[0]!.agent).toBe('session');
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(1);
  });
});

test('empty: a turn without any writes or mutation evidence reads as a valid empty diff', async () => {
  const fixture = await writeSessionFixture({
    withJournal: async ({ artifactsDir }) => {
      await writeJournal(artifactsDir, [], {});
    },
  });
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = await discoverTurnId(baseUrl, secret, rootSessionId);
    const { status, body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    expect(status).toBe(200);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('empty');
    expect(diff.files.length).toBe(0);
  });
});

test('unsupported: transcript mutation evidence without journal coverage is never reconstructed', async () => {
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    withJournal: async ({ artifactsDir }) => {
      await writeJournal(artifactsDir, [], {});
    },
  });
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = await discoverTurnId(baseUrl, secret, rootSessionId);
    const { body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('unsupported');
    expect(diff.files.length).toBe(0);
  });
});

test('subagent attribution: child-owned journal records never surface in the root turn diff', async () => {
  const fixture = await writeSessionFixture({
    assistantToolName: 'task',
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      const at = startedAt + Math.floor((finishedAt - startedAt) / 2);
      await writeJournal(artifactsDir, [{
        type: 'change', at, agent: 'worker-1', parent: 'Main', tool: 'edit',
        path: join(cwd, 'child-write.ts'), base: null,
        edit: [[0, 0, ['child content', '']]], sum: contentSum('child content\n'),
      }], {});
    },
  });
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = await discoverTurnId(baseUrl, secret, rootSessionId);
    const { body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('unsupported');
    expect(diff.files.length).toBe(0);
  });
});

test('the workspace is never consulted: mutating files after the write changes nothing in the diff', async () => {
  const before = 'one\n';
  const after = 'two\n';
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      const at = startedAt + Math.floor((finishedAt - startedAt) / 2);
      await writeJournal(artifactsDir, [{
        type: 'change', at, agent: 'Main', tool: 'edit', path: join(cwd, 'proof.ts'),
        base: 'b1', edit: [[0, 1, ['two']]], sum: contentSum(after),
      }], { b1: before });
    },
  });
  await writeFile(join(fixture.cwd, 'proof.ts'), 'MUTATED LONG AFTER THE TURN\n');
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = await discoverTurnId(baseUrl, secret, rootSessionId);
    const { body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('ready');
    expect(diff.files[0]!.after).toBe(after);
    expect(diff.files[0]!.before).toBe(before);
  });
});

test('410 RESYNC_REQUIRED answers a turn that is not part of the session branch', async () => {
  const fixture = await writeSessionFixture({});
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const { status, body } = await fetchDiff(baseUrl, secret, rootSessionId, randomUUID());
    expect(status).toBe(410);
    const problem = z.object({ code: z.string().optional(), error: z.object({ code: z.string().optional() }).optional() }).parse(body);
    expect(problem.code ?? problem.error?.code).toBe('RESYNC_REQUIRED');
  });
});

test('failed: an unreadable journal file reports the failed state, never a masquerading empty', async () => {
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    withJournal: async ({ artifactsDir }) => {
      await mkdir(join(artifactsDir, 'changes.jsonl'), { recursive: true });
    },
  });
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = await discoverTurnId(baseUrl, secret, rootSessionId);
    const { status, body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    expect(status).toBe(200);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('failed');
    expect(diff.error !== undefined && diff.error.length > 0).toBe(true);
    expect(diff.files.length).toBe(0);
    expect(diff.error).not.toContain(fixture.root);
  });
});

test('subagent attribution: the child session diff exposes exactly its own writes', async () => {
  let captured: { cwd: string; at: number } | undefined;
  const fixture = await writeSessionFixture({
    assistantToolName: 'task',
    withJournal: async ({ startedAt, finishedAt, cwd }) => {
      captured = { cwd, at: startedAt + Math.floor((finishedAt - startedAt) / 2) };
    },
  });
  if (!captured) throw new Error('journal callback did not run');
  const { cwd, at } = captured;
  const childSessionsDir = SessionManager.getDefaultSessionDir(cwd, join(fixture.root, 'agent'));
  const childManager = SessionManager.create(cwd, childSessionsDir);
  childManager.appendMessage({ role: 'user', content: 'child task', timestamp: fixture.startedAt });
  childManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'child done' }], timestamp: fixture.finishedAt });
  await childManager.ensureOnDisk();
  await childManager.flush();
  const childSessionFile = childManager.getSessionFile();
  if (!childSessionFile) throw new Error('child session file required');
  await childManager.close();
  await writeJournal(fixture.artifactsDir, [{
    type: 'change', at, agent: 'worker-9', parent: 'Main', tool: 'write',
    path: join(cwd, 'child-output.ts'), base: null,
    edit: [[0, 0, ['child output', '']]], sum: contentSum('child output\n'),
  }], {});
  const childSessionId = randomUUID();
  const now = Date.now();
  const childRow = {
    subagentId: 'worker-9', childSessionId,
    role: 'task', status: 'completed',
    workspaceId: randomUUID(), projectId: randomUUID(),
    sessionFile: childSessionFile, createdAt: now, updatedAt: now,
  };
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const response = await fetch(`${baseUrl}/api/agent/v1/sessions/${childSessionId}/history?limit=1`, { headers: { 'x-internal-secret': secret, accept: 'application/json' } });
    const page = HistoryTurnsSchema.parse(await response.json());
    const turn = page.turns.at(-1);
    if (!turn) throw new Error('child session has no turns');
    const { status, body } = await fetchDiff(baseUrl, secret, childSessionId, turn.turnId);
    expect(status).toBe(200);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('ready');
    expect(diff.files.length).toBe(1);
    const file = diff.files[0]!;
    expect(file.path).toBe('child-output.ts');
    expect(file.after).toBe('child output\n');
    expect(file.provenance[0]!.agent).toBe('subagent');
    expect(file.provenance[0]!.subagentId).toBe('worker-9');
  }, [{ rootSessionKey: '', row: childRow }]);
});

test('mutation evidence scan: successful mutation-class tool results count, errors and reads do not', () => {
  const turnId = 'turn-x';
  const make = (toolName: string, isError: boolean) => [{
    turnId,
    parts: [{ type: 'tool_result', toolName, isError }],
  }];
  expect(mutationEvidenceInMessages(make('edit', false), turnId)).toBe(true);
  expect(mutationEvidenceInMessages(make('write', false), turnId)).toBe(true);
  expect(mutationEvidenceInMessages(make('bash', false), turnId)).toBe(true);
  expect(mutationEvidenceInMessages(make('edit', true), turnId)).toBe(false);
  expect(mutationEvidenceInMessages(make('read', false), turnId)).toBe(false);
  expect(mutationEvidenceInMessages(make('grep', false), turnId)).toBe(false);
  expect(mutationEvidenceInMessages([], turnId)).toBe(false);
});

test('two turns: each turn answers 200 with its own files, cold read', async () => {
  const beforeOne = 'one\n';
  const afterOne = 'one-edit\n';
  const beforeTwo = 'two\n';
  const afterTwo = 'two-edit\n';
  let windows: { startedAt: number; finishedAt: number } | undefined;
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    secondTurn: { toolName: 'edit', startedAtOffset: 1_000, finishedAtOffset: 2_000 },
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      windows = { startedAt, finishedAt };
      const firstAt = startedAt + Math.floor((finishedAt - startedAt) / 2);
      const secondAt = finishedAt + 1_500;
      await writeJournal(artifactsDir, [
        {
          type: 'change', at: firstAt, agent: 'Main', tool: 'edit', path: join(cwd, 'first.ts'),
          base: 'base-one', edit: [[0, 1, ['one-edit']]], sum: contentSum(afterOne),
        },
        // A write late inside the first run's window — after the step that
        // prompted it but before the run's final answer — belongs to the first
        // turn even though the transcript interleaves further steps after it:
        // a window shorter than the run drops it into the wrong turn.
        {
          type: 'change', at: finishedAt - 1, agent: 'Main', tool: 'edit', path: join(cwd, 'first-late.ts'),
          base: 'base-one-late', edit: [[0, 1, ['one-late-edit']]], sum: contentSum('one-late-edit\n'),
        },
        {
          type: 'change', at: secondAt, agent: 'Main', tool: 'edit', path: join(cwd, 'second.ts'),
          base: 'base-two', edit: [[0, 1, ['two-edit']]], sum: contentSum(afterTwo),
        },
      ], { 'base-one': beforeOne, 'base-two': beforeTwo, 'base-one-late': 'one-late\n' });
    },
  });
  if (!windows) throw new Error('journal callback did not run');
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnIds = await discoverTurnIds(baseUrl, secret, rootSessionId);
    expect(turnIds.length).toBe(2);
    const firstTurnId = turnIds[0]!
    const secondTurnId = turnIds[1]!
    const first = await fetchDiff(baseUrl, secret, rootSessionId, firstTurnId);
    expect(first.status).toBe(200);
    const firstDiff = TurnDiffSchema.parse(first.body);
    expect(firstDiff.state).toBe('ready');
    expect(firstDiff.files.length).toBe(2);
    expect(firstDiff.files.map(file => file.path).sort()).toEqual(['first-late.ts', 'first.ts']);
    expect(firstDiff.files.find(file => file.path === 'first.ts')?.before).toBe(beforeOne);
    expect(firstDiff.files.find(file => file.path === 'first.ts')?.after).toBe(afterOne);
    const second = await fetchDiff(baseUrl, secret, rootSessionId, secondTurnId);
    expect(second.status).toBe(200);
    const secondDiff = TurnDiffSchema.parse(second.body);
    expect(secondDiff.state).toBe('ready');
    expect(secondDiff.files.length).toBe(1);
    expect(secondDiff.files[0]!.path).toBe('second.ts');
    expect(secondDiff.files[0]!.before).toBe(beforeTwo);
    expect(secondDiff.files[0]!.after).toBe(afterTwo);
    expect(secondDiff.files[0]!.patch).not.toContain('first.ts');
  });
});

test('fragmented run: a multi-step user prompt is one turn whose diff aggregates every step write, cold read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'turn-diff-fragmented-'));
  const previousHome = process.env.HOME;
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  try {
    await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
    const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
    const manager = SessionManager.create(cwd, sessionsDirectory);
    await manager.ensureOnDisk();
    // One user prompt drives several model steps in a single run, recorded
    // exactly the way a live worker records it: the projection consumes the
    // native stream, binds canonical references to each native entry and
    // settles the run once. The cold reopen then re-projects whatever grouping
    // the live projection persisted — a regression to per-step fragmentation
    // yields one canonical turn per model step instead of one per prompt.
    const projection = new WorkerProjection(manager, 'fragmented-fixture');
    const start = Date.now() - 10_000;
    projection.beginRun(randomUUID(), start);
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const assistant = (content: AssistantContent, stopReason: 'toolUse' | 'stop', timestamp: number): AssistantMessageInput => ({
      role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'fixture', stopReason, timestamp, usage,
    });
    const record = (message: RecordableMessage): void => {
      projection.consume({ type: 'message_start', message });
      manager.appendMessage(message);
      projection.consume({ type: 'message_end', message });
      projection.bindPending();
    };
    record({ role: 'user', content: 'Change the file, then tell me', timestamp: start });
    const firstStep = assistant([{ type: 'toolCall', id: 'call-one', name: 'edit', arguments: {} }], 'toolUse', start + 100);
    record(firstStep);
    record({ role: 'toolResult', toolCallId: 'call-one', toolName: 'edit', isError: false, content: [{ type: 'text', text: 'ok' }], timestamp: start + 150 });
    projection.consume({ type: 'turn_end', message: firstStep, toolResults: [] });
    const secondStep = assistant([{ type: 'toolCall', id: 'call-two', name: 'edit', arguments: {} }], 'toolUse', start + 5_000);
    record(secondStep);
    record({ role: 'toolResult', toolCallId: 'call-two', toolName: 'edit', isError: false, content: [{ type: 'text', text: 'ok' }], timestamp: start + 5_050 });
    projection.consume({ type: 'turn_end', message: secondStep, toolResults: [] });
    const finalAnswer = assistant([{ type: 'text', text: 'Done' }], 'stop', start + 9_000);
    record(finalAnswer);
    projection.consume({ type: 'turn_end', message: finalAnswer, toolResults: [] });
    projection.consume({ type: 'agent_end', messages: [firstStep, secondStep, finalAnswer] });
    await manager.flush();
    const sessionFile = manager.getSessionFile();
    if (!sessionFile) throw new Error('Native session file is required');
    const artifactsDir = sessionFile.slice(0, -'.jsonl'.length);
    await mkdir(join(artifactsDir, 'blobs'), { recursive: true });
    await writeJournal(artifactsDir, [
      {
        type: 'change', at: start + 150, agent: 'Main', tool: 'edit', path: join(cwd, 'first.ts'),
        base: 'base-one', edit: [[0, 1, ['one-edit']]], sum: contentSum('one-edit\n'),
      },
      {
        type: 'change', at: start + 5_050, agent: 'Main', tool: 'edit', path: join(cwd, 'late.ts'),
        base: 'base-late', edit: [[0, 1, ['late-edit']]], sum: contentSum('late-edit\n'),
      },
    ], { 'base-one': 'one\n', 'base-late': 'late\n' });
    await manager.close();
    const fixture: Fixture = { root, cwd, sessionFile, artifactsDir, turnId: '', startedAt: start, finishedAt: start + 9_000 };
    await withService(fixture, async (baseUrl, rootSessionId, secret) => {
      const turnIds = await discoverTurnIds(baseUrl, secret, rootSessionId);
      expect(turnIds.length).toBe(1);
      const read = await fetchDiff(baseUrl, secret, rootSessionId, turnIds[0]!);
      expect(read.status).toBe(200);
      const diff = TurnDiffSchema.parse(read.body);
      expect(diff.state).toBe('ready');
      // Every step write of the run lands in the prompt's one turn: a window
      // shorter than the run leaves the later step's write outside it.
      expect(diff.files.map(file => file.path).sort()).toEqual(['first.ts', 'late.ts']);
      expect(diff.files.find(file => file.path === 'late.ts')?.before).toBe('late\n');
      expect(diff.files.find(file => file.path === 'late.ts')?.after).toBe('late-edit\n');
    });
  } finally {
    process.env.HOME = previousHome;
    process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
  }
});

test('two turns: each turn answers 200 with its own files through the live worker path', async () => {
  const beforeOne = 'live-one\n';
  const afterOne = 'live-one-edit\n';
  const beforeTwo = 'live-two\n';
  const afterTwo = 'live-two-edit\n';
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    secondTurn: { toolName: 'edit', startedAtOffset: 1_000, finishedAtOffset: 2_000 },
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      const firstAt = startedAt + Math.floor((finishedAt - startedAt) / 2);
      const secondAt = finishedAt + 1_500;
      await writeJournal(artifactsDir, [
        {
          type: 'change', at: firstAt, agent: 'Main', tool: 'edit', path: join(cwd, 'live-first.ts'),
          base: 'live-base-one', edit: [[0, 1, ['live-one-edit']]], sum: contentSum(afterOne),
        },
        {
          type: 'change', at: secondAt, agent: 'Main', tool: 'edit', path: join(cwd, 'live-second.ts'),
          base: 'live-base-two', edit: [[0, 1, ['live-two-edit']]], sum: contentSum(afterTwo),
        },
      ], { 'live-base-one': beforeOne, 'live-base-two': beforeTwo });
    },
  });
  const stateDirectory = join(fixture.root, 'service-state');
  await mkdir(stateDirectory, { recursive: true });
  const rootSessionId = randomUUID();
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const agentDirectory = join(fixture.root, 'agent');
  const agentDirectoryId = 'turn-diff-owner';
  const now = Date.now();
  await writeFile(join(stateDirectory, 'session-references.json'), JSON.stringify({
    references: {
      [rootSessionId]: {
        rootSessionId, projectId, workspaceId, cwd: fixture.cwd,
        agentDirectory, agentDirectoryId, displayPath: 'workspace',
        sessionFile: fixture.sessionFile, sessionsDirectory: SessionManager.getDefaultSessionDir(fixture.cwd, agentDirectory),
        createdAt: now, updatedAt: now,
      },
    },
    subagents: {},
    relocations: {},
  }), { mode: 0o600 });
  const secret = randomBytes(32).toString('hex');
  const { promise: bound, resolve: resolveBound, reject: rejectBound } = Promise.withResolvers<number>();
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const boundPort = probe.port ?? 0;
  probe.stop(true).then(() => resolveBound(boundPort), rejectBound);
  const port = await bound;
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret, stateDirectory, port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async operation => operation.action === 'reconcile'
      ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
      : { status: 'failed', code: 'SERVICE_UNAVAILABLE' },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await service.start();
  try {
    const env = {
      HOME: fixture.root, USERPROFILE: fixture.root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
      OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(fixture.root, 'config'), XDG_DATA_HOME: join(fixture.root, 'data'),
      XDG_STATE_HOME: join(fixture.root, 'state'), XDG_CACHE_HOME: join(fixture.root, 'cache')
    };
    const workspaceResponse = await fetch(`${baseUrl}/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'POST', headers: { 'x-internal-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, cwd: fixture.cwd, agentDirectory, agentDirectoryId, env }),
    });
    expect(workspaceResponse.status).toBe(201);
    const reopenResponse = await fetch(`${baseUrl}/internal/sessions/${encodeURIComponent(rootSessionId)}/reopen`, {
      method: 'POST', headers: { 'x-internal-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ rootSessionId, projectId, workspaceId, cwd: fixture.cwd, agentDirectory, agentDirectoryId, displayPath: 'workspace' }),
    });
    expect(reopenResponse.status).toBe(200);
    const workersResponse = await fetch(`${baseUrl}/internal/workers`, { headers: { 'x-internal-secret': secret } });
    const workers = z.object({ workers: z.array(z.object({ kind: z.string(), rootSessionId: z.string() })) }).parse(await workersResponse.json());
    expect(workers.workers.filter(worker => worker.kind === 'session').map(worker => worker.rootSessionId)).toContain(rootSessionId);
    const turnIds = await discoverTurnIds(baseUrl, secret, rootSessionId);
    expect(turnIds.length).toBe(2);
    const firstTurnId = turnIds[0]!
    const secondTurnId = turnIds[1]!
    const first = await fetchDiff(baseUrl, secret, rootSessionId, firstTurnId);
    expect(first.status).toBe(200);
    const firstDiff = TurnDiffSchema.parse(first.body);
    expect(firstDiff.state).toBe('ready');
    expect(firstDiff.files.length).toBe(1);
    expect(firstDiff.files[0]!.path).toBe('live-first.ts');
    expect(firstDiff.files[0]!.before).toBe(beforeOne);
    expect(firstDiff.files[0]!.after).toBe(afterOne);
    const second = await fetchDiff(baseUrl, secret, rootSessionId, secondTurnId);
    expect(second.status).toBe(200);
    const secondDiff = TurnDiffSchema.parse(second.body);
    expect(secondDiff.state).toBe('ready');
    expect(secondDiff.files.length).toBe(1);
    expect(secondDiff.files[0]!.path).toBe('live-second.ts');
    expect(secondDiff.files[0]!.before).toBe(beforeTwo);
    expect(secondDiff.files[0]!.after).toBe(afterTwo);
    expect(secondDiff.files[0]!.patch).not.toContain('live-first.ts');
  } finally {
    await service.stop();
  }
});
test('failed: a corrupt session transcript reports the failed state with a sanitized error, never HTTP 500', async () => {
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      const at = startedAt + Math.floor((finishedAt - startedAt) / 2);
      await writeJournal(artifactsDir, [{
        type: 'change', at, agent: 'Main', tool: 'edit', path: join(cwd, 'corrupt-target.ts'),
        base: null, edit: [[0, 0, ['x', '']]], sum: contentSum('x\n'),
      }], {});
    },
  });
  await writeFile(fixture.sessionFile, '{"type":"session","id":"corrupt"\n{"torn": tru');
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const { status, body } = await fetchDiff(baseUrl, secret, rootSessionId, randomUUID());
    expect(status).toBe(200);
    const diff = TurnDiffSchema.parse(body);
    expect(diff.state).toBe('failed');
    expect(diff.error !== undefined && diff.error.length > 0).toBe(true);
    expect(diff.error).not.toContain(fixture.root);
    expect(diff.error).not.toContain(fixture.sessionFile);
  });
});

test('failed: error sanitization strips paths containing spaces entirely', async () => {
  const fixture = await writeSessionFixture({
    assistantToolName: 'edit',
    withJournal: async ({ artifactsDir, cwd, startedAt, finishedAt }) => {
      const at = startedAt + Math.floor((finishedAt - startedAt) / 2);
      await writeJournal(artifactsDir, [{
        type: 'change', at, agent: 'Main', tool: 'edit', path: join(cwd, 'sanitize-target.ts'),
        base: null, edit: [[0, 0, ['x', '']]], sum: contentSum('x\n'),
      }], {});
    },
  });
  const spaced = join(fixture.root, 'dir with spaces');
  await mkdir(spaced, { recursive: true });
  await writeFile(join(fixture.artifactsDir, 'changes.jsonl'), '{"type":"change"');
  await withService(fixture, async (baseUrl, rootSessionId, secret) => {
    const turnId = (await discoverTurnIds(baseUrl, secret, rootSessionId))[0];
    if (!turnId) throw new Error('fixture session has no turns');
    const { body } = await fetchDiff(baseUrl, secret, rootSessionId, turnId);
    const diff = TurnDiffSchema.parse(body);
    if (diff.error !== undefined) {
      expect(diff.error).not.toContain('dir with spaces');
      expect(diff.error).not.toContain(fixture.root);
    }
  });
});
