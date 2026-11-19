import express from 'express';
import { z } from 'zod';
import { PERMISSION_MODES, isAutoAnsweringMode, isPermissionMode, toPermissionMode } from './modes.js';
import { sessionParentId } from '../session-lineage.js';
import { isJsonObject, isString } from '../event-stream/guards.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';
import type { Application } from '../shared/http-contracts.js';
import type { GlobalStreamEvent } from '../event-stream/global-hub.js';
import type { PermissionMode } from './modes.js';
import type { CachedSession, PermissionAutoAcceptOptions, PermissionDirectory, PermissionOutcome, PermissionPolicy, PermissionPolicySnapshot, PermissionRequestHeaders } from './contracts.js';

const SETTINGS_KEY = 'permissionAutoAccept';
const DEFAULT_MODE_SETTINGS_KEY = 'permissionDefaultMode';
const OUTCOME_CACHE_LIMIT = 1000;
const HELD_BROADCAST_LIMIT = 5000;

const storedEntrySchema = z.union([z.boolean(), z.enum(PERMISSION_MODES)]).nullable().catch(null);
const storedPolicySchema = z.object({
 sessions: z.record(z.string().min(1), storedEntrySchema).catch({}).default({}),
 revision: z.number().int().nonnegative().catch(0).default(0),
}).catch({ sessions: {}, revision: 0 });

const readStoredPolicy = (value: JsonValue | undefined) => storedPolicySchema.parse(value ?? {});

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
const hasLegacyEntries = (stored) => Object.values(stored.sessions).some((entry) => entry === true || entry === false);
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
const createdSessionSchema = z.object({ id: z.string().min(1), parentID: z.string().nullish() });
const forkedSessionSchema = z.object({ sessionID: z.string().min(1), parentID: z.string().min(1) })
  .refine(({ sessionID, parentID }) => sessionID !== parentID);

const hasLegacyEntries = (stored) => Object.values(stored.sessions).some((entry) => entry === true || entry === false);
=======
const createdSessionSchema = z.object({ id: z.string().min(1), parentID: z.string().nullish() });
const forkedSessionSchema = z.object({ sessionID: z.string().min(1), parentID: z.string().min(1) })
  .refine(({ sessionID, parentID }) => sessionID !== parentID);

const hasLegacyEntries = (stored: z.infer<typeof storedPolicySchema>) => Object.values(stored.sessions).some((entry) => entry === true || entry === false);
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
/**
 * `sessions` maps a session id to its mode. Returns whether any entry was a
 * pre-modes boolean, so the caller can persist the converted policy once.
 */
const normalizePolicy = (value, legacyEnabledMode = 'auto') => {
 const stored = readStoredPolicy(value);
 const sessions = {};
 for (const [sessionId, entry] of Object.entries(stored.sessions)) {
  const mode = toPermissionMode(entry, legacyEnabledMode);
  if (mode) sessions[sessionId] = mode;
 }
 return { policy: { sessions, revision: stored.revision }, hadLegacy: hasLegacyEntries(stored) };
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
/**
 * `sessions` maps a session id to its mode. Returns whether any entry was a
 * pre-modes boolean, so the caller can persist the converted policy once.
 */
const normalizePolicy = (value, legacyEnabledMode = 'auto') => {
  const stored = readStoredPolicy(value);
  const sessions = {};
  for (const [sessionId, entry] of Object.entries(stored.sessions)) {
    const mode = toPermissionMode(entry, legacyEnabledMode);
    if (mode) sessions[sessionId] = mode;
  }
  return { policy: { sessions, revision: stored.revision }, hadLegacy: hasLegacyEntries(stored) };
=======
const normalizePolicy = (value?: JsonValue, legacyEnabledMode: PermissionMode = 'auto') => {
  const stored = readStoredPolicy(value);
  const sessions: PermissionPolicy['sessions'] = {};
  for (const [sessionId, entry] of Object.entries(stored.sessions)) {
    const mode = toPermissionMode(entry, legacyEnabledMode);
    if (mode) sessions[sessionId] = mode;
  }
  return { policy: { sessions, revision: stored.revision }, hadLegacy: hasLegacyEntries(stored) };
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts
};

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
/**
 * The Host-owned per-session permission policy for the native Agent Service.
 *
 * The policy is persisted in OpenChamber settings so it survives UI
 * disconnects and server restarts. The Agent Service asks this runtime for the
 * mode and, in a `safety` session, for a verdict before it raises an approval
 * card; the runtime is the only authority that decides, and a failed read
 * fails closed to `ask`.
 */
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

=======
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const jsonProperty = (value: JsonValue | undefined, key: string) => isJsonObject(value) ? value[key] : undefined;
const isSessionInfo = (value: JsonValue | undefined): value is JsonObject & { id: string; parentID?: JsonValue; metadata?: JsonValue } =>
  isJsonObject(value) && typeof value.id === 'string' && Boolean(value.id);
const isDirectory = (value: PermissionDirectory): value is string => typeof value === 'string' && Boolean(value.trim());
const isSessionId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const hasMessage = (value: unknown): value is { message: unknown } => value !== null
  && (typeof value === 'object' || typeof value === 'function') && 'message' in value;
const hasNotFoundStatus = (value: unknown): value is { status: 404 } => value !== null
  && (typeof value === 'object' || typeof value === 'function') && 'status' in value && value.status === 404;

>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts
export function createPermissionAutoAcceptRuntime({
<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 readSettingsFromDiskMigrated,
 persistSettings,
 broadcastGlobalUiEvent,
 // The routing safety net, consulted once per `safety` session request.
 // `accept` replies; anything else leaves the request for the user.
 evaluatePermission = null,
 // What a pre-modes `true` becomes: `safety` when the old global safety-net
 // switch was on, else `auto`. Asked only while converting such a policy.
 resolveLegacyEnabledMode = async () => 'auto',
 // The parent of a session, used only while the event-derived cache is cold.
 resolveSessionParent = async () => null,
 // Told after a write so pending requests can be reconsidered in the service.
 onSessionPolicyChanged = null,
}) {
 if (typeof readSettingsFromDiskMigrated !== 'function' || typeof persistSettings !== 'function') {
  throw new TypeError('Permission policy requires the settings reader and writer');
 }
 let policy = normalizePolicy().policy;
 let loaded = false;
 let loadPromise = null;
 let writePromise = Promise.resolve();
 // session id -> parent session id (null for a root) or undefined while unknown.
 const lineage = new Map();
 const outcomes = new Map();
 const heldBroadcasts = new Set();
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  globalEventHub,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  readSettingsFromDiskMigrated,
  persistSettings,
  broadcastGlobalUiEvent,
  // The routing safety net, asked once per request in a `safety` session.
  // `accept` replies; anything else leaves the request for the user. Absent
  // means `safety` sessions wait for the user on every request.
  evaluatePermission = null,
  onPermissionReplied = null,
  // What a pre-modes `true` becomes: `safety` when the old global safety-net
  // switch was on, else `auto`. Asked only while converting such a policy.
  resolveLegacyEnabledMode = async () => 'auto',
  // The mode a new top-level session starts in. The server inside an isolated space reads the
  // file the host writes instead, since its own settings hold no default.
  readDefaultMode = async () => (await readSettingsFromDiskMigrated())?.[DEFAULT_MODE_SETTINGS_KEY],
  fetchImpl = fetch,
  retryDelaysMs = RETRY_DELAYS_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}) {
  let policy = normalizePolicy().policy;
  let loaded = false;
  let loadPromise = null;
  let writePromise = Promise.resolve();
  const sessions = new Map();
  const pendingForkModes = new Map();
  const inFlight = new Map();
  const reconcilePromises = new Map();
  // What the runtime did with each recent request, so notifications can tell a
  // request the safety net held (the user must hear about it) from one it
  // accepted.
  const outcomes = new Map();
=======
  globalEventHub,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  readSettingsFromDiskMigrated,
  persistSettings,
  broadcastGlobalUiEvent,
  evaluatePermission = null,
  onPermissionReplied = null,
  resolveLegacyEnabledMode = async () => 'auto',
  readDefaultMode = async () => (await readSettingsFromDiskMigrated())?.[DEFAULT_MODE_SETTINGS_KEY],
  fetchImpl = fetch,
  retryDelaysMs = RETRY_DELAYS_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: PermissionAutoAcceptOptions) {
  let policy = normalizePolicy().policy;
  let loaded = false;
  let loadPromise: Promise<PermissionPolicySnapshot> | null = null;
  let writePromise: Promise<PermissionPolicySnapshot | void> = Promise.resolve();
  const sessions = new Map<JsonValue, CachedSession>();
  const pendingForkModes = new Map<JsonValue, Promise<void>>();
  const inFlight = new Map<JsonValue, Promise<boolean>>();
  const reconcilePromises = new Map<string, Promise<void>>();
  const outcomes = new Map<JsonValue, Promise<PermissionOutcome>>();
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 // `sessions` keeps the on/off shape clients from before the modes read;
 // `modes` is the policy itself.
 const snapshot = () => {
  const legacySessions = {};
  for (const [sessionId, mode] of Object.entries(policy.sessions)) legacySessions[sessionId] = isAutoAnsweringMode(mode);
  return { sessions: legacySessions, modes: { ...policy.sessions }, revision: policy.revision };
 };
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  // `sessions` keeps the on/off shape clients from before the modes read;
  // `modes` is the policy itself.
  const snapshot = () => {
    const legacySessions = {};
    for (const [sessionId, mode] of Object.entries(policy.sessions)) legacySessions[sessionId] = isAutoAnsweringMode(mode);
    return { sessions: legacySessions, modes: { ...policy.sessions }, revision: policy.revision };
  };
=======
  const snapshot = () => {
    const legacySessions: PermissionPolicySnapshot['sessions'] = {};
    for (const [sessionId, mode] of Object.entries(policy.sessions)) legacySessions[sessionId] = isAutoAnsweringMode(mode);
    return { sessions: legacySessions, modes: { ...policy.sessions }, revision: policy.revision };
  };
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 const readPolicy = async () => {
  const settings = await readSettingsFromDiskMigrated();
  const stored = settings?.[SETTINGS_KEY];
  const legacyEnabledMode = hasLegacyEntries(readStoredPolicy(stored)) ? await resolveLegacyEnabledMode() : 'auto';
  const { policy: next, hadLegacy } = normalizePolicy(stored, legacyEnabledMode);
  // Converted once: the answer to "was the safety net on" is gone after the
  // routing config is next saved.
  if (hadLegacy) await persistSettings({ [SETTINGS_KEY]: next });
  return next;
 };
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  const readPolicy = async () => {
    const settings = await readSettingsFromDiskMigrated();
    const stored = settings?.[SETTINGS_KEY];
    const legacyEnabledMode = hasLegacyEntries(readStoredPolicy(stored)) ? await resolveLegacyEnabledMode() : 'auto';
    const { policy: next, hadLegacy } = normalizePolicy(stored, legacyEnabledMode);
    // Converted once: the answer to "was the safety net on" is gone after the
    // routing config is next saved.
    if (hadLegacy) await persistSettings({ [SETTINGS_KEY]: next });
    return next;
  };
=======
  const readPolicy = async () => {
    const settings = await readSettingsFromDiskMigrated();
    const stored = settings?.[SETTINGS_KEY];
    const legacyEnabledMode = hasLegacyEntries(readStoredPolicy(stored)) ? await resolveLegacyEnabledMode() : 'auto';
    const { policy: next, hadLegacy } = normalizePolicy(stored, legacyEnabledMode);
    if (hadLegacy) await persistSettings({ [SETTINGS_KEY]: next });
    return next;
  };
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 const load = async () => {
  if (loaded) return snapshot();
  if (!loadPromise) {
   loadPromise = readPolicy()
    .then((next) => {
     policy = next;
     loaded = true;
     return snapshot();
    })
    .finally(() => { loadPromise = null; });
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  const load = async () => {
    if (loaded) return snapshot();
    if (!loadPromise) {
      loadPromise = readPolicy()
        .then((next) => {
          policy = next;
          loaded = true;
          return snapshot();
        })
        .finally(() => { loadPromise = null; });
    }
    return loadPromise;
  };

  const persistUpdate = (update) => {
    const result = writePromise.then(async () => {
      const next = update(policy);
      await persistSettings({ [SETTINGS_KEY]: next });
      policy = next;
      loaded = true;
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.updated',
        properties: snapshot(),
      });
      return snapshot();
    });
    // Only this caller sees a failed save; the next update still writes.
    writePromise = result.catch(() => {});
    return result;
  };

  /**
   * `mode` is a permission mode; a boolean is accepted from callers that only
   * know on/off (clients from before the modes, scheduled tasks) and means
   * `auto` or `ask`.
   */
  const setSessionPolicy = async (sessionId, mode, directory) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('sessionId is required');
    const next = toPermissionMode(mode);
    if (!next) throw new TypeError('mode must be ask, safety or auto');
    await load();
    const result = await persistUpdate((current) => ({
      ...current,
      sessions: { ...current.sessions, [sessionId.trim()]: next },
      revision: current.revision + 1,
    }));
    if (isAutoAnsweringMode(next)) await reconcilePending({ directories: [directory] });
    return result;
  };

  /**
   * A new top-level session starts in the default mode from Settings. Written
   * once, at creation, so changing the default never reaches back into older
   * sessions; a policy the creating flow already set wins. Subagents inherit
   * from their parent instead.
   */
  const applyDefaultMode = async (sessionId) => {
    await load();
    if (Object.hasOwn(policy.sessions, sessionId)) return;
    const mode = await readDefaultMode();
    if (!isPermissionMode(mode) || mode === 'ask') return;
    await persistUpdate((current) => (Object.hasOwn(current.sessions, sessionId) ? current : {
      ...current,
      sessions: { ...current.sessions, [sessionId]: mode },
      revision: current.revision + 1,
    }));
  };

  /**
   * `complete` marks a full session record (`session.created`, or the session
   * fetched from OpenCode), the only kind whose missing `parentID` proves a
   * top-level session. Otherwise the parent stays unknown (`undefined`).
   */
  const rememberSession = (info, directoryHint, { complete = false } = {}) => {
    if (!info || typeof info.id !== 'string' || !info.id) return;
    // v2 session updates are partial (a rename carries only the title), so a
    // field the update does not name keeps what an earlier record said.
    const previous = sessions.get(info.id);
    const parentID = typeof info.parentID === 'string' && info.parentID
      ? info.parentID
      : (previous?.parentID !== undefined ? previous.parentID : (complete ? null : undefined));
    // v2 keeps the directory on `location`; translated events already flatten it.
    const directory = typeof info.directory === 'string' && info.directory
      ? info.directory
      : (typeof info.location?.directory === 'string' && info.location.directory
        ? info.location.directory
        : previous?.directory ?? directoryHint);
    if (previous) sessions.delete(info.id);
    sessions.set(info.id, { parentID, directory });
    if (sessions.size > SESSION_CACHE_LIMIT) {
      sessions.delete(sessions.keys().next().value);
    }
  };

  const request = async (path, { directory, method = 'GET', body } = {}) => {
    const url = new URL(buildOpenCodeUrl(path, ''));
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        // OpenCode 2.x scopes a request to a directory through this header;
        // the pending-permission list and services behind it are per location.
        ...(directory ? { 'x-opencode-directory': encodeURIComponent(directory) } : {}),
        ...getOpenCodeAuthHeaders(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      const error = new Error(`OpenCode request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json().catch(() => null);
  };

  const getSession = async (sessionId, directory) => {
    const cached = sessions.get(sessionId);
    // Only a partial update was seen: its parent is unknown, so ask OpenCode.
    if (cached && cached.parentID !== undefined) return cached;
    const info = await request(`/api/session/${encodeURIComponent(sessionId)}`, { directory: directory ?? cached?.directory });
    rememberSession(info?.data ?? info, directory, { complete: true });
    return sessions.get(sessionId) ?? null;
  };

  /** The nearest explicit mode up the session's lineage. Throws when a session lookup fails. */
  const resolveLineageMode = async (sessionId, directory) => {
    await load();
    // A default being written for a just-created session must be visible to
    // its first permission request.
    await writePromise.catch(() => undefined);
    const seen = new Set();
    let current = sessionId;
    let currentDirectory = directory;
    while (current && !seen.has(current)) {
      await pendingForkModes.get(current);
      if (Object.hasOwn(policy.sessions, current)) return policy.sessions[current];
      seen.add(current);
      const info = await getSession(current, currentDirectory);
      current = info?.parentID ?? null;
      currentDirectory = info?.directory ?? currentDirectory;
    }
    return 'ask';
  };

  const inheritForkMode = async (sessionId, sourceId, directory) => {
    await load();
    if (Object.hasOwn(policy.sessions, sessionId)) return;
    const mode = await resolveLineageMode(sourceId, directory);
    await persistUpdate((current) => (Object.hasOwn(current.sessions, sessionId) ? current : {
      ...current,
      sessions: { ...current.sessions, [sessionId]: mode },
      revision: current.revision + 1,
    }));
  };

  /** The nearest explicit mode up the session's lineage; unknown lineage fails closed to `ask`. */
  const resolveSessionMode = (sessionId, directory) => resolveLineageMode(sessionId, directory).catch(() => 'ask');

  const isSessionAutoAccepting = async (sessionId, directory) => isAutoAnsweringMode(await resolveSessionMode(sessionId, directory));

  /** `replied`, `held` (left for the user by the safety net), or `ignored` (an `ask` session). */
  const replyOnce = async (permission, directory) => {
    if (!permission?.id || !permission?.sessionID) return 'ignored';
    // A failed lineage lookup throws, so the request is retried like a failed reply.
    const mode = await resolveLineageMode(permission.sessionID, directory);
    if (mode === 'ask') return 'ignored';
    if (mode === 'safety') {
      const verdict = evaluatePermission ? await evaluatePermission(permission, directory) : null;
      if (verdict?.action !== 'accept') return 'held';
    }
    // v2 scopes a permission reply under its session.
    await request(`/api/session/${encodeURIComponent(permission.sessionID)}/permission/${encodeURIComponent(permission.id)}/reply`, {
      directory,
      method: 'POST',
      // OpenCode 2.0.8 renamed the reply body field `reply` to `decision`.
      body: { decision: 'once' },
    });
    return 'replied';
  };

  const rememberOutcome = (permissionId, outcome) => {
    outcomes.delete(permissionId);
    outcomes.set(permissionId, outcome);
    if (outcomes.size > OUTCOME_CACHE_LIMIT) outcomes.delete(outcomes.keys().next().value);
  };

  /** Resolves to whether the request was handled here (replied to, or deliberately held). */
  const processPermission = (permission, directory) => {
    if (!permission?.id) return Promise.resolve(false);
    const key = permission.id;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const outcome = (async () => {
      for (const delay of retryDelaysMs) {
        if (delay > 0) await wait(delay);
        try {
          return await replyOnce(permission, directory);
        } catch (error) {
          if (error?.status === 404) return 'replied';
        }
      }
      return 'failed';
    })();
    rememberOutcome(key, outcome);
    // A client hides a `safety` or `auto` session's request until it hears
    // here that the request was not answered for the user.
    void outcome.then((result) => {
      if (result !== 'held' && result !== 'failed') return;
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.left-for-user',
        properties: { permissionId: key, sessionId: permission.sessionID, directory: directory ?? null },
      });
    });
    const task = outcome.then((result) => result !== 'ignored' && result !== 'failed').finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };

  /**
   * Whether the user can skip hearing about this request: it was, or is being,
   * answered automatically. A held or unanswered request is not.
   */
  const isPermissionAutoAnswered = async (sessionId, directory, permissionId) => {
    const wasReplied = async () => {
      const outcome = permissionId ? outcomes.get(permissionId) : undefined;
      return outcome ? (await outcome) === 'replied' : false;
    };
    let mode;
    try {
      mode = await resolveLineageMode(sessionId, directory);
    } catch {
      // The reply path retries the lookup; its outcome is the answer.
      return wasReplied();
    }
    if (mode === 'auto') return true;
    if (mode === 'ask') return false;
    return wasReplied();
  };

  // A pending request belongs to a turn that is still running, so the
  // directories worth asking are those of running sessions, which OpenCode
  // already has started. A list without a directory would answer for
  // OpenCode's own working directory only, and start it, MCP servers included.
  const runningSessionDirectories = async () => {
    const payload = await request('/api/session/active');
    const sessionIds = Object.keys(payload?.data ?? {});
    const directories = await Promise.all(sessionIds.map((sessionId) =>
      getSession(sessionId).then((session) => session?.directory ?? null, () => null)));
    return directories.filter((directory) => directory);
  };

  async function reconcilePending({ directories = [] } = {}) {
    const normalizedDirectories = Array.from(new Set(
      directories.filter((directory) => typeof directory === 'string' && directory.trim()).map((directory) => directory.trim()),
    ));
    const key = normalizedDirectories.length > 0 ? normalizedDirectories.join('\n') : 'all';
    const existing = reconcilePromises.get(key);
    if (existing) return existing;
    const task = (async () => {
      await load();
      const scopes = normalizedDirectories.length > 0
        ? normalizedDirectories
        : Array.from(new Set(await runningSessionDirectories().catch(() => [])));
      const pendingById = new Map();
      for (const directory of scopes) {
        let payload;
        try {
          payload = await request('/api/permission/request', { directory });
        } catch {
          continue;
        }
        const pending = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : null;
        if (!pending) continue;
        for (const permission of pending) {
          if (!permission?.id) continue;
          pendingById.set(permission.id, { permission, directory: permission.directory ?? directory });
        }
      }
      await Promise.all(Array.from(pendingById.values()).map(({ permission, directory }) =>
        processPermission(permission, directory)));
    })().finally(() => { reconcilePromises.delete(key); });
    reconcilePromises.set(key, task);
    return task;
=======
  const load = async () => {
    if (loaded) return snapshot();
    if (!loadPromise) {
      loadPromise = readPolicy()
        .then((next) => {
          policy = next;
          loaded = true;
          return snapshot();
        })
        .finally(() => { loadPromise = null; });
    }
    return loadPromise;
  };

  const persistUpdate = (update: (current: PermissionPolicy) => PermissionPolicy) => {
    const result = writePromise.then(async () => {
      const next = update(policy);
      await persistSettings({ [SETTINGS_KEY]: next });
      policy = next;
      loaded = true;
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.updated',
        properties: snapshot(),
      });
      return snapshot();
    });
    writePromise = result.catch(() => {});
    return result;
  };

  const setSessionPolicy = async (sessionId: JsonValue | undefined, mode: JsonValue | undefined, directory?: PermissionDirectory) => {
    if (!isSessionId(sessionId)) throw new TypeError('sessionId is required');
    const next = isPermissionMode(mode) || mode === true || mode === false ? toPermissionMode(mode) : null;
    if (!next) throw new TypeError('mode must be ask, safety or auto');
    await load();
    const result = await persistUpdate((current) => ({
      ...current,
      sessions: { ...current.sessions, [sessionId.trim()]: next },
      revision: current.revision + 1,
    }));
    if (isAutoAnsweringMode(next)) await reconcilePending({ directories: [directory] });
    return result;
  };

  const applyDefaultMode = async (sessionId: string) => {
    await load();
    if (Object.hasOwn(policy.sessions, sessionId)) return;
    const mode = await readDefaultMode();
    if (!isPermissionMode(mode) || mode === 'ask') return;
    await persistUpdate((current) => (Object.hasOwn(current.sessions, sessionId) ? current : {
      ...current,
      sessions: { ...current.sessions, [sessionId]: mode },
      revision: current.revision + 1,
    }));
  };

  const rememberSession = (info: JsonValue | undefined, directoryHint: PermissionDirectory, { complete = false } = {}) => {
    if (!isSessionInfo(info)) return;
    const previous = sessions.get(info.id);
    const parentID = sessionParentId(info)
      ?? (previous?.parentID !== undefined ? previous.parentID : (complete ? null : undefined));
    const directory = isString(info.directory) && info.directory
      ? info.directory
      : (isString(jsonProperty(info.location, 'directory')) && jsonProperty(info.location, 'directory')
        ? jsonProperty(info.location, 'directory')
        : previous?.directory ?? directoryHint);
    if (previous) sessions.delete(info.id);
    sessions.set(info.id, { parentID, directory });
    if (sessions.size > SESSION_CACHE_LIMIT) {
      const oldest = sessions.keys().next();
      if (!oldest.done) sessions.delete(oldest.value);
    }
  };

  const request = async (path: string, { directory, method = 'GET', body }: { directory?: PermissionDirectory; method?: string; body?: JsonValue } = {}): Promise<JsonValue> => {
    const url = new URL(buildOpenCodeUrl(path, ''));
    const headers: PermissionRequestHeaders = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(`${directory}`);
    const init: RequestInit = { method, headers: { ...headers, ...getOpenCodeAuthHeaders() } };
    if (body) init.body = JSON.stringify(body);
    init.signal = AbortSignal.timeout(requestTimeoutMs);
    const response = await fetchImpl(url, init);
    if (!response.ok) {
      const error = Object.assign(new Error(`OpenCode request failed (${response.status})`), { status: response.status });
      throw error;
    }
    return response.json().catch(() => null);
  };

  const getSession = async (sessionId: JsonValue, directory?: PermissionDirectory) => {
    const cached = sessions.get(sessionId);
    if (cached && cached.parentID !== undefined) return cached;
    const info = await request(`/api/session/${encodeURIComponent(`${sessionId}`)}`, { directory: directory ?? cached?.directory });
    rememberSession(jsonProperty(info, 'data') ?? info, directory, { complete: true });
    return sessions.get(sessionId) ?? null;
  };

  const resolveLineageMode = async (sessionId: JsonValue | undefined, directory?: PermissionDirectory) => {
    await load();
    await writePromise.catch(() => undefined);
    const seen = new Set<JsonValue>();
    let current: JsonValue | undefined = sessionId;
    let currentDirectory = directory;
    while (current && !seen.has(current)) {
      await pendingForkModes.get(current);
      if (Object.hasOwn(policy.sessions, `${current}`)) return policy.sessions[`${current}`];
      seen.add(current);
      const info = await getSession(current, currentDirectory);
      current = info?.parentID ?? null;
      currentDirectory = info?.directory ?? currentDirectory;
    }
    return 'ask';
  };

  const inheritForkMode = async (sessionId: string, sourceId: string, directory?: PermissionDirectory) => {
    await load();
    if (Object.hasOwn(policy.sessions, sessionId)) return;
    const mode = await resolveLineageMode(sourceId, directory);
    await persistUpdate((current) => (Object.hasOwn(current.sessions, sessionId) ? current : {
      ...current,
      sessions: { ...current.sessions, [sessionId]: mode },
      revision: current.revision + 1,
    }));
  };

  const resolveSessionMode = (sessionId: JsonValue, directory?: PermissionDirectory) => resolveLineageMode(sessionId, directory).catch((): PermissionMode => 'ask');

  const isSessionAutoAccepting = async (sessionId: JsonValue, directory?: PermissionDirectory) => isAutoAnsweringMode(await resolveSessionMode(sessionId, directory));

  const replyOnce = async (permission: JsonObject, directory: PermissionDirectory) => {
    if (!permission?.id || !permission?.sessionID) return 'ignored';
    const mode = await resolveLineageMode(permission.sessionID, directory);
    if (mode === 'ask') return 'ignored';
    if (mode === 'safety') {
      const verdict = evaluatePermission ? await evaluatePermission(permission, directory) : null;
      if (verdict?.action !== 'accept') return 'held';
    }
    await request(`/api/session/${encodeURIComponent(`${permission.sessionID}`)}/permission/${encodeURIComponent(`${permission.id}`)}/reply`, {
      directory,
      method: 'POST',
      body: { decision: 'once' },
    });
    return 'replied';
  };

  const rememberOutcome = (permissionId: JsonValue, outcome: Promise<PermissionOutcome>) => {
    outcomes.delete(permissionId);
    outcomes.set(permissionId, outcome);
    if (outcomes.size > OUTCOME_CACHE_LIMIT) {
      const oldest = outcomes.keys().next();
      if (!oldest.done) outcomes.delete(oldest.value);
    }
  };

  const processPermission = (permission: JsonValue | undefined, directory?: PermissionDirectory) => {
    if (!isJsonObject(permission) || !permission.id) return Promise.resolve(false);
    const key = permission.id;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const outcome = (async (): Promise<PermissionOutcome> => {
      for (const delay of retryDelaysMs) {
        if (delay > 0) await wait(delay);
        try {
          return await replyOnce(permission, directory);
        } catch (error) {
          if (hasNotFoundStatus(error)) return 'replied';
        }
      }
      return 'failed';
    })();
    rememberOutcome(key, outcome);
    void outcome.then((result) => {
      if (result !== 'held' && result !== 'failed') return;
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.left-for-user',
        properties: { permissionId: key, sessionId: permission.sessionID, directory: directory ?? null },
      });
    });
    const task = outcome.then((result) => result !== 'ignored' && result !== 'failed').finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };

  const isPermissionAutoAnswered = async (sessionId: JsonValue | undefined, directory?: PermissionDirectory, permissionId?: JsonValue) => {
    const wasReplied = async () => {
      const outcome = permissionId ? outcomes.get(permissionId) : undefined;
      return outcome ? (await outcome) === 'replied' : false;
    };
    let mode;
    try {
      mode = await resolveLineageMode(sessionId, directory);
    } catch {
      return wasReplied();
    }
    if (mode === 'auto') return true;
    if (mode === 'ask') return false;
    return wasReplied();
  };

  const runningSessionDirectories = async () => {
    const payload = await request('/api/session/active');
    const sessionIds = Object.keys(jsonProperty(payload, 'data') ?? {});
    const directories = await Promise.all(sessionIds.map((sessionId) =>
      getSession(sessionId).then((session) => session?.directory ?? null, () => null)));
    return directories.filter((directory) => directory);
  };

  async function reconcilePending({ directories = [] }: { directories?: PermissionDirectory[] } = {}) {
    const normalizedDirectories = Array.from(new Set(
      directories.filter(isDirectory).map((directory) => directory.trim()),
    ));
    const key = normalizedDirectories.length > 0 ? normalizedDirectories.join('\n') : 'all';
    const existing = reconcilePromises.get(key);
    if (existing) return existing;
    const task = (async () => {
      await load();
      const scopes = normalizedDirectories.length > 0
        ? normalizedDirectories
        : Array.from(new Set(await runningSessionDirectories().catch(() => [])));
      const pendingById = new Map<JsonValue, { permission: JsonObject; directory: PermissionDirectory }>();
      for (const directory of scopes) {
        let payload;
        try {
          payload = await request('/api/permission/request', { directory });
        } catch {
          continue;
        }
        const data = jsonProperty(payload, 'data');
        const pending = Array.isArray(payload) ? payload : Array.isArray(data) ? data : null;
        if (!pending) continue;
        for (const permission of pending) {
          if (!isJsonObject(permission) || !permission.id) continue;
          pendingById.set(permission.id, { permission, directory: permission.directory ?? directory });
        }
      }
      await Promise.all(Array.from(pendingById.values()).map(({ permission, directory }) =>
        processPermission(permission, directory)));
    })().finally(() => { reconcilePromises.delete(key); });
    reconcilePromises.set(key, task);
    return task;
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts
  }
  return loadPromise;
 };

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 const persistUpdate = (update) => {
  const result = writePromise.then(async () => {
   const next = update(policy);
   await persistSettings({ [SETTINGS_KEY]: next });
   policy = next;
   loaded = true;
   broadcastGlobalUiEvent?.({
    type: 'openchamber:permission-auto-accept.updated',
    properties: snapshot(),
   });
   return snapshot();
  });
  // Only this caller sees a failed save; the next update still writes.
  writePromise = result.catch(() => { });
  return result;
 };

 /**
  * `mode` is a permission mode; a boolean is accepted from callers that only
  * know on/off (clients from before the modes, scheduled tasks) and means
  * `auto` or `ask`.
  */
 const setSessionPolicy = async (sessionId, mode, directory) => {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('sessionId is required');
  const next = toPermissionMode(mode);
  if (!next) throw new TypeError('mode must be ask, safety or auto');
  await load();
  const result = await persistUpdate((current) => ({
   ...current,
   sessions: { ...current.sessions, [sessionId.trim()]: next },
   revision: current.revision + 1,
  }));
  // A mode switch must reach approvals already waiting in the service.
  try { await onSessionPolicyChanged?.(sessionId.trim(), next, directory); } catch { /* the next request still asks */ }
  return result;
 };

 /**
  * A new top-level session starts in the default mode from Settings. Written
  * once, at creation, so changing the default never reaches back into older
  * sessions; a policy the creating flow already set wins. Subagents inherit
  * from their parent instead.
  */
 const applyDefaultMode = async (sessionId) => {
  await load();
  if (typeof sessionId !== 'string' || !sessionId || Object.hasOwn(policy.sessions, sessionId)) return;
  if (lineage.get(sessionId) !== null) {
   // Unknown lineage: ask before assuming a top-level session.
   let parent;
   try { parent = await resolveSessionParent(sessionId); } catch { return; }
   if (typeof parent === 'string' && parent && parent !== sessionId) {
    lineage.set(sessionId, parent);
    return;
   }
   // `undefined` means the lookup failed; only an explicit `null` confirms a
   // root, otherwise a transient error would pin the session as top-level.
   if (parent !== null) return;
   lineage.set(sessionId, null);
  }
  const settings = await readSettingsFromDiskMigrated().catch(() => null);
  const mode = settings?.[DEFAULT_MODE_SETTINGS_KEY];
  if (!isPermissionMode(mode) || mode === 'ask') return;
  await persistUpdate((current) => (Object.hasOwn(current.sessions, sessionId) ? current : {
   ...current,
   sessions: { ...current.sessions, [sessionId]: mode },
   revision: current.revision + 1,
  }));
 };

 /** Remember canonical session lineage; only `null` proves a top-level session. */
 const observeSession = (session) => {
  if (!session || typeof session.sessionId !== 'string' || !session.sessionId) return;
  const parent = typeof session.parentSessionId === 'string' && session.parentSessionId && session.parentSessionId !== session.sessionId
   ? session.parentSessionId
   : (session.rootSessionId === session.sessionId ? null : undefined);
  if (parent === null || typeof parent === 'string') {
   lineage.delete(session.sessionId);
   lineage.set(session.sessionId, parent);
   while (lineage.size > 10_000) lineage.delete(lineage.keys().next().value);
  }
 };

 /** The nearest explicit mode up a session's lineage, unknown lineage fails closed to `ask`. */
 const resolveSessionMode = async (sessionId, directory) => {
  try {
   await load();
   await writePromise.catch(() => undefined);
   const seen = new Set();
   let current = sessionId;
   let currentDirectory = directory;
   while (current && !seen.has(current)) {
    if (Object.hasOwn(policy.sessions, current)) return policy.sessions[current];
    seen.add(current);
    let parent = lineage.get(current);
    if (parent === undefined) {
     parent = await resolveSessionParent(current, currentDirectory);
     if (typeof parent === 'string' && !parent) parent = undefined;
     if (typeof parent === 'string' && parent === current) parent = undefined;
     if (parent === null) lineage.set(current, null);
     else if (typeof parent === 'string') {
      lineage.delete(current);
      lineage.set(current, parent);
     }
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  const processEvent = (event) => {
    const directory = typeof event?.directory === 'string' && event.directory !== 'global' ? event.directory : undefined;
    for (const payload of event?.translated?.() ?? []) {
      if (payload.type === 'session.forked') {
        const fork = forkedSessionSchema.safeParse(payload.properties);
        if (!fork.success || pendingForkModes.has(fork.data.sessionID)) continue;
        const { sessionID, parentID } = fork.data;
        // A fork is an independent session. Copy its source's effective mode
        // once, without treating the fork event's parentID as subagent lineage.
        const task = inheritForkMode(sessionID, parentID, directory)
          .finally(() => { pendingForkModes.delete(sessionID); });
        pendingForkModes.set(sessionID, task);
        void task.catch((error) => {
          console.warn('[permission-auto-accept] failed to inherit the fork mode:', error?.message ?? error);
        });
        continue;
      }
      if (payload.type === 'session.created' || payload.type === 'session.updated') {
        const info = payload.properties?.info;
        rememberSession(info, directory ?? payload.properties?.directory, { complete: payload.type === 'session.created' });
        const created = payload.type === 'session.created' ? createdSessionSchema.safeParse(info) : null;
        if (created?.success && !created.data.parentID) {
          void applyDefaultMode(created.data.id).catch((error) => {
            console.warn('[permission-auto-accept] failed to apply the default mode:', error?.message ?? error);
          });
        }
        continue;
      }
      // A v2 permission request is `{ id, sessionID, action, resources, ... }`;
      // only the id and session id are used to reply.
      if (payload.type === 'permission.asked') {
        void processPermission(payload.properties, directory ?? payload.properties?.directory);
        continue;
      }
      // The routing safety net holds a request instead of replying; once the
      // user answers it, stop tracking it.
      if (payload.type === 'permission.replied') {
        const permissionId = payload.properties?.requestID;
        if (typeof permissionId === 'string' && permissionId) onPermissionReplied?.(permissionId);
      }
=======
  const processEvent = (event: GlobalStreamEvent) => {
    const directory = event.directory !== 'global' ? event.directory : undefined;
    for (const payload of event?.translated?.() ?? []) {
      if (payload.type === 'session.forked') {
        const fork = forkedSessionSchema.safeParse(payload.properties);
        if (!fork.success || pendingForkModes.has(fork.data.sessionID)) continue;
        const { sessionID, parentID } = fork.data;
        const task = inheritForkMode(sessionID, parentID, directory)
          .finally(() => { pendingForkModes.delete(sessionID); });
        pendingForkModes.set(sessionID, task);
        void task.catch((error) => {
          console.warn('[permission-auto-accept] failed to inherit the fork mode:', (hasMessage(error) ? error.message : undefined) ?? error);
        });
        continue;
      }
      if (payload.type === 'session.created' || payload.type === 'session.updated') {
        const info = payload.properties?.info;
        rememberSession(info, directory ?? payload.properties?.directory, { complete: payload.type === 'session.created' });
        const created = payload.type === 'session.created' ? createdSessionSchema.safeParse(info) : null;
        if (created?.success && !created.data.parentID) {
          void applyDefaultMode(created.data.id).catch((error) => {
            console.warn('[permission-auto-accept] failed to apply the default mode:', (hasMessage(error) ? error.message : undefined) ?? error);
          });
        }
        continue;
      }
      if (payload.type === 'permission.asked') {
        void processPermission(payload.properties, directory ?? payload.properties?.directory);
        continue;
      }
      if (payload.type === 'permission.replied') {
        const permissionId = payload.properties?.requestID;
        if (isString(permissionId) && permissionId) onPermissionReplied?.(permissionId);
      }
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts
    }
    current = parent ?? null;
   }
   return 'ask';
  } catch {
   return 'ask';
  }
 };

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 const isSessionAutoAccepting = async (sessionId, directory) => isAutoAnsweringMode(await resolveSessionMode(sessionId, directory));
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  const start = () => {
    const unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') void reconcilePending();
    });
    void load().then(() => reconcilePending()).catch((error) => {
      console.warn('[permission-auto-accept] failed to load policy:', error?.message ?? error);
    });
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
    };
  };
=======
  const start = () => {
    const unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') void reconcilePending();
    });
    void load().then(() => reconcilePending()).catch((error) => {
      console.warn('[permission-auto-accept] failed to load policy:', (hasMessage(error) ? error.message : undefined) ?? error);
    });
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
    };
  };
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 const rememberOutcome = (permissionId, outcome) => {
  if (!permissionId) return;
  outcomes.delete(permissionId);
  outcomes.set(permissionId, outcome);
  if (outcomes.size > OUTCOME_CACHE_LIMIT) outcomes.delete(outcomes.keys().next().value);
 };

 /**
  * The authoritative decision for one execution permission request. The
  * Agent Service asks before it raises a card; `accept` replies, `hold`
  * leaves the request on screen. A failed or unavailable safety net holds.
  */
 const evaluateSessionPermission = async (sessionId, approval, directory) => {
  const mode = await resolveSessionMode(sessionId, directory);
  if (mode === 'ask') return { mode, action: 'hold' };
  if (mode === 'auto') {
   rememberOutcome(approval?.approvalId, 'replied');
   return { mode, action: 'accept' };
  }
  const verdict = evaluatePermission ? await evaluatePermission(approval, directory).catch(() => null) : null;
  if (verdict?.action === 'accept') {
   rememberOutcome(approval?.approvalId, 'replied');
   return { mode, action: 'accept' };
  }
  rememberOutcome(approval?.approvalId, 'held');
  const permissionId = approval?.approvalId;
  if (typeof permissionId === 'string' && permissionId && !heldBroadcasts.has(permissionId)) {
   heldBroadcasts.add(permissionId);
   if (heldBroadcasts.size > HELD_BROADCAST_LIMIT) heldBroadcasts.delete(heldBroadcasts.values().next().value);
   broadcastGlobalUiEvent?.({
    type: 'openchamber:permission-auto-accept.left-for-user',
    properties: { permissionId, sessionId, directory: directory ?? null },
   });
  }
  return { mode, action: 'hold' };
 };

 /** Whether the user can skip hearing about this request: it was answered for them. */
 const isPermissionAutoAnswered = async (sessionId, permissionId, directory) => {
  const outcome = permissionId ? outcomes.get(permissionId) : undefined;
  if (outcome) return outcome === 'replied';
  return (await resolveSessionMode(sessionId, directory)) === 'auto';
 };

 return {
  snapshot,
  load,
  setSessionPolicy,
  applyDefaultMode,
  observeSession,
  resolveSessionMode,
  isSessionAutoAccepting,
  evaluateSessionPermission,
  isPermissionAutoAnswered,
 };
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  return {
    snapshot,
    load,
    setSessionPolicy,
    resolveSessionMode,
    isSessionAutoAccepting,
    isPermissionAutoAnswered,
    processPermission,
    reconcilePending,
    start,
  };
=======
  return {
    snapshot,
    load,
    setSessionPolicy,
    resolveSessionMode,
    isSessionAutoAccepting,
    isPermissionAutoAnswered,
    processPermission,
    reconcilePending,
    forgetSession: (sessionId: JsonValue) => sessions.delete(sessionId),
    start,
  };
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts
}

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
export function registerPermissionAutoAcceptRoutes(app, runtime) {
 app.get('/api/permission-auto-accept', async (_req, res) => {
  try {
   res.json(await runtime.load());
  } catch (error) {
   res.status(500).json({ error: error?.message ?? 'Failed to load permission auto-accept policy' });
  }
 });
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
export function registerPermissionAutoAcceptRoutes(app, runtime) {
  app.get('/api/permission-auto-accept', async (_req, res) => {
    try {
      res.json(await runtime.load());
    } catch (error) {
      res.status(500).json({ error: error?.message ?? 'Failed to load permission auto-accept policy' });
    }
  });
=======
export type PermissionAutoAcceptRuntime = ReturnType<typeof createPermissionAutoAcceptRuntime>;

export function registerPermissionAutoAcceptRoutes(app: Application, runtime: PermissionAutoAcceptRuntime) {
  app.get('/api/permission-auto-accept', async (_req, res) => {
    try {
      res.json(await runtime.load());
    } catch (error) {
      res.status(500).json({ error: (hasMessage(error) ? error.message : undefined) ?? 'Failed to load permission auto-accept policy' });
    }
  });
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/permission-auto-accept/runtime.js
 app.put('/api/permission-auto-accept/sessions/:sessionId', express.json({ limit: '16kb', strict: true }), async (req, res) => {
  try {
   const directory = typeof req.body?.directory === 'string' ? req.body.directory : undefined;
   // Clients from before the modes send only `enabled`.
   const mode = req.body?.mode ?? req.body?.enabled;
   res.json(await runtime.setSessionPolicy(req.params.sessionId, mode, directory));
  } catch (error) {
   res.status(error instanceof TypeError ? 400 : 500).json({ error: error?.message });
  }
 });
||||||| bc50ba56aa:packages/web/server/lib/permission-auto-accept/runtime.js
  app.put('/api/permission-auto-accept/sessions/:sessionId', async (req, res) => {
    try {
      const directory = typeof req.body?.directory === 'string' ? req.body.directory : undefined;
      // Clients from before the modes send only `enabled`.
      const mode = req.body?.mode ?? req.body?.enabled;
      res.json(await runtime.setSessionPolicy(req.params.sessionId, mode, directory));
    } catch (error) {
      res.status(error instanceof TypeError ? 400 : 500).json({ error: error?.message });
    }
  });
=======
  app.put<JsonValue>('/api/permission-auto-accept/sessions/:sessionId', async (req, res) => {
    try {
      const body = isJsonObject(req.body) ? req.body : undefined;
      const directory = isString(body?.directory) ? body.directory : undefined;
      const mode = body?.mode ?? body?.enabled;
      res.json(await runtime.setSessionPolicy(req.params.sessionId, mode, directory));
    } catch (error) {
      res.status(error instanceof TypeError ? 400 : 500).json({ error: hasMessage(error) ? error.message : undefined });
    }
  });
>>>>>>> upstream/main:packages/web/server/lib/permission-auto-accept/runtime.ts
}
