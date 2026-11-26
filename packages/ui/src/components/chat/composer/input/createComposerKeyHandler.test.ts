import { beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { createComposerKeyHandler } from './createComposerKeyHandler';
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
let handler: (e: KeyboardEvent) => void;

const composerEditor = {
    getValue: () => draftText,
    getSelection: () => ({ start: 0, end: 0 }),
    replaceRange: () => undefined,
    insertText: () => undefined,
    focus: () => undefined,
};

const buildHandler = (queuedMessages: QueuedMessage[]) => {
    // SAFETY: the ArrowUp recall path under test reads only these members; the
    // submit/command branches it does not enter never run.
    const dependencies: HandlerDependencies = {
        largePasteState: { largeTextPasteGesture: { keyDown: () => undefined, invalidate: () => undefined } } as never,
        editorState: { composerRef: { current: composerEditor } } as never,
        draftText: { setInputMode: () => undefined, composerText: { get: () => draftText } } as never,
        autocompleteState: {
            closeAutocomplete: () => undefined, openAutocomplete: null,
            commandRef: { current: null }, skillRef: { current: null }, mentionRef: { current: null }, emojiRef: { current: null },
        } as never,
        preferences: { largeTextPasteBehavior: 'never', isMobile: false, enterToSend: true, enterToSendConfigured: true, mobileReturnKeySends: false } as never,
        expansion: { isDesktopExpanded: false, setExpandedInput: () => undefined } as never,
        mobileActions: { handlePromptHistoryShortcut: () => false } as never,
        sessionScope: { isBtwActive: false, inputMode: 'normal', currentSessionId: 'session-1', attachedFiles: [] } as never,
        sessionLifecycle: { handleExitBtw: () => undefined, currentSessionPhase: 'running', autoReviewRunning: false } as never,
        queueState: { queuedMessages, followUpBehavior: 'queue' } as never,
        queueActions: { handleQueuedMessageEditById: (id: string) => { edits.push(id); }, handleQueueMessage: async () => undefined } as never,
        draftHistory: {
            messageHistory: { older: () => { historyRecalls += 1; return null; }, newer: () => null, reset: () => undefined },
            applyHistoryValue: () => undefined,
        } as never,
        sendAvailability: { pendingFirstSend: false, isAwaitingInput: false, getCurrentInputSnapshot: () => ({ message: draftText, hasContent: draftText.length > 0 }) } as never,
        submission: { handleSubmit: () => undefined } as never,
    };
    return createComposerKeyHandler(dependencies).handleKeyDown;
};

describe('createComposerKeyHandler ArrowUp queue recall', () => {
    beforeEach(() => {
        windowInstance = new Window();
        Object.assign(globalThis, {
            window: windowInstance,
            document: windowInstance.document,
            KeyboardEvent: windowInstance.KeyboardEvent,
        });
        draftText = '';
        edits = [];
        historyRecalls = 0;
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
