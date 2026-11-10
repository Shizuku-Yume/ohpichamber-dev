<<<<<<< HEAD
import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import type { TodoSendExecution } from '../todoSendExecution';

const browser = new Window({ url: 'http://runtime.test' });
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, HTMLElement: browser.HTMLElement,
  Element: browser.Element, Node: browser.Node, ResizeObserver: browser.ResizeObserver,
  MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
=======
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { TodoSendExecution } from '../todoSendExecution';

const dom = new Window();
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: dom,
  document: dom.document,
  HTMLElement: dom.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
>>>>>>> bc50ba56a
})) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

<<<<<<< HEAD
// The stores and components read browser globals at import time.
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { switchRuntimeEndpoint } = await import('@/lib/runtime-switch');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const worktreeSessionCreator = await import('@/lib/worktreeSessionCreator');
const { useProjectTodoSend } = await import('./useProjectTodoSend');
const host = document.createElement('div');
document.body.append(host);
let root: Root | null = null;
const originalState = useSessionUIStore.getState();
const spies: Array<{ mockRestore(): void }> = [];
let action: { sendToNewSession: (id: string, text: string) => void; sendToNewWorktreeSession: (id: string, text: string) => void; confirmSend: (execution: TodoSendExecution) => Promise<void> };

function Harness() {
  action = useProjectTodoSend({ projectRef: { id: 'project', path: '/repo' }, canCreateWorktree: true });
  return null;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  useSessionUIStore.setState(originalState);
  for (const spy of spies.splice(0).reverse()) spy.mockRestore();
});
afterAll(async () => {
  await browser.happyDOM.close();
=======
type DirectoryDefaults = { agentName?: string; providerId: string; modelId: string; variant?: string | null };

const projectRef = { id: 'project-1', path: '/repo' };
const worktreeDirectory = '/repo/.oc/worktrees/quiet-otter/app';

let directoryDefaults: Record<string, DirectoryDefaults | null> = {};
const resolvedDirectories: string[] = [];
const sends: Array<{ providerID: string; modelID: string; agent?: string; variant?: string | null }> = [];
const savedSelections: string[] = [];
const createdSessions: string[] = [];

const sessionState = {
  currentSessionId: 'session-elsewhere',
  createSession: async (_title: string | undefined, directory: string) => {
    createdSessions.push(directory);
    return { id: 'session-plain', directory };
  },
  initializeNewOpenChamberSession: () => undefined,
  sendMessage: async (
    _content: string,
    providerID: string,
    modelID: string,
    agent?: string,
    _attachments?: readonly object[],
    _mention?: string,
    _parts?: readonly object[],
    variant?: string | null,
  ) => {
    sends.push({ providerID, modelID, agent, variant });
  },
  setCurrentSession: () => undefined,
};
const selectFrom = <T,>(state: T) => Object.assign(
  <R,>(selector: (value: T) => R): R => selector(state),
  { getState: () => state },
);

mock.module('@/components/ui', () => ({ toast: { success: () => undefined, error: () => undefined } }));
mock.module('@/lib/git/branchNameGenerator', () => ({ generateBranchName: () => 'quiet-otter' }));
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
mock.module('@/lib/magicPrompts', () => ({
  loadMagicPrompts: async () => ({ render: (key: string) => key }),
}));
mock.module('@/lib/worktreeSessionCreator', () => ({
  createWorktreeSessionForNewBranch: async () => ({
    id: 'session-worktree', branch: 'quiet-otter', path: '/repo/.oc/worktrees/quiet-otter', directory: worktreeDirectory,
  }),
}));
mock.module('@/stores/useConfigStore', () => ({
  useConfigStore: selectFrom({
    agents: [],
    resolveDirectoryDefaultSelection: async (directory: string) => {
      resolvedDirectories.push(directory);
      return directoryDefaults[directory] ?? null;
    },
  }),
}));
mock.module('@/stores/useUIStore', () => ({ useUIStore: selectFrom({ setSessionSwitcherOpen: () => undefined }) }));
mock.module('@/sync/input-store', () => ({ useInputStore: selectFrom({ setPendingInputText: () => undefined }) }));
mock.module('@/sync/session-ui-store', () => ({ useSessionUIStore: selectFrom(sessionState) }));
mock.module('@/sync/selection-store', () => ({
  useSelectionStore: {
    getState: () => ({
      saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => {
        savedSelections.push(`${sessionId} model ${providerId}/${modelId}`);
      },
      saveSessionAgentSelection: (sessionId: string, agent: string) => {
        savedSelections.push(`${sessionId} agent ${agent}`);
      },
      saveAgentModelForSession: () => undefined,
      saveAgentModelVariantForSession: (sessionId: string, agent: string, providerId: string, modelId: string, variant: string | undefined) => {
        savedSelections.push(`${sessionId} variant ${agent} ${providerId}/${modelId} ${variant ?? '-'}`);
      },
    }),
  },
}));

const { createRoot } = await import('react-dom/client');
const { useProjectTodoSend } = await import('./useProjectTodoSend');

type Send = ReturnType<typeof useProjectTodoSend>;

const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
let latest: Send | null = null;

function Probe() {
  latest = useProjectTodoSend({ projectRef, canCreateWorktree: true });
  return null;
}

const send = async (kind: 'worktree' | 'session', execution: TodoSendExecution) => {
  await act(async () => root.render(<Probe />));
  await act(async () => {
    if (kind === 'worktree') latest?.sendToNewWorktreeSession('todo-1', 'Fix the bug');
    else latest?.sendToNewSession('todo-1', 'Fix the bug');
  });
  await act(async () => { await latest?.confirmSend(execution); });
};

// What the dialog captured from the composer of another project.
const capturedElsewhere = (picked: TodoSendExecution['picked']): TodoSendExecution => ({
  providerID: 'other', modelID: 'stale-model', variant: 'low', agent: 'build', picked,
});

beforeEach(() => {
  directoryDefaults = {};
  resolvedDirectories.length = 0;
  sends.length = 0;
  savedSelections.length = 0;
  createdSessions.length = 0;
});

afterAll(() => {
  act(() => root.unmount());
>>>>>>> bc50ba56a
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

<<<<<<< HEAD
test('new-session todo sends project overrides from one snapshot, not global prompts', async () => {
  switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime.test', runtimeKey: 'todo-prompt-test' });
  const session: Session = { sessionId: 'todo-session', rootSessionId: 'todo-session', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0' };
  const create = async () => session;
  const sent: Array<{ visible: string; instructions: string | undefined }> = [];
  useSessionUIStore.setState({
    createSession: create,
    setCurrentSession: () => {},
    sendMessage: async (visible, _provider, _model, _agent, _attachments, _mention, parts) => {
      sent.push({ visible, instructions: parts?.[0]?.text });
    },
  });
  const promptReads: Array<string | null> = [];
  spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://runtime.test');
    if (url.pathname !== '/api/magic-prompts') return Response.json({});
    const directory = url.searchParams.get('sessionDirectory');
    promptReads.push(directory);
    return Response.json({ version: 1, overrides: directory === '/repo'
      ? { 'plan.todo.visible': 'Project {{todo_text}}', 'plan.todo.instructions': 'Project instructions {{todo_text}}' }
      : { 'plan.todo.visible': 'Global {{todo_text}}', 'plan.todo.instructions': 'Global instructions' } });
  }));
  root = createRoot(host);
  await act(async () => root?.render(<I18nProvider><Harness /></I18nProvider>));
  await act(async () => action.sendToNewSession('todo', 'ship'));
  await act(async () => action.confirmSend({ providerID: 'provider', modelID: 'model', variant: '', agent: '', picked: { model: false, variant: false, agent: false } }));
  expect(promptReads).toEqual(['/repo']);
  expect(sent).toEqual([{ visible: 'Project ship', instructions: 'Project instructions ship' }]);
});

test('worktree todo reads prompts and routes to the created nested project directory', async () => {
  switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime.test', runtimeKey: 'todo-nested' });
  spies.push(spyOn(worktreeSessionCreator, 'createWorktreeSessionForNewBranch').mockResolvedValue({ id: 'nested-session', branch: 'branch', path: '/trees/branch', directory: '/trees/branch/subdir' }));
  const selected: unknown[] = [];
  const sent: unknown[] = [];
  useSessionUIStore.setState({
    setCurrentSession: (id, directory) => { selected.push([id, directory]); },
    sendMessage: async (visible, _provider, _model, _agent, _attachments, _mention, parts, _variant, _metadata, options) => { sent.push([visible, parts?.[0]?.text, options?.target]); },
  });
  const reads: Array<string | null> = [];
  spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://runtime.test');
    if (url.pathname !== '/api/magic-prompts') return Response.json({});
    const directory = url.searchParams.get('sessionDirectory'); reads.push(directory);
    return Response.json({ version: 1, overrides: directory === '/trees/branch/subdir' ? { 'plan.todo.visible': 'Nested {{todo_text}}', 'plan.todo.instructions': 'Nested instructions' } : { 'plan.todo.visible': 'Wrong scope' } });
  }));
  root = createRoot(host);
  await act(async () => root?.render(<I18nProvider><Harness /></I18nProvider>));
  await act(async () => action.sendToNewWorktreeSession('todo', 'ship'));
  await act(async () => action.confirmSend({ providerID: 'provider', modelID: 'model', variant: '', agent: '', picked: { model: false, variant: false, agent: false } }));
  expect(reads).toEqual(['/trees/branch/subdir']);
  expect(selected).toEqual([['nested-session', '/trees/branch/subdir']]);
  expect(sent).toEqual([['Nested ship', 'Nested instructions', { runtimeKey: 'todo-nested', sessionId: 'nested-session', directory: '/trees/branch/subdir' }]]);
});

test.each(['creation', 'prompts'])('todo send stops after an A-B-A runtime switch during %s', async (stage) => {
  switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime.test', runtimeKey: 'todo-aba' });
  const session: Session = { sessionId: 'todo-session', rootSessionId: 'todo-session', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0' };
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { started = resolve; });
  const sent: string[] = [];
  const selected: string[] = [];
  useSessionUIStore.setState({
    createSession: async () => { if (stage === 'creation') { started(); await pending; } return session; },
    setCurrentSession: (id) => { if (id) selected.push(id); },
    sendMessage: async (visible) => { sent.push(visible); },
  });
  spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://runtime.test');
    if (url.pathname !== '/api/magic-prompts') return Response.json({});
    if (stage === 'prompts') { started(); await pending; }
    return Response.json({ version: 1, overrides: { 'plan.todo.visible': 'Project {{todo_text}}' } });
  }));
  root = createRoot(host);
  await act(async () => root?.render(<I18nProvider><Harness /></I18nProvider>));
  await act(async () => action.sendToNewSession('todo', 'ship'));
  let operation!: Promise<void>;
  await act(async () => { operation = action.confirmSend({ providerID: 'provider', modelID: 'model', variant: '', agent: '', picked: { model: false, variant: false, agent: false } }); await reached; });
  switchRuntimeEndpoint({ apiBaseUrl: 'http://other.test', runtimeKey: 'todo-other' });
  switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime.test', runtimeKey: 'todo-aba' });
  await act(async () => { release(); await operation; });
  expect(selected).toEqual([]);
  expect(sent).toEqual([]);
=======
test('a new worktree session starts on the defaults of the directory it lands in', async () => {
  directoryDefaults[worktreeDirectory] = { agentName: 'plan', providerId: 'anthropic', modelId: 'claude', variant: 'high' };

  await send('worktree', capturedElsewhere({ model: false, variant: false, agent: false }));

  expect(resolvedDirectories).toEqual([worktreeDirectory]);
  expect(sends).toEqual([{ providerID: 'anthropic', modelID: 'claude', agent: 'plan', variant: 'high' }]);
  expect(savedSelections).toEqual([
    'session-worktree model anthropic/claude',
    'session-worktree agent plan',
    'session-worktree variant plan anthropic/claude high',
  ]);
});

test('a pick made in the dialog wins over the directory defaults', async () => {
  directoryDefaults[worktreeDirectory] = { agentName: 'plan', providerId: 'anthropic', modelId: 'claude', variant: 'high' };

  await send('worktree', capturedElsewhere({ model: true, variant: false, agent: false }));

  // The picked model keeps the effort the dialog chose for it; the agent follows the directory.
  expect(sends).toEqual([{ providerID: 'other', modelID: 'stale-model', agent: 'plan', variant: 'low' }]);
});

test('an agent the directory cannot name yet is left to OpenCode for that directory', async () => {
  directoryDefaults[worktreeDirectory] = { providerId: 'anthropic', modelId: 'claude' };

  await send('worktree', capturedElsewhere({ model: false, variant: false, agent: false }));

  expect(sends).toEqual([{ providerID: 'anthropic', modelID: 'claude', agent: undefined, variant: undefined }]);
  expect(savedSelections).toEqual(['session-worktree model anthropic/claude']);
});

test('a session in the project itself sends what the dialog shows', async () => {
  await send('session', capturedElsewhere({ model: false, variant: false, agent: false }));

  expect(resolvedDirectories).toEqual([]);
  expect(createdSessions).toEqual(['/repo']);
  expect(sends).toEqual([{ providerID: 'other', modelID: 'stale-model', agent: 'build', variant: 'low' }]);
>>>>>>> bc50ba56a
});
