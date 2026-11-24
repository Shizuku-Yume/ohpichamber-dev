import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';

import { OpenSubtaskButton } from '@/components/chat/message/parts/toolRow/OpenSubtaskButton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { I18nProvider } from '@/lib/i18n';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { SyncProvider } from '@/sync/sync-context';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { createWebAPIs } from '../../../../web/src/api/index';
import { ContextPanel } from './ContextPanel';

const WORKSPACE_DIR = '/workspace/reload-test';
const PARENT_SESSION: Session = {
  sessionId: 'parent-reload',
  projectId: 'project-reload',
  workspaceId: 'workspace-reload',
  displayPath: '.',
  rootSessionId: 'parent-reload',
  createdAt: 1,
  updatedAt: 10,
  epoch: 'epoch-1',
  headSequence: '1',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
};

const originalPersistOptions = useUIStore.persist.getOptions();

async function withPanelHarness(run: (harness: {
  container: HTMLElement;
  renderNode: (node: React.ReactNode) => Promise<void>;
}) => Promise<void>) {
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => { }));
  const dom = new Window({ url: 'http://localhost' });
  const globals = {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    localStorage: dom.localStorage,
    customElements: dom.customElements,
    Node: dom.Node,
    Text: dom.Text,
    NodeList: dom.NodeList,
    Window: dom.Window,
    Event: dom.Event,
    CustomEvent: dom.CustomEvent,
    MouseEvent: dom.MouseEvent,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    HTMLButtonElement: dom.HTMLButtonElement,
    SVGElement: dom.SVGElement,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const descriptors = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const prevUI = useUIStore.getState();
  const prevDirectory = useDirectoryStore.getState();
  const prevGlobal = useGlobalSessionsStore.getState();
  const prevSessionUI = useSessionUIStore.getState();

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const apis = createWebAPIs();

  const renderNode = async (node: React.ReactNode) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <TooltipProvider>
            <RuntimeAPIContext.Provider value={apis}>
              <SyncProvider directory={WORKSPACE_DIR}>
                {node}
              </SyncProvider>
            </RuntimeAPIContext.Provider>
          </TooltipProvider>
        </I18nProvider>,
      );
    });
  };

  try {
    useDirectoryStore.setState({ currentDirectory: WORKSPACE_DIR });
    useSessionUIStore.setState({ currentSessionId: PARENT_SESSION.sessionId, currentSessionDirectory: WORKSPACE_DIR });
    useUIStore.setState({ isMobile: false, contextPanelByDirectory: {} });
    useGlobalSessionsStore.getState().applySnapshot([PARENT_SESSION], []);
    await run({ container, renderNode });
  } finally {
    await act(async () => {
      root.unmount();
    });
    useUIStore.persist.setOptions(originalPersistOptions);
    useUIStore.setState(prevUI);
    useDirectoryStore.setState(prevDirectory);
    useGlobalSessionsStore.setState(prevGlobal);
    useSessionUIStore.setState(prevSessionUI);
    fetchSpy.mockRestore();
    await dom.happyDOM.abort();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

describe('ContextPanel chat tab title across reload', () => {
  afterEach(() => {
    useUIStore.persist.setOptions(originalPersistOptions);
  });

  test('retains real subagent name after OpenSubtaskButton opens child chat and UI store rehydrates without live child stores', async () => {
    await withPanelHarness(async ({ container, renderNode }) => {
      await renderNode(
        <OpenSubtaskButton
          sessionId="vibe-child-reload-2"
          agent="sonic"
          label="home-disk-usage-2"
          directory={WORKSPACE_DIR}
          isMobile={false}
        />,
      );

      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open home-disk-usage-2 subtask"]');
      expect(button).not.toBeNull();
      expect(container.querySelector('button[aria-label="Open sonic subtask"]')).toBeNull();

      await act(async () => {
        button?.click();
      });

      const persistedState = useUIStore.persist.getOptions().partialize?.(useUIStore.getState());
      useUIStore.persist.setOptions({
        storage: {
          getItem: () => ({ version: 30, state: persistedState }),
          setItem: () => undefined,
          removeItem: () => undefined,
        },
      });

      // Simulate full reload: reset UI store + clear global sessions, then rehydrate persisted UI state.
      useGlobalSessionsStore.getState().applySnapshot([PARENT_SESSION], []);
      useUIStore.setState(useUIStore.getInitialState(), true);
      useUIStore.setState({ isMobile: false });
      await useUIStore.persist.rehydrate();

      const fileTabGuard = { current: null };
      await renderNode(
        <ContextPanel
          zone="right"
          fileTabCloseGuard={fileTabGuard}
          fileTabSelectionGuard={fileTabGuard}
        />,
      );

      expect(container.querySelector('[role="tab"]')?.textContent).toBe('home-disk-usage-2');
    });
  });

  test('resolves persisted child chat tab lacking sessionTitleFallback once useGlobalSessionsStore receives the subagent record', async () => {
    await withPanelHarness(async ({ container, renderNode }) => {
      useUIStore.setState({
        isMobile: false,
        contextPanelByDirectory: {
          [WORKSPACE_DIR]: {
            isOpen: true,
            expanded: false,
            touchedAt: 1,
            activeTabId: 'chat:session:vibe-child-3',
            zones: {
              left: { isOpen: false, expanded: false, activeTabId: null },
              bottom: { isOpen: false, expanded: false, activeTabId: null },
            },
            tabs: [{
              id: 'chat:session:vibe-child-3',
              mode: 'chat',
              targetPath: null,
              targetDirectory: null,
              dedupeKey: 'session:vibe-child-3',
              label: null,
              sessionTitleFallback: null,
              readOnly: true,
              stagedDiff: false,
              diffScope: null,
              preview: false,
              ownerSessionId: null,
              touchedAt: 1,
            }],
          },
        },
      });

      const fileTabGuard = { current: null };
      await renderNode(
        <ContextPanel
          zone="right"
          fileTabCloseGuard={fileTabGuard}
          fileTabSelectionGuard={fileTabGuard}
        />,
      );

      expect(container.querySelector('[role="tab"]')?.textContent).toBe('Chat');

      await act(async () => {
        useGlobalSessionsStore.getState().upsertSubagents(PARENT_SESSION, [{
          subagentId: 'disk-audit-3',
          parentSessionId: PARENT_SESSION.sessionId,
          childSessionId: 'vibe-child-3',
          name: 'disk-audit-3',
          role: 'sonic',
          status: 'completed',
          updatedAt: 50,
        }]);
      });

      expect(container.querySelector('[role="tab"]')?.textContent).toBe('disk-audit-3');
    });
  });
});
