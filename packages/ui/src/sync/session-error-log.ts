/**
 * Recent canonical session errors, kept in memory for diagnostics.
 * Canonical run failures carry a string. Transport diagnostics may additionally
 * supply structured detail; these are never treated as canonical event payloads.
 */

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
  return { name, message: message ? message.slice(0, MAX_MESSAGE_LENGTH) : null }
}

/** Return the optional provider response detail without retaining it in records. */
export function responseBodyOf(error: unknown): string | null {
  const detail = asErrorDetail(error)
  const body = typeof detail?.response?.body === "string" ? detail.response.body.trim() : ""
  return body ? body.slice(0, MAX_RESPONSE_BODY_LENGTH) : null
}

const records: SessionErrorRecord[] = []

export function recordSessionError(record: Omit<SessionErrorRecord, 'at'>): void {
  records.push({ ...record, at: Date.now() })
  if (records.length > MAX_RECORDED_SESSION_ERRORS) {
    records.splice(0, records.length - MAX_RECORDED_SESSION_ERRORS)
  }
}

/** Newest first. */
export function getRecentSessionErrors(): SessionErrorRecord[] {
  return [...records].reverse()
}
