import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Message, TodoPhase, ToolResultPart } from '@openchamber/agent-contract';
import type { StoreApi } from 'zustand';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { SyncProvider, useDirectoryStore } from '@/sync/sync-context';
import type { DirectoryStore } from '@/sync/child-store';
import { applyDirectoryEvent, installSessionSnapshot } from '@/sync/event-reducer';
import { nativeClient, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { I18nProvider } from '@/lib/i18n';
import { TodoTray } from './TodoTray';

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

const DIR = '/workspace/project';
const WORKSPACE_ID = 'workspace-todo';
const SESSION_ID = 'session-todo-1';

const todoResult = (callId: string, phases: TodoPhase[], isError = false): ToolResultPart => ({
  type: 'tool_result',
  partId: `${callId}-result`,
  toolCallId: callId,
  toolName: 'todo',
  output: { content: [], details: { phases } },
  isError,
});

const assistantTodoMessage = (messageId: string, phases: TodoPhase[], isError = false): Message => ({
  messageId,
  role: 'assistant',
  sessionId: SESSION_ID,
  turnId: `turn-${messageId}`,
  createdAt: Date.now(),
  parts: [todoResult(`call-${messageId}`, phases, isError)],
});

const twoPhaseTodos: TodoPhase[] = [
  {
    name: 'Discovery',
    tasks: [
      { content: 'Search codebase', status: 'completed' },
      { content: 'Inspect findings', status: 'in_progress' },
    ],
  },
  {
    name: 'Execution',
    tasks: [
      { content: 'Apply modifications', status: 'pending' },
    ],
  },
];

const updatedPhases: TodoPhase[] = [
  {
    name: 'Discovery',
    tasks: [
      { content: 'Search codebase', status: 'completed' },
      { content: 'Inspect findings', status: 'completed' },
    ],
  },
  {
    name: 'Execution',
    tasks: [
      { content: 'Apply modifications', status: 'completed' },
    ],
  },
];
describe('TodoTray integration', () => {
  let host: HTMLElement;
  let root: Root | null = null;
  let directoryStore: StoreApi<DirectoryStore> | null = null;

  const StoreProbe = () => {
    directoryStore = useDirectoryStore(DIR, { bootstrap: false });
    return null;
  };

  beforeEach(() => {
    registerWorkspaceDirectory(WORKSPACE_ID, DIR);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    directoryStore = null;
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
  });

  const renderTray = async (sessionId: string | null = SESSION_ID, directory: string | null = DIR, show = true, client = nativeClient()) => {
    await act(async () => {
      root!.render(
        <I18nProvider>
          <SyncProvider client={client} directory={DIR}>
            <StoreProbe />
            {show ? <TodoTray sessionId={sessionId} directory={directory} /> : null}
          </SyncProvider>
        </I18nProvider>,
      );
    });
  };

  const tray = () => host.querySelector('[data-testid="todo-tray"]');

  const setTodos = async (todos: TodoPhase[], messages: Message[] = []) => {
    const snapshot = nativeSnapshot(SESSION_ID, messages);
    snapshot.todos = todos;
    await act(async () => {
      directoryStore!.setState((prev) => installSessionSnapshot(prev, snapshot));
    });
  };

  test('folds to the active item and its progress, and expands to every phase', async () => {
    await renderTray();
    expect(directoryStore).not.toBeNull();
    await setTodos(twoPhaseTodos);

    const tray = host.querySelector('[data-testid="todo-tray"]');
    expect(tray).not.toBeNull();
    // Folded: the item being worked on and closed/total, nothing else.
    expect(tray?.textContent).toContain('Inspect findings');
    expect(tray?.textContent).toContain('1/3');
    expect(tray?.textContent).not.toContain('Apply modifications');
    expect(tray?.textContent).not.toContain('Discovery');
    expect(tray?.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      tray?.querySelector('button')?.dispatchEvent(new browser.MouseEvent('click', { bubbles: true }) as unknown as Event);
    });

    const expanded = host.querySelector('[data-testid="todo-tray"]');
    expect(expanded?.textContent).toContain('Discovery');
    expect(expanded?.textContent).toContain('Search codebase');
    expect(expanded?.textContent).toContain('Execution');
    expect(expanded?.textContent).toContain('Apply modifications');
    expect(expanded?.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');

    const inProgressItem = host.querySelector('li[data-status="in_progress"]');
    expect(inProgressItem?.textContent).toContain('Inspect findings');
  });

  test('remount preserves two-phase history without loss', async () => {
    await renderTray();
    await setTodos(twoPhaseTodos);
    expect(host.querySelector('[data-testid="todo-tray"]')).not.toBeNull();

    // Unmount TodoTray while keeping SyncProvider mounted
    await renderTray(SESSION_ID, DIR, false);
    expect(host.querySelector('[data-testid="todo-tray"]')).toBeNull();

    // Remount TodoTray
    await renderTray(SESSION_ID, DIR, true);
    const remountedTray = host.querySelector('[data-testid="todo-tray"]');
    expect(remountedTray).not.toBeNull();
    expect(remountedTray?.textContent).toContain('Inspect findings');
    expect(remountedTray?.textContent).toContain('1/3');
  });

  test('reacts to session.updated todos and clears the tray on todo_auto_clear even when transcript still has todo tool results', async () => {
    await renderTray();
    const historicalMsg = assistantTodoMessage('msg-1', twoPhaseTodos);
    await setTodos(twoPhaseTodos, [historicalMsg]);
    expect(tray()?.textContent).toContain('1/3');

    const partiallyUpdatedPhases: TodoPhase[] = [
      {
        name: 'Discovery',
        tasks: [
          { content: 'Search codebase', status: 'completed' },
          { content: 'Inspect findings', status: 'completed' },
        ],
      },
      {
        name: 'Execution',
        tasks: [
          { content: 'Apply modifications', status: 'in_progress' },
        ],
      },
    ];
    await act(async () => {
      directoryStore!.setState((prev) => applyDirectoryEvent(prev, {
        sessionId: SESSION_ID,
        epoch: 'epoch-a',
        sequence: '5',
        timestamp: 10,
        type: 'session.updated',
        todos: partiallyUpdatedPhases,
      }).state);
    });
    expect(tray()?.textContent).toContain('2/3');
    expect(tray()?.textContent).toContain('Apply modifications');

    // todo_auto_clear projects session.updated { todos: [] }: the tray leaves
    // even though the historical todo tool_result remains in the transcript.
    await act(async () => {
      directoryStore!.setState((prev) => applyDirectoryEvent(prev, {
        sessionId: SESSION_ID,
        epoch: 'epoch-a',
        sequence: '6',
        timestamp: 11,
        type: 'session.updated',
        todos: [],
      }).state);
    });
    expect(tray()).toBeNull();
    expect(directoryStore!.getState().message[SESSION_ID]).toHaveLength(1);

    // Every task closed on session.updated: the tray hides immediately without waiting for todo_auto_clear.
    await act(async () => {
      directoryStore!.setState((prev) => applyDirectoryEvent(prev, {
        sessionId: SESSION_ID,
        epoch: 'epoch-a',
        sequence: '7',
        timestamp: 12,
        type: 'session.updated',
        todos: updatedPhases,
      }).state);
    });
    expect(tray()).toBeNull();
  });

  test('renders null when snapshot has no todos or session is null, ignoring transcript tool details', async () => {
    await renderTray();
    await setTodos([], [assistantTodoMessage('msg-only-transcript', twoPhaseTodos)]);
    expect(host.querySelector('[data-testid="todo-tray"]')).toBeNull();

    await renderTray(null);
    expect(tray()).toBeNull();

    await renderTray(SESSION_ID);
    expect(tray()).toBeNull();
  });

  test('hides the tray for an empty snapshot and for a phase whose tasks were emptied', async () => {
    await renderTray();

    await setTodos([]);
    expect(tray()).toBeNull();

    await setTodos([{ name: '间距修正', tasks: [] }]);
    expect(tray()).toBeNull();

    await setTodos([{ name: 'A', tasks: [] }, { name: 'B', tasks: [] }]);
    expect(tray()).toBeNull();
  });

  test('counts only the real tasks of a mixed empty and populated snapshot', async () => {
    await renderTray();
    await setTodos([
      { name: 'Emptied phase', tasks: [] },
      {
        name: 'Real work',
        tasks: [
          { content: 'Done already', status: 'completed' },
          { content: 'Still running', status: 'in_progress' },
        ],
      },
    ]);

    const strip = tray();
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('Still running');
    expect(strip?.textContent).toContain('1/2');
    expect(strip?.textContent).not.toContain('0/0');
    expect(strip?.textContent).not.toContain('Emptied phase');
  });

  test('hides the tray when completed and abandoned tasks are all that is left', async () => {
    await renderTray();
    await setTodos([
      { name: 'Plan', tasks: [{ content: 'Shipped', status: 'completed' }, { content: 'Dropped', status: 'abandoned' }] },
      { name: 'Aftermath', tasks: [] },
    ]);

    expect(tray()).toBeNull();
  });

  test('keeps the tray while one task is still in progress after its siblings closed', async () => {
    await renderTray();
    await setTodos([
      { name: 'Plan', tasks: [{ content: 'Shipped', status: 'completed' }, { content: 'Dropped', status: 'abandoned' }] },
      { name: 'Now', tasks: [{ content: 'Keep working', status: 'in_progress' }] },
    ]);

    const strip = tray();
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('Keep working');
    expect(strip?.textContent).toContain('2/3');
  });

  test('names a pending task in the folded row while the tray stays visible', async () => {
    await renderTray();
    await setTodos([
      { name: 'Plan', tasks: [{ content: 'Wait on upstream fix', status: 'pending' }] },
    ]);

    const strip = tray();
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('Wait on upstream fix');
    expect(strip?.textContent).toContain('0/1');
  });
});
