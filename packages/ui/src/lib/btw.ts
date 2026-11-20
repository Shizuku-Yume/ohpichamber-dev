/**
 * Composer identity of a pending native `/btw` question.
 *
 * The question's text stays in memory until it receives an ephemeral record or is
 * discarded; persisted under this key it would leak into the next `/btw` for
 * the same parent. This module exists so draft persistence can recognise it
 * without pulling in the ephemeral execution flow.
 */
export const isBtwPendingComposerKey = (sessionId: string | null | undefined): boolean =>
    Boolean(sessionId?.startsWith('btw-pending:'));

export const btwPendingComposerKey = (parentSessionId: string): string => `btw-pending:${parentSessionId}`;
