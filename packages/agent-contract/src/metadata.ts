import { z } from 'zod';
import { CounterSchema, EntityIdSchema, JsonValueSchema, TimestampSchema } from './primitives.ts';

const countSchema = z.number().int().nonnegative();
const goalFields = {
  id: EntityIdSchema.optional(), objective: z.string().optional(), objectiveFile: z.boolean().optional(),
  status: z.enum(['active', 'paused', 'blocked', 'budgetLimited', 'complete']).optional(),
  tokenBudget: z.number().int().positive().nullable().optional(),
  tokensUsed: countSchema.optional(), tokensBaseline: countSchema.optional(), tokensCommitted: countSchema.optional(),
  turnsUsed: countSchema.optional(), blockedStreak: countSchema.optional(), auditFailStreak: countSchema.optional(),
  note: z.string().optional(), statusReason: z.string().optional(),
  evaluationProviderID: z.string().optional(), evaluationModelID: z.string().optional(),
  lastAccountedMessageID: z.string().optional(), createdAt: TimestampSchema.optional(), updatedAt: TimestampSchema.optional(),
};
const goalSchema = z.strictObject(goalFields);
const assistFields = {
  recap: z.string(), suggestion: z.string(), forMessageID: EntityIdSchema, generatedAt: TimestampSchema,
};
const assistSchema = z.strictObject(assistFields);
const contextMessageSchema = z.strictObject({ id: EntityIdSchema, createdAt: TimestampSchema, role: z.enum(['user', 'assistant']) });
const pinsFields = { notes: z.array(EntityIdSchema).optional(), plans: z.array(EntityIdSchema).optional() };
const pinsSchema = z.strictObject(pinsFields);
const workFields = {
  state: z.enum(['open', 'done']).optional(), openedAt: TimestampSchema.optional(), openedBy: z.enum(['jev', 'user']).optional(),
  doneAt: TimestampSchema.nullable().optional(), suggestDoneAt: TimestampSchema.nullable().optional(),
};
const workSchema = z.strictObject(workFields);
const reviewOfferFields = { at: TimestampSchema };
const reviewOfferSchema = z.strictObject(reviewOfferFields);
const linkedItemFields = { id: EntityIdSchema, title: z.string(), url: z.string(), linkedAt: TimestampSchema };
const linkedAuthorFields = { author: z.string().optional(), authorAvatarUrl: z.string().optional() };
const linkedIssueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...linkedItemFields, ...linkedAuthorFields, kind: z.literal('issue'), number: z.number().int().positive() }),
  z.strictObject({ ...linkedItemFields, ...linkedAuthorFields, kind: z.literal('pull'), number: z.number().int().positive() }),
  z.strictObject({ ...linkedItemFields, ...linkedAuthorFields, kind: z.literal('linear'), identifier: EntityIdSchema }),
  z.strictObject({
    ...linkedItemFields, kind: z.literal('guest'), providerId: EntityIdSchema, identifier: EntityIdSchema,
    thread: z.enum(['issue', 'pull']).optional(), author: z.string().optional(), head: z.string().optional(),
    base: z.string().optional(), data: JsonValueSchema.optional(),
  }),
  z.strictObject({ ...linkedItemFields, kind: z.literal('external'), thread: z.enum(['issue', 'change']), identifier: EntityIdSchema }),
]);
const multirunSchema = z.strictObject({
  version: z.literal(1), sessionID: EntityIdSchema.nullable(),
  group: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('id'), id: z.uuid() }),
    z.strictObject({ kind: z.literal('legacy'), scope: EntityIdSchema.refine(
      (scope) => !scope.startsWith('/') && !scope.startsWith('\\') && !/^[A-Za-z]:/.test(scope),
      { message: 'Legacy multi-run scope must be an opaque public identity' },
    ) }),
  ]),
  groupSlug: EntityIdSchema, runGroup: z.string().regex(/^g[1-9]\d*$/).optional(),
  providerID: EntityIdSchema, modelID: EntityIdSchema, index: z.number().int().positive().optional(),
  role: z.enum(['run', 'fusion']), title: z.string().min(1).max(200).optional(),
  autoFusion: z.strictObject({
    providerID: EntityIdSchema, modelID: EntityIdSchema, variant: EntityIdSchema.optional(),
    agent: EntityIdSchema.optional(), launcherId: EntityIdSchema,
  }).optional(),
}).refine((membership) => membership.group.kind !== 'legacy' || membership.role === 'fusion', {
  message: 'Legacy multi-run membership is fusion-only', path: ['role'],
});
const operationalSchema = z.strictObject({
  goal: goalSchema.optional(), assist: assistSchema.optional(),
  knowledge_context_delivered: z.string().optional(), context_obligatory_last_compaction_message_id: EntityIdSchema.optional(),
  project_context_pins: pinsSchema.optional(), context_obligatory_messages: z.array(contextMessageSchema).optional(),
  linked_issues: z.array(linkedIssueSchema).optional(), work: workSchema.optional(), reviewOffer: reviewOfferSchema.optional(),
  btwSessionID: EntityIdSchema.optional(), reviewSessionID: EntityIdSchema.optional(), btwPromoted: z.boolean().optional(), kind: z.enum(['btw', 'review']).optional(),
  originalSessionID: EntityIdSchema.optional(), btwBoundaryMessageID: EntityIdSchema.optional(), multirun: multirunSchema.optional(),
});
export const SessionMetadataSchema = z.strictObject({
  title: z.string().optional(), folder: z.string().optional(), isPinned: z.boolean().optional(),
  color: z.string().optional(), icon: z.string().optional(), notes: z.string().optional(), openchamber: operationalSchema.optional(),
});
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;
export const SessionMetadataStateSchema = z.strictObject({
  sessionId: EntityIdSchema, revision: CounterSchema, metadata: SessionMetadataSchema.nullable(),
}).refine((state) => (state.metadata === null) === (state.revision === '0'), {
  message: 'Confirmed missing metadata has null data and revision 0', path: ['metadata'],
});
export type SessionMetadataState = z.infer<typeof SessionMetadataStateSchema>;
export const SessionMetadataPatchSchema = z.strictObject({ changes: z.strictObject({
  title: z.string().nullable().optional(), folder: z.string().nullable().optional(), isPinned: z.boolean().nullable().optional(),
  color: z.string().nullable().optional(), icon: z.string().nullable().optional(), notes: z.string().nullable().optional(),
  openchamber: z.strictObject({
    goal: z.strictObject({
      id: goalFields.id.nullable(), objective: goalFields.objective.nullable(), objectiveFile: goalFields.objectiveFile.nullable(),
      status: goalFields.status.nullable(), tokenBudget: goalFields.tokenBudget,
      tokensUsed: goalFields.tokensUsed.nullable(), tokensBaseline: goalFields.tokensBaseline.nullable(),
      tokensCommitted: goalFields.tokensCommitted.nullable(), turnsUsed: goalFields.turnsUsed.nullable(),
      blockedStreak: goalFields.blockedStreak.nullable(), auditFailStreak: goalFields.auditFailStreak.nullable(),
      note: goalFields.note.nullable(), statusReason: goalFields.statusReason.nullable(),
      evaluationProviderID: goalFields.evaluationProviderID.nullable(), evaluationModelID: goalFields.evaluationModelID.nullable(),
      lastAccountedMessageID: goalFields.lastAccountedMessageID.nullable(),
      createdAt: goalFields.createdAt.nullable(), updatedAt: goalFields.updatedAt.nullable(),
    }).nullable().optional(),
    assist: z.strictObject({
      recap: assistFields.recap.nullable().optional(), suggestion: assistFields.suggestion.nullable().optional(),
      forMessageID: assistFields.forMessageID.nullable().optional(), generatedAt: assistFields.generatedAt.nullable().optional(),
    }).nullable().optional(),
    knowledge_context_delivered: z.string().nullable().optional(),
    context_obligatory_last_compaction_message_id: EntityIdSchema.nullable().optional(),
    project_context_pins: z.strictObject({ notes: pinsFields.notes.nullable(), plans: pinsFields.plans.nullable() }).nullable().optional(),
    context_obligatory_messages: z.array(contextMessageSchema).nullable().optional(),
    linked_issues: z.array(linkedIssueSchema).nullable().optional(),
    work: workSchema.extend({
      state: workFields.state.nullable(), openedAt: workFields.openedAt.nullable(), openedBy: workFields.openedBy.nullable(),
    }).nullable().optional(),
    reviewOffer: z.strictObject({ at: reviewOfferFields.at.nullable().optional() }).nullable().optional(),
    btwSessionID: EntityIdSchema.nullable().optional(),
    reviewSessionID: EntityIdSchema.nullable().optional(), btwPromoted: z.boolean().nullable().optional(), kind: z.enum(['btw', 'review']).nullable().optional(),
    originalSessionID: EntityIdSchema.nullable().optional(), btwBoundaryMessageID: EntityIdSchema.nullable().optional(),
    multirun: multirunSchema.nullable().optional(),
  }).nullable().optional(),
}) });
export type SessionMetadataPatch = z.infer<typeof SessionMetadataPatchSchema>;
