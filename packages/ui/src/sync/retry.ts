import { CanonicalApiError } from "@/api/canonicalClient"

export interface RetryOptions {
  attempts?: number
  delay?: number
  factor?: number
  maxDelay?: number
  retryIf?: (error: unknown) => boolean
}

/**
 * Startup budget for Host/Agent Service warmup.
 *
 * The Host becomes reachable before its Agent Service is ready, and readiness
 * has been observed taking roughly 25 seconds. Each attempt still stops
 * immediately for a non-retryable ProblemDetails or a stale runtime scope;
 * only transient failures consume this bounded budget (~39 seconds of waits).
 */
export const STARTUP_RETRY: RetryOptions = {
  attempts: 8,
  delay: 1000,
  factor: 2,
  maxDelay: 8000,
}

// Half-open streams and bounded read timeouts are transient during Host warmup.
const TRANSIENT_MESSAGES = [
  "transport failure",
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
  "agent service unavailable",
  "503",
  "502",
  "terminated",
  "request timed out",
]

function isRetryableError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof CanonicalApiError) return error.problem.retryable
  // The transport reports a caller's abort as a transport failure too.
  if (error instanceof Error && error.cause instanceof DOMException && error.cause.name === "AbortError") return false
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  if (TRANSIENT_MESSAGES.some((m) => message.includes(m))) return true
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined
  if (status === 408 || status === 429) return true
  return status !== undefined && status >= 500 && status < 600
}

/** Environment-phase failure tagged with its reconnect-recovery policy. */
export class BootstrapFailureError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = "BootstrapFailureError"
  }
}

/**
 * Whether a failed directory initialization should be requeued on a recovery
 * signal. Canonical 4xx/`retryable: false` failures are permanent until the
 * caller changes something; network, 408/429/5xx and unknown failures get one
 * bounded recovery attempt per signal. The scheduler's state/queue guards make
 * repeated calls idempotent.
 */
export function isRetryableBootstrapError(error: unknown): boolean {
  if (error instanceof BootstrapFailureError) return error.retryable
  if (error instanceof CanonicalApiError) return error.problem.retryable
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined
  if (status === undefined) return true
  if (status === 408 || status === 429) return true
  if (status >= 500 && status < 600) return true
  if (status >= 400 && status < 500) return false
  // An unclassified initialization failure is more likely a transient warmup
  // fault than a permanent one; recovery is still bounded to one attempt per
  // connection signal.
  return true
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isRetryableError,
  } = options

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1 || !retryIf(error)) throw error
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}
