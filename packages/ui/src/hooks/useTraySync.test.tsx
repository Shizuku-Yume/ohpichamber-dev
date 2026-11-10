import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { useTraySync } from './useTraySync';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useNotificationStore } from '@/sync/notification-store';

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
  const invoke = async (command: string, args?: { dockBadgeCount?: number }) => {
    expect(command).toBe('desktop_tray_update');
    if (args?.dockBadgeCount !== undefined) counts.push(args.dockBadgeCount);
    return null;
  };
  const listen = async () => { listenerCount += 1; return () => {}; };
  const intervals = () => { intervalCount += 1; return 1; };
  const append = (id: string) => useNotificationStore.getState().append({
    type: 'turn-complete', session: id, time: Date.now(), viewed: false,
  });
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
    useNotificationStore.setState(useNotificationStore.getInitialState());
    useGlobalSessionsStore.setState({ activeSessions: [session('root'), session('child', 'root')] });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    counts.length = 0;
    listenerCount = 0;
    intervalCount = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
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
    useNotificationStore.getState().markSessionViewed('root');
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
    useNotificationStore.getState().markSessionViewed('root');
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
