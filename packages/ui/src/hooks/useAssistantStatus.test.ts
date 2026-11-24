import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Message, Part, ToolStatus } from '@openchamber/agent-contract';
import type { StoreApi } from 'zustand';

import { ChatColumnSessionContext } from '@/components/chat/chatColumnSession';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { SyncProvider, useDirectoryStore } from '@/sync/sync-context';
import type { DirectoryStore } from '@/sync/child-store';
import { applyDirectoryEvent, installSessionSnapshot } from '@/sync/event-reducer';
import { nativeClient, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { createParsedStatus, decodeParsedStatus, encodeParsedStatus, getActiveAssistantContext, retryInfoOf, useAssistantStatus, type AssistantStatusSnapshot } from './useAssistantStatus';
const userMessage = (messageId: string): Message => ({
    messageId,
    role: 'user',
    sessionId: 'ses_1',
    turnId: `turn_${messageId}`,
    createdAt: 1,
    parts: [],
});

const assistantMessage = (messageId: string, providerId: string, modelId: string): Message => {
    const message: Message = {
        messageId,
        role: 'assistant',
        sessionId: 'ses_1',
        turnId: `turn_${messageId}`,
        createdAt: 2,
        parts: [],
    };
    if (providerId) message.providerId = providerId;
    if (modelId) message.modelId = modelId;
    return message;
};

const systemMessage = (messageId: string): Message => ({
    messageId,
    role: 'system',
    sessionId: 'ses_1',
    turnId: `turn_${messageId}`,
    createdAt: 3,
    parts: [],
});

describe('getActiveAssistantContext', () => {
    test('keeps the model when plumbing messages land after the assistant', () => {
        const assistant = assistantMessage('assistant_1', 'anthropic', 'claude-opus-4-1');

        expect(getActiveAssistantContext([userMessage('user_1'), assistant, systemMessage('system_1')])).toEqual({
            assistantId: assistant.messageId,
            model: {
                providerId: 'anthropic',
                modelId: 'claude-opus-4-1',
            },
        });
    });

    test('does not guess a model when a newer prompt follows', () => {
        const prompt = userMessage('user_1');
        const assistant = assistantMessage('assistant_1', 'anthropic', 'claude-opus-4-1');
        const laterPrompt = userMessage('user_2');

        expect(getActiveAssistantContext([prompt, assistant, laterPrompt])).toEqual({
            assistantId: assistant.messageId,
            model: null,
        });
    });

    test('follows the newer assistant message when the model changed mid-session', () => {
        const firstUser = userMessage('user_1');
        const firstAssistant = assistantMessage('assistant_1', 'anthropic', 'claude-opus-4-1');
        const secondUser = userMessage('user_2');
        const secondAssistant = assistantMessage('assistant_2', 'openai', 'gpt-5.6-sol');

        expect(getActiveAssistantContext([firstUser, firstAssistant, secondUser, secondAssistant])).toEqual({
            assistantId: secondAssistant.messageId,
            model: {
                providerId: 'openai',
                modelId: 'gpt-5.6-sol',
            },
        });
    });

    test('does not guess a model when the assistant message records none', () => {
        const assistant = assistantMessage('assistant_1', '', '');

        expect(getActiveAssistantContext([assistant])).toEqual({
            assistantId: assistant.messageId,
            model: null,
        });
    });

    test('reports no assistant when the session has only prompts', () => {
        expect(getActiveAssistantContext([userMessage('user_1')])).toEqual({
            assistantId: null,
            model: null,
        });
    });

    test('does not guess a model for a newer prompt when completion is not represented', () => {
        const previousAssistant = assistantMessage('assistant_1', 'anthropic', 'claude-opus-4-1');
        const messages = [userMessage('user_1'), previousAssistant, userMessage('user_2')];

        expect(getActiveAssistantContext(messages, { providerId: 'openai', modelId: 'gpt-5.6-sol' })).toEqual({
            assistantId: previousAssistant.messageId,
            model: null,
        });
    });

    test('does not guess an active model when a prompt is queued behind an assistant', () => {
        const running = assistantMessage('assistant_1', 'anthropic', 'claude-opus-4-1');

        expect(getActiveAssistantContext([userMessage('user_1'), running, userMessage('user_2')])).toEqual({
            assistantId: running.messageId,
            model: null,
        });
    });
});


describe('createParsedStatus', () => {
    const toolState = (status: 'running' | 'pending' | 'completed' | 'failed'): ToolStatus => status === 'pending' ? 'pending_approval' : status;

    const tool = (id: string, name: string, status: 'running' | 'pending' | 'completed' | 'failed' = 'running', input: Part extends never ? never : Record<string, string> = {}): Part => ({
        type: 'tool_call',
        partId: id,
        toolCallId: `call_${id}`,
        toolName: name,
        input,
        status: toolState(status),
    });

    const statusOf = (parts: Part[]) => createParsedStatus(parts);

    test('a running call reads as its intent, exactly as the harness wrote it', () => {
        expect(statusOf([tool('1', 'read', 'running', { i: 'Checking the parser...' })]).status).toEqual({
            key: 'chat.agentStatus.usingTool',
            name: 'Read',
            text: 'Checking the parser',
        });
    });

    test('without an intent the call describes its own target', () => {
        expect(statusOf([tool('1', 'read', 'running', { path: 'src/main.ts' })]).status).toEqual({
            key: 'chat.agentStatus.usingTool',
            name: 'Read',
            text: 'src/main.ts',
        });
        expect(statusOf([tool('1', 'bash', 'running', { command: 'bun test' })]).status).toEqual({
            key: 'chat.agentStatus.usingTool',
            name: 'Bash',
            text: 'bun test',
        });
    });

    test('the newest unfinished call owns the line', () => {
        expect(statusOf([tool('1', 'read', 'running', { i: 'Reading the index' }), tool('2', 'bash', 'running', { i: 'Running tests' })]).status.text).toBe('Running tests');
        expect(statusOf([tool('1', 'read', 'running', { i: 'Reading the index' }), tool('2', 'bash', 'completed')]).status.text).toBe('Reading the index');
    });

    test('finished calls leave the plain working line', () => {
        expect(statusOf([tool('1', 'read', 'completed')]).status).toEqual({ key: 'chat.agentStatus.working' });
        expect(statusOf([tool('2', 'bash', 'failed')]).status).toEqual({ key: 'chat.agentStatus.working' });
    });

    test('live reasoning with no intent reads as thinking', () => {
        expect(statusOf([{ type: 'reasoning', partId: 'reason_1', content: 'weighing options' }]).status).toEqual({ key: 'chat.agentStatus.thinking' });
        expect(statusOf([{ type: 'reasoning', partId: 'reason_1', content: 'weighing options' }]).isAnswering).toBe(false);
    });

    test('text after reasoning is the answer, not thinking', () => {
        expect(statusOf([
            { type: 'reasoning', partId: 'reason_1', content: 'weighing options' },
            { type: 'text', partId: 'text_1', content: 'Here it is.' },
        ]).status).toEqual({ key: 'chat.agentStatus.working' });
    });

    test('an unknown extension tool still names itself', () => {
        expect(statusOf([tool('1', 'mcp__srv_custom')]).status).toEqual({ key: 'chat.agentStatus.usingTool', name: 'srv: custom' });
        expect(statusOf([tool('1', 'mcp__srv_custom')]).isAnswering).toBe(false);
    });
});

describe('retryInfoOf', () => {
    const retryNotice = (attempt: number, delayMs: number): Part => ({
        type: 'notice',
        partId: `notice_${attempt}`,
        noticeType: 'auto_retry_start',
        level: 'warning',
        details: { attempt, maxAttempts: 5, delayMs, errorMessage: 'overloaded' },
    });

    test('a trailing retry notice reports its attempt, cap and delay', () => {
        expect(retryInfoOf([retryNotice(2, 4000)])).toEqual({ attempt: 2, maxAttempts: 5, next: 4000 });
    });

    test('work after the notice means the retry already ran', () => {
        expect(retryInfoOf([retryNotice(2, 4000), { type: 'text', partId: 'text_1', content: 'back' }])).toBeNull();
    });
});

describe('the status signature', () => {
    // The hook joins the encoded status with the retry fields using one
    // separator. When the encoding carried that separator itself, the retry
    // fields read the status JSON as an attempt, so every turn showed
    // "Retrying" and the call's intent never reached the row.
    const SEPARATOR = '\u0000';
    const signatureOf = (parts: readonly Part[]) => {
        const retry = retryInfoOf(parts);
        return [encodeParsedStatus(createParsedStatus(parts)), retry?.attempt ?? '', retry?.next ?? '', retry?.maxAttempts ?? ''].join(SEPARATOR);
    };

    test('a running call keeps its intent and reports no retry', () => {
        const parts: Part[] = [{
            type: 'tool_call',
            partId: 'call_1',
            toolCallId: 'call_1',
            toolName: 'bash',
            input: { command: 'echo hi', i: 'Running echo command' },
            status: 'running',
        }];
        const signature = signatureOf(parts);
        const [statusField, attempt] = signature.split(SEPARATOR);
        expect(attempt).toBe('');
        const decoded = decodeParsedStatus(statusField ?? '');
        expect(decoded.status.text).toBe('Running echo command');
        expect(decoded.isAnswering).toBe(false);
    });

    test('a retry notice reports the attempt beside the status', () => {
        const parts: Part[] = [{
            type: 'notice',
            partId: 'notice_1',
            noticeType: 'auto_retry_start',
            level: 'warning',
            details: { attempt: 2, maxAttempts: 5, delayMs: 4000, errorMessage: 'overloaded' },
        }];
        const signature = signatureOf(parts);
        const fields = signature.split(SEPARATOR);
        expect(fields).toHaveLength(4);
        expect(fields[1]).toBe('2');
        expect(fields[2]).toBe('4000');
        expect(fields[3]).toBe('5');
    });
});

describe('useAssistantStatus live compaction state', () => {
    const browser = new Window({ url: 'http://runtime.test' });
    const descriptors = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({
        window: browser,
        document: browser.document,
        navigator: browser.navigator,
        HTMLElement: browser.HTMLElement,
        Element: browser.Element,
        Node: browser.Node,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }

    const DIR = '/workspace/assistant-status';
    const WORKSPACE_ID = 'workspace-assistant-status';
    const SESSION_ID = 'session-assistant-status';

    let host: HTMLElement;
    let root: Root | null = null;
    let directoryStore: StoreApi<DirectoryStore> | null = null;
    let latestStatus: AssistantStatusSnapshot | null = null;

    const StatusProbe = () => {
        directoryStore = useDirectoryStore(DIR, { bootstrap: false });
        latestStatus = useAssistantStatus();
        return null;
    };

    beforeEach(() => {
        registerWorkspaceDirectory(WORKSPACE_ID, DIR);
        host = document.createElement('div');
        document.body.append(host);
        root = createRoot(host);
        directoryStore = null;
        latestStatus = null;
    });

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount());
            root = null;
        }
        host.remove();
        resetWorkspaceDirectories();
    });

    afterAll(() => {
        for (const [name, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
        browser.close();
    });

    test('reports chat.agentStatus.compacting while snapshot.compacting is active and clears when null', async () => {
        await act(async () => {
            root!.render(
                React.createElement(
                    SyncProvider,
                    {
                        client: nativeClient(),
                        directory: DIR,
                        children: React.createElement(
                            ChatColumnSessionContext.Provider,
                            {
                                value: { sessionId: SESSION_ID, directory: DIR },
                                children: React.createElement(StatusProbe),
                            },
                        ),
                    },
                ),
            );
        });

        const initial = nativeSnapshot(SESSION_ID, []);
        await act(async () => {
            directoryStore!.setState((prev) => installSessionSnapshot(prev, initial));
        });
        expect(latestStatus?.working.isWorking).toBe(false);
        expect(latestStatus?.working.status).toBeNull();

        await act(async () => {
            directoryStore!.setState((prev) => applyDirectoryEvent(prev, {
                sessionId: SESSION_ID,
                epoch: initial.session.epoch,
                sequence: '5',
                timestamp: 100,
                type: 'session.updated',
                compacting: { method: 'soft-compacted', reason: 'idle', startedAt: 100 },
            }).state);
        });
        expect(latestStatus?.working.isWorking).toBe(true);
        expect(latestStatus?.working.status).toEqual({ key: 'chat.agentStatus.compacting' });

        await act(async () => {
            directoryStore!.setState((prev) => applyDirectoryEvent(prev, {
                sessionId: SESSION_ID,
                epoch: initial.session.epoch,
                sequence: '6',
                timestamp: 120,
                type: 'session.updated',
                compacting: null,
            }).state);
        });
        expect(latestStatus?.working.isWorking).toBe(false);
        expect(latestStatus?.working.status).toBeNull();
    });
});
