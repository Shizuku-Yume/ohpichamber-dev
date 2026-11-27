import express from 'express';
import { z } from 'zod';
import { PERMISSION_MODES, isAutoAnsweringMode, isPermissionMode, toPermissionMode, type PermissionMode } from './modes.js';
import type {
  PermissionApprovalInput,
  PermissionAutoAcceptOptions,
  PermissionDirectory,
  PermissionEvaluationResult,
  PermissionOutcome,
  PermissionPolicy,
  PermissionPolicySnapshot,
} from './contracts.js';
export type { PermissionApprovalInput, PermissionEvaluationResult } from './contracts.js';
import { controlErrorFields } from '../openchamber-control/error.js';
import { isString } from '../shared/guards.js';
import type { Application } from '../shared/http-contracts.js';
import type { JsonValue } from '../shared/json-values.js';

const SETTINGS_KEY = 'permissionAutoAccept';
const DEFAULT_MODE_SETTINGS_KEY = 'permissionDefaultMode';
const OUTCOME_CACHE_LIMIT = 1000;
const HELD_BROADCAST_LIMIT = 5000;

const storedEntrySchema = z.union([z.boolean(), z.enum(PERMISSION_MODES)]).nullable().catch(null);
const storedPolicySchema = z.object({
  sessions: z.record(z.string().min(1), storedEntrySchema).catch({}).default({}),
  revision: z.number().int().nonnegative().catch(0).default(0),
}).catch({ sessions: {}, revision: 0 });

const SetSessionPolicyBodySchema = z.object({
  directory: z.string().optional().catch(undefined),
  mode: z.union([z.enum(PERMISSION_MODES), z.string(), z.boolean()]).optional(),
  enabled: z.union([z.enum(PERMISSION_MODES), z.string(), z.boolean()]).optional(),
});

type StoredPolicy = z.output<typeof storedPolicySchema>;

const readStoredPolicy = (value: Parameters<typeof storedPolicySchema.parse>[0]): StoredPolicy =>
  storedPolicySchema.parse(value ?? {});

const hasLegacyEntries = (stored: StoredPolicy): boolean =>
  Object.values(stored.sessions).some((entry) => entry === true || entry === false);

interface NormalizedPermissionPolicy {
  policy: PermissionPolicy;
  hadLegacy: boolean;
}

const normalizePolicy = (
  value?: Parameters<typeof storedPolicySchema.parse>[0],
  legacyEnabledMode: PermissionMode = 'auto',
): NormalizedPermissionPolicy => {
  const stored = readStoredPolicy(value);
  const sessions: PermissionPolicy['sessions'] = {};
  for (const [sessionId, entry] of Object.entries(stored.sessions)) {
    const mode = toPermissionMode(entry, legacyEnabledMode);
    if (mode) sessions[sessionId] = mode;
  }
  return { policy: { sessions, revision: stored.revision }, hadLegacy: hasLegacyEntries(stored) };
};

const errorMessageOf = (cause: Parameters<typeof controlErrorFields>[0]): string | undefined => {
  const message = controlErrorFields(cause)?.message;
  return isString(message) ? message : undefined;
};

export interface ObservedPermissionSession {
  sessionId: string;
  parentSessionId?: string | null | undefined;
  rootSessionId?: string | undefined;
}

export interface PermissionAutoAcceptRoutesRuntime {
  load: () => Promise<PermissionPolicySnapshot>;
  setSessionPolicy: (sessionId: string, mode: PermissionMode | boolean | string | null | undefined, directory?: PermissionDirectory) => Promise<PermissionPolicySnapshot>;
}

export interface PermissionAutoAcceptRuntime extends PermissionAutoAcceptRoutesRuntime {
  snapshot: () => PermissionPolicySnapshot;
  applyDefaultMode: (sessionId: string) => Promise<void>;
  observeSession: (session: ObservedPermissionSession | null | undefined) => void;
  resolveSessionMode: (sessionId: string, directory?: PermissionDirectory) => Promise<PermissionMode>;
  isSessionAutoAccepting: (sessionId: string, directory?: PermissionDirectory) => Promise<boolean>;
  evaluateSessionPermission: (
    sessionId: string,
    approval: PermissionApprovalInput | null | undefined,
    directory?: PermissionDirectory,
  ) => Promise<PermissionEvaluationResult>;
  isPermissionAutoAnswered: (
    sessionId: string,
    permissionId?: string | null,
    directory?: PermissionDirectory,
  ) => Promise<boolean>;
}

export function createPermissionAutoAcceptRuntime({
  readSettingsFromDiskMigrated,
  persistSettings,
  broadcastGlobalUiEvent,
  evaluatePermission = null,
  resolveLegacyEnabledMode = async () => 'auto',
  resolveSessionParent = async () => null,
  onSessionPolicyChanged = null,
}: PermissionAutoAcceptOptions): PermissionAutoAcceptRuntime {
  let policy = normalizePolicy().policy;
  let loaded = false;
  let loadPromise: Promise<PermissionPolicySnapshot> | null = null;
  let writePromise: Promise<void> = Promise.resolve();
  const lineage = new Map<string, string | null>();
  const outcomes = new Map<string, PermissionOutcome>();
  const heldBroadcasts = new Set<string>();

  const snapshot = (): PermissionPolicySnapshot => {
    const legacySessions: Record<string, boolean> = {};
    for (const [sessionId, mode] of Object.entries(policy.sessions)) legacySessions[sessionId] = isAutoAnsweringMode(mode);
    return { sessions: legacySessions, modes: { ...policy.sessions }, revision: policy.revision };
  };

  const readPolicy = async (): Promise<PermissionPolicy> => {
    const settings = await readSettingsFromDiskMigrated();
    const stored = settings?.[SETTINGS_KEY];
    const legacyEnabledMode = hasLegacyEntries(readStoredPolicy(stored)) ? await resolveLegacyEnabledMode() : 'auto';
    const { policy: next, hadLegacy } = normalizePolicy(stored, legacyEnabledMode);
    if (hadLegacy) await persistSettings({ [SETTINGS_KEY]: next });
    return next;
  };

  const load = async (): Promise<PermissionPolicySnapshot> => {
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

  const persistUpdate = (update: (current: PermissionPolicy) => PermissionPolicy): Promise<PermissionPolicySnapshot> => {
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
    writePromise = result.then(() => undefined, () => undefined);
    return result;
  };

  const setSessionPolicy = async (
    sessionId: string,
    mode: PermissionMode | boolean | string | null | undefined,
    directory?: PermissionDirectory,
  ): Promise<PermissionPolicySnapshot> => {
    if (!sessionId.trim()) throw new TypeError('sessionId is required');
    const parsedMode = isPermissionMode(mode) || mode === true || mode === false ? mode : null;
    const next = toPermissionMode(parsedMode);
    if (!next) throw new TypeError('mode must be ask, safety or auto');
    await load();
    const trimmed = sessionId.trim();
    const result = await persistUpdate((current) => ({
      ...current,
      sessions: { ...current.sessions, [trimmed]: next },
      revision: current.revision + 1,
    }));
    try { await onSessionPolicyChanged?.(trimmed, next, directory); } catch { void 0; }
    return result;
  };

  const applyDefaultMode = async (sessionId: string): Promise<void> => {
    await load();
    if (!sessionId || Object.hasOwn(policy.sessions, sessionId)) return;
    if (lineage.get(sessionId) !== null) {
      let parent: string | null | undefined;
      try { parent = await resolveSessionParent(sessionId); } catch { return; }
      if (isString(parent) && parent && parent !== sessionId) {
        lineage.set(sessionId, parent);
        return;
      }
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

  const observeSession = (session: ObservedPermissionSession | null | undefined): void => {
    if (!session || !session.sessionId) return;
    const parent = isString(session.parentSessionId) && session.parentSessionId && session.parentSessionId !== session.sessionId
      ? session.parentSessionId
      : (session.rootSessionId === session.sessionId ? null : undefined);
    if (parent === null || isString(parent)) {
      lineage.delete(session.sessionId);
      lineage.set(session.sessionId, parent);
      while (lineage.size > 10_000) {
        const oldest = lineage.keys().next().value;
        if (oldest === undefined) break;
        lineage.delete(oldest);
      }
    }
  };

  const resolveSessionMode = async (sessionId: string, directory?: PermissionDirectory): Promise<PermissionMode> => {
    try {
      await load();
      await writePromise.catch(() => undefined);
      const seen = new Set<string>();
      let current: string | null = sessionId;
      const currentDirectory = directory;
      while (current && !seen.has(current)) {
        if (Object.hasOwn(policy.sessions, current)) {
          const explicit = policy.sessions[current];
          if (explicit !== undefined) return explicit;
        }
        seen.add(current);
        let parent: string | null | undefined = lineage.get(current);
        if (parent === undefined) {
          parent = await resolveSessionParent(current, currentDirectory);
          if (isString(parent) && !parent) parent = undefined;
          if (isString(parent) && parent === current) parent = undefined;
          if (parent === null) lineage.set(current, null);
          else if (isString(parent)) {
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

  const isSessionAutoAccepting = async (sessionId: string, directory?: PermissionDirectory): Promise<boolean> =>
    isAutoAnsweringMode(await resolveSessionMode(sessionId, directory));

  const rememberOutcome = (permissionId: string | undefined, outcome: PermissionOutcome): void => {
    if (!permissionId) return;
    outcomes.delete(permissionId);
    outcomes.set(permissionId, outcome);
    if (outcomes.size > OUTCOME_CACHE_LIMIT) {
      const oldest = outcomes.keys().next().value;
      if (oldest !== undefined) outcomes.delete(oldest);
    }
  };

  const evaluateSessionPermission = async (
    sessionId: string,
    approval: PermissionApprovalInput | null | undefined,
    directory?: PermissionDirectory,
  ): Promise<PermissionEvaluationResult> => {
    const mode = await resolveSessionMode(sessionId, directory);
    if (mode === 'ask') return { mode, action: 'hold' };
    if (mode === 'auto') {
      rememberOutcome(approval?.approvalId, 'replied');
      return { mode, action: 'accept' };
    }
    const verdict = evaluatePermission && approval ? await evaluatePermission(approval, directory).catch(() => null) : null;
    if (verdict?.action === 'accept') {
      rememberOutcome(approval?.approvalId, 'replied');
      return { mode, action: 'accept' };
    }
    rememberOutcome(approval?.approvalId, 'held');
    const permissionId = approval?.approvalId;
    if (isString(permissionId) && permissionId && !heldBroadcasts.has(permissionId)) {
      heldBroadcasts.add(permissionId);
      if (heldBroadcasts.size > HELD_BROADCAST_LIMIT) {
        const oldest = heldBroadcasts.values().next().value;
        if (oldest !== undefined) heldBroadcasts.delete(oldest);
      }
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.left-for-user',
        properties: { permissionId, sessionId, directory: directory ?? null },
      });
    }
    return { mode, action: 'hold' };
  };

  const isPermissionAutoAnswered = async (
    sessionId: string,
    permissionId?: string | null,
    directory?: PermissionDirectory,
  ): Promise<boolean> => {
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

const json16Strict = express.json({ limit: '16kb', strict: true });

export function registerPermissionAutoAcceptRoutes(app: Application, runtime: PermissionAutoAcceptRoutesRuntime): void {
  app.get('/api/permission-auto-accept', async (_req, res) => {
    try {
      res.json(await runtime.load());
    } catch (error) {
      res.status(500).json({ error: errorMessageOf(error) ?? 'Failed to load permission auto-accept policy' });
    }
  });

  app.put<JsonValue | undefined>('/api/permission-auto-accept/sessions/:sessionId', json16Strict, async (req, res) => {
    try {
      const parsed = SetSessionPolicyBodySchema.safeParse(req.body ?? {});
      const directory = parsed.success ? parsed.data.directory : undefined;
      const mode = parsed.success ? (parsed.data.mode ?? parsed.data.enabled) : undefined;
      res.json(await runtime.setSessionPolicy(req.params.sessionId ?? '', mode, directory));
    } catch (error) {
      res.status(error instanceof TypeError ? 400 : 500).json({ error: errorMessageOf(error) });
    }
  });
}
