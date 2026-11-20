import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CanonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useMessageQueueStore, createMessageQueueTarget, getMessageQueueKey } from '@/stores/messageQueueStore';
import { SyncProvider } from './sync-context';
import { installHookTestDom } from '../components/session/sidebar/test-utils/testDom';

class MockEventSource {
  static instances: MockEventSource[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = MockEventSource.OPEN;
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

const nativeClient = (): CanonicalClient => Object.assign(new CanonicalClient(), {
  listProjects: async () => ({ items: [], errors: {} }),
  listWorkspaces: async () => ({ items: [], errors: {} }),
  resolveWorkspace: async () => ({ workspaceId: 'ws-1', projectId: 'pro-1', name: 'Workspace' }),
  listSessions: async () => ({ items: [], errors: {} }),
  getModels: async (workspaceId: string) => ({ workspaceId, revision: '0', models: [] }),
  getProviders: async (workspaceId: string) => ({ workspaceId, revision: '0', providers: [] }),
  getAgents: async (workspaceId: string) => ({ workspaceId, revision: '0', agents: [] }),
  getShellSnapshot: async () => ({
    scope: { kind: 'workspace' as const, workspaceId: 'ws-1' },
    epoch: 'shell-epoch',
    revision: '0',
    running: [],
    ended: [],
    recovery: { priorEpochs: 'invalidated' as const },
  }),
});

describe('SyncProvider message queue synchronization', () => {
  let dom: { container: Element; restore: () => void };
  let reactRoot: Root | null = null;
  beforeEach(() => {
    MockEventSource.instances = [];
    dom = installHookTestDom();
    Object.defineProperty(globalThis, 'EventSource', { value: MockEventSource, configurable: true, writable: true });
    switchRuntimeEndpoint({ apiBaseUrl: 'http://127.0.0.1:3288', runtimeKey: 'url:http://127.0.0.1:3288' });
  });

  afterEach(async () => {
    if (reactRoot) {
      const root = reactRoot;
      await act(async () => {
        root.unmount();
      });
    }
    dom.restore();
    Reflect.deleteProperty(globalThis, 'EventSource');
  });

  test('SyncProvider subscribes to message queue updates and clears delivered items from the store', async () => {
    const runtimeKey = getRuntimeKey();
    const target = createMessageQueueTarget('ses-delivered', '/repo', runtimeKey)!;
    const key = getMessageQueueKey(target);

    // Stage an optimistic queued message
    useMessageQueueStore.setState({
      queuedMessages: {
        [key]: [{
          id: 'q-1',
          content: 'Delivered prompt',
          text: 'Delivered prompt',
          createdAt: 100,
        }],
      },
    });

    expect(useMessageQueueStore.getState().queuedMessages[key]).toHaveLength(1);

    const client = nativeClient();
    const root = createRoot(dom.container);
    reactRoot = root;

    await act(async () => {
      root.render(
        <SyncProvider directory="/repo" client={client}>
          <div />
        </SyncProvider>
      );
    });

    // An EventSource connection was established by the app/provider
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(1);
    const source = MockEventSource.instances[0];

    // Simulate server broadcast that delivery acknowledged and queue is now empty
    await act(async () => {
      source.onmessage?.({
        data: JSON.stringify({
          type: 'openchamber:message-queue.updated',
          properties: {
            sessionId: 'ses-delivered',
            queue: {
              sessionId: 'ses-delivered',
              revision: '2',
              items: [],
            },
          },
        }),
      });
    });

    // The store projection must be cleared when server acknowledges delivery
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined();
  });
});
