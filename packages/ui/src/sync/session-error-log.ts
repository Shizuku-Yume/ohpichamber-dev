<<<<<<< HEAD
/**
 * Recent canonical session errors, kept in memory for diagnostics.
 * Canonical run failures carry a string. Transport diagnostics may additionally
 * supply structured detail; these are never treated as canonical event payloads.
 */
||||||| bc50ba56aa
/**
 * Recent OpenCode session errors, kept in memory for diagnostics.
 *
 * OpenCode reports a failed turn as a `session.error` event. The message it
 * carries is the only account of what went wrong, and it may arrive without
 * an assistant message to attach itself to, so a turn can end with nothing
 * on screen. This buffer keeps the last errors until someone asks for them,
 * via `__opencodeDebug`; the diagnostic timeline exports only the event type,
 * not the raw error message. In-memory
 * only: never persisted, never sent anywhere, dropped on reload.
 */
=======
>>>>>>> upstream/main

type NativeErrorDetail = {
  type?: string;
  message?: string;
  response?: { body?: string };
};

const asErrorDetail = (error: unknown): NativeErrorDetail | null => {
  if (!error || typeof error !== "object") return null;
  return error as NativeErrorDetail;
};

const MAX_RECORDED_SESSION_ERRORS = 20
const MAX_MESSAGE_LENGTH = 400
const MAX_RESPONSE_BODY_LENGTH = 16_000

export type SessionErrorSummary = {
  name: string | null
  message: string | null
}

export type SessionErrorRecord = SessionErrorSummary & {
  at: number
  sessionId: string
  directory: string | null
}

<<<<<<< HEAD
/** Summarize canonical failure text or independently supplied transport detail. */
export function summarizeSessionError(error: unknown): SessionErrorSummary {
  if (typeof error === 'string') {
    const message = error.trim();
    return { name: null, message: message ? message.slice(0, MAX_MESSAGE_LENGTH) : null };
  }
  const detail = asErrorDetail(error)
  if (!detail) return { name: null, message: null }
  const rawName = typeof detail.type === "string" ? detail.type : ""
  const rawMessage = typeof detail.message === "string" ? detail.message : ""
  const name = rawName.trim() ? rawName.trim() : null
  const message = rawMessage.trim()
||||||| bc50ba56aa
/**
 * OpenCode v2 reports a failed turn as `{ type, message }`. The record keeps
 * both: `type` names the failure class the server recognised, `message` is the
 * text worth showing. Returns nulls when neither is usable, so a caller can
 * tell "no details" from a real message.
 */
export function summarizeOpenCodeError(error: StructuredError | null | undefined): OpenCodeErrorSummary {
  if (!error) return { name: null, message: null }
  const name = error.type.trim() ? error.type.trim() : null
  const message = error.message.trim()
=======
export function summarizeOpenCodeError(error: StructuredError | null | undefined): OpenCodeErrorSummary {
  if (!error) return { name: null, message: null }
  const name = error.type.trim() ? error.type.trim() : null
  const message = error.message.trim()
>>>>>>> upstream/main
  return { name, message: message ? message.slice(0, MAX_MESSAGE_LENGTH) : null }
}

<<<<<<< HEAD
/** Return the optional provider response detail without retaining it in records. */
export function responseBodyOf(error: unknown): string | null {
  const detail = asErrorDetail(error)
  const body = typeof detail?.response?.body === "string" ? detail.response.body.trim() : ""
||||||| bc50ba56aa
/**
 * The provider's raw response body behind the error (OpenCode 2.0.20+), for
 * the details a person can expand under the notice. Kept out of the
 * diagnostics records: a body may echo request content.
 */
export function responseBodyOf(error: StructuredError | null | undefined): string | null {
  const body = error?.response?.body.trim()
=======
export function responseBodyOf(error: StructuredError | null | undefined): string | null {
  const body = error?.response?.body.trim()
>>>>>>> upstream/main
  return body ? body.slice(0, MAX_RESPONSE_BODY_LENGTH) : null
}

const records: SessionErrorRecord[] = []

export function recordSessionError(record: Omit<SessionErrorRecord, 'at'>): void {
  records.push({ ...record, at: Date.now() })
  if (records.length > MAX_RECORDED_SESSION_ERRORS) {
    records.splice(0, records.length - MAX_RECORDED_SESSION_ERRORS)
  }
}

export function getRecentSessionErrors(): SessionErrorRecord[] {
  return [...records].reverse()
}
