import { describe, expect, test } from 'bun:test';
import {
  AgentCreateRequestSchema, AgentDeleteRequestSchema, AgentMutationResultSchema, AgentSchema,
  AgentUpdateRequestSchema, FollowUpAckSchema, FollowUpRequestSchema, ProjectSchema,
  RunAbortAckSchema, RunAbortRequestSchema, RunCreateRequestSchema, RunSchema,
  RunStatusSchema, RuntimeSessionSchema, SessionCreateAckSchema, SessionCreateRequestSchema,
  SessionDeleteAckSchema, SessionDeleteRequestSchema, SessionRuntimeStatusSchema, SessionSchema,
  SteerAckSchema, SteerRequestSchema, SubagentSchema,
} from './session.ts';

const id = 'ses_01';
const timestamp = 1774201000000;
const options = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
const prompt = { input: { text: 'hello', attachments: [], context: [] }, options };
const runtime = {
  sessionId: id, projectId: 'pro_01', workspaceId: 'ws_01', displayPath: 'src', rootSessionId: id,
  createdAt: timestamp, updatedAt: timestamp, epoch: '0', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null,
};
const metadata = { title: 'A' };
const session = { ...runtime, archivedAt: timestamp, metadata, metadataRevision: '1', archiveRevision: '2' };
const pendingRun = { runId: 'run_01', sessionId: id, status: 'pending', createdAt: timestamp };
const run = { ...pendingRun, status: 'completed', finishedAt: timestamp + 1000 };
const agent = { agentId: 'agt_01', name: 'Agent', description: '', model: null, allowedTools: ['read'] };

describe('session schemas', () => {
  test('preserves opaque project identity and agent selection without inherited aliases', () => {
    const project = { projectId: 'pro_01', name: 'P', workspaceIds: ['ws_01'], displayPath: 'src' };
    expect(ProjectSchema.parse(project)).toEqual(project);
    expect(ProjectSchema.safeParse({ ...project, displayPath: '/host/project' }).success).toBe(false);
    expect(AgentSchema.parse(agent)).toEqual(agent);
    const configured = { ...agent, model: { providerId: 'provider_1', modelId: 'model_1' }, systemPromptOverride: 'Review only.', permissionPresetId: 'preset_readonly' };
    expect(AgentSchema.parse(configured)).toEqual(configured);
    expect(AgentSchema.safeParse({ ...configured, permissionPresetId: '' }).success).toBe(false);
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

  test('outer run terminal status does not represent tool denial or an inner approval wait', () => {
    expect(RunSchema.parse(pendingRun)).toEqual(pendingRun);
    expect(RunSchema.parse(run)).toEqual(run);
    const running = { ...pendingRun, status: 'running' };
    expect(RunSchema.parse(running)).toEqual(running);
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
    expect(SessionCreateAckSchema.parse(created)).toEqual(created);
    expect(SessionDeleteRequestSchema.parse(remove)).toEqual(remove);
    expect(SessionDeleteAckSchema.parse(removed)).toEqual(removed);
    expect(SubagentSchema.parse(subagent)).toEqual(subagent);
    expect(SessionCreateRequestSchema.safeParse({ ...create, directory: '/host/project' }).success).toBe(false);
    expect(SessionCreateAckSchema.safeParse({ session: { ...session, metadataRevision: '0' } }).success).toBe(false);
    expect(SessionDeleteRequestSchema.safeParse({ ...remove, force: 'true' }).success).toBe(false);
    expect(SessionDeleteAckSchema.safeParse({ ...removed, deletedSessionIds: ['ses_02'] }).success).toBe(false);
    expect(SubagentSchema.safeParse({ ...subagent, status: 'cancelled' }).success).toBe(false);
  });

  test('run, abort, steer and follow-up preserve captured prompt and acknowledgement shapes', () => {
    const abort = { sessionId: id, runId: pendingRun.runId };
    const aborted = { run: { ...run, status: 'cancelled' } };
    const steer = { sessionId: id, request: prompt };
    const steered = { sessionId: id, runId: pendingRun.runId, acceptedAt: timestamp };
    const followUp = { sessionId: id, request: prompt };
    const followedUp = { sessionId: id, followUpId: 'fu_01', acceptedAt: timestamp };
    expect(RunCreateRequestSchema.parse(prompt)).toEqual(prompt);
    expect(RunSchema.parse(pendingRun)).toEqual(pendingRun);
    expect(RunAbortRequestSchema.parse(abort)).toEqual(abort);
    expect(RunAbortAckSchema.parse(aborted)).toEqual(aborted);
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
