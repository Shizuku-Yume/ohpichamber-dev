import { AdvisorYieldedEventSchema, CanonicalEventSchema, CleanseProgressEventSchema, MessageSchema, SessionRecapEventSchema, SessionSuggestionEventSchema, SessionModeSchema, SessionSnapshotStateSchema, SessionUpdatedPayloadSchema, SessionStatusPayloadSchema, SubagentUpdatedEventSchema, TimestampSchema, TurnSchema } from '@openchamber/agent-contract';
import { z } from 'zod';

// Preserve each tuple member's payload type; Array.map widens away its fields.
const envelope = { sessionId: true, epoch: true, sequence: true, timestamp: true } as const;
const ProjectionEventSchema = z.union([
  SessionUpdatedPayloadSchema,
  CanonicalEventSchema.options[1].omit(envelope),
  SessionStatusPayloadSchema,
  CanonicalEventSchema.options[3].omit(envelope),
  CanonicalEventSchema.options[4].omit(envelope),
  CanonicalEventSchema.options[5].omit(envelope),
  CanonicalEventSchema.options[6].omit(envelope),
  CanonicalEventSchema.options[7].omit(envelope),
  CanonicalEventSchema.options[8].omit(envelope),
  CanonicalEventSchema.options[9].omit(envelope),
  CanonicalEventSchema.options[10].omit(envelope),
  CanonicalEventSchema.options[11].omit(envelope),
  CanonicalEventSchema.options[12].omit(envelope),
  CanonicalEventSchema.options[13].omit(envelope),
  CanonicalEventSchema.options[14].omit(envelope),
  CanonicalEventSchema.options[15].omit(envelope),
  CanonicalEventSchema.options[16].omit(envelope),
  CanonicalEventSchema.options[17].omit(envelope),
  CanonicalEventSchema.options[18].omit(envelope),
  CanonicalEventSchema.options[19].omit(envelope),
  CanonicalEventSchema.options[20].omit(envelope),
  CanonicalEventSchema.options[21].omit(envelope),
  CanonicalEventSchema.options[22].omit(envelope),
  CanonicalEventSchema.options[23].omit(envelope),
  CanonicalEventSchema.options[24].omit(envelope),
  CanonicalEventSchema.options[25].omit(envelope),
  CanonicalEventSchema.options[26].omit(envelope),
  SubagentUpdatedEventSchema.omit(envelope),
  SessionRecapEventSchema.omit(envelope),
  SessionSuggestionEventSchema.omit(envelope),
  AdvisorYieldedEventSchema.omit(envelope),
  CleanseProgressEventSchema.omit(envelope),
]);
export type ProjectionEvent = z.infer<typeof ProjectionEventSchema>;
export const ProjectionInputSchema = z.strictObject({
  timestamp: TimestampSchema,
  event: ProjectionEventSchema,
  transient: z.boolean().optional(),
});
export type ProjectionInput = z.infer<typeof ProjectionInputSchema>;

export const ProjectionSeedSchema = SessionSnapshotStateSchema.extend({
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  turns: z.array(TurnSchema),
  messages: z.array(MessageSchema),
  mode: SessionModeSchema,
  title: z.string().min(1).optional(),
});
export type ProjectionSeed = z.infer<typeof ProjectionSeedSchema>;
