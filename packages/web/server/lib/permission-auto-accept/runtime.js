import { z } from 'zod';
import { ApprovalRequestSchema, CanonicalEventSchema, RuntimeSessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { PERMISSION_MODES, isAutoAnsweringMode, isPermissionMode, toPermissionMode } from './modes.js';
const SETTINGS_KEY = 'permissionAutoAccept';
const DEFAULT_MODE_SETTINGS_KEY = 'permissionDefaultMode';
const RETRY_DELAYS_MS = [0, 250, 1000];
const REQUEST_TIMEOUT_MS = 5000;
const SESSION_CACHE_LIMIT = 10000;
const OUTCOME_CACHE_LIMIT = 1000;

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPermissionAutoAcceptRuntime({
  service,
  globalEventHub,
  resolveSessionScope,
  listWorkspaceScopes,
  readSettingsFromDiskMigrated,
  persistSettings,
  broadcastGlobalUiEvent,
  evaluatePermission = null,
  onPermissionReplied = null,
  resolveLegacyEnabledMode = async () => 'auto',
  retryDelaysMs = RETRY_DELAYS_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!service || typeof service.request !== 'function') throw new Error('permission auto-accept requires the Agent service');
  if (!globalEventHub || typeof globalEventHub.subscribeEvent !== 'function' || typeof globalEventHub.subscribeStatus !== 'function') throw new Error('permission auto-accept requires the canonical event hub');
  if (typeof resolveSessionScope !== 'function' || typeof listWorkspaceScopes !== 'function') throw new Error('permission auto-accept requires Host session/workspace scope resolvers');
  let policy = normalizePolicy().policy;
  let loaded = false;
  let loadPromise = null;
  let writePromise = Promise.resolve();
  const sessions = new Map();
  const inFlight = new Map();
  const reconcilePromises = new Map();
  // What the runtime did with each recent request, so notifications can tell a
  // request the safety net held (the user must hear about it) from one it
  // accepted.
  const outcomes = new Map();

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
    writePromise = writePromise.then(async () => {
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
    return writePromise;
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
    const settings = await readSettingsFromDiskMigrated();
    const mode = settings?.[DEFAULT_MODE_SETTINGS_KEY];
    if (!isPermissionMode(mode) || mode === 'ask') return;
    await persistUpdate((current) => (Object.hasOwn(current.sessions, sessionId) ? current : {
      ...current,
      sessions: { ...current.sessions, [sessionId]: mode },
      revision: current.revision + 1,
    }));
  };

  const rememberSession = (info, directoryHint) => {
    const parsed = RuntimeSessionSchema.safeParse(info);
    if (!parsed.success) return;
    const session = parsed.data;
    const previous = sessions.get(session.sessionId);
    const directory = typeof directoryHint === 'string' && directoryHint ? directoryHint : previous?.directory;
    if (previous) sessions.delete(session.sessionId);
    sessions.set(session.sessionId, { parentSessionId: session.parentSessionId ?? null, directory, runtimeStatus: session.runtimeStatus, activeRunId: session.activeRunId });
    if (sessions.size > SESSION_CACHE_LIMIT) sessions.delete(sessions.keys().next().value);
  };

  const request = async (path, { method = 'GET', body, signal } = {}) => {
    const response = await service.request(path, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: signal || AbortSignal.timeout(requestTimeoutMs) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(payload?.detail || payload?.error || `Agent service request failed (${response.status})`); error.status = response.status; throw error; }
    return payload;
  };


  /** The nearest explicit mode up the session's lineage; unknown lineage fails closed to `ask`. */
  const resolveSessionMode = async (sessionId, directory) => {
    await load();
    // A default being written for a just-created session must be visible to
    // its first permission request.
    await writePromise.catch(() => undefined);
    const seen = new Set();
    let current = sessionId;
    while (current && !seen.has(current)) {
      if (Object.hasOwn(policy.sessions, current)) return policy.sessions[current];
      seen.add(current);
      let info = sessions.get(current);
      if (!info) {
        try {
          const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(current)}/snapshot`));
          rememberSession(snapshot.session, directory);
          info = sessions.get(current);
        } catch {
          return 'ask';
        }
      }
      current = info?.parentSessionId ?? null;
    }
    return 'ask';
  };

  const isSessionAutoAccepting = async (sessionId, directory) => isAutoAnsweringMode(await resolveSessionMode(sessionId, directory));

  /** `replied`, `held` (left for the user by the safety net), or `ignored` (an `ask` session). */
  const replyOnce = async (permission, directory) => {
    const approval = ApprovalRequestSchema.safeParse(permission);
    if (!approval.success) return 'ignored';
    const approvalRequest = approval.data;
    const mode = await resolveSessionMode(approvalRequest.sessionId, directory);
    if (mode === 'ask') return 'ignored';
    if (mode === 'safety') {
      const verdict = evaluatePermission ? await evaluatePermission(approvalRequest, directory) : null;
      if (verdict?.action !== 'accept') return 'held';
    }
    await request(`/api/agent/v1/sessions/${encodeURIComponent(approvalRequest.sessionId)}/approvals/${encodeURIComponent(approvalRequest.approvalId)}/respond`, {
      method: 'POST',
      body: { version: approvalRequest.version, epoch: approvalRequest.epoch, workerGeneration: approvalRequest.workerGeneration, decision: 'approve' },
    });
    return 'replied';
  };

  const rememberOutcome = (permissionId, outcome) => {
    outcomes.delete(permissionId);
    outcomes.set(permissionId, outcome);
    if (outcomes.size > OUTCOME_CACHE_LIMIT) outcomes.delete(outcomes.keys().next().value);
  };

  let accepting = true;
  const processPermission = (permission, directory) => {
    const parsed = ApprovalRequestSchema.safeParse(permission);
    if (!parsed.success) return Promise.resolve(false);
    const approval = parsed.data;
    const key = approval.approvalId;
    const existing = inFlight.get(key);
    if (existing) return existing;
    if (!accepting) return Promise.resolve(false);
    const outcome = (async () => {
      for (const delay of retryDelaysMs) {
        if (delay > 0) await wait(delay);
        try {
          return await replyOnce(approval, directory);
        } catch (error) {
          if (error?.status === 404) return 'replied';
        }
      }
      return 'failed';
    })();
    rememberOutcome(key, outcome);
    void outcome.then((result) => {
      if (result !== 'held' && result !== 'failed') return;
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.left-for-user',
        properties: { permissionId: key, sessionId: approval.sessionId, directory: directory ?? null },
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
    const mode = await resolveSessionMode(sessionId, directory);
    if (mode === 'auto') return true;
    if (mode === 'ask') return false;
    const outcome = permissionId ? outcomes.get(permissionId) : undefined;
    return outcome ? (await outcome) === 'replied' : false;
  };

  const listActiveSessions = async () => {
    const workspacePage = z.strictObject({ items: z.array(z.strictObject({ workspaceId: z.string().min(1) })), errors: z.record(z.string(), z.string()) }).parse(await listWorkspaceScopes());
    const sessionsList = [];
    for (const { workspaceId } of workspacePage.items) {
      try {
        const payload = z.strictObject({ items: z.array(RuntimeSessionSchema), errors: z.array(z.strictObject({ sessionId: z.string().min(1), code: z.string() })) }).parse(await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(workspaceId)}`));
        sessionsList.push(...payload.items);
      } catch {
        // One unavailable workspace must not prevent reconciliation elsewhere.
      }
    }
    return sessionsList.filter((session) => session.activeRunId !== null && session.runtimeStatus !== 'unavailable');
  };

  async function reconcilePending({ directories = [] } = {}) {
    if (!accepting) return;
    const normalizedDirectories = Array.from(new Set(directories.filter((directory) => typeof directory === 'string' && directory.trim()).map((directory) => directory.trim())));
    const key = normalizedDirectories.length > 0 ? normalizedDirectories.join('\n') : 'all';
    const existing = reconcilePromises.get(key);
    if (existing) return existing;
    const task = (async () => {
      await load();
      if (!accepting) return;
      const pendingById = new Map();
      for (const session of await listActiveSessions()) {
        if (!accepting) return;
        const scope = await resolveSessionScope(session.sessionId).catch(() => null);
        const directory = scope?.cwd ?? sessions.get(session.sessionId)?.directory;
        if (normalizedDirectories.length > 0 && (!directory || !normalizedDirectories.includes(directory))) continue;
        try {
          const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(session.sessionId)}/snapshot`));
          rememberSession(snapshot.session, directory);
          for (const approval of snapshot.approvals) {
            if (approval.status === 'pending') pendingById.set(approval.approvalId, { approval, directory });
          }
        } catch {
          // A failed snapshot is not an empty approval set; leave it for the next reconciliation.
        }
      }
      if (!accepting) return;
      await Promise.all(Array.from(pendingById.values()).map(({ approval, directory }) => processPermission(approval, directory)));
    })().finally(() => { reconcilePromises.delete(key); });
    reconcilePromises.set(key, task);
    return task;
  }

  const processEvent = (event, scope) => {
    if (!accepting) return;
    const parsed = CanonicalEventSchema.safeParse(event);
    if (!parsed.success) return;
    const payload = parsed.data;
    const directory = typeof scope?.cwd === 'string' && scope.cwd ? scope.cwd : undefined;
    if (payload.type === 'session.updated' && payload.session) {
      rememberSession(payload.session, directory);
      if (payload.session.rootSessionId === payload.session.sessionId) void applyDefaultMode(payload.session.sessionId).catch((error) => console.warn('[permission-auto-accept] failed to apply the default mode:', error?.message ?? error));
      return;
    }
    if (payload.type === 'session.status') {
      const previous = sessions.get(payload.sessionId);
      if (previous) { sessions.delete(payload.sessionId); sessions.set(payload.sessionId, { ...previous, runtimeStatus: payload.runtimeStatus, activeRunId: payload.activeRunId }); }
      return;
    }
    if (payload.type === 'approval.requested') { void processPermission(payload.approval, directory); return; }
    if (payload.type === 'approval.resolved') onPermissionReplied?.(payload.approval.approvalId);
  };

  let started = false;
  let unsubscribeEvent;
  let unsubscribeStatus;
  let drainingPromise = null;
  const stop = () => {
    accepting = false;
    started = false;
    unsubscribeEvent?.();
    unsubscribeStatus?.();
    unsubscribeEvent = undefined;
    unsubscribeStatus = undefined;
    if (drainingPromise) return drainingPromise;
    drainingPromise = (async () => {
      while (true) {
        const observedWrite = writePromise;
        const pending = [observedWrite, ...inFlight.values(), ...reconcilePromises.values()];
        await Promise.allSettled(pending);
        if (observedWrite === writePromise && inFlight.size === 0 && reconcilePromises.size === 0) return;
      }
    })().finally(() => { drainingPromise = null; });
    return drainingPromise;
  };
  const start = () => {
    if (started) return stop;
    if (drainingPromise) throw new Error('permission auto-accept is draining');
    accepting = true;
    started = true;
    unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') void reconcilePending().catch((error) => console.warn('[permission-auto-accept] failed to reconcile permissions:', error?.message ?? error));
    });
    void load().then(() => reconcilePending()).catch((error) => console.warn('[permission-auto-accept] failed to load policy:', error?.message ?? error));
    return stop;
  };

  return {
    snapshot,
    load,
    setSessionPolicy,
    resolveSessionMode,
    isSessionAutoAccepting,
    isPermissionAutoAnswered,
    processPermission,
    processEvent,
    start,
    stop,
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
}
