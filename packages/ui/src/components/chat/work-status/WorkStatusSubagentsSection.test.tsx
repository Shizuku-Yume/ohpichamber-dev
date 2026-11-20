import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ApprovalRequest, QuestionRequest, Session } from '@openchamber/agent-contract';
import { SessionSnapshotSchema } from '@openchamber/agent-contract';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { useSessionActivityTimingStore } from '@/sync/session-activity-timing';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
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
      HTMLInputElement: win.HTMLInputElement, HTMLButtonElement: win.HTMLButtonElement,
      DocumentFragment: win.DocumentFragment, NodeFilter: win.NodeFilter, MutationObserver: win.MutationObserver,
      Event: win.Event, CustomEvent: win.CustomEvent,
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
    useGlobalSessionStatusStore.setState({ observedById: new Map(), statusById: new Map() });
    useGlobalSessionsStore.getState().applySnapshot([], []);
    useProjectsStore.setState({ projects: [] });
    useSubagentsStore.setState({ byParent: {} });
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
    expect(rowContent().textContent).toBe('Child');
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
    const older = session('older', { parentSessionId: parent.sessionId, createdAt: 2, updatedAt: 50, title: 'Older', metadata: {}, metadataRevision: '1' });
    const newer = session('newer', { parentSessionId: parent.sessionId, createdAt: 3, updatedAt: 10, title: 'Newer', metadata: {}, metadataRevision: '1' });
    const titles = () => rowButtons().map((button) => button.parentElement?.textContent?.replace(/\$.*$/, ''));
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
    const worker: Session = { ...child, sessionId: 'worker', title: 'Worker' };
    await act(async () => useSubagentsStore.getState().setSubagents(parent.sessionId, [{
      subagentId: 'worker-task', parentSessionId: parent.sessionId, childSessionId: worker.sessionId, role: 'explore', status: 'running',
    }]));
    await publish({
      session: [parent, worker],
      sessionStatusReady: true,
      session_status: { worker: 'running' },
    });
    // The call changes too often to read in a row; the panel shows it.
    expect(rowContent().textContent).toContain('explore');
    expect(rowContent().textContent).not.toContain('Search Files');
    await publish({
      session_status: { worker: 'idle' },
    });
    // The row keeps who ran it; the report lives in the tooltip and the panel.
    expect(rowContent().textContent).toContain('explore');
    expect(rowContent().textContent).not.toContain('Two ADRs are stale');
  });

  test('renders the canonical subagent token count without reconstructing session counters', async () => {
    const reader: Session = { ...child, sessionId: 'reader', title: 'Reader' };
    await act(async () => useSubagentsStore.getState().setSubagents(parent.sessionId, [{
      subagentId: 'reader-task', parentSessionId: parent.sessionId, childSessionId: reader.sessionId, role: 'reader', status: 'completed', tokens: 117926,
    }]));
    await publish({ session: [parent, reader], sessionStatusReady: true, session_status: { reader: 'idle' } });
    expect(rowContent().textContent).toContain('117.9K');
    expect(rowContent().textContent).not.toContain('2.3M');
  });

  test('still says when a working subagent has gone silent', async () => {
    const worker: Session = { ...child, sessionId: 'worker', title: 'Worker', runtimeStatus: 'running', activeRunId: 'run' };
    const { metadata: _metadata, metadataRevision: _metadataRevision, archiveRevision: _archiveRevision, ...runtimeWorker } = worker;
    const quietAt = Date.now() - 200_000;
    const snapshot = SessionSnapshotSchema.parse({
      session: runtimeWorker, cursor: 'epoch:0', activeRun: { runId: 'run', sessionId: worker.sessionId, origin: 'host', status: 'running', createdAt: quietAt },
      branch: { branchId: 'branch', branchVersion: '1', leafMessageId: 's1' },
      window: { firstTurnId: 'turn', lastTurnId: 'turn', firstMessageId: 's1', lastMessageId: 's1', hasEarlier: false },
      turns: [{ turnId: 'turn', runId: 'run', sessionId: worker.sessionId, status: 'running', userMessageId: 'prompt', assistantMessageIds: ['s1'], startedAt: quietAt }],
      messages: [{ messageId: 's1', sessionId: worker.sessionId, turnId: 'turn', role: 'assistant', createdAt: quietAt, parts: [] }],
      approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    });
    await publish({
      session: [parent, worker],
      sessionStatusReady: true,
      session_status: { worker: 'running' },
      message: { worker: snapshot.messages },
      snapshot: { worker: snapshot },
    });
    expect(rowContent().textContent).toContain('Silent for');
    await publish({ session: [parent, { ...worker, activeRunId: 'next-run' }] });
    expect(rowContent().textContent).not.toContain('Silent for');
  });

  test('opens the canonical Agent Hub from its heading action', async () => {
    const button = container.querySelector<HTMLButtonElement>('button[title="Subagents"]');
    if (!button) throw new Error('Expected the panel button');
    await act(async () => button.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
