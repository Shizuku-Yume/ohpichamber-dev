/**
 * Regression coverage for https://github.com/openchamber/openchamber/issues/2903
 *
 * Busy side-panel subagent chats were rendering only the working-status row
 * ("…is running command") because message reads were gated off while session
 * status stayed busy — so the empty-state branch was skipped and the
 * transcript showed status only. Idle sessions hit the empty state instead
 * (#2892). The chat then ran in an iframe whose visibility handshake could be
 * lost; it now renders in the app, and this test renders the real sync provider
 * tree to keep the cold-read gate honest.
 */
import { describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Message } from '@openchamber/agent-contract';

mock.module('sonner', () => ({
  toast: { dismiss: () => undefined, error: () => undefined, info: () => undefined, success: () => undefined },
}));
mock.module('@/components/ui', () => ({
  toast: { info: () => undefined, error: () => undefined, success: () => undefined },
}));
<<<<<<< HEAD
mock.module('@/lib/host-filesystem', () => ({
  hostFilesystem: {
=======
let mockIdCounter = 0;
mock.module('@/lib/opencode/client', () => ({
  isOpencodeNotFound: () => false,
  OpencodeApiError: Error,
  normalizeOpencodeError: (operation: string, error: unknown) => new Error(`${operation}: ${String(error)}`),
  ascendingId: (prefix: string) => `${prefix}_${(mockIdCounter += 1).toString(16).padStart(12, '0')}`,
  opencodeClient: {
>>>>>>> bc50ba56a
    getDirectory: () => '/repo',
    setDirectory: () => undefined,
  },
}));
mock.module('@/lib/api/canonicalClient', () => ({ canonicalClient: {}, CanonicalApiError: Error }));
mock.module('@/stores/permissionStore', () => ({
  usePermissionStore: { getState: () => ({ getSessionMode: () => 'ask', hydrate: async () => undefined }) },
}));
mock.module('@/stores/useConfigStore', () => ({
  markConfigCatalogStale: () => undefined,
<<<<<<< HEAD
=======
  selectCatalogLoadedForDirectory: () => false,
  selectConfigAgentsForDirectory: () => [],
  invalidateConfigAgentsLoad: () => undefined,
>>>>>>> bc50ba56a
  useConfigStore: {
    getState: () => ({ isConnected: true, hasEverConnected: true, settingsMessageStreamTransport: 'auto' }),
    setState: () => undefined,
  },
}));
mock.module('@/stores/useTodosPersistStore', () => ({
  useTodosPersistStore: { getState: () => ({ setSessionTodos: () => undefined }) },
}));

const { SyncContext, SyncRuntimeContext, useSessionMessageRecords } = await import('@/sync/sync-context');
const { ChildStoreManager } = await import('@/sync/child-store');
const { getSessionMaterializationStatus } = await import('@/sync/materialization');
import type { State } from '@/sync/types';

const SESSION_ID = 'ses_subagent_2903';
const DIRECTORY = '/repo';

const installMinimalDom = () => {
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const setGlobal = (name: string, value: unknown) => {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  class ElementStub {}
  const documentStub: Record<string, unknown> = {
    nodeType: 9,
    defaultView: globalThis,
    activeElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const container = {
    nodeType: 1,
    tagName: 'DIV',
    nodeName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: documentStub,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  documentStub.documentElement = container;
  documentStub.body = container;
  setGlobal('document', documentStub);
  setGlobal('window', globalThis);
  setGlobal('location', { search: '', protocol: 'http:', hostname: 'localhost' });
  setGlobal('Element', ElementStub);
  setGlobal('HTMLElement', ElementStub);
  setGlobal('HTMLIFrameElement', ElementStub);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0));
  setGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  return {
    container: container as unknown as Element,
    restore: () => {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
};

const createMessage = (messageId: string, role: 'user' | 'assistant', createdAt: number): Message => ({
  messageId,
  sessionId: SESSION_ID,
  turnId: role === 'user' ? messageId : `u_${createdAt - 1}`,
  role,
  createdAt,
  parts: [{ type: 'text', partId: `prt_${messageId}`, content: role === 'user' ? `prompt ${createdAt}` : `output ${createdAt}` }],
});

const buildMaterializedSubagentSession = () => {
  const messages: Message[] = [];
  for (let index = 0; index < 14; index += 1) {
    const created = index + 1;
    const role: 'user' | 'assistant' = created % 2 === 1 ? 'user' : 'assistant';
    const id = role === 'user' ? `u_${created}` : `a_${created}`;
    messages.push(createMessage(id, role, created));
  }
  return { messages };
};

describe('issue #2903 busy subagent status-line-only', () => {
  test('cold disabled reads hide a fully materialized 14-message subagent; enabled reads return all 14', async () => {
    const dom = installMinimalDom();
    const root: Root = createRoot(dom.container);
    const childStores = new ChildStoreManager();
    const store = childStores.ensureChild(DIRECTORY, { bootstrap: false });
    const { messages } = buildMaterializedSubagentSession();
    store.setState({
      status: 'complete',
      session: [{
        sessionId: SESSION_ID, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: SESSION_ID,
        createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
        title: 'Audit Searchbar implementation', metadata: {}, metadataRevision: '1', archiveRevision: '0',
      }],
      message: { [SESSION_ID]: messages },
      partOwner: {},
    } as Partial<State>);

    expect(getSessionMaterializationStatus(store.getState(), SESSION_ID)).toEqual({
      hasMessages: true,
      renderable: true,
      missingPartMessageIDs: [],
    });

    const system = { childStores, messageLoader: {}, client: {}, runtimeKey: 'test', directory: DIRECTORY };
    // Mirrors SyncProvider's own nesting: system context outer, runtime inner.
    // Directory-scoped hooks read the runtime context, so the harness must
    // provide it with a currentDirectory source for the store lookups.
    const runtime = {
      childStores,
      messageLoader: {},
      client: {},
      runtimeKey: 'test',
      currentDirectory: { get: () => DIRECTORY, subscribe: () => () => undefined },
    };
    let inactiveCount = -1;
    let activeCount = -1;
    let enabled = false;

    const Harness = () => {
      const records = useSessionMessageRecords(SESSION_ID, DIRECTORY, { enabled });
      if (enabled) {
        activeCount = records.length;
      } else {
        inactiveCount = records.length;
      }
      return null;
    };

    const SystemContext = SyncContext as unknown as React.Context<unknown>;
    const RuntimeContext = SyncRuntimeContext as unknown as React.Context<unknown>;
    const renderHarness = () =>
      React.createElement(
        SystemContext.Provider,
        { value: system },
        React.createElement(RuntimeContext.Provider, { value: runtime }, React.createElement(Harness)),
      );

    try {
      await act(async () => {
        root.render(renderHarness());
      });
      expect(inactiveCount).toBe(0);

      enabled = true;
      await act(async () => {
        root.render(renderHarness());
      });
      expect(activeCount).toBe(14);
    } finally {
      await act(async () => root.unmount());
      dom.restore();
    }
  });
});
