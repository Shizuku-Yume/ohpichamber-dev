import { expect, test } from 'bun:test';
import { SessionSnapshotSchema } from './snapshot.ts';

const session = {
  sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: '.',
  rootSessionId: 'session_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '9007199254740993',
  runtimeStatus: 'idle', activeRunId: null,
};
const empty = {
  session, cursor: 'epoch_1:9007199254740993', activeRun: null,
  branch: { branchId: 'branch_1', branchVersion: '1', leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [],
  requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
};
const approval = {
  approvalId: 'approval_1', sessionId: 'session_1', turnId: 'older_turn', toolCallId: 'tool_1', toolName: 'bash',
  actionType: 'bash_command', commandSummary: 'Run checks', details: {}, version: '1', epoch: 'epoch_1',
  workerGeneration: 'worker_1', status: 'pending', requestedAt: 1,
};
const question = {
  questionId: 'question_1', sessionId: 'session_1', turnId: 'older_turn', prompt: 'Continue?', version: '1',
  epoch: 'epoch_1', workerGeneration: 'worker_1', status: 'pending', requestedAt: 1,
};
const turn = {
  turnId: 'turn_1', runId: 'run_1', sessionId: 'session_1', status: 'completed', userMessageId: 'message_1',
  assistantMessageIds: [], startedAt: 1, finishedAt: 2,
};
const message = { messageId: 'message_1', sessionId: 'session_1', turnId: 'turn_1', role: 'user', createdAt: 1, parts: [] };
const active = {
  ...empty,
  session: { ...session, runtimeStatus: 'running', activeRunId: 'run_1' },
  activeRun: { runId: 'run_1', sessionId: 'session_1', status: 'running', createdAt: 1 },
  branch: { ...empty.branch, leafMessageId: 'message_1' },
  window: { firstTurnId: 'turn_1', lastTurnId: 'turn_1', firstMessageId: 'message_1', lastMessageId: 'message_1', hasEarlier: true },
  turns: [turn], messages: [message], approvals: [approval], questions: [question],
};

test('snapshot captures exact uint64 cursor, empty bounds and no independent Host state', () => {
  expect(SessionSnapshotSchema.parse(empty)).toEqual(empty);
  for (const invalid of [
    { ...empty, cursor: 'epoch_1:9007199254740992' }, { ...empty, cursor: 'epoch_2:9007199254740993' },
    { ...empty, window: { ...empty.window, firstTurnId: 'turn_1' } },
    { ...empty, window: { ...empty.window, hasEarlier: true } },
    { ...empty, branch: { ...empty.branch, leafMessageId: 'message_1' } },
    { ...empty, metadata: {} }, { ...empty, queue: [] },
    { ...empty, session: { ...session, archivedAt: 1 } },
    { ...empty, requestRecovery: { pendingSet: 'merge', priorEpochs: 'expired' } },
  ]) expect(SessionSnapshotSchema.safeParse(invalid).success).toBe(false);
});

test('outer run remains active after an inner turn completed and pending sets cover outside the window', () => {
  expect(SessionSnapshotSchema.parse(active)).toEqual(active);
  const awaitingApproval = { ...active, session: { ...active.session, runtimeStatus: 'awaiting_approval' } };
  expect(SessionSnapshotSchema.parse(awaitingApproval)).toEqual(awaitingApproval);
  for (const invalid of [
    { ...active, activeRun: null }, { ...active, activeRun: { ...active.activeRun, runId: 'other_run' } },
    { ...active, activeRun: { ...active.activeRun, sessionId: 'other_session' } },
    { ...active, activeRun: { ...active.activeRun, status: 'completed', finishedAt: 2 } },
    { ...active, session: { ...active.session, runtimeStatus: 'idle' } },
    { ...active, window: { ...active.window, lastMessageId: 'wrong_message' } },
    { ...active, branch: { ...active.branch, leafMessageId: 'wrong_leaf' } },
    { ...active, messages: [] }, { ...active, turns: [{ ...turn, sessionId: 'other_session' }] },
  ]) expect(SessionSnapshotSchema.safeParse(invalid).success).toBe(false);
});

test('pending replacement rejects stale epochs/generations, terminal records and duplicate identities', () => {
  for (const invalid of [
    { ...active, approvals: [{ ...approval, epoch: 'prior_epoch' }] },
    { ...active, questions: [{ ...question, workerGeneration: 'worker_2' }] },
    { ...active, questions: [{ ...question, sessionId: 'other_session' }] },
    { ...active, approvals: [approval, approval] }, { ...active, questions: [question, question] },
    { ...active, questions: [{ ...question, status: 'expired', version: '2', resolvedAt: 2 }] },
    { ...active, approvals: [{ ...approval, status: 'approved', version: '2', resolvedAt: 2, resolution: { decision: 'approve' } }] },
  ]) expect(SessionSnapshotSchema.safeParse(invalid).success).toBe(false);
});
