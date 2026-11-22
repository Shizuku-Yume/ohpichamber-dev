import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import * as openchamberConfig from '@/lib/openchamberConfig';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSelectionStore } from '@/sync/selection-store';
import { ChildStoreManager } from '../child-store';
import { setActionRefs } from '../session-actions';
import { setSyncRefs } from '../sync-refs';
import { useSessionUIStore } from '../session-ui-store';
import { nativeSnapshot } from '../session-message-loader-test-fixtures';

const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
const originalUI = useSessionUIStore.getState();
const originalConfig = useConfigStore.getState();
const originalDirectory = useDirectoryStore.getState();
const originalGlobal = useGlobalSessionsStore.getState();
const originalProjects = useProjectsStore.getState();
const originalSelection = useSelectionStore.getState();
let manager: ChildStoreManager;
let runtimeNumber = 0;
let failMode = false;
const events: string[] = [];
const createdSessions: string[] = [];

const nativeSession = (sessionId: string, workspaceId = 'workspace-draft-mode'): Session => ({
    ...nativeSnapshot(sessionId, []).session,
    projectId: 'project-1',
    workspaceId,
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
});

beforeEach(async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://draft-mode.test', runtimeKey: `draft-mode-${++runtimeNumber}` });
    events.length = 0;
    createdSessions.length = 0;
    failMode = false;
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useProjectsStore.setState({ projects: [{ id: 'project-1', path: '/repo' }], activeProjectId: 'project-1' });
    useSelectionStore.setState({
        sessionModelSelections: new Map(), sessionAgentSelections: new Map(),
        sessionFollowedAgents: new Map(), sessionFollowedModels: new Map(),
        sessionAgentModelSelections: new Map(), agentModelVariantSelections: new Map(), lastUsedProvider: null,
    });
    useConfigStore.setState({
        currentAgentName: 'agent-default', currentProviderId: 'provider', currentModelId: 'model',
        currentVariantSelection: { override: undefined, inherited: 'high' },
        selectionSource: 'auto', agentSelectionSource: 'auto',
        isConnected: true, hasEverConnected: true,
    });
    useDirectoryStore.setState({ currentDirectory: '/repo', directoryHistory: [], historyIndex: -1, homeDirectory: '/home/test', isHomeReady: true });
    useSessionUIStore.setState({
        currentSessionId: null, currentSessionDirectory: null, materializedDraftSessionId: null,
        newSessionDraft: { draftId: 0, open: false, directoryOverride: null, parentID: null, target: 'chat' },
        availableWorktreesByProject: new Map(), availableWorktrees: [], worktreeMetadata: new Map(), error: null,
    });
    manager = new ChildStoreManager();
    setSyncRefs(manager, '/repo');
    setActionRefs(manager, () => '/repo');
    spyOn(useConfigStore.getState(), 'activateDirectory').mockResolvedValue(undefined);
    spyOn(useConfigStore.getState(), 'applyDefaultModelAgentSelection').mockImplementation(() => undefined);
    spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/test' });
    spyOn(hostFilesystem, 'createDirectory').mockImplementation(async path => ({ success: true, path }));
    spyOn(hostFilesystem, 'getDirectoryAvailability').mockResolvedValue('available');
    spyOn(hostFilesystem, 'getDirectory').mockReturnValue(undefined);
    spyOn(hostFilesystem, 'setDirectory').mockImplementation(() => undefined);
    spyOn(openchamberConfig, 'getWorktreeSetupWaitEnabled').mockResolvedValue(false);
    await ensureChatsRootDirectory();
    spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/auth/url-token')) return Response.json({ token: 'draft-mode-token', expiresAt: 999 });
        if (url.includes('/api/session-knowledge')) return Response.json({ text: '', signature: '' });
        throw new Error(`Unexpected network request: ${url}`);
    });
    spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace-draft-mode', projectId: 'project-1', name: 'Repo', displayPath: '/repo' });
    spyOn(canonicalClient, 'createSession').mockImplementation(async request => {
        events.push('create');
        createdSessions.push('created');
        return { session: nativeSession('ses_draft_mode', request.workspaceId) };
    });
    spyOn(canonicalClient, 'setMode').mockImplementation(async (_sessionId, mode) => {
        events.push(`mode:${mode}`);
        if (failMode) throw new Error('The plan model role is unavailable');
        return { type: 'mode.set', mode: mode === 'plan' ? { kind: 'plan', status: 'active', planReference: 'local://PLAN.md' } : { kind: 'main' } };
    });
    spyOn(canonicalClient, 'goal').mockImplementation(async (_sessionId, input) => {
        events.push(`goal:${input.op}`);
        return { type: 'goal', mode: { kind: 'goal', status: 'active', objective: 'Do it', tokenBudget: null, tokensUsed: 0 } };
    });
    spyOn(canonicalClient, 'createRun').mockImplementation(async (sessionId) => {
        events.push('prompt');
        return { run: { runId: 'run-1', sessionId, status: 'running', origin: 'host', createdAt: Date.now() } };
    });
});

afterEach(() => {
    manager.disposeAll();
    mock.restore();
    useSessionUIStore.setState(originalUI);
    useConfigStore.setState(originalConfig);
    useDirectoryStore.setState(originalDirectory);
    useGlobalSessionsStore.setState(originalGlobal);
    useProjectsStore.setState(originalProjects);
    useSelectionStore.setState(originalSelection);
    switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
});

const openDraft = () => {
    useSessionUIStore.getState().openNewSessionDraft({ target: 'project', directoryOverride: '/repo', selectedProjectId: 'project-1' });
};

type SendOptions = NonNullable<Parameters<ReturnType<typeof useSessionUIStore.getState>['sendMessage']>[9]>;
const send = (options?: SendOptions) => useSessionUIStore.getState().sendMessage('Ship it', 'provider', 'model', null, undefined, undefined, undefined, undefined, 'normal', options);

describe('draft mode application', () => {
    test('Plan is applied after the session exists and before the prompt', async () => {
        openDraft();
        useSessionUIStore.getState().setDraftMode('plan');
        await send();
        expect(events).toEqual(['create', 'mode:plan', 'prompt']);
    });

    test('a failed mode transition creates the session but sends no prompt', async () => {
        openDraft();
        useSessionUIStore.getState().setDraftMode('plan');
        failMode = true;
        await expect(send()).rejects.toThrow('The plan model role is unavailable');
        expect(events).toEqual(['create', 'mode:plan']);
        expect(createdSessions).toHaveLength(1);
    });

    test('Goal creates the native goal after the session and never also sends a prompt', async () => {
        openDraft();
        useSessionUIStore.getState().setDraftMode('goal', { objective: 'Do it', tokenBudget: null });
        await send();
        expect(events).toEqual(['create', 'goal:create']);
        expect(canonicalClient.createRun).not.toHaveBeenCalled();
    });

    test('Main leaves the created session in Main and sends the prompt', async () => {
        openDraft();
        useSessionUIStore.getState().setDraftMode('main');
        await send();
        expect(events).toEqual(['create', 'prompt']);
        expect(canonicalClient.setMode).not.toHaveBeenCalled();
    });
});


test('reports the authoritative created session before prompting and never for an existing session', async () => {
    openDraft();
    const receipt = mock((target: { sessionId: string; directory: string | null }) => {
        expect(target).toEqual({ sessionId: 'ses_draft_mode', directory: '/repo' });
        events.push('receipt');
    });
    await send({ onSessionCreated: receipt });
    expect(events).toEqual(['create', 'receipt', 'prompt']);
    await send({ onSessionCreated: receipt });
    expect(receipt).toHaveBeenCalledTimes(1);
});

test('a post-creation mode failure retains the creation receipt for its captured composer', async () => {
    openDraft();
    useSessionUIStore.getState().setDraftMode('plan');
    failMode = true;
    const receipt = mock(() => { events.push('receipt'); });
    await expect(send({ onSessionCreated: receipt })).rejects.toThrow('The plan model role is unavailable');
    expect(events).toEqual(['create', 'receipt', 'mode:plan']);
    expect(receipt).toHaveBeenCalledTimes(1);
});

test('failed session admission never reports a created session', async () => {
    openDraft();
    spyOn(canonicalClient, 'createSession').mockRejectedValue(new Error('Admission failed'));
    const receipt = mock(() => undefined);
    await expect(send({ onSessionCreated: receipt })).rejects.toThrow('Failed to create session');
    expect(receipt).not.toHaveBeenCalled();
    expect(canonicalClient.createRun).not.toHaveBeenCalled();
});
