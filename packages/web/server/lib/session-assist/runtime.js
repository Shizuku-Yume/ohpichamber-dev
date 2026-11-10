// Background session assistance. Only live idle events arm generation; there
// is no backfill. A new turn deletes the assist this process wrote; clients
// retire any other payload older than the session's `time.idle`.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readMergedSettingsSync } from '../host/settings-files.js';
import { loadAssistContext, newestContentId } from './context.js';
import { buildAssistPrompt, buildAssistSystemPrompt } from './prompt.js';

const OPENCHAMBER_SETTINGS_FILE = path.join(
 process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'openchamber'),
 'settings.json',
);

// OMP's own `IdleMaintenance` publishes recaps now (`session.recap`, journalled
// in `history.db`), so this watcher no longer generates one: a second recap
// written from a second timeout would describe a different turn than the
// native note next to it. Only the next-step suggestion, which OMP has no
// equivalent for, still asks the Small Model.
const getSessionAssistTargets = () => {
 const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
 return {
  recap: false,
  suggestion: settings.sessionSuggestionEnabled !== false,
 };
};

const IDLE_QUIET_MS = 60_000;
const RECAP_CHAR_LIMIT = 320;
const SUGGESTION_CHAR_LIMIT = 500;
const GENERATION_TIMEOUT_MS = 120_000;
// Enough records to look past the idle marker and a couple of switches.
const TAIL_RECHECK_LIMIT = 8;
const QUIET_FAILURE_CODES = new Set(['context-too-small', 'output-exhausted']);

const extractJsonObject = (value) => {
 const text = String(value ?? '').trim();
 const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
 const candidate = (fenced?.[1] ?? text).trim();
 const start = candidate.indexOf('{');
 if (start < 0) return null;
 for (let end = candidate.length; end > start; end -= 1) {
  if (candidate[end - 1] !== '}') continue;
  try {
   const parsed = JSON.parse(candidate.slice(start, end));
   if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
   }
  } catch {
   // keep scanning — models wrap JSON in prose sometimes
  }
 }
 return null;
};


/**
 * The recap and suggestion live in OpenChamber's own session metadata store.
 * Without that persistence seam the runtime stays inert rather than generating
 * text it cannot save.
 */
export const createSessionAssistRuntime = ({
 sessionService,
 resolveSessionScope,
 getSmallModelService,
 getTargets = getSessionAssistTargets,
 quietMs = IDLE_QUIET_MS,
 persistSessionAssist = null,
 // Archive state is OpenChamber's own in v2 (no OpenCode route sets it), so
 // the runtime asks rather than reading `time.archived` off the record.
 isSessionArchived = async () => false,
 // Asked once when a turn ends, before the quiet window is armed: which of
 // the enabled fields are worth the Small Model (`{ recap, suggestion }`), or
 // null for "unknown", which keeps every enabled field. See session-work.
 evaluateTurn = null,
 // `../session-lineage.js`: a known subsession never gets an assist, so its
 // turn end arms nothing and reads nothing.
 lineage = null,
 onTurnSettled = null,
}) => {
 if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function') {
  throw new Error('session-assist requires the canonical session service');
 }
 if (typeof resolveSessionScope !== 'function') throw new Error('session-assist requires a session scope resolver');
 if (typeof getSmallModelService !== 'function') throw new Error('session-assist requires the small-model service');
 const timers = new Map();
 // Turn ends waiting for `evaluateTurn`; a newer event replaces or drops the entry.
 const gates = new Map();
 const inflight = new Map();
 const ready = new Map();
 // Sessions holding an assist this process wrote, keyed to their directory.
 const persisted = new Map();
 const settled = new Set();
 let stopped = false;

 const clearTimer = (sessionId) => {
  const existing = timers.get(sessionId);
  if (existing) {
   clearTimeout(existing.timer);
   timers.delete(sessionId);
  }
 };

 const invalidate = (sessionId) => {
  clearTimer(sessionId);
  gates.delete(sessionId);
  ready.delete(sessionId);
  inflight.get(sessionId)?.controller.abort();
  settled.delete(sessionId);
 };

 // A new turn makes the stored recap and suggestion describe an older turn:
 // delete them so "has a suggestion" in metadata means the same everywhere.
 const retireStored = (sessionId, directory) => {
  if (!persisted.has(sessionId)) return;
  const storedDirectory = persisted.get(sessionId);
  persisted.delete(sessionId);
  Promise.resolve(persistSessionAssist(sessionId, directory || storedDirectory, null))
   .catch(() => console.warn('[session-assist] failed to retire a stale assist'));
 };

 const generateAssist = async (sessionId, directory, signal, allowed) => {
  const enabledTargets = getTargets();
  const targets = {
   recap: enabledTargets.recap && allowed.recap,
   suggestion: enabledTargets.suggestion && allowed.suggestion,
  };
  if (!targets.recap && !targets.suggestion) return;
  const scope = await resolveSessionScope(sessionId);
  if (!scope) return;
  const session = await sessionService.open(sessionId);
  if (session?.session && session.session.rootSessionId !== session.session.sessionId) return;
  if (await isSessionArchived(sessionId)) return;
  const context = await loadAssistContext({
   signal,
   readPage: ({ limit, cursor }) => {
    const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
    return sessionService.history(sessionId, query.toString());
   },
  });
  if (!context) return;
  const { last, turns } = context;
  const { describeSmallModel, generateSmallModelText } = await getSmallModelService();
  const preferredProviderID = last.providerId;
  const preferredModelID = last.modelId;
  const described = await describeSmallModel({ workspaceId: scope.workspaceId, preferredProviderID, preferredModelID });
  if (!described) return;
  const system = buildAssistSystemPrompt(targets);
  const prompt = buildAssistPrompt(turns, targets, described.inputCharBudget - system.length - 512);
  if (!prompt) return;
  let generated;
  try {
   generated = await generateSmallModelText({
    prompt: prompt.text, system, workspaceId: scope.workspaceId,
    preferredProviderID, preferredModelID,
    onOverflow: 'error', timeoutMs: GENERATION_TIMEOUT_MS, signal,
   });
  } catch (error) {
   if (!signal.aborted && Number(error?.statusCode) !== 404 && !QUIET_FAILURE_CODES.has(error?.code)) {
    console.warn('[session-assist] generation failed');
   }
   return;
  }
  const structured = extractJsonObject(generated?.text);
  let recap = targets.recap && typeof structured?.recap === 'string' ? structured.recap.trim().slice(0, RECAP_CHAR_LIMIT) : '';
  let suggestion = targets.suggestion && typeof structured?.suggestion === 'string' ? structured.suggestion.trim().slice(0, SUGGESTION_CHAR_LIMIT) : '';
  const hasCyrillic = (text) => /[\u0400-\u04FF]/.test(text);
  const hasCjk = (text) => /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text);
  // Quoted source and assistant replies cannot authorize a different script.
  // With no authored language sample, leave the decision to the prompt.
  const scriptMismatch = (text) => prompt.language && ((hasCyrillic(text) && !hasCyrillic(prompt.language))
   || (hasCjk(text) && !hasCjk(prompt.language)));
  if (recap && scriptMismatch(recap)) recap = '';
  if (suggestion && scriptMismatch(suggestion)) suggestion = '';
  if (!recap && !suggestion) return;
  // v2 lists newest first. The answer is followed by its `idle` marker and
  // possibly a model or agent switch, so read a short tail and compare the
  // newest content record rather than the newest record.
  const latestPage = await sessionService.history(sessionId, new URLSearchParams({ limit: String(TAIL_RECHECK_LIMIT) }).toString());
  signal.throwIfAborted();
  if (newestContentId(latestPage?.messages) !== last.id) return;
  const freshSession = await sessionService.open(sessionId);
  if (freshSession?.session && freshSession.session.rootSessionId !== freshSession.session.sessionId) return;
  const enabled = getTargets();
  if (!enabled.recap || !allowed.recap) recap = '';
  if (!enabled.suggestion || !allowed.suggestion) suggestion = '';
  if (!recap && !suggestion) return;
  await persistSessionAssist(sessionId, directory || scope.cwd || '', {
   recap,
   suggestion,
   forMessageID: last.id,
   generatedAt: Date.now(),
  });
  persisted.set(sessionId, directory || scope.cwd || '');
 };

 const startGeneration = (sessionId, directory, armedAt, allowed) => {
  if (stopped) {
   settled.add(sessionId);
   onTurnSettled?.(sessionId);
   return;
  }
  if (inflight.has(sessionId)) {
   ready.set(sessionId, { directory, armedAt, allowed });
   return;
  }
  const controller = new AbortController();
  inflight.set(sessionId, { controller, armedAt });
  generateAssist(sessionId, directory, controller.signal, allowed)
   .catch(() => {
    if (!controller.signal.aborted) console.warn('[session-assist] failed to read or save assistance');
   })
   .finally(() => {
    inflight.delete(sessionId);
    if (ready.has(sessionId)) {
     const next = ready.get(sessionId);
     ready.delete(sessionId);
     startGeneration(sessionId, next.directory, next.armedAt, next.allowed);
    } else {
     settled.add(sessionId);
     onTurnSettled?.(sessionId);
    }
   });
 };

 const armTimer = (sessionId, directory, armedAt, allowed) => {
  clearTimer(sessionId);
  const timer = setTimeout(() => {
   timers.delete(sessionId);
   startGeneration(sessionId, directory, armedAt, allowed);
  }, quietMs);
  timer.unref?.();
  timers.set(sessionId, { timer, armedAt });
 };

 const ALL_FIELDS = { recap: true, suggestion: true };

 // The quiet window is armed only for fields Jev did not rule out; with
 // nothing left there is no timer and no Small Model call at all.
 const onTurnEnd = (sessionId, directory) => {
  if (timers.has(sessionId) || gates.has(sessionId) || inflight.has(sessionId) || persisted.has(sessionId) || settled.has(sessionId)) {
   return;
  }
  const armedAt = Date.now();
  if (typeof evaluateTurn !== 'function') {
   const enabled = getTargets();
   if (!enabled.recap && !enabled.suggestion) {
    settled.add(sessionId);
    onTurnSettled?.(sessionId);
    return;
   }
   armTimer(sessionId, directory, armedAt, ALL_FIELDS);
   return;
  }
  const gate = { armedAt };
  gates.set(sessionId, gate);
  Promise.resolve()
   .then(() => evaluateTurn({ sessionId, directory, assist: getTargets() }))
   .catch(() => null)
   .then((allowed) => {
    if (stopped || gates.get(sessionId) !== gate) {
     if (stopped) {
      settled.add(sessionId);
      onTurnSettled?.(sessionId);
     }
     return;
    }
    gates.delete(sessionId);
    const fields = allowed ?? ALL_FIELDS;
    if (!fields.recap && !fields.suggestion) {
     settled.add(sessionId);
     onTurnSettled?.(sessionId);
     return;
    }
    armTimer(sessionId, directory, armedAt, fields);
   });
 };

 let parkedNoticeLogged = false;
 const processCanonicalEvent = (event, scope) => {
  if (stopped) return;
  if (typeof persistSessionAssist !== 'function') {
   if (!parkedNoticeLogged) {
    parkedNoticeLogged = true;
    console.log('[session-assist] parked: no session metadata store is wired, so a recap could not be saved');
   }
   return;
  }
  if (event.type === 'session.deleted') {
   for (const id of event.deletedSessionIds ?? []) {
    invalidate(id);
    persisted.delete(id);
    settled.delete(id);
   }
   return;
  }
  const sessionId = typeof event?.sessionId === 'string' ? event.sessionId : '';
  if (!sessionId || (scope?.sessionId && scope.sessionId !== sessionId)) return;
  const isTurnCompleted = event.type === 'run.completed' || (event.type === 'session.status' && event.runtimeStatus === 'idle');
  if (isTurnCompleted) {
   if (lineage?.isChild(sessionId) !== true) onTurnEnd(sessionId, scope?.cwd || '');
   else if (!settled.has(sessionId)) {
    settled.add(sessionId);
    onTurnSettled?.(sessionId);
   }
   return;
  }
  if (event.type === 'run.started' || (event.type === 'session.status' && event.runtimeStatus !== 'idle')) {
   invalidate(sessionId);
   retireStored(sessionId, scope?.cwd || '');
   if (event.runtimeStatus === 'unavailable') {
    settled.add(sessionId);
    onTurnSettled?.(sessionId);
   }
   return;
  }
  if (event.type === 'run.failed' || event.type === 'run.cancelled') {
   invalidate(sessionId);
   retireStored(sessionId, scope?.cwd || '');
   settled.add(sessionId);
   onTurnSettled?.(sessionId);
   return;
  }
  if (event.type === 'message.created' && event.role === 'user') {
   const since = timers.get(sessionId)?.armedAt ?? gates.get(sessionId)?.armedAt ?? inflight.get(sessionId)?.armedAt;
   if (since !== undefined && Number(event.createdAt) >= since) invalidate(sessionId);
   settled.delete(sessionId);
  }
 };

 const stop = () => {
  stopped = true;
  const pendingSessionIds = new Set([...timers.keys(), ...gates.keys(), ...inflight.keys(), ...ready.keys()]);
  for (const sessionId of timers.keys()) clearTimer(sessionId);
  gates.clear();
  ready.clear();
  for (const { controller } of inflight.values()) controller.abort();
  for (const sessionId of pendingSessionIds) onTurnSettled?.(sessionId);
 };
 return { processCanonicalEvent, stop };
};
