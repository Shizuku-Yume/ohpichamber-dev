import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { ensureGlobalSessionsLoaded, refreshGlobalSessions, resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from './session-ui-store';
import { clearLastActiveSession, readLastActiveSession } from './last-session-cache';

export type LastSessionRestoreResult =
    | 'restored'
    | 'none'
    | 'failed';

const isSessionListAuthoritative = (): boolean => {
    const { hasLoaded, status } = useGlobalSessionsStore.getState();
    return hasLoaded && status === 'ready';
};

const loadSessionList = (refresh: boolean) =>
    (refresh ? refreshGlobalSessions() : ensureGlobalSessionsLoaded()).catch(() => null);

export const restoreLastActiveSession = async (options: {
    readonly refresh: boolean;
}): Promise<LastSessionRestoreResult> => {
    if (useSessionUIStore.getState().currentSessionId) return 'none';
    const runtimeKey = getRuntimeKey();
    const persisted = readLastActiveSession(runtimeKey);
    if (!persisted) return 'none';

    const snapshot = await loadSessionList(options.refresh);
    if (getRuntimeKey() !== runtimeKey) return 'none';
    if (!snapshot || !isSessionListAuthoritative()) return 'failed';

    const session = snapshot.activeSessions.find((entry) => entry.sessionId === persisted.sessionId);
    if (!session) {
        clearLastActiveSession(runtimeKey);
        return 'none';
    }

    const latest = useSessionUIStore.getState();
    if (latest.currentSessionId || readLastActiveSession(runtimeKey)?.sessionId !== persisted.sessionId) {
        return 'none';
    }
    void latest.setCurrentSession(
        session.sessionId,
        resolveGlobalSessionDirectory(session) ?? persisted.directory ?? undefined,
    );
    return 'restored';
};

type ReopenedSession = { readonly runtimeKey: string; readonly sessionId: string };

const reopenLastActiveSession = (): ReopenedSession | null => {
    const ui = useSessionUIStore.getState();
    if (ui.currentSessionId) return null;
    const runtimeKey = getRuntimeKey();
    const persisted = readLastActiveSession(runtimeKey);
    if (!persisted) return null;
    const cached = useGlobalSessionsStore.getState().entityById.get(persisted.sessionId);
    const directory = persisted.directory ?? (cached ? resolveGlobalSessionDirectory(cached) : null);
    if (!directory) return null;
    void ui.setCurrentSession(persisted.sessionId, directory);
    return { runtimeKey, sessionId: persisted.sessionId };
};

const confirmReopenedSession = async (reopened: ReopenedSession, refresh: boolean): Promise<LastSessionRestoreResult> => {
    const snapshot = await loadSessionList(refresh);
    if (getRuntimeKey() !== reopened.runtimeKey) return 'none';
    if (!snapshot || !isSessionListAuthoritative()) return 'failed';

    const latest = useSessionUIStore.getState();
    const stillOpen = latest.currentSessionId === reopened.sessionId;
    const session = snapshot.activeSessions.find((entry) => entry.sessionId === reopened.sessionId);
    if (session) {
        const directory = normalizePath(resolveGlobalSessionDirectory(session));
        if (stillOpen && directory && directory !== latest.currentSessionDirectory) {
            void latest.setCurrentSession(session.sessionId, directory);
        }
        return 'restored';
    }
    if (readLastActiveSession(reopened.runtimeKey)?.sessionId === reopened.sessionId) {
        clearLastActiveSession(reopened.runtimeKey);
    }
    if (stillOpen) void latest.setCurrentSession(null);
    return 'none';
};

export const beginLastSessionRestore = (options: {
    readonly selectNow: boolean;
    readonly refresh: boolean;
}): (() => Promise<LastSessionRestoreResult>) => {
    const reopened = options.selectNow ? reopenLastActiveSession() : null;
    return reopened
        ? () => confirmReopenedSession(reopened, options.refresh)
        : () => restoreLastActiveSession({ refresh: options.refresh });
};
