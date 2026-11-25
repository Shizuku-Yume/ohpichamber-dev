import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { overrides } from '../../../../../package.json';
import {
    askAnswers,
    categorizeTool,
    describeTaskResultWithSubagents,
    flatScalarInputRows,
    getToolOneLineDescription,
    isRawInputSuppressedTool,
    isSubagentTool,
    isVibeSubagentTool,
    KNOWN_TOOL_NAMES,
    OMP_TOOL_NAMES,
    toolPresentation,
} from './index';

const known = (name: string): boolean => (KNOWN_TOOL_NAMES as readonly string[]).includes(name);

/**
 * The registry is only as good as its coverage: a tool OMP ships that the
 * registry never heard of falls back to a wrench and its raw name. These tests
 * read OMP's own name lists out of the pinned tarball, so an OMP upgrade that
 * adds a tool fails here instead of silently degrading the chat.
 */
const REPO_ROOT = new URL('../../../../../', import.meta.url);

const tarball = (name: '@oh-my-pi/pi-coding-agent' | '@oh-my-pi/pi-tui'): string => {
    const pin = overrides[name];
    if (!pin.startsWith('file:vendor/omp/')) throw new Error(`No vendored tarball pin for ${name}`);
    return fileURLToPath(new URL(pin.slice('file:'.length), REPO_ROOT));
};

const readMember = (archive: string, member: string): string => {
    const result = spawnSync('tar', ['-xOzf', archive, member], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`tar failed for ${member}: ${result.stderr}`);
    return result.stdout;
};

/** The string literals of a `const NAME = [...] as const` list in OMP's source. */
const nameList = (source: string, constant: string): string[] => {
    const start = source.indexOf(`export const ${constant}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('] as const', start);
    expect(end).toBeGreaterThan(start);
    return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? '');
};

/** The keys of OMP's pi-tui renderer registry. */
const rendererNames = (source: string): string[] => {
    const start = source.indexOf('export const toolRenderers');
    const end = source.indexOf('};', start);
    return [...source.slice(start, end).matchAll(/^\t([a-z_]+):/gm)].map((match) => match[1] ?? '');
};

const ompNames = (): { builtin: string[]; hidden: string[]; renderers: string[] } => {
    const codingAgent = readMember(tarball('@oh-my-pi/pi-coding-agent'), 'package/src/tools/builtin-names.ts');
    const tui = readMember(tarball('@oh-my-pi/pi-tui'), 'package/src/tools/index.ts');
    return {
        builtin: nameList(codingAgent, 'BUILTIN_TOOL_NAMES'),
        hidden: nameList(codingAgent, 'HIDDEN_TOOL_NAMES'),
        renderers: rendererNames(tui),
    };
};

/** The fork's own tools: the Agent Service registers these beside OMP's. */
const HOST_TOOL_NAMES = ['openchamber', 'openchamber_knowledge', 'web', 'notify', 'openchamber_render', 'openchamber_workflow', 'openchamber_usage'] as const;

describe('OMP tool presentation coverage', () => {
    test('resolve, reject, and propose parse OMP reason/title and details.action without inventing malformed values', () => {
        const propose = toolPresentation('propose');
        expect(propose.label).toBe('Propose');
        expect(propose.describeCall({ title: 'auth-refactor-plan' })).toBe('auth-refactor-plan');
        expect(propose.describeResult({ title: 'auth-refactor-plan', planExists: true })).toBe('auth-refactor-plan');
        expect(propose.describeResult({ action: 'accepted' })).toBe('accepted');
        expect(propose.describeCall({})).toBeNull();
        expect(propose.describeResult({ action: 17 })).toBeNull();

        const resolve = toolPresentation('resolve');
        expect(resolve.label).toBe('Resolve');
        expect(resolve.describeCall({ reason: 'Apply the verified patch to auth.ts' })).toBe('Apply the verified patch to auth.ts');
        expect(resolve.describeResult({ action: 'apply', reason: 'Apply the verified patch to auth.ts', sourceToolName: 'edit' })).toBe('apply');

        const reject = toolPresentation('reject');
        expect(reject.label).toBe('Reject');
        expect(reject.describeCall({ reason: 'Wrong target branch' })).toBe('Wrong target branch');
        expect(reject.describeResult({ action: 'discard', reason: 'Wrong target branch' })).toBe('discard');
    });
    test('every OMP builtin and hidden tool has a registry entry', () => {
        const { builtin, hidden } = ompNames();
        expect(builtin.length).toBeGreaterThan(25);
        for (const name of [...builtin, ...hidden]) {
            expect(`${name}: ${known(name)}`).toBe(`${name}: true`);
        }
    });

    test('every tool pi-tui renders has a registry entry', () => {
        const { renderers } = ompNames();
        expect(renderers.length).toBeGreaterThan(20);
        for (const name of renderers) {
            expect(`${name}: ${known(name)}`).toBe(`${name}: true`);
        }
    });

    test('the advisor and the fork host tools are covered', () => {
        for (const name of ['advise', ...HOST_TOOL_NAMES]) {
            expect(`${name}: ${known(name)}`).toBe(`${name}: true`);
        }
    });

    test('every entry carries a label, an icon, a grouping class and both describers', () => {
        for (const name of KNOWN_TOOL_NAMES) {
            const entry = toolPresentation(name);
            expect(`${name}: ${entry.label.trim().length > 0}`).toBe(`${name}: true`);
            expect(`${name}: ${entry.icon.trim().length > 0}`).toBe(`${name}: true`);
            expect(`${name}: ${['read', 'search', 'call'].includes(entry.group)}`).toBe(`${name}: true`);
            expect(`${name}: ${typeof entry.describeCall}`).toBe(`${name}: function`);
            expect(`${name}: ${typeof entry.describeResult}`).toBe(`${name}: function`);
        }
    });

    test('no invented tool names: fetch is a pipeline, not a tool', () => {
        expect(KNOWN_TOOL_NAMES).not.toContain('fetch');
        expect(OMP_TOOL_NAMES).not.toContain('fetch');
    });

    test('MCP fallback prettifies server and tool from name or details into server: tool', () => {
        const fromName = toolPresentation('mcp__server_custom');
        expect(fromName.label).toBe('server: custom');
        expect(fromName.icon).toBe('tools');
        expect(fromName.describeCall({ anything: 'x' })).toBeNull();

        const fromDoubleSep = toolPresentation('mcp__playwright__browser_click');
        expect(fromDoubleSep.label).toBe('playwright: browser_click');

        const fromDetails = toolPresentation('mcp__github_create_issue', {
            serverName: 'github',
            mcpToolName: 'create_issue',
        });
        expect(fromDetails.label).toBe('github: create_issue');
    });

    test('a runtime alias reads as its base tool', () => {
        expect(toolPresentation('runtime.read:2').label).toBe('Read');
        expect(toolPresentation('search').label).toBe('Grep');
    });

    test('todo progress counts completed and abandoned tasks as closed across phases', () => {
        const todo = toolPresentation('todo');
        expect(todo.describeResult({
            phases: [
                { name: 'Plan', tasks: [{ content: 'Done', status: 'completed' }, { content: 'Dropped', status: 'abandoned' }] },
                { name: 'Verify', tasks: [{ content: 'Working', status: 'in_progress' }, { content: 'Next', status: 'pending' }] },
            ]
        })).toBe('2/4');
        expect(todo.describeResult({ phases: [] })).toBeNull();
        expect(todo.describeResult({})).toBeNull();
    });

    test('bashSummary surfaces async job and service details', () => {
        const bash = toolPresentation('bash');
        expect(bash.describeResult({
            async: { jobId: 'job-42', state: 'running', type: 'bash' },
            exitCode: 0,
        })).toBe('job job-42 · running · exit 0');
        expect(bash.describeResult({
            service: { name: 'dev-server', state: 'running', ready: true, timedOut: false, pid: 1234 },
        })).toBe('service dev-server · ready · pid 1234');
    });

    test('tts presentation and permission group are registered', () => {
        const tts = toolPresentation('tts');
        expect(tts.label).toBe('Speech generation');
        expect(tts.icon).toBe('volume-up');
        expect(tts.describeCall({ output_path: 'out/hello.mp3', text: 'Hello' })).toBe('out/hello.mp3');
        expect(tts.describeResult({ codec: 'mp3', voiceId: 'eve', bytes: 2048 })).toBe('MP3 · eve · 2048 bytes');
    });

    test('askAnswers parses HTML form { data, notes, timedOut } outcomes', () => {
        expect(categorizeTool('tts')).toBe('execution');
        expect(getToolOneLineDescription('tts')).toBe('Synthesize speech audio from text');
        expect(askAnswers({
            data: { db: 'postgres', tags: ['api', 'cli'] },
            notes: [{ name: 'db', question: 'Which database?', option: 'postgres', value: 'postgres', text: 'Primary store' }],
            timedOut: true,
        })).toEqual([
            { question: 'Which database?', answer: 'postgres', note: 'postgres: Primary store', timedOut: true },
            { question: 'tags', answer: 'api, cli', timedOut: true },
        ]);
        expect(toolPresentation('ask').describeResult({
            data: { db: 'postgres', blank: '' },
            timedOut: true,
        })).toBe('timed out · 1/2 answered');
    });

    test('task.describeCall supports intent, single, and OMP 19.1 batch inputs', () => {
        const task = toolPresentation('task');
        expect(task.describeCall({
            i: 'Auditing tool cards...',
            context: 'Shared',
            tasks: [{ name: 'A', agent: 'scout', task: 'Inspect' }],
        })).toBe('Auditing tool cards');
        expect(task.describeCall({
            context: 'Shared',
            tasks: [
                { name: 'ScoutA', agent: 'scout', task: 'Read A', solutionSpace: 'narrow' },
                { name: 'WorkerB', agent: 'task', task: 'Fix B', solutionSpace: 'narrow' },
            ],
        })).toBe('2 subagents (scout, task)');
        expect(task.describeCall({
            context: 'Shared',
            tasks: [{ name: 'Solo', agent: 'scout', task: 'Read A' }],
        })).toBe('Solo');
        expect(task.describeCall({
            context: 'Shared',
            tasks: [{ agent: 'scout', task: 'Read A' }],
        })).toBe('1 subagent (scout)');
        expect(task.describeCall({ agent: 'scout', task: 'Inspect auth' })).toBe('Inspect auth');
    });

    test('taskSummary and waitSummary report async progress and jobs when results is empty', () => {
        const task = toolPresentation('task');
        expect(task.describeResult({
            results: [],
            progress: [{ id: 'a1', agent: 'scout', status: 'running' }, { id: 'a2', agent: 'task', status: 'pending' }],
            async: { state: 'running', jobId: 'a1', type: 'task' },
        })).toBe('2 subagents · running');
        expect(task.describeResult({
            results: [],
            progress: [{ id: 'a1', agent: 'scout', status: 'failed' }],
            async: { state: 'failed', jobId: 'a1', type: 'task' },
        })).toBe('1 subagent · failed');
        expect(task.describeResult({
            results: [{ id: 'a1' }, { id: 'a2' }],
        })).toBe('2 subagents');

        const wait = toolPresentation('wait');
        expect(wait.describeCall({ i: 'Waiting for scouts...' })).toBe('Waiting for scouts');
        expect(wait.describeResult({
            op: 'wait',
            jobs: [{ id: 'j1', status: 'running' }, { id: 'j2', status: 'completed' }],
        })).toBe('2 jobs (1 running)');
        expect(wait.describeResult({ op: 'wait', jobs: [], interrupted: true })).toBe('interrupted');
    });

    test('describeTaskResultWithSubagents prefers authoritative store and report statuses over frozen spawn details', () => {
        const frozenRunning = {
            results: [],
            progress: [{ id: 'BetaWorker-3', agent: 'task', status: 'running' }],
            async: { state: 'running', jobId: 'BetaWorker-3', type: 'task' },
        };
        expect(describeTaskResultWithSubagents(
            frozenRunning,
            [{ id: 'BetaWorker-3', status: 'cancelled' }],
        )).toBe('1 subagent · cancelled');

        const batchFrozen = {
            results: [],
            progress: [
                { id: 'AlphaScout', agent: 'scout', status: 'running' },
                { id: 'BetaWorker-2', agent: 'task', status: 'pending' },
            ],
            async: { state: 'running', jobId: 'AlphaScout', type: 'task' },
        };
        expect(describeTaskResultWithSubagents(
            batchFrozen,
            [
                { id: 'AlphaScout', status: 'completed' },
                { id: 'BetaWorker-2', status: 'running' },
            ],
        )).toBe('2 subagents · running');
        expect(describeTaskResultWithSubagents(
            batchFrozen,
            [
                { id: 'AlphaScout', status: 'completed' },
                { id: 'BetaWorker-2', status: 'completed' },
            ],
        )).toBe('2 subagents · completed');
        expect(describeTaskResultWithSubagents(
            batchFrozen,
            [],
            new Map([['AlphaScout', 'completed'], ['BetaWorker-2', 'failed']]),
        )).toBe('2 subagents · failed');
        expect(describeTaskResultWithSubagents(
            batchFrozen,
            [],
            new Map([['AlphaScout', 'completed']]),
        )).toBe('2 subagents · running');
        expect(describeTaskResultWithSubagents(
            { results: [{ id: 'a1' }, { id: 'a2' }] },
            [{ id: 'a1', status: 'running' }],
        )).toBe('2 subagents');
    });

    test('vibe_* tools describe OMP 19.1 inputs and details accurately', () => {
        const spawn = toolPresentation('vibe_spawn');
        expect(spawn.describeCall({ cli: 'fast', name: 'home-disk-usage', prompt: 'Check /home usage' })).toBe('fast · home-disk-usage');
        expect(spawn.describeCall({ cli: 'good', prompt: 'Inspect auth\nLine two' })).toBe('good · Inspect auth');
        expect(spawn.describeResult({
            op: 'spawn',
            screens: [],
            spawned: { id: 'home-disk-usage', cli: 'fast', jobId: 'job-1' },
        })).toBe('home-disk-usage · fast');

        const send = toolPresentation('vibe_send');
        expect(send.describeCall({ session: 'home-disk-usage', message: 'Check /var too\nThen summarize' })).toBe('→ home-disk-usage · Check /var too');
        expect(send.describeResult({
            op: 'send',
            screens: [],
            send: { id: 'home-disk-usage', mode: 'steered' },
        })).toBe('home-disk-usage · steered');

        const wait = toolPresentation('vibe_wait');
        expect(wait.describeCall({ sessions: ['worker-a', 'worker-b'], timeout: 30 })).toBe('worker-a, worker-b');
        expect(wait.describeCall({ timeout: 45 })).toBe('45s');
        expect(wait.describeResult({
            op: 'wait',
            screens: [],
            wait: {
                settled: [{ id: 'worker-a', jobId: 'j1', status: 'completed' }],
                stillRunning: ['worker-b'],
                timedOut: true,
            },
        })).toBe('1 settled · 1 running · timed out');

        const kill = toolPresentation('vibe_kill');
        expect(kill.describeCall({ session: 'worker-a' })).toBe('worker-a');
        expect(kill.describeResult({
            op: 'kill',
            screens: [],
            killed: { id: 'worker-a', cancelledTurn: true },
        })).toBe('worker-a · killed · cancelled turn');
        expect(kill.describeResult({
            op: 'kill',
            screens: [],
            killed: { id: 'worker-b', cancelledTurn: false },
        })).toBe('worker-b · killed');

        const list = toolPresentation('vibe_list');
        expect(list.describeCall({})).toBe('');
        expect(list.describeResult({
            op: 'list',
            screens: [
                { id: 'w1', cli: 'fast', state: 'running', turns: 1, queued: 0, trace: [], outputTail: [] },
                { id: 'w2', cli: 'good', state: 'idle', turns: 2, queued: 0, trace: [], outputTail: [] },
            ],
        })).toBe('2 sessions · 1 active');
        expect(list.describeResult({ op: 'list', screens: [] })).toBe('0 sessions');
    });

    test('yield, think, new_context, report_issue, glob, generate_image, and openchamber_usage presentations match OMP 19.1 shapes', () => {
        const yieldTool = toolPresentation('yield');
        expect(yieldTool.describeCall({ type: ['findings', 'summary'], data: { ok: true } })).toBe('findings, summary');
        expect(yieldTool.describeCall({ key: 2, data: 'done' })).toBe('#2');
        expect(yieldTool.describeResult({ status: 'success', type: 'summary' })).toBe('success · summary');

        const think = toolPresentation('think');
        expect(think.describeCall({ thoughts: 'First check the lock\nThen verify callers' })).toBe('First check the lock');
        expect(think.describeResult({ recorded: true })).toBe('recorded');

        const newContext = toolPresentation('new_context');
        expect(newContext.describeCall({})).toBeNull();
        expect(newContext.describeResult({ requested: true })).toBe('requested');

        const reportIssue = toolPresentation('report_issue');
        expect(reportIssue.describeCall({ report: 'grep: misses multiline matches\nwith CRLF' })).toBe('grep: misses multiline matches');

        const glob = toolPresentation('glob');
        expect(glob.describeCall({ pattern: '*.ts', path: 'packages/ui' })).toBe('*.ts in packages/ui');
        expect(glob.describeCall({ path: 'packages/ui/*.ts' })).toBe('packages/ui/*.ts');

        const generateImage = toolPresentation('generate_image');
        expect(generateImage.describeCall({ subject: 'Mountain sunrise', action: 'glowing' })).toBe('Mountain sunrise');
        expect(generateImage.describeResult({
            provider: 'openai',
            model: 'gpt-image-1',
            imageCount: 2,
            imagePaths: ['/tmp/1.png', '/tmp/2.png'],
        })).toBe('2 images · openai/gpt-image-1');

        const usage = toolPresentation('openchamber_usage');
        expect(usage.label).toBe('Usage');
        expect(usage.icon).toBe('bar-chart');
        expect(usage.describeCall({ action: 'usage.read', input: { providerId: 'claude' } })).toBe('usage.read: claude');
        expect(usage.describeResult({ providers: [] })).toBe('1 fields');
    });

    test('subagent linking, raw input suppression, and flat scalar row helpers', () => {
        expect(isSubagentTool('task')).toBe(true);
        expect(isSubagentTool('vibe_spawn')).toBe(false);
        expect(isVibeSubagentTool('vibe_spawn')).toBe(true);
        expect(isVibeSubagentTool('runtime.vibe_spawn:1')).toBe(true);
        expect(isVibeSubagentTool('task')).toBe(false);

        for (const name of [
            'vibe_spawn', 'vibe_send', 'vibe_wait', 'vibe_kill', 'vibe_list',
            'task', 'wait', 'todo', 'ast_edit', 'retain', 'recall', 'reflect',
            'learn', 'memory_edit', 'generate_image', 'yield', 'think',
            'report_issue', 'resolve', 'reject', 'propose', 'checkpoint',
            'rewind', 'goal', 'debug', 'github', 'security_scan', 'new_context',
        ]) {
            expect(`${name}: ${isRawInputSuppressedTool(name)}`).toBe(`${name}: true`);
        }
        expect(isRawInputSuppressedTool('bash')).toBe(false);
        expect(isRawInputSuppressedTool('mcp__github_get_issue')).toBe(false);

        expect(flatScalarInputRows({ repo: 'owner/name', limit: 25, draft: false, i: 'ignored' })).toEqual([
            { key: 'repo', value: 'owner/name' },
            { key: 'limit', value: '25' },
            { key: 'draft', value: 'false' },
        ]);
        expect(flatScalarInputRows({ i: 'only intent' })).toBeNull();
        expect(flatScalarInputRows({ nested: { a: 1 } })).toBeNull();
        expect(flatScalarInputRows({ list: ['a'] })).toBeNull();
        expect(flatScalarInputRows({})).toBeNull();
    });
});
