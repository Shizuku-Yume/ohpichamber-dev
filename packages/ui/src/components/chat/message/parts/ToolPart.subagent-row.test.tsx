import { act } from 'react';
import { expect, spyOn, test } from 'bun:test';
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
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';

plugin({
  name: 'task-child-worker-url',
  setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
      contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`, loader: 'js',
    }));
  },
});
const { default: ToolPart } = await import('./ToolPart');
const { default: TurnActivity } = await import('../../components/TurnActivity');
const noAction = () => {};
const unexpectedThemeChange = (): never => { throw new Error('Rendering must not change the theme'); };
const theme = getDefaultTheme(false);
const themeContext: ThemeContextValue = {
  currentTheme: theme, availableThemes: [theme], setTheme: unexpectedThemeChange,
  customThemesLoading: false, reloadCustomThemes: unexpectedThemeChange, importTheme: unexpectedThemeChange,
  deleteImportedTheme: unexpectedThemeChange, customThemeIds: [], isSystemPreference: false,
  setSystemPreference: unexpectedThemeChange, themeMode: 'light', setThemeMode: unexpectedThemeChange,
  lightThemeId: theme.metadata.id, darkThemeId: getDefaultTheme(true).metadata.id,
  setLightThemePreference: unexpectedThemeChange, setDarkThemePreference: unexpectedThemeChange,
};
const parent: Session = {
  sessionId: 'parent', rootSessionId: 'parent', projectId: 'project', workspaceId: 'workspace', displayPath: 'workspace',
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  archivedAt: undefined, metadata: null, metadataRevision: '0', archiveRevision: '0',
};
const call: ToolCallPart = {
  type: 'tool_call', partId: 'task-part', toolCallId: 'native-task', toolName: 'task', status: 'completed',
  input: { agent: 'child', task: 'Inspect files', sessionID: 'spoofed-output-child' },
};
const child = (subagentId: string, toolCallId = call.toolCallId, parentSessionId = parent.sessionId): Subagent => ({
  subagentId, toolCallId, parentSessionId, childSessionId: `${subagentId}-session`, role: subagentId, status: 'completed',
});
const result: ToolResultPart = {
  type: 'tool_result', partId: 'task-result', toolCallId: call.toolCallId, toolName: 'task', isError: false,
  output: { content: [{ type: 'text', text: 'Child returned the marker.' }], details: { marker: 'T18 child marker' } },
};
type RenderOptions = { sessionId?: string; directory?: string; grouped?: boolean; expanded?: boolean; mobile?: boolean; status?: ToolCallPart['status']; pairedResult?: boolean };

async function withHarness(load: (sessionId: string) => Promise<Subagent[]>, run: (harness: {
  container: HTMLElement; render: (options?: RenderOptions) => Promise<void>;
}) => Promise<void>) {
  const happyWindow = new Window({ url: 'http://localhost' });
  const globals = {
    window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
    localStorage: happyWindow.localStorage, customElements: happyWindow.customElements,
    Node: happyWindow.Node, Text: happyWindow.Text, NodeList: happyWindow.NodeList,
    Element: happyWindow.Element, HTMLElement: happyWindow.HTMLElement, HTMLAnchorElement: happyWindow.HTMLAnchorElement, SVGElement: happyWindow.SVGElement,
    requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
    cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
    getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow), ResizeObserver: happyWindow.ResizeObserver,
    MutationObserver: happyWindow.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const descriptors = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const previousGlobal = useGlobalSessionsStore.getState();
  const previousUI = useUIStore.getState();
  const previousSelection = useSessionUIStore.getState();
  const previousGuests = useGuestsStore.getState();
  const list = spyOn(canonicalClient, 'listSubagents').mockImplementation(load);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async ({ sessionId = parent.sessionId, directory = '/workspace', grouped = false, expanded = true, mobile = false, status = call.status, pairedResult = false }: RenderOptions = {}) => {
    const tree = <I18nProvider><ThemeSystemContext.Provider value={themeContext}>
      {grouped ? <TurnActivity
        parts={[{ id: 'activity', turnId: 'turn', messageId: 'message', kind: 'tool', partIndex: 0, part: { ...call, status } }]}
        sessionId={sessionId} directory={directory} isExpanded isMobile={mobile} onToggle={noAction}
        expandedTools={new Set([call.partId])} onToggleTool={noAction} onShowPopup={noAction}
        streamPhase="completed" showHeader={false} animateRows={false}
      /> : <ToolPart part={pairedResult ? result : { ...call, status }} pairedCall={pairedResult ? call : undefined} sessionId={sessionId} directory={directory} isExpanded={expanded} isMobile={mobile} onToggle={noAction} />}
    </ThemeSystemContext.Provider></I18nProvider>;
    await act(async () => {
      root.render(pairedResult ? <SyncProvider directory="/workspace">{tree}</SyncProvider> : tree);
    });
    await act(async () => { await new Promise<void>(resolve => happyWindow.requestAnimationFrame(() => resolve())); });
    await act(async () => { await new Promise<void>(resolve => happyWindow.requestAnimationFrame(() => resolve())); });
  };
  try {
    registerWorkspaceDirectory(parent.workspaceId, '/workspace');
    useGlobalSessionsStore.getState().applySnapshot([parent], []);
    useUIStore.setState({ contextPanelByDirectory: {} });
    useSessionUIStore.setState({ currentSessionId: parent.sessionId, currentSessionDirectory: '/workspace' });
    useGuestsStore.setState({ status: 'ready', guests: [], runtimeKey: 'test' });
    await run({ container, render });
  } finally {
    await act(async () => { root.unmount(); });
    list.mockRestore();
    useGlobalSessionsStore.setState(previousGlobal);
    useUIStore.setState(previousUI);
    useSessionUIStore.setState(previousSelection);
    useGuestsStore.setState(previousGuests);
    await happyWindow.happyDOM.abort();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}
const open = (container: HTMLElement, role: string) => {
  const button = container.querySelector(`button[aria-label="Open ${role} subtask"]`);
  if (!(button instanceof HTMLElement)) throw new Error(`Child navigation missing for ${role}`);
  button.click();
};

<<<<<<< HEAD
test('a canonical task joins all matching children and opens a read-only child tab without changing main selection', async () => {
  await withHarness(async () => [child('first'), child('second'), child('wrong-call', 'other-call'), child('wrong-parent', call.toolCallId, 'other-parent')], async ({ container, render }) => {
    await render({ expanded: false });
    expect(container.querySelector('[aria-label="Open first subtask"]')).toBeNull();
    await render();
    expect(container.querySelector('[aria-label="Open second subtask"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Open wrong-call subtask"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open wrong-parent subtask"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open spoofed-output-child subtask"]')).toBeNull();
    await act(async () => open(container, 'first'));
    expect(useSessionUIStore.getState().currentSessionId).toBe('parent');
    expect(useUIStore.getState().contextPanelByDirectory['/workspace']?.tabs).toMatchObject([
      { mode: 'chat', dedupeKey: 'session:first-session', readOnly: true },
    ]);
    expect(useGlobalSessionsStore.getState().entityById.get('first-session')).toMatchObject({
      parentSessionId: 'parent', runtimeStatus: 'idle', activeRunId: null,
=======
const childSession = (id: string, created: number) => ({
  id, parentID: 'parent', projectID: 'p', directory: '/workspace', title: id, agent: 'explore',
  cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created, updated: created },
});

const childActivity = (sessionID: string) => ({
  message: { [sessionID]: [{
    id: `${sessionID}-message`, sessionID, role: 'assistant' as const,
    agent: 'explore', providerID: 'test', modelID: 'test',
    time: { created: 121, completed: 122 },
  }] },
  part: { [`${sessionID}-message`]: [{ ...patchPart(['src/child-work.ts']), sessionID, messageID: `${sessionID}-message` }] },
});

const openButton = (container: HTMLElement) => container.querySelector('button[aria-label="Open Explore subtask"]');

test('a finished subagent is one row with its duration and an open action, never its child activity', async () => {
  await withHarness(parent, false, async (store, container) => {
    await act(async () => store.setState(childActivity('child')));
    expect(container.textContent).toContain('Update files');
    expect(container.textContent).toContain('62.0s');
    expect(openButton(container)).not.toBeNull();
    expect(container.textContent).not.toContain('child-work.ts');
    expect(container.textContent).not.toContain('Found two files');
  });
});

test('an expanded subagent row draws a UI block from the reply, its buttons disabled', async () => {
  const withBlock: ToolPartData = {
    ...parent,
    state: {
      status: 'completed', input: { description: 'Update files', agent: 'explore' },
      // The library's name as the fence tag: recovered as replies recover it.
      output: '<subagent sessionID="child" state="completed">\nPick one:\n\n```openui\nroot = Stack([c])\nc = Card("Next step", [Button("Fix", "primary", "next")])\n```\n</subagent>',
      metadata: { sessionID: 'child' }, time: { start: 1_000, end: 63_000 },
    },
  };
  await withHarness(withBlock, true, async (_store, container) => {
    let button: Element | undefined;
    for (let attempt = 0; attempt < 50 && !button; attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      button = [...container.querySelectorAll('button')].find((element) => element.textContent?.trim() === 'Fix');
    }
    expect(container.textContent).toContain('Next step');
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(container.textContent).not.toContain('root = Stack');
  });
});

test('a running subagent without the progress join resolves its child session from the store', async () => {
  const running: ToolPartData = {
    ...parent,
    state: { status: 'running', input: { description: 'Look around', agent: 'explore', sessionID: '  ' }, time: { start: 100 } },
  };
  await withHarness(running, false, async (store, container) => {
    expect(openButton(container)).toBeNull();
    await act(async () => store.setState({ session: [childSession('child', 120)], ...childActivity('child') }));
    expect(openButton(container)).not.toBeNull();
    expect(container.textContent).not.toContain('child-work.ts');
  });
});

test('a resumed subagent opens its explicit child even when that child predates the call', async () => {
  const running: ToolPartData = {
    ...parent,
    state: {
      status: 'running',
      input: { description: 'Look around', agent: 'explore', sessionID: 'child' },
      time: { start: 100 },
    },
  };
  await withHarness(running, false, async (store, container) => {
    await act(async () => store.setState({ session: [childSession('child', 50)] }));
    expect(openButton(container)).not.toBeNull();
  });
});

test('a running subagent offers a stop that tells the agent before interrupting the child', async () => {
  const running: ToolPartData = {
    ...parent,
    state: { status: 'running', input: { description: 'Look around', agent: 'explore' }, metadata: { sessionID: 'child' }, time: { start: 100 } },
  };
  const stop = spyOn(opencodeClient, 'stopSubagent').mockResolvedValue(undefined);
  try {
    await withHarness(running, false, async (_store, container) => {
      const button = container.querySelector('button[aria-label="Stop subagent"]');
      if (!(button instanceof HTMLElement)) throw new Error('Stop action is missing');
      await act(async () => { button.click(); });
      expect(stop.mock.calls).toEqual([[{ sessionID: 'parent', directory: '/workspace', childSessionID: 'child', description: 'Look around' }]]);
      expect(container.querySelector('button[aria-label="Stop subagent"]')).toBeNull();
>>>>>>> bc50ba56a
    });
  });
});

test('mobile child navigation selects the child in place and does not create a desktop panel', async () => {
  await withHarness(async () => [child('mobile-child')], async ({ container, render }) => {
    await render({ mobile: true });
    await act(async () => open(container, 'mobile-child'));
    expect(useSessionUIStore.getState().currentSessionId).toBe('mobile-child-session');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/workspace');
    expect(useUIStore.getState().contextPanelByDirectory['/workspace']).toBeUndefined();
  });
});

test('a delayed child discovery from the previous parent cannot populate the next session', async () => {
  const old = Promise.withResolvers<Subagent[]>();
  await withHarness(sessionId => sessionId === 'parent' ? old.promise : Promise.resolve([]), async ({ container, render }) => {
    await render();
    await render({ sessionId: 'next-parent' });
    await act(async () => old.resolve([child('stale')]));
    expect(container.querySelector('[aria-label="Open stale subtask"]')).toBeNull();
    expect(useGlobalSessionsStore.getState().entityById.has('stale-session')).toBe(false);
  });
});

test('failed child refresh preserves known links and reports unavailability instead of empty success', async () => {
  let requests = 0;
  await withHarness(async () => {
    if (++requests === 1) return [child('retained')];
    throw new Error('Service unavailable');
  }, async ({ container, render }) => {
    await render({ status: 'running' });
    await render({ status: 'completed' });
    expect(container.querySelector('[aria-label="Open retained subtask"]')).not.toBeNull();
    expect(container.textContent).toContain('Unavailable');
    await act(async () => open(container, 'retained'));
    expect(useUIStore.getState().contextPanelByDirectory['/workspace']?.tabs).toMatchObject([{ dedupeKey: 'session:retained-session' }]);
  });
});

test('task links follow the addressed session and directory while grouped activity leaves standalone task rows to MessageBody', async () => {
  await withHarness(async sessionId => [child(sessionId, call.toolCallId, sessionId)], async ({ container, render }) => {
    // TurnActivity owns grouped activity, not the standalone task row: the
    // projection extracts task calls so MessageBody renders them in place.
    await render({ grouped: true, sessionId: 'embedded-parent', directory: '/embedded' });
    expect(container.querySelector('[aria-label="Open embedded-parent subtask"]')).toBeNull();

    await render({ sessionId: 'embedded-parent', directory: '/embedded' });
    await act(async () => open(container, 'embedded-parent'));
    expect(useUIStore.getState().contextPanelByDirectory['/embedded']?.tabs).toMatchObject([
      { dedupeKey: 'session:embedded-parent-session', readOnly: true },
    ]);
    await render({ sessionId: 'other-parent', directory: '/other' });
    expect(container.querySelector('[aria-label="Open embedded-parent subtask"]')).toBeNull();
    await act(async () => open(container, 'other-parent'));
    expect(useUIStore.getState().contextPanelByDirectory['/other']?.tabs).toMatchObject([
      { dedupeKey: 'session:other-parent-session', readOnly: true },
    ]);
    expect(useSessionUIStore.getState().currentSessionId).toBe('parent');
  });
});

test('a completed task result keeps the paired child navigation visible', async () => {
  await withHarness(async () => [child('paired')], async ({ container, render }) => {
    await render({ pairedResult: true });
    expect(container.querySelector('[aria-label="Open paired subtask"]')).not.toBeNull();
    await act(async () => open(container, 'paired'));
    expect(useUIStore.getState().contextPanelByDirectory['/workspace']?.tabs).toMatchObject([
      { dedupeKey: 'session:paired-session', readOnly: true },
    ]);
  });
});
