import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './primitives.ts';

export const TurnDiffFileStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed']);
export type TurnDiffFileStatus = z.infer<typeof TurnDiffFileStatusSchema>;

export const TurnDiffProvenanceAgentSchema = z.enum(['session', 'subagent']);
export type TurnDiffProvenanceAgent = z.infer<typeof TurnDiffProvenanceAgentSchema>;

export const TurnDiffFileProvenanceSchema = z.strictObject({
  tool: z.string().min(1),
  agent: TurnDiffProvenanceAgentSchema,
  subagentId: EntityIdSchema.optional(),
  at: TimestampSchema,
}).refine((provenance) => (provenance.agent === 'subagent') === (provenance.subagentId !== undefined), {
  message: 'Subagent provenance must carry exactly its canonical subagent id',
});
export type TurnDiffFileProvenance = z.infer<typeof TurnDiffFileProvenanceSchema>;

export const TurnDiffFileSchema = z.strictObject({
  path: z.string().min(1),
  status: TurnDiffFileStatusSchema,
  previousPath: z.string().min(1).optional(),
  before: z.string().nullable().optional(),
  after: z.string().nullable().optional(),
  patch: z.string().optional(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  provenance: z.array(TurnDiffFileProvenanceSchema).min(1),
  truncated: z.boolean(),
  incomplete: z.boolean(),
}).refine((file) => file.status !== 'renamed' || file.previousPath !== undefined, {
  message: 'A renamed file must carry its previous path',
  path: ['previousPath'],
}).refine((file) => file.status === 'renamed' || file.previousPath === undefined, {
  message: 'Only a renamed file carries a previous path',
  path: ['previousPath'],
}).refine((file) => !file.incomplete || (file.before === undefined && file.after === undefined && file.patch === undefined), {
  message: 'An incomplete file carries no replayed content',
}).refine((file) => !file.incomplete || (file.additions === 0 && file.deletions === 0), {
  message: 'An incomplete file reports zero line counts',
});
export type TurnDiffFile = z.infer<typeof TurnDiffFileSchema>;

export const TurnDiffStateSchema = z.enum(['ready', 'empty', 'unsupported', 'failed']);
export type TurnDiffState = z.infer<typeof TurnDiffStateSchema>;

export const TurnDiffSchema = z.strictObject({
  sessionId: EntityIdSchema,
  turnId: EntityIdSchema,
  state: TurnDiffStateSchema,
  files: z.array(TurnDiffFileSchema),
  error: z.string().min(1).optional(),
}).refine((diff) => (diff.state === 'ready') === (diff.files.length > 0), {
  message: 'Ready carries the changed files; every other state carries none',
  path: ['files'],
}).refine((diff) => (diff.state === 'failed') === (diff.error !== undefined), {
  message: 'Failed must name its detail and no other state may',
  path: ['error'],
});
export type TurnDiff = z.infer<typeof TurnDiffSchema>;
