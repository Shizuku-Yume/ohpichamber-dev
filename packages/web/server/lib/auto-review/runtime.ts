import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import express from 'express';
import type { CanonicalEvent, PromptRequest, Run, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { readDispatchOutcome, type DispatchHistoryPage } from '../dispatch-results/runtime.js';
import { createCanonicalSessionState, retainSessions } from '../canonical-session-state.js';
import { controlErrorFields } from '../openchamber-control/error.js';
import { isString } from '../shared/guards.js';
import type { Application, Response } from '../shared/http-contracts.js';
import type { JsonValue } from '../shared/json-values.js';

const FILE_NAME = 'auto-review.json';
const FILE_VERSION = 1;
const MAX_RUNS = 100;
export const MAX_ROUNDS = 5;
const QUIET_MS = 500;
const SUBAGENT_RECHECK_MS = 5_000;
const SETTLE_RECHECK_MS = 2_000;
const SETTLE_RECHECKS = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const MAX_SEND_FAILURES = 5;
const KEEP_SESSION_MODEL: PromptRequest['options'] = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
const MESSAGE_PAGE_LIMIT = 50;
const PROMPT_CHAR_LIMIT = 100_000;
const ERROR_CHAR_LIMIT = 500;
const DISPUTE_CHAR_LIMIT = 2_000;

export const FINAL_MARKER_CLEAN = 'FINAL_REVIEW_STATUS: no_remaining_findings';
export const FINAL_MARKER_DISPUTED = 'FINAL_REVIEW_STATUS: disputed';
const DISPUTE_HEADING = 'Disputed findings:';

export const LOOP_RULES = `This review is part of an automatic review loop. End your response with one of these exact final lines when it applies:
${FINAL_MARKER_CLEAN}
when no blocker or non-blocker finding remains open. Nits never keep the loop going: list them if useful and still end with that line.
${FINAL_MARKER_DISPUTED}
when every finding still open is one the implementer declined, you already answered that decline once, and you still disagree. The user decides those, and reads only this part: just above that line, write a line "${DISPUTE_HEADING}" and then, for each such finding, the implementer's position and yours in two or three plain lines each.
While a blocker or non-blocker remains open for any other reason, leave the final line out.`;

const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/);
const commandKeySchema = z.string().min(1);
const timeSchema = z.number().finite().nonnegative();
const promptSchema = z.string().max(PROMPT_CHAR_LIMIT);

const STATUSES = ['running', 'clean', 'disputed', 'limit', 'failed', 'stopped'] as const;
const STEPS = ['handoff', 'review', 'implement'] as const;

export type AutoReviewStatus = (typeof STATUSES)[number];
export type AutoReviewStep = (typeof STEPS)[number];

const templatesSchema = z.object({
  reviewStart: promptSchema,
  reviewRules: promptSchema,
  feedbackToImplementer: promptSchema,
  responseToReviewer: promptSchema,
});

const startInputSchema = z.object({
  originalSessionID: sessionIdSchema,
  reviewSessionID: sessionIdSchema,
  directory: z.string().trim().min(1),
  handoff: z.object({ text: promptSchema.min(1), instructions: promptSchema }).optional(),
  prompts: templatesSchema,
});

const sendSchema = z.object({
  sessionID: sessionIdSchema,
  text: z.string(),
  context: z.array(z.string()),
  commandKey: commandKeySchema.optional(),
  dispatchedAt: timeSchema.optional(),
  settle: z.literal('clean').optional(),
});

const runSchema = z.object({
  originalSessionID: sessionIdSchema,
  reviewSessionID: sessionIdSchema,
  directory: z.string().min(1),
  status: z.enum(STATUSES),
  step: z.enum(STEPS),
  round: z.number().int().nonnegative(),
  prompts: templatesSchema,
  send: sendSchema.nullable(),
  awaiting: z.object({ sessionID: sessionIdSchema, dispatchedAt: timeSchema }).nullable(),
  error: z.string().optional(),
  dispute: z.string().optional(),
  startedAt: timeSchema,
  updatedAt: timeSchema,
});

const storedFileSchema = z.object({ revision: z.number().int().nonnegative().optional(), runs: z.array(z.unknown()) });
const runIdentitySchema = z.object({ originalSessionID: sessionIdSchema, reviewSessionID: sessionIdSchema, directory: z.string().min(1) });
const errorCodeSchema = z.object({ code: z.string() });

type AutoReviewRun = z.output<typeof runSchema>;
export type StartAutoReviewInput = z.input<typeof startInputSchema>;

export interface PublicAutoReviewRun {
  originalSessionID: string;
  reviewSessionID: string;
  directory: string;
  status: AutoReviewStatus;
  step: AutoReviewStep;
  round: number;
  maxRounds: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
  dispute?: string;
}

export interface AutoReviewSnapshot {
  revision: number;
  runs: PublicAutoReviewRun[];
}

export interface AutoReviewUpdatedEvent {
  type: 'openchamber:auto-review.updated';
  properties: {
    revision: number;
    originalSessionID: string;
    directory: string;
    run: PublicAutoReviewRun | null;
  };
}

export interface AutoReviewEndedEvent {
  sessionId: string;
  directory: string;
  status: Exclude<AutoReviewStatus, 'running' | 'stopped'>;
  error?: string | undefined;
}

export interface AutoReviewEventHub {
  subscribeEvent: (listener: (event: CanonicalEvent) => void) => () => void;
  subscribeStatus: (listener: (status: { type: string; sessionId?: string }) => void) => () => void;
  retainSession: (sessionId: string, leaseKey: string) => Promise<{ release: () => Promise<void> | void }>;
}

export interface AutoReviewSessionService {
  open: (sessionId: string) => Promise<{
    session?: { sessionId: string; runtimeStatus: SessionRuntimeStatus | string; workspaceId: string } | null;
  }>;
  list: (workspaceId?: string) => Promise<{
    items: Array<{ sessionId: string; parentSessionId?: string | null | undefined; runtimeStatus: SessionRuntimeStatus | string }>;
  }>;
  history: (sessionId: string, query?: string) => Promise<DispatchHistoryPage | null>;
  send: (sessionId: string, request: PromptRequest, commandKey?: string) => Promise<{ run: Run } | { ok: boolean } | void>;
}

export interface AutoReviewDependencies {
  globalEventHub?: AutoReviewEventHub | null;
  sessionService: AutoReviewSessionService;
  broadcastUiEvent?: ((event: AutoReviewUpdatedEvent) => void) | null;
  onRunEnded?: ((event: AutoReviewEndedEvent) => void | Promise<void>) | null;
  dataDir: string;
  now?: () => number;
  quietMs?: number;
  retryDelayMs?: (failures: number) => number;
  subagentRecheckMs?: number;
  settleRecheckMs?: number;
}

export interface AutoReviewRoutesRuntime {
  load: () => Promise<void>;
  snapshot: () => AutoReviewSnapshot;
  startRun: (input: StartAutoReviewInput | JsonValue | undefined) => Promise<{ revision: number; run: PublicAutoReviewRun }>;
  removeRun: (originalSessionIDInput: string) => Promise<{ revision: number; run: null }>;
}

export interface AutoReviewRuntime extends AutoReviewRoutesRuntime {
  isRunning: (sessionID: string) => boolean;
  speaksFor: (sessionID: string, turnEndedAt: number) => boolean;
  holdsDelivery: (sessionID: string) => boolean;
  startupLoad: Promise<void>;
  processCanonicalEvent: (event: CanonicalEvent) => void;
  start: () => () => void;
  stop: () => void;
  flush: () => Promise<void>;
}

export interface AutoReviewVerdict {
  kind: 'clean' | 'disputed' | 'open';
  feedback: string;
}

const parse = <S extends z.ZodType>(schema: S, value: Parameters<S['safeParse']>[0]): z.output<S> | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const isInteger = (value: unknown): value is number => Number.isInteger(value);

const errorMessageOf = (cause: Parameters<typeof controlErrorFields>[0]): string | undefined => {
  const message = controlErrorFields(cause)?.message;
  return isString(message) ? message : undefined;
};

const statusOf = (cause: Parameters<typeof controlErrorFields>[0]): number | null => {
  const fields = controlErrorFields(cause);
  const raw = fields?.statusCode ?? fields?.status;
  return isInteger(raw) ? raw : null;
};

const retryDelay = (failures: number): number =>
  Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const httpError = (message: string, status: number): Error & { status: number } =>
  Object.assign(new Error(message), { status });

const fill = (template: string, key: string, value: string): string => template.replace(
  new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'),
  () => value,
);

export const readReviewVerdict = (text: string): AutoReviewVerdict => {
  const lines = text.trimEnd().split('\n');
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  const last = lines.at(-1)?.trim().toLowerCase() ?? '';
  const kind = last === FINAL_MARKER_CLEAN.toLowerCase()
    ? 'clean'
    : last === FINAL_MARKER_DISPUTED.toLowerCase() ? 'disputed' : 'open';
  if (kind !== 'open') lines.pop();
  return { kind, feedback: lines.join('\n').trim() };
};

const cut = (text: string, limit: number): string => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

export const readDisputeSummary = (feedback: string): string => {
  const heading = DISPUTE_HEADING.toLowerCase();
  const lines = feedback.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const bare = line.replace(/[#*_`>]/g, '').trim();
    if (!bare.toLowerCase().startsWith(heading)) continue;
    const rest = [bare.slice(heading.length), ...lines.slice(index + 1)].join('\n').trim();
    if (rest) return cut(rest, DISPUTE_CHAR_LIMIT);
  }
  return cut(feedback, DISPUTE_CHAR_LIMIT);
};

const toPublicRun = (run: AutoReviewRun): PublicAutoReviewRun => {
  const publicRun: PublicAutoReviewRun = {
    originalSessionID: run.originalSessionID,
    reviewSessionID: run.reviewSessionID,
    directory: run.directory,
    status: run.status,
    step: run.step,
    round: run.round,
    maxRounds: MAX_ROUNDS,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
  };
  if (run.error) publicRun.error = run.error;
  if (run.dispute) publicRun.dispute = run.dispute;
  return publicRun;
};

const WHO = {
  handoff: 'implementer',
  review: 'reviewer',
  implement: 'implementer',
} satisfies Record<AutoReviewStep, string>;

export function createAutoReviewRuntime({
  globalEventHub = null,
  sessionService,
  broadcastUiEvent = null,
  onRunEnded = null,
  dataDir,
  now = Date.now,
  quietMs = QUIET_MS,
  retryDelayMs = retryDelay,
  subagentRecheckMs = SUBAGENT_RECHECK_MS,
  settleRecheckMs = SETTLE_RECHECK_MS,
}: AutoReviewDependencies): AutoReviewRuntime {
  const filePath = path.join(dataDir, FILE_NAME);

  const runs = new Map<string, AutoReviewRun>();
  let revision = 0;
  let loadPromise: Promise<void> | null = null;
  let writePromise: Promise<void> = Promise.resolve();
  let stopped = false;
  let startupLoadSettled = false;
  let markStartupLoadSettled: () => void = () => { };
  const startupLoad = new Promise<void>((resolve) => { markStartupLoadSettled = resolve; });

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const readFailures = new Map<string, number>();
  const sendFailures = new Map<string, number>();
  const settleChecks = new Map<string, number>();
  const ticking = new Set<string>();

  const unreadableRun = (value: Parameters<typeof runIdentitySchema.safeParse>[0]): AutoReviewRun | null => {
    const identity = parse(runIdentitySchema, value);
    if (!identity) return null;
    const at = now();
    return {
      ...identity,
      status: 'failed',
      step: 'review',
      round: 0,
      prompts: { reviewStart: '', reviewRules: '', feedbackToImplementer: '', responseToReviewer: '' },
      send: null,
      awaiting: null,
      error: 'The saved review could not be read after a restart.',
      startedAt: at,
      updatedAt: at,
    };
  };

  const readFile = async (): Promise<{ runs: AutoReviewRun[]; revision: number }> => {
    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (parse(errorCodeSchema, error)?.code === 'ENOENT') return { runs: [], revision: 0 };
      throw error;
    }
    let stored: z.output<typeof storedFileSchema> | null = null;
    let reason = 'not an auto-review file';
    try {
      stored = parse(storedFileSchema, JSON.parse(raw));
    } catch (error) {
      reason = errorMessageOf(error) ?? String(error);
    }
    if (!stored) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[auto-review] file was unreadable and moved to ${backup}: ${reason}`);
      return { runs: [], revision: 0 };
    }
    const restored: AutoReviewRun[] = [];
    for (const value of stored.runs) {
      const parsed = parse(runSchema, value) ?? unreadableRun(value);
      if (parsed) restored.push(parsed);
    }
    return { runs: restored, revision: stored.revision ?? 0 };
  };

  const load = (): Promise<void> => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const run of stored.runs) if (!runs.has(run.originalSessionID)) runs.set(run.originalSessionID, run);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = (): Promise<void> => {
    const payload = JSON.stringify({ version: FILE_VERSION, revision, runs: Array.from(runs.values()) });
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[auto-review] failed to persist runs:', errorMessageOf(error) ?? error);
    });
    return write;
  };

  const commit = (originalSessionID: string, directory: string): Promise<void> => {
    revision += 1;
    const run = runs.get(originalSessionID) ?? null;
    broadcastUiEvent?.({
      type: 'openchamber:auto-review.updated',
      properties: { revision, originalSessionID, directory, run: run ? toPublicRun(run) : null },
    });
    return persist();
  };

  const snapshot = (): AutoReviewSnapshot => ({ revision, runs: Array.from(runs.values(), toPublicRun) });

  const isRunning = (sessionID: string): boolean => runs.get(sessionID)?.status === 'running';

  const speaksFor = (sessionID: string, turnEndedAt: number): boolean => {
    for (const run of runs.values()) {
      if (run.originalSessionID !== sessionID && run.reviewSessionID !== sessionID) continue;
      if (run.status === 'running' || run.updatedAt >= turnEndedAt) return true;
    }
    return false;
  };

  const sessionState = createCanonicalSessionState({ sessionService });

  const observed = new Map<string, () => Promise<void>>();
  const observing = new Set<string>();

  const observe = (run: AutoReviewRun): void => {
    const key = run.originalSessionID;
    if (!globalEventHub || stopped || observed.has(key) || observing.has(key)) return;
    observing.add(key);
    retainSessions(globalEventHub, `auto-review:${key}`, [key, run.reviewSessionID])
      .then((release) => {
        if (stopped || runs.get(key) !== run || run.status !== 'running') {
          void release();
          return;
        }
        observed.set(key, release);
        arm(key, 0);
      })
      .catch((error) => console.warn('[auto-review] could not observe a run\'s sessions:', errorMessageOf(error) ?? error))
      .finally(() => observing.delete(key));
  };

  const unobserve = (originalSessionID: string): Promise<void> | undefined => {
    const release = observed.get(originalSessionID);
    observed.delete(originalSessionID);
    return release?.();
  };

  const clearTimer = (originalSessionID: string): void => {
    const existing = timers.get(originalSessionID);
    if (existing) {
      clearTimeout(existing);
      timers.delete(originalSessionID);
    }
  };

  const arm = (originalSessionID: string, delayMs = quietMs): void => {
    if (stopped || !isRunning(originalSessionID)) return;
    clearTimer(originalSessionID);
    const timer = setTimeout(() => {
      timers.delete(originalSessionID);
      tick(originalSessionID).catch((error) => {
        console.warn('[auto-review] tick failed:', errorMessageOf(error) ?? error);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(originalSessionID, timer);
  };

  const forgetLoopState = (originalSessionID: string): void => {
    clearTimer(originalSessionID);
    readFailures.delete(originalSessionID);
    sendFailures.delete(originalSessionID);
    settleChecks.delete(originalSessionID);
  };

  const settle = async (run: AutoReviewRun, status: Exclude<AutoReviewStatus, 'running'>, error?: string): Promise<void> => {
    run.status = status;
    run.send = null;
    run.awaiting = null;
    if (error) run.error = cut(error, ERROR_CHAR_LIMIT);
    run.updatedAt = now();
    forgetLoopState(run.originalSessionID);
    void unobserve(run.originalSessionID);
    await commit(run.originalSessionID, run.directory);
    if (status !== 'stopped') {
      const ended: AutoReviewEndedEvent = { sessionId: run.originalSessionID, directory: run.directory, status, error: run.error };
      Promise.resolve().then(() => onRunEnded?.(ended)).catch(() => undefined);
    }
    console.log(`[auto-review] review of ${run.originalSessionID} ended: ${status}${error ? ` (${error})` : ''}`);
  };

  const watchedSessionOf = (run: AutoReviewRun): string | null => run.send?.sessionID ?? run.awaiting?.sessionID ?? null;

  const stillCurrent = (run: AutoReviewRun): boolean => runs.get(run.originalSessionID) === run && run.status === 'running';

  const deliver = async (run: AutoReviewRun): Promise<void> => {
    const send = run.send;
    if (!send) return;
    if (!send.commandKey || send.dispatchedAt === undefined) {
      send.commandKey = send.commandKey ?? randomUUID();
      send.dispatchedAt = send.dispatchedAt ?? now();
      await persist();
    }
    const dispatchedAt = send.dispatchedAt;
    const context = send.context.filter((text) => text.trim()).map((text) => ({ kind: 'synthetic' as const, text }));
    await sessionService.send(send.sessionID, { input: { text: send.text, attachments: [], context }, options: KEEP_SESSION_MODEL }, send.commandKey);
    if (!stillCurrent(run)) return;
    sendFailures.delete(run.originalSessionID);
    if (send.settle) {
      await settle(run, send.settle);
      return;
    }
    run.awaiting = { sessionID: send.sessionID, dispatchedAt };
    run.send = null;
    run.updatedAt = now();
    await commit(run.originalSessionID, run.directory);
  };

  const advance = async (run: AutoReviewRun, reply: string): Promise<void> => {
    run.awaiting = null;
    run.updatedAt = now();
    if (run.step === 'handoff') {
      run.step = 'review';
      run.send = {
        sessionID: run.reviewSessionID,
        text: fill(run.prompts.reviewStart, 'handoff', reply),
        context: [run.prompts.reviewRules, LOOP_RULES],
      };
    } else if (run.step === 'review') {
      const verdict = readReviewVerdict(reply);
      if (verdict.kind === 'disputed') {
        if (verdict.feedback) run.dispute = readDisputeSummary(verdict.feedback);
        return settle(run, 'disputed');
      }
      if (verdict.kind === 'clean' && !verdict.feedback) return settle(run, 'clean');
      run.step = 'implement';
      run.send = {
        sessionID: run.originalSessionID,
        text: fill(run.prompts.feedbackToImplementer, 'review_feedback', verdict.feedback),
        context: [],
      };
      if (verdict.kind === 'clean') run.send.settle = 'clean';
    } else {
      if (run.round >= MAX_ROUNDS) return settle(run, 'limit');
      run.round += 1;
      run.step = 'review';
      run.send = {
        sessionID: run.reviewSessionID,
        text: fill(run.prompts.responseToReviewer, 'implementation_response', reply),
        context: [LOOP_RULES],
      };
    }
    await commit(run.originalSessionID, run.directory);
    arm(run.originalSessionID, 0);
  };

  const retryRead = (originalSessionID: string): void => {
    const count = (readFailures.get(originalSessionID) ?? 0) + 1;
    readFailures.set(originalSessionID, count);
    arm(originalSessionID, retryDelayMs(count));
  };

  async function tick(originalSessionID: string): Promise<void> {
    if (stopped || !isRunning(originalSessionID)) return;
    if (ticking.has(originalSessionID)) return arm(originalSessionID);
    ticking.add(originalSessionID);
    const run = runs.get(originalSessionID);
    if (!run) {
      ticking.delete(originalSessionID);
      return;
    }
    try {
      observe(run);
      const sessionID = watchedSessionOf(run);
      if (!sessionID) return;
      const watched = await sessionState.read(sessionID);
      if (!stillCurrent(run)) return;
      if (watched === null) return retryRead(originalSessionID);
      readFailures.delete(originalSessionID);
      if (watched.kind === 'deleted') {
        return settle(run, 'failed', sessionID === run.reviewSessionID ? 'The review session was deleted.' : 'The reviewed session was deleted.');
      }
      if (watched.kind === 'running') return;
      if (watched.kind === 'subagents') return arm(originalSessionID, subagentRecheckMs);

      if (run.send) {
        try {
          await deliver(run);
        } catch (error) {
          if (!stillCurrent(run)) return;
          const count = (sendFailures.get(originalSessionID) ?? 0) + 1;
          sendFailures.set(originalSessionID, count);
          const detail = errorMessageOf(error) ?? String(error);
          console.warn(`[auto-review] sending to ${sessionID} failed (attempt ${count}):`, detail);
          if (statusOf(error) === 404) return settle(run, 'failed', `The ${WHO[run.step]} session is gone.`);
          if (count >= MAX_SEND_FAILURES) return settle(run, 'failed', `Could not send to the ${WHO[run.step]}: ${detail}`);
          return arm(originalSessionID, retryDelayMs(count));
        }
        return arm(originalSessionID);
      }

      const awaiting = run.awaiting;
      if (!awaiting) return;
      const page = await sessionService.history(sessionID, new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT) }).toString()).catch(() => null);
      if (!stillCurrent(run)) return;
      if (page === null) return retryRead(originalSessionID);
      const outcome = readDispatchOutcome(page, awaiting.dispatchedAt);
      if (!outcome) {
        const spent = settleChecks.get(originalSessionID) ?? 0;
        if (spent < SETTLE_RECHECKS) {
          settleChecks.set(originalSessionID, spent + 1);
          arm(originalSessionID, settleRecheckMs);
        }
        return;
      }
      settleChecks.delete(originalSessionID);
      if (outcome.state === 'cancelled') return settle(run, 'stopped');
      if (outcome.state === 'error') {
        return settle(run, 'failed', outcome.errorMessage ? `The ${WHO[run.step]}'s turn failed: ${outcome.errorMessage}` : `The ${WHO[run.step]}'s turn failed.`);
      }
      if (!outcome.text) return settle(run, 'failed', `The ${WHO[run.step]} finished without a text reply.`);
      await advance(run, outcome.text);
    } finally {
      ticking.delete(originalSessionID);
    }
  }

  const reconcileAll = (): void => {
    for (const [originalSessionID, run] of runs) {
      if (run.status !== 'running') continue;
      observe(run);
      if (!timers.has(originalSessionID)) arm(originalSessionID);
    }
  };

  const startRun = async (input: StartAutoReviewInput | JsonValue | undefined): Promise<{ revision: number; run: PublicAutoReviewRun }> => {
    const parsed = startInputSchema.safeParse(input);
    if (!parsed.success) throw new TypeError(`invalid auto-review run: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    const { originalSessionID, reviewSessionID, directory, handoff, prompts } = parsed.data;
    if (originalSessionID === reviewSessionID) throw new TypeError('a session cannot review itself');
    await load();
    if (isRunning(originalSessionID)) throw httpError('an auto-review is already running for this session', 409);
    const run: AutoReviewRun = {
      originalSessionID,
      reviewSessionID,
      directory,
      status: 'running',
      step: handoff ? 'handoff' : 'review',
      round: 0,
      prompts,
      send: handoff
        ? { sessionID: originalSessionID, text: handoff.text, context: [handoff.instructions] }
        : { sessionID: reviewSessionID, text: prompts.reviewStart, context: [prompts.reviewRules, LOOP_RULES] },
      awaiting: null,
      startedAt: now(),
      updatedAt: now(),
    };
    runs.set(originalSessionID, run);
    if (runs.size > MAX_RUNS) {
      const oldest = Array.from(runs.values())
        .filter((candidate) => candidate.status !== 'running')
        .sort((left, right) => left.updatedAt - right.updatedAt)
        .slice(0, runs.size - MAX_RUNS);
      for (const stale of oldest) runs.delete(stale.originalSessionID);
    }
    forgetLoopState(originalSessionID);
    try {
      await commit(originalSessionID, directory);
    } catch (error) {
      runs.delete(originalSessionID);
      await commit(originalSessionID, directory).catch(() => undefined);
      throw error;
    }
    arm(originalSessionID, 0);
    return { revision, run: toPublicRun(run) };
  };

  async function removeRun(originalSessionIDInput: string): Promise<{ revision: number; run: null }> {
    const originalSessionID = parse(sessionIdSchema, originalSessionIDInput);
    if (!originalSessionID) throw new TypeError('originalSessionID is invalid');
    await load();
    const run = runs.get(originalSessionID);
    if (!run) return { revision, run: null };
    runs.delete(originalSessionID);
    forgetLoopState(originalSessionID);
    void unobserve(originalSessionID);
    await commit(originalSessionID, run.directory);
    return { revision, run: null };
  }

  const processCanonicalEvent = (event: CanonicalEvent): void => {
    if (stopped) return;
    if (event.type === 'session.deleted') {
      for (const deletedID of event.deletedSessionIds) {
        if (runs.has(deletedID)) {
          void removeRun(deletedID).catch(() => undefined);
          continue;
        }
        for (const run of runs.values()) {
          if (run.reviewSessionID === deletedID && run.status === 'running') arm(run.originalSessionID, 0);
        }
      }
      return;
    }
    const isIdle = (event.type === 'session.status' && event.runtimeStatus === 'idle')
      || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled';
    const isBusy = (event.type === 'session.status' && event.runtimeStatus !== 'idle')
      || event.type === 'run.started';
    if (!isIdle && !isBusy) return;
    for (const run of runs.values()) {
      if (run.status !== 'running' || watchedSessionOf(run) !== event.sessionId) continue;
      if (isIdle) {
        settleChecks.delete(run.originalSessionID);
        arm(run.originalSessionID);
      } else {
        clearTimer(run.originalSessionID);
      }
    }
  };

  let unsubscribeEvent: (() => void) | null | undefined = null;
  let unsubscribeStatus: (() => void) | null | undefined = null;

  const startRuntime = (): (() => void) => {
    unsubscribeEvent?.();
    unsubscribeStatus?.();
    unsubscribeEvent = globalEventHub?.subscribeEvent(processCanonicalEvent);
    unsubscribeStatus = globalEventHub?.subscribeStatus((hubStatus) => {
      if (hubStatus?.type === 'connect') reconcileAll();
    });
    void load()
      .then(() => {
        const running = Array.from(runs.values()).filter((run) => run.status === 'running').length;
        if (running > 0) console.log(`[auto-review] resuming ${running} running review(s)`);
        reconcileAll();
      })
      .catch((error) => {
        console.warn('[auto-review] failed to load runs:', errorMessageOf(error) ?? error);
      })
      .finally(() => {
        startupLoadSettled = true;
        markStartupLoadSettled();
      });
    return () => {
      unsubscribeEvent?.();
      unsubscribeStatus?.();
      unsubscribeEvent = null;
      unsubscribeStatus = null;
    };
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    unsubscribeEvent?.();
    unsubscribeStatus?.();
    unsubscribeEvent = null;
    unsubscribeStatus = null;
    for (const release of observed.values()) {
      try {
        void release?.();
      } catch {
        void 0;
      }
    }
    observed.clear();
  };

  return {
    load,
    snapshot,
    startRun,
    removeRun,
    isRunning,
    speaksFor,
    holdsDelivery: (sessionID: string) => !startupLoadSettled || isRunning(sessionID),
    startupLoad,
    processCanonicalEvent,
    start: startRuntime,
    stop,
    flush: () => writePromise,
  };
}

const json64 = express.json({ limit: '64kb' });

export function registerAutoReviewRoutes(app: Application, runtime: AutoReviewRoutesRuntime): void {
  const respondError = (res: Response, cause: Parameters<typeof controlErrorFields>[0], fallback: string): void => {
    const rawStatus = statusOf(cause);
    const status = cause instanceof TypeError ? 400 : (rawStatus !== null ? rawStatus : 500);
    res.status(status).json({ error: errorMessageOf(cause) ?? fallback });
  };

  app.get('/api/auto-review', async (_req, res) => {
    try {
      await runtime.load();
      res.json(runtime.snapshot());
    } catch (error) {
      respondError(res, error, 'Failed to load auto-reviews');
    }
  });

  app.post<JsonValue | undefined>('/api/auto-review/runs', json64, async (req, res) => {
    try {
      res.json(await runtime.startRun(req.body));
    } catch (error) {
      respondError(res, error, 'Failed to start the auto-review');
    }
  });

  app.delete('/api/auto-review/runs/:originalSessionID', async (req, res) => {
    try {
      res.json(await runtime.removeRun(req.params.originalSessionID ?? ''));
    } catch (error) {
      respondError(res, error, 'Failed to stop the auto-review');
    }
  });
}
