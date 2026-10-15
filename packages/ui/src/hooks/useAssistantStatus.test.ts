import { describe, expect, test } from 'bun:test';
import type { Message, Part, ToolStatus } from '@openchamber/agent-contract';

import { createParsedStatus, getActiveAssistantContext } from './useAssistantStatus';

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

    const tool = (id: string, name: string, status: 'running' | 'pending' | 'completed' | 'failed' = 'running'): Part => ({
        type: 'tool_call',
        partId: id,
        toolCallId: `call_${id}`,
        toolName: name,
        input: {},
        status: toolState(status),
    });

    const statusOf = (parts: Part[]) => createParsedStatus(parts, 'ses_1:msg_1');

    test('names a tool by the kind of work it does', () => {
        expect(statusOf([tool('1', 'read')]).statusText).toBe('reading a file');
        expect(statusOf([tool('1', 'patch')]).statusText).toBe('editing a file');
        expect(statusOf([tool('1', 'shell')]).statusText).toBe('running a command');
        expect(statusOf([tool('1', 'webfetch')]).statusText).toBe('looking things up');
        expect(statusOf([tool('1', 'subagent')]).statusText).toBe('handing off a task');
        expect(statusOf([tool('1', 'skill')]).statusText).toBe('picking up a skill');
    });

    test('counts parallel calls of the same kind', () => {
        expect(statusOf([tool('1', 'read'), tool('2', 'read'), tool('3', 'file-diff')]).statusText).toBe('reading 3 files');
        expect(statusOf([tool('1', 'write'), tool('2', 'patch')]).statusText).toBe('editing 2 files');
        expect(statusOf([tool('1', 'shell'), tool('2', 'execute')]).statusText).toBe('running 2 commands');
        expect(statusOf([tool('1', 'subagent'), tool('2', 'subagent')]).statusText).toBe('handing off 2 tasks');
    });

    test('does not count searches, since one call spans many files', () => {
        expect(statusOf([tool('1', 'grep'), tool('2', 'glob')]).statusText).toBe('searching files');
    });

    test('counts only unfinished calls', () => {
        expect(statusOf([tool('1', 'read'), tool('2', 'read', 'completed')]).statusText).toBe('reading a file');
    });
    test('failed and completed calls are not active', () => {
        expect(statusOf([tool('1', 'read', 'completed')]).activePartType).toBeUndefined();
        expect(statusOf([tool('2', 'shell', 'failed')]).activePartType).toBeUndefined();
    });

    test('canonical text and reasoning parts remain neutral without completion data', () => {
        expect(statusOf([{ type: 'text', partId: 'text_1', content: 'hello' }]).activePartType).toBeUndefined();
        expect(statusOf([{ type: 'reasoning', partId: 'reason_1', content: 'thinking' }]).activePartType).toBeUndefined();
    });

    test('shows the newest kind when different tools run together', () => {
        expect(statusOf([tool('1', 'read'), tool('2', 'shell')]).statusText).toBe('running a command');
        expect(statusOf([tool('1', 'shell'), tool('2', 'read')]).statusText).toBe('reading a file');
    });
});
