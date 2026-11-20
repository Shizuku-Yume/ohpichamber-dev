// Results of sessions an agent dispatched and asked to hear back from.
//
// An agent that creates, sends to, or forks a session with `returnResult`
// gets its answer at once and goes on. When the dispatched session's turn is
// over, this runtime hands its final answer to the session that dispatched it
// as a synthetic message and wakes that session, so the agent continues on its
// own: background primary sessions, the way OpenCode 2 reports a background
// subagent to its parent (core `session/subagent-completion.ts`).
//
// Event-driven: the Host event hub supplies canonical envelopes directly.
// Pending deliveries are persisted so a restart still delivers them.

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

export const createMessageId = () => `msg_${randomUUID()}`;

const FILE_NAME = 'dispatch-results.json';
const FILE_VERSION = 1;
const MAX_ENTRIES = 200;
// Idle events arrive in bursts around a turn boundary.
const QUIET_MS = 500;
// While a subagent of the dispatched session runs, the turn is not over yet.
const SUBAGENT_RECHECK_MS = 5_000;
// An idle session without the run's `idle` record yet: the record lands with
// the event, so a few short rechecks cover a projection that trails it.
const SETTLE_RECHECK_MS = 2_000;
const SETTLE_RECHECKS = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const MESSAGE_PAGE_LIMIT = 50;
// The answer travels into the parent's context; a session that wrote a book
// is cut, and the agent can read the rest with session.messages.
const ANSWER_CHAR_LIMIT = 50_000;

const DISPATCH_RESULT_SOURCE = 'openchamber-session';

// Boundary schemas: the only place raw JSON (the file, OpenCode answers, hub
// events) is inspected. Everything below branches on what they return.
const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/);
const messageIdSchema = z.string().min(1);
const timeSchema = z.number().finite().nonnegative();

const afterIdleSchema = z.string().min(1).nullable();

const entrySchema = z.object({
  id: z.string().min(1),
  parentSessionId: sessionIdSchema,
  sessionId: sessionIdSchema,
  dispatchedAt: timeSchema,
  // The newest end-of-run record before the dispatch; null when there was
  // none. Entries written before this field compare clock times instead.
  afterIdleId: afterIdleSchema.optional(),
  messageId: messageIdSchema.optional(),
});

const storedFileSchema = z.object({ entries: z.array(z.unknown()) });

const errorCodeSchema = z.object({ code: z.string() });
const parse = (schema, value) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const retryDelay = (failures) => Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const unavailableError = (message, status) => Object.assign(new Error(message), { status });

export const escapeAttribute = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const messageText = (message) => (Array.isArray(message?.parts) ? message.parts : [])
  .filter((part) => part?.type === 'text' && typeof part.content === 'string')
  .map((part) => part.content)
  .join('')
  .trim();

const OUTCOME_STATES = {
  succeeded: 'completed',
  failed: 'error',
  interrupted: 'cancelled',
  stopped: 'cancelled',
  completed: 'completed',
  cancelled: 'cancelled',
};

export const readDispatchOutcome = (pageOrRecords, dispatchedAt, afterTurnOrIdleId, { withText = false } = {}) => {
  if (Array.isArray(pageOrRecords)) {
    const records = pageOrRecords;
    const idleIndex = records.findIndex((record) => record?.type === 'idle');
    if (idleIndex === -1) return null;
    const idle = records[idleIndex];
    if (!idle || !idle.time) return null;
    const byOrder = afterTurnOrIdleId !== undefined;
    if (byOrder ? idle.id === afterTurnOrIdleId : idle.time.created < dispatchedAt) return null;
    const baselineIndex = byOrder && afterTurnOrIdleId !== null
      ? records.findIndex((record) => record?.id === afterTurnOrIdleId)
      : -1;
    const turnRecords = records.slice(idleIndex + 1, baselineIndex === -1 ? undefined : baselineIndex);
    const replies = turnRecords
      .filter((record) => record?.type === 'assistant' && (byOrder || record.time?.created >= dispatchedAt));
    const reply = replies[0];
    const assistantText = (a) => (Array.isArray(a?.content) ? a.content.map((c) => c?.text || '').join('') : '');
    const textReply = withText ? replies.find((a) => assistantText(a)) : reply;
    return {
      state: OUTCOME_STATES[idle.outcome] ?? idle.outcome,
      text: textReply ? assistantText(textReply) : '',
      errorMessage: reply?.error?.message?.trim() ?? '',
    };
  }
  if (!pageOrRecords || !Array.isArray(pageOrRecords.turns) || !Array.isArray(pageOrRecords.messages)) return null;
  let candidateTurns = pageOrRecords.turns;
  if (afterTurnOrIdleId) {
    const baselineIndex = candidateTurns.findIndex((t) => t.turnId === afterTurnOrIdleId);
    if (baselineIndex !== -1) {
      candidateTurns = candidateTurns.slice(baselineIndex + 1);
    }
  }
  const matchingTurns = candidateTurns.filter((candidate) => {
    if (candidate.status !== 'completed' && candidate.status !== 'failed' && candidate.status !== 'cancelled') {
      return false;
    }
    if (afterTurnOrIdleId !== undefined && candidate.turnId === afterTurnOrIdleId) return false;
    return Number(candidate.finishedAt) >= dispatchedAt;
  });
  if (matchingTurns.length === 0) return null;
  const terminalTurn = matchingTurns.at(-1);
  const turnIds = new Set(matchingTurns.map((t) => t.turnId));
  const replies = pageOrRecords.messages.filter((message) => turnIds.has(message.turnId) && message.role === 'assistant');
  const text = [...replies].reverse().map((message) => messageText(message)).find((content) => content.length > 0) ?? '';
  return {
    state: OUTCOME_STATES[terminalTurn.status],
    text,
    errorMessage: typeof terminalTurn.error === 'string' ? terminalTurn.error.trim() : '',
  };
};
export type DispatchOutcome = NonNullable<ReturnType<typeof readDispatchOutcome>>;
const outcomeBody = ({ state, text, errorMessage }, sessionId) => {
  const answer = text.length > ANSWER_CHAR_LIMIT
    ? `${text.slice(0, ANSWER_CHAR_LIMIT)}\n\n[Cut at ${ANSWER_CHAR_LIMIT} characters; read the rest with session.messages for ${sessionId}.]`
    : text;
  if (state === 'completed') return answer || 'The session finished without a text reply.';
  if (state === 'error') {
    const failure = errorMessage ? `The session failed: ${errorMessage}` : 'The session failed.';
    return answer ? `${failure}\n\nIts last reply:\n${answer}` : failure;
  }
  const stopped = 'The session was stopped before it finished.';
  return answer ? `${stopped}\n\nIts last reply:\n${answer}` : stopped;
};

/** The synthetic message that carries a dispatched session's result to its parent. */
export const buildDispatchResultMessage = ({ sessionId, title, outcome }) => {
  const label = title || 'Dispatched session';
  const attributes = `sessionID="${escapeAttribute(sessionId)}" state="${outcome.state}" title="${escapeAttribute(label)}"`;
  const metadata = { source: DISPATCH_RESULT_SOURCE, sessionID: sessionId, state: outcome.state };
  if (title) metadata.title = title;
  return {
    text: `<openchamber-session ${attributes}>\n${outcomeBody(outcome, sessionId)}\n</openchamber-session>`,
    description: label,
    metadata,
  };
};

const DELETED_OUTCOME = { state: 'cancelled', text: '', errorMessage: '' };

export function createDispatchResultsRuntime({
  sessionService,
  resolveSessionScope,
  dataDir,
  isSessionArchived = async () => false,
  now = Date.now,
  quietMs = QUIET_MS,
  retryDelayMs = retryDelay,
  subagentRecheckMs = SUBAGENT_RECHECK_MS,
  settleRecheckMs = SETTLE_RECHECK_MS,
}) {
  if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function' || typeof sessionService.list !== 'function' || typeof sessionService.send !== 'function') {
    throw new Error('dispatch-results requires the canonical session service');
  }
  if (typeof resolveSessionScope !== 'function') throw new Error('dispatch-results requires a session scope resolver');
  if (typeof dataDir !== 'string' || !dataDir) throw new Error('dispatch-results requires a data directory');
  const filePath = path.join(dataDir, FILE_NAME);

  /** entry id → { id, parentSessionId, sessionId, dispatchedAt, messageId? } */
  const entries = new Map();
  let loadPromise = null;
  let writePromise = Promise.resolve();
  let stopped = false;

  // In memory only: a restart starts every watched session from a fresh tick.
  const timers = new Map(); // watched sessionId → timeout
  const failures = new Map(); // watched sessionId → consecutive failed ticks
  const settleChecks = new Map(); // watched sessionId → rechecks spent waiting for the idle record
  const ticking = new Set(); // watched sessionIds with a tick in flight

  // --- persistence ---------------------------------------------------------

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (parse(errorCodeSchema, error)?.code === 'ENOENT') return [];
      throw error;
    }
    let stored = null;
    let reason = 'not a dispatch results file';
    try {
      stored = parse(storedFileSchema, JSON.parse(raw));
    } catch (error) {
      reason = error?.message ?? String(error);
    }
    if (!stored) {
      // Malformed is a failure, not "nothing pending": keep the bytes and
      // start over rather than overwrite them on the next write.
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[dispatch-results] file was unreadable and moved to ${backup}: ${reason}`);
      return [];
    }
    // One unreadable entry is dropped alone; the rest still deliver.
    return stored.entries.map((entry) => parse(entrySchema, entry)).filter(Boolean);
  };

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const entry of stored) if (!entries.has(entry.id)) entries.set(entry.id, entry);
        })
        .catch((error) => {
          // A failed read must not pass for "nothing pending": the next write
          // would clobber the file, so writes wait for a load that succeeds.
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = () => {
    const payload = JSON.stringify({ version: FILE_VERSION, entries: Array.from(entries.values()) });
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    // The chain survives a failed write so later writes still run; the caller
    // still sees this one fail, since "on disk" is what it waits for.
    writePromise = write.catch((error) => {
      console.warn('[dispatch-results] failed to persist pending results:', error?.message ?? error);
    });
    return write;
  };

  // --- OpenCode access -----------------------------------------------------

  // --- canonical session access -------------------------------------------
  const readWatchedSession = async (sessionId) => {
    if (typeof sessionService?.open !== 'function' || typeof sessionService?.history !== 'function' || typeof resolveSessionScope !== 'function') return null;
    try {
      const scope = await resolveSessionScope(sessionId);
      if (!scope) return { kind: 'deleted' };
      const snapshot = await sessionService.open(sessionId);
      const session = snapshot?.session;
      if (!session) return { kind: 'deleted' };
      if (session.runtimeStatus === 'running' || session.runtimeStatus === 'awaiting_approval' || session.runtimeStatus === 'awaiting_input') return { kind: 'running' };
      const listed = await sessionService.list(scope.workspaceId);
      if (!listed || !Array.isArray(listed.items) || Object.keys(listed.errors ?? {}).length > 0) return null;
      if (listed.items.some((item) => item.rootSessionId === sessionId && item.sessionId !== sessionId && ['running', 'awaiting_approval', 'awaiting_input'].includes(item.runtimeStatus))) return { kind: 'subagents' };
      const page = await sessionService.history(sessionId, new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT) }).toString());
      if (!page || !Array.isArray(page.turns) || !Array.isArray(page.messages)) return null;
      return { kind: 'ended', title: typeof session.title === 'string' ? session.title.trim() : '', page };
    } catch (error) {
      if (error?.status === 404 || error?.statusCode === 404) return { kind: 'deleted' };
      return null;
    }
  };

  const deliver = async (entry, message) => {
    const archived = await isSessionArchived(entry.parentSessionId);
    if (archived === true) return true;
    try {
      const parentPage = await sessionService.history(entry.parentSessionId, new URLSearchParams({ limit: '20' }).toString());
      const latestAssistant = [...(parentPage?.messages ?? [])].reverse().find((candidate) => candidate.role === 'assistant');
      if (!latestAssistant?.providerId || !latestAssistant.modelId) throw unavailableError('Parent model is unavailable', 503);
      await sessionService.send(entry.parentSessionId, {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: message.text }] },
        options: { providerId: latestAssistant.providerId, modelId: latestAssistant.modelId, agentId: null, variant: null, reasoningEffort: null },
      }, entry.messageId);
      return true;
    } catch (error) {
      if (error?.status === 404 || error?.statusCode === 404) {
        console.log(`[dispatch-results] dropping the result of ${entry.sessionId}: session ${entry.parentSessionId} no longer exists`);
        return true;
      }
      throw error;
    }
  };

  // --- delivery loop -------------------------------------------------------

  const pendingFor = (sessionId) => Array.from(entries.values()).filter((entry) => entry.sessionId === sessionId);

  const clearTimer = (sessionId) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(sessionId);
    }
  };

  const arm = (sessionId, delayMs = quietMs) => {
    if (stopped || pendingFor(sessionId).length === 0) return;
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      tick(sessionId).catch((error) => {
        console.warn('[dispatch-results] tick failed:', error?.message ?? error);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionId, timer);
  };

  const retryLater = (sessionId) => {
    const count = (failures.get(sessionId) ?? 0) + 1;
    failures.set(sessionId, count);
    arm(sessionId, retryDelayMs(count));
  };

  async function tick(sessionId) {
    if (stopped || pendingFor(sessionId).length === 0) return;
    // An idle event that lands while a tick is still reading must not be
    // lost: that tick may have seen the session running a moment earlier.
    if (ticking.has(sessionId)) return arm(sessionId);
    ticking.add(sessionId);
    try {
      const watched = await readWatchedSession(sessionId);
      if (watched === null) return retryLater(sessionId);
      // Running: its next idle event re-arms the tick.
      if (watched.kind === 'running') return;
      if (watched.kind === 'subagents') return arm(sessionId, subagentRecheckMs);

      let waiting = false;
      const ready = [];
      for (const entry of pendingFor(sessionId)) {
        const outcome = watched.kind === 'deleted'
          ? DELETED_OUTCOME
          : readDispatchOutcome(watched.page, entry.dispatchedAt, entry.afterIdleId);
        if (!outcome) {
          waiting = true;
          continue;
        }
        ready.push({ entry, outcome });
      }

      const unsent = ready.filter(({ entry }) => !entry.messageId);
      if (unsent.length > 0) {
        const minted = new Map();
        for (const { entry } of unsent) {
          let messageId = minted.get(entry.parentSessionId);
          if (messageId === undefined) {
            messageId = createMessageId();
            minted.set(entry.parentSessionId, messageId);
          }
          entry.messageId = messageId;
        }
        try {
          await persist();
        } catch (error) {
          for (const { entry } of unsent) delete entry.messageId;
          throw error;
        }
      }

      const deliveries = new Map(); // message id → ready entries
      for (const item of ready) deliveries.set(item.entry.messageId, [...(deliveries.get(item.entry.messageId) ?? []), item]);
      for (const group of deliveries.values()) {
        // An entry without a baseline compares clocks and can miss a reply
        // that began before its send; another entry of the run may have it.
        const { entry, outcome } = group.find((item) => item.outcome.text) ?? group[0];
        const message = buildDispatchResultMessage({
          sessionId,
          title: watched.kind === 'ended' ? watched.title : '',
          outcome,
        });
        await deliver(entry, message);
        for (const item of group) entries.delete(item.entry.id);
        await persist();
        console.log(`[dispatch-results] delivered the ${outcome.state} result of ${sessionId} to ${entry.parentSessionId}`);
      }
      failures.delete(sessionId);

      if (!waiting) {
        settleChecks.delete(sessionId);
        return;
      }
      // Idle, yet the run's idle record is not there: either the record trails
      // the event briefly, or the dispatched prompt has not started. A few
      // short rechecks cover the first; the next idle event covers the second.
      const spent = settleChecks.get(sessionId) ?? 0;
      if (spent < SETTLE_RECHECKS) {
        settleChecks.set(sessionId, spent + 1);
        arm(sessionId, settleRecheckMs);
      }
    } catch (error) {
      console.warn(`[dispatch-results] delivering the result of ${sessionId} failed:`, error?.message ?? error);
      retryLater(sessionId);
    } finally {
      ticking.delete(sessionId);
    }
  }

  const reconcileAll = () => {
    for (const sessionId of new Set(Array.from(entries.values(), (entry) => entry.sessionId))) {
      if (!timers.has(sessionId)) arm(sessionId);
    }
  };

  // --- public --------------------------------------------------------------

  /**
   * Watches `sessionId` for the end of the turn dispatched at `dispatchedAt`
   * and delivers its result to `parentSessionId`. Resolves once the entry is
   * on disk, so a restart right after the tool answers still delivers.
   */
  const register = async ({ parentSessionId, sessionId, dispatchedAt, afterIdleId }) => {
    const parent = parse(sessionIdSchema, parentSessionId);
    const watched = parse(sessionIdSchema, sessionId);
    if (!parent || !watched) throw new TypeError('parentSessionId and sessionId must be session ids');
    if (parent === watched) throw new TypeError('a session cannot return its result to itself');
    const at = parse(timeSchema, dispatchedAt);
    if (at === null) throw new TypeError('dispatchedAt must be a timestamp');
    await load();
    const entry = { id: `dispatch-${now()}-${Math.random().toString(36).slice(2, 9)}`, parentSessionId: parent, sessionId: watched, dispatchedAt: at };
    // Kept only when it is a real baseline (an id, or null for "none yet").
    const baseline = afterIdleSchema.safeParse(afterIdleId);
    if (afterIdleId !== undefined && baseline.success) entry.afterIdleId = baseline.data;
    entries.set(entry.id, entry);
    if (entries.size > MAX_ENTRIES) {
      const oldest = Array.from(entries.values())
        .filter((candidate) => candidate.id !== entry.id)
        .sort((left, right) => left.dispatchedAt - right.dispatchedAt)
        .slice(0, entries.size - MAX_ENTRIES);
      for (const stale of oldest) {
        entries.delete(stale.id);
        console.warn(`[dispatch-results] too many pending results; no longer waiting on ${stale.sessionId} for ${stale.parentSessionId}`);
      }
    }
    try {
      await persist();
    } catch (error) {
      // The caller tells the agent no result is coming; delivering one anyway
      // would contradict it.
      entries.delete(entry.id);
      throw error;
    }
    // The session may already be done: a short turn can end before this
    // entry existed, and its idle event would then have found nothing to arm.
    arm(watched);
    return { id: entry.id };
  };

  const processCanonicalEvent = (event, scope) => {
    if (stopped || !event || typeof event.sessionId !== 'string') return;
    if (scope?.sessionId && scope.sessionId !== event.sessionId) return;
    const sessionId = event.sessionId;
    if (event.type === 'session.deleted') {
      let changed = false;
      for (const entry of entries.values()) {
        if (entry.parentSessionId === sessionId) {
          entries.delete(entry.id);
          changed = true;
        }
      }
      if (changed) void persist();
      arm(sessionId);
      return;
    }
    if (pendingFor(sessionId).length === 0) return;
    if ((event.type === 'session.status' && (event.runtimeStatus === 'idle' || event.runtimeStatus === 'unavailable'))
      || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
      settleChecks.delete(sessionId);
      arm(sessionId);
    } else if (event.type === 'session.status') {
      clearTimer(sessionId);
    }
  };

  const start = () => {
    void load()
      .then(() => {
        if (entries.size > 0) console.log(`[dispatch-results] restored ${entries.size} pending result(s)`);
        reconcileAll();
      })
      .catch((error) => {
        console.warn('[dispatch-results] failed to load pending results:', error?.message ?? error);
      });
  };

  const stop = () => {
    stopped = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  return {
    load,
    register,
    processCanonicalEvent,
    start,
    stop,
    /** Pending entries, oldest first; tests and diagnostics read it. */
    pending: () => Array.from(entries.values()).sort((left, right) => left.dispatchedAt - right.dispatchedAt),
    /** Drains the pending write; tests and shutdown use it. */
    flush: () => writePromise,
  };
}
