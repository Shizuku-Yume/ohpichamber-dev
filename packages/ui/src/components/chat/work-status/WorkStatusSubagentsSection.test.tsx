import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ApprovalRequest, QuestionRequest, Session } from '@openchamber/agent-contract';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { useSessionActivityTimingStore } from '@/sync/session-activity-timing';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';
import type { State } from '@/sync/types';
import type { WorkStatusSubagentsSection as WorkStatusSubagentsSectionType } from './WorkStatusSubagentsSection';

let WorkStatusSubagentsSection: typeof WorkStatusSubagentsSectionType;
const directory = '/subagent-test';
const session = (sessionId: string, overrides: Partial<Session> = {}): Session => ({
  sessionId,
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: 'subagent-test',
  rootSessionId: 'parent',
  createdAt: 1,
  updatedAt: 1,
  epoch: 'epoch',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
  ...overrides,
});
const parent = session('parent', { rootSessionId: 'parent' });
const child = session('child', { parentSessionId: parent.sessionId, createdAt: 2, updatedAt: 2, title: 'Child', metadata: {}, metadataRevision: '1' });

const childApproval: ApprovalRequest = {
  version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'approval', sessionId: 'child', turnId: 'run', toolCallId: 'tool',
  toolName: 'bash', actionType: 'bash_command', commandSummary: 'bash', details: {}, status: 'pending', requestedAt: 1,
};
const childQuestion: QuestionRequest = {
  version: '1', epoch: 'epoch', workerGeneration: 'worker', questionId: 'question', sessionId: 'child', turnId: 'run',
  prompt: 'Question', status: 'pending', requestedAt: 1,
};

describe('subagent status rows', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;
  const render = async () => {
    await act(async () => root.render(
      <SyncProvider directory={directory}>
        <I18nProvider><WorkStatusSubagentsSection sessionId={parent.sessionId} directory={directory} /></I18nProvider>
      </SyncProvider>,
    ));
  };
  const publish = async (patch: Partial<State>) => {
    const store = getSyncChildStores().getChild(directory);
    if (!store) throw new Error('Expected directory store');
    await act(async () => store.setState(patch));
  };
  // Every row's button, without the heading's button that opens the panel.
  const rowButtons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
    .filter((button) => button.getAttribute('aria-label') !== 'Open in the Subagents panel');
  const row = () => {
    const button = rowButtons()[0];
    if (!button) throw new Error('Expected subagent row');
    return button;
  };
  // The row's button is stretched under its content, so the icon and text
  // live in the row element around it.
  const rowContent = () => row().parentElement ?? row();
  const icon = () => rowContent().querySelector('use')?.getAttribute('href');
  beforeEach(async () => {
    win = new Window({ url: 'http://localhost' });
    const values = {
      window: win, document: win.document, navigator: win.navigator,
      Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement,
      HTMLIFrameElement: win.HTMLIFrameElement, localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: win.ResizeObserver,
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous: Array<[string, PropertyDescriptor | undefined]> = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restoreGlobals = () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    };
    ({ WorkStatusSubagentsSection } = await import('./WorkStatusSubagentsSection'));
    useUIStore.setState({ workStatusExpandedSections: {} });
    useSessionActivityTimingStore.setState({ startedAt: new Map(), settledMs: new Map() });
<<<<<<< HEAD
||||||| bc50ba56aa
    useGlobalSessionStatusStore.setState({ observedById: new Map(), statusById: new Map() });
=======
    useGlobalSessionStatusStore.setState({ observedById: new Map(), statusById: new Map() });
    useGlobalSessionsStore.getState().applySnapshot([], []);
    useProjectsStore.setState({ projects: [] });
>>>>>>> upstream/main
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await render();
    await publish({ session: [parent, child], session_status: {}, sessionStatusReady: false });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('distinguishes unknown, running and settled status with Tasks icons', async () => {
    expect(icon()).toBe('#oc-time');
    await publish({ sessionStatusReady: true });
    expect(icon()).toBe('#oc-checkbox-circle');
    await publish({ session_status: { child: 'running' } });
    expect(icon()).toBe('#oc-record-circle');
    expect(rowContent().textContent).toBe('Child');
    expect(row().getAttribute('aria-label')).toContain('is working');
    await publish({ session_status: { child: 'running' } });
    expect(icon()).toBe('#oc-record-circle');
    expect(container.textContent).toContain('1/1');
    await publish({ session_status: { child: 'idle' } });
    expect(icon()).toBe('#oc-checkbox-circle');
<<<<<<< HEAD
    expect(rowContent().textContent).toBe('Child');
||||||| bc50ba56aa
    expect(rowContent().textContent).toBe('Child$0.25');
=======
    expect(rowContent().textContent).toBe('Child$0.250s');
>>>>>>> upstream/main
    expect(row().getAttribute('aria-label')).toContain('Done');
  });

  test('marks a subagent whose last turn failed instead of calling it done', async () => {
    await publish({ sessionStatusReady: true, session_status: { child: 'idle' } });
    expect(icon()).toBe('#oc-checkbox-circle');
    await act(async () => useGlobalSessionStatusStore.setState({
      observedById: new Map([['child', { directory, outcome: 'failed' }]]),
    }));
    expect(icon()).toBe('#oc-close-circle');
    expect(row().getAttribute('aria-label')).toContain('Failed');
  });

  test('keeps permission and question blockers ahead of the running timer', async () => {
    await act(async () => useSessionActivityTimingStore.setState({ startedAt: new Map([['child', Date.now() - 83000]]) }));
    await publish({
      session_status: { child: 'running' },
      permission: { child: [childApproval] },
      form: { child: [childQuestion] },
    });
    expect(icon()).toBe('#oc-alert');
    expect(rowContent().textContent).toContain('needs permission');
    expect(rowContent().querySelector('span[title]')).toBeNull();
    await publish({ permission: {} });
    expect(icon()).toBe('#oc-alert');
    expect(rowContent().textContent).toContain('asked a question');
    expect(rowContent().querySelector('span[title]')).toBeNull();
    await publish({ form: {} });
    expect(icon()).toBe('#oc-record-circle');
    expect(rowContent().querySelector('span[title]')).not.toBeNull();
  });

  test('orders rows newest first by creation and sinks finished ones', async () => {
<<<<<<< HEAD
    const older = session('older', { parentSessionId: parent.sessionId, createdAt: 2, updatedAt: 50, title: 'Older', metadata: {}, metadataRevision: '1' });
    const newer = session('newer', { parentSessionId: parent.sessionId, createdAt: 3, updatedAt: 10, title: 'Newer', metadata: {}, metadataRevision: '1' });
    const titles = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
      .map((button) => button.parentElement?.textContent?.replace(/\$.*$/, ''));
||||||| bc50ba56aa
    const older: Session = { ...child, id: 'older', title: 'Older', time: { created: 2, updated: 50 } };
    const newer: Session = { ...child, id: 'newer', title: 'Newer', time: { created: 3, updated: 10 } };
    const titles = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
      .map((button) => button.parentElement?.textContent?.replace(/\$.*$/, ''));
=======
    const older: Session = { ...child, id: 'older', title: 'Older', time: { created: 2, updated: 50 } };
    const newer: Session = { ...child, id: 'newer', title: 'Newer', time: { created: 3, updated: 10 } };
    const titles = () => rowButtons().map((button) => button.parentElement?.textContent?.replace(/\$.*$/, ''));
>>>>>>> upstream/main
    await publish({
      session: [parent, older, newer],
      sessionStatusReady: true,
      session_status: { older: 'running', newer: 'running' },
    });
    // Later activity on the older row does not lift it above the newer one.
    expect(titles()).toEqual(['Newer', 'Older']);
    await publish({ session_status: { older: 'running', newer: 'idle' } });
    expect(titles()).toEqual(['Older', 'Newer']);
    await publish({ session_status: { older: 'idle', newer: 'idle' } });
    expect(titles()).toEqual(['Newer', 'Older']);
  });

<<<<<<< HEAD
||||||| bc50ba56aa
  test('keeps a running row above rows whose status is still unknown', async () => {
    const older: Session = { ...child, id: 'older', title: 'Older', time: { created: 2, updated: 2 } };
    const newer: Session = { ...child, id: 'newer', title: 'Newer', time: { created: 3, updated: 3 } };
    const titles = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
      .map((button) => button.parentElement?.textContent?.replace(/\$.*$/, ''));
    await publish({ session: [parent, older, newer], session_status: { older: { type: 'busy' } } });
    expect(titles()).toEqual(['Older', 'Newer']);
  });

  test('settles a child whose directory differs only in formatting from the panel', async () => {
    await publish({ session: [parent, { ...child, directory: `${directory}/` }], sessionStatusReady: true });
    expect(icon()).toBe('#oc-checkbox-circle');
    await publish({ sessionStatusInvalidated: { child: true } });
    expect(icon()).toBe('#oc-time');
  });

  test('settles a child that moved to another worktree from the panel snapshot', async () => {
    // The host's list of running sessions covers every host directory, so a
    // reload after the child finished there still shows it done.
    await publish({ session: [parent, { ...child, directory: '/subagent-test-worktree' }] });
    expect(icon()).toBe('#oc-time');
    await publish({ sessionStatusReady: true });
    expect(icon()).toBe('#oc-checkbox-circle');
    await publish({ session_status: { child: { type: 'busy' } } });
    expect(icon()).toBe('#oc-record-circle');
  });

  test('settles a child the global status store saw finish', async () => {
    // A space answers for its own sessions, so the host panel's snapshot
    // does not cover a child inside one.
    const spaceDirectory = '/spaces/0123456789ab/app';
    await publish({ session: [parent, { ...child, directory: spaceDirectory }], sessionStatusReady: true });
    expect(icon()).toBe('#oc-time');
    await act(async () => useGlobalSessionStatusStore.setState({
      observedById: new Map([['child', { directory: spaceDirectory, outcome: 'completed' }]]),
    }));
    expect(icon()).toBe('#oc-checkbox-circle');
  });

=======
  test('shows a child that lives in a folder without a live store, with its agent and model from the session list', async () => {
    const worker: Session = { ...child, id: 'worker', title: 'Worker', directory: '/elsewhere', agent: 'build', model: { providerID: 'claude-agent', id: 'opus' } };
    await publish({ session: [parent] });
    expect(rowButtons()).toEqual([]);
    await act(async () => useGlobalSessionsStore.getState().applySnapshot([parent, worker], []));
    expect(rowContent().textContent).toContain('Worker');
    expect(rowContent().textContent).toContain('build · Opus');
    // A folder outside every project dims the row; the parent's folder does not.
    await act(async () => useProjectsStore.setState({ projects: [{ id: 'project', path: directory }] }));
    expect(rowContent().className).toContain('opacity-50');
    // Its requests sit in the cross-folder index, not in the parent's store.
    await act(async () => useGlobalBlockingRequestsStore.setState({ bySession: new Map([['worker', {
      directory: '/elsewhere',
      permissions: [{ id: 'permission', sessionID: 'worker', action: 'bash', resources: ['*'] }],
      forms: [],
      pages: [],
    }]]) }));
    expect(rowContent().textContent).toContain('needs permission');
    await act(async () => useGlobalBlockingRequestsStore.setState({ bySession: new Map() }));
    // The live record wins once a store holds it, and keeps the model the list knows.
    await publish({ session: [parent, { ...worker, title: 'Worker live', model: undefined }] });
    expect(rowContent().textContent).toContain('Worker live');
    expect(rowContent().textContent).toContain('build · Opus');
  });

  test('renders a child seeded from the session cache without usage counters', async () => {
    const { tokens: _tokens, cost: _cost, ...cached } = { ...child, id: 'cached', title: 'Cached' };
    // SAFETY: the session cache stores records without `cost` and `tokens`, and seeds them as `Session` before bootstrap.
    await publish({ session: [parent, cached as Session] });
    expect(rowContent().textContent).toBe('Cached');
  });

  test('keeps a running row above rows whose status is still unknown', async () => {
    const older: Session = { ...child, id: 'older', title: 'Older', time: { created: 2, updated: 2 } };
    const newer: Session = { ...child, id: 'newer', title: 'Newer', time: { created: 3, updated: 3 } };
    const titles = () => rowButtons().map((button) => button.parentElement?.textContent?.replace(/\$.*$/, ''));
    await publish({ session: [parent, older, newer], session_status: { older: { type: 'busy' } } });
    expect(titles()).toEqual(['Older', 'Newer']);
  });

  test('settles a child whose directory differs only in formatting from the panel', async () => {
    await publish({ session: [parent, { ...child, directory: `${directory}/` }], sessionStatusReady: true });
    expect(icon()).toBe('#oc-checkbox-circle');
    await publish({ sessionStatusInvalidated: { child: true } });
    expect(icon()).toBe('#oc-time');
  });

  test('settles a child that moved to another worktree from the panel snapshot', async () => {
    // The host's list of running sessions covers every host directory, so a
    // reload after the child finished there still shows it done.
    await publish({ session: [parent, { ...child, directory: '/subagent-test-worktree' }] });
    expect(icon()).toBe('#oc-time');
    await publish({ sessionStatusReady: true });
    expect(icon()).toBe('#oc-checkbox-circle');
    await publish({ session_status: { child: { type: 'busy' } } });
    expect(icon()).toBe('#oc-record-circle');
  });

  test('settles a child the global status store saw finish', async () => {
    // A space answers for its own sessions, so the host panel's snapshot
    // does not cover a child inside one.
    const spaceDirectory = '/spaces/0123456789ab/app';
    await publish({ session: [parent, { ...child, directory: spaceDirectory }], sessionStatusReady: true });
    expect(icon()).toBe('#oc-time');
    await act(async () => useGlobalSessionStatusStore.setState({
      observedById: new Map([['child', { directory: spaceDirectory, outcome: 'completed' }]]),
    }));
    expect(icon()).toBe('#oc-checkbox-circle');
  });

>>>>>>> upstream/main
  test('shows an observed current-turn duration only while running and expanded', async () => {
    await publish({ session_status: { child: 'running' } });
    expect(rowContent().querySelector('span[title]')).toBeNull();
    await act(async () => useSessionActivityTimingStore.setState({ startedAt: new Map([['child', Date.now() - 83000]]) }));
    expect(/^1m 2[34]s$/.test(rowContent().querySelector('span[title]')?.textContent ?? '')).toBe(true);
    await act(async () => useUIStore.getState().setWorkStatusSectionExpanded('subagents', false));
    expect(container.querySelector('span[title]')).toBeNull();
    await act(async () => useUIStore.getState().setWorkStatusSectionExpanded('subagents', true));
    expect(rowContent().querySelector('span[title]')).not.toBeNull();
    await publish({ session_status: { child: 'idle' } });
    expect(rowContent().querySelector('span[title]')).toBeNull();
  });

  test('names who works without the call it makes, and who a finished one was', async () => {
    // The agent is set when OpenCode creates the session.
    const worker: Session = { ...child, id: 'worker', title: 'Worker', agent: 'explore' };
    await publish({
      session: [parent, worker],
      session_status: { worker: { type: 'busy' } },
      message: { worker: [{ id: 's1', sessionID: 'worker', role: 'assistant', time: { created: Date.now() }, agent: 'explore', providerID: 'p', modelID: 'm' }] },
      part: { s1: [{ id: 't1', sessionID: 'worker', messageID: 's1', type: 'tool', callID: 't1', tool: 'grep', state: { status: 'running', input: { pattern: 'evaluate' }, time: { start: Date.now() } } }] },
    });
    // The call changes too often to read in a row; the panel shows it.
    expect(rowContent().textContent).toContain('explore');
    expect(rowContent().textContent).not.toContain('Search Files');
    await publish({
      session_status: { worker: { type: 'idle' } },
      message: {
        worker: [],
        parent: [{
          id: 'report',
          sessionID: 'parent',
          role: 'synthetic',
          time: { created: 2 },
          text: '<subagent sessionID="worker" state="completed">\n## Two ADRs are stale\n\nDetails\n</subagent>',
          metadata: { source: 'subagent', childID: 'worker', state: 'completed' },
        }],
      },
    });
    // The row keeps who ran it; the report lives in the tooltip and the panel.
    expect(rowContent().textContent).toContain('explore0s');
    expect(rowContent().textContent).not.toContain('Two ADRs are stale');
  });

  test('counts the tokens a subagent spent, without the cache it re-read every step', async () => {
    const reader: Session = { ...child, id: 'reader', title: 'Reader', cost: 0, tokens: { input: 112762, output: 3217, reasoning: 1947, cache: { read: 2165888, write: 0 } } };
    await publish({ session: [parent, reader], sessionStatusReady: true, session_status: { reader: { type: 'idle' } } });
    expect(rowContent().textContent).toContain('117.9K');
    expect(rowContent().textContent).not.toContain('2.3M');
  });

  test('still says when a working subagent has gone silent', async () => {
    const worker: Session = { ...child, id: 'worker', title: 'Worker', agent: 'explore' };
    await publish({
      session: [parent, worker],
      session_status: { worker: { type: 'busy' } },
      message: { worker: [{ id: 's1', sessionID: 'worker', role: 'assistant', time: { created: Date.now() - 200_000 }, agent: 'explore', providerID: 'p', modelID: 'm' }] },
      part: { s1: [] },
    });
    expect(rowContent().textContent).toContain('Silent for');
  });

  test('opens the Subagents panel from its heading', async () => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open in the Subagents panel"]');
    if (!button) throw new Error('Expected the panel button');
    await act(async () => button.click());
    const tabs = useUIStore.getState().contextPanelByDirectory[directory]?.tabs ?? [];
    expect(tabs.some((tab) => tab.mode === 'subagents')).toBe(true);
  });
});
