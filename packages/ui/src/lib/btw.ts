/**
 * Composer identity of a `/btw` fork while it is still being created.
 *
 * The fork's text stays in memory until it migrates to the real session or is
 * discarded; persisted under this key it would leak into the next `/btw` for
 * the same parent. This module exists so draft persistence can recognise it
 * without pulling in the whole fork flow.
 */
export const btwPendingComposerKey = (parentSessionId: string): string => `btw-pending:${parentSessionId}`;

export const isBtwPendingComposerKey = (sessionId: string | null | undefined): boolean =>
    Boolean(sessionId?.startsWith('btw-pending:'));
