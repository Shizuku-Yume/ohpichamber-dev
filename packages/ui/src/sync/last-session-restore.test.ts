import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import * as runtimeSwitch from '@/lib/runtime-switch';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { clearLastActiveSession, persistLastActiveSession, readLastActiveSession } from './last-session-cache';
import { beginLastSessionRestore, restoreLastActiveSession } from './last-session-restore';
import { useSessionUIStore } from './session-ui-store';
import { deferred } from './session-message-loader-test-fixtures';

const session = (sessionId: string, workspaceId = 'workspace-restore'): Session => ({
    sessionId,
    rootSessionId: sessionId,
    projectId: 'project-restore',
    workspaceId,
    displayPath: 'repo/session',
    createdAt: 1,
    updatedAt: 1,
    epoch: 'epoch-restore',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    title: sessionId, metadata: {},
    metadataRevision: '1',
    archiveRevision: '0',
});

const originalSetCurrentSession = useSessionUIStore.getState().setCurrentSession;
let previousGlobalState = useGlobalSessionsStore.getState();
let selected: Array<{ id: string | null; directory: string | null | undefined }> = [];

beforeEach(() => {
    previousGlobalState = useGlobalSessionsStore.getState();
    resetWorkspaceDirectories();
    registerWorkspaceDirectory('workspace-restore', '/repo');
    selected = [];
    useSessionUIStore.setState({
        currentSessionId: null,
        setCurrentSession: (id, directory) => { selected.push({ id, directory }); },
    });
    useGlobalSessionsStore.setState({
        hasLoaded: true,
        status: 'ready',
        activeSessions: [session('ses_open'), session('ses_other')],
        archivedSessions: [],
    });
    clearLastActiveSession(getRuntimeKey());
});

afterEach(() => {
    useSessionUIStore.setState({ setCurrentSession: originalSetCurrentSession, currentSessionId: null, currentSessionDirectory: null });
    useGlobalSessionsStore.setState(previousGlobalState);
    resetWorkspaceDirectories();
    clearLastActiveSession(getRuntimeKey());
});

describe('restoreLastActiveSession', () => {
    test('reopens exactly the session left open', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });

        expect(await restoreLastActiveSession({ refresh: false })).toBe('restored');
        expect(selected).toEqual([{ id: 'ses_open', directory: '/repo' }]);
    });

    test('leaves the launch alone without a pointer', async () => {
        expect(await restoreLastActiveSession({ refresh: false })).toBe('none');
        expect(selected).toEqual([]);
    });

    test('does not replace a session a link already opened', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        useSessionUIStore.setState({ currentSessionId: 'ses_other' });

        expect(await restoreLastActiveSession({ refresh: false })).toBe('none');
        expect(selected).toEqual([]);
    });

    test('drops the pointer to a session that no longer exists', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_deleted', directory: '/repo' });

        expect(await restoreLastActiveSession({ refresh: false })).toBe('none');
        expect(selected).toEqual([]);
        expect(readLastActiveSession(getRuntimeKey())).toBeNull();
    });

    test('keeps the pointer and reports failure when the session list could not be read', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        // Failed native discovery cannot turn a persisted pointer into a deletion.
        const originalLoadSessions = useGlobalSessionsStore.getState().loadSessions;
        useGlobalSessionsStore.setState({
            hasLoaded: false,
            status: 'idle',
            activeSessions: [],
            loadSessions: async () => {
                useGlobalSessionsStore.setState({ status: 'error' });
                return { activeSessions: [], archivedSessions: [] };
            },
        });
        try {
            expect(await restoreLastActiveSession({ refresh: false })).toBe('failed');
            expect(selected).toEqual([]);
            expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_open');

            // A later authoritative discovery confirms the native session.
            useGlobalSessionsStore.setState({
                loadSessions: async () => {
                    useGlobalSessionsStore.setState({ hasLoaded: true, status: 'ready', activeSessions: [session('ses_open')] });
                    return { activeSessions: [session('ses_open')], archivedSessions: [] };
                },
            });
            expect(await restoreLastActiveSession({ refresh: false })).toBe('restored');
            expect(selected).toEqual([{ id: 'ses_open', directory: '/repo' }]);
        } finally {
            useGlobalSessionsStore.setState({ loadSessions: originalLoadSessions });
        }
    });

    test('a failed refresh after an earlier load is not authoritative either', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        const originalLoadSessions = useGlobalSessionsStore.getState().loadSessions;
        useGlobalSessionsStore.setState({
            loadSessions: async () => {
                useGlobalSessionsStore.setState({ status: 'error', activeSessions: [] });
                return { activeSessions: [], archivedSessions: [] };
            },
        });
        try {
            expect(await restoreLastActiveSession({ refresh: true })).toBe('failed');
            expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_open');
        } finally {
            useGlobalSessionsStore.setState({ loadSessions: originalLoadSessions });
        }
    });

    test('does not select a session after the user opens another while discovery is pending', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        const original = useGlobalSessionsStore.getState().loadSessions;
        const { promise, resolve: resolveList } = deferred<{ activeSessions: Session[]; archivedSessions: Session[] }>();
        useGlobalSessionsStore.setState({
            hasLoaded: false,
            status: 'idle',
            loadSessions: () => promise,
        });
        try {
            const attempt = restoreLastActiveSession({ refresh: false });
            useSessionUIStore.setState({ currentSessionId: 'ses_other' });
            useGlobalSessionsStore.setState({ hasLoaded: true, status: 'ready' });
            resolveList({ activeSessions: [session('ses_open')], archivedSessions: [] });
            expect(await attempt).toBe('none');
            expect(selected).toEqual([]);
        } finally {
            useGlobalSessionsStore.setState({ loadSessions: original });
        }
    });

    test('rejects discovery completion from a previous runtime without deleting its pointer', async () => {
        let runtimeKey = 'restore-runtime-a';
        const runtime = spyOn(runtimeSwitch, 'getRuntimeKey').mockImplementation(() => runtimeKey);
        const original = useGlobalSessionsStore.getState().loadSessions;
        const { promise, resolve: resolveList } = deferred<{ activeSessions: Session[]; archivedSessions: Session[] }>();
        persistLastActiveSession(runtimeKey, { sessionId: 'ses_open', directory: '/repo' });
        useGlobalSessionsStore.setState({
            hasLoaded: false,
            status: 'idle',
            loadSessions: () => promise,
        });
        try {
            const attempt = restoreLastActiveSession({ refresh: false });
            runtimeKey = 'restore-runtime-b';
            useGlobalSessionsStore.setState({ hasLoaded: true, status: 'ready' });
            resolveList({ activeSessions: [], archivedSessions: [] });
            expect(await attempt).toBe('none');
            expect(selected).toEqual([]);
            expect(readLastActiveSession('restore-runtime-a')?.sessionId).toBe('ses_open');
        } finally {
            clearLastActiveSession('restore-runtime-a');
            clearLastActiveSession('restore-runtime-b');
            runtime.mockRestore();
            useGlobalSessionsStore.setState({ loadSessions: original });
        }
    });

    test('retains the pointer when native discovery rejects', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        useGlobalSessionsStore.setState({
            loadSessions: async () => { throw new Error('discovery unavailable'); },
        });
        expect(await restoreLastActiveSession({ refresh: true })).toBe('failed');
        expect(selected).toEqual([]);
        expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_open');
    });

    test('successful empty active discovery clears an archived session pointer', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        useGlobalSessionsStore.setState({
            activeSessions: [],
            archivedSessions: [{ ...session('ses_open'), archivedAt: 10, archiveRevision: '1' }],
            hasLoaded: true,
            status: 'ready',
        });
        expect(await restoreLastActiveSession({ refresh: false })).toBe('none');
        expect(selected).toEqual([]);
        expect(readLastActiveSession(getRuntimeKey())).toBeNull();
    });
});

describe('beginLastSessionRestore', () => {
    // Selection here moves the store, as the real action does, so "the user
    // opened something else" can be told apart from "still on the restored one".
    beforeEach(() => {
        useSessionUIStore.setState({
            setCurrentSession: (id, directory) => {
                selected.push({ id, directory });
                useSessionUIStore.setState({ currentSessionId: id, currentSessionDirectory: id ? directory ?? null : null });
            },
        });
    });

    const holdSessionList = () => {
        const original = useGlobalSessionsStore.getState().loadSessions;
        let loads = 0;
        let answer!: (sessions: Session[] | null) => void;
        useGlobalSessionsStore.setState({
            hasLoaded: false,
            status: 'idle',
            loadSessions: () => {
                loads += 1;
                const { promise, resolve } = deferred<{ activeSessions: Session[]; archivedSessions: Session[] }>();
                answer = (sessions) => {
                    if (sessions === null) {
                        useGlobalSessionsStore.setState({ status: 'error' });
                        resolve({ activeSessions: [], archivedSessions: [] });
                        return;
                    }
                    useGlobalSessionsStore.setState({ hasLoaded: true, status: 'ready', activeSessions: sessions });
                    resolve({ activeSessions: sessions, archivedSessions: [] });
                };
                return promise;
            },
        });
        return {
            loads: () => loads,
            answer: (sessions: Session[] | null) => answer(sessions),
            restore: () => useGlobalSessionsStore.setState({ loadSessions: original }),
        };
    };

    test('opens the last session at once, without waiting for the session list', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        const list = holdSessionList();
        try {
            const attempt = beginLastSessionRestore({ selectNow: true });
            // Selected synchronously, before the list was even asked for.
            expect(selected).toEqual([{ id: 'ses_open', directory: '/repo' }]);
            expect(list.loads()).toBe(0);

            const result = attempt();
            list.answer([session('ses_open')]);
            expect(await result).toBe('restored');
            expect(selected).toEqual([{ id: 'ses_open', directory: '/repo' }]);
            expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_open');
        } finally {
            list.restore();
        }
    });

    test('takes the directory from the cached session workspace mapping when the pointer has none', () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: null });
        const original = useGlobalSessionsStore.getState().entityById;
        useGlobalSessionsStore.setState({ entityById: new Map([['ses_open', session('ses_open')]]) });
        try {
            beginLastSessionRestore({ selectNow: true });
            expect(selected).toEqual([{ id: 'ses_open', directory: '/repo' }]);
        } finally {
            useGlobalSessionsStore.setState({ entityById: original });
        }
    });

    test('waits for the session list when the directory is unknown', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: null });
        const original = useGlobalSessionsStore.getState().entityById;
        useGlobalSessionsStore.setState({ entityById: new Map() });
        const list = holdSessionList();
        try {
            const attempt = beginLastSessionRestore({ selectNow: true });
            expect(selected).toEqual([]);
            const result = attempt();
            list.answer([session('ses_open')]);
            expect(await result).toBe('restored');
            expect(selected).toEqual([{ id: 'ses_open', directory: '/repo' }]);
        } finally {
            list.restore();
            useGlobalSessionsStore.setState({ entityById: original });
        }
    });

    test('leaves the launch to a route that names a session', () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        beginLastSessionRestore({ selectNow: false });
        expect(selected).toEqual([]);
    });

    test('falls back to the draft and drops the pointer when the list says the session is gone', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_deleted', directory: '/repo' });
        const list = holdSessionList();
        try {
            const attempt = beginLastSessionRestore({ selectNow: true });
            expect(useSessionUIStore.getState().currentSessionId).toBe('ses_deleted');

            // Failed discovery proves nothing and leaves the reopened session intact.
            const early = attempt();
            list.answer(null);
            expect(await early).toBe('failed');
            expect(useSessionUIStore.getState().currentSessionId).toBe('ses_deleted');
            expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_deleted');

            const result = attempt();
            list.answer([session('ses_other')]);
            expect(await result).toBe('none');
            expect(useSessionUIStore.getState().currentSessionId).toBeNull();
            expect(readLastActiveSession(getRuntimeKey())).toBeNull();
        } finally {
            list.restore();
        }
    });

    test('reselects a reopened session at its authoritative mapped workspace directory', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_open', directory: '/repo' });
        registerWorkspaceDirectory('workspace-moved', '/repo/.worktrees/moved');
        const list = holdSessionList();
        try {
            const attempt = beginLastSessionRestore({ selectNow: true });
            const result = attempt();
            list.answer([session('ses_open', 'workspace-moved')]);
            expect(await result).toBe('restored');
            expect(selected).toEqual([
                { id: 'ses_open', directory: '/repo' },
                { id: 'ses_open', directory: '/repo/.worktrees/moved' },
            ]);
        } finally {
            list.restore();
        }
    });

    test('keeps what the user opened meanwhile when the reopened session turns out gone', async () => {
        persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_deleted', directory: '/repo' });
        const list = holdSessionList();
        try {
            const attempt = beginLastSessionRestore({ selectNow: true });
            const result = attempt();
            // The user clicks another session while the list loads; selecting
            // it moves the pointer, as setCurrentSession does.
            useSessionUIStore.getState().setCurrentSession('ses_other', '/repo');
            persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_other', directory: '/repo' });
            list.answer([session('ses_other')]);
            expect(await result).toBe('none');
            expect(useSessionUIStore.getState().currentSessionId).toBe('ses_other');
            expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_other');
        } finally {
            list.restore();
        }
    });
});
