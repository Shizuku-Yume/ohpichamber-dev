import React, { act } from 'react';
import { expect, spyOn, test } from 'bun:test';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Message, Session, Subagent, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { useSyncRuntime } from '@/sync/sync-runtime-context';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { useGuestsStore } from '@/lib/guests/store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';

const { default: ToolPart } = await import('./ToolPart');
const { default: TurnActivity } = await import('../../components/TurnActivity');
const noAction = () => { };
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
type RenderOptions = {
  sessionId?: string;
  directory?: string;
  grouped?: boolean;
  expanded?: boolean;
  mobile?: boolean;
  status?: ToolCallPart['status'];
  pairedResult?: boolean;
  customCall?: ToolCallPart;
  customResult?: ToolResultPart;
  seedMessages?: Message[];
};

function SeedMessages({ sessionId, directory, messages }: { sessionId: string; directory: string; messages: Message[] }) {
  const runtime = useSyncRuntime();
  React.useLayoutEffect(() => {
    const store = runtime.childStores.ensureChild(directory);
    store.setState((state) => ({
      message: {
        ...state.message,
        [sessionId]: messages,
      },
    }));
  }, [directory, messages, runtime, sessionId]);
  return null;
}
async function withHarness(load: (sessionId: string) => Promise<Subagent[]>, run: (harness: {
  container: HTMLElement; render: (options?: RenderOptions) => Promise<void>;
}) => Promise<void>) {
  const happyWindow = new Window({ url: 'http://localhost' });
  const globals = {
    window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
    localStorage: happyWindow.localStorage, customElements: happyWindow.customElements,
    Node: happyWindow.Node, Text: happyWindow.Text, NodeList: happyWindow.NodeList,
    Window: happyWindow.Window, Event: happyWindow.Event, CustomEvent: happyWindow.CustomEvent,
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
  const previousSubagents = useSubagentsStore.getState();
  const list = spyOn(canonicalClient, 'listSubagents').mockImplementation(load);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async ({ sessionId = parent.sessionId, directory = '/workspace', grouped = false, expanded = true, mobile = false, status = call.status, pairedResult = false, customCall, customResult, seedMessages }: RenderOptions = {}) => {
    const effectiveCall = customCall ?? call;
    const effectiveResult = customResult ?? result;
    const tree = <I18nProvider><ThemeSystemContext.Provider value={themeContext}>
      {grouped ? <TurnActivity
        parts={[{ id: 'activity', turnId: 'turn', messageId: 'message', kind: 'tool', partIndex: 0, part: { ...effectiveCall, status } }]}
        sessionId={sessionId} directory={directory} isExpanded isMobile={mobile} onToggle={noAction}
        expandedTools={new Set([effectiveCall.partId])} onToggleTool={noAction} onShowPopup={noAction}
        streamPhase="completed" showHeader={false} animateRows={false}
      /> : <ToolPart part={pairedResult ? effectiveResult : { ...effectiveCall, status }} pairedCall={pairedResult ? effectiveCall : undefined} sessionId={sessionId} directory={directory} isExpanded={expanded} isMobile={mobile} onToggle={noAction} />}
    </ThemeSystemContext.Provider></I18nProvider>;
    await act(async () => {
      root.render(pairedResult
        ? (
          <SyncProvider directory="/workspace">
            {seedMessages ? <SeedMessages sessionId={sessionId} directory={directory} messages={seedMessages} /> : null}
            {tree}
          </SyncProvider>
        )
        : tree);
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
    useSubagentsStore.getState().resetForRuntimeSwitch();
    await run({ container, render });
  } finally {
    await act(async () => { root.unmount(); });
    list.mockRestore();
    useGlobalSessionsStore.setState(previousGlobal);
    useUIStore.setState(previousUI);
    useSessionUIStore.setState(previousSelection);
    useGuestsStore.setState(previousGuests);
    useSubagentsStore.setState(previousSubagents);
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

test('OMP 19.1 batch task shows subagent count/roles and async running summary when details.results is empty', async () => {
  const batchCall: ToolCallPart = {
    type: 'tool_call',
    partId: 'batch-call',
    toolCallId: 'batch-call-id',
    toolName: 'task',
    status: 'completed',
    input: {
      context: 'Shared repo context',
      tasks: [
        { name: 'ScoutAuth', agent: 'scout', task: 'Inspect auth', solutionSpace: 'narrow' },
        { name: 'FixCard', agent: 'task', task: 'Fix card', solutionSpace: 'narrow' },
      ],
    },
  };
  const asyncResult: ToolResultPart = {
    type: 'tool_result',
    partId: 'batch-result',
    toolCallId: 'batch-call-id',
    toolName: 'task',
    isError: false,
    output: {
      content: [{
        type: 'text',
        text: 'Spawned 2 background agents using scout, task.\n- `ScoutAuth` (job `ScoutAuth`)\n- `FixCard` (job `FixCard`)\nread proc:// lists jobs/services; read proc://<id> inspects status/output without consuming delivery; write proc://<id>/kill with empty `content` cancels/stops.\nJob IDs are process-local; delivered results expire shortly (~30s), unconsumed results within ~5min. Agent output/transcripts remain readable at agent://ScoutAuth / history://ScoutAuth.',
      }],
      details: {
        projectAgentsDir: null,
        results: [],
        totalDurationMs: 12,
        progress: [
          { id: 'ScoutAuth', agent: 'scout', status: 'running' },
          { id: 'FixCard', agent: 'task', status: 'pending' },
        ],
        async: { state: 'running', jobId: 'ScoutAuth', type: 'task' },
      },
    },
  };

  await withHarness(async () => [], async ({ container, render }) => {
    await render({ pairedResult: true, expanded: false, customCall: batchCall, customResult: asyncResult });
    expect(container.textContent).toContain('2 subagents (scout, task)');
    expect(container.textContent).toContain('2 subagents · running');
    expect(container.textContent).not.toContain('Unavailable');

    await render({ pairedResult: true, expanded: true, customCall: batchCall, customResult: asyncResult });
    expect(container.textContent).not.toContain('Unavailable');
    expect(container.textContent).not.toContain('read proc://');
    expect(container.textContent).toContain('ScoutAuth');
    expect(container.textContent).toContain('FixCard');

    await act(async () => {
      useSubagentsStore.getState().applySubagentUpdate(parent.sessionId, {
        subagentId: 'ScoutAuth',
        parentSessionId: parent.sessionId,
        childSessionId: 'scout-auth-session',
        toolCallId: 'batch-call-id',
        name: 'ScoutAuth',
        role: 'scout',
        status: 'running',
        activeTool: 'read',
        activeToolArgs: 'src/auth.ts',
      });
    });

    expect(container.textContent).toContain('ScoutAuth');
    expect(container.textContent).toContain('(scout)');
    expect(container.textContent).toContain('read: src/auth.ts');
    expect(container.querySelector('button[aria-label="Open ScoutAuth subtask"]')).not.toBeNull();
    expect(container.textContent).not.toContain('read proc://');
    expect(container.textContent).toContain('Open in the Subagents panel');
  });
});

test('switching sessionId or toolCallId resets hydrating state and does not force-refresh from prior running status', async () => {
  const slowFirst = Promise.withResolvers<Subagent[]>();
  let requestedSessions: string[] = [];

  await withHarness(async (sessionId) => {
    requestedSessions.push(sessionId);
    if (sessionId === 'parent') return slowFirst.promise;
    return [child('second-session-child', 'call-b', 'next-parent')];
  }, async ({ container, render }) => {
    const callA: ToolCallPart = { ...call, partId: 'call-a-part', toolCallId: 'call-a', status: 'running' };
    const callB: ToolCallPart = { ...call, partId: 'call-b-part', toolCallId: 'call-b', status: 'completed' };

    // Pre-hydrate 'next-parent' so switching to it does not need a fresh hydration unless falsely triggered.
    useSubagentsStore.getState().setSubagents('next-parent', [child('second-session-child', 'call-b', 'next-parent')]);
    useSubagentsStore.setState((state) => ({
      hydratedByParent: { ...state.hydratedByParent, 'next-parent': 'default' },
    }));
    await useSubagentsStore.getState().hydrateParent('next-parent');
    requestedSessions = [];

    await render({ sessionId: 'parent', customCall: callA, status: 'running' });
    expect(container.textContent).toContain('Loading');

    // Switch to already-hydrated 'next-parent' with completed callB while 'parent' is still in flight.
    await render({ sessionId: 'next-parent', customCall: callB, status: 'completed' });
    expect(container.textContent).not.toContain('Loading');
    expect(container.querySelector('[aria-label="Open second-session-child subtask"]')).not.toBeNull();
    expect(requestedSessions).toEqual(['parent']);

    await act(async () => {
      slowFirst.resolve([]);
    });
  });
});

test('collapsed async task hydrates subagent store and updates header summary from running to cancelled/completed', async () => {
  const asyncCall: ToolCallPart = {
    type: 'tool_call',
    partId: 'restart-call',
    toolCallId: 'restart-call-id',
    toolName: 'task',
    status: 'completed',
    input: {
      context: 'Restart test',
      tasks: [{ name: 'BetaWorker-3', agent: 'task', task: 'Run sleep 15 && pwd' }],
    },
  };
  const frozenRunningResult: ToolResultPart = {
    type: 'tool_result',
    partId: 'restart-result',
    toolCallId: 'restart-call-id',
    toolName: 'task',
    isError: false,
    output: {
      content: [{ type: 'text', text: 'Spawned agent `BetaWorker-3`.' }],
      details: {
        results: [],
        progress: [{ id: 'BetaWorker-3', agent: 'task', status: 'running' }],
        async: { state: 'running', jobId: 'BetaWorker-3', type: 'task' },
      },
    },
  };

  let hydratedCalls = 0;
  await withHarness(async () => {
    hydratedCalls += 1;
    return [{
      subagentId: 'BetaWorker-3',
      parentSessionId: parent.sessionId,
      childSessionId: 'beta-worker-3-session',
      toolCallId: 'restart-call-id',
      name: 'BetaWorker-3',
      role: 'task',
      status: 'cancelled',
    }];
  }, async ({ container, render }) => {
    await render({ pairedResult: true, expanded: false, customCall: asyncCall, customResult: frozenRunningResult });
    expect(hydratedCalls).toBe(1);
    expect(container.textContent).toContain('1 subagent · cancelled');
    expect(container.textContent).not.toContain('1 subagent · running');

    await act(async () => {
      useSubagentsStore.getState().applySubagentUpdate(parent.sessionId, {
        subagentId: 'BetaWorker-3',
        parentSessionId: parent.sessionId,
        childSessionId: 'beta-worker-3-session',
        toolCallId: 'restart-call-id',
        name: 'BetaWorker-3',
        role: 'task',
        status: 'completed',
      });
    });
    expect(container.textContent).toContain('1 subagent · completed');
  });
});

test('collapsed async task falls back to async_job_result notice when store has no rows', async () => {
  const asyncCall: ToolCallPart = {
    type: 'tool_call',
    partId: 'notice-call',
    toolCallId: 'notice-call-id',
    toolName: 'task',
    status: 'completed',
    input: {
      context: 'Report fallback',
      tasks: [{ name: 'AlphaScout', agent: 'scout', task: 'Inspect' }],
    },
  };
  const frozenRunningResult: ToolResultPart = {
    type: 'tool_result',
    partId: 'notice-result',
    toolCallId: 'notice-call-id',
    toolName: 'task',
    isError: false,
    output: {
      content: [{ type: 'text', text: 'Spawned agent `AlphaScout`.' }],
      details: {
        results: [],
        progress: [{ id: 'AlphaScout', agent: 'scout', status: 'running' }],
        async: { state: 'running', jobId: 'AlphaScout', type: 'task' },
      },
    },
  };
  const seedMessages: Message[] = [{
    messageId: 'async-notice-msg',
    sessionId: parent.sessionId,
    turnId: 'turn-async',
    role: 'user',
    createdAt: 2,
    parts: [{
      type: 'notice',
      partId: 'async-notice-part',
      noticeType: 'async_job_result',
      level: 'info',
      title: 'Subagent result: AlphaScout',
      details: {
        jobs: [{
          jobId: 'AlphaScout',
          subagentId: 'AlphaScout',
          type: 'task',
          status: 'completed',
          reportText: 'Done.',
        }],
      },
    }],
  }];

  await withHarness(async () => [], async ({ container, render }) => {
    await render({
      pairedResult: true,
      expanded: false,
      customCall: asyncCall,
      customResult: frozenRunningResult,
      seedMessages,
    });
    expect(container.textContent).toContain('1 subagent · completed');
    expect(container.textContent).not.toContain('1 subagent · running');
  });
});
