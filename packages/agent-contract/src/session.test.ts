import { describe, expect, test } from 'bun:test';
import {
  AgentCreateRequestSchema, AgentDeleteRequestSchema, AgentMutationResultSchema, AgentSchema,
  AgentUpdateRequestSchema, FollowUpAckSchema, FollowUpRequestSchema, ProjectSchema,
  RunAbortAckSchema, RunAbortRequestSchema, RunCreateRequestSchema, RunSchema,
  RunStatusSchema, RuntimeSessionSchema, SessionCreateAckSchema, SessionCreateRequestSchema,
  SessionDeleteAckSchema, SessionDeleteRequestSchema, SessionRuntimeStatusSchema, SessionSchema,
  SteerAckSchema, SteerRequestSchema, SubagentSchema, SessionControlRequestSchema, SessionControlAckSchema, SessionModeSchema,
  SessionMoveToWorktreeRequestSchema, SessionMoveToWorktreeResultSchema,
} from './session.ts';
import { SubagentControlAckSchema, SubagentControlRequestSchema } from './requests.ts';

const id = 'ses_01';
test('compaction abort and optional rich subagent progress stay canonical', () => {
  expect(SessionControlRequestSchema.parse({ type: 'compact.abort' })).toEqual({ type: 'compact.abort' });
  expect(SessionControlAckSchema.parse({ type: 'compact.abort', aborted: false })).toEqual({ type: 'compact.abort', aborted: false });
  const row = { subagentId: 'child', parentSessionId: 'parent', childSessionId: 'child', role: 'worker', status: 'completed' };
  expect(SubagentSchema.parse({ ...row, stage: 'Checks finished', completionPercent: 100, recentOutput: [] })).toMatchObject({ status: 'completed', recentOutput: [] });
  expect(SubagentSchema.safeParse({ ...row, completionPercent: 101 }).success).toBe(false);
  expect(SubagentSchema.safeParse({ ...row, recentOutput: [null] }).success).toBe(false);
});
const timestamp = 1774201000000;
const options = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
const prompt = { input: { text: 'hello', attachments: [], context: [] }, options };
const runtime = {
  sessionId: id, projectId: 'pro_01', workspaceId: 'ws_01', displayPath: 'src', rootSessionId: id,
  createdAt: timestamp, updatedAt: timestamp, epoch: '0', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null,
  mode: { kind: 'main' },
};
const metadata = { folder: 'A' };
const session = { ...runtime, archivedAt: timestamp, metadata, metadataRevision: '1', archiveRevision: '2' };
const pendingRun = { runId: 'run_01', sessionId: id, status: 'pending', createdAt: timestamp };
const run = { ...pendingRun, status: 'completed', finishedAt: timestamp + 1000 };
const agent = { agentId: 'agt_01', name: 'Agent', description: '', model: null, allowedTools: ['read'] };

describe('session schemas', () => {
  test('session modes carry only canonical plan references and mode controls are explicit', () => {
    const mode = { kind: 'plan', status: 'active', planReference: 'local://PLAN.md' } as const;
    expect(SessionModeSchema.parse({ kind: 'main' })).toEqual({ kind: 'main' });
    expect(SessionModeSchema.parse(mode)).toEqual(mode);
    expect(SessionModeSchema.parse({ ...mode, status: 'paused' })).toEqual({ ...mode, status: 'paused' });
    for (const planReference of ['/host/PLAN.md', 'file:///host/PLAN.md', 'local://', 'local://bad path']) {
      expect(SessionModeSchema.safeParse({ ...mode, planReference }).success).toBe(false);
    }
    expect(SessionModeSchema.safeParse({ ...mode, status: 'complete' }).success).toBe(false);
    expect(SessionModeSchema.safeParse({ kind: 'main', planReference: mode.planReference }).success).toBe(false);
    expect(RuntimeSessionSchema.safeParse({ ...runtime, mode: undefined }).success).toBe(false);
    for (const selected of ['main', 'plan', 'vibe']) {
      const control = { type: 'mode.set', mode: selected };
      expect(SessionControlRequestSchema.parse(control)).toEqual(control);
    }
    expect(SessionModeSchema.parse({ kind: 'vibe' })).toEqual({ kind: 'vibe' });
    expect(SessionControlAckSchema.parse({ type: 'mode.set', mode })).toEqual({ type: 'mode.set', mode });
  });
  test('goal mode and controls expose native state and reject invalid objectives and budgets', () => {
    const mode = { kind: 'goal', status: 'active', objective: 'Ship the task', tokenBudget: null, tokensUsed: 0 };
    for (const status of ['active', 'paused', 'budget-limited', 'complete']) {
      expect(SessionModeSchema.parse({ ...mode, status })).toEqual({ ...mode, status });
    }
    expect(SessionModeSchema.safeParse({ ...mode, status: 'blocked' }).success).toBe(false);
    const control = { type: 'goal', op: 'create', objective: 'Ship the task', tokenBudget: 1000 };
    expect(SessionControlRequestSchema.parse(control)).toEqual(control);
    expect(SessionControlAckSchema.parse({ type: 'goal', mode })).toEqual({ type: 'goal', mode });
    for (const op of ['pause', 'resume', 'drop']) expect(SessionControlRequestSchema.parse({ type: 'goal', op })).toEqual({ type: 'goal', op });
    for (const objective of ['', '  ', undefined]) expect(SessionControlRequestSchema.safeParse({ ...control, objective }).success).toBe(false);
    for (const tokenBudget of [0, -1, 1.5]) expect(SessionControlRequestSchema.safeParse({ ...control, tokenBudget }).success).toBe(false);
    expect(SessionControlRequestSchema.safeParse({ ...control, tokenBudget: null }).success).toBe(true);
  });
  test('session controls discriminate abort compact and builtin command', () => {
    const abort = { type: 'abort', runId: 'run_01' } as const;
    const compact = { type: 'compact', instructions: 'Keep the decisions and unresolved questions.' } as const;
    const command = { type: 'command', text: '/context' } as const;
    const ack = { type: 'compact', compactionId: 'compact_01', tokensBefore: 4096, completedAt: timestamp } as const;
    expect(SessionControlRequestSchema.parse(abort)).toEqual(abort);
    expect(SessionControlRequestSchema.parse(compact)).toEqual(compact);
    expect(SessionControlRequestSchema.parse(command)).toEqual(command);
    expect(SessionControlRequestSchema.safeParse({ type: 'command', text: '' }).success).toBe(false);
    expect(SessionControlRequestSchema.safeParse({ type: 'compact', instructions: 2 }).success).toBe(false);
    expect(SessionControlAckSchema.parse(ack)).toEqual(ack);
    expect(SessionControlAckSchema.parse({ type: 'command', output: 'Context: 42%' })).toEqual({ type: 'command', output: 'Context: 42%' });
  });
  test('preserves opaque project identity and agent selection without inherited aliases', () => {
    const project = { projectId: 'pro_01', name: 'P', workspaceIds: ['ws_01'], displayPath: 'src' };
    expect(ProjectSchema.parse(project)).toEqual(project);
    expect(ProjectSchema.safeParse({ ...project, displayPath: '/host/project' }).success).toBe(false);
    expect(AgentSchema.parse(agent)).toEqual(agent);
    const configured = { ...agent, model: { providerId: 'provider_1', modelId: 'model_1' }, systemPromptOverride: 'Review only.' };
    expect(AgentSchema.parse(configured)).toEqual(configured);
    expect(AgentSchema.safeParse({ ...configured, permissionPresetId: 'preset' }).success).toBe(false);
    const inherited = { ...agent, allowedTools: null };
    expect(AgentSchema.parse(inherited)).toEqual(inherited);
    expect(AgentSchema.safeParse({ ...agent, allowedTools: undefined }).success).toBe(false);
    expect(AgentSchema.safeParse({ ...agent, inheritedAgent: 'parent' }).success).toBe(false);
    expect(AgentSchema.safeParse({ ...agent, model: { providerId: 'provider_1' } }).success).toBe(false);
  });

  test('agent profile mutations preserve their owning revision and returned identity', () => {
    const create = { expectedRevision: '0', agent };
    const update = { expectedRevision: '1', agent: { ...agent, name: 'Updated' } };
    const remove = { expectedRevision: '2', agentId: agent.agentId };
    const result = { revision: '1', agentId: agent.agentId, agent };
    const deleted = { revision: '3', agentId: agent.agentId, agent: null };
    expect(AgentCreateRequestSchema.parse(create)).toEqual(create);
    expect(AgentUpdateRequestSchema.parse(update)).toEqual(update);
    expect(AgentDeleteRequestSchema.parse(remove)).toEqual(remove);
    expect(AgentMutationResultSchema.parse(result)).toEqual(result);
    expect(AgentMutationResultSchema.parse(deleted)).toEqual(deleted);
    expect(AgentCreateRequestSchema.safeParse({ ...create, expectedRevision: '01' }).success).toBe(false);
    expect(AgentUpdateRequestSchema.safeParse({ ...update, expectedRevision: 1 }).success).toBe(false);
    expect(AgentDeleteRequestSchema.safeParse({ ...remove, agentId: '' }).success).toBe(false);
    expect(AgentMutationResultSchema.safeParse({ ...result, agentId: 'agt_other' }).success).toBe(false);
    expect(AgentMutationResultSchema.safeParse({ ...deleted, revision: '0' }).success).toBe(false);
  });

  test('runtime activity is explicit while archive and metadata retain independent Host revisions', () => {
    expect(RuntimeSessionSchema.parse(runtime)).toEqual(runtime);
    expect(SessionSchema.parse(session)).toEqual(session);
    const missing = { ...runtime, metadata: null, metadataRevision: '0', archiveRevision: '9' };
    expect(SessionSchema.parse(missing)).toEqual(missing);
    for (const status of ['idle', 'running', 'awaiting_approval', 'awaiting_input', 'unavailable']) {
      expect(SessionRuntimeStatusSchema.parse(status)).toBe(status);
    }
    expect(SessionRuntimeStatusSchema.safeParse('completed').success).toBe(false);
    const active = { ...runtime, runtimeStatus: 'awaiting_approval', activeRunId: pendingRun.runId };
    expect(RuntimeSessionSchema.parse(active)).toEqual(active);
    expect(RuntimeSessionSchema.safeParse({ ...runtime, archivedAt: timestamp, metadata: null, metadataRevision: '0', archiveRevision: '0' }).success).toBe(false);
    expect(RuntimeSessionSchema.safeParse({ ...runtime, displayPath: '/absolute' }).success).toBe(false);
    expect(RuntimeSessionSchema.safeParse({ ...runtime, createdAt: '2026-01-01T00:00:00.000Z' }).success).toBe(false);
    expect(RuntimeSessionSchema.safeParse({ ...runtime, runtimeStatus: 'running', activeRunId: null }).success).toBe(false);
    expect(RuntimeSessionSchema.safeParse({ ...runtime, activeRunId: pendingRun.runId }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, metadata: null, metadataRevision: '1' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, metadataRevision: '0' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, archiveRevision: '02' }).success).toBe(false);
  });

  test('run origin defaults to Host and accepts worker origins', () => {
    expect(RunSchema.parse(pendingRun).origin).toBe('host');
    expect(RunSchema.parse({ ...pendingRun, origin: 'goal' }).origin).toBe('goal');
    expect(RunSchema.safeParse({ ...pendingRun, origin: 'invalid' }).success).toBe(false);
  });

  test('outer run terminal status does not represent tool denial or an inner approval wait', () => {
    expect(RunSchema.parse(pendingRun)).toMatchObject({ ...pendingRun, origin: 'host' });
    expect(RunSchema.parse(run)).toMatchObject({ ...run, origin: 'host' });
    const running = { ...pendingRun, status: 'running' };
    expect(RunSchema.parse(running)).toMatchObject({ ...running, origin: 'host' });
    for (const status of ['pending', 'running', 'completed', 'failed', 'cancelled']) expect(RunStatusSchema.parse(status)).toBe(status);
    expect(RunStatusSchema.safeParse('awaiting_approval').success).toBe(false);
    expect(RunStatusSchema.safeParse('denied').success).toBe(false);
    expect(RunSchema.safeParse({ ...pendingRun, status: 'completed' }).success).toBe(false);
    expect(RunSchema.safeParse({ ...run, status: 'running' }).success).toBe(false);
    expect(RunSchema.safeParse({ ...run, turnId: 'turn_01' }).success).toBe(false);
  });

  test('session creation and deletion acknowledgements preserve the composed state and cascade IDs', () => {
    const create = { projectId: 'pro_01', workspaceId: 'ws_01', options, metadata };
    const created = { session };
    const remove = { sessionId: id, force: true, purgeWorkspaceFiles: false };
    const removed = { sessionId: id, deletedSessionIds: [id, 'ses_02'] };
    const subagent = { subagentId: 'sub_01', parentSessionId: id, childSessionId: 'ses_02', role: 'worker', status: 'completed' };
    expect(SessionCreateRequestSchema.parse(create)).toEqual(create);
    expect(SessionCreateRequestSchema.parse({ ...create, parentSessionId: 'ses_parent' })).toEqual({ ...create, parentSessionId: 'ses_parent' });
    expect(SessionCreateAckSchema.parse(created)).toEqual(created);
    expect(SessionDeleteRequestSchema.parse(remove)).toEqual(remove);
    expect(SessionDeleteAckSchema.parse(removed)).toEqual(removed);
    expect(SubagentSchema.parse(subagent)).toEqual(subagent);
    expect(SessionCreateRequestSchema.safeParse({ ...create, directory: '/host/project' }).success).toBe(false);
    expect(SessionCreateAckSchema.safeParse({ session: { ...session, metadataRevision: '0' } }).success).toBe(false);
    expect(SessionDeleteRequestSchema.safeParse({ ...remove, force: 'true' }).success).toBe(false);
    expect(SessionDeleteAckSchema.safeParse({ ...removed, deletedSessionIds: ['ses_02'] }).success).toBe(false);
    expect(SubagentSchema.safeParse({ ...subagent, status: 'cancelled' }).success).toBe(true);
    const liveSubagent = {
      ...subagent,
      status: 'running' as const,
      activeTool: 'bash',
      tokens: 1200,
      cost: 0.045,
      turnCount: 3,
      retryCountdown: 15,
      depth: 2,
      parentSubagentId: 'sub_00',
      description: 'Running tests',
      task: 'Test execution',
      lastIntent: 'Running bun test',
      durationMs: 4500,
    };
    expect(SubagentSchema.parse(liveSubagent)).toEqual(liveSubagent);
    expect(SubagentSchema.safeParse({ ...liveSubagent, depth: 9 }).success).toBe(false);
    expect(SessionControlRequestSchema.parse({ type: 'subagent.steer', subagentId: 'sub_01', message: 'focus on tests' })).toEqual({ type: 'subagent.steer', subagentId: 'sub_01', message: 'focus on tests' });
    expect(SessionControlRequestSchema.parse({ type: 'subagent.cancel', subagentId: 'sub_01' })).toEqual({ type: 'subagent.cancel', subagentId: 'sub_01' });
    expect(SessionControlAckSchema.parse({ type: 'subagent.steer', subagentId: 'sub_01', accepted: true })).toEqual({ type: 'subagent.steer', subagentId: 'sub_01', accepted: true });
    expect(SessionControlAckSchema.parse({ type: 'subagent.cancel', subagentId: 'sub_01', cancelled: true })).toEqual({ type: 'subagent.cancel', subagentId: 'sub_01', cancelled: true });
    expect(SubagentControlRequestSchema.parse({ type: 'subagent.revive', subagentId: 'sub_01' })).toEqual({ type: 'subagent.revive', subagentId: 'sub_01' });
    expect(SubagentControlRequestSchema.parse({ type: 'subagent.revive', subagentId: 'sub_01', message: 'finish the tests' })).toEqual({ type: 'subagent.revive', subagentId: 'sub_01', message: 'finish the tests' });
    expect(SubagentControlAckSchema.parse({ type: 'subagent.revive', subagentId: 'sub_01', revived: true, prompted: false })).toEqual({ type: 'subagent.revive', subagentId: 'sub_01', revived: true, prompted: false });
    // A revive must never carry an empty instruction: it either prompts or it does not.
    expect(SubagentControlRequestSchema.safeParse({ type: 'subagent.revive', subagentId: 'sub_01', message: '' }).success).toBe(false);
  });

  test('run, abort, steer and follow-up preserve captured prompt and acknowledgement shapes', () => {
    const abort = { sessionId: id, runId: pendingRun.runId };
    const aborted = { run: { ...run, status: 'cancelled' } };
    const steer = { sessionId: id, request: prompt };
    const steered = { sessionId: id, runId: pendingRun.runId, acceptedAt: timestamp };
    const followUp = { sessionId: id, request: prompt };
    const followedUp = { sessionId: id, followUpId: 'fu_01', acceptedAt: timestamp };
    expect(RunCreateRequestSchema.parse(prompt)).toEqual(prompt);
    expect(RunSchema.parse(pendingRun)).toMatchObject({ ...pendingRun, origin: 'host' });
    expect(RunAbortRequestSchema.parse(abort)).toEqual(abort);
    expect(RunAbortAckSchema.parse(aborted)).toMatchObject({ run: { ...run, status: 'cancelled', origin: 'host' } });
    expect(SteerRequestSchema.parse(steer)).toEqual(steer);
    expect(SteerAckSchema.parse(steered)).toEqual(steered);
    expect(FollowUpRequestSchema.parse(followUp)).toEqual(followUp);
    expect(FollowUpAckSchema.parse(followedUp)).toEqual(followedUp);
    expect(RunCreateRequestSchema.safeParse({ sessionId: id, message: 'hello', options }).success).toBe(false);
    expect(RunSchema.safeParse({ ...pendingRun, finishedAt: timestamp }).success).toBe(false);
    expect(RunAbortRequestSchema.safeParse({ ...abort, runId: '' }).success).toBe(false);
    expect(RunAbortAckSchema.safeParse({ ...aborted.run }).success).toBe(false);
    expect(SteerRequestSchema.safeParse({ ...steer, request: { ...prompt, options: { system: 'system', tools: ['read'] } } }).success).toBe(false);
    expect(SteerAckSchema.safeParse({ ...steered, acceptedAt: '2026-01-01T00:00:00.000Z' }).success).toBe(false);
    expect(FollowUpRequestSchema.safeParse({ ...followUp, request: { ...prompt, input: { text: 'hello' } } }).success).toBe(false);
    expect(FollowUpAckSchema.safeParse({ sessionId: id, runId: pendingRun.runId, acceptedAt: timestamp }).success).toBe(false);
  });
});


describe('session.moveToWorktree schemas', () => {
  const moved = {
    sessionId: id,
    directory: 'feature-login',
    previousDirectory: '.',
    worktree: { name: 'feature-login', branch: 'feature-login', path: '/host/worktrees/feature-login', startRef: 'main' },
    changesMoved: false,
    carried: [],
  };

  test('a request names one relative folder and workspace-relative carried files', () => {
    expect(SessionMoveToWorktreeRequestSchema.parse({ worktree: { name: 'feature-login' } }))
      .toEqual({ worktree: { name: 'feature-login' }, carry: [] });
    expect(SessionMoveToWorktreeRequestSchema.parse({
      worktree: { name: 'feature-login', branchName: 'feature-login', startRef: 'main' },
      carry: ['src/app.ts'],
    })).toMatchObject({ carry: ['src/app.ts'] });
    expect(SessionMoveToWorktreeRequestSchema.parse({ worktree: { name: 'existing', existingBranch: 'release' } }))
      .toMatchObject({ worktree: { existingBranch: 'release' } });
  });

  test('rejects a folder name that is absolute, traversing or reserved', () => {
    for (const name of ['/abs', '..', '.', 'a/b', 'a\\b', 'a:b', 'a*', 'a\u0000b', '']) {
      expect(SessionMoveToWorktreeRequestSchema.safeParse({ worktree: { name } }).success).toBe(false);
    }
  });

  test('rejects carried changes that leave the workspace, and an existing branch mixed with a start ref', () => {
    for (const carry of [['/etc/passwd'], ['../outside.txt'], [' src/a.ts '], [''], ['C:\\abs.txt']]) {
      expect(SessionMoveToWorktreeRequestSchema.safeParse({ worktree: { name: 'ok' }, carry }).success).toBe(false);
    }
    expect(SessionMoveToWorktreeRequestSchema.safeParse({
      worktree: { name: 'ok', existingBranch: 'release', startRef: 'main' },
    }).success).toBe(false);
    expect(SessionMoveToWorktreeRequestSchema.safeParse({ worktree: { name: 'ok' }, extra: true }).success).toBe(false);
  });

  test('a result names the session, its new folder, the checkout and what moved', () => {
    expect(SessionMoveToWorktreeResultSchema.parse(moved)).toEqual(moved);
    expect(SessionMoveToWorktreeResultSchema.safeParse({ ...moved, sessionId: undefined }).success).toBe(false);
    expect(SessionMoveToWorktreeResultSchema.safeParse({ ...moved, changesMoved: undefined }).success).toBe(false);
    expect(SessionMoveToWorktreeResultSchema.safeParse({ ...moved, carried: undefined }).success).toBe(false);
    expect(SessionMoveToWorktreeResultSchema.safeParse({ ...moved, worktree: { name: 'x', branch: 'x' } }).success).toBe(false);
    expect(SessionMoveToWorktreeResultSchema.safeParse({ ...moved, sessions: [] }).success).toBe(false);
  });
});
