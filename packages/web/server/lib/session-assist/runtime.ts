<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
/**
 * Session assist lifecycle runtime.
 *
 * Next-prompt suggestions have moved to the OMP worker driver at completed
 * `agent_end`, and recaps are owned by OMP's `enableIdleMaintenance`. The Host
 * suggestion runtime, timers, metadata persistence and Jev gates are deleted.
 * This runtime observes canonical events to notify when a turn settles.
 */
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
// Background session assistance. Only live idle events arm generation; there
// is no backfill. A new turn deletes the assist this process wrote; clients
// retire any other payload older than the session's `time.idle`.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenCode } from '@opencode/client';
import { readMergedSettingsSync } from '../opencode/settings-files.js';
import { isString } from '../shared/guards.js';
import { loadAssistContext, newestContentId } from './context.js';
import { buildAssistPrompt, buildAssistSystemPrompt } from './prompt.js';

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

const getSessionAssistTargets = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  return {
    recap: settings.sessionRecapEnabled !== false,
    suggestion: settings.sessionSuggestionEnabled !== false,
  };
};

const IDLE_QUIET_MS = 60_000;
const RECAP_CHAR_LIMIT = 320;
const SUGGESTION_CHAR_LIMIT = 500;
const FETCH_TIMEOUT_MS = 5_000;
const GENERATION_TIMEOUT_MS = 120_000;
// Enough records to look past the idle marker and a couple of switches.
const TAIL_RECHECK_LIMIT = 8;
const QUIET_FAILURE_CODES = new Set(['context-too-small', 'output-exhausted']);

/**
 * A one-line cause for a generation failure: the status, code, and a bounded
 * message. A bare "generation failed" hides whether this was a cold-start 503,
 * a provider rejection, or a bug, which is what tells a transient startup
 * failure from a permanent one.
 */
const describeGenerationFailure = (error) => {
  const parts = [];
  const status = Number(error?.statusCode);
  if (Number.isFinite(status)) parts.push(`status ${status}`);
  const code = isString(error?.code) ? error.code.trim() : '';
  if (code) parts.push(`code ${code}`);
  // The small-model service rethrows raw SDK rejections, which are tagged
  // objects rather than Errors. Read the message from either shape, and keep
  // the tag when the SDK only carries that.
  const message = isString(error?.message) ? error.message.trim() : '';
  if (message) parts.push(message.replace(/\s+/g, ' ').slice(0, 300));
  const tag = isString(error?._tag) ? error._tag.trim() : '';
  if (tag) parts.push(`tag ${tag}`);
  return parts.join(' | ');
};
=======
import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenCode } from '@opencode/client';
import { readMergedSettingsSync } from '../settings/settings-files.js';
import { isString } from '../shared/guards.js';
import { sessionParentId } from '../session-lineage.js';
import { loadAssistContext, newestContentId } from './context.js';
import { buildAssistPrompt, buildAssistSystemPrompt } from './prompt.js';
import type { AssistTargets } from './contracts.js';
import type { createSessionLineage } from '../session-lineage.js';
import type { TurnEndInput } from '../session-work/runtime.js';
import type { describeSmallModel, generateSmallModelText } from '../small-model/index.js';

export interface SessionAssist {
  recap: string;
  suggestion: string;
  forMessageID: string;
  generatedAt: number;
}

export interface SessionAssistOptions {
  buildOpenCodeUrl: (route: string, query: string) => string;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  getSmallModelService: () => Promise<{
    describeSmallModel: typeof describeSmallModel;
    generateSmallModelText: typeof generateSmallModelText;
  }>;
  getTargets?: () => AssistTargets;
  quietMs?: number;
  persistSessionAssist?: ((sessionId: string, directory: string | undefined, assist: SessionAssist | null) => void) | null;
  isSessionArchived?: (sessionId: string) => Promise<boolean>;
  evaluateTurn?: ((input: TurnEndInput) => Promise<AssistTargets | null>) | null;
  lineage?: Pick<ReturnType<typeof createSessionLineage>, 'remember' | 'isChild'> | null;
  onPendingChange?: (change: { sessionId: string; directory: string | undefined; pending: boolean }) => void;
}

export interface AssistEvent {
  type?: unknown;
  properties?: {
    status?: unknown;
    info?: unknown;
    sessionID?: unknown;
    directory?: unknown;
  } | null;
}

interface EventInfo {
  type?: unknown;
  directory?: unknown;
  role?: unknown;
  sessionID?: unknown;
  time?: unknown;
}

const isEventInfo = (value: unknown): value is EventInfo => Boolean(value && typeof value === 'object');
const isEventProperties = (value: unknown): value is NonNullable<AssistEvent['properties']> => Boolean(value && typeof value === 'object');
const isNumber = (value: unknown): value is number => typeof value === 'number';
const hasCreated = (value: unknown): value is { created?: unknown } => value != null;
interface FailureFields {
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  _tag?: unknown;
}
const hasFailureFields = (value: unknown): value is FailureFields => value != null;
const isJsonObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

interface PendingRun {
  directory: string;
  armedAt: number;
  allowed: AssistTargets;
}

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

const getSessionAssistTargets = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  return {
    recap: settings.sessionRecapEnabled !== false,
    suggestion: settings.sessionSuggestionEnabled !== false,
  };
};

const IDLE_QUIET_MS = 60_000;
const RECAP_CHAR_LIMIT = 320;
const SUGGESTION_CHAR_LIMIT = 500;
const FETCH_TIMEOUT_MS = 5_000;
const GENERATION_TIMEOUT_MS = 120_000;
const TAIL_RECHECK_LIMIT = 8;
const QUIET_FAILURE_CODES = new Set(['context-too-small', 'output-exhausted']);

const describeGenerationFailure = (failure: FailureFields | undefined) => {
  const parts = [];
  const status = Number(failure?.statusCode);
  if (Number.isFinite(status)) parts.push(`status ${status}`);
  const code = isString(failure?.code) ? failure.code.trim() : '';
  if (code) parts.push(`code ${code}`);
  const message = isString(failure?.message) ? failure.message.trim() : '';
  if (message) parts.push(message.replace(/\s+/g, ' ').slice(0, 300));
  const tag = isString(failure?._tag) ? failure._tag.trim() : '';
  if (tag) parts.push(`tag ${tag}`);
  return parts.join(' | ');
};
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
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

const extractSessionStatus = (payload) => {
  if (!payload || payload.type !== 'session.status') return null;
  const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};
  const status = properties.status && typeof properties.status === 'object' ? properties.status : {};
  const info = properties.info && typeof properties.info === 'object' ? properties.info : {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const type = typeof status.type === 'string'
    ? status.type.trim()
    : (typeof info.type === 'string' ? info.type.trim() : '');
  if (!sessionId || !type) return null;
  const directory = typeof properties.directory === 'string' && properties.directory
    ? properties.directory
    : (typeof info.directory === 'string' ? info.directory : '');
  return { sessionId, type, directory };
};

const extractUserMessage = (payload) => {
  if (!payload || payload.type !== 'message.updated') return null;
  const info = payload.properties?.info;
  if (!info || typeof info !== 'object' || info.role !== 'user') return null;
  if (typeof info.sessionID !== 'string' || !info.sessionID) return null;
  return {
    sessionId: info.sessionID,
    createdAt: typeof info.time?.created === 'number' ? info.time.created : 0,
  };
};

/**
 * The recap and the suggestion live in OpenChamber's own session metadata
 * store: OpenCode 2.x accepts session metadata only when a session is created.
 * `persistSessionAssist(sessionID, directory, assist)` writes it; without that
 * seam the runtime stays inert rather than generating text it cannot save.
 */
=======
const extractJsonObject = (value: string | undefined) => {
  const text = String(value ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  for (let end = candidate.length; end > start; end -= 1) {
    if (candidate[end - 1] !== '}') continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end));
      if (isJsonObject(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const extractSessionStatus = (payload: AssistEvent | null | undefined) => {
  if (!payload || payload.type !== 'session.status') return null;
  const properties = isEventProperties(payload.properties) ? payload.properties : {};
  const status = isEventInfo(properties.status) ? properties.status : {};
  const info = isEventInfo(properties.info) ? properties.info : {};
  const sessionId = isString(properties.sessionID) ? properties.sessionID.trim() : '';
  const type = isString(status.type)
    ? status.type.trim()
    : (isString(info.type) ? info.type.trim() : '');
  if (!sessionId || !type) return null;
  const directory = isString(properties.directory) && properties.directory
    ? properties.directory
    : (isString(info.directory) ? info.directory : '');
  return { sessionId, type, directory };
};

const extractUserMessage = (payload: AssistEvent | null | undefined) => {
  if (!payload || payload.type !== 'message.updated') return null;
  const info = payload.properties?.info;
  if (!isEventInfo(info) || info.role !== 'user') return null;
  if (!isString(info.sessionID) || !info.sessionID) return null;
  return {
    sessionId: info.sessionID,
    createdAt: hasCreated(info.time) && isNumber(info.time.created) ? info.time.created : 0,
  };
};

>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
export const createSessionAssistRuntime = ({
<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
  sessionService,
  resolveSessionScope,
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
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
=======
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  getSmallModelService,
  getTargets = getSessionAssistTargets,
  quietMs = IDLE_QUIET_MS,
  persistSessionAssist = null,
  isSessionArchived = async () => false,
  evaluateTurn = null,
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
  lineage = null,
<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
  onTurnSettled = null,
} = {}) => {
  if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function') {
    throw new Error('session-assist requires the canonical session service');
  }
  if (typeof resolveSessionScope !== 'function') throw new Error('session-assist requires a session scope resolver');

  const settled = new Set();
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
  // Called with `{ sessionId, directory, pending }` when a session's assist
  // starts waiting (turn end) and when it is written, skipped, failed or
  // dropped. Clients keep a chat's OpenCode location until then: the assist
  // reads the session's directory, and reading a stopped one starts it again.
  onPendingChange = () => {},
}) => {
  const timers = new Map();
  // Turn ends waiting for `evaluateTurn`; a newer event replaces or drops the entry.
  const gates = new Map();
  const inflight = new Map();
  const ready = new Map();
  // Sessions holding an assist this process wrote, keyed to their directory.
  const persisted = new Map();
  // Sessions announced as waiting for an assist, keyed to their directory.
  const announced = new Map();
=======
  onPendingChange = () => {},
}: SessionAssistOptions) => {
  const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; armedAt: number }>();
  const gates = new Map<string, { armedAt: number }>();
  const inflight = new Map<string, { controller: AbortController; armedAt: number }>();
  const ready = new Map<string, PendingRun>();
  const persisted = new Map<string, string>();
  const announced = new Map<string, string>();
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
  let stopped = false;

<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
  const processCanonicalEvent = (event, scope) => {
    if (stopped || !event) return;
    if (event.type === 'session.deleted') {
      for (const id of event.deletedSessionIds ?? []) {
        settled.delete(id);
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
  // Announces only transitions, after every change to the four maps above.
  const announce = (sessionId, directory = '') => {
    const pending = !stopped && (gates.has(sessionId) || timers.has(sessionId)
      || inflight.has(sessionId) || ready.has(sessionId));
    if (pending === announced.has(sessionId)) return;
    const announcedDirectory = pending ? directory : announced.get(sessionId);
    if (pending) announced.set(sessionId, directory);
    else announced.delete(sessionId);
    onPendingChange({ sessionId, directory: announcedDirectory, pending });
  };

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
    announce(sessionId);
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

  // A loopback host does not prove that no model runs here: CLIProxyAPI,
  // LiteLLM and one-api all listen on 127.0.0.1 and forward to a hosted
  // vendor, where a side request evicts nothing. The skip stays on the safe
  // side of that ambiguity, but it used to return without a word, which made
  // an enabled toggle look broken (#6173). One line per model pair keeps a
  // genuine local server from repeating it every turn.
  const localSkipNotices = new Set();
  const reportLocalSkip = (providerID, modelID) => {
    const key = `${providerID}/${modelID}`;
    if (localSkipNotices.has(key)) return;
    localSkipNotices.add(key);
    console.log(`[session-assist] skipped: ${key} is served from a local endpoint and is the session's own model, so a side request would evict its prompt cache. Set a different Small Model to get a recap or a suggestion`);
  };

  const generateAssist = async (sessionId, directory, signal, allowed) => {
    const enabledTargets = getTargets();
    const targets = {
      recap: enabledTargets.recap && allowed.recap,
      suggestion: enabledTargets.suggestion && allowed.suggestion,
    };
    if (!targets.recap && !targets.suggestion) return;
    const baseUrl = buildOpenCodeUrl('/', '').replace(/\/$/, '');
    const client = OpenCode.make({
      baseUrl,
      headers: {
        ...getOpenCodeAuthHeaders(),
        // v2 scopes by header and rejects non-ASCII header values.
        ...(directory ? { 'x-opencode-directory': encodeURIComponent(directory) } : {}),
      },
    });
    const requestOptions = () => ({ signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) });
    const checkCurrent = () => {
      signal.throwIfAborted();
      if (buildOpenCodeUrl('/', '').replace(/\/$/, '') !== baseUrl) throw new Error('Session assist runtime changed');
    };
    const session = await client.session.get({ sessionID: sessionId }, requestOptions());
    checkCurrent();
    // Reverted history is not the active conversation. A new prompt clears
    // the revert boundary before its next idle event.
    if (session?.id === sessionId) lineage?.remember(sessionId, session.parentID ?? null);
    if (session?.id !== sessionId || session.parentID || session.revert?.messageID) return;
    // An archived session is put away: no recap or suggestion is generated for it.
    if (await isSessionArchived(sessionId)) return;
    const context = await loadAssistContext({
      signal,
      readPage: ({ limit, cursor }) => client.message.list(
        { sessionID: sessionId, limit, ...(cursor ? { cursor } : { order: 'desc' }) },
        requestOptions(),
      ),
    });
    checkCurrent();
    if (!context) return;
    const { last, turns } = context;
    const { describeSmallModel, generateSmallModelText } = await getSmallModelService();
    const preferredProviderID = last.providerID;
    const preferredModelID = last.modelID;
    const described = await describeSmallModel({ directory, preferredProviderID, preferredModelID });
    checkCurrent();
    if (!described) return;
    // A local server keeps one prompt cache per slot: a side request on the
    // session's own model evicts it, and the next turn reprocesses the whole
    // history. There only a different model may write the assist, however the
    // session's model was picked (fallback or an explicit Small Model).
    if (described.localEndpoint
      && described.providerID === preferredProviderID
      && described.modelID === preferredModelID) {
      reportLocalSkip(preferredProviderID, preferredModelID);
      return;
    }
    const system = buildAssistSystemPrompt(targets);
    const prompt = buildAssistPrompt(turns, targets, described.inputCharBudget - system.length - 512);
    if (!prompt) return;
    let generated;
    try {
      generated = await generateSmallModelText({
        prompt: prompt.text, system, directory,
        preferredProviderID, preferredModelID,
        onOverflow: 'error', timeoutMs: GENERATION_TIMEOUT_MS, signal,
      });
    } catch (error) {
      if (!signal.aborted && Number(error?.statusCode) !== 404 && !QUIET_FAILURE_CODES.has(error?.code)) {
        // Keep the cause: a bare "generation failed" hides whether this was a
        // cold-start 503, a provider rejection, or a bug, which is exactly what
        // the operator needs to tell a transient startup from a permanent one.
        console.warn('[session-assist] generation failed', describeGenerationFailure(error));
=======
  const announce = (sessionId: string, directory = '') => {
    const pending = !stopped && (gates.has(sessionId) || timers.has(sessionId)
      || inflight.has(sessionId) || ready.has(sessionId));
    if (pending === announced.has(sessionId)) return;
    const announcedDirectory = pending ? directory : announced.get(sessionId);
    if (pending) announced.set(sessionId, directory);
    else announced.delete(sessionId);
    onPendingChange({ sessionId, directory: announcedDirectory, pending });
  };

  const clearTimer = (sessionId: string) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing.timer);
      timers.delete(sessionId);
    }
  };

  const invalidate = (sessionId: string) => {
    clearTimer(sessionId);
    gates.delete(sessionId);
    ready.delete(sessionId);
    inflight.get(sessionId)?.controller.abort();
    announce(sessionId);
  };

  const retireStored = (sessionId: string, directory: string) => {
    if (!persisted.has(sessionId)) return;
    const storedDirectory = persisted.get(sessionId);
    persisted.delete(sessionId);
    Promise.resolve(persistSessionAssist?.(sessionId, directory || storedDirectory, null))
      .catch(() => console.warn('[session-assist] failed to retire a stale assist'));
  };

  const localSkipNotices = new Set<string>();
  const reportLocalSkip = (providerID: string | undefined, modelID: string | undefined) => {
    const key = `${providerID}/${modelID}`;
    if (localSkipNotices.has(key)) return;
    localSkipNotices.add(key);
    console.log(`[session-assist] skipped: ${key} is served from a local endpoint and is the session's own model, so a side request would evict its prompt cache. Set a different Small Model to get a recap or a suggestion`);
  };

  const generateAssist = async (sessionId: string, directory: string, signal: AbortSignal, allowed: AssistTargets) => {
    const enabledTargets = getTargets();
    const targets = {
      recap: enabledTargets.recap && allowed.recap,
      suggestion: enabledTargets.suggestion && allowed.suggestion,
    };
    if (!targets.recap && !targets.suggestion) return;
    const baseUrl = buildOpenCodeUrl('/', '').replace(/\/$/, '');
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    const client = OpenCode.make({
      baseUrl,
      headers,
    });
    const requestOptions = () => ({ signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) });
    const checkCurrent = () => {
      signal.throwIfAborted();
      if (buildOpenCodeUrl('/', '').replace(/\/$/, '') !== baseUrl) throw new Error('Session assist runtime changed');
    };
    const session = await client.session.get({ sessionID: sessionId }, requestOptions());
    checkCurrent();
    if (session?.id === sessionId) lineage?.remember(sessionId, sessionParentId(session));
    if (session?.id !== sessionId || sessionParentId(session) || session.revert?.messageID) return;
    if (await isSessionArchived(sessionId)) return;
    const context = await loadAssistContext({
      signal,
      readPage: ({ limit, cursor }: { limit: number; cursor: string | undefined }) => client.message.list(
        { sessionID: sessionId, limit, ...(cursor ? { cursor } : { order: 'desc' }) },
        requestOptions(),
      ),
    });
    checkCurrent();
    if (!context) return;
    const { last, turns } = context;
    const { describeSmallModel, generateSmallModelText } = await getSmallModelService();
    const preferredProviderID = last.providerID;
    const preferredModelID = last.modelID;
    const described = await describeSmallModel({ directory, preferredProviderID, preferredModelID });
    checkCurrent();
    if (!described) return;
    if (described.localEndpoint
      && described.providerID === preferredProviderID
      && described.modelID === preferredModelID) {
      reportLocalSkip(preferredProviderID, preferredModelID);
      return;
    }
    const system = buildAssistSystemPrompt(targets);
    const prompt = buildAssistPrompt(turns, targets, described.inputCharBudget - system.length - 512);
    if (!prompt) return;
    let generated;
    try {
      generated = await generateSmallModelText({
        prompt: prompt.text, system, directory,
        preferredProviderID, preferredModelID,
        onOverflow: 'error', timeoutMs: GENERATION_TIMEOUT_MS, signal,
      });
    } catch (error) {
      const failure = hasFailureFields(error) ? error : undefined;
      if (!signal.aborted && Number(failure?.statusCode) !== 404 && !(isString(failure?.code) && QUIET_FAILURE_CODES.has(failure.code))) {
        console.warn('[session-assist] generation failed', describeGenerationFailure(failure));
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
      }
      return;
    }
<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
    const sessionId = typeof event?.sessionId === 'string' ? event.sessionId : '';
    if (!sessionId || (scope?.sessionId && scope.sessionId !== sessionId)) return;
    if (lineage?.isChild?.(sessionId) === true) return;
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
    checkCurrent();
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
    const latestPage = await client.message.list({ sessionID: sessionId, limit: TAIL_RECHECK_LIMIT, order: 'desc' }, requestOptions());
    checkCurrent();
    if (newestContentId(latestPage?.data) !== last.id) return;
    // Never fall back to the pre-generation metadata snapshot after a failed
    // fresh read: doing so overwrites dismissals and unrelated metadata.
    const freshSession = await client.session.get({ sessionID: sessionId }, requestOptions());
    checkCurrent();
    if (freshSession?.id !== sessionId || freshSession.revert?.messageID || freshSession.location?.directory !== session.location?.directory) return;
    if (await isSessionArchived(sessionId)) return;
    // The archive check is a wait of its own: a turn that started meanwhile
    // has aborted this run, and the write below must not land.
    checkCurrent();
    const enabled = getTargets();
    if (!enabled.recap || !allowed.recap) recap = '';
    if (!enabled.suggestion || !allowed.suggestion) suggestion = '';
    if (!recap && !suggestion) return;
    await persistSessionAssist(sessionId, directory, {
      recap,
      suggestion,
      forMessageID: last.id,
      generatedAt: Date.now(),
    });
    persisted.set(sessionId, directory);
  };
=======
    checkCurrent();
    const structured = extractJsonObject(generated?.text);
    let recap = targets.recap && isString(structured?.recap) ? structured.recap.trim().slice(0, RECAP_CHAR_LIMIT) : '';
    let suggestion = targets.suggestion && isString(structured?.suggestion) ? structured.suggestion.trim().slice(0, SUGGESTION_CHAR_LIMIT) : '';
    const hasCyrillic = (text: string) => /[\u0400-\u04FF]/.test(text);
    const hasCjk = (text: string) => /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text);
    const scriptMismatch = (text: string) => prompt.language && ((hasCyrillic(text) && !hasCyrillic(prompt.language))
      || (hasCjk(text) && !hasCjk(prompt.language)));
    if (recap && scriptMismatch(recap)) recap = '';
    if (suggestion && scriptMismatch(suggestion)) suggestion = '';
    if (!recap && !suggestion) return;
    const latestPage = await client.message.list({ sessionID: sessionId, limit: TAIL_RECHECK_LIMIT, order: 'desc' }, requestOptions());
    checkCurrent();
    if (newestContentId(latestPage?.data) !== last.id) return;
    const freshSession = await client.session.get({ sessionID: sessionId }, requestOptions());
    checkCurrent();
    if (freshSession?.id !== sessionId || freshSession.revert?.messageID || freshSession.location?.directory !== session.location?.directory) return;
    if (await isSessionArchived(sessionId)) return;
    checkCurrent();
    const enabled = getTargets();
    if (!enabled.recap || !allowed.recap) recap = '';
    if (!enabled.suggestion || !allowed.suggestion) suggestion = '';
    if (!recap && !suggestion) return;
    await persistSessionAssist?.(sessionId, directory, {
      recap,
      suggestion,
      forMessageID: last.id,
      generatedAt: Date.now(),
    });
    persisted.set(sessionId, directory);
  };
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
    if (event.type === 'run.started' || event.type === 'turn.started') {
      settled.delete(sessionId);
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
  const startGeneration = (sessionId, directory, armedAt, allowed) => {
    if (stopped) return;
    if (inflight.has(sessionId)) {
      ready.set(sessionId, { directory, armedAt, allowed });
=======
  const startGeneration = (sessionId: string, directory: string, armedAt: number, allowed: AssistTargets) => {
    if (stopped) return;
    if (inflight.has(sessionId)) {
      ready.set(sessionId, { directory, armedAt, allowed });
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
      return;
    }
<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
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
        }
        announce(sessionId);
      });
  };
=======
    const controller = new AbortController();
    inflight.set(sessionId, { controller, armedAt });
    generateAssist(sessionId, directory, controller.signal, allowed)
      .catch(() => {
        if (!controller.signal.aborted) console.warn('[session-assist] failed to read or save assistance');
      })
      .finally(() => {
        inflight.delete(sessionId);
        const next = ready.get(sessionId);
        if (next) {
          ready.delete(sessionId);
          startGeneration(sessionId, next.directory, next.armedAt, next.allowed);
        }
        announce(sessionId);
      });
  };
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
    if (event.type === 'message.created' && event.role === 'user') {
      settled.delete(sessionId);
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
  const armTimer = (sessionId, directory, armedAt, allowed) => {
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      startGeneration(sessionId, directory, armedAt, allowed);
      announce(sessionId);
    }, quietMs);
    timer.unref?.();
    timers.set(sessionId, { timer, armedAt });
    announce(sessionId, directory);
  };

  const ALL_FIELDS = { recap: true, suggestion: true };

  // The quiet window is armed only for fields Jev did not rule out; with
  // nothing left there is no timer and no Small Model call at all.
  const onTurnEnd = (sessionId, directory) => {
    clearTimer(sessionId);
    const armedAt = Date.now();
    // Both fields off: nothing to generate, so nothing waits.
    const enabled = getTargets();
    if (!enabled.recap && !enabled.suggestion) {
      gates.delete(sessionId);
      announce(sessionId);
=======
  const armTimer = (sessionId: string, directory: string, armedAt: number, allowed: AssistTargets) => {
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      startGeneration(sessionId, directory, armedAt, allowed);
      announce(sessionId);
    }, quietMs);
    timer.unref?.();
    timers.set(sessionId, { timer, armedAt });
    announce(sessionId, directory);
  };

  const ALL_FIELDS = { recap: true, suggestion: true };

  const onTurnEnd = (sessionId: string, directory: string) => {
    clearTimer(sessionId);
    const armedAt = Date.now();
    const enabled = getTargets();
    if (!enabled.recap && !enabled.suggestion) {
      gates.delete(sessionId);
      announce(sessionId);
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
      return;
    }
<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
    if (typeof evaluateTurn !== 'function') {
      armTimer(sessionId, directory, armedAt, ALL_FIELDS);
      return;
    }
    const gate = { armedAt };
    gates.set(sessionId, gate);
    announce(sessionId, directory);
    Promise.resolve()
      .then(() => evaluateTurn({ sessionId, directory, assist: enabled }))
      .catch(() => null)
      .then((allowed) => {
        if (stopped || gates.get(sessionId) !== gate) return;
        gates.delete(sessionId);
        const fields = allowed ?? ALL_FIELDS;
        if (fields.recap || fields.suggestion) armTimer(sessionId, directory, armedAt, fields);
        announce(sessionId);
      });
  };
=======
    if (!evaluateTurn) {
      armTimer(sessionId, directory, armedAt, ALL_FIELDS);
      return;
    }
    const gate = { armedAt };
    gates.set(sessionId, gate);
    announce(sessionId, directory);
    Promise.resolve()
      .then(() => evaluateTurn({ sessionId, directory, assist: enabled }))
      .catch(() => null)
      .then((allowed) => {
        if (stopped || gates.get(sessionId) !== gate) return;
        gates.delete(sessionId);
        const fields = allowed ?? ALL_FIELDS;
        if (fields.recap || fields.suggestion) armTimer(sessionId, directory, armedAt, fields);
        announce(sessionId);
      });
  };
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
    const isTurnCompleted = event.type === 'run.completed' || (event.type === 'session.status' && event.runtimeStatus === 'idle');
    if (isTurnCompleted) {
      if (!settled.has(sessionId)) {
        settled.add(sessionId);
        onTurnSettled?.(sessionId);
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
  let parkedNoticeLogged = false;
  const processPayload = (payload, directoryHint = '') => {
    if (stopped) return;
    if (typeof persistSessionAssist !== 'function') {
      if (!parkedNoticeLogged) {
        parkedNoticeLogged = true;
        console.log('[session-assist] parked: no session metadata store is wired, so a recap could not be saved');
=======
  let parkedNoticeLogged = false;
  const processPayload = (payload: AssistEvent | null | undefined, directoryHint = '') => {
    if (stopped) return;
    if (!persistSessionAssist) {
      if (!parkedNoticeLogged) {
        parkedNoticeLogged = true;
        console.log('[session-assist] parked: no session metadata store is wired, so a recap could not be saved');
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
      }
      return;
    }

    if (event.type === 'run.failed' || event.type === 'run.cancelled' || (event.type === 'session.status' && event.runtimeStatus === 'unavailable')) {
      if (!settled.has(sessionId)) {
        settled.add(sessionId);
        onTurnSettled?.(sessionId);
      }
<<<<<<< HEAD:packages/web/server/lib/session-assist/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-assist/runtime.js
      else {
        invalidate(status.sessionId);
        retireStored(status.sessionId, status.directory || directoryHint);
      }
      return;
    }
    const userMessage = extractUserMessage(payload);
    if (userMessage) {
      // Ignore old message.updated events re-emitted after completion.
      const since = timers.get(userMessage.sessionId)?.armedAt
        ?? gates.get(userMessage.sessionId)?.armedAt
        ?? inflight.get(userMessage.sessionId)?.armedAt;
      if (since !== undefined && userMessage.createdAt >= since) invalidate(userMessage.sessionId);
=======
      else {
        invalidate(status.sessionId);
        retireStored(status.sessionId, status.directory || directoryHint);
      }
      return;
    }
    const userMessage = extractUserMessage(payload);
    if (userMessage) {
      const since = timers.get(userMessage.sessionId)?.armedAt
        ?? gates.get(userMessage.sessionId)?.armedAt
        ?? inflight.get(userMessage.sessionId)?.armedAt;
      if (since !== undefined && userMessage.createdAt >= since) invalidate(userMessage.sessionId);
>>>>>>> upstream/main:packages/web/server/lib/session-assist/runtime.ts
    }
  };

  const stop = () => {
    stopped = true;
    settled.clear();
  };

  return { processCanonicalEvent, stop };
};
