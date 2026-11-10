import express from 'express';
import { z } from 'zod';
import { PERMISSION_MODES, isAutoAnsweringMode, isPermissionMode, toPermissionMode } from './modes.js';

const SETTINGS_KEY = 'permissionAutoAccept';
const DEFAULT_MODE_SETTINGS_KEY = 'permissionDefaultMode';
const OUTCOME_CACHE_LIMIT = 1000;
const HELD_BROADCAST_LIMIT = 5000;

// A stored entry is a mode, or a boolean from before the modes existed; an
// entry that is neither is dropped rather than failing the whole policy.
const storedEntrySchema = z.union([z.boolean(), z.enum(PERMISSION_MODES)]).nullable().catch(null);
const storedPolicySchema = z.object({
 sessions: z.record(z.string().min(1), storedEntrySchema).catch({}).default({}),
 revision: z.number().int().nonnegative().catch(0).default(0),
}).catch({ sessions: {}, revision: 0 });

const readStoredPolicy = (value) => storedPolicySchema.parse(value ?? {});

const hasLegacyEntries = (stored) => Object.values(stored.sessions).some((entry) => entry === true || entry === false);

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
};

/**
 * The Host-owned per-session permission policy for the native Agent Service.
 *
 * The policy is persisted in OpenChamber settings so it survives UI
 * disconnects and server restarts. The Agent Service asks this runtime for the
 * mode and, in a `safety` session, for a verdict before it raises an approval
 * card; the runtime is the only authority that decides, and a failed read
 * fails closed to `ask`.
 */
export function createPermissionAutoAcceptRuntime({
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

 // `sessions` keeps the on/off shape clients from before the modes read;
 // `modes` is the policy itself.
 const snapshot = () => {
  const legacySessions = {};
  for (const [sessionId, mode] of Object.entries(policy.sessions)) legacySessions[sessionId] = isAutoAnsweringMode(mode);
  return { sessions: legacySessions, modes: { ...policy.sessions }, revision: policy.revision };
 };

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
    }
    current = parent ?? null;
   }
   return 'ask';
  } catch {
   return 'ask';
  }
 };

 const isSessionAutoAccepting = async (sessionId, directory) => isAutoAnsweringMode(await resolveSessionMode(sessionId, directory));

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
}

export function registerPermissionAutoAcceptRoutes(app, runtime) {
 app.get('/api/permission-auto-accept', async (_req, res) => {
  try {
   res.json(await runtime.load());
  } catch (error) {
   res.status(500).json({ error: error?.message ?? 'Failed to load permission auto-accept policy' });
  }
 });

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
}
