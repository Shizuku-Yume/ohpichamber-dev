import { act } from 'react';
import { describe, expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { JsonValue, Subagent } from '@openchamber/agent-contract';

import { I18nProvider } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { VibeToolCard, type VibeToolCardProps } from './VibeToolCard';

const PARENT_SESSION_ID = 'parent-vibe-session';
const WORKSPACE_DIR = '/workspace/vibe-test';

const makeSubagent = (overrides: Partial<Subagent> & { subagentId: string; role: string }): Subagent => ({
    parentSessionId: PARENT_SESSION_ID,
    status: 'running',
    ...overrides,
});

async function withCardHarness(
    run: (harness: {
        container: HTMLElement;
        renderCard: (props: VibeToolCardProps) => Promise<void>;
    }) => Promise<void>,
) {
    const happyWindow = new Window({ url: 'http://localhost' });
    const globals = {
        window: happyWindow,
        document: happyWindow.document,
        navigator: happyWindow.navigator,
        localStorage: happyWindow.localStorage,
        customElements: happyWindow.customElements,
        Node: happyWindow.Node,
        Text: happyWindow.Text,
        NodeList: happyWindow.NodeList,
        Window: happyWindow.Window,
        Event: happyWindow.Event,
        CustomEvent: happyWindow.CustomEvent,
        Element: happyWindow.Element,
        HTMLElement: happyWindow.HTMLElement,
        HTMLButtonElement: happyWindow.HTMLButtonElement,
        SVGElement: happyWindow.SVGElement,
        requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
        cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
        getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
        ResizeObserver: happyWindow.ResizeObserver,
        MutationObserver: happyWindow.MutationObserver,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const descriptors = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(globals)) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }

    const previousUI = useUIStore.getState();
    const previousSelection = useSessionUIStore.getState();
    const previousSubagents = useSubagentsStore.getState();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderCard = async (props: VibeToolCardProps) => {
        await act(async () => {
            root.render(
                <I18nProvider>
                    <VibeToolCard {...props} />
                </I18nProvider>,
            );
        });
    };

    try {
        useUIStore.setState({ contextPanelByDirectory: {} });
        useSessionUIStore.setState({ currentSessionId: PARENT_SESSION_ID, currentSessionDirectory: WORKSPACE_DIR });
        useSubagentsStore.getState().resetForRuntimeSwitch();
        await run({ container, renderCard });
    } finally {
        await act(async () => {
            root.unmount();
        });
        useUIStore.setState(previousUI);
        useSessionUIStore.setState(previousSelection);
        useSubagentsStore.setState(previousSubagents);
        await happyWindow.happyDOM.abort();
        for (const [name, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    }
}

describe('VibeToolCard', () => {
    test('renders vibe_spawn with cli pill, name, collapsible prompt (>4 lines), spawned footer, and OpenSubtaskButton even when screens is empty', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            useSubagentsStore.getState().setSubagents(PARENT_SESSION_ID, [
                makeSubagent({
                    subagentId: 'sub-1',
                    toolCallId: 'call-spawn-1',
                    name: 'home-disk-usage',
                    role: 'sonic',
                    childSessionId: 'child-session-disk',
                }),
            ]);

            const multiLinePrompt = 'Line 1 inspect\nLine 2 du -sh\nLine 3 sort\nLine 4 filter\nLine 5 summarize';
            const details: JsonValue = {
                op: 'spawn',
                screens: [],
                spawned: {
                    id: 'home-disk-usage',
                    cli: 'fast',
                    jobId: 'job-vibe-1',
                },
            };

            await renderCard({
                toolName: 'vibe_spawn',
                toolCallId: 'call-spawn-1',
                sessionId: PARENT_SESSION_ID,
                directory: WORKSPACE_DIR,
                input: {
                    cli: 'fast',
                    name: 'home-disk-usage',
                    prompt: multiLinePrompt,
                },
                details,
                outputText: 'Spawned fast session `home-disk-usage` (turn job `job-vibe-1`).',
            });

            const text = container.textContent ?? '';
            expect(text).toContain('[fast]');
            expect(text).toContain('home-disk-usage');
            expect(text).toContain('Line 1 inspect');
            expect(text).not.toContain('Line 5 summarize');
            expect(text).toContain('Job job-vibe-1');
            expect(text).not.toContain('"prompt"');
            expect(text).not.toContain('{');

            const showMore = container.querySelector('[data-testid="vibe-prompt-block"] button');
            expect(showMore).not.toBeNull();
            await act(async () => {
                showMore?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            });
            expect(container.textContent).toContain('Line 5 summarize');

            const openBtn = container.querySelector('button[aria-label="Open sonic subtask"]');
            expect(openBtn).not.toBeNull();
            await act(async () => {
                openBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            });
            expect(useSessionUIStore.getState().currentSessionId).toBe(PARENT_SESSION_ID);
            expect(useUIStore.getState().contextPanelByDirectory[WORKSPACE_DIR]?.tabs).toMatchObject([
                { mode: 'chat', dedupeKey: 'session:child-session-disk', label: 'home-disk-usage', readOnly: true },
            ]);
        });
    });

    test('renders vibe_send with target pill, quoted message, and delivery mode footer', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            await renderCard({
                toolName: 'vibe_send',
                toolCallId: 'call-send-1',
                sessionId: PARENT_SESSION_ID,
                directory: WORKSPACE_DIR,
                input: {
                    session: 'worker-alpha',
                    message: 'Please check /var/log too',
                },
                details: {
                    op: 'send',
                    screens: [],
                    send: {
                        id: 'worker-alpha',
                        mode: 'steered',
                    },
                },
            });

            const text = container.textContent ?? '';
            expect(text).toContain('→');
            expect(text).toContain('worker-alpha');
            expect(text).toContain('Please check /var/log too');
            expect(text).toContain('steered');
            expect(text).not.toContain('"message"');
            expect(text).not.toContain('{');
        });
    });

    test('renders vibe_wait TV-wall screens with statuses, collapsible trace/outputTail, settled rows, stillRunning chips, timedOut badge, and SubagentsPanel button', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            useSubagentsStore.getState().setSubagents(PARENT_SESSION_ID, [
                makeSubagent({
                    subagentId: 'sub-worker-1',
                    name: 'worker-1',
                    role: 'task',
                    childSessionId: 'child-sess-1',
                }),
            ]);

            await renderCard({
                toolName: 'vibe_wait',
                toolCallId: 'call-wait-1',
                sessionId: PARENT_SESSION_ID,
                directory: WORKSPACE_DIR,
                input: {
                    sessions: ['worker-1', 'worker-2', 'worker-3'],
                    timeout: 30,
                },
                details: {
                    op: 'wait',
                    screens: [
                        {
                            id: 'worker-1',
                            cli: 'good',
                            state: 'running',
                            turns: 2,
                            queued: 1,
                            currentTool: 'grep',
                            currentToolArgs: 'pattern="TODO"',
                            lastIntent: 'Searching TODO markers',
                            trace: ['read src/index.ts:1-40'],
                            outputTail: ['Found 3 matches in src/'],
                            lastActivity: 'grep TODO',
                            lastActivityAt: 1700000000000,
                        },
                        {
                            id: 'worker-2',
                            cli: 'fast',
                            state: 'idle',
                            turns: 1,
                            queued: 0,
                            trace: [],
                            outputTail: [],
                            lastActivity: 'Finished audit',
                            lastActivityAt: 1700000000100,
                        },
                        {
                            id: 'worker-3',
                            cli: 'fast',
                            state: 'dead',
                            turns: 1,
                            queued: 0,
                            trace: [],
                            outputTail: [],
                            lastActivity: 'Errored on missing file',
                            lastActivityAt: 1700000000200,
                        },
                    ],
                    wait: {
                        settled: [
                            { id: 'worker-2', jobId: 'job-2', status: 'completed' },
                            { id: 'worker-3', jobId: 'job-3', status: 'failed' },
                        ],
                        stillRunning: ['worker-1'],
                        timedOut: true,
                    },
                },
            });

            const text = container.textContent ?? '';
            expect(text).toContain('Sessions: worker-1, worker-2, worker-3');
            expect(text).toContain('Timeout: 30s');
            expect(text).toContain('worker-1');
            expect(text).toContain('[good]');
            expect(text).toContain('2 turns');
            expect(text).toContain('1 queued');
            expect(text).toContain('grep: Searching TODO markers');
            expect(text).not.toContain('Found 3 matches in src/');

            const screen1 = container.querySelector('[data-testid="vibe-screen-worker-1"]');
            expect(screen1?.getAttribute('data-screen-state')).toBe('running');
            const traceToggle = screen1?.querySelector('button[aria-expanded="false"]');
            expect(traceToggle).not.toBeNull();
            await act(async () => {
                traceToggle?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            });
            expect(container.textContent).toContain('read src/index.ts:1-40');
            expect(container.textContent).toContain('Found 3 matches in src/');

            expect(container.querySelector('[data-testid="vibe-screen-worker-2"]')?.getAttribute('data-screen-state')).toBe('done');
            expect(container.querySelector('[data-testid="vibe-screen-worker-3"]')?.getAttribute('data-screen-state')).toBe('failed');
            expect(container.querySelector('[data-testid="vibe-wait-settled-worker-2"]')?.textContent).toContain('done');
            expect(container.querySelector('[data-testid="vibe-wait-settled-worker-3"]')?.textContent).toContain('failed');
            expect(container.querySelector('[data-testid="vibe-wait-running-worker-1"]')?.textContent).toContain('worker-1');
            expect(container.querySelector('[data-testid="vibe-wait-timeout-badge"]')?.textContent).toContain('timed out');

            expect(container.querySelector('button[aria-label="Open task subtask"]')).not.toBeNull();

            const panelButton = Array.from(container.querySelectorAll('button')).find((btn) =>
                btn.textContent?.includes('Open in the Subagents panel'),
            );
            expect(panelButton).toBeDefined();
            await act(async () => {
                panelButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            });
            expect(useUIStore.getState().contextPanelByDirectory[WORKSPACE_DIR]?.tabs).toContainEqual(
                expect.objectContaining({ mode: 'subagents' }),
            );
        });
    });

    test('renders vibe_wait output text with settled worker results below the rows', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            await renderCard({
                toolName: 'vibe_wait',
                toolCallId: 'call-wait-results',
                sessionId: PARENT_SESSION_ID,
                directory: WORKSPACE_DIR,
                input: { sessions: ['worker-1', 'worker-2'] },
                details: {
                    op: 'wait',
                    screens: [
                        {
                            id: 'worker-1',
                            cli: 'good',
                            state: 'idle',
                            turns: 3,
                            queued: 0,
                            trace: [],
                            outputTail: [],
                        },
                    ],
                    wait: {
                        settled: [
                            { id: 'worker-1', jobId: 'job-1', status: 'completed' },
                            { id: 'worker-2', jobId: 'job-2', status: 'completed' },
                        ],
                        stillRunning: [],
                        timedOut: false,
                    },
                },
                outputText: '## `worker-1` — completed\n\nThe disk audit found 3 large directories.\n\n## `worker-2` — completed\n\nLog scan finished cleanly.',
            });

            const output = container.querySelector('[data-testid="vibe-fallback-output"]');
            expect(output).not.toBeNull();
            expect(output?.textContent).toContain('The disk audit found 3 large directories.');
            expect(output?.textContent).toContain('Log scan finished cleanly.');
            expect(container.querySelector('[data-testid="vibe-wait-settled-worker-1"]')).not.toBeNull();
        });
    });

    test('tolerates unknown extra keys on details and screens', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            await renderCard({
                toolName: 'vibe_wait',
                toolCallId: 'call-extra-keys',
                sessionId: PARENT_SESSION_ID,
                directory: WORKSPACE_DIR,
                input: {},
                details: {
                    op: 'wait',
                    futureField: { nested: 'value' },
                    screens: [
                        {
                            id: 'worker-future',
                            cli: 'fast',
                            state: 'running',
                            turns: 1,
                            queued: 0,
                            trace: [],
                            outputTail: [],
                            futureScreenKey: 'ignored',
                        },
                    ],
                },
            });

            expect(container.querySelector('[data-testid="vibe-screen-worker-future"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="vibe-screen-worker-future"]')?.getAttribute('data-screen-state')).toBe('running');
            expect(container.textContent).not.toContain('futureField');
        });
    });

    test('renders vibe_kill with cancelledTurn badge', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            await renderCard({
                toolName: 'vibe_kill',
                toolCallId: 'call-kill-1',
                input: { session: 'worker-x' },
                details: {
                    op: 'kill',
                    screens: [],
                    killed: {
                        id: 'worker-x',
                        cancelledTurn: true,
                    },
                },
            });

            expect(container.querySelector('[data-testid="vibe-kill-footer"]')?.textContent).toContain('worker-x');
            expect(container.querySelector('[data-testid="vibe-kill-cancelled-turn"]')?.textContent).toContain('cancelled turn');
            expect(container.textContent).not.toContain('{');
        });
    });

    test('renders vibe_list with killed screen state and hiddenKilled count note', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            await renderCard({
                toolName: 'vibe_list',
                toolCallId: 'call-list-1',
                input: {},
                details: {
                    op: 'list',
                    screens: [
                        {
                            id: 'worker-killed',
                            cli: 'fast',
                            state: 'dead',
                            killed: true,
                            turns: 1,
                            queued: 0,
                            trace: [],
                            outputTail: [],
                            lastActivity: 'Stopped',
                            lastActivityAt: 1700000000300,
                        },
                    ],
                    hiddenKilled: ['old-1', 'old-2'],
                },
            });

            expect(container.querySelector('[data-testid="vibe-screen-worker-killed"]')?.getAttribute('data-screen-state')).toBe('killed');
            expect(container.querySelector('[data-testid="vibe-list-hidden-killed"]')?.textContent).toContain('2 killed sessions hidden');
        });
    });

    test('tolerates partial streaming details and falls back gracefully on malformed details without throwing', async () => {
        await withCardHarness(async ({ container, renderCard }) => {
            await renderCard({
                toolName: 'vibe_wait',
                toolCallId: 'call-partial',
                input: {},
                details: {
                    op: 'wait',
                    wait: {
                        waiting: true,
                    },
                },
            });
            expect(container.textContent).toContain('Watching worker sessions');

            await renderCard({
                toolName: 'vibe_spawn',
                toolCallId: 'call-malformed',
                input: { cli: 'fast', name: 'bad-details', prompt: 'Clean prompt text' },
                details: { unexpected: 'shape', screens: 'not-an-array' },
                outputText: 'Fallback human summary',
            });
            expect(container.textContent).toContain('Clean prompt text');
            expect(container.textContent).toContain('Fallback human summary');
            expect(container.textContent).not.toContain('"prompt"');
            expect(container.textContent).not.toContain('"unexpected"');
        });
    });
});
