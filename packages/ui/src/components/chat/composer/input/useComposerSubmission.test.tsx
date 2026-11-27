import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useComposerSubmission } from './useComposerSubmission';
import { useComposerDraft, type ComposerDraftControls } from '../state/useComposerDraft';
import { createComposerText } from '../state/composerText';
import { sanitizeAttachmentsForSend } from './useComposerMentionAttachments';
import { useInputStore } from '@/sync/input-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAuthSessionStore } from '@/lib/runtime-auth-expiry';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { ChildStoreManager } from '@/sync/child-store';
import { setActionRefs } from '@/sync/session-actions';
import { setSyncRefs } from '@/sync/sync-refs';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { toast } from '@/components/ui';
import { createChatDraftIdentity, type ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import type { ProblemCode, Session, SessionSnapshot } from '@openchamber/agent-contract';

const draftIdentity = () => {
    const identity = createChatDraftIdentity('host', '/repo', 'session-1');
    if (!identity) throw new Error('chat draft identity missing');
    return identity;
};

const canonicalProblem = (code: ProblemCode, status: number): ConstructorParameters<typeof CanonicalApiError>[0] => ({
    type: 'about:blank',
    title: code,
    status,
    detail: `problem ${code}`,
    code,
    retryable: false,
});

const sourceSession: Session = {
    sessionId: 'session-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    displayPath: '/repo',
    rootSessionId: 'session-1',
    createdAt: 1,
    updatedAt: 1,
    epoch: 'epoch-1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    title: 'Source',
    metadata: {},
    metadataRevision: '1',
    archiveRevision: '0',
};

const forkedSession: Session = {
    ...sourceSession,
    sessionId: 'session-fork',
    rootSessionId: 'session-fork',
    title: 'Forked',
};

const snapshotWithTurn = (completed: boolean): SessionSnapshot => ({
    session: sourceSession,
    cursor: 'epoch-1:0',
    branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: completed ? 'msg-a' : null },
    window: {
        firstTurnId: completed ? 'turn-1' : null,
        lastTurnId: completed ? 'turn-1' : null,
        firstMessageId: completed ? 'msg-a' : null,
        lastMessageId: completed ? 'msg-a' : null,
        hasEarlier: false,
    },
    turns: completed ? [{
        turnId: 'turn-1',
        sessionId: 'session-1',
        runId: 'run-1',
        status: 'completed',
        userMessageId: 'msg-u',
        assistantMessageIds: ['msg-a'],
        startedAt: 1,
    }] : [],
    messages: completed ? [{
        messageId: 'msg-a',
        turnId: 'turn-1',
        sessionId: 'session-1',
        role: 'assistant',
        createdAt: 2,
        parts: [{ partId: 'p1', type: 'text', content: 'done' }],
    }] : [],
    activeRun: null,
    approvals: [],
    questions: [],
    requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
});

describe('useComposerSubmission control command draft retention', () => {
    let windowInstance: Window;
    let root: Root;
    let host: HTMLDivElement;
    let handleSubmit: (() => Promise<void>) | null;
    let draftText: string;
    let isMobileMode: boolean;
    let nullIdentityMode: boolean;
    const confirmedMentionsRef = { current: new Set<string>() };
    const currentChatDraftIdentityRef: React.MutableRefObject<ChatDraftIdentity | null> = { current: draftIdentity() };
    let setMessageCalls: string[];
    let persistCalls: Array<{ identity: ChatDraftIdentity | null; text: string }>;
    let historyResets: number;
    let expandedCalls: boolean[];
    let blurCalls: number;
    let infoToasts: string[];
    let errorToasts: string[];
    let manager: ChildStoreManager | null = null;
    const originalUI = useSessionUIStore.getState();
    const originalGlobal = useGlobalSessionsStore.getState();
    const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
    const spies: Array<{ mockRestore: () => void }> = [];

    const spy = <T extends object, K extends keyof T>(obj: T, key: K, impl: T[K]) => {
        // SAFETY: spyOn's implementation parameter is contravariant in the method's own type; the impl matches T[K].
        const handle = spyOn(obj, key).mockImplementation(impl as never);
        spies.push(handle);
        return handle;
    };

    const editor = {
        getValue: () => draftText,
        getSelection: () => ({ start: draftText.length, end: draftText.length }),
        replaceRange: () => undefined,
        insertText: () => undefined,
        focus: () => undefined,
        blur: () => { blurCalls += 1; },
        setSelection: () => undefined,
    };

    const Harness = () => {
        // SAFETY: the control-command path under test reads only these members;
        // the prompt-send branches it never enters do not run.
        const dependencies: Parameters<typeof useComposerSubmission>[0] = {
            i18n: { t: (key: string) => key } as never,
            attachmentWork: { waitForPendingAttachments: async () => undefined } as never,
            largePasteState: { largeTextPasteOffer: null } as never,
            sendHandlers: { handleSubmitRef: { current: async () => undefined } } as never,
            draftText: {
                setMessage: (text: string) => {
                    setMessageCalls.push(text);
                    draftText = text;
                },
                confirmedMentionsRef,
                composerText: { get: () => draftText },
                currentChatDraftIdentityRef,
            } as never,
            historySearchState: { setPromptHistorySearch: () => undefined } as never,
            editorState: { composerRef: { current: editor } } as never,
            column: { openTimelineDialog: () => undefined } as never,
            sending: { sendMessage: async () => undefined } as never,
            inlineContext: {
                isMobileCommentOpen: () => false, hasDrafts: false,
                attachmentsToSend: () => [],
                inlineDraftTarget: null, consumeDrafts: () => [],
            } as never,
            sendAvailability: {
                pendingFirstSend: null,
                getCurrentInputSnapshot: () => ({ message: draftText, hasContent: draftText.trim().length > 0 }),
            } as never,
            sessionScope: {
                isBtwActive: false, currentSessionId: 'session-1',
                btwPanel: { pending: false },
                newSessionDraftOpen: false, newSessionDraft: null,
                btwDirectory: null,
                currentSessionDirectoryForSync: '/repo', currentDirectory: '/repo',
                attachedFiles: [], inputMode: 'normal', btwSessionId: null,
                activeRuntimeKey: 'host', chatDraftIdentity: nullIdentityMode ? null : draftIdentity(),
                immediateBtwSubmitRef: { current: null },
                sendHeldByMissingFolder: () => false,
                setReviewDialogOpen: () => undefined,
                consumePendingSyntheticParts: () => [],
                projectActionsRef: { current: null },
                clearAttachedFiles: () => undefined,
                btwComposerSessionId: null,
                sessionFolder: null,
            } as never,
            parallelRun: { parallel: { isActive: false, runCount: 0, launch: async () => undefined } } as never,
            sessionLifecycle: { sessionPhase: 'idle', autoReviewRunning: false } as never,
            queueState: { messageQueueTarget: null } as never,
            selection: {
                currentProviderId: 'p', currentModelId: 'm', currentAgentName: null, currentVariant: null,
                mailboxTarget: null, configuredReasoningEffort: null, persistedThinkingLevel: null,
                reasoningEffortForModel: () => null,
            } as never,
            language: {
                readSessionMentionsBeforeSend: async () => true,
                guestCommands: [], availableSkills: [], linkedReferences: [],
                referenceLinksIn: () => [], sessionMentionsIn: () => [],
                loadCommands: async () => true,
            } as never,
            preferences: { isMobile: isMobileMode } as never,
            expansion: { setExpandedInput: (expanded: boolean) => { expandedCalls.push(expanded); } } as never,
            runtime: { runtimeTrackers: [], runtimeFiles: null } as never,
            draftHistory: {
                handoffDraft: () => undefined,
                restoreDraft: (_target: ReturnType<typeof draftIdentity> | null, draft: string, mentions: Set<string>) => {
                    const merged = draftText && draftText !== draft ? `${draftText}\n\n${draft}` : draft;
                    confirmedMentionsRef.current = new Set([...confirmedMentionsRef.current, ...mentions]);
                    setMessageCalls.push(merged);
                    draftText = merged;
                },
                persistDraftImmediately: (identity: ChatDraftIdentity | null, text: string) => {
                    persistCalls.push({ identity, text });
                },
                messageHistory: { older: () => null, newer: () => null, reset: () => { historyResets += 1; } },
                migrateDraft: () => undefined,
            } as never,
            queueActions: { handleQueueMessage: async () => undefined } as never,
            props: { scrollToBottom: () => undefined } as never,
            mentionAttachments: {
                sanitizeAttachmentsForSend,
                prepareReadOnSendMentions: async () => [], mentionableAgents: [],
                extractInlineFileMentions: (text: string) => ({ sanitizedText: text, attachments: [] }),
                prepareDocumentMentions: async () => ({ status: 'ready', prepared: new Map() }),
            } as never,
            referenceDrafts: { updateLinkedReferencesFor: () => undefined } as never,
        };
        handleSubmit = useComposerSubmission(dependencies).handleSubmit;
        return null;
    };

    const unavailable = (): never => { throw new Error('control command tests must not call runtime APIs'); };
    const runtime: RuntimeAPIs = {
        runtime: { platform: 'web', isDesktop: false, isVSCode: false },
        get terminal() { return unavailable(); }, get git() { return unavailable(); },
        get files() {
            // SAFETY: the hook never touches file APIs on the control path; any
            // accidental call throws through `unavailable`.
            return { listDirectory: unavailable, search: unavailable, createDirectory: unavailable } as RuntimeAPIs['files'];
        },
        get settings() { return unavailable(); },
        get permissions() { return unavailable(); }, get notifications() { return unavailable(); },
        get sourceControl() { return unavailable(); },
    };

    const mount = async () => {
        await act(async () => {
            root.render(
                <RuntimeAPIContext.Provider value={runtime}>
                    <Harness />
                </RuntimeAPIContext.Provider>,
            );
        });
    };

    beforeEach(async () => {
        windowInstance = new Window();
        const globalOverrides = {
            window: windowInstance,
            document: windowInstance.document,
            localStorage: windowInstance.localStorage,
            IS_REACT_ACT_ENVIRONMENT: true,
        };
        for (const [key, value] of Object.entries(globalOverrides)) {
            previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        }
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        handleSubmit = null;
        draftText = '/compact';
        isMobileMode = false;
        nullIdentityMode = false;
        confirmedMentionsRef.current = new Set(['src/app.ts']);
        currentChatDraftIdentityRef.current = draftIdentity();
        setMessageCalls = [];
        persistCalls = [];
        historyResets = 0;
        expandedCalls = [];
        blurCalls = 0;
        infoToasts = [];
        errorToasts = [];
        useInputStore.setState({ attachedFiles: [], attachmentDraftKey: null, attachmentDrafts: new Map(), pendingComposerRestore: null });
        useConfigStore.setState({ isConnected: true });
        useAuthSessionStore.setState({ state: 'ok' });
        useCommandsStore.setState({
            catalogsByDirectory: {
                '/repo': {
                    workspaceId: 'ws-1',
                    revision: '1',
                    commands: [],
                    builtinCommands: ['context', 'compact'],
                },
            },
        });
        getDeferredSafeStorage().removeItem('openchamber.chatDrafts.v2');
        useInputStore.getState().selectAttachmentDraft(draftIdentity());
        spy(toast, 'info', (message: string | React.ReactNode) => { infoToasts.push(String(message)); return 0; });
        spy(toast, 'error', (message: string | React.ReactNode) => { errorToasts.push(String(message)); return 0; });
        await mount();
    });

    afterEach(async () => {
        await act(async () => { root.unmount(); });
        host.remove();
        manager?.disposeAll();
        manager = null;
        resetWorkspaceDirectories();
        useSessionUIStore.setState(originalUI);
        useGlobalSessionsStore.setState(originalGlobal);
        while (spies.length > 0) spies.pop()?.mockRestore();
        for (const [key, descriptor] of previousGlobals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
        previousGlobals.clear();
    });

    const submit = async () => {
        if (!handleSubmit) throw new Error('submission harness not mounted');
        const submitFn = handleSubmit;
        await act(async () => {
            await submitFn();
        });
    };

    test('a rejected /compact keeps its text, mentions, and persisted draft while showing the error', async () => {
        spy(canonicalClient, 'compactSession', async () => {
            throw new CanonicalApiError(canonicalProblem('INVALID_REQUEST', 422));
        });
        await submit();
        expect(draftText).toBe('/compact');
        expect([...confirmedMentionsRef.current]).toEqual(['src/app.ts']);
        expect(setMessageCalls).toEqual([]);
        expect(persistCalls).toEqual([]);
        expect(historyResets).toBe(0);
        expect(expandedCalls).toEqual([]);
        expect(errorToasts).toEqual(['problem INVALID_REQUEST']);
        expect(infoToasts).toEqual([]);
    });

    test('SESSION_TOO_SMALL refusal keeps /compact in the composer and shows the info notice', async () => {
        spy(canonicalClient, 'compactSession', async () => {
            throw new CanonicalApiError(canonicalProblem('SESSION_TOO_SMALL', 422));
        });
        await submit();
        expect(draftText).toBe('/compact');
        expect([...confirmedMentionsRef.current]).toEqual(['src/app.ts']);
        expect(setMessageCalls).toEqual([]);
        expect(persistCalls).toEqual([]);
        expect(expandedCalls).toEqual([]);
        expect(infoToasts).toEqual(['chat.chatInput.toast.compactNotNeeded']);
        expect(errorToasts).toEqual([]);
    });

    test('text typed while /compact is in flight survives its rejection without merge corruption', async () => {
        spy(canonicalClient, 'compactSession', async () => {
            draftText = '/compact\nadditional typing';
            throw new CanonicalApiError(canonicalProblem('INVALID_REQUEST', 422));
        });
        await submit();
        expect(draftText).toBe('/compact\nadditional typing');
        expect(setMessageCalls).toEqual([]);
        expect(errorToasts).toEqual(['problem INVALID_REQUEST']);
    });

    test('an accepted /compact clears composer text, mentions, persisted draft, and collapses mobile input', async () => {
        isMobileMode = true;
        await mount();
        spy(canonicalClient, 'compactSession', async () => ({
            type: 'compact',
            compactionId: 'compact-1',
            tokensBefore: 100,
            completedAt: 2,
        }));
        await submit();
        expect(draftText).toBe('');
        expect([...confirmedMentionsRef.current]).toEqual([]);
        expect(setMessageCalls).toEqual(['']);
        expect(persistCalls).toEqual([{ identity: draftIdentity(), text: '' }]);
        expect(historyResets).toBe(1);
        expect(expandedCalls).toEqual([false]);
        expect(blurCalls).toBe(1);
        expect(errorToasts).toEqual([]);
    });

    test('an accepted /compact with an unresolvable draft identity still clears the composer text', async () => {
        nullIdentityMode = true;
        await mount();
        currentChatDraftIdentityRef.current = null;
        useInputStore.getState().selectAttachmentDraft(null);
        spy(canonicalClient, 'compactSession', async () => ({
            type: 'compact',
            compactionId: 'compact-null',
            tokensBefore: 100,
            completedAt: 5,
        }));
        await submit();
        expect(draftText).toBe('');
        expect([...confirmedMentionsRef.current]).toEqual([]);
        expect(setMessageCalls).toEqual(['']);
        expect(historyResets).toBe(1);
        expect(errorToasts).toEqual([]);
    });

    test('a rejected builtin command keeps its text in the composer and shows the error', async () => {
        draftText = '/context';
        spy(canonicalClient, 'runBuiltinCommand', async () => {
            throw new CanonicalApiError(canonicalProblem('RUN_ACTIVE', 409));
        });
        await submit();
        expect(draftText).toBe('/context');
        expect(setMessageCalls).toEqual([]);
        expect(persistCalls).toEqual([]);
        expect(errorToasts).toEqual(['problem RUN_ACTIVE']);
        expect(infoToasts).toEqual([]);
    });

    test('an accepted builtin command shows its output notice and clears the composer', async () => {
        draftText = '/context';
        spy(canonicalClient, 'runBuiltinCommand', async () => ({
            type: 'command',
            output: 'Context window: 65536 tokens',
        }));
        await submit();
        expect(draftText).toBe('');
        expect(setMessageCalls).toEqual(['']);
        expect(persistCalls).toEqual([{ identity: draftIdentity(), text: '' }]);
        expect(infoToasts).toEqual(['Context window: 65536 tokens']);
        expect(errorToasts).toEqual([]);
    });

    const prepareForkStores = () => {
        resetWorkspaceDirectories();
        registerWorkspaceDirectory('ws-1', '/repo');
        manager = new ChildStoreManager();
        const store = manager.ensureChild('/repo', { bootstrap: false });
        store.setState({ session: [sourceSession] });
        useGlobalSessionsStore.getState().upsertSessions([sourceSession]);
        setActionRefs(manager, () => '/repo');
        setSyncRefs(manager, '/repo');
        spy(useSessionUIStore.getState(), 'setCurrentSession', (sessionId, hint) => {
            useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: hint ?? null });
        });
        spy(canonicalClient, 'getSessionMetadata', async (sessionId) => ({ sessionId, revision: '0', metadata: null }));
        spy(canonicalClient, 'patchSessionMetadata', async (sessionId) => ({ sessionId, revision: '1', metadata: {} }));
    };

    test('a /fork rejected with NothingToForkError keeps its text and shows the notice', async () => {
        draftText = '/fork';
        prepareForkStores();
        spy(canonicalClient, 'getSnapshot', async () => snapshotWithTurn(false));
        await submit();
        expect(draftText).toBe('/fork');
        expect(setMessageCalls).toEqual([]);
        expect(persistCalls).toEqual([]);
        expect(errorToasts).toEqual(['chat.chatInput.toast.forkNothingToFork']);
    });

    test('a /fork whose prompt send fails keeps its text in the composer and shows the error', async () => {
        draftText = '/fork try another approach';
        prepareForkStores();
        spy(canonicalClient, 'getSnapshot', async () => snapshotWithTurn(true));
        spy(canonicalClient, 'forkSession', async () => ({ session: forkedSession }));
        spy(useSessionUIStore.getState(), 'sendMessage', async () => {
            throw new Error('send failed');
        });
        await submit();
        expect(draftText).toBe('/fork try another approach');
        expect(setMessageCalls).toEqual([]);
        expect(persistCalls).toEqual([]);
        expect(errorToasts).toEqual(['chat.chatInput.toast.forkSendFailed']);
    });

    test('an accepted /fork clears the composer', async () => {
        draftText = '/fork';
        prepareForkStores();
        spy(canonicalClient, 'getSnapshot', async () => snapshotWithTurn(true));
        spy(canonicalClient, 'forkSession', async () => ({ session: forkedSession }));
        await submit();
        expect(draftText).toBe('');
        expect(setMessageCalls).toEqual(['']);
        expect(persistCalls).toEqual([{ identity: draftIdentity(), text: '' }]);
        expect(errorToasts).toEqual([]);
    });

    test('an accepted control after switching sessions clears the submitted draft without wiping the new session', async () => {
        isMobileMode = true;
        await mount();
        const switchedIdentity = createChatDraftIdentity('host', '/repo', 'session-2');
        if (!switchedIdentity) throw new Error('switched draft identity missing');
        spy(canonicalClient, 'compactSession', async () => {
            currentChatDraftIdentityRef.current = switchedIdentity;
            draftText = 'new session draft';
            confirmedMentionsRef.current = new Set(['src/other.ts']);
            return { type: 'compact', compactionId: 'compact-2', tokensBefore: 50, completedAt: 3 };
        });
        await submit();
        expect(persistCalls).toEqual([{ identity: draftIdentity(), text: '' }]);
        expect(draftText).toBe('new session draft');
        expect([...confirmedMentionsRef.current]).toEqual(['src/other.ts']);
        expect(setMessageCalls).toEqual([]);
        expect(historyResets).toBe(0);
        expect(expandedCalls).toEqual([]);
        expect(blurCalls).toBe(0);
    });

    test('an accepted /compact preserves text typed in the same session while the control was in flight', async () => {
        isMobileMode = true;
        await mount();
        spy(canonicalClient, 'compactSession', async () => {
            draftText = 'follow up while compacting';
            return { type: 'compact', compactionId: 'compact-3', tokensBefore: 50, completedAt: 4 };
        });
        await submit();
        expect(draftText).toBe('follow up while compacting');
        expect([...confirmedMentionsRef.current]).toEqual(['src/app.ts']);
        expect(setMessageCalls).toEqual([]);
        expect(persistCalls).toEqual([]);
        expect(historyResets).toBe(0);
        expect(expandedCalls).toEqual([]);
        expect(blurCalls).toBe(0);
    });
});

describe('useComposerDraft persistNow non-current clear', () => {
    test('clearing a previously viewed session draft clears its memory entry without clobbering the active session mentions', async () => {
        const win = new Window({ url: 'http://localhost/' });
        const overrides = {
            window: win,
            document: win.document,
            localStorage: win.localStorage,
            requestAnimationFrame: win.requestAnimationFrame.bind(win),
            cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
            IS_REACT_ACT_ENVIRONMENT: true,
        };
        const previous = new Map(Object.keys(overrides).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        for (const [key, value] of Object.entries(overrides)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

        const session1 = createChatDraftIdentity('host', '/repo', 'session-1');
        const session2 = createChatDraftIdentity('host', '/repo', 'session-2');
        if (!session1 || !session2) throw new Error('draft identities missing');
        getDeferredSafeStorage().removeItem('openchamber.chatDrafts.v2');

        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const textStore = createComposerText('/compact');
        const mentionsRef = { current: new Set<string>() };
        let controls: ComposerDraftControls | null = null;

        const DraftHarness = ({ identity }: { identity: NonNullable<typeof session1> }) => {
            const setMessage = React.useCallback((next: string) => { textStore.set(next); }, []);
            controls = useComposerDraft({
                text: textStore,
                setMessage,
                confirmedMentionsRef: mentionsRef,
                identity,
                persistEnabled: true,
                initialDraft: { text: '/compact', identity: session1 },
            });
            return null;
        };

        try {
            await act(async () => { root.render(<DraftHarness identity={session1} />); });
            await act(async () => { root.render(<DraftHarness identity={session2} />); });
            expect(textStore.get()).toBe('');
            mentionsRef.current = new Set(['src/session2.ts']);
            act(() => { controls?.persistNow(session1, ''); });
            expect([...mentionsRef.current]).toEqual(['src/session2.ts']);
            await act(async () => { root.render(<DraftHarness identity={session1} />); });
            expect(textStore.get()).toBe('');
        } finally {
            await act(async () => { root.unmount(); });
            host.remove();
            for (const [key, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else Reflect.deleteProperty(globalThis, key);
            }
        }
    });
});
