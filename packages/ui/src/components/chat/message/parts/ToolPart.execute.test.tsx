import { act } from 'react';
<<<<<<< HEAD
import { expect, mock, test } from 'bun:test';
||||||| bc50ba56aa
import { expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
=======
import { expect, test } from 'bun:test';
>>>>>>> upstream/main
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import type { TurnActivityRecord } from '../../lib/turns/types';
import { SyncProvider } from '@/sync/sync-context';
import { I18nProvider } from '@/lib/i18n';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { useGuestsStore } from '@/lib/guests/store';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

<<<<<<< HEAD
// Bun cannot load Vite's `?worker&url` import that markdown-worker makes.
mock.module('../../markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));

// Loaded after the shim so the worker URL never reaches Bun's loader.
||||||| bc50ba56aa
// Bun does not implement Vite's worker asset-query imports.
plugin({
  name: 'tool-guest-worker-url',
  setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
      contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`,
      loader: 'js',
    }));
  },
});

=======
>>>>>>> upstream/main
const { default: ToolPart } = await import('./ToolPart');
const { default: ProgressiveGroup } = await import('./ProgressiveGroup');

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

const part: ToolCallPart = {
  type: 'tool_call',
  partId: 'prt_bash',
  toolCallId: 'call_bash',
  toolName: 'bash',
  input: { command: 'git status --short', timeout: 30 },
  status: 'completed',
};

const result: ToolResultPart = {
  type: 'tool_result',
  partId: 'prt_bash_result',
  toolCallId: part.toolCallId,
  toolName: part.toolName,
  output: { content: [{ type: 'text', text: ' M src/example.ts' }], details: { exitCode: 0 } },
  isError: false,
};

test('native bash calls and results retain separate identities and paired command context', async () => {
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
    SVGElement: happyWindow.SVGElement,
    requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
    cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
    getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
    ResizeObserver: happyWindow.ResizeObserver,
    MutationObserver: happyWindow.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.keys(globals).map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const toggled: string[] = [];
  const previousDirectory = useDirectoryStore.getState().currentDirectory;

  try {
    useGuestsStore.setState({ status: 'ready', guests: [], runtimeKey: 'test' });
    await act(async () => {
      root.render(
        <SyncProvider directory="">
          <I18nProvider>
            <ThemeSystemContext.Provider value={themeContext}>
              <ToolPart part={result} pairedCall={part} isExpanded isMobile={false} onToggle={id => toggled.push(id)} />
            </ThemeSystemContext.Provider>
          </I18nProvider>
        </SyncProvider>,
      );
    });

    expect(container.textContent).toContain('Bash');
    expect(container.textContent).toContain('git status --short');
    expect(container.textContent).toContain('M src/example.ts');
    expect(container.textContent).not.toContain('in progress');
    const button = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => { button?.click(); });
    expect(toggled).toEqual([result.partId]);

    const callActivity: TurnActivityRecord = { id: 'call-activity', turnId: 'turn-1', messageId: 'assistant', partIndex: 0, kind: 'tool', part };
    const resultActivity: TurnActivityRecord = { id: 'result-activity', turnId: 'turn-1', messageId: 'result-message', partIndex: 0, kind: 'tool', part: result };
    const renderGroup = async (call: ToolCallPart, turnId = 'turn-1', groupParts = [resultActivity]) => {
      await act(async () => root.render(<I18nProvider><ThemeSystemContext.Provider value={themeContext}>
        <ProgressiveGroup parts={groupParts} contextParts={[{ ...callActivity, part: call, turnId }, ...groupParts.filter((activity) => activity !== callActivity)]}
          isExpanded onToggle={() => {}} isMobile={false} expandedTools={new Set(groupParts.map((activity) => activity.part.partId))} onToggleTool={id => toggled.push(id)}
          onShowPopup={() => {}} streamPhase="completed" showHeader={false} animateRows={false} />
      </ThemeSystemContext.Provider></I18nProvider>));
    };
    await renderGroup(part);
    expect(container.textContent).toContain('git status --short');
    await renderGroup({ ...part, input: { command: 'git log -1' } });
    expect(container.textContent).toContain('git log -1');
    expect(container.textContent).not.toContain('git status --short');
    await renderGroup(part, 'different-turn');
    expect(container.textContent).not.toContain('git status --short');

    await renderGroup(part, 'turn-1', [callActivity, resultActivity]);
    expect(container.querySelectorAll('[class*="group/tool"]')).toHaveLength(1);
    expect(container.textContent).toContain('git status --short');

    const runningCall: ToolCallPart = {
      ...part, partId: 'prt_running', toolCallId: 'call_running', status: 'running',
      input: { command: 'sleep 1' },
    };
    const runningActivity: TurnActivityRecord = { ...callActivity, id: 'running-activity', part: runningCall };
    await renderGroup(runningCall, 'turn-1', [runningActivity]);
    expect(container.querySelectorAll('[class*="group/tool"]')).toHaveLength(1);
    expect(container.textContent).toContain('sleep 1');

    const errorResult: ToolResultPart = {
      ...result, partId: 'prt_bash_error', isError: true, error: 'Permission denied',
      output: { content: [{ type: 'text', text: 'failed' }] },
    };
    const errorActivity: TurnActivityRecord = { ...resultActivity, id: 'error-activity', part: errorResult };
    await renderGroup(part, 'turn-1', [callActivity, errorActivity]);
    expect(container.querySelectorAll('[class*="group/tool"]')).toHaveLength(1);
    expect(container.textContent).toContain('Permission denied');

    const openedFiles: Array<{ path: string; line?: number }> = [];
    const unexpectedRuntimeCall = (): never => { throw new Error('Read navigation must only open the requested file'); };
    const runtime: RuntimeAPIs = {
      runtime: { platform: 'web', isDesktop: false, isVSCode: false },
      get terminal() { return unexpectedRuntimeCall(); },
      get git() { return unexpectedRuntimeCall(); },
      get sourceControl() { return unexpectedRuntimeCall(); },
      get files() { return unexpectedRuntimeCall(); },
      get settings() { return unexpectedRuntimeCall(); },
      get permissions() { return unexpectedRuntimeCall(); },
      get notifications() { return unexpectedRuntimeCall(); },
      editor: {
        async openFile(path, line) { openedFiles.push({ path, line }); },
        openDiff: unexpectedRuntimeCall,
      },
    };
<<<<<<< HEAD
    useDirectoryStore.setState({ currentDirectory: '/project' });
    const readCases = [
      { input: 'src/example.ts:50-100', path: '/project/src/example.ts', line: 50 },
      { input: 'src/example.ts:raw:50-100', path: '/project/src/example.ts', line: 50 },
      { input: 'C:\\project\\src\\example.ts:50-100', path: 'C:/project/src/example.ts', line: 50 },
      { input: 'C:\\project\\src\\example.ts', path: 'C:/project/src/example.ts', line: undefined },
||||||| bc50ba56aa
    await act(async () => {
      root.render(
        <SyncProvider sdk={sdk} directory="">
          <I18nProvider>
            <ThemeSystemContext.Provider value={themeContext}>
              <ToolPart part={namespacePart} isExpanded={false} isMobile={false} onToggle={() => {}} />
            </ThemeSystemContext.Provider>
          </I18nProvider>
        </SyncProvider>,
      );
    });
    expect(container.textContent).toContain('OpenCodeListed worktrees, Renamed the session');
    expect(container.textContent).not.toContain('Script');
    expect(container.querySelector('use[href="#oc-opencode"]')).not.toBeNull();

    // OpenChamber actions draw their own view of the answer, never the envelope's JSON.
    const views: Array<[string, string, { [key: string]: JsonValue }, string[]]> = [
      ['openchamber_memory', 'memory.read', { memory: { memoryId: 'm1', title: 'Telemetry caveats', type: 'reference', scope: 'project', body: 'Counts are per install.' } }, ['Read a memory', 'Reference · This project', 'Telemetry caveats', 'Counts are per install.', 'Show the raw answer']],
      ['openchamber', 'session.messages', { sessionId: 'ses_x', directory: '/repo', role: 'all', messages: [{ id: 'b', role: 'assistant', createdAt: 2, completedAt: 3, model: 'a/b', text: 'Fixed the cookie.' }] }, ['Agent · a/b', 'Fixed the cookie.', 'Open session']],
      ['openchamber', 'pr.watch', { watching: { url: 'https://github.com/a/b/pull/7', number: 7, title: 'Fix login', status: 'pending' }, next: 'x' }, ['#7 Fix login', 'Checks running']],
      ['openchamber_web', 'browser.inspect', { ok: true, selector: '#save', tag: 'button', label: 'Save', styles: { color: 'red' } }, ['button · Save', '#save', 'color', 'red']],
      ['openchamber_web', 'browser.scroll', { ok: true, scrollY: 400, maxScrollY: 1200, atTop: false, atBottom: false }, ['Position', '400 of 1200 px']],
      ['openchamber_workflow', 'workflow.check', { name: 'audit-routes', description: 'Audit every route', phases: ['Find', 'Audit'], limits: { concurrentAgents: 8, agentsPerRun: 200 } }, ['audit-routes', 'Audit every route', '1. Find', '2. Audit']],
      ['openchamber_workflow', 'workflow.status', { id: 'run_1', parentSessionId: 'ses_exec', directory: '/repo', name: 'audit-routes', description: 'Audit every route', state: 'running', attempt: 1, createdAt: 1, currentPhase: 'Audit', phases: ['Find', 'Audit'], agents: [{ key: 'a', label: 'One', phase: 'Audit', state: 'completed' }, { key: 'b', label: 'Two', phase: 'Audit', state: 'running' }], logs: [] }, ['Running', 'Audit', '1 of 2 done']],
      ['openchamber_workflow', 'workflow.result', { runId: 'run_1', state: 'completed', result: 'Two routes lack auth.' }, ['Done', 'Two routes lack auth.']],
      ['openchamber_workflow', 'workflow.list', { workflows: [{ name: 'audit-routes', description: 'Audit every route' }], runs: [{ runId: 'run_1', name: 'audit-routes', state: 'failed', createdAt: 1 }] }, ['Saved', 'Runs', 'Failed']],
=======
    await act(async () => {
      root.render(
        <SyncProvider sdk={sdk} directory="">
          <I18nProvider>
            <ThemeSystemContext.Provider value={themeContext}>
              <ToolPart part={namespacePart} isExpanded={false} isMobile={false} onToggle={() => {}} />
            </ThemeSystemContext.Provider>
          </I18nProvider>
        </SyncProvider>,
      );
    });
    expect(container.textContent).toContain('OpenCodeListed worktrees, Renamed the session');
    expect(container.textContent).not.toContain('Script');
    expect(container.querySelector('use[href="#oc-opencode"]')).not.toBeNull();

    // OpenChamber actions draw their own view of the answer, never the envelope's JSON.
    const views: Array<[string, string, { [key: string]: JsonValue }, string[]]> = [
      ['openchamber_memory', 'memory.read', { memory: { memoryId: 'm1', title: 'Telemetry caveats', type: 'reference', scope: 'project', body: 'Counts are per install.' } }, ['Read a memory', 'Reference · This project', 'Telemetry caveats', 'Counts are per install.', 'Show the raw answer']],
      ['openchamber', 'session.messages', { sessionId: 'ses_x', directory: '/repo', role: 'all', messages: [{ id: 'b', role: 'assistant', createdAt: 2, completedAt: 3, model: 'a/b', text: 'Fixed the cookie.' }] }, ['Agent · a/b', 'Fixed the cookie.', 'Open session']],
      ['openchamber', 'pr.watch', { watching: { url: 'https://github.com/a/b/pull/7', number: 7, title: 'Fix login', status: 'pending' }, next: 'x' }, ['#7 Fix login', 'Checks running']],
      ['openchamber', 'wait.start', { waiting: { waitId: 'wait_1', source: 'timer', extension: 'OpenChamber', title: 'Timer', label: '20 min', args: { minutes: 20 }, status: 'waiting' }, next: 'x' }, ['Timer · 20 min']],
      ['openchamber', 'wait.start', { waiting: { waitId: 'wait_2', source: 'kit/deploy', extension: 'Deploy Kit', title: 'Deploy', label: 'prod', args: {}, status: 'waiting' }, next: 'x' }, ['Deploy (prod)', 'Deploy Kit']],
      ['openchamber', 'wait.list', { waiting: [{ waitId: 'https://github.com/a/b/pull/7', source: 'pr', extension: 'OpenChamber', title: '#7 Fix login', label: 'failed', args: { url: 'https://github.com/a/b/pull/7' }, status: 'waiting' }], sources: [{ source: 'timer', extension: 'OpenChamber', title: 'Timer' }, { source: 'pr', extension: 'OpenChamber', title: 'Pull request' }] }, ['Waiting on', '#7 Fix login', 'Can wait on', 'Timer', 'Pull request']],
      ['openchamber_web', 'browser.inspect', { ok: true, selector: '#save', tag: 'button', label: 'Save', styles: { color: 'red' } }, ['button · Save', '#save', 'color', 'red']],
      ['openchamber_web', 'browser.scroll', { ok: true, scrollY: 400, maxScrollY: 1200, atTop: false, atBottom: false }, ['Position', '400 of 1200 px']],
      ['openchamber_workflow', 'workflow.check', { name: 'audit-routes', description: 'Audit every route', phases: ['Find', 'Audit'], limits: { concurrentAgents: 8, agentsPerRun: 200 } }, ['audit-routes', 'Audit every route', '1. Find', '2. Audit']],
      ['openchamber_workflow', 'workflow.status', { id: 'run_1', parentSessionId: 'ses_exec', directory: '/repo', name: 'audit-routes', description: 'Audit every route', state: 'running', attempt: 1, createdAt: 1, currentPhase: 'Audit', phases: ['Find', 'Audit'], agents: [{ key: 'a', label: 'One', phase: 'Audit', state: 'completed' }, { key: 'b', label: 'Two', phase: 'Audit', state: 'running' }], logs: [] }, ['Running', 'Audit', '1 of 2 done']],
      ['openchamber_workflow', 'workflow.result', { runId: 'run_1', state: 'completed', result: 'Two routes lack auth.' }, ['Done', 'Two routes lack auth.']],
      ['openchamber_workflow', 'workflow.list', { workflows: [{ name: 'audit-routes', description: 'Audit every route' }], runs: [{ runId: 'run_1', name: 'audit-routes', state: 'failed', createdAt: 1 }] }, ['Saved', 'Runs', 'Failed']],
>>>>>>> upstream/main
    ];
    for (const readCase of readCases) {
      const read: ToolCallPart = { type: 'tool_call', partId: 'read-part', toolCallId: 'read-call',
        toolName: 'read', status: 'completed', input: { path: readCase.input } };
      await act(async () => root.render(<I18nProvider><RuntimeAPIContext.Provider value={runtime}>
        <ProgressiveGroup parts={[{ ...callActivity, part: read }]} isExpanded onToggle={() => {}}
          isMobile={false} expandedTools={new Set()} onToggleTool={() => {}} onShowPopup={() => {}}
          streamPhase="completed" showHeader={false} animateRows={false} />
      </RuntimeAPIContext.Provider></I18nProvider>));
      const fileButton = container.querySelector<HTMLButtonElement>('.oc-static-tool-row button');
      expect(fileButton).not.toBeNull();
      expect(fileButton?.textContent).not.toContain(':50-100');
      await act(async () => { fileButton?.click(); });
      expect(openedFiles.at(-1)).toEqual({ path: readCase.path, line: readCase.line });
    }
  } finally {
    await act(async () => { root.unmount(); });
    useDirectoryStore.setState({ currentDirectory: previousDirectory });
    await happyWindow.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
