import { CanonicalEventSchema, MessageSchema, SessionSnapshotSchema, TimestampSchema, TurnSchema } from '@openchamber/agent-contract';
import { z } from 'zod';

// Preserve each tuple member's payload type; Array.map widens away its fields.
const envelope = { sessionId: true, epoch: true, sequence: true, timestamp: true } as const;
// Envelope-dependent checks run after the journal stamps the canonical event.
const payloadFields = z.strictObject({});
const ProjectionEventSchema = z.union([
  payloadFields.merge(CanonicalEventSchema.options[0]).omit(envelope),
  CanonicalEventSchema.options[1].omit(envelope),
  payloadFields.merge(CanonicalEventSchema.options[2]).omit(envelope),
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
]);
export type ProjectionEvent = z.infer<typeof ProjectionEventSchema>;
export const ProjectionInputSchema = z.strictObject({
  timestamp: TimestampSchema,
  event: ProjectionEventSchema,
});
export type ProjectionInput = z.infer<typeof ProjectionInputSchema>;

export const ProjectionSeedSchema = payloadFields.merge(SessionSnapshotSchema).pick({ branch: true }).extend({
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  turns: z.array(TurnSchema),
  messages: z.array(MessageSchema),
});
export type ProjectionSeed = z.infer<typeof ProjectionSeedSchema>;
