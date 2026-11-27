import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useComposerQueueActions } from './useComposerQueueActions';
import { sanitizeAttachmentsForSend } from './useComposerMentionAttachments';
import { useDraftAttachedFiles, useInputStore } from '@/sync/input-store';
import * as workspaceAttachments from '@/lib/workspace-attachments';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionGoalArmStore } from '@/stores/useSessionGoalArmStore';
import type { SessionUIState } from '@/sync/session-ui-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { canonicalClient } from '@/api/canonicalClient';
import { toast } from '@/components/ui';
import { createChatDraftIdentity, readChatDraft } from '@/lib/chatDraftPersistence';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import type { QueuedMessage, TakeQueuedItemResult } from '@/stores/messageQueueStore';
import type { MessageQueueTarget } from '@/stores/messageQueueStore';
import type { AttachedFile } from '@/stores/types/sessionTypes';

type Actions = ReturnType<typeof useComposerQueueActions>;

const target: MessageQueueTarget = { runtimeKey: 'host', directory: '/repo', sessionId: 'session-1' };

const takenDraft = (message: QueuedMessage) => ({
    content: message.content,
    text: message.text,
    attachments: [],
    context: [],
    options: { providerId: 'p', modelId: 'm', agentId: 'build', variant: 'high', reasoningEffort: 'medium' },
});


const queuedMessage = (overrides: Partial<QueuedMessage> = {}): QueuedMessage => ({
    id: 'q1',
    content: 'fix [note.txt] now',
    text: 'fix  now',
    createdAt: 1,
    originalAvailable: true,
    sendConfig: { providerID: 'p', modelID: 'm', agent: 'build', variant: 'high', reasoningEffort: 'medium' },
    ...overrides,
});

describe('useComposerQueueActions queued edit and send-now', () => {
    let windowInstance: Window;
    let root: Root;
    let host: HTMLDivElement;
    let actions: Actions | null;
    let draftText: string;
    let infoToasts: string[];
    let errorToasts: string[];
    let takeResult: TakeQueuedItemResult;
    let takeCalls: Array<{ messageId: string }>;
    let lastTake: Promise<TakeQueuedItemResult> | null;
    type SendMessageParams = Parameters<SessionUIState['sendMessage']>;
    let sentMessages: SendMessageParams[];
    const optionsOf = (args: SendMessageParams) => {
        const options = args[9];
        if (!options) throw new Error('send-now options missing');
        return options;
    };
    let attachmentBytes: Map<string, Uint8Array>;
    let queuedAppends: Array<{ content: string; attachments?: AttachedFile[] }>;
    let expandCalls: number;
    const spies: Array<{ mockRestore: () => void }> = [];
    const spy = <T extends object, K extends keyof T>(obj: T, key: K, impl: T[K]) => {
        // SAFETY: spyOn's implementation parameter is contravariant in the method's own type; the impl is already typed as T[K].
        const handle = spyOn(obj, key).mockImplementation(impl as never);
        spies.push(handle);
        return handle;
    };

    // The handlers fire their take chain without returning it; awaiting the captured
    // take promise plus the continuation microtasks is the event the code produces.
    const flushAsync = async () => {
        await lastTake;
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
    };
    // The shell mirror reads its expanded flag live, exactly like the real
    // shell object the composer wires in; expand() flips it, matching the
    // shell's flushSync commit.
    const expandedRef = { current: false };
    const shell = {
        get expanded() { return expandedRef.current; },
        expand: () => { expandCalls += 1; expandedRef.current = true; },
    };

    const editor = {
        getValue: () => draftText,
        getSelection: () => ({ start: draftText.length, end: draftText.length }),
        replaceRange: (from: number, to: number, insert: string) => { draftText = draftText.slice(0, from) + insert + draftText.slice(to); },
        focus: () => undefined,
    };

    const Harness = ({ sessionPhase, mobile = false }: { sessionPhase: string; mobile?: boolean }) => {
        // SAFETY: the edit/send-now paths under test read only these members; the queue-submit paths they do not touch never run.
        const dependencies: Parameters<typeof useComposerQueueActions>[0] = {
            inlineContext: {
                isMobileCommentOpen: () => false, hasDrafts: () => false,
                attachmentsToSend: () => useInputStore.getState().getAttachedFiles(draftIdentity()),
                inlineDraftTarget: null, consumeDrafts: () => [],
            } as never,
            attachmentWork: { waitForPendingAttachments: async () => undefined } as never,
            largePasteState: { largeTextPasteOffer: null } as never,
            i18n: { t: (key: string, params?: { files?: string }) => (params?.files ? `${key}:${params.files}` : key) } as never,
            draftText: {
                setMessage: (text: string) => { draftText = text; },
                confirmedMentionsRef: { current: new Set() },
                composerText: { get: () => draftText },
            } as never,
            editorState: { composerRef: { current: editor } } as never,
            sendHandlers: { handleQueueMessageRef: { current: () => undefined }, handleSubmitRef: { current: () => undefined } } as never,
            sendAvailability: { getCurrentInputSnapshot: () => ({ message: draftText, hasContent: draftText.trim().length > 0 }) } as never,
            sessionScope: {
                currentSessionId: 'session-1', inputMode: 'normal', sendHeldByMissingFolderRef: { current: false },
                consumePendingSyntheticParts: () => [], projectActionsRef: { current: null }, clearAttachedFiles: () => undefined,
                chatDraftIdentity: draftIdentity(), currentDirectory: '/repo',
                attachedFiles: useDraftAttachedFiles(draftIdentity()),
            } as never,
            queueState: {
                messageQueueTarget: target,
                addToQueue: async (_t: MessageQueueTarget, message: { content: string; attachments?: AttachedFile[] }) => { queuedAppends.push(message); },
                popQueuedToInput: (_t: MessageQueueTarget, messageId: string) => { takeCalls.push({ messageId }); lastTake = Promise.resolve(takeResult); return lastTake; },
                takeQueuedItem: (_t: MessageQueueTarget, messageId: string) => { takeCalls.push({ messageId }); lastTake = Promise.resolve(takeResult); return lastTake; },
            } as never,
            language: {
                guestCommands: [], readSessionMentionsBeforeSend: async () => true, linkedReferences: [], availableSkills: [],
                referenceLinksIn: () => [], sessionMentionsIn: () => [], rememberSessionMentions: () => undefined, loadCommands: async () => undefined,
            } as never,
            selection: {
                currentProviderId: 'p', currentModelId: 'm', mailboxTarget: null, currentAgentName: null, currentVariant: null,
                configuredReasoningEffort: null, persistedThinkingLevel: null, reasoningEffortForModel: () => null,
            } as never,
            mentionAttachments: {
                sanitizeAttachmentsForSend,
                prepareReadOnSendMentions: async () => [], mentionableAgents: [],
                extractInlineFileMentions: (text: string) => ({ sanitizedText: text, attachments: [] }),
                prepareDocumentMentions: async () => ({ status: 'ready', prepared: new Map() }),
            } as never,
            props: { scrollToLatest: () => undefined } as never,
            referenceDrafts: { setLinkedReferencesFor: () => undefined, updateLinkedReferencesFor: () => undefined, updateLinkedReferences: () => undefined } as never,
            preferences: { isMobile: mobile } as never,
            mobileShell: { mobileShell: shell } as never,
            sessionLifecycle: { sessionPhase } as never,
        };
        actions = useComposerQueueActions(dependencies);
        return null;
    };

    const unavailable = (): never => { throw new Error('queued edit/send-now must not call runtime APIs'); };
    const runtime: RuntimeAPIs = {
        runtime: { platform: 'web', isDesktop: false, isVSCode: false },
        get terminal() { return unavailable(); }, get git() { return unavailable(); },
        get files() {
            // SAFETY: the hook destructures `files` at render time but never calls it on the
            // edit/send-now paths under test; any accidental call throws through `unavailable`.
            return { listDirectory: unavailable, search: unavailable, createDirectory: unavailable } as RuntimeAPIs['files'];
        },
        get settings() { return unavailable(); },
        get permissions() { return unavailable(); }, get notifications() { return unavailable(); },
        get sourceControl() { return unavailable(); },
    };

    const mount = async (sessionPhase = 'idle', mobile = false) => {
        // The composer's own session owns the live attachment slot while it is open.
        useInputStore.getState().selectAttachmentDraft(draftIdentity());
        await act(async () => {
            root.render(
                <RuntimeAPIContext.Provider value={runtime}>
                    <Harness sessionPhase={sessionPhase} mobile={mobile} />
                </RuntimeAPIContext.Provider>,
            );
        });
    };
    const draftIdentity = () => {
        const identity = createChatDraftIdentity('host', '/repo', 'session-1');
        if (!identity) throw new Error('chat draft identity missing');
        return identity;
    };

    beforeEach(async () => {
        windowInstance = new Window();
        Object.assign(globalThis, {
            window: windowInstance,
            document: windowInstance.document,
            IS_REACT_ACT_ENVIRONMENT: true,
        });
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        actions = null;
        draftText = '';
        infoToasts = [];
        errorToasts = [];
        takeCalls = [];
        lastTake = null;
        sentMessages = [];
        attachmentBytes = new Map();
        queuedAppends = [];
        expandCalls = 0;
        expandedRef.current = false;
        takeResult = { status: 'taken', message: queuedMessage(), draft: takenDraft(queuedMessage()) };
        useInputStore.setState({ attachedFiles: [], attachmentDraftKey: null, attachmentDrafts: new Map() });
        useSessionGoalArmStore.setState({ armed: false, objectiveOverride: null, tokenBudgetOverride: null });
        getDeferredSafeStorage().removeItem('openchamber.chatDrafts.v2');

        spy(toast, 'info', (message: string | React.ReactNode) => { infoToasts.push(String(message)); return 0; });
        spy(toast, 'error', (message: string | React.ReactNode) => { errorToasts.push(String(message)); return 0; });
        spy(canonicalClient, 'resolveWorkspace', async () => ({ workspaceId: 'ws-1', projectId: 'proj-1', name: 'repo', displayPath: '/repo' }));
        spy(canonicalClient, 'readAttachment', async (_workspaceId: string, reference: string) => {
            const bytes = attachmentBytes.get(reference);
            if (!bytes) throw new Error('upload gone');
            return new Blob([new Uint8Array(bytes)]);
        });
        useSessionUIStore.setState({
            // SAFETY: the fixture captures every call's arguments; the action's real return type is Promise<void>, satisfied by the async body.
            sendMessage: (async (...args: SendMessageParams) => {
                sentMessages.push(args);
            }) as SessionUIState['sendMessage'],
        });
    });

    afterEach(async () => {
        await act(async () => { root.unmount(); });
        host.remove();
        for (const handle of spies) handle.mockRestore();
        spies.length = 0;
    });

    test('edit restore returns typed text, re-read attachment bytes, and re-arms the goal', async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        attachmentBytes.set('att-1', bytes);
        const attachment: AttachedFile = {
            id: 'a1', filename: 'note.txt', mimeType: 'text/plain', size: 4, source: 'local',
            file: new File([], 'note.txt'), dataUrl: 'attachment://att-1', serverPath: 'attachment://att-1', agentPath: '/repo/note.txt',
        };
        const message = queuedMessage({
            attachments: [attachment],
            goal: { objective: 'ship it', tokenBudget: 4000 },
            context: [{ kind: 'synthetic', text: 'synthetic part' }],
        });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(takeCalls).toEqual([{ messageId: 'q1' }]);
        expect(draftText).toBe('fix [note.txt] now');
        const restored = useInputStore.getState().getAttachedFiles(draftIdentity());
        expect(restored).toHaveLength(1);
        expect(restored[0]!.agentPath).toBe('/repo/note.txt');
        expect(new Uint8Array(await restored[0]!.file.arrayBuffer())).toEqual(bytes);
        // The re-read bytes rebuild the data URL the submit pipeline consumes,
        // so a restored attachment submits exactly like a freshly picked one.
        expect(restored[0]!.dataUrl).toBe(`data:text/plain;base64,${btoa(String.fromCharCode(...bytes))}`);
        expect(restored[0]!.serverPath).toBe('attachment://att-1');
        expect(useSessionGoalArmStore.getState().armed).toBe(true);
        expect(useSessionGoalArmStore.getState().objectiveOverride).toBe('ship it');
        expect(useSessionGoalArmStore.getState().tokenBudgetOverride).toBe(4000);
        expect(readChatDraft(draftIdentity()).text).toBe('fix [note.txt] now');
        expect(errorToasts).toEqual([]);
        expect(infoToasts).toEqual([]);
    });

    test('re-queueing an edit-restored attachment submits through the model conversion without a save error', async () => {
        // The composer model reads only text: an image attachment must be saved
        // into the workspace for the prompt, which consumes the data URL.
        const bytes = new Uint8Array([1, 2, 3, 4]);
        attachmentBytes.set('att-1', bytes);
        const originalGetModelMetadata = useConfigStore.getState().getModelMetadata;
        useConfigStore.setState({
            getModelMetadata: () => ({ id: 'm', providerId: 'p', modalities: { input: ['text'] } }),
        });
        const saveSpy = spyOn(workspaceAttachments, 'saveWorkspaceAttachments').mockImplementation(async (_directory, files) => (
            files.map(({ filename }) => ({ filename, path: `/repo/.ohpichamber/attachments/x/${filename}` }))
        ));
        spies.push(saveSpy);
        try {
            const attachment: AttachedFile = {
                id: 'a1', filename: 'probe.png', mimeType: 'image/png', size: 4, source: 'server',
                file: new File([], 'probe.png'), dataUrl: 'attachment://att-1', serverPath: 'attachment://att-1', agentPath: '/repo/probe.png',
            };
            const message = queuedMessage({ attachments: [attachment], content: 'look at [probe.png] now' });
            takeResult = { status: 'taken', message, draft: takenDraft(message) };
            await mount('running');
            await act(async () => {
                actions!.handleQueuedMessageEditById('q1');
                await flushAsync();
            });
            expect(useInputStore.getState().getAttachedFiles(draftIdentity())).toHaveLength(1);
            expect(draftText).toBe('look at [probe.png] now');

            await act(async () => {
                await actions!.handleQueueMessage();
                for (let index = 0; index < 8; index += 1) await Promise.resolve();
            });
            expect(errorToasts).toEqual([]);
            expect(queuedAppends).toHaveLength(1);
            const appendAttachments = queuedAppends[0]!.attachments;
            if (!appendAttachments) throw new Error('queued append carries no attachments');
            expect(appendAttachments).toHaveLength(1);
            expect(appendAttachments[0]!.filename).toBe('probe.png');
            // The text-only model cannot read the image: conversion saves the
            // re-read bytes into the workspace exactly once, which is only
            // possible when the restored attachment carries its data URL.
            expect(saveSpy).toHaveBeenCalledTimes(1);
            const savedBytes = saveSpy.mock.calls[0]?.[1][0]?.bytes;
            expect(savedBytes ? new Uint8Array(savedBytes) : null).toEqual(bytes);
        } finally {
            useConfigStore.setState({ getModelMetadata: originalGetModelMetadata });
        }
    });

    test('the restored draft is durable before the attachment re-read resolves', async () => {
        let releaseRead: ((blob: Blob) => void) | null = null;
        spy(canonicalClient, 'readAttachment', () => new Promise<Blob>((resolve) => {
            releaseRead = resolve;
        }));
        const attachment: AttachedFile = {
            id: 'a1', filename: 'note.txt', mimeType: 'text/plain', size: 4, source: 'local',
            file: new File([], 'note.txt'), dataUrl: 'attachment://att-1', serverPath: 'attachment://att-1', agentPath: '/repo/note.txt',
        };
        const message = queuedMessage({ attachments: [attachment] });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await lastTake;
            // The take continuation runs before the re-read is even requested;
            // give it every microtask up to the unresolved read.
            for (let index = 0; index < 8; index += 1) await Promise.resolve();
        });
        // The re-read is still pending, but the row is already gone server-side:
        // the typed text must already survive a refresh.
        expect(readChatDraft(draftIdentity()).text).toBe('fix [note.txt] now');
        await act(async () => {
            releaseRead?.(new Blob([new Uint8Array([1, 2, 3, 4])]));
            for (let index = 0; index < 8; index += 1) await Promise.resolve();
        });
        expect(useInputStore.getState().getAttachedFiles(draftIdentity())).toHaveLength(1);
    });

    test('restored attachments land under the original identity when the active draft changed mid-restore', async () => {
        let releaseRead: ((blob: Blob) => void) | null = null;
        spy(canonicalClient, 'readAttachment', () => new Promise<Blob>((resolve) => {
            releaseRead = resolve;
        }));
        const attachment: AttachedFile = {
            id: 'a1', filename: 'note.txt', mimeType: 'text/plain', size: 4, source: 'local',
            file: new File([], 'note.txt'), dataUrl: 'attachment://att-1', serverPath: 'attachment://att-1', agentPath: '/repo/note.txt',
        };
        const message = queuedMessage({ attachments: [attachment] });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount();
        const otherIdentity = createChatDraftIdentity('host', '/repo', 'session-2');
        if (!otherIdentity) throw new Error('other chat draft identity missing');
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await lastTake;
            for (let index = 0; index < 8; index += 1) await Promise.resolve();
            // Navigating mid-restore switches the active attachment slot.
            useInputStore.getState().selectAttachmentDraft(otherIdentity);
            releaseRead?.(new Blob([new Uint8Array([1, 2, 3, 4])]));
            for (let index = 0; index < 8; index += 1) await Promise.resolve();
        });
        expect(useInputStore.getState().attachmentDraftKey).not.toBeNull();
        expect(useInputStore.getState().getAttachedFiles(draftIdentity())).toHaveLength(1);
        expect(useInputStore.getState().getAttachedFiles(otherIdentity)).toEqual([]);
        expect(useInputStore.getState().attachedFiles).toEqual([]);
    });

    test('edit with a deleted upload drops only its attachment and keeps the text', async () => {
        const attachment: AttachedFile = {
            id: 'a1', filename: 'gone.txt', mimeType: 'text/plain', size: 4, source: 'local',
            file: new File([], 'gone.txt'), dataUrl: 'attachment://gone-1', serverPath: 'attachment://gone-1', agentPath: '/repo/gone.txt',
        };
        const message = queuedMessage({ attachments: [attachment] });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(useInputStore.getState().getAttachedFiles(draftIdentity())).toEqual([]);
        expect(draftText).toBe('fix [note.txt] now');
    });

    test('a refused take leaves the composer untouched and surfaces the refusal', async () => {
        takeResult = { status: 'refused' };
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(draftText).toBe('');
        expect(useInputStore.getState().getAttachedFiles(draftIdentity())).toEqual([]);
        expect(infoToasts).toEqual(['chat.queuedMessage.toast.takeRefused']);
        expect(sentMessages).toEqual([]);
    });

    test('a partial take notices before restoring what survives', async () => {
        takeResult = { status: 'taken-partial', message: queuedMessage({ attachments: undefined, context: undefined, goal: undefined }) };
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(infoToasts).toEqual(['chat.queuedMessage.originalUnavailable']);
        expect(draftText).toBe('fix [note.txt] now');
    });

    test('send-now sends with the captured selection and fileResourcesExpanded', async () => {
        const message = queuedMessage({
            agentMention: 'reviewer',
            context: [
                // SAFETY: the test only needs a metadata object the context chip carries opaquely.
                { kind: 'context', text: 'chip', metadata: { mention: { kind: 'x' } } as never, instructions: 'how-to-review' },
                { kind: 'synthetic', text: 'synth' },
            ],
        });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount('idle');
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(sentMessages).toHaveLength(1);
        const args = sentMessages[0]!;
        expect(args[0]).toBe('fix  now');
        expect(args[1]).toBe('p');
        expect(args[2]).toBe('m');
        expect(args[3]).toBe('build');
        expect(args[5]).toBe('reviewer');
        expect(args[7]).toBe('high');
        const options = optionsOf(args);
        expect(options.sessionId).toBe('session-1');
        expect(options.directory).toBe('/repo');
        expect(options.reasoningEffort).toBe('medium');
        expect(options.delivery).toBeUndefined();
        expect(options.fileResourcesExpanded).toBe(true);
        const parts = args[6];
        if (!parts) throw new Error('send-now additional parts missing');
        expect(parts).toHaveLength(3);
        expect(parts[0]).toEqual({ text: 'how-to-review', synthetic: true });
        expect(parts[1]!.text).toBe('chip');
        expect(parts[1]!.synthetic).toBe(true);
        expect(parts[1]!.metadata).toBeDefined();
        expect(parts[2]!.synthetic).toBe(true);
        expect(errorToasts).toEqual([]);
    });

    test('send-now passes the attachment it took with the message', async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        const attachment: AttachedFile = {
            id: 'a1', filename: 'note.txt', mimeType: 'text/plain', size: 4, source: 'server',
            file: new File([bytes], 'note.txt', { type: 'text/plain' }),
            dataUrl: `data:text/plain;base64,${btoa(String.fromCharCode(...bytes))}`,
            serverPath: 'attachment://att-1', agentPath: '/repo/note.txt',
        };
        const message = queuedMessage({ attachments: [attachment] });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount('running');
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(sentMessages).toHaveLength(1);
        const attachments = sentMessages[0]![4];
        expect(attachments).toHaveLength(1);
        expect(attachments![0]!.serverPath).toBe('attachment://att-1');
        expect(errorToasts).toEqual([]);
    });

    test('send-now re-arms the goal with its captured token budget', async () => {
        const message = queuedMessage({ goal: { objective: 'ship it', tokenBudget: 4000 } });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount('idle');
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(sentMessages).toHaveLength(1);
        expect(useSessionGoalArmStore.getState().armed).toBe(true);
        expect(useSessionGoalArmStore.getState().tokenBudgetOverride).toBe(4000);
        expect(errorToasts).toEqual([]);
    });

    test('send-now steers into the active turn when the session is busy', async () => {
        await mount('running');
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(sentMessages).toHaveLength(1);
        const options = optionsOf(sentMessages[0]!);
        expect(options.delivery).toBe('steer');
    });

    test('send-now passes the captured root selection verbatim instead of inheriting the current agent', async () => {
        const message = queuedMessage({
            sendConfig: { providerID: 'p', modelID: 'm', variant: 'high', reasoningEffort: 'medium' },
        });
        takeResult = { status: 'taken', message, draft: takenDraft(message) };
        await mount('running');
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(sentMessages).toHaveLength(1);
        const args = sentMessages[0]!;
        // The capture carries no agent: null is the verbatim root selection the Host
        // admits, while undefined would fall back to whatever agent is selected now.
        expect(args[3]).toBeNull();
        expect(args[7]).toBe('high');
        expect(optionsOf(args).reasoningEffort).toBe('medium');
        expect(errorToasts).toEqual([]);
    });

    test('a failed send-now restores the draft into the composer instead of losing it', async () => {
        useSessionUIStore.setState({
            // SAFETY: the fixture replaces the action with one that always rejects; the signature matches because it takes the same parameters (none read).
            sendMessage: (async () => { throw new Error('send exploded'); }) as SessionUIState['sendMessage'],
        });
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(errorToasts).toEqual(['send exploded']);
        expect(draftText).toBe('fix [note.txt] now');
    });

    test('send-now without a captured selection restores the draft rather than dropping it', async () => {
        takeResult = { status: 'taken-partial', message: queuedMessage({ sendConfig: undefined }) };
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageSend('q1');
            await flushAsync();
        });
        expect(sentMessages).toEqual([]);
        expect(errorToasts).toEqual(['chat.queuedMessage.toast.sendNowFailed']);
        expect(draftText).toBe('fix [note.txt] now');
    });
    test('a mobile edit take-over expands the collapsed shell exactly once', async () => {
        await mount('idle', true);
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(draftText).toBe('fix [note.txt] now');
        expect(expandCalls).toBe(1);
    });

    test('a mobile edit take-over leaves an expanded shell alone', async () => {
        expandedRef.current = true;
        await mount('idle', true);
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(draftText).toBe('fix [note.txt] now');
        expect(expandCalls).toBe(0);
    });

    test('a desktop edit take-over never expands the shell', async () => {
        await mount();
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(draftText).toBe('fix [note.txt] now');
        expect(expandCalls).toBe(0);
    });

    test('a refused mobile take never expands the shell', async () => {
        takeResult = { status: 'refused' };
        await mount('idle', true);
        await act(async () => {
            actions!.handleQueuedMessageEditById('q1');
            await flushAsync();
        });
        expect(draftText).toBe('');
        expect(expandCalls).toBe(0);
    });

});
