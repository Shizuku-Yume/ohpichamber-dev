// Auto-review: a review session and the session it reviews talk to each other
// until the reviewer has nothing left, without the user carrying the messages.
//
// The loop lives here, in the web server, so a closed tab or a locked phone
// does not stop it halfway. The UI creates the review session and starts a
// run; from then on this runtime does every send: the handoff request, the
// reviewer's first prompt, the feedback to the implementer and the answer back.
//
// Each step sends one prompt and waits for the end of the turn it starts, read
// the way `../dispatch-results` reads it: the session is not running, none of
// its subagents runs, and the turn the send started has finished. The reply is
// that turn's assistant message.
// The send carries a command key minted and saved before the first attempt, so
// a retry after a crash or a lost response is answered by the Host, not sent twice.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import express from 'express';
import { readDispatchOutcome } from '../dispatch-results/runtime.js';
import { createCanonicalSessionState, retainSessions } from '../canonical-session-state.js';

const FILE_NAME = 'auto-review.json';
const FILE_VERSION = 1;
const MAX_RUNS = 100;
// Re-reviews after the first. A loop that has not settled by then is going in
// circles, and more rounds mostly grow the change.
export const MAX_ROUNDS = 5;
// Idle events arrive in bursts around a turn boundary.
const QUIET_MS = 500;
const SUBAGENT_RECHECK_MS = 5_000;
// Idle, but the run's `idle` record is not there yet: a few short rechecks.
const SETTLE_RECHECK_MS = 2_000;
const SETTLE_RECHECKS = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
// A send that keeps failing is reported, so the user is not left waiting on
// a loop that no longer moves. Reads that fail stay unknown and retry.
const MAX_SEND_FAILURES = 5;
// A send carries no model: the session keeps its own selection, or its Auto routing.
const KEEP_SESSION_MODEL = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
const MESSAGE_PAGE_LIMIT = 50;
// What a client may hand in at start. The text a run builds from replies
// later (a handoff, a review) has no limit: the reply is what it is.
const PROMPT_CHAR_LIMIT = 100_000;
// A provider error can be a whole response body; the row shows one line.
const ERROR_CHAR_LIMIT = 500;
// The dispute the result row unfolds: both positions in a few lines each.
const DISPUTE_CHAR_LIMIT = 2_000;

export const FINAL_MARKER_CLEAN = 'FINAL_REVIEW_STATUS: no_remaining_findings';
export const FINAL_MARKER_DISPUTED = 'FINAL_REVIEW_STATUS: disputed';
const DISPUTE_HEADING = 'Disputed findings:';

/** Sent ahead of every reviewer prompt; the loop reads its final line. */
export const LOOP_RULES = `This review is part of an automatic review loop. End your response with one of these exact final lines when it applies:
${FINAL_MARKER_CLEAN}
when no blocker or non-blocker finding remains open. Nits never keep the loop going: list them if useful and still end with that line.
${FINAL_MARKER_DISPUTED}
when every finding still open is one the implementer declined, you already answered that decline once, and you still disagree. The user decides those, and reads only this part: just above that line, write a line "${DISPUTE_HEADING}" and then, for each such finding, the implementer's position and yours in two or three plain lines each.
While a blocker or non-blocker remains open for any other reason, leave the final line out.`;

// Boundary schemas: the only place raw JSON (the file, client bodies,
// Host answers, hub events) is inspected.
const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/);
const commandKeySchema = z.string().min(1);
const timeSchema = z.number().finite().nonnegative();
const promptSchema = z.string().max(PROMPT_CHAR_LIMIT);

const STATUSES = ['running', 'clean', 'disputed', 'limit', 'failed', 'stopped'];
const STEPS = ['handoff', 'review', 'implement'];

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
  // Present when the implementer writes a handoff first; `reviewStart` then
  // carries the `{{handoff}}` placeholder.
  handoff: z.object({ text: promptSchema.min(1), instructions: promptSchema }).optional(),
  prompts: templatesSchema,
});

const sendSchema = z.object({
  sessionID: sessionIdSchema,
  text: z.string(),
  context: z.array(z.string()),
  // Minted and stamped before the first attempt, so a retry repeats the same command.
  commandKey: commandKeySchema.optional(),
  dispatchedAt: timeSchema.optional(),
  // Delivered as the run's last word: the run settles without a reply.
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
// Enough of a stored run to tell its user it could not be restored.
const runIdentitySchema = z.object({ originalSessionID: sessionIdSchema, reviewSessionID: sessionIdSchema, directory: z.string().min(1) });
const errorCodeSchema = z.object({ code: z.string() });

const parse = (schema, value) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const retryDelay = (failures) => Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const httpError = (message, status) => Object.assign(new Error(message), { status });

const statusOf = (error) => error?.statusCode ?? error?.status;

/** One placeholder filled; the inserted text is never read for placeholders itself. */
const fill = (template, key, value) => template.replace(
  new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'),
  () => value,
);

/**
 * What the reviewer decided, read from its final line: `clean` (nothing open),
 * `disputed` (only declines it still disagrees with), or `open`. The marker
 * line is not part of the feedback the implementer gets.
 */
export const readReviewVerdict = (text) => {
  const lines = text.trimEnd().split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const last = lines.at(-1)?.trim().toLowerCase() ?? '';
  const kind = last === FINAL_MARKER_CLEAN.toLowerCase()
    ? 'clean'
    : last === FINAL_MARKER_DISPUTED.toLowerCase() ? 'disputed' : 'open';
  if (kind !== 'open') lines.pop();
  return { kind, feedback: lines.join('\n').trim() };
};

const cut = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

/**
 * The part of a disputed review the user reads: what follows the reviewer's
 * last "Disputed findings:" line (markdown emphasis or a heading mark around
 * it allowed), else the whole review, cut for the result row.
 */
export const readDisputeSummary = (feedback) => {
  const heading = DISPUTE_HEADING.toLowerCase();
  const lines = feedback.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const bare = lines[index].replace(/[#*_`>]/g, '').trim();
    if (!bare.toLowerCase().startsWith(heading)) continue;
    const rest = [bare.slice(heading.length), ...lines.slice(index + 1)].join('\n').trim();
    if (rest) return cut(rest, DISPUTE_CHAR_LIMIT);
  }
  return cut(feedback, DISPUTE_CHAR_LIMIT);
};

/** What clients see: the run without the prompts it carries. */
const toPublicRun = (run) => {
  const publicRun = {
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

export function createAutoReviewRuntime({
  globalEventHub,
  sessionService,
  broadcastUiEvent,
  // Told when a run ends on its own (not `stopped`): the one notification
  // the review sends, in place of the "ready" of each step.
  onRunEnded = null,
  dataDir,
  now = Date.now,
  quietMs = QUIET_MS,
  retryDelayMs = retryDelay,
  subagentRecheckMs = SUBAGENT_RECHECK_MS,
  settleRecheckMs = SETTLE_RECHECK_MS,
}) {
  const filePath = path.join(dataDir, FILE_NAME);

  /** originalSessionID → run */
  const runs = new Map();
  let revision = 0;
  let loadPromise = null;
  let writePromise = Promise.resolve();
  let stopped = false;
  // Until the first load settles, nobody knows which sessions a run holds.
  let startupLoadSettled = false;
  let markStartupLoadSettled = () => { };
  const startupLoad = new Promise((resolve) => { markStartupLoadSettled = resolve; });

  // In memory only: a restart starts every running run from a fresh tick.
  const timers = new Map(); // originalSessionID → timeout
  const readFailures = new Map(); // originalSessionID → consecutive failed reads
  const sendFailures = new Map(); // originalSessionID → consecutive failed sends
  const settleChecks = new Map(); // originalSessionID → rechecks spent waiting for the idle record
  const ticking = new Set();

  // --- persistence ---------------------------------------------------------

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (parse(errorCodeSchema, error)?.code === 'ENOENT') return { runs: [], revision: 0 };
      throw error;
    }
    let stored = null;
    let reason = 'not an auto-review file';
    try {
      stored = parse(storedFileSchema, JSON.parse(raw));
    } catch (error) {
      reason = error?.message ?? String(error);
    }
    if (!stored) {
      // Malformed is a failure, not "no runs": keep the bytes rather than
      // overwrite them on the next write.
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[auto-review] file was unreadable and moved to ${backup}: ${reason}`);
      return { runs: [], revision: 0 };
    }
    // One unreadable run fails alone, and shows as failed when it still says
    // whose it is, instead of vanishing along with its queue hold.
    const restored = stored.runs.map((value) => parse(runSchema, value) ?? unreadableRun(value)).filter(Boolean);
    return { runs: restored, revision: stored.revision ?? 0 };
  };

  const unreadableRun = (value) => {
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

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const run of stored.runs) if (!runs.has(run.originalSessionID)) runs.set(run.originalSessionID, run);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          // A failed read must not pass for "no runs": the next write would
          // clobber the file, so writes wait for a load that succeeds.
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = () => {
    const payload = JSON.stringify({ version: FILE_VERSION, revision, runs: Array.from(runs.values()) });
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      // Prompts and handoffs are conversation content: readable by the owner only.
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[auto-review] failed to persist runs:', error?.message ?? error);
    });
    return write;
  };

  /** Every change a client can see: bump, persist, broadcast. */
  const commit = (originalSessionID, directory) => {
    revision += 1;
    const run = runs.get(originalSessionID) ?? null;
    broadcastUiEvent?.({
      type: 'openchamber:auto-review.updated',
      properties: { revision, originalSessionID, directory, run: run ? toPublicRun(run) : null },
    });
    return persist();
  };

  const snapshot = () => ({ revision, runs: Array.from(runs.values(), toPublicRun) });

  const isRunning = (sessionID) => runs.get(sessionID)?.status === 'running';

  /**
   * Whether a turn of `sessionID` that ended at `turnEndedAt` is a step of a
   * run, either session of it: the run is running, or it settled after that
   * turn ended, since a run settles on the idle of its last step and may do
   * so before the notification asks. A turn that ends after the run settled
   * (a queued follow-up the end released) is the user's own.
   */
  const speaksFor = (sessionID, turnEndedAt) => {
    for (const run of runs.values()) {
      if (run.originalSessionID !== sessionID && run.reviewSessionID !== sessionID) continue;
      if (run.status === 'running' || run.updatedAt >= turnEndedAt) return true;
    }
    return false;
  };

  // --- canonical session access -------------------------------------------

  const sessionState = createCanonicalSessionState({ sessionService });

  // --- observation ---------------------------------------------------------

  /** originalSessionID → release of the leases that keep the run's two sessions observed. */
  const observed = new Map();
  const observing = new Set();

  /**
   * The hub delivers a session's events only while it is observed, and a run
   * learns that a turn ended from those events: both of its sessions stay
   * observed for the run's life. A failed lease is retried by the next tick.
   */
  const observe = (run) => {
    const key = run.originalSessionID;
    if (stopped || observed.has(key) || observing.has(key)) return;
    observing.add(key);
    retainSessions(globalEventHub, `auto-review:${key}`, [key, run.reviewSessionID])
      .then((release) => {
        if (stopped || runs.get(key) !== run || run.status !== 'running') {
          void release();
          return;
        }
        observed.set(key, release);
        // Events before the lease were not delivered: check the session now.
        arm(key, 0);
      })
      .catch((error) => console.warn('[auto-review] could not observe a run\'s sessions:', error?.message ?? error))
      .finally(() => observing.delete(key));
  };

  const unobserve = (originalSessionID) => {
    const release = observed.get(originalSessionID);
    observed.delete(originalSessionID);
    return release?.();
  };

  // --- loop ----------------------------------------------------------------

  const clearTimer = (originalSessionID) => {
    const existing = timers.get(originalSessionID);
    if (existing) {
      clearTimeout(existing);
      timers.delete(originalSessionID);
    }
  };

  const arm = (originalSessionID, delayMs = quietMs) => {
    if (stopped || !isRunning(originalSessionID)) return;
    clearTimer(originalSessionID);
    const timer = setTimeout(() => {
      timers.delete(originalSessionID);
      tick(originalSessionID).catch((error) => {
        console.warn('[auto-review] tick failed:', error?.message ?? error);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(originalSessionID, timer);
  };

  const forgetLoopState = (originalSessionID) => {
    clearTimer(originalSessionID);
    readFailures.delete(originalSessionID);
    sendFailures.delete(originalSessionID);
    settleChecks.delete(originalSessionID);
  };

  const settle = async (run, status, error) => {
    run.status = status;
    run.send = null;
    run.awaiting = null;
    if (error) run.error = cut(error, ERROR_CHAR_LIMIT);
    run.updatedAt = now();
    forgetLoopState(run.originalSessionID);
    void unobserve(run.originalSessionID);
    await commit(run.originalSessionID, run.directory);
    if (status !== 'stopped') {
      const ended = { sessionId: run.originalSessionID, directory: run.directory, status, error: run.error };
      Promise.resolve().then(() => onRunEnded?.(ended)).catch(() => undefined);
    }
    console.log(`[auto-review] review of ${run.originalSessionID} ended: ${status}${error ? ` (${error})` : ''}`);
  };

  /** The session that speaks next in this run: the one a send goes to, or the one awaited. */
  const watchedSessionOf = (run) => run.send?.sessionID ?? run.awaiting?.sessionID ?? null;

  /** The run may have been stopped, replaced or settled while a tick awaited. */
  const stillCurrent = (run) => runs.get(run.originalSessionID) === run && run.status === 'running';

  /** Delivers the run's pending send into an idle session. */
  const deliver = async (run) => {
    const send = run.send;
    if (!send.commandKey) {
      // Minted and saved before the first attempt: a retry repeats this command,
      // and the Host answers a repeated key without admitting the prompt again.
      send.commandKey = randomUUID();
      send.dispatchedAt = now();
      await persist();
    }
    const context = send.context.filter((text) => text.trim()).map((text) => ({ kind: 'synthetic', text }));
    await sessionService.send(send.sessionID, { input: { text: send.text, attachments: [], context }, options: KEEP_SESSION_MODEL }, send.commandKey);
    if (!stillCurrent(run)) return;
    sendFailures.delete(run.originalSessionID);
    if (send.settle) {
      await settle(run, send.settle);
      return;
    }
    run.awaiting = { sessionID: send.sessionID, dispatchedAt: send.dispatchedAt };
    run.send = null;
    run.updatedAt = now();
    await commit(run.originalSessionID, run.directory);
  };

  /** The next send after a reply, or the run's end. */
  const advance = async (run, reply) => {
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
      // The reviewer's last word still reaches the implementer: nits included.
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

  const WHO = { handoff: 'implementer', review: 'reviewer', implement: 'implementer' };

  const retryRead = (originalSessionID) => {
    const count = (readFailures.get(originalSessionID) ?? 0) + 1;
    readFailures.set(originalSessionID, count);
    arm(originalSessionID, retryDelayMs(count));
  };

  async function tick(originalSessionID) {
    if (stopped || !isRunning(originalSessionID)) return;
    // An idle event that lands while a tick reads must not be lost.
    if (ticking.has(originalSessionID)) return arm(originalSessionID);
    ticking.add(originalSessionID);
    const run = runs.get(originalSessionID);
    try {
      observe(run);
      const sessionID = watchedSessionOf(run);
      if (!sessionID) return;
      const watched = await sessionState.read(sessionID);
      if (!stillCurrent(run)) return;
      // Unknown is never idle: a failed read retries instead of acting on a guess.
      if (watched === null) return retryRead(originalSessionID);
      readFailures.delete(originalSessionID);
      if (watched.kind === 'deleted') {
        return settle(run, 'failed', sessionID === run.reviewSessionID ? 'The review session was deleted.' : 'The reviewed session was deleted.');
      }
      // Running: its next idle event re-arms the tick.
      if (watched.kind === 'running') return;
      if (watched.kind === 'subagents') return arm(originalSessionID, subagentRecheckMs);

      if (run.send) {
        try {
          await deliver(run);
        } catch (error) {
          if (!stillCurrent(run)) return;
          const count = (sendFailures.get(originalSessionID) ?? 0) + 1;
          sendFailures.set(originalSessionID, count);
          console.warn(`[auto-review] sending to ${sessionID} failed (attempt ${count}):`, error?.message ?? error);
          if (statusOf(error) === 404) return settle(run, 'failed', `The ${WHO[run.step]} session is gone.`);
          if (count >= MAX_SEND_FAILURES) return settle(run, 'failed', `Could not send to the ${WHO[run.step]}: ${error?.message ?? error}`);
          return arm(originalSessionID, retryDelayMs(count));
        }
        // A turn short enough to end inside the send leaves no idle event
        // for later; this tick finds it running or reads its end.
        return arm(originalSessionID);
      }

      const page = await sessionService.history(sessionID, new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT) }).toString()).catch(() => null);
      if (!stillCurrent(run)) return;
      if (page === null) return retryRead(originalSessionID);
      const outcome = readDispatchOutcome(page, run.awaiting.dispatchedAt);
      if (!outcome) {
        // Idle without the turn's end yet: it trails the event briefly, or the
        // prompt has not started. Short rechecks, then events take over.
        const spent = settleChecks.get(originalSessionID) ?? 0;
        if (spent < SETTLE_RECHECKS) {
          settleChecks.set(originalSessionID, spent + 1);
          arm(originalSessionID, settleRecheckMs);
        }
        return;
      }
      settleChecks.delete(originalSessionID);
      // The user stopped the turn: that stops the review too, and the row
      // says so instead of vanishing.
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

  const reconcileAll = () => {
    for (const [originalSessionID, run] of runs) {
      if (run.status !== 'running') continue;
      observe(run);
      if (!timers.has(originalSessionID)) arm(originalSessionID);
    }
  };

  // --- public --------------------------------------------------------------

  /**
   * Starts a run for a review session the UI created. With a handoff, the
   * implementer writes it first; without, the reviewer starts from the diff.
   */
  const start = async (input) => {
    const parsed = startInputSchema.safeParse(input);
    if (!parsed.success) throw new TypeError(`invalid auto-review run: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    const { originalSessionID, reviewSessionID, directory, handoff, prompts } = parsed.data;
    if (originalSessionID === reviewSessionID) throw new TypeError('a session cannot review itself');
    await load();
    if (isRunning(originalSessionID)) throw httpError('an auto-review is already running for this session', 409);
    const run = {
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
      // Not on disk: a restart would lose it, so it does not start at all.
      runs.delete(originalSessionID);
      await commit(originalSessionID, directory).catch(() => undefined);
      throw error;
    }
    // The first send waits for the session to be idle, so it never steers
    // into a turn that is still running.
    arm(originalSessionID, 0);
    return { revision, run: toPublicRun(run) };
  };

  /** Stops a running run or dismisses a finished one; either way it is gone. */
  async function remove(originalSessionIDInput) {
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

  /**
   * A canonical hub event. A watched session going idle wakes its tick, and a
   * deleted session ends a run it belongs to (or re-checks a review of it).
   */
  const processCanonicalEvent = (event) => {
    if (stopped) return;
    if (event.type === 'session.deleted') {
      for (const deletedID of event.deletedSessionIds) {
        // The reviewed session is gone: nothing is left to show the result in.
        if (runs.has(deletedID)) {
          void remove(deletedID).catch(() => undefined);
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

  let unsubscribeEvent = null;
  let unsubscribeStatus = null;

  const startRuntime = () => {
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
        // Holding every queue until a later read succeeds would strand them;
        // the runs in this file stay unknown instead.
        console.warn('[auto-review] failed to load runs:', error?.message ?? error);
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

  const stop = () => {
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
        // Ignored on teardown
      }
    }
    observed.clear();
  };

  return {
    load,
    snapshot,
    startRun: start,
    removeRun: remove,
    isRunning,
    speaksFor,
    /**
     * Whether the session's queue must wait: a run holds it, or the runs are
     * not loaded yet after a start. `startupLoad` resolves when they are.
     */
    holdsDelivery: (sessionID) => !startupLoadSettled || isRunning(sessionID),
    startupLoad,
    processCanonicalEvent,
    start: startRuntime,
    stop,
    /** Drains the pending write; tests and shutdown use it. */
    flush: () => writePromise,
  };
}

export function registerAutoReviewRoutes(app, runtime) {
  const respondError = (res, error, fallback) => {
    const status = error instanceof TypeError ? 400 : (Number.isInteger(error?.status) ? error.status : 500);
    res.status(status).json({ error: error?.message ?? fallback });
  };

  app.get('/api/auto-review', async (_req, res) => {
    try {
      await runtime.load();
      res.json(runtime.snapshot());
    } catch (error) {
      respondError(res, error, 'Failed to load auto-reviews');
    }
  });

  app.post('/api/auto-review/runs', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      res.json(await runtime.startRun(req.body));
    } catch (error) {
      respondError(res, error, 'Failed to start the auto-review');
    }
  });

  app.delete('/api/auto-review/runs/:originalSessionID', async (req, res) => {
    try {
      res.json(await runtime.removeRun(req.params.originalSessionID));
    } catch (error) {
      respondError(res, error, 'Failed to stop the auto-review');
    }
  });
}
