import { z } from 'zod';
import { EntityIdSchema } from './primitives.ts';
import { SessionSchema, SessionBranchStateSchema } from './session.ts';
import { MessageSchema, TurnSchema } from './messages.ts';
import { ModelSchema } from './catalogs.ts';

export const PaginationCursorSchema = z.string().min(1);
export type PaginationCursor = z.infer<typeof PaginationCursorSchema>;
export const SessionsPageSchema = z.strictObject({ items: z.array(SessionSchema), nextCursor: PaginationCursorSchema.nullable() });
export type SessionsPage = z.infer<typeof SessionsPageSchema>;
export const HistoryPageRequestSchema = z.strictObject({
  sessionId: EntityIdSchema, leafTurnId: EntityIdSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(), cursor: PaginationCursorSchema.optional(),
});
export type HistoryPageRequest = z.infer<typeof HistoryPageRequestSchema>;
export const HistoryPageSchema = z.strictObject({
  sessionId: EntityIdSchema,
  branch: SessionBranchStateSchema,
  turns: z.array(TurnSchema), messages: z.array(MessageSchema), nextCursor: PaginationCursorSchema.nullable(),
}).refine((page) => page.turns.every((turn) => turn.sessionId === page.sessionId)
  && page.messages.every((message) => message.sessionId === page.sessionId), {
  message: 'History page records must belong to the addressed session',
});
export type HistoryPage = z.infer<typeof HistoryPageSchema>;
export const ModelsPageSchema = z.strictObject({ items: z.array(ModelSchema), nextCursor: PaginationCursorSchema.nullable() });
export type ModelsPage = z.infer<typeof ModelsPageSchema>;
