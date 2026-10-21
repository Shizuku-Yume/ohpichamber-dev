import { act } from 'react';
import { expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import type { ToolPopupContent } from '../types';
import { I18nProvider } from '@/lib/i18n';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useGuestsStore } from '@/lib/guests/store';
import { SyncProvider } from '@/sync/sync-context';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';

plugin({
    name: 'tool-rich-worker-url',
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

const unexpectedThemeChange = (): never => { throw new Error('Rendering must not change the theme'); };
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

const browserGlobals = (happyWindow: Window) => ({
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
});

async function withToolHarness(run: (harness: {
    container: HTMLElement;
    render: (part: ToolCallPart | ToolResultPart, options?: { pairedCall?: ToolCallPart; expanded?: boolean; runtime?: RuntimeAPIs; onToggle?: (id: string) => void; onShowPopup?: (popup: ToolPopupContent) => void }) => Promise<void>;
}) => Promise<void>) {
    const happyWindow = new Window({ url: 'http://localhost' });
    const globals = browserGlobals(happyWindow);
    const previous = Object.keys(globals).map(
        (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
    );
    for (const [name, value] of Object.entries(globals)) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const previousGuests = useGuestsStore.getState();
    const previousDirectory = useDirectoryStore.getState().currentDirectory;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
        useGuestsStore.setState({ status: 'ready', guests: [], runtimeKey: 'test' });
        useDirectoryStore.setState({ currentDirectory: '/project' });
        const render = async (
            part: ToolCallPart | ToolResultPart,
            options: { pairedCall?: ToolCallPart; expanded?: boolean; runtime?: RuntimeAPIs; onToggle?: (id: string) => void; onShowPopup?: (popup: ToolPopupContent) => void } = {},
        ) => {
            await act(async () => {
                root.render(
                    <SyncProvider directory="">
                        <I18nProvider>
                            <ThemeSystemContext.Provider value={themeContext}>
                                <RuntimeAPIContext.Provider value={options.runtime ?? null}>
                                    <ToolPart
                                        part={part}
                                        pairedCall={options.pairedCall}
                                        isExpanded={options.expanded ?? false}
                                        isMobile={false}
                                        onToggle={options.onToggle ?? (() => {})}
                                        onShowPopup={options.onShowPopup}
                                    />
                                </RuntimeAPIContext.Provider>
                            </ThemeSystemContext.Provider>
                        </I18nProvider>
                    </SyncProvider>,
                );
            });
        };
        await run({ container, render });
    } finally {
        await act(async () => { root.unmount(); });
        useGuestsStore.setState(previousGuests);
        useDirectoryStore.setState({ currentDirectory: previousDirectory });
        await happyWindow.happyDOM.abort();
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    }
}

const editCall = (input: ToolCallPart['input']): ToolCallPart => ({
    type: 'tool_call', partId: 'edit-call', toolCallId: 'edit-call', toolName: 'edit', input, status: 'completed',
});

const editResult = (diff: string, isError = false): ToolResultPart => ({
    type: 'tool_result', partId: 'edit-result', toolCallId: 'edit-call', toolName: 'edit', isError,
    output: { content: [{ type: 'text', text: isError ? 'Cannot edit src/a.ts' : 'Updated src/a.ts' }], details: { path: '/project/src/a.ts', diff } },
    error: isError ? 'Permission denied' : undefined,
});

const sentinelEditResult = (path: string): ToolResultPart => ({
    type: 'tool_result', partId: 'edit-result', toolCallId: 'edit-call', toolName: 'edit', isError: false,
    output: { content: [{ type: 'text', text: `Updated ${path}` }], details: { path, diff: '-1|old\n+1|new' } },
});

const runtimeForEditor = (openFile: (path: string, line?: number) => Promise<void>): RuntimeAPIs => {
    const unexpected = (): never => { throw new Error('File navigation must only use the editor'); };
    return {
        runtime: { platform: 'web', isDesktop: false },
        get terminal() { return unexpected(); },
        get git() { return unexpected(); },
        get sourceControl() { return unexpected(); },
        get files() { return unexpected(); },
        get settings() { return unexpected(); },
        get permissions() { return unexpected(); },
        get notifications() { return unexpected(); },
        editor: { openFile, openDiff: async () => {} },
    };
};

test('a paired completed edit renders its diff and opens the output dialog', async () => {
    const popups: ToolPopupContent[] = [];
    await withToolHarness(async ({ container, render }) => {
        const call = editCall({ path: 'NOTES.md' });
        await render(editResult('-3|old\n+3|new'), {
            pairedCall: call,
            expanded: true,
            onShowPopup: (popup) => { popups.push(popup); },
        });

        expect(container.textContent).toContain('+1/-1');
        expect(container.textContent).toContain('src/a.ts');
        const external = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label="edit"]'))
            .filter((button) => button.querySelector('use[href="#oc-external-link"]'));
        const trigger = external.at(-1);
        if (!trigger) throw new Error('Expected the output dialog trigger');
        await act(async () => { trigger.click(); });
        expect(popups).toHaveLength(1);
        expect(popups[0]?.open).toBe(true);
        expect(popups[0]?.content).toContain('old');
        expect(popups[0]?.content).toContain('new');
        expect(popups[0]?.toolName).toBe('edit');
        expect(popups[0]?.input).toEqual(call.input);
    });
});

test('a mismatched call never lends its input to a result, and quick-open uses the result diff line', async () => {
    const opened: Array<{ path: string; line?: number }> = [];
    const runtime = runtimeForEditor(async (path, line) => { opened.push({ path, line }); });

    await withToolHarness(async ({ container, render }) => {
        const spoofed = editCall({ path: 'spoofed.ts' });
        spoofed.toolCallId = 'another-call';
        await render(editResult('-11|old\n+11|new'), { pairedCall: spoofed, expanded: true, runtime });

        expect(container.textContent).toContain('src/a.ts');
        expect(container.textContent).not.toContain('spoofed.ts');
        expect(container.textContent).toContain('+1/-1');

        const quickOpen = container.querySelector<HTMLButtonElement>('button[aria-label="Open file"]');
        if (!quickOpen) throw new Error('Expected the file quick-open action');
        await act(async () => { quickOpen.click(); });
        expect(opened).toEqual([{ path: '/project/src/a.ts', line: 11 }]);
    });
});

test('a sanitized workspace result path labels the relative file and opens the real workspace path', async () => {
    const opened: Array<{ path: string; line?: number }> = [];
    const runtime = runtimeForEditor(async (path, line) => { opened.push({ path, line }); });

    await withToolHarness(async ({ container, render }) => {
        await render(sentinelEditResult('[workspace]/NOTES.md'), {
            pairedCall: editCall({ path: '[workspace]/NOTES.md' }),
            expanded: true,
            runtime,
        });

        const headerPath = container.querySelector('[title="NOTES.md"]');
        expect(headerPath?.textContent).toContain('NOTES.md');
        expect(container.querySelector('[title="[workspace]/NOTES.md"]')).toBeNull();

        const quickOpen = container.querySelector<HTMLButtonElement>('button[aria-label="Open file"]');
        if (!quickOpen) throw new Error('Expected the file quick-open action');
        await act(async () => { quickOpen.click(); });
        expect(opened).toEqual([{ path: '/project/NOTES.md', line: 1 }]);
    });
});

test('quick-open on a sanitized path hands the real absolute path to the Web context file action', async () => {
    const previous = useUIStore.getState();
    try {
        await withToolHarness(async ({ container, render }) => {
            await render(sentinelEditResult('[workspace]/NOTES.md'), {
                pairedCall: editCall({ path: '[workspace]/NOTES.md' }),
            });

            const quickOpen = container.querySelector<HTMLButtonElement>('button[aria-label="Open file"]');
            if (!quickOpen) throw new Error('Expected the file quick-open action');
            await act(async () => { quickOpen.click(); });

            expect(useUIStore.getState().pendingFileNavigation).toEqual({ path: '/project/NOTES.md', line: 1, column: 1 });
            const tabs = useUIStore.getState().contextPanelByDirectory['/project']?.tabs ?? [];
            expect(tabs.some((tab) => tab.mode === 'file' && tab.targetPath === '/project/NOTES.md')).toBe(true);
            expect(tabs.some((tab) => tab.targetPath?.includes('[workspace]'))).toBe(false);
        });
    } finally {
        useUIStore.setState({
            contextPanelByDirectory: previous.contextPanelByDirectory,
            pendingFileNavigation: previous.pendingFileNavigation,
            pendingFileFocusPath: previous.pendingFileFocusPath,
            contextEditorVisible: previous.contextEditorVisible,
        });
    }
});

test('a sentinel target that re-normalizes to another root offers no file action', async () => {
    await withToolHarness(async ({ container, render }) => {
        await render(sentinelEditResult('[workspace]//etc/passwd'), {
            pairedCall: editCall({ path: '[workspace]//etc/passwd' }),
            expanded: true,
        });

        expect(container.querySelector('button[aria-label="Open file"]')).toBeNull();
        expect(container.querySelector('button[aria-label="Open file at first change"]')).toBeNull();
    });
});

test('a sanitized traversal path offers no file action instead of escaping the workspace', async () => {
    const opened: Array<{ path: string; line?: number }> = [];
    const runtime = runtimeForEditor(async (path, line) => { opened.push({ path, line }); });

    await withToolHarness(async ({ container, render }) => {
        await render(sentinelEditResult('[workspace]/../outside.md'), {
            pairedCall: editCall({ path: '[workspace]/../outside.md' }),
            expanded: true,
            runtime,
        });

        expect(container.querySelector('button[aria-label="Open file"]')).toBeNull();
        expect(container.querySelector('button[aria-label="Open file at first change"]')).toBeNull();
        expect(opened).toEqual([]);
    });
});

test('an error result reports its message without pretending a diff was performed', async () => {
    await withToolHarness(async ({ container, render }) => {
        const call = editCall({ path: 'src/a.ts' });
        await render(editResult('-10|old\n+11|new', true), { pairedCall: call, expanded: true });

        expect(container.textContent).toContain('Permission denied');
        expect(container.textContent).toContain('Cannot edit src/a.ts');
        expect(container.textContent).not.toContain('+1/-1');
    });
});

test('a native read selector opens the file at its offset without showing the selector as the path', async () => {
    const opened: Array<{ path: string; line?: number }> = [];
    const runtime = runtimeForEditor(async (path, line) => { opened.push({ path, line }); });
    const call: ToolCallPart = {
        type: 'tool_call', partId: 'read-call', toolCallId: 'read-call', toolName: 'read',
        input: { path: 'src/a.ts:50-100' }, status: 'completed',
    };
    const result: ToolResultPart = {
        type: 'tool_result', partId: 'read-result', toolCallId: 'read-call', toolName: 'read',
        output: { content: [{ type: 'text', text: '50|line fifty' }] }, isError: false,
    };

    await withToolHarness(async ({ container, render }) => {
        await render(result, { pairedCall: call, expanded: true, runtime });
        const headerPath = container.querySelector('[title="src/a.ts"]');
        expect(headerPath).not.toBeNull();
        expect(headerPath?.textContent).not.toContain(':50-100');
        // The complete native input remains inspectable, selector included.
        expect(container.textContent).toContain('src/a.ts:50-100');

        const quickOpen = container.querySelector<HTMLButtonElement>('button[aria-label="Open file"]');
        if (!quickOpen) throw new Error('Expected the read quick-open action');
        await act(async () => { quickOpen.click(); });
        expect(opened).toEqual([{ path: '/project/src/a.ts', line: 50 }]);
    });
});

test('a running call stays visible and toggles by its native part id', async () => {
    const toggled: string[] = [];
    const call: ToolCallPart = {
        type: 'tool_call', partId: 'bash-running', toolCallId: 'bash-call', toolName: 'bash',
        input: { command: 'npm test' }, status: 'running',
    };

    await withToolHarness(async ({ container, render }) => {
        await render(call, { onToggle: id => toggled.push(id) });
        expect(container.textContent).toContain('bash');
        expect(container.textContent).toContain('npm test');

        const disclosure = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
        if (!disclosure) throw new Error('Expected the running tool disclosure');
        await act(async () => { disclosure.click(); });
        expect(toggled).toEqual([call.partId]);
    });
});
