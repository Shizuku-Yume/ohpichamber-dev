import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import type { Session } from '@openchamber/agent-contract';
import { I18nProvider } from '@/lib/i18n';
import { replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import { useNotificationStore } from '@/sync/notification-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { SessionSidebarFolderItem } from './SessionSidebarFolderItem';

test('a collapsed virtual folder shows live and unread descendants without mounting them', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const originalNotifications = useNotificationStore.getState();
  const session = (sessionId: string, parentSessionId?: string, metadata: Session['metadata'] = null): Session => {
    const workspaceId = 'workspace:/repo';
    registerWorkspaceDirectory(workspaceId, '/repo');
    return {
      sessionId, parentSessionId, rootSessionId: parentSessionId ?? sessionId, projectId: 'project', workspaceId, displayPath: '/repo',
      createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
      title: sessionId, metadata, metadataRevision: metadata ? '1' : '0', archiveRevision: '0',
    };
  };
  // The fork reads unread from the session record's own watermark: `lastIdleAt`
  // is when a turn ended, `viewedAt` the last ending a viewer saw.
  const unreadMetadata = (lastIdleAt: number): Session['metadata'] => ({
    openchamber: { workbench: { lastIdleAt } },
  });
  const sessions = [{ session: session('parent'), worktree: null, children: [{ session: session('child', 'parent'), worktree: null, children: [] }] }];
  const render = (isCollapsed = true, archivedBucket = false) => root.render(
    <I18nProvider><SessionSidebarFolderItem
      folder={{ id: 'folder', name: 'Folder', createdAt: 1, sessionIds: ['parent'] }}
      sessions={[]} activityNodes={sessions}
      isCollapsed={isCollapsed} archivedBucket={archivedBucket} renderBody={false}
      onToggle={() => undefined} onRename={() => undefined} onDelete={() => undefined}
    ><div data-hidden-session="child">Child session</div></SessionSidebarFolderItem></I18nProvider>,
  );
  try {
    replaceGlobalSessionStatusById(new Map());
    useNotificationStore.setState({ list: [] });
    await act(async () => render());
    await act(async () => replaceGlobalSessionStatusById(new Map([['child', { status: 'running', directory: '/repo' }]])));
    expect(container.querySelector('[aria-label="Session active"]')).not.toBeNull();
    expect(container.querySelector('[data-hidden-session]')).toBeNull();
    // The Host ends a turn on the root session, so a subtask's ending shows on
    // its parent's record; the child carries no unread state of its own.
    await act(async () => {
      replaceGlobalSessionStatusById(new Map());
      useGlobalSessionsStore.getState().upsertSession(session('child', 'parent', unreadMetadata(2)));
    });
    expect(container.querySelector('[aria-label="Session active"]')).toBeNull();
    expect(container.querySelector('[aria-label="Unread updates"]')).toBeNull();
    await act(async () => useGlobalSessionsStore.getState().upsertSession(session('parent', undefined, unreadMetadata(3))));
    expect(container.querySelector('[aria-label="Unread updates"]')).not.toBeNull();
    await act(async () => render(false));
    expect(container.querySelector('[aria-label="Unread updates"]')).toBeNull();
    await act(async () => render(true, true));
    expect(container.querySelector('[aria-label="Unread updates"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    replaceGlobalSessionStatusById(new Map());
    useNotificationStore.setState(originalNotifications);
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    container.remove();
    await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
