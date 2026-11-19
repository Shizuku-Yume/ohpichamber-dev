/**
 * A composer draft that has not been materialized yet carries a local
 * `draft_<draftId>` identity. No Host authority exists for it, so every caller
 * that addresses a native session (snapshot, metadata, queue, events,
 * subagents, cache warming) must recognize it instead of asking the Host.
 */
export const isDraftSessionId = (sessionId: string | null | undefined): boolean =>
  sessionId?.startsWith("draft_") === true;
