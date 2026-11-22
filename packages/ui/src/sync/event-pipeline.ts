import type { CanonicalEvent, SessionRuntimeStatus, SessionSnapshot } from "@openchamber/agent-contract"
import type { CanonicalClient } from "@/api/canonicalClient"
import type { SessionMessageTarget } from "./session-message-loader"

const FLUSH_FRAME_MS = 33
const RETRY_BACKOFF_BASE_MS = 250
const RETRY_BACKOFF_CAP_VISIBLE_MS = 5_000
const RETRY_BACKOFF_CAP_BACKGROUND_MS = 60_000

type SessionStream = {
  target: SessionMessageTarget
  cleanup: (() => void) | null
  timer: number | NodeJS.Timeout | undefined
  flushTimer: number | NodeJS.Timeout | undefined
  pending: CanonicalEvent[]
  generation: number
  failures: number
  lastFlushAt: number
  recovering: boolean
  disconnected: boolean
}

export type EventPipelineInput = {
  client: CanonicalClient
  isCurrent: () => boolean
  onEvents: (target: SessionMessageTarget, events: readonly CanonicalEvent[]) => boolean
  recover: (target: SessionMessageTarget) => Promise<void>
  onDisconnect?: (target: SessionMessageTarget, error?: unknown) => void
}

export type EventPipelineAttachTarget = {
  cursor: string
  session: { sessionId: string; runtimeStatus: SessionRuntimeStatus }
}

export type EventPipeline = {
  attach: (target: SessionMessageTarget, snapshot: SessionSnapshot | EventPipelineAttachTarget) => void
  invalidate: (target: SessionMessageTarget) => void
  detach: (target: SessionMessageTarget) => void
  has: (target: SessionMessageTarget) => boolean
  clearDirectory: (directory: string) => void
  reconnect: () => void
  cleanup: () => void
}

/** One session stream and one recovery owner; no event translation or SDK transport. */
export function createEventPipeline(input: EventPipelineInput): EventPipeline {
  const streams = new Map<string, SessionStream>()
  let disposed = false
  const key = (target: SessionMessageTarget) => `${target.directory}\n${target.sessionId}`
  const current = (stream: SessionStream) => !disposed && input.isCurrent() && streams.get(key(stream.target)) === stream

  const disconnect = (stream: SessionStream) => {
    stream.generation += 1
    stream.cleanup?.()
    stream.cleanup = null
    stream.recovering = false
    clearTimeout(stream.flushTimer)
    stream.flushTimer = undefined
    stream.pending = []
  }

  const scheduleRecovery = (stream: SessionStream, error?: unknown, immediate = false) => {
    if (!current(stream) || stream.recovering) return
    disconnect(stream)
    if (!stream.disconnected) {
      stream.disconnected = true
      input.onDisconnect?.(stream.target, error)
    }
    if (stream.timer !== undefined) return
    const offline = typeof navigator !== "undefined" && navigator.onLine === false
    const background = typeof document !== "undefined" && document.visibilityState !== "visible"
    const problemValue = typeof error === "object" && error !== null && "problem" in error ? error.problem : undefined
    const problem = typeof problemValue === "object" && problemValue !== null && "status" in problemValue && "code" in problemValue ? problemValue : undefined
    const statusValue = problem?.status
    const status = typeof statusValue === "number" ? statusValue : undefined
    const code = problem?.code
    const permanent = status !== undefined && status >= 400 && status < 500
      && status !== 408 && status !== 429 && code !== "RESYNC_REQUIRED"
    const cap = background || offline ? RETRY_BACKOFF_CAP_BACKGROUND_MS : RETRY_BACKOFF_CAP_VISIBLE_MS
    const delay = immediate ? 0 : offline || permanent ? RETRY_BACKOFF_CAP_BACKGROUND_MS
      : Math.min(cap, RETRY_BACKOFF_BASE_MS * 2 ** Math.min(stream.failures++, 8))
    stream.timer = setTimeout(() => {
      stream.timer = undefined
      if (!current(stream)) return
      stream.recovering = true
      const generation = stream.generation
      void input.recover(stream.target).then(() => {
        if (stream.generation !== generation || !current(stream)) return
        stream.recovering = false
        if (!stream.cleanup) scheduleRecovery(stream)
      }, (cause: unknown) => {
        if (stream.generation !== generation || !current(stream)) return
        stream.recovering = false
        scheduleRecovery(stream, cause)
      })
    }, delay)
  }

  const flush = (stream: SessionStream) => {
    stream.flushTimer = undefined
    if (!current(stream) || !stream.pending.length) return
    const events = stream.pending
    stream.pending = []
    stream.lastFlushAt = Date.now()
    if (!input.onEvents(stream.target, events)) scheduleRecovery(stream)
    else stream.failures = 0
  }

  const attach = (target: SessionMessageTarget, snapshot: SessionSnapshot | EventPipelineAttachTarget) => {
    if (disposed || !input.isCurrent() || target.sessionId !== snapshot.session.sessionId) return
    // A cold snapshot has no worker-owned stream; subscribing would 404 and
    // start no worker. The next snapshot after a mutation re-attaches.
    if (snapshot.session.runtimeStatus === 'unavailable') return
    for (const existing of streams.values()) {
      if (existing.target.sessionId === target.sessionId && existing.target.directory !== target.directory) remove(existing)
    }
    let stream = streams.get(key(target))
    if (!stream) {
      stream = { target, cleanup: null, timer: undefined, flushTimer: undefined, pending: [], generation: 0, failures: 0, lastFlushAt: 0, recovering: false, disconnected: false }
      streams.set(key(target), stream)
    }
    disconnect(stream)
    clearTimeout(stream.timer)
    stream.timer = undefined
    const owner = stream
    owner.recovering = false
    owner.disconnected = false
    const generation = owner.generation
    const valid = () => current(owner) && owner.generation === generation
    // Snapshot cursor is returned by the Host; pagination cursors never enter SSE.
    try {
      const cleanup = input.client.subscribeSessionEvents(target.sessionId, snapshot.cursor, (event) => {
        if (!valid()) return
        if (event.sessionId !== target.sessionId) { scheduleRecovery(owner); return }
        owner.pending.push(event)
        const remaining = FLUSH_FRAME_MS - (Date.now() - owner.lastFlushAt)
        if (remaining <= 0) flush(owner)
        else if (owner.flushTimer === undefined) owner.flushTimer = setTimeout(() => flush(owner), remaining)
      }, () => {
        if (valid()) scheduleRecovery(owner)
      }, (error) => {
        if (valid()) scheduleRecovery(owner, error)
      })
      if (valid()) owner.cleanup = cleanup
      else cleanup()
    } catch (error) {
      if (valid()) scheduleRecovery(owner, error)
    }
  }

  const remove = (stream: SessionStream) => {
    disconnect(stream)
    clearTimeout(stream.timer)
    stream.timer = undefined
    streams.delete(key(stream.target))
  }

  return {
    attach,
    invalidate(target) { const stream = streams.get(key(target)); if (stream) scheduleRecovery(stream) },
    detach(target) { const stream = streams.get(key(target)); if (stream) remove(stream) },
    has(target) { return streams.has(key(target)) },
    clearDirectory(directory) { for (const stream of streams.values()) if (stream.target.directory === directory) remove(stream) },
    reconnect() {
      for (const stream of streams.values()) {
        if (stream.timer === undefined && !stream.disconnected) continue
        clearTimeout(stream.timer)
        stream.timer = undefined
        scheduleRecovery(stream, undefined, true)
      }
    },
    cleanup() { disposed = true; for (const stream of streams.values()) remove(stream) },
  }
}
