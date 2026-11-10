import { describe, expect, test } from 'bun:test';
import type { Message, Part, ToolStatus } from '@openchamber/agent-contract';

<<<<<<< HEAD
import { createParsedStatus, getActiveAssistantContext } from './useAssistantStatus';
=======
import { createParsedStatus, getActiveAssistantContext, hasBackgroundableWork, limitResetsAt } from './useAssistantStatus';
import { formatAgentStatusPhrase, type AgentStatus } from '@/lib/agentStatus';
import { formatMessage } from '@/lib/i18n';
import { dict as enDict } from '@/lib/i18n/messages/en';

// Statuses are keys; the tests read them through the English dictionary.
const english = (status: AgentStatus): string => formatAgentStatusPhrase((key, params) => formatMessage(enDict, key, params), 'en', status);
>>>>>>> bc50ba56a

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

<<<<<<< HEAD
    test('names OMP tools by their work and leaves other names visible', () => {
        expect(statusOf([tool('1', 'read')]).statusText).toBe('reading a file');
        expect(statusOf([tool('1', 'edit')]).statusText).toBe('editing a file');
        expect(statusOf([tool('1', 'bash')]).statusText).toBe('running a command');
        expect(statusOf([tool('1', 'web_search')]).statusText).toBe('looking things up');
        expect(statusOf([tool('1', 'task')]).statusText).toBe('handing off a task');
        expect(statusOf([tool('1', 'ask')]).statusText).toBe('asking a question');
        expect(statusOf([tool('1', 'find')]).statusText).toBe('searching files');
        expect(statusOf([tool('1', 'mcp__srv_custom')]).statusText).toBe('using mcp__srv_custom');
    });

    test('maps every OMP native tool to an assistant-status bucket', () => {
        expect(statusOf([tool('1', 'grep')]).statusText).toBe('searching files');
        expect(statusOf([tool('1', 'glob')]).statusText).toBe('searching files');
        expect(statusOf([tool('1', 'ast_grep')]).statusText).toBe('searching files');
        expect(statusOf([tool('1', 'ast_edit')]).statusText).toBe('editing a file');
        expect(statusOf([tool('1', 'todo')]).statusText).toBe('updating the plan');
        expect(statusOf([tool('1', 'eval')]).statusText).toBe('running code');
        expect(statusOf([tool('1', 'lsp')]).statusText).toBe('looking things up');
        for (const name of ['bash', 'task', 'ask', 'find', 'grep', 'glob', 'todo']) {
            const status = statusOf([tool('1', name)]);
            expect(status.isGenericStatus).toBe(false);
            expect(status.statusText).not.toBe(`using ${name}`);
        }
    });

    test('counts parallel eval calls and keeps plan updates uncounted', () => {
        expect(statusOf([tool('1', 'eval'), tool('2', 'eval')]).statusText).toBe('running 2 code samples');
        expect(statusOf([tool('1', 'todo'), tool('2', 'todo')]).statusText).toBe('updating the plan');
    });

    test('counts parallel calls in the same native category', () => {
        expect(statusOf([tool('1', 'read'), tool('2', 'read'), tool('3', 'read')]).statusText).toBe('reading 3 files');
        expect(statusOf([tool('1', 'write'), tool('2', 'edit')]).statusText).toBe('editing 2 files');
        expect(statusOf([tool('1', 'bash'), tool('2', 'bash')]).statusText).toBe('running 2 commands');
        expect(statusOf([tool('1', 'task'), tool('2', 'task')]).statusText).toBe('handing off 2 tasks');
=======
    test('names a tool by the kind of work it does', () => {
        expect(english(statusOf([tool('1', 'read')]).status)).toBe('reading a file');
        expect(english(statusOf([tool('1', 'patch')]).status)).toBe('editing a file');
        expect(english(statusOf([tool('1', 'shell')]).status)).toBe('running a command');
        expect(english(statusOf([tool('1', 'webfetch')]).status)).toBe('looking things up');
        expect(english(statusOf([tool('1', 'subagent')]).status)).toBe('handing off a task');
        expect(english(statusOf([tool('1', 'skill')]).status)).toBe('picking up a skill');
    });

    test('counts parallel calls of the same kind', () => {
        expect(english(statusOf([tool('1', 'read'), tool('2', 'read'), tool('3', 'file-diff')]).status)).toBe('reading 3 files');
        expect(english(statusOf([tool('1', 'write'), tool('2', 'patch')]).status)).toBe('editing 2 files');
        expect(english(statusOf([tool('1', 'shell'), tool('2', 'execute')]).status)).toBe('running 2 commands');
        expect(english(statusOf([tool('1', 'subagent'), tool('2', 'subagent')]).status)).toBe('handing off 2 tasks');
>>>>>>> bc50ba56a
    });

    test('does not count searches, since one call spans many files', () => {
        expect(english(statusOf([tool('1', 'grep'), tool('2', 'glob')]).status)).toBe('searching files');
    });

    test('counts only unfinished calls', () => {
        expect(english(statusOf([tool('1', 'read'), tool('2', 'read', 'completed')]).status)).toBe('reading a file');
    });
    test('failed and completed calls are not active', () => {
        expect(statusOf([tool('1', 'read', 'completed')]).activePartType).toBeUndefined();
        expect(statusOf([tool('2', 'bash', 'failed')]).activePartType).toBeUndefined();
    });

    test('canonical text and reasoning parts remain neutral without completion data', () => {
        expect(statusOf([{ type: 'text', partId: 'text_1', content: 'hello' }]).activePartType).toBeUndefined();
        expect(statusOf([{ type: 'reasoning', partId: 'reason_1', content: 'thinking' }]).activePartType).toBeUndefined();
    });

    test('shows the newest kind when different tools run together', () => {
<<<<<<< HEAD
        expect(statusOf([tool('1', 'read'), tool('2', 'bash')]).statusText).toBe('running a command');
        expect(statusOf([tool('1', 'bash'), tool('2', 'read')]).statusText).toBe('reading a file');
=======
        expect(english(statusOf([tool('1', 'read'), tool('2', 'shell')]).status)).toBe('running a command');
        expect(english(statusOf([tool('1', 'shell'), tool('2', 'read')]).status)).toBe('reading a file');
    });

    describe('OpenChamber tools', () => {
        const call = (name: string, input: ToolInput, status: 'running' | 'pending' = 'running'): Part => ({
            id: '1',
            sessionID: 'ses_1',
            messageID: 'msg_1',
            type: 'tool',
            callID: 'call_1',
            tool: name,
            state: status === 'running'
                ? { status: 'running', input, time: { start: 1 } }
                : { status: 'pending', input, raw: '' },
        });
        const script = (toolCalls: Metadata[]): Part => ({
            id: '1',
            sessionID: 'ses_1',
            messageID: 'msg_1',
            type: 'tool',
            callID: 'call_1',
            tool: 'execute',
            state: { status: 'running', input: {}, time: { start: 1 }, metadata: { toolCalls } },
        });

        test('say what the action does instead of the tool name', () => {
            expect(english(statusOf([call('openchamber_web', { action: 'browser.snapshot', parameters: {} })]).status)).toBe('reading a page');
            expect(english(statusOf([call('openchamber_memory', { action: 'memory.save', parameters: { title: 'x' } })]).status)).toBe('saving to memory');
            expect(english(statusOf([call('openchamber', { action: 'session.create' })]).status)).toBe('starting a session');
            expect(english(statusOf([call('openchamber_notify', { title: 'Done' })]).status)).toBe('sending a notification');
            expect(english(statusOf([call('openchamber_usage', { action: 'usage.read', parameters: {} })]).status)).toBe('checking usage limits');
        });

        test('fall back to the tool phrase for an action without its own', () => {
            expect(english(statusOf([call('openchamber_web', { action: 'browser.click' })]).status)).toBe('using the browser');
            expect(english(statusOf([call('openchamber_knowledge', {})]).status)).toBe('checking project knowledge');
        });

        test('a page that waits for the answer says so once it shows', () => {
            const input = { action: 'render.page', parameters: { html: '<p>a</p>', awaitAnswer: true } };
            expect(english(statusOf([call('openchamber_render', input, 'pending')]).status)).toBe('drawing a page');
            expect(english(statusOf([call('openchamber_render', input)]).status)).toBe('waiting for your answer');
        });

        test('read the same from inside a Code Mode script', () => {
            expect(english(statusOf([script([
                { tool: 'openchamber_web', status: 'completed', input: { action: 'browser.open' } },
                { tool: 'openchamber_memory', status: 'running', input: { action: 'memory.read' } },
            ])]).status)).toBe('checking memory');
        });
    });

    describe('tools outside the built-ins', () => {
        const script = (tool: string): Part => ({
            id: '1',
            sessionID: 'ses_1',
            messageID: 'msg_1',
            type: 'tool',
            callID: 'call_1',
            tool: 'execute',
            state: { status: 'running', input: {}, time: { start: 1 }, metadata: { toolCalls: [{ tool, status: 'running' }] } },
        });
        const servers = ['linear', 'claude_in_chrome', 'claude', 'my.server'];
        const statusWith = (parts: Part[]) => english(createParsedStatus(parts, 'ses_1:msg_1', servers).status);

        test('the opencode namespace says what OpenCode does to itself', () => {
            expect(statusWith([script('opencode_session_rename')])).toBe('renaming the session');
            expect(statusWith([script('opencode_worktree_list')])).toBe('checking worktrees');
            expect(statusWith([script('opencode_read_mcp_resource')])).toBe('reading an MCP resource');
            expect(statusWith([tool('1', 'opencode.models')])).toBe('looking up models');
        });

        test('an MCP tool names its integration, the longest server name first', () => {
            expect(statusWith([script('linear_list_issues')])).toBe('using linear');
            expect(statusWith([tool('1', 'linear_get_document')])).toBe('using linear');
            expect(statusWith([script('claude_in_chrome_navigate')])).toBe('using claude in chrome');
            expect(statusWith([script('my_server_query')])).toBe('using my.server');
        });

        test('a tool no server claims reads as words', () => {
            expect(english(statusOf([script('linear_list_issues')]).status)).toBe('using linear list issues');
            expect(english(statusOf([tool('1', 'jev-route')]).status)).toBe('using jev route');
        });

        test('a secret run waits on the user only while its card waits, then runs its command', () => {
            const run: Part = {
                id: '1', sessionID: 'ses_1', messageID: 'msg_1', type: 'tool', callID: 'call_1', tool: 'openchamber_secret',
                state: { status: 'running', input: { action: 'secret.run', parameters: { program: 'sh' } }, time: { start: 1 } },
            };
            const statusWhile = (waiting: string[]) => english(createParsedStatus([run], 'ses_1:msg_1', [], new Set(waiting)).status);
            expect(statusWhile(['call_1'])).toBe(english({ key: 'chat.agentStatus.waitingAnswer' }));
            expect(statusWhile([])).toBe('running a command with secrets');
        });
    });
});

describe('limitResetsAt', () => {
    const error = (body: string): StructuredError => ({ type: 'provider.rate-limit', message: 'limit', status: 429, response: { body } });
    const rateLimit = (body: unknown) => error(JSON.stringify(body));

    test('reads resets_at under error, as the Claude Code plugin sends it', () => {
        const claude = rateLimit({ error: { type: 'rate_limit_error', resets_at: '2026-10-19T12:20:00.000Z', retry_after: 16775 } });
        expect(limitResetsAt(claude)).toBe(Date.parse('2026-10-19T12:20:00.000Z'));
    });

    test('reads a top-level resets_at in epoch seconds or milliseconds', () => {
        expect(limitResetsAt(rateLimit({ resets_at: 1792412400 }))).toBe(1792412400000);
        expect(limitResetsAt(rateLimit({ resets_at: 1792412400000 }))).toBe(1792412400000);
    });

    test('ignores errors without a usable reset time', () => {
        expect(limitResetsAt(undefined)).toBeUndefined();
        expect(limitResetsAt({ type: 'provider.unknown', message: 'boom' })).toBeUndefined();
        expect(limitResetsAt(error('resets_at soon, not json'))).toBeUndefined();
        expect(limitResetsAt(rateLimit({ error: { resets_at: 'tomorrow' } }))).toBeUndefined();
>>>>>>> bc50ba56a
    });
});
