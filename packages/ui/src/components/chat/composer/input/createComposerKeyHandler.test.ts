import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { createComposerKeyHandler } from './createComposerKeyHandler';
import { CommandAutocomplete, type CommandAutocompleteHandle } from '../../CommandAutocomplete';
import { ChatColumnSessionContext } from '../../chatColumnSession';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { QueuedMessage } from '@/stores/messageQueueStore';

type HandlerDependencies = Parameters<typeof createComposerKeyHandler>[0];

const queuedMessage = (id: string, scheduledTask?: { projectId: string; taskId: string }): QueuedMessage => {
    const message: QueuedMessage = {
        id,
        content: `content of ${id}`,
        text: `content of ${id}`,
        createdAt: 1,
        originalAvailable: true,
    };
    if (scheduledTask) message.scheduledTask = scheduledTask;
    return message;
};

const arrowUp = (): KeyboardEvent => new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });

let windowInstance: Window;
let draftText: string;
let edits: string[];
let historyRecalls: number;
let historyResets: number;
let handler: (e: KeyboardEvent) => void;
const previousGlobals = new Map<string, PropertyDescriptor | undefined>();

const installDomGlobals = (win: Window) => {
    const overrides = {
        window: win,
        document: win.document,
        navigator: win.navigator,
        HTMLElement: win.HTMLElement,
        Node: win.Node,
        Event: win.Event,
        KeyboardEvent: win.KeyboardEvent,
        MouseEvent: win.MouseEvent,
        MutationObserver: win.MutationObserver,
        ResizeObserver: win.ResizeObserver,
        requestAnimationFrame: win.requestAnimationFrame.bind(win),
        cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
        getComputedStyle: win.getComputedStyle.bind(win),
        localStorage: win.localStorage,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(overrides)) {
        if (!previousGlobals.has(key)) previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
};

const restoreDomGlobals = () => {
    for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
    previousGlobals.clear();
};
const composerEditor = {
    getValue: () => draftText,
    getSelection: () => ({ start: 0, end: 0 }),
    replaceRange: () => undefined,
    insertText: () => undefined,
    focus: () => undefined,
};

type CommandHandle = {
    handleKeyDown: (key: string) => void;
    isExactMatchHighlighted: () => boolean;
};

type BuildOverrides = {
    openAutocomplete?: 'command' | null;
    commandRef?: { current: CommandHandle | null };
    onSubmit?: () => void;
    sessionPhase?: string;
    isMobile?: boolean;
    mobileReturnKeySends?: boolean;
    enterToSend?: boolean;
    isDesktopExpanded?: boolean;
};

const buildHandler = (queuedMessages: QueuedMessage[], overrides: BuildOverrides = {}) => {
    // SAFETY: the paths under test read only these members; the branches they
    // do not enter never run.
    const dependencies: HandlerDependencies = {
        largePasteState: { largeTextPasteGesture: { keyDown: () => undefined, invalidate: () => undefined } } as never,
        editorState: { composerRef: { current: composerEditor } } as never,
        draftText: { setInputMode: () => undefined, composerText: { get: () => draftText } } as never,
        autocompleteState: {
            closeAutocomplete: () => undefined, openAutocomplete: overrides.openAutocomplete ?? null,
            commandRef: overrides.commandRef ?? { current: null }, skillRef: { current: null }, mentionRef: { current: null }, emojiRef: { current: null },
        } as never,
        preferences: { largeTextPasteBehavior: 'never', isMobile: overrides.isMobile ?? false, enterToSend: overrides.enterToSend ?? true, enterToSendConfigured: true, mobileReturnKeySends: overrides.mobileReturnKeySends ?? false } as never,
        expansion: { isDesktopExpanded: overrides.isDesktopExpanded ?? false, setExpandedInput: () => undefined } as never,
        mobileActions: { handlePromptHistoryShortcut: () => false } as never,
        sessionScope: { isBtwActive: false, inputMode: 'normal', currentSessionId: 'session-1', attachedFiles: [] } as never,
        sessionLifecycle: { handleExitBtw: () => undefined, currentSessionPhase: overrides.sessionPhase ?? 'running', autoReviewRunning: false } as never,
        queueState: { queuedMessages, followUpBehavior: 'queue' } as never,
        queueActions: { handleQueuedMessageEditById: (id: string) => { edits.push(id); }, handleQueueMessage: async () => undefined } as never,
        draftHistory: {
            messageHistory: { older: () => { historyRecalls += 1; return null; }, newer: () => null, reset: () => { historyResets += 1; } },
            applyHistoryValue: () => undefined,
        } as never,
        sendAvailability: { pendingFirstSend: false, isAwaitingInput: false, getCurrentInputSnapshot: () => ({ message: draftText, hasContent: draftText.length > 0 }) } as never,
        submission: { handleSubmit: () => { overrides.onSubmit?.(); } } as never,
    };
    return createComposerKeyHandler(dependencies).handleKeyDown;
};

describe('createComposerKeyHandler ArrowUp queue recall', () => {
    beforeEach(() => {
        windowInstance = new Window();
        installDomGlobals(windowInstance);
        draftText = '';
        edits = [];
        historyRecalls = 0;
        historyResets = 0;
    });

    afterEach(() => {
        restoreDomGlobals();
    });

    test('an empty composer recalls the last queued message for editing', () => {
        handler = buildHandler([queuedMessage('q1'), queuedMessage('q2')]);
        handler(arrowUp());
        expect(edits).toEqual(['q2']);
        expect(historyRecalls).toBe(0);
    });

    test('scheduled rows are skipped: recall takes the last editable row', () => {
        handler = buildHandler([
            queuedMessage('q1'),
            queuedMessage('q2'),
            queuedMessage('q3', { projectId: 'project-1', taskId: 'task-1' }),
        ]);
        handler(arrowUp());
        expect(edits).toEqual(['q2']);
        expect(historyRecalls).toBe(0);
    });

    test('a queue of only scheduled rows falls through to draft history', () => {
        handler = buildHandler([
            queuedMessage('q1', { projectId: 'project-1', taskId: 'task-1' }),
            queuedMessage('q2', { projectId: 'project-1', taskId: 'task-2' }),
        ]);
        handler(arrowUp());
        expect(edits).toEqual([]);
        expect(historyRecalls).toBe(1);
    });
});
describe('createComposerKeyHandler exact command completion', () => {
    const enterKey = (): KeyboardEvent => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const tabKey = (): KeyboardEvent => new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    const commandHandle = (exact: boolean, keys: string[]): CommandHandle => ({
        handleKeyDown: (key) => { keys.push(key); },
        isExactMatchHighlighted: () => exact,
    });

    beforeEach(() => {
        windowInstance = new Window();
        installDomGlobals(windowInstance);
        draftText = '/compact';
        edits = [];
        historyRecalls = 0;
        historyResets = 0;
    });

    afterEach(() => {
        restoreDomGlobals();
    });

    test('Enter on an exact highlighted command submits instead of completing', () => {
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(true, forwarded) },
            onSubmit: () => { submits += 1; },
            sessionPhase: 'idle',
        });
        handler(enterKey());
        expect(submits).toBe(1);
        expect(forwarded).toEqual([]);
    });

    test('Enter on a partial match still completes through the autocomplete', () => {
        draftText = '/comp';
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(false, forwarded) },
            onSubmit: () => { submits += 1; },
        });
        handler(enterKey());
        expect(submits).toBe(0);
        expect(forwarded).toEqual(['Enter']);
    });

    test('Tab completes even when the highlighted command is an exact match', () => {
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(true, forwarded) },
            onSubmit: () => { submits += 1; },
        });
        handler(tabKey());
        expect(submits).toBe(0);
        expect(forwarded).toEqual(['Tab']);
    });

    test('mobile returnKeySends submits an exact highlighted command on one Return', () => {
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(true, forwarded) },
            onSubmit: () => { submits += 1; },
            sessionPhase: 'idle',
            isMobile: true,
            mobileReturnKeySends: true,
        });
        handler(enterKey());
        expect(submits).toBe(1);
        expect(forwarded).toEqual([]);
    });

    test('Enter when enterToSend is false still completes an exact command instead of inserting a newline', () => {
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(true, forwarded) },
            onSubmit: () => { submits += 1; },
            sessionPhase: 'idle',
            enterToSend: false,
        });
        handler(enterKey());
        expect(submits).toBe(0);
        expect(forwarded).toEqual(['Enter']);
    });

    test('Ctrl+Enter when enterToSend is false submits an exact command directly', () => {
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(true, forwarded) },
            onSubmit: () => { submits += 1; },
            sessionPhase: 'idle',
            enterToSend: false,
        });
        handler(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
        expect(submits).toBe(1);
        expect(forwarded).toEqual([]);
    });

    test('Enter when desktop editor is expanded still completes an exact command', () => {
        const forwarded: string[] = [];
        let submits = 0;
        handler = buildHandler([], {
            openAutocomplete: 'command',
            commandRef: { current: commandHandle(true, forwarded) },
            onSubmit: () => { submits += 1; },
            sessionPhase: 'idle',
            isDesktopExpanded: true,
        });
        handler(enterKey());
        expect(submits).toBe(0);
        expect(forwarded).toEqual(['Enter']);
    });
});

describe('CommandAutocomplete exact match detection', () => {
    let host: HTMLDivElement;
    let root: Root;
    let loadSpy: { mockRestore: () => void } | null = null;
    let fetchSpy: { mockRestore: () => void } | null = null;
    const previousCommands = useCommandsStore.getState();
    const previousDirectory = useDirectoryStore.getState();
    const previousSessionUI = useSessionUIStore.getState();

    beforeEach(() => {
        windowInstance = new Window({ url: 'http://localhost/' });
        installDomGlobals(windowInstance);
        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
        useDirectoryStore.setState({ currentDirectory: '/repo' });
        useSessionUIStore.setState({ currentSessionId: 'session-1', currentSessionDirectory: '/repo' });
        const customCommand = { commandId: 'cmd-compact-notes', name: 'compact-notes', description: 'Compact notes', content: '', scope: 'workspace' as const, source: '(project)', editable: false };
        useCommandsStore.setState({
            commandsByDirectory: { '/repo': [customCommand] },
            catalogsByDirectory: {
                '/repo': {
                    workspaceId: 'ws-1',
                    revision: '1',
                    commands: [customCommand],
                    builtinCommands: ['compact'],
                },
            },
        });
        loadSpy = spyOn(useCommandsStore.getState(), 'loadCommands').mockResolvedValue(true);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(async () => {
        await act(async () => { root.unmount(); });
        loadSpy?.mockRestore();
        fetchSpy?.mockRestore();
        useCommandsStore.setState(previousCommands);
        useDirectoryStore.setState(previousDirectory);
        useSessionUIStore.setState(previousSessionUI);
        host.remove();
        restoreDomGlobals();
    });

    test('reports exact match only when the highlighted row name equals the typed query', async () => {
        const handle = React.createRef<CommandAutocompleteHandle>();
        const renderQuery = async (query: string) => {
            await act(async () => {
                root.render(
                    React.createElement(
                        SyncProvider,
                        {
                            directory: '',
                            children: React.createElement(
                                I18nProvider,
                                null,
                                React.createElement(
                                    ChatColumnSessionContext.Provider,
                                    { value: { sessionId: 'session-1', directory: '/repo' } },
                                    React.createElement(CommandAutocomplete, {
                                        ref: handle,
                                        searchQuery: query,
                                        onCommandSelect: () => undefined,
                                        onClose: () => undefined,
                                    }),
                                ),
                            ),
                        },
                    ),
                );
            });
        };

        await renderQuery('comp');
        expect(handle.current?.isExactMatchHighlighted()).toBe(false);

        await renderQuery('compact');
        expect(handle.current?.isExactMatchHighlighted()).toBe(true);

        await renderQuery('COMPACT');
        expect(handle.current?.isExactMatchHighlighted()).toBe(true);

        await act(async () => { handle.current?.handleKeyDown('ArrowDown'); });
        expect(handle.current?.isExactMatchHighlighted()).toBe(false);

        await renderQuery('comp');
        await act(async () => { handle.current?.handleKeyDown('ArrowDown'); });
        expect(handle.current?.isExactMatchHighlighted()).toBe(false);
        await renderQuery('compact');
        expect(handle.current?.isExactMatchHighlighted()).toBe(true);
    });

    test('resets highlighted index synchronously on commands change under React.StrictMode', async () => {
        const handle = React.createRef<CommandAutocompleteHandle>();
        const renderStrictQuery = async (query: string) => {
            await act(async () => {
                root.render(
                    React.createElement(
                        React.StrictMode,
                        null,
                        React.createElement(
                            SyncProvider,
                            {
                                directory: '',
                                children: React.createElement(
                                    I18nProvider,
                                    null,
                                    React.createElement(
                                        ChatColumnSessionContext.Provider,
                                        { value: { sessionId: 'session-1', directory: '/repo' } },
                                        React.createElement(CommandAutocomplete, {
                                            ref: handle,
                                            searchQuery: query,
                                            onCommandSelect: () => undefined,
                                            onClose: () => undefined,
                                        }),
                                    ),
                                ),
                            },
                        ),
                    ),
                );
            });
        };

        await renderStrictQuery('comp');
        await act(async () => { handle.current?.handleKeyDown('ArrowDown'); });
        expect(handle.current?.isExactMatchHighlighted()).toBe(false);

        await renderStrictQuery('compact');
        expect(handle.current?.isExactMatchHighlighted()).toBe(true);
    });
});
