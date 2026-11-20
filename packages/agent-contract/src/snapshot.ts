import { z } from 'zod';
import { CursorSchema, EntityIdSchema, TimestampSchema } from './primitives.ts';
import { CompactionMethodSchema, RuntimeSessionSchema, RunSchema, SessionBranchStateSchema, TodoPhaseSchema } from './session.ts';
import { ModelSelectionSchema } from './catalogs.ts';
import { MessageSchema, TurnSchema } from './messages.ts';
import { ApprovalRequestSchema, QuestionRequestSchema } from './requests.ts';

export const SessionSelectionSchema = z.strictObject({
  model: ModelSelectionSchema.nullable(),
  /** OMP's persisted configured level, including `auto`. */
  thinkingLevel: z.string().min(1).nullable(),
});
export const SessionCompactingSchema = z.strictObject({
  method: CompactionMethodSchema,
  reason: z.enum(['threshold', 'overflow', 'idle', 'incomplete']).optional(),
  startedAt: TimestampSchema,
});
export type SessionCompacting = z.infer<typeof SessionCompactingSchema>;
export const SessionSnapshotStateSchema = z.strictObject({
  /** The persisted native selection; absent readers keep the existing selection state. */
  selection: SessionSelectionSchema.optional(),
  branch: SessionBranchStateSchema,
  compacting: SessionCompactingSchema.nullable().optional(),
  todos: z.array(TodoPhaseSchema).optional(),
});
export const SessionSnapshotSchema = SessionSnapshotStateSchema.extend({
  session: RuntimeSessionSchema, cursor: CursorSchema, activeRun: RunSchema.nullable(),
  window: z.strictObject({
    firstTurnId: EntityIdSchema.nullable(), lastTurnId: EntityIdSchema.nullable(),
    firstMessageId: EntityIdSchema.nullable(), lastMessageId: EntityIdSchema.nullable(), hasEarlier: z.boolean(),
  }),
  turns: z.array(TurnSchema), messages: z.array(MessageSchema),
  approvals: z.array(ApprovalRequestSchema), questions: z.array(QuestionRequestSchema),
  requestRecovery: z.strictObject({ pendingSet: z.literal('replace'), priorEpochs: z.literal('expired') }),
}).superRefine((snapshot, context) => {
  const { session, window, activeRun } = snapshot;
  if (snapshot.cursor !== `${session.epoch}:${session.headSequence}`) {
    context.addIssue({ code: 'custom', message: 'Snapshot cursor must match the captured session head', path: ['cursor'] });
  }
  if (activeRun === null ? session.activeRunId !== null : (
    activeRun.runId !== session.activeRunId || activeRun.sessionId !== session.sessionId
    || (activeRun.status !== 'pending' && activeRun.status !== 'running')
  )) {
    context.addIssue({ code: 'custom', message: 'Snapshot active run must match live outer-run identity', path: ['activeRun'] });
  }
  const firstTurn = snapshot.turns[0]?.turnId ?? null;
  const lastTurn = snapshot.turns.at(-1)?.turnId ?? null;
  const firstMessage = snapshot.messages[0]?.messageId ?? null;
  const lastMessage = snapshot.messages.at(-1)?.messageId ?? null;
  if (window.firstTurnId !== firstTurn || window.lastTurnId !== lastTurn
    || window.firstMessageId !== firstMessage || window.lastMessageId !== lastMessage
    // A turn opens before its first step message exists (a run OMP starts itself
    // opens a turn, the agent's first message follows), and a turn can stand
    // without a user row of its own, so turns may be empty of messages; messages
    // never exist without the turn that owns them.
    || (snapshot.messages.length > 0 && snapshot.turns.length === 0)
    || (snapshot.turns.length === 0 && (window.hasEarlier || snapshot.branch.leafMessageId !== null))
    || (snapshot.messages.length > 0 && snapshot.branch.leafMessageId !== lastMessage)) {
    context.addIssue({ code: 'custom', message: 'Snapshot window must describe its inclusive history bounds and branch leaf', path: ['window'] });
  }
  if (snapshot.turns.some((turn) => turn.sessionId !== session.sessionId)
    || snapshot.messages.some((message) => message.sessionId !== session.sessionId)) {
    context.addIssue({ code: 'custom', message: 'Snapshot history must belong to the captured session' });
  }
  let generation: string | undefined;
  const pendingIds = new Set<string>();
  for (let index = 0; index < snapshot.approvals.length + snapshot.questions.length; index += 1) {
    const request = index < snapshot.approvals.length ? snapshot.approvals[index] : snapshot.questions[index - snapshot.approvals.length];
    if (request === undefined) break;
    const id = 'approvalId' in request ? `approval:${request.approvalId}` : `question:${request.questionId}`;
    if (request.sessionId !== session.sessionId || request.epoch !== session.epoch || request.status !== 'pending'
      || (generation !== undefined && generation !== request.workerGeneration) || pendingIds.has(id)) {
      context.addIssue({ code: 'custom', message: 'Snapshot pending replacement must contain unique current-session, same-generation pending requests' });
      break;
    }
    generation = request.workerGeneration;
    pendingIds.add(id);
  }
});
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;
