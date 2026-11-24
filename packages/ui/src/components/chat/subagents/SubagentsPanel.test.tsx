import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ApprovalRequest, Session, Subagent } from '@openchamber/agent-contract';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import type { State } from '@/sync/types';
import { SubagentsPanel } from './SubagentsPanel';

const directory = '/subagent-panel-test';
const parent = {
  sessionId: 'parent',
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: 'subagent-panel-test',
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
} satisfies Session;

const liveSubagent = (overrides: Partial<Subagent> = {}): Subagent => ({
  subagentId: 'BetaWorker-2',
  parentSessionId: parent.sessionId,
  childSessionId: 'child-uuid',
  role: 'task',
  status: 'running',
  activeTool: 'bash',
  activeToolCallId: 'call_bash_b',
  ...overrides,
});

// The Agent Service attributes a child worker's approval to the root session
// and stamps the child linkage; the panel resolves it to this row.
const linkedApproval: ApprovalRequest = {
  version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a-child', sessionId: parent.sessionId, turnId: 'run', toolCallId: 'call_bash_b',
  toolName: 'bash', actionType: 'bash_command', commandSummary: 'sleep 12 && ls', details: {}, status: 'pending', requestedAt: 1,
  subagentId: 'BetaWorker-2', childSessionId: 'child-uuid',
};

describe('SubagentsPanel', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;
  const render = async () => {
    await act(async () => root.render(
      <SyncProvider directory={directory}>
        <I18nProvider><SubagentsPanel directory={directory} /></I18nProvider>
      </SyncProvider>,
    ));
  };
  const publish = async (patch: Partial<State>) => {
    const store = getSyncChildStores().getChild(directory);
    if (!store) throw new Error('Expected directory store');
    await act(async () => store.setState(patch));
  };
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
    useUIStore.setState({ workStatusExpandedSections: {} });
    useGlobalSessionStatusStore.setState({ observedById: new Map(), statusById: new Map() });
    useGlobalSessionsStore.getState().applySnapshot([], []);
    useProjectsStore.setState({ projects: [] });
    useSubagentsStore.setState({ byParent: {} });
    await act(async () => useSessionUIStore.setState({ currentSessionId: parent.sessionId }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => useSubagentsStore.setState({ byParent: { [parent.sessionId]: [liveSubagent()] } }));
    await render();
    await publish({ session: [parent], session_status: {}, sessionStatusReady: false });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await act(async () => useSessionUIStore.setState({ currentSessionId: null }));
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('renders a live subagent row', () => {
    expect(container.textContent).toContain('BetaWorker-2');
    expect(container.textContent).toContain('0/1');
  });

  test('a root-keyed child approval blocks the row and auto-expands its PermissionCard', async () => {
    await publish({ permission: { [parent.sessionId]: [linkedApproval] } });
    const rowButton = container.querySelector<HTMLButtonElement>('button[aria-label]');
    expect(rowButton?.getAttribute('aria-label')).toContain('needs permission');
    expect(rowButton?.getAttribute('aria-expanded')).toBe('true');
    // The expanded card renders the linked approval inside the subagent tile,
    // with the same actions the root-timeline card offers.
    expect(container.textContent).toContain('sleep 12 && ls');
    const deny = Array.from(container.querySelectorAll('button')).find((button) => /deny/i.test(button.textContent ?? ''));
    expect(deny).toBeDefined();
  });

  test('a root-keyed child approval resolves by toolCallId when linkage fields are absent', async () => {
    const { subagentId: _omitSub, childSessionId: _omitChild, ...unlinked } = linkedApproval;
    await publish({ permission: { [parent.sessionId]: [unlinked] } });
    const rowButton = container.querySelector<HTMLButtonElement>('button[aria-label]');
    expect(rowButton?.getAttribute('aria-label')).toContain('needs permission');
    expect(container.textContent).toContain('sleep 12 && ls');
  });

  test('an unlinked root approval does not expand the sibling row', async () => {
    const { subagentId: _omitSub2, childSessionId: _omitChild2, ...base } = linkedApproval;
    const other: ApprovalRequest = { ...base, approvalId: 'a-root', toolCallId: 'call_root' };
    await publish({ permission: { [parent.sessionId]: [other] } });
    const rowButton = container.querySelector<HTMLButtonElement>('button[aria-label]');
    expect(rowButton?.getAttribute('aria-label')).not.toContain('needs permission');
    expect(rowButton?.getAttribute('aria-expanded')).toBe('false');
  });

  test('a root-keyed child question marks the row asked and auto-expands its FormCard', async () => {
    await publish({
      form: {
        [parent.sessionId]: [{
          version: '1', epoch: 'epoch', workerGeneration: 'worker',
          questionId: 'q-child', sessionId: parent.sessionId, turnId: 'run',
          prompt: 'Which target?', status: 'pending', requestedAt: 1,
          subagentId: 'BetaWorker-2', childSessionId: 'child-uuid',
          schema: { type: 'omp.ask', questions: [{ id: 'target', question: 'Which target?', options: [{ label: 'Web' }] }] },
        }],
      },
    });
    const rowButton = container.querySelector<HTMLButtonElement>('button[aria-label]');
    expect(rowButton?.getAttribute('aria-label')).toContain('asked a question');
    expect(rowButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Which target?');
  });

  test('renders a vibe_spawn worker with prompt, report, tokens/cost/duration, and opens chat tab on click', async () => {
    const vibeWorker = liveSubagent({
      subagentId: 'home-disk-usage-2',
      childSessionId: 'vibe-child-uuid',
      name: 'home-disk-usage-2',
      role: 'sonic',
      model: 'openai/gpt-5.4-mini',
      status: 'completed',
      tokens: 4200,
      cost: 0.0042,
      durationMs: 3200,
      toolCallId: undefined,
    });
    const vibeParentMsg = {
      messageId: 'm-vibe',
      sessionId: parent.sessionId,
      turnId: 'turn-1',
      role: 'assistant' as const,
      createdAt: 1,
      parts: [
        {
          type: 'tool_call' as const,
          partId: 'tc-vibe',
          toolCallId: 'call-vibe-spawn',
          toolName: 'vibe_spawn',
          status: 'completed' as const,
          input: { cli: 'fast', name: 'home-disk-usage', prompt: 'Inspect $HOME disk usage' },
        },
        {
          type: 'tool_result' as const,
          partId: 'tr-vibe',
          toolCallId: 'call-vibe-spawn',
          toolName: 'vibe_spawn',
          isError: false,
          output: {
            content: [{ type: 'text', text: 'Spawned fast session `home-disk-usage-2`.' }],
            details: { op: 'spawn', spawned: { id: 'home-disk-usage-2', cli: 'fast', jobId: 'j2' } },
          },
        },
      ],
    };
    const vibeReportMsg = {
      messageId: 'm-vibe-report',
      sessionId: parent.sessionId,
      turnId: 'turn-2',
      role: 'system' as const,
      createdAt: 2,
      parts: [
        {
          type: 'notice' as const,
          partId: 'np-vibe',
          noticeType: 'async_job_result' as const,
          level: 'info' as const,
          details: {
            jobs: [{
              jobId: 'home-disk-usage-2-t1',
              subagentId: 'home-disk-usage-2',
              childSessionId: 'vibe-child-uuid',
              type: 'task',
              status: 'completed' as const,
              durationMs: 3200,
              reportText: '<vibe-turn session="home-disk-usage-2" cli="fast" turn="1" status="completed" duration="3.2s"><response>### Summary\nFound 10 GB.</response></vibe-turn>',
            }],
          },
        },
      ],
    };

    await act(async () => useSubagentsStore.setState({ byParent: { [parent.sessionId]: [vibeWorker] } }));
    await publish({ message: { [parent.sessionId]: [vibeParentMsg, vibeReportMsg] } });

    expect(container.textContent).toContain('home-disk-usage-2');
    expect(container.textContent).toContain('sonic · GPT-5.4 Mini');
    expect(container.textContent).toContain('4.2K');
    expect(container.textContent).toContain('$0.0042');

    const rowButton = container.querySelector<HTMLButtonElement>('button[aria-label*="home-disk-usage-2"]');
    if (!rowButton) throw new Error('Expected vibe worker row button');
    await act(async () => rowButton.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Found 10 GB.');
    const taskToggle = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Task'));
    if (!taskToggle) throw new Error('Expected Task toggle');
    await act(async () => taskToggle.click());
    expect(container.textContent).toContain('Inspect $HOME disk usage');

    const openSessionBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open session'));
    if (!openSessionBtn) throw new Error('Expected Open session button');
    await act(async () => openSessionBtn.click());

    const tabs = useUIStore.getState().contextPanelByDirectory[directory]?.tabs ?? [];
    expect(tabs).toContainEqual(expect.objectContaining({
      mode: 'chat',
      dedupeKey: 'session:vibe-child-uuid',
      label: 'home-disk-usage-2',
      sessionTitleFallback: 'home-disk-usage-2',
      readOnly: true,
    }));
  });
});
