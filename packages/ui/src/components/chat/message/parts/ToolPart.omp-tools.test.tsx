import { act } from 'react';
import { describe, expect, spyOn, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session, Subagent, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';

import { canonicalClient } from '@/api/canonicalClient';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { useGuestsStore } from '@/lib/guests/store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';

plugin({
    name: 'tool-omp-worker-url',
    setup(build) {
        build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
            contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`,
            loader: 'js',
        }));
    },
});

// Loaded after the worker URL plugin registration above; a static import would
// resolve the Vite-only asset query before Bun can map it.
const { default: ToolPart } = await import('./ToolPart');

const unexpectedThemeChange = (): never => {
    throw new Error('Rendering must not change the theme');
};
const theme = getDefaultTheme(false);
const themeContext: ThemeContextValue = {
    currentTheme: theme,
    availableThemes: [theme],
    setTheme: unexpectedThemeChange,
    customThemesLoading: false,
    reloadCustomThemes: unexpectedThemeChange,
    importTheme: unexpectedThemeChange,
    deleteImportedTheme: unexpectedThemeChange,
    customThemeIds: [],
    isSystemPreference: false,
    setSystemPreference: unexpectedThemeChange,
    themeMode: 'light',
    setThemeMode: unexpectedThemeChange,
    lightThemeId: theme.metadata.id,
    darkThemeId: getDefaultTheme(true).metadata.id,
    setLightThemePreference: unexpectedThemeChange,
    setDarkThemePreference: unexpectedThemeChange,
};

const PARENT_SESSION: Session = {
    sessionId: 'omp-parent',
    rootSessionId: 'omp-parent',
    projectId: 'project',
    workspaceId: 'workspace',
    displayPath: 'workspace',
    createdAt: 1,
    updatedAt: 1,
    epoch: 'epoch',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    archivedAt: undefined,
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
};

const WORKSPACE_DIR = '/workspace/omp-tools';

async function withToolPartHarness(
    loadSubagents: (sessionId: string) => Promise<Subagent[]>,
    run: (harness: {
        container: HTMLElement;
        renderPart: (part: ToolCallPart | ToolResultPart, options?: { pairedCall?: ToolCallPart; expanded?: boolean }) => Promise<void>;
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
        Element: happyWindow.Element,
        HTMLElement: happyWindow.HTMLElement,
        HTMLButtonElement: happyWindow.HTMLButtonElement,
        SVGElement: happyWindow.SVGElement,
        ShadowRoot: happyWindow.ShadowRoot,
        Document: happyWindow.Document,
        DocumentFragment: happyWindow.DocumentFragment,
        Range: happyWindow.Range,
        CSSStyleSheet: happyWindow.CSSStyleSheet,
        Event: happyWindow.Event,
        CustomEvent: happyWindow.CustomEvent,
        requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
        cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
        getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
        ResizeObserver: happyWindow.ResizeObserver,
        MutationObserver: happyWindow.MutationObserver,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(globals)) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }

    const previousGlobal = useGlobalSessionsStore.getState();
    const previousUI = useUIStore.getState();
    const previousSelection = useSessionUIStore.getState();
    const previousGuests = useGuestsStore.getState();
    const previousProjects = useProjectsStore.getState();
    const previousDirectory = useDirectoryStore.getState().currentDirectory;
    const previousSubagents = useSubagentsStore.getState();
    const listSpy = spyOn(canonicalClient, 'listSubagents').mockImplementation(loadSubagents);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderPart = async (
        part: ToolCallPart | ToolResultPart,
        options: { pairedCall?: ToolCallPart; expanded?: boolean } = {},
    ) => {
        await act(async () => {
            root.render(
                <SyncProvider directory="">
                    <I18nProvider>
                        <ThemeSystemContext.Provider value={themeContext}>
                            <ToolPart
                                part={part}
                                pairedCall={options.pairedCall}
                                sessionId={PARENT_SESSION.sessionId}
                                directory={WORKSPACE_DIR}
                                isExpanded={options.expanded ?? true}
                                isMobile={false}
                                onToggle={() => { }}
                            />
                        </ThemeSystemContext.Provider>
                    </I18nProvider>
                </SyncProvider>,
            );
        });
    };

    try {
        registerWorkspaceDirectory(PARENT_SESSION.workspaceId, WORKSPACE_DIR);
        useGlobalSessionsStore.getState().applySnapshot([PARENT_SESSION], []);
        useGuestsStore.setState({ status: 'ready', guests: [], runtimeKey: 'test' });
        useProjectsStore.setState({
            projects: [{ id: PARENT_SESSION.projectId, path: WORKSPACE_DIR }],
            activeProjectId: PARENT_SESSION.projectId,
        });
        useDirectoryStore.setState({ currentDirectory: WORKSPACE_DIR });
        useUIStore.setState({ contextPanelByDirectory: {} });
        useSessionUIStore.setState({ currentSessionId: PARENT_SESSION.sessionId, currentSessionDirectory: WORKSPACE_DIR });
        useSubagentsStore.getState().resetForRuntimeSwitch();
        await run({ container, renderPart });
    } finally {
        await act(async () => {
            root.unmount();
        });
        listSpy.mockRestore();
        useGlobalSessionsStore.setState(previousGlobal);
        useUIStore.setState(previousUI);
        useSessionUIStore.setState(previousSelection);
        useGuestsStore.setState(previousGuests);
        useProjectsStore.setState(previousProjects);
        useDirectoryStore.setState({ currentDirectory: previousDirectory });
        useSubagentsStore.setState(previousSubagents);
        await happyWindow.happyDOM.abort();
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    }
}

describe('ToolPart OMP 19.1 tool wiring', () => {
    test('vibe_spawn renders header OpenSubtaskButton, opens child tab on click, and renders VibeToolCard without raw JSON', async () => {
        const subagent: Subagent = {
            subagentId: 'home-disk-usage',
            parentSessionId: PARENT_SESSION.sessionId,
            childSessionId: 'vibe-child-disk-session',
            toolCallId: 'call-vibe-spawn',
            name: 'home-disk-usage',
            role: 'sonic',
            status: 'running',
        };

        await withToolPartHarness(async () => [subagent], async ({ container, renderPart }) => {
            const call: ToolCallPart = {
                type: 'tool_call',
                partId: 'part-vibe-spawn-call',
                toolCallId: 'call-vibe-spawn',
                toolName: 'vibe_spawn',
                status: 'completed',
                input: {
                    cli: 'fast',
                    name: 'home-disk-usage',
                    prompt: 'Inspect disk usage under /home',
                },
            };
            const result: ToolResultPart = {
                type: 'tool_result',
                partId: 'part-vibe-spawn-res',
                toolCallId: 'call-vibe-spawn',
                toolName: 'vibe_spawn',
                isError: false,
                output: {
                    content: [{ type: 'text', text: 'Spawned fast session `home-disk-usage` (turn job `job-vibe-1`).' }],
                    details: {
                        op: 'spawn',
                        screens: [],
                        spawned: { id: 'home-disk-usage', cli: 'fast', jobId: 'job-vibe-1' },
                    },
                },
            };

            await renderPart(result, { pairedCall: call, expanded: true });

            expect(container.querySelector('[data-testid="vibe-tool-card"]')).not.toBeNull();
            expect(container.querySelector('blockquote.tool-input-text')).toBeNull();
            expect(container.textContent).toContain('Inspect disk usage under /home');
            expect(container.textContent).not.toContain('"prompt"');

            const openButtons = container.querySelectorAll('button[aria-label="Open home-disk-usage subtask"]');
            expect(openButtons.length).toBeGreaterThanOrEqual(2);

            await act(async () => {
                openButtons[0]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            });

            expect(useSessionUIStore.getState().currentSessionId).toBe(PARENT_SESSION.sessionId);
            expect(useUIStore.getState().contextPanelByDirectory[WORKSPACE_DIR]?.tabs).toMatchObject([
                { mode: 'chat', dedupeKey: 'session:vibe-child-disk-session', label: 'home-disk-usage', sessionTitleFallback: 'home-disk-usage', readOnly: true },
            ]);
        });
    });

    test('vibe_send, vibe_wait, vibe_kill, vibe_list, and wait suppress raw JSON and render structured cards', async () => {
        await withToolPartHarness(async () => [], async ({ container, renderPart }) => {
            const sendCall: ToolCallPart = {
                type: 'tool_call',
                partId: 'call-send',
                toolCallId: 'call-send',
                toolName: 'vibe_send',
                status: 'completed',
                input: { session: 'worker-1', message: 'Check logs too' },
            };
            const sendRes: ToolResultPart = {
                type: 'tool_result',
                partId: 'res-send',
                toolCallId: 'call-send',
                toolName: 'vibe_send',
                isError: false,
                output: {
                    content: [{ type: 'text', text: 'Steered worker-1' }],
                    details: { op: 'send', screens: [], send: { id: 'worker-1', mode: 'steered' } },
                },
            };
            await renderPart(sendRes, { pairedCall: sendCall });
            expect(container.querySelector('[data-testid="vibe-tool-card"]')).not.toBeNull();
            expect(container.querySelector('blockquote.tool-input-text')).toBeNull();
            expect(container.textContent).not.toContain('"message"');

            const waitCall: ToolCallPart = {
                type: 'tool_call',
                partId: 'call-omp-wait',
                toolCallId: 'call-omp-wait',
                toolName: 'wait',
                status: 'completed',
                input: {},
            };
            const waitRes: ToolResultPart = {
                type: 'tool_result',
                partId: 'res-omp-wait',
                toolCallId: 'call-omp-wait',
                toolName: 'wait',
                isError: false,
                output: {
                    content: [{ type: 'text', text: '1 job settled.' }],
                    details: {
                        op: 'wait',
                        jobs: [{ id: 'job-1', type: 'bash', status: 'completed', label: 'bun test', durationMs: 1200, exitCode: 0 }],
                    },
                },
            };
            await renderPart(waitRes, { pairedCall: waitCall });
            expect(container.querySelector('[data-testid="wait-tool-card"]')).not.toBeNull();
            expect(container.querySelector('blockquote.tool-input-text')).toBeNull();
            expect(container.textContent).toContain('bun test');
        });
    });

    test('structured card tools and new_context never render raw JSON input blocks in expanded output', async () => {
        await withToolPartHarness(async () => [], async ({ container, renderPart }) => {
            const cases: Array<{ toolName: string; input: ToolCallPart['input']; details?: ToolResultPart['output']; expectText: string }> = [
                {
                    toolName: 'yield',
                    input: { type: 'findings', data: { summary: 'All clear' } },
                    details: { content: [{ type: 'text', text: 'Yielded' }], details: { status: 'success', type: 'findings', data: { summary: 'All clear' } } },
                    expectText: 'All clear',
                },
                {
                    toolName: 'think',
                    input: { thoughts: 'Step-by-step reasoning note' },
                    details: { content: [{ type: 'text', text: '------' }], details: { recorded: true } },
                    expectText: 'Step-by-step reasoning note',
                },
                {
                    toolName: 'report_issue',
                    input: { report: 'Missing edge case in parser' },
                    details: { content: [{ type: 'text', text: 'Reported' }] },
                    expectText: 'Missing edge case in parser',
                },
                {
                    toolName: 'resolve',
                    input: { reason: 'Fix verified cleanly' },
                    details: { content: [{ type: 'text', text: 'Applied' }], details: { action: 'apply', reason: 'Fix verified cleanly' } },
                    expectText: 'Fix verified cleanly',
                },
                {
                    toolName: 'goal',
                    input: { op: 'status', objective: 'Ship UX fixes' },
                    details: { content: [{ type: 'text', text: 'Active' }], details: { op: 'status', goal: { id: 'g-1', objective: 'Ship UX fixes', status: 'active', tokensUsed: 120, timeUsedSeconds: 5 } } },
                    expectText: 'Ship UX fixes',
                },
                {
                    toolName: 'new_context',
                    input: { handoff: 'Drop transient output' },
                    details: { content: [{ type: 'text', text: 'New context scheduled' }], details: { requested: true } },
                    expectText: 'New context scheduled',
                },
            ];

            for (const entry of cases) {
                const call: ToolCallPart = {
                    type: 'tool_call',
                    partId: `call-${entry.toolName}`,
                    toolCallId: `id-${entry.toolName}`,
                    toolName: entry.toolName,
                    status: 'completed',
                    input: entry.input,
                };
                const res: ToolResultPart = {
                    type: 'tool_result',
                    partId: `res-${entry.toolName}`,
                    toolCallId: `id-${entry.toolName}`,
                    toolName: entry.toolName,
                    isError: false,
                    output: entry.details,
                };
                await renderPart(res, { pairedCall: call });
                expect(container.querySelector('blockquote.tool-input-text')).toBeNull();
                expect(container.textContent).toContain(entry.expectText);
            }
        });
    });

    test('MCP tool renders flat scalar inputs as key-value rows and falls back to JSON for nested objects', async () => {
        await withToolPartHarness(async () => [], async ({ container, renderPart }) => {
            const flatMcp: ToolCallPart = {
                type: 'tool_call',
                partId: 'mcp-flat',
                toolCallId: 'mcp-flat',
                toolName: 'mcp__github_get_issue',
                status: 'completed',
                input: { owner: 'acme', repo: 'openchamber', issue_number: 42 },
            };
            await renderPart(flatMcp);
            const kv = container.querySelector('[data-testid="tool-input-kv-rows"]');
            expect(kv).not.toBeNull();
            expect(kv?.textContent).toContain('owner');
            expect(kv?.textContent).toContain('acme');
            expect(kv?.textContent).toContain('42');
            expect(container.querySelector('blockquote.tool-input-text')).toBeNull();

            const nestedMcp: ToolCallPart = {
                type: 'tool_call',
                partId: 'mcp-nested',
                toolCallId: 'mcp-nested',
                toolName: 'mcp__github_create_review',
                status: 'completed',
                input: { pull_number: 7, comments: [{ path: 'a.ts', line: 10 }] },
            };
            await renderPart(nestedMcp);
            expect(container.querySelector('[data-testid="tool-input-kv-rows"]')).toBeNull();
            expect(container.querySelector('blockquote.tool-input-text')?.textContent).toContain('"pull_number": 7');
        });
    });

    test('mcp tool result details serverName/mcpToolName label the row header as server: tool', async () => {
        await withToolPartHarness(async () => [], async ({ container, renderPart }) => {
            const call: ToolCallPart = {
                type: 'tool_call',
                partId: 'mcp-details-call',
                toolCallId: 'mcp-details-id',
                toolName: 'mcp__opaque_name',
                status: 'completed',
                input: { query: 'status' },
            };
            const res: ToolResultPart = {
                type: 'tool_result',
                partId: 'mcp-details-res',
                toolCallId: 'mcp-details-id',
                toolName: 'mcp__opaque_name',
                isError: false,
                output: {
                    content: [{ type: 'text', text: 'All systems nominal' }],
                    details: { serverName: 'github', mcpToolName: 'get_issue' },
                },
            };

            await renderPart(res, { pairedCall: call });

            expect(container.querySelector('button[aria-label="github: get_issue"]')).not.toBeNull();
            expect(container.textContent).toContain('github: get_issue');
        });
    });

    test('read, grep, and ast_grep prefer details.displayContent over model-facing hashline text', async () => {
        await withToolPartHarness(async () => [], async ({ container, renderPart }) => {
            const readCall: ToolCallPart = {
                type: 'tool_call',
                partId: 'read-dc-call',
                toolCallId: 'read-dc',
                toolName: 'read',
                status: 'completed',
                input: { path: 'src/app.ts' },
            };
            const readRes: ToolResultPart = {
                type: 'tool_result',
                partId: 'read-dc-res',
                toolCallId: 'read-dc',
                toolName: 'read',
                isError: false,
                output: {
                    content: [{ type: 'text', text: '1#A1|export const hashlineMarker = 1;' }],
                    details: {
                        displayContent: {
                            text: 'export const cleanDisplayLine = 1;',
                            startLine: 1,
                        },
                    },
                },
            };
            await renderPart(readRes, { pairedCall: readCall });
            expect(container.textContent).toContain('export const cleanDisplayLine = 1;');
            expect(container.textContent).not.toContain('1#A1|export const hashlineMarker');

            const grepCall: ToolCallPart = {
                type: 'tool_call',
                partId: 'grep-dc-call',
                toolCallId: 'grep-dc',
                toolName: 'grep',
                status: 'completed',
                input: { pattern: 'cleanDisplayLine' },
            };
            const grepRes: ToolResultPart = {
                type: 'tool_result',
                partId: 'grep-dc-res',
                toolCallId: 'grep-dc',
                toolName: 'grep',
                isError: false,
                output: {
                    content: [{ type: 'text', text: 'src/app.ts:1#Z9:raw hashline match' }],
                    details: {
                        displayContent: 'src/app.ts:1:clean grep display output',
                    },
                },
            };
            await renderPart(grepRes, { pairedCall: grepCall });
            expect(container.textContent).toContain('clean grep display output');
            expect(container.textContent).not.toContain('1#Z9:raw hashline match');

            const astCall: ToolCallPart = {
                type: 'tool_call',
                partId: 'ast-dc-call',
                toolCallId: 'ast-dc',
                toolName: 'ast_grep',
                status: 'completed',
                input: { pat: 'const $X = 1' },
            };
            const astRes: ToolResultPart = {
                type: 'tool_result',
                partId: 'ast-dc-res',
                toolCallId: 'ast-dc',
                toolName: 'ast_grep',
                isError: false,
                output: {
                    content: [{ type: 'text', text: 'src/app.ts:1#Q4:hashline ast match' }],
                    details: {
                        displayContent: 'src/app.ts:1:clean ast_grep display output',
                    },
                },
            };
            await renderPart(astRes, { pairedCall: astCall });
            expect(container.textContent).toContain('clean ast_grep display output');
            expect(container.textContent).not.toContain('1#Q4:hashline ast match');
        });
    });
});
