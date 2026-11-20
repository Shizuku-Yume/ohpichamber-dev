import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import type { Session } from '@openchamber/agent-contract';
import {
    permissionPolicyWireSchema,
    policySnapshotFromWire,
    resolvePermissionMode,
    type PermissionMode,
    type PermissionModeMap,
    type PermissionPolicySnapshot,
} from "./utils/permissionAutoAccept";
import { getAllSyncSessionMap } from "@/sync/sync-refs";
import { runtimeFetch, type RuntimeFetchOptions } from "@/lib/runtime-fetch";
import { createDeferredSafeJSONStorage } from "./utils/safeStorage";
import type { LoadPhase } from "./loadPhase";
import { useUIStore } from "@/stores/useUIStore";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { getRuntimeKey } from "@/lib/runtime-switch";

interface PermissionStore {
    modes: PermissionModeMap;
    /** `unknown` until the policy has been read; a failed read keeps the last one and says `error`. */
    phase: LoadPhase;
    loaded: boolean;
    saving: boolean;
    lastAppliedRevision: number;
    legacyCandidate: Record<string, boolean> | null;
    legacyRuntimeKey: string | null;
    hydrate: () => Promise<void>;
    applySnapshot: (snapshot: PermissionPolicySnapshot, expectedRuntimeKey?: string) => void;
    reset: () => void;
    getSessionMode: (sessionId: string) => PermissionMode;
    /**
     * The session's mode, or `null` when the policy has not answered yet.
     * Callers that act on a mode use `getSessionMode`, which falls back to the
     * configured default rather than inventing `ask`.
     */
    getCurrentPermissionMode: (sessionId: string) => PermissionMode | null;
    setSessionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
    refreshSpaceModes: (spaceId: string) => Promise<boolean>;
}

const readSnapshot = async (response: Response): Promise<PermissionPolicySnapshot> => {
    if (!response.ok) throw new Error(`Permission auto-accept request failed (${response.status})`);
    const parsed = permissionPolicyWireSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Invalid permission auto-accept response");
    return policySnapshotFromWire(parsed.data);
};

const requestSnapshot = async (path: string, init?: RuntimeFetchOptions) => readSnapshot(await runtimeFetch(path, init));

const putSessionMode = (sessionId: string, mode: PermissionMode, directory?: string) => requestSnapshot(
    `/api/permission-auto-accept/sessions/${encodeURIComponent(sessionId)}`,
    {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, enabled: mode !== "ask", directory }),
    },
);

const modeOf = (modes: PermissionModeMap, sessionById: ReadonlyMap<string, Session>, sessionId: string) =>
    resolvePermissionMode({ modes, sessions: [], sessionById, sessionId });

type PermissionOperation = { generation: number; runtimeKey: string; sequence: number };
let generation = 0;
let operationSequence = 0;
let latestStartedSequence = 0;
const pendingSavingOperations = new Set<number>();

const beginOperation = (): PermissionOperation => {
    const operation = { generation, runtimeKey: getRuntimeKey(), sequence: ++operationSequence };
    latestStartedSequence = operation.sequence;
    return operation;
};

const isCurrentOperation = (operation: PermissionOperation) => (
    operation.generation === generation && operation.runtimeKey === getRuntimeKey()
);

const legacySessionsSchema = z.record(z.string().min(1), z.boolean());

const persistedV1Schema = z.object({
    autoAccept: legacySessionsSchema.catch({}).default({}),
}).catch({ autoAccept: {} });

const persistedV2Schema = z.object({
    legacyCandidate: legacySessionsSchema.nullable().catch(null).default(null),
    legacyRuntimeKey: z.string().nullable().catch(null).default(null),
}).catch({ legacyCandidate: null, legacyRuntimeKey: null });

export const usePermissionStore = create<PermissionStore>()(persist((set, get) => ({
    modes: {},
    phase: "unknown",
    loaded: false,
    saving: false,
    lastAppliedRevision: -1,
    legacyCandidate: null,
    legacyRuntimeKey: null,

    hydrate: async () => {
        const operation = beginOperation();
        const legacyCandidate = get().legacyCandidate;
        let legacyRuntimeKey = get().legacyRuntimeKey;
        if (legacyCandidate && !legacyRuntimeKey) {
            legacyRuntimeKey = operation.runtimeKey;
            set({ legacyRuntimeKey });
        }
        let snapshot: PermissionPolicySnapshot;
        try {
            snapshot = await requestSnapshot("/api/permission-auto-accept");
        } catch (error) {
            if (isCurrentOperation(operation)) set({ phase: "error" });
            throw error;
        }
        if (!isCurrentOperation(operation)) return;
        const legacyEntries = legacyRuntimeKey === operation.runtimeKey
            ? Object.entries(legacyCandidate ?? {})
            : [];
        if (Object.keys(snapshot.modes).length === 0 && legacyEntries.length > 0) {
            for (const [sessionId, enabled] of legacyEntries) {
                if (!sessionId) continue;
                snapshot = await putSessionMode(sessionId, enabled ? "auto" : "ask");
                if (!isCurrentOperation(operation)) return;
            }
        }
        if (!isCurrentOperation(operation)) return;
        if (snapshot.revision === undefined && operation.sequence !== latestStartedSequence) return;
        get().applySnapshot(snapshot, operation.runtimeKey);
        if (legacyRuntimeKey === operation.runtimeKey) {
            set({ legacyCandidate: null, legacyRuntimeKey: null });
        }
    },

    reset: () => {
        generation += 1;
        latestStartedSequence = 0;
        pendingSavingOperations.clear();
        set({ modes: {}, phase: "unknown", loaded: false, saving: false, lastAppliedRevision: -1 });
    },

    applySnapshot: (snapshot, expectedRuntimeKey) => {
        if (expectedRuntimeKey && expectedRuntimeKey !== getRuntimeKey()) return;
        const { revision } = snapshot;
        set((state) => {
            if (revision === undefined) {
                return state.lastAppliedRevision >= 0 ? state : { modes: snapshot.modes, phase: "ready", loaded: true };
            }
            if (revision < state.lastAppliedRevision) return state;
            return { modes: snapshot.modes, phase: "ready", loaded: true, lastAppliedRevision: revision };
        });
    },

    /**
     * A concrete mode for the composer and for anything else that must act.
     * Before the policy is read the instance's configured default is the honest
     * answer — it is what the server gives a new top-level session — so the
     * shield reflects that instead of claiming Ask.
     */
    getSessionMode: (sessionId) => (
        get().getCurrentPermissionMode(sessionId) ?? useUIStore.getState().permissionDefaultMode
    ),

    getCurrentPermissionMode: (sessionId) => {
        if (!sessionId) return null;
        const modes = get().modes;
        if (get().phase !== "ready" || Object.keys(modes).length === 0) return null;
        return modeOf(modes, getAllSyncSessionMap(), sessionId);
    },

    setSessionMode: async (sessionId, mode) => {
        if (!sessionId) return;
        const operation = beginOperation();
        pendingSavingOperations.add(operation.sequence);
        set({ saving: true });
        try {
            const directory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
                ?? useDirectoryStore.getState().currentDirectory
                ?? undefined;
            const snapshot = await putSessionMode(sessionId, mode, directory);
            if (!isCurrentOperation(operation)) return;
            if (snapshot.revision === undefined && operation.sequence !== latestStartedSequence) return;
            get().applySnapshot(snapshot, operation.runtimeKey);
        } finally {
            if (isCurrentOperation(operation)) {
                pendingSavingOperations.delete(operation.sequence);
                set({ saving: pendingSavingOperations.size > 0 });
            }
        }
    },

    refreshSpaceModes: async (spaceId: string): Promise<boolean> => {
        const runtimeKey = getRuntimeKey();
        let snapshot: PermissionPolicySnapshot;
        try {
            snapshot = await requestSnapshot("/api/permission-auto-accept", { directory: `/spaces/${spaceId}` });
        } catch {
            return false;
        }
        if (getRuntimeKey() !== runtimeKey) return false;
        get().applySnapshot(snapshot, runtimeKey);
        return true;
    },

}), {
    name: "permission-store",
    storage: createDeferredSafeJSONStorage(),
    version: 2,
    migrate: (persisted, version) => {
        if (version < 2) {
            const legacyCandidate = persistedV1Schema.parse(persisted ?? {}).autoAccept;
            return {
                legacyCandidate: Object.keys(legacyCandidate).length > 0 ? legacyCandidate : null,
                legacyRuntimeKey: null,
            };
        }
        return persistedV2Schema.parse(persisted ?? {});
    },
    partialize: (state) => ({
        legacyCandidate: state.legacyCandidate,
        legacyRuntimeKey: state.legacyRuntimeKey,
    }),
}));
