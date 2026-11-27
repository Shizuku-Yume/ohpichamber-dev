import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CanonicalEvent, PromptRequest, Run, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { controlErrorFields } from '../openchamber-control/error.js';
import { isString } from '../shared/guards.js';

export const createMessageId = (): string => `msg_${randomUUID()}`;

const FILE_NAME = 'dispatch-results.json';
const FILE_VERSION = 1;
const MAX_ENTRIES = 200;
const QUIET_MS = 500;
const SUBAGENT_RECHECK_MS = 5_000;
const SETTLE_RECHECK_MS = 2_000;
const SETTLE_RECHECKS = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const MESSAGE_PAGE_LIMIT = 50;
const ANSWER_CHAR_LIMIT = 50_000;
const DISPATCH_RESULT_SOURCE = 'openchamber-session';

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
const errorCodeSchema = z.object({ code: z.string() });

type DispatchEntry = z.output<typeof entrySchema>;

const parse = <S extends z.ZodType>(schema: S, value: Parameters<S['safeParse']>[0]): z.output<S> | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const errorMessageOf = (cause: Parameters<typeof controlErrorFields>[0]): string => {
  const message = controlErrorFields(cause)?.message;
  return isString(message) ? message : String(cause);
};

const isNotFound = (cause: Parameters<typeof controlErrorFields>[0]): boolean => {
  const fields = controlErrorFields(cause);
  return fields?.status === 404 || fields?.statusCode === 404;
};

const retryDelay = (failures: number): number =>
  Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const unavailableError = (message: string, status: number): Error & { status: number } =>
  Object.assign(new Error(message), { status });

export const escapeAttribute = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export interface DispatchMessagePart {
  type: string;
  content?: string | undefined;
}

export interface DispatchMessage {
  turnId: string;
  role: string;
  providerId?: string | null | undefined;
  modelId?: string | null | undefined;
  parts: DispatchMessagePart[];
}

export interface DispatchTurn {
  turnId: string;
  status: string;
  finishedAt?: number | null | undefined;
  error?: string | null | undefined;
}

export interface DispatchHistoryPage {
  turns: DispatchTurn[];
  messages: DispatchMessage[];
}

export interface DispatchLegacyRecord {
  type?: string;
  id?: string;
  time?: { created?: number };
  outcome?: 'succeeded' | 'failed' | 'interrupted' | 'stopped';
  content?: Array<{ text?: string }>;
  error?: { message?: string };
}

export interface DispatchOutcome {
  state: 'completed' | 'error' | 'cancelled';
  text: string;
  errorMessage: string;
}

export interface DispatchOutcomeOptions {
  withText?: boolean;
}

export interface DispatchSessionScope {
  sessionId: string;
  rootSessionId: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
}

export interface DispatchSessionService {
  open: (sessionId: string) => Promise<{
    session?: { sessionId: string; runtimeStatus: SessionRuntimeStatus | string; title?: string | null | undefined } | null;
  }>;
  list: (workspaceId?: string) => Promise<{
    items: Array<{ sessionId: string; rootSessionId: string; runtimeStatus: SessionRuntimeStatus | string }>;
    errors?: Record<string, string>;
  }>;
  history: (sessionId: string, query?: string) => Promise<DispatchHistoryPage | null>;
  send: (sessionId: string, request: PromptRequest, commandId?: string) => Promise<{ run: Run } | { ok: boolean } | void>;
}

export interface DispatchResultsDependencies {
  sessionService: DispatchSessionService;
  resolveSessionScope: (sessionId: string) => Promise<DispatchSessionScope | null>;
  dataDir: string;
  isSessionArchived?: (sessionId: string) => boolean | Promise<boolean>;
  now?: () => number;
  quietMs?: number;
  retryDelayMs?: (failures: number) => number;
  subagentRecheckMs?: number;
  settleRecheckMs?: number;
}

export interface RegisterDispatchInput {
  parentSessionId: string;
  sessionId: string;
  dispatchedAt: number;
  afterIdleId?: string | null | undefined;
}

export interface DispatchResultMessageInput {
  sessionId: string;
  title?: string;
  outcome: DispatchOutcome;
}

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

export interface DispatchResultsRuntime {
  load: () => Promise<void>;
  register: (input: RegisterDispatchInput) => Promise<{ id: string }>;
  processCanonicalEvent: (event: CanonicalEvent, scope?: DispatchSessionScope | null) => void;
  start: () => void;
  stop: () => void;
  pending: () => DispatchEntry[];
  flush: () => Promise<void>;
}

const isTextPart = (part: DispatchMessagePart): part is { type: 'text'; content: string } =>
  part.type === 'text' && typeof part.content === 'string';

const messageText = (message: DispatchMessage): string => (Array.isArray(message.parts) ? message.parts : [])
  .filter(isTextPart)
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
} as const satisfies Record<string, DispatchOutcome['state']>;

const isTerminalStatus = (status: string): status is 'completed' | 'failed' | 'cancelled' =>
  status === 'completed' || status === 'failed' || status === 'cancelled';

export const readDispatchOutcome = (
  pageOrRecords: DispatchHistoryPage | DispatchLegacyRecord[] | null | undefined,
  dispatchedAt: number,
  afterTurnOrIdleId?: string | null,
  { withText = false }: DispatchOutcomeOptions = {},
): DispatchOutcome | null => {
  if (Array.isArray(pageOrRecords)) {
    const records = pageOrRecords;
    const idleIndex = records.findIndex((record) => record?.type === 'idle');
    if (idleIndex === -1) return null;
    const idle = records[idleIndex];
    if (!idle?.time || idle.time.created === undefined) return null;
    const byOrder = afterTurnOrIdleId !== undefined;
    if (byOrder ? idle.id === afterTurnOrIdleId : idle.time.created < dispatchedAt) return null;
    const baselineIndex = byOrder && afterTurnOrIdleId !== null
      ? records.findIndex((record) => record?.id === afterTurnOrIdleId)
      : -1;
    const turnRecords = records.slice(idleIndex + 1, baselineIndex === -1 ? undefined : baselineIndex);
    const replies = turnRecords.filter(
      (record) => record?.type === 'assistant' && (byOrder || (record.time?.created ?? -Infinity) >= dispatchedAt),
    );
    const reply = replies[0];
    const assistantText = (record: DispatchLegacyRecord): string =>
      Array.isArray(record.content) ? record.content.map((part) => part?.text || '').join('') : '';
    const textReply = withText ? replies.find((candidate) => assistantText(candidate)) : reply;
    const mappedState: DispatchOutcome['state'] = idle.outcome ? OUTCOME_STATES[idle.outcome] : 'cancelled';
    return {
      state: mappedState,
      text: textReply ? assistantText(textReply) : '',
      errorMessage: reply?.error?.message?.trim() ?? '',
    };
  }
  if (!pageOrRecords || !Array.isArray(pageOrRecords.turns) || !Array.isArray(pageOrRecords.messages)) return null;
  let candidateTurns = pageOrRecords.turns;
  if (afterTurnOrIdleId) {
    const baselineIndex = candidateTurns.findIndex((candidate) => candidate.turnId === afterTurnOrIdleId);
    if (baselineIndex !== -1) {
      candidateTurns = candidateTurns.slice(baselineIndex + 1);
    }
  }
  const matchingTurns = candidateTurns.filter((candidate) => {
    if (!isTerminalStatus(candidate.status)) return false;
    if (afterTurnOrIdleId !== undefined && candidate.turnId === afterTurnOrIdleId) return false;
    return Number(candidate.finishedAt) >= dispatchedAt;
  });
  const terminalTurn = matchingTurns.at(-1);
  if (!terminalTurn || !isTerminalStatus(terminalTurn.status)) return null;
  const turnIds = new Set(matchingTurns.map((candidate) => candidate.turnId));
  const replies = pageOrRecords.messages.filter((message) => turnIds.has(message.turnId) && message.role === 'assistant');
  const text = [...replies].reverse().map((message) => messageText(message)).find((content) => content.length > 0) ?? '';
  return {
    state: OUTCOME_STATES[terminalTurn.status],
    text,
    errorMessage: isString(terminalTurn.error) ? terminalTurn.error.trim() : '',
  };
};

const outcomeBody = ({ state, text, errorMessage }: DispatchOutcome, sessionId: string): string => {
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

export const buildDispatchResultMessage = ({ sessionId, title, outcome }: DispatchResultMessageInput): DispatchResultMessage => {
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

type WatchedSessionState =
  | { kind: 'deleted' }
  | { kind: 'running' }
  | { kind: 'subagents' }
  | { kind: 'ended'; title: string; page: DispatchHistoryPage };

interface ReadyDelivery {
  entry: DispatchEntry;
  outcome: DispatchOutcome;
}

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
}: DispatchResultsDependencies): DispatchResultsRuntime {
  if (!dataDir) throw new Error('dispatch-results requires a data directory');
  const filePath = path.join(dataDir, FILE_NAME);

  const entries = new Map<string, DispatchEntry>();
  let loadPromise: Promise<void> | null = null;
  let writePromise: Promise<void> = Promise.resolve();
  let stopped = false;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, number>();
  const settleChecks = new Map<string, number>();
  const ticking = new Set<string>();

  const readFile = async (): Promise<DispatchEntry[]> => {
    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (parse(errorCodeSchema, error)?.code === 'ENOENT') return [];
      throw error;
    }
    let stored: z.output<typeof storedFileSchema> | null = null;
    let reason = 'not a dispatch results file';
    try {
      stored = parse(storedFileSchema, JSON.parse(raw));
    } catch (error) {
      reason = errorMessageOf(error);
    }
    if (!stored) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[dispatch-results] file was unreadable and moved to ${backup}: ${reason}`);
      return [];
    }
    const restored: DispatchEntry[] = [];
    for (const item of stored.entries) {
      const parsed = parse(entrySchema, item);
      if (parsed) restored.push(parsed);
    }
    return restored;
  };

  const load = (): Promise<void> => {
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

  const persist = (): Promise<void> => {
    const payload = JSON.stringify({ version: FILE_VERSION, entries: Array.from(entries.values()) });
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[dispatch-results] failed to persist pending results:', errorMessageOf(error));
    });
    return write;
  };

  const readWatchedSession = async (sessionId: string): Promise<WatchedSessionState | null> => {
    try {
      const scope = await resolveSessionScope(sessionId);
      if (!scope) return { kind: 'deleted' };
      const snapshot = await sessionService.open(sessionId);
      const session = snapshot?.session;
      if (!session) return { kind: 'deleted' };
      if (session.runtimeStatus === 'running' || session.runtimeStatus === 'awaiting_approval' || session.runtimeStatus === 'awaiting_input') {
        return { kind: 'running' };
      }
      const listed = await sessionService.list(scope.workspaceId);
      if (!listed || !Array.isArray(listed.items) || Object.keys(listed.errors ?? {}).length > 0) return null;
      if (listed.items.some((item) => item.rootSessionId === sessionId && item.sessionId !== sessionId && ['running', 'awaiting_approval', 'awaiting_input'].includes(item.runtimeStatus))) {
        return { kind: 'subagents' };
      }
      const page = await sessionService.history(sessionId, new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT) }).toString());
      if (!page || !Array.isArray(page.turns) || !Array.isArray(page.messages)) return null;
      return { kind: 'ended', title: isString(session.title) ? session.title.trim() : '', page };
    } catch (error) {
      if (isNotFound(error)) return { kind: 'deleted' };
      return null;
    }
  };

  const deliver = async (entry: DispatchEntry, message: DispatchResultMessage): Promise<boolean> => {
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
      if (isNotFound(error)) {
        console.log(`[dispatch-results] dropping the result of ${entry.sessionId}: session ${entry.parentSessionId} no longer exists`);
        return true;
      }
      throw error;
    }
  };

  const pendingFor = (sessionId: string): DispatchEntry[] =>
    Array.from(entries.values()).filter((entry) => entry.sessionId === sessionId);

  const clearTimer = (sessionId: string): void => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(sessionId);
    }
  };

  const arm = (sessionId: string, delayMs = quietMs): void => {
    if (stopped || pendingFor(sessionId).length === 0) return;
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      tick(sessionId).catch((error) => {
        console.warn('[dispatch-results] tick failed:', errorMessageOf(error));
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionId, timer);
  };

  const retryLater = (sessionId: string): void => {
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
      if (watched.kind === 'subagents') return arm(sessionId, subagentRecheckMs);

      let waiting = false;
      const ready: ReadyDelivery[] = [];
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
        const minted = new Map<string, string>();
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

      const deliveries = new Map<string, ReadyDelivery[]>();
      for (const item of ready) {
        const messageId = item.entry.messageId;
        if (!messageId) continue;
        deliveries.set(messageId, [...(deliveries.get(messageId) ?? []), item]);
      }
      for (const group of deliveries.values()) {
        const first = group[0];
        if (!first) continue;
        const { entry, outcome } = group.find((item) => item.outcome.text) ?? first;
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
      console.warn(`[dispatch-results] delivering the result of ${sessionId} failed:`, errorMessageOf(error));
      retryLater(sessionId);
    } finally {
      ticking.delete(sessionId);
    }
  }

  const reconcileAll = (): void => {
    for (const sessionId of new Set(Array.from(entries.values(), (entry) => entry.sessionId))) {
      if (!timers.has(sessionId)) arm(sessionId);
    }
  };

  const register = async ({ parentSessionId, sessionId, dispatchedAt, afterIdleId }: RegisterDispatchInput): Promise<{ id: string }> => {
    const parent = parse(sessionIdSchema, parentSessionId);
    const watched = parse(sessionIdSchema, sessionId);
    if (!parent || !watched) throw new TypeError('parentSessionId and sessionId must be session ids');
    if (parent === watched) throw new TypeError('a session cannot return its result to itself');
    const at = parse(timeSchema, dispatchedAt);
    if (at === null) throw new TypeError('dispatchedAt must be a timestamp');
    await load();
    const entry: DispatchEntry = {
      id: `dispatch-${now()}-${Math.random().toString(36).slice(2, 9)}`,
      parentSessionId: parent,
      sessionId: watched,
      dispatchedAt: at,
    };
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

  const processCanonicalEvent = (event: CanonicalEvent, scope?: DispatchSessionScope | null): void => {
    if (stopped || !event.sessionId) return;
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

  const start = (): void => {
    void load()
      .then(() => {
        if (entries.size > 0) console.log(`[dispatch-results] restored ${entries.size} pending result(s)`);
        reconcileAll();
      })
      .catch((error) => {
        console.warn('[dispatch-results] failed to load pending results:', errorMessageOf(error));
      });
  };

  const stop = (): void => {
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
