import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { useTraySync } from './useTraySync';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useNotificationStore } from '@/sync/notification-store';
import { markSessionViewed } from '@/sync/notification-store';

const session = (sessionId: string, parentSessionId?: string): Session => ({
  sessionId, parentSessionId, rootSessionId: parentSessionId ?? sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '/project',
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

const Harness = () => {
  useTraySync();
  return null;
};

describe('Dock badge with the macOS menu bar disabled', () => {
  let dom: Window;
  let root: Root;
  const counts: number[] = [];
  let listenerCount = 0;
  let intervalCount = 0;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
  const invoke = async (command: string, args?: { dockBadgeCount?: number }) => {
    expect(command).toBe('desktop_tray_update');
    if (args?.dockBadgeCount !== undefined) counts.push(args.dockBadgeCount);
    return null;
  };
  const listen = async () => { listenerCount += 1; return () => {}; };
  const intervals = () => { intervalCount += 1; return 1; };
  // Unread state lives on the session's metadata now: an idle turn whose
  // viewed watermark never caught up is what raises the badge.
  // Upserting through the store keeps its record map and its ordered view in
  // agreement, so the badge reads the same unread state the row does.
  const append = (id: string) => {
    const unread = { openchamber: { workbench: { lastIdleAt: Date.now(), viewedAt: undefined } } };
    const existing = useGlobalSessionsStore.getState().entityById.get(id) ?? session(id);
    useGlobalSessionsStore.getState().upsertSession({ ...existing, metadata: unread });
  };
  const flush = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  };

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    Object.assign(dom, {
      __OPENCHAMBER_PLATFORM__: 'darwin',
      __OPENCHAMBER_ELECTRON__: { runtime: 'electron', trayEnabled: false },
      __OPENCHAMBER_DESKTOP__: { invoke, listen },
      setInterval: intervals,
    });
    Object.assign(globalThis, {
      window: dom, document: dom.document, navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    // The unread watermark is written to the host; answer exactly the metadata
    // read/write and the view POST, so a mark clears instead of rolling back.
    // Any other request fails, so an unexpected endpoint surfaces here.
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const metadata = /\/api\/agent\/v1\/sessions\/[^/]+\/metadata$/.test(url);
      if (metadata && method === 'GET') {
        return Response.json({ sessionId: 'root', revision: '1', metadata: { openchamber: { workbench: { lastIdleAt: 1, viewedAt: 1 } } } });
      }
      if (metadata && method === 'PATCH') {
        return Response.json({ sessionId: 'root', revision: '2', metadata: { openchamber: { workbench: { lastIdleAt: 1, viewedAt: 1 } } } });
      }
      if (method === 'POST' && /\/api\/sessions\/[^/]+\/view$/.test(url)) {
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    useNotificationStore.setState(useNotificationStore.getInitialState());
    const seeded = [session('root'), session('child', 'root')];
    // The global store keeps `entityById` as the record and `activeSessions` as
    // its ordered view, so a fixture that writes one has to write both.
    useGlobalSessionsStore.setState({
      activeSessions: seeded,
      entityById: new Map(seeded.map((entry) => [entry.sessionId, entry])),
    });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    counts.length = 0;
    listenerCount = 0;
    intervalCount = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    fetchSpy.mockRestore();
    await dom.happyDOM.close();
  });

  test('publishes unread chats, clears viewed chats, and respects the badge toggle without tray timers or listeners', async () => {
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([0]);
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
    useUIStore.setState({ dockBadgeEnabled: false });
    await flush();
    expect(counts).toEqual([0, 1, 0]);
    useUIStore.setState({ dockBadgeEnabled: true });
    await flush();
    expect(counts).toEqual([0, 1, 0, 1]);
    markSessionViewed('root');
    await flush();
    expect(counts).toEqual([0, 1, 0, 1, 0]);
    expect(intervalCount).toBe(0);
    expect(listenerCount).toBe(0);
  });

  test('rolls subtasks up only when enabled and reconciles global session membership', async () => {
    append('child');
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([0]);
    useUIStore.setState({ notifyOnSubtasks: true });
    await flush();
    expect(counts).toEqual([0, 1]);
    useGlobalSessionsStore.setState({ activeSessions: [] });
    await flush();
    expect(counts).toEqual([0, 1, 0]);
  });

  test('coalesces unread updates and cancels pending updates on unmount', async () => {
    await act(async () => root.render(<Harness />));
    append('root');
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
    markSessionViewed('root');
    await act(async () => root.unmount());
    await flush();
    expect(counts).toEqual([0, 1]);
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
  });

  test('counts all unread chats at startup, beyond the tray menu limit', async () => {
    const sessions = Array.from({ length: 25 }, (_, index) => session(`root-${index}`));
    useGlobalSessionsStore.setState({ activeSessions: sessions });
    for (const item of sessions) append(item.sessionId);
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([25]);
  });

  test('starts with a cleared badge when both controls are disabled', async () => {
    append('root');
    useUIStore.setState({ dockBadgeEnabled: false });
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([0]);
    expect(intervalCount).toBe(0);
    expect(listenerCount).toBe(0);
  });

  test('does not publish desktop state outside Electron', async () => {
    Object.assign(dom, { __OPENCHAMBER_ELECTRON__: undefined });
    await act(async () => root.render(<Harness />));
    append('root');
    await flush();
    expect(counts).toEqual([]);
    expect(intervalCount).toBe(0);
    expect(listenerCount).toBe(0);
  });
});
