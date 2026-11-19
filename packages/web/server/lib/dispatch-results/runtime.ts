<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
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

||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
// Results of sessions an agent dispatched and asked to hear back from.
//
// An agent that creates, sends to, or forks a session with `returnResult`
// gets its answer at once and goes on. When the dispatched session's turn is
// over, this runtime hands its final answer to the session that dispatched it
// as a synthetic message and wakes that session, so the agent continues on its
// own: background primary sessions, the way OpenCode 2 reports a background
// subagent to its parent (core `session/subagent-completion.ts`).
//
// Event-driven like the message queue: the shared upstream hub delivers
// `session.status`, and an idle transition of a watched session arms a short
// timer. The tick confirms the turn is over against OpenCode itself (not
// running, no running subagent, and the `idle` record OpenCode appends when a
// run ends) before anything is delivered. Pending deliveries are persisted,
// so a restart in between still delivers.

=======
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const FILE_NAME = 'dispatch-results.json';
const FILE_VERSION = 1;
const MAX_ENTRIES = 200;
const QUIET_MS = 500;
const SETTLE_RECHECK_MS = 2_000;
const SETTLE_RECHECKS = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const MESSAGE_PAGE_LIMIT = 50;
const ANSWER_CHAR_LIMIT = 50_000;

const DISPATCH_RESULT_SOURCE = 'openchamber-session';

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
// Boundary schemas: the only place raw JSON (the file, OpenCode answers, hub
// events) is inspected. Everything below branches on what they return.
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Boundary schemas: the only place raw JSON (the file, OpenCode answers, hub
// events) is inspected. Everything below branches on what they return.
=======
const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/);
const messageIdSchema = z.string().min(1);
const timeSchema = z.number().finite().nonnegative();

const afterIdleSchema = z.string().min(1).nullable();

const entrySchema = z.object({
  id: z.string().min(1),
  parentSessionId: sessionIdSchema,
  sessionId: sessionIdSchema,
  dispatchedAt: timeSchema,
  afterIdleId: afterIdleSchema.optional(),
  messageId: messageIdSchema.optional(),
});

const storedFileSchema = z.object({ entries: z.array(z.unknown()) });

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
const idleRecordSchema = z.object({
  id: z.string().min(1),
  type: z.literal('idle'),
  outcome: z.enum(['succeeded', 'failed', 'interrupted']),
  time: z.object({ created: timeSchema }),
});

const assistantRecordSchema = z.object({
  type: z.literal('assistant'),
  content: z.array(z.unknown()).default([]),
  error: z.object({ message: z.string().optional() }).nullish(),
  time: z.object({ created: timeSchema }),
});

const textContentSchema = z.object({ type: z.literal('text'), text: z.string() });

const recordTypeSchema = z.object({ type: z.string() });
const recordIdSchema = z.object({ id: z.string() });
const sessionRecordSchema = z.object({ title: z.string().optional() });
const messagePageSchema = z.object({ data: z.array(z.unknown()) });

const statusEventSchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.string().min(1) }) }),
});

const deletedEventSchema = z.object({
  type: z.literal('session.deleted'),
  properties: z.object({ sessionID: z.string().min(1) }),
});

=======
const idleRecordSchema = z.object({
  id: z.string().min(1),
  type: z.literal('idle'),
  outcome: z.enum(['succeeded', 'failed', 'interrupted']),
  time: z.object({ created: timeSchema }),
});

const assistantRecordSchema = z.object({
  type: z.literal('assistant'),
  content: z.array(z.unknown()).default([]),
  error: z.object({ message: z.string().optional() }).nullish(),
  time: z.object({ created: timeSchema }),
});

const textContentSchema = z.object({ type: z.literal('text'), text: z.string() });

const recordTypeSchema = z.object({ type: z.string() });
const recordIdSchema = z.object({ id: z.string() });
const sessionRecordSchema = z.object({ title: z.string().optional() });
const messagePageSchema = z.object({ data: z.array(z.unknown()) });

const statusEventSchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.string().min(1) }) }),
});

const deletedEventSchema = z.object({
  type: z.literal('session.deleted'),
  properties: z.object({ sessionID: z.string().min(1) }),
});

const dispatchEventSchema = z.union([deletedEventSchema, statusEventSchema]);
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
const errorCodeSchema = z.object({ code: z.string() });
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
const parse = (schema, value) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js

const parse = (schema, value) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
=======

export type DispatchEntry = z.infer<typeof entrySchema>;
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts

export interface DispatchOutcome {
  state: 'completed' | 'error' | 'cancelled';
  text: string;
  errorMessage: string;
}

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
const unavailableError = (message, status) => Object.assign(new Error(message), { status });
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
const httpError = (message, status) => Object.assign(new Error(message), { status });

/**
 * A message id in OpenCode's own ascending format (`msg_` + time + random),
 * minted once per delivery and persisted before the first attempt. OpenCode
 * refuses a second admission of the same id, so a retry after a crash or a
 * lost response can never deliver the answer twice.
 */
export const createMessageId = (now) => {
  const time = (BigInt(now) * 0x1000n + BigInt(Math.floor(Math.random() * 0x1000))).toString(16).padStart(12, '0').slice(-12);
  let random = '';
  for (let index = 0; index < 14; index += 1) random += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return `msg_${time}${random}`;
};
=======
export interface DispatchResultMessage {
  text: string;
  description: string;
  metadata: {
    source: typeof DISPATCH_RESULT_SOURCE;
    sessionID: string;
    state: DispatchOutcome['state'];
    title?: string;
  };
}

export interface DispatchRegistration {
  parentSessionId: string;
  sessionId: string;
  dispatchedAt: number;
  afterIdleId?: string | null;
}

export interface DispatchResultsOptions {
  globalEventHub: {
    subscribeEvent: (listener: (event: DispatchEventSource) => void) => () => void;
    subscribeStatus: (listener: (status: { type: string }) => void) => () => void;
  };
  buildOpenCodeUrl: (fetchPath: string, query: string) => string | URL;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  dataDir: string;
  isSessionArchived?: (sessionId: string) => boolean | Promise<boolean>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  quietMs?: number;
  retryDelayMs?: (failures: number) => number;
  settleRecheckMs?: number;
}

type WatchedSession =
  | { kind: 'running' }
  | { kind: 'deleted' }
  | { kind: 'ended'; title: string; records: unknown[] };

interface ReadyResult {
  entry: DispatchEntry;
  outcome: DispatchOutcome;
}

interface DispatchEventSource {
  translated?: () => unknown[];
}

const hasMessage = (value: unknown): value is { message: unknown } =>
  value !== null && (typeof value === 'object' || typeof value === 'function') && 'message' in value;

const hasStatus = (value: unknown): value is { status: unknown } =>
  value !== null && (typeof value === 'object' || typeof value === 'function') && 'status' in value;

const parsedData = <Data>(parsed: z.ZodSafeParseResult<Data>) => parsed.success ? parsed.data : null;

const isDispatchEvent = (value: unknown): value is z.infer<typeof dispatchEventSchema> =>
  dispatchEventSchema.safeParse(value).success;

const retryDelay = (failures: number) => Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const createMessageId = (now: number) => {
  const time = (BigInt(now) * 0x1000n + BigInt(Math.floor(Math.random() * 0x1000))).toString(16).padStart(12, '0').slice(-12);
  let random = '';
  for (let index = 0; index < 14; index += 1) random += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return `msg_${time}${random}`;
};
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts

export const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
const messageText = (message) => (Array.isArray(message?.parts) ? message.parts : [])
  .filter((part) => part?.type === 'text' && typeof part.content === 'string')
  .map((part) => part.content)
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
const assistantText = (assistant) => assistant.content
  .map((item) => parse(textContentSchema, item)?.text ?? '')
=======
const assistantText = (assistant: z.infer<typeof assistantRecordSchema>) => assistant.content
  .map((item) => parsedData(textContentSchema.safeParse(item))?.text ?? '')
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
  .join('')
  .trim();

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
const OUTCOME_STATES = {
  succeeded: 'completed',
  failed: 'error',
  interrupted: 'cancelled',
  stopped: 'cancelled',
  completed: 'completed',
  cancelled: 'cancelled',
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
const OUTCOME_STATES = { succeeded: 'completed', failed: 'error', interrupted: 'cancelled' };

/**
 * How the dispatched turn ended, read from the newest page of the session's
 * records (newest first), or null while it has not ended since the dispatch.
 *
 * OpenCode appends an `idle` record with the run's outcome when a run ends,
 * so the outcome is authoritative and survives a restart of either server.
 * The answer is the newest assistant reply of that turn.
 *
 * "Since the dispatch" is decided by record order against `afterIdleId`, the
 * newest idle record before the prompt went out, so OpenChamber's clock never
 * meets OpenCode's: a remote OpenCode whose clock lags would otherwise make a
 * finished turn look older than its own dispatch. Only an entry stored
 * without that baseline (`afterIdleId` undefined) falls back to `dispatchedAt`.
 *
 * `withText` takes the text from the newest reply of the turn that has any,
 * for a caller that forwards the answer: a turn can end on a step that only
 * ran tools. The error still comes from the newest reply.
 */
export const readDispatchOutcome = (records, dispatchedAt, afterIdleId, { withText = false } = {}) => {
  const idleIndex = records.findIndex((record) => parse(recordTypeSchema, record)?.type === 'idle');
  if (idleIndex === -1) return null;
  // A malformed idle record proves nothing about the turn: keep waiting.
  const idle = parse(idleRecordSchema, records[idleIndex]);
  if (!idle) return null;
  const byOrder = afterIdleId !== undefined;
  if (byOrder ? idle.id === afterIdleId : idle.time.created < dispatchedAt) return null;
  // The turn's records sit between its idle record and the baseline one.
  const baselineIndex = byOrder && afterIdleId !== null
    ? records.findIndex((record) => parse(recordIdSchema, record)?.id === afterIdleId)
    : -1;
  const turnRecords = records.slice(idleIndex + 1, baselineIndex === -1 ? undefined : baselineIndex);
  const replies = turnRecords
    .map((record) => parse(assistantRecordSchema, record))
    .filter((assistant) => assistant !== null && (byOrder || assistant.time.created >= dispatchedAt));
  const reply = replies[0];
  const textReply = withText ? replies.find((assistant) => assistantText(assistant)) : reply;
  return {
    state: OUTCOME_STATES[idle.outcome],
    text: textReply ? assistantText(textReply) : '',
    errorMessage: reply?.error?.message?.trim() ?? '',
  };
=======
const OUTCOME_STATES = {
  succeeded: 'completed', failed: 'error', interrupted: 'cancelled',
} satisfies Record<z.infer<typeof idleRecordSchema>['outcome'], DispatchOutcome['state']>;

export const readDispatchOutcome = (records: unknown[], dispatchedAt: number, afterIdleId?: string | null, { withText = false }: { withText?: boolean } = {}): DispatchOutcome | null => {
  const idleIndex = records.findIndex((record) => parsedData(recordTypeSchema.safeParse(record))?.type === 'idle');
  if (idleIndex === -1) return null;
  const idle = parsedData(idleRecordSchema.safeParse(records[idleIndex]));
  if (!idle) return null;
  const byOrder = afterIdleId !== undefined;
  if (byOrder ? idle.id === afterIdleId : idle.time.created < dispatchedAt) return null;
  const baselineIndex = byOrder && afterIdleId !== null
    ? records.findIndex((record) => parsedData(recordIdSchema.safeParse(record))?.id === afterIdleId)
    : -1;
  const turnRecords = records.slice(idleIndex + 1, baselineIndex === -1 ? undefined : baselineIndex);
  const replies = turnRecords
    .map((record) => parsedData(assistantRecordSchema.safeParse(record)))
    .filter((assistant): assistant is z.infer<typeof assistantRecordSchema> => assistant !== null && (byOrder || assistant.time.created >= dispatchedAt));
  const reply = replies[0];
  const textReply = withText ? replies.find((assistant) => assistantText(assistant)) : reply;
  return {
    state: OUTCOME_STATES[idle.outcome],
    text: textReply ? assistantText(textReply) : '',
    errorMessage: reply?.error?.message?.trim() ?? '',
  };
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
};

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
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
const outcomeBody = ({ state, text, errorMessage }, sessionId) => {
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
const outcomeBody = ({ state, text, errorMessage }, sessionId) => {
=======
const outcomeBody = ({ state, text, errorMessage }: DispatchOutcome, sessionId: string) => {
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
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

export const buildDispatchResultMessage = ({ sessionId, title, outcome }: { sessionId: string; title: string; outcome: DispatchOutcome }): DispatchResultMessage => {
  const label = title || 'Dispatched session';
  const attributes = `sessionID="${escapeAttribute(sessionId)}" state="${outcome.state}" title="${escapeAttribute(label)}"`;
  const metadata: DispatchResultMessage['metadata'] = { source: DISPATCH_RESULT_SOURCE, sessionID: sessionId, state: outcome.state };
  if (title) metadata.title = title;
  return {
    text: `<openchamber-session ${attributes}>\n${outcomeBody(outcome, sessionId)}\n</openchamber-session>`,
    description: label,
    metadata,
  };
};

const DELETED_OUTCOME: DispatchOutcome = { state: 'cancelled', text: '', errorMessage: '' };

export function createDispatchResultsRuntime({
  sessionService,
  resolveSessionScope,
  dataDir,
  isSessionArchived = async () => false,
  now = Date.now,
  quietMs = QUIET_MS,
  retryDelayMs = retryDelay,
  settleRecheckMs = SETTLE_RECHECK_MS,
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
}) {
  if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function' || typeof sessionService.list !== 'function' || typeof sessionService.send !== 'function') {
    throw new Error('dispatch-results requires the canonical session service');
  }
  if (typeof resolveSessionScope !== 'function') throw new Error('dispatch-results requires a session scope resolver');
  if (typeof dataDir !== 'string' || !dataDir) throw new Error('dispatch-results requires a data directory');
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
}) {
=======
}: DispatchResultsOptions) {
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
  const filePath = path.join(dataDir, FILE_NAME);

  const entries = new Map<string, DispatchEntry>();
  let loadPromise: Promise<void> | null = null;
  let writePromise = Promise.resolve();
  let stopped = false;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, number>();
  const settleChecks = new Map<string, number>();
  const ticking = new Set<string>();

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (parsedData(errorCodeSchema.safeParse(error))?.code === 'ENOENT') return [];
      throw error;
    }
    let stored: z.infer<typeof storedFileSchema> | null = null;
    let reason: unknown;
    try {
      stored = parsedData(storedFileSchema.safeParse(JSON.parse(raw)));
    } catch (error) {
      reason = (hasMessage(error) ? error.message : undefined) ?? String(error);
    }
    if (!stored) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[dispatch-results] file was unreadable and moved to ${backup}: ${reason === undefined ? 'not a dispatch results file' : reason}`);
      return [];
    }
    return stored.entries.map((entry) => parsedData(entrySchema.safeParse(entry))).filter((entry) => entry !== null);
  };

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const entry of stored) if (!entries.has(entry.id)) entries.set(entry.id, entry);
        })
        .catch((error) => {
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
    writePromise = write.catch((cause: unknown) => {
      console.warn('[dispatch-results] failed to persist pending results:', (hasMessage(cause) ? cause.message : undefined) ?? cause);
    });
    return write;
  };

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
  // --- OpenCode access -----------------------------------------------------

  // --- canonical session access -------------------------------------------
  const readWatchedSession = async (sessionId) => {
    if (typeof sessionService?.open !== 'function' || typeof sessionService?.history !== 'function' || typeof resolveSessionScope !== 'function') return null;
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
  // --- OpenCode access -----------------------------------------------------

  const openCodeRequest = async (fetchPath, { method = 'GET', body, query } = {}) => {
    const base = buildOpenCodeUrl(fetchPath, '');
    const search = new URLSearchParams(query || {}).toString();
    const headers = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    const init = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(search ? `${base}?${search}` : base, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    return unwrapOpenCodeResponse(await response.json().catch(() => null));
  };

  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, timeoutMs: FETCH_TIMEOUT_MS, fetchImpl });

  /**
   * Where the watched session stands: `running`, `ended` with its record page
   * and title, `deleted`, or null when OpenCode could not be asked. Unknown is
   * never "ended": a failed read retries instead of reporting a guess.
   */
  const readWatchedSession = async (sessionId) => {
    const statuses = await activityProbe.fetchActiveSessionStatuses();
    if (!statuses) return null;
    if (statuses[sessionId]) return { kind: 'running' };
    // A turn is over only when its subagents are done too: the session idles
    // while a background subagent works and runs again on its result.
    const subagentsWorking = await activityProbe.hasWorkingChildren(sessionId, statuses);
    if (subagentsWorking === null) return null;
    if (subagentsWorking) return { kind: 'subagents' };
    const encoded = encodeURIComponent(sessionId);
=======
  const openCodeRequest = async <Schema extends z.ZodType>(fetchPath: string, schema: Schema, { method = 'GET', body, query }: {
    method?: string;
    body?: { id: DispatchEntry['messageId']; delivery: 'steer'; resume: boolean } & DispatchResultMessage;
    query?: Record<string, string>;
  } = {}) => {
    const base = buildOpenCodeUrl(fetchPath, '');
    const search = new URLSearchParams(query || {}).toString();
    const headers = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      Object.assign(headers, { 'Content-Type': 'application/json' });
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(search ? `${base}?${search}` : base, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    return parsedData(schema.safeParse(unwrapOpenCodeResponse(await response.json().catch(() => null))));
  };

  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, timeoutMs: FETCH_TIMEOUT_MS, fetchImpl, signal: undefined });

  const readWatchedSession = async (sessionId: string): Promise<WatchedSession | null> => {
    const statuses = await activityProbe.fetchActiveSessionStatuses();
    if (!statuses) return null;
    if (statuses[sessionId]) return { kind: 'running' };
    const encoded = encodeURIComponent(sessionId);
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
    try {
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
      const scope = await resolveSessionScope(sessionId);
      if (!scope) return { kind: 'deleted' };
      const snapshot = await sessionService.open(sessionId);
      const session = snapshot?.session;
      if (!session) return { kind: 'deleted' };
      if (session.runtimeStatus === 'running' || session.runtimeStatus === 'awaiting_approval' || session.runtimeStatus === 'awaiting_input') return { kind: 'running' };
      const listed = await sessionService.list(scope.workspaceId);
      if (!listed || !Array.isArray(listed.items) || (Array.isArray(listed.errors) && listed.errors.length > 0)) return null;
      if (listed.items.some((item) => item.rootSessionId === sessionId && item.sessionId !== sessionId && ['running', 'awaiting_approval', 'awaiting_input'].includes(item.runtimeStatus))) return { kind: 'subagents' };
      const page = await sessionService.history(sessionId, new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT) }).toString());
      if (!page || !Array.isArray(page.turns) || !Array.isArray(page.messages)) return null;
      return { kind: 'ended', title: typeof session.title === 'string' ? session.title.trim() : '', page };
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
      const session = parse(sessionRecordSchema, await openCodeRequest(`/api/session/${encoded}`));
      const page = parse(messagePageSchema, await openCodeRequest(`/api/session/${encoded}/message`, {
        query: { limit: String(MESSAGE_PAGE_LIMIT), order: 'desc' },
      }));
      // An answer that is not a page is unknown, never an empty history.
      if (!page) return null;
      return { kind: 'ended', title: session?.title?.trim() ?? '', records: page.data };
=======
      const session = await openCodeRequest(`/api/session/${encoded}`, sessionRecordSchema);
      const page = await openCodeRequest(`/api/session/${encoded}/message`, messagePageSchema, {
        query: { limit: String(MESSAGE_PAGE_LIMIT), order: 'desc' },
      });
      if (!page) return null;
      return { kind: 'ended', title: session?.title?.trim() ?? '', records: page.data };
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
    } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
      if (error?.status === 404 || error?.statusCode === 404) return { kind: 'deleted' };
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
      if (error?.status === 404) return { kind: 'deleted' };
=======
      if (hasStatus(error) && error.status === 404) return { kind: 'deleted' };
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
      return null;
    }
  };

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
  const deliver = async (entry, message) => {
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
  /** Admits the result into the parent. Resolves true when it is there (now or before). */
  const deliver = async (entry, message) => {
    // The archive store answers asynchronously; reading its Promise as a
    // value made every parent look archived, so none was ever woken. A failed
    // lookup wakes: the agent asked for this result.
=======
  const deliver = async (entry: DispatchEntry, message: DispatchResultMessage) => {
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
    const archived = await Promise.resolve(isSessionArchived(entry.parentSessionId)).catch(() => false);
    if (archived === true) return true;
    try {
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
      const parentPage = await sessionService.history(entry.parentSessionId, new URLSearchParams({ limit: '20' }).toString());
      const latestAssistant = [...(parentPage?.messages ?? [])].reverse().find((candidate) => candidate.role === 'assistant');
      if (!latestAssistant?.providerId || !latestAssistant.modelId) throw unavailableError('Parent model is unavailable', 503);
      await sessionService.send(entry.parentSessionId, {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: message.text }] },
        options: { providerId: latestAssistant.providerId, modelId: latestAssistant.modelId, agentId: null, variant: null, reasoningEffort: null },
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
      await openCodeRequest(`/api/session/${encodeURIComponent(entry.parentSessionId)}/synthetic`, {
        method: 'POST',
        body: { id: entry.messageId, ...message, delivery: 'steer', resume },
=======
      await openCodeRequest(`/api/session/${encodeURIComponent(entry.parentSessionId)}/synthetic`, z.unknown().transform(() => undefined), {
        method: 'POST',
        body: { id: entry.messageId, ...message, delivery: 'steer', resume },
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
      });
      return true;
    } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
      if (error?.status === 409 || error?.statusCode === 409) return true;
      if (error?.status === 404 || error?.statusCode === 404) {
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
      // The id is ours and was admitted before: an earlier attempt landed.
      if (error?.status === 409) return true;
      // The parent is gone; nobody is left to tell.
      if (error?.status === 404) {
=======
      if (hasStatus(error) && error.status === 409) return true;
      if (hasStatus(error) && error.status === 404) {
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
        console.log(`[dispatch-results] dropping the result of ${entry.sessionId}: session ${entry.parentSessionId} no longer exists`);
        return true;
      }
      throw error;
    }
  };

  const pendingFor = (sessionId: string) => Array.from(entries.values()).filter((entry) => entry.sessionId === sessionId);

  const clearTimer = (sessionId: string) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(sessionId);
    }
  };

  const arm = (sessionId: string, delayMs = quietMs) => {
    if (stopped || pendingFor(sessionId).length === 0) return;
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      tick(sessionId).catch((cause: unknown) => {
        console.warn('[dispatch-results] tick failed:', (hasMessage(cause) ? cause.message : undefined) ?? cause);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionId, timer);
  };

  const retryLater = (sessionId: string) => {
    const count = (failures.get(sessionId) ?? 0) + 1;
    failures.set(sessionId, count);
    arm(sessionId, retryDelayMs(count));
  };

  async function tick(sessionId: string): Promise<void> {
    if (stopped || pendingFor(sessionId).length === 0) return;
    if (ticking.has(sessionId)) return arm(sessionId);
    ticking.add(sessionId);
    try {
      const watched = await readWatchedSession(sessionId);
      if (watched === null) return retryLater(sessionId);
      if (watched.kind === 'running') return;

      let waiting = false;
      const ready: ReadyResult[] = [];
      for (const entry of pendingFor(sessionId)) {
        const outcome = watched.kind === 'deleted'
          ? DELETED_OUTCOME
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
          : readDispatchOutcome(watched.page, entry.dispatchedAt, entry.afterIdleId);
        if (!outcome) {
          waiting = true;
          continue;
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
          : readDispatchOutcome(watched.records, entry.dispatchedAt, entry.afterIdleId);
        if (outcome) ready.push({ entry, outcome });
        else waiting = true;
      }

      // Every ready entry reports the session's newest run, so prompts a
      // parent steered into one run share one message id and one result. An
      // entry that already holds an id keeps it: that id may have landed with
      // an earlier run, and sharing it would swallow this one.
      const unsent = ready.filter(({ entry }) => !entry.messageId);
      if (unsent.length > 0) {
        const minted = new Map(); // parentSessionId → message id
        for (const { entry } of unsent) {
          if (!minted.has(entry.parentSessionId)) minted.set(entry.parentSessionId, createMessageId(now()));
          entry.messageId = minted.get(entry.parentSessionId);
=======
          : readDispatchOutcome(watched.records, entry.dispatchedAt, entry.afterIdleId);
        if (outcome) ready.push({ entry, outcome });
        else waiting = true;
      }

      const unsent = ready.filter(({ entry }) => !entry.messageId);
      if (unsent.length > 0) {
        const minted = new Map<string, string>();
        for (const { entry } of unsent) {
          let messageId = minted.get(entry.parentSessionId);
          if (messageId === undefined) {
            messageId = createMessageId(now());
            minted.set(entry.parentSessionId, messageId);
          }
          entry.messageId = messageId;
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
        }
        try {
          await persist();
        } catch (error) {
          for (const { entry } of unsent) delete entry.messageId;
          throw error;
        }
      }

      const deliveries = new Map<string | undefined, [ReadyResult, ...ReadyResult[]]>();
      for (const item of ready) deliveries.set(item.entry.messageId, [...(deliveries.get(item.entry.messageId) ?? []), item]);
      for (const group of deliveries.values()) {
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
      const spent = settleChecks.get(sessionId) ?? 0;
      if (spent < SETTLE_RECHECKS) {
        settleChecks.set(sessionId, spent + 1);
        arm(sessionId, settleRecheckMs);
      }
    } catch (error) {
      console.warn(`[dispatch-results] delivering the result of ${sessionId} failed:`, (hasMessage(error) ? error.message : undefined) ?? error);
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

  const register = async ({ parentSessionId, sessionId, dispatchedAt, afterIdleId }: DispatchRegistration) => {
    const parent = parsedData(sessionIdSchema.safeParse(parentSessionId));
    const watched = parsedData(sessionIdSchema.safeParse(sessionId));
    if (!parent || !watched) throw new TypeError('parentSessionId and sessionId must be session ids');
    if (parent === watched) throw new TypeError('a session cannot return its result to itself');
    const at = parsedData(timeSchema.safeParse(dispatchedAt));
    if (at === null) throw new TypeError('dispatchedAt must be a timestamp');
    await load();
    const entry: DispatchEntry = { id: `dispatch-${now()}-${Math.random().toString(36).slice(2, 9)}`, parentSessionId: parent, sessionId: watched, dispatchedAt: at };
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
      entries.delete(entry.id);
      throw error;
    }
    arm(watched);
    return { id: entry.id };
  };

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
  const processCanonicalEvent = (event, scope) => {
    if (stopped || !event || typeof event.sessionId !== 'string') return;
    if (scope?.sessionId && scope.sessionId !== event.sessionId) return;
    const sessionId = event.sessionId;
    if (event.type === 'session.deleted') {
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
  const processPayload = (payload) => {
    if (stopped) return;

    const deleted = parse(deletedEventSchema, payload);
    if (deleted) {
      const deletedSessionId = deleted.properties.sessionID;
      // A deleted parent has nobody left to tell; a deleted dispatched session
      // still reports, as stopped, so the agent is not left waiting.
=======
  const processPayload = (payload: z.infer<typeof dispatchEventSchema>) => {
    if (stopped) return;

    const deleted = parsedData(deletedEventSchema.safeParse(payload));
    if (deleted) {
      const deletedSessionId = deleted.properties.sessionID;
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
      let changed = false;
      for (const entry of entries.values()) {
        if (entry.parentSessionId === sessionId) {
          entries.delete(entry.id);
          changed = true;
        }
      }
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
      if (changed) void persist();
      arm(sessionId);
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
      // Logged by persist; the next write saves the same state again.
      if (changed) persist().catch(() => undefined);
      arm(deletedSessionId);
=======
      if (changed) persist().catch(() => undefined);
      arm(deletedSessionId);
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
      return;
    }
<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js

    const status = parse(statusEventSchema, payload);
    if (!status) return;
    const sessionId = status.properties.sessionID;
=======

    const status = parsedData(statusEventSchema.safeParse(payload));
    if (!status) return;
    const sessionId = status.properties.sessionID;
>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
    if (pendingFor(sessionId).length === 0) return;
    if ((event.type === 'session.status' && (event.runtimeStatus === 'idle' || event.runtimeStatus === 'unavailable'))
      || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
      settleChecks.delete(sessionId);
      arm(sessionId);
    } else if (event.type === 'session.status') {
      clearTimer(sessionId);
    }
  };

<<<<<<< HEAD:packages/web/server/lib/dispatch-results/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/dispatch-results/runtime.js
  const processEvent = (event) => {
    for (const payload of event?.translated?.() ?? []) processPayload(payload);
  };

=======
  const processEvent = (event: DispatchEventSource) => {
    for (const payload of event?.translated?.() ?? []) {
      if (isDispatchEvent(payload)) processPayload(payload);
    }
  };

>>>>>>> upstream/main:packages/web/server/lib/dispatch-results/runtime.ts
  const start = () => {
    void load()
      .then(() => {
        if (entries.size > 0) console.log(`[dispatch-results] restored ${entries.size} pending result(s)`);
        reconcileAll();
      })
      .catch((cause: unknown) => {
        console.warn('[dispatch-results] failed to load pending results:', (hasMessage(cause) ? cause.message : undefined) ?? cause);
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
    pending: () => Array.from(entries.values()).sort((left, right) => left.dispatchedAt - right.dispatchedAt),
    flush: () => writePromise,
  };
}
