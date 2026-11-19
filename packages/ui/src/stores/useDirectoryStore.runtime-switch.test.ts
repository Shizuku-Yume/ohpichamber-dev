import { describe, expect, test } from 'bun:test';
import { directoryEnvironment } from './test-support/directoryEnvironment';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';

const MAC_HOME = '/Users/me';
const MAC_PROJECT = '/Users/me/project';
const REMOTE_HOME = '/home/remote';
const REMOTE_CHATS = '/srv/remote/chats';
const environment = directoryEnvironment({ home: MAC_HOME, lastDirectory: MAC_PROJECT });
let loggedInOnRemote = false;
let holdLookup: Promise<void> = Promise.resolve();
<<<<<<< HEAD
let clientDirectory: string | undefined = MAC_PROJECT;
let onRuntimeEndpointChanged: (detail: EndpointChange) => void = () => undefined;

mock.module('@/lib/host-filesystem', () => ({
  hostFilesystem: {
    setDirectory: (directory: string | undefined) => {
      clientDirectory = directory;
    },
    getDirectory: () => clientDirectory,
    // Before login the other host answers /api/fs/home with 401, reported as null.
    getFilesystemHome: async () => {
      const boundTo = clientBoundTo;
      await holdLookup;
      if (boundTo === 'local') return MAC_HOME;
      return loggedInOnRemote ? REMOTE_HOME : null;
    },
    // The real one derives a home from the stored last directory when the
    // host answers nothing, which after a switch is still this Mac's.
    getSystemInfo: async () => ({ homeDirectory: runtimeKey === 'local' || !loggedInOnRemote ? MAC_HOME : REMOTE_HOME }),
    getFilesystemHomeInfo: async () => {
      const boundTo = clientBoundTo;
      await holdLookup;
      if (boundTo === 'local') return { home: MAC_HOME, chatsRoot: `${MAC_HOME}/.config/ohpichamber/chats` };
      if (!loggedInOnRemote) throw new Error('Failed to resolve the chats root (401)');
      return { home: REMOTE_HOME, chatsRoot: REMOTE_CHATS };
    },
  },
}));

mock.module('@/lib/desktop', () => ({
  getDesktopHomeDirectory: async () => MAC_HOME,
  isDesktopShell: () => false,
}));

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async () => undefined,
}));

mock.module('@/lib/runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: (listener: (detail: EndpointChange) => void) => {
    onRuntimeEndpointChanged = listener;
    return () => undefined;
  },
  getRuntimeApiBaseUrl: () => 'http://127.0.0.1:9',
  getRuntimeKey: () => runtimeKey,
}));

mock.module('@/stores/useFileSearchStore', () => ({
  useFileSearchStore: {
    getState: () => ({ clearCache: () => undefined, invalidateDirectory: () => undefined }),
  },
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
||||||| bc50ba56aa
let clientDirectory: string | undefined = MAC_PROJECT;
let onRuntimeEndpointChanged: (detail: EndpointChange) => void = () => undefined;

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    setDirectory: (directory: string | undefined) => {
      clientDirectory = directory;
    },
    getDirectory: () => clientDirectory,
    // Before login the other host answers /api/fs/home with 401, reported as null.
    getFilesystemHome: async () => {
      const boundTo = clientBoundTo;
      await holdLookup;
      if (boundTo === 'local') return MAC_HOME;
      return loggedInOnRemote ? REMOTE_HOME : null;
    },
    // The real one derives a home from the stored last directory when the
    // host answers nothing, which after a switch is still this Mac's.
    getSystemInfo: async () => ({ homeDirectory: runtimeKey === 'local' || !loggedInOnRemote ? MAC_HOME : REMOTE_HOME }),
    getFilesystemHomeInfo: async () => {
      const boundTo = clientBoundTo;
      await holdLookup;
      if (boundTo === 'local') return { home: MAC_HOME, chatsRoot: `${MAC_HOME}/.config/openchamber/chats` };
      if (!loggedInOnRemote) throw new Error('Failed to resolve the chats root (401)');
      return { home: REMOTE_HOME, chatsRoot: REMOTE_CHATS };
    },
  },
}));

mock.module('@/lib/desktop', () => ({
  getDesktopHomeDirectory: async () => MAC_HOME,
  isVSCodeRuntime: () => false,
  isDesktopShell: () => false,
}));

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async () => undefined,
}));

mock.module('@/lib/runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: (listener: (detail: EndpointChange) => void) => {
    onRuntimeEndpointChanged = listener;
    return () => undefined;
  },
  getRuntimeApiBaseUrl: () => 'http://127.0.0.1:9',
  getRuntimeKey: () => runtimeKey,
}));

mock.module('@/stores/useFileSearchStore', () => ({
  useFileSearchStore: {
    getState: () => ({ clearCache: () => undefined, invalidateDirectory: () => undefined }),
  },
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
=======
let homeReads = 0;
environment.respond(async (url) => {
  if (url.pathname !== '/api/fs/home') throw new Error(`Unexpected request: ${url}`);
  const remote = url.hostname === 'remote.test';
  homeReads += 1;
  await holdLookup;
  if (!remote) return Response.json({ home: MAC_HOME, chatsRoot: `${MAC_HOME}/.config/openchamber/chats` });
  return loggedInOnRemote
    ? Response.json({ home: REMOTE_HOME, chatsRoot: REMOTE_CHATS })
    : Response.json({}, { status: 401 });
});
switchRuntimeEndpoint({ apiBaseUrl: 'https://local.test', runtimeKey: 'host:local' });
>>>>>>> upstream/main

describe('directory store after the desktop switches to another host', () => {
  test('home and directory stay unknown until that host names its home, then both are its own', async () => {
    const { ensureHomeDirectoryResolved, useDirectoryStore } = await import('./useDirectoryStore');
    const { opencodeClient } = await import('@/lib/opencode/client');
    await ensureHomeDirectoryResolved();
    await environment.settle();
    expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: MAC_HOME, currentDirectory: MAC_PROJECT, isHomeReady: true });

    let releaseLookup: () => void = () => undefined;
    holdLookup = new Promise<void>((resolve) => { releaseLookup = resolve; });
    const readsBeforeRefresh = homeReads;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://local.test', runtimeKey: 'host:local' });
    await environment.settle();
    expect(homeReads).toBe(readsBeforeRefresh + 1);
    holdLookup = Promise.resolve();
    releaseLookup();
    await Promise.resolve();
    await Promise.resolve();

    switchRuntimeEndpoint({ apiBaseUrl: 'https://remote.test', runtimeKey: 'host:remote' });
    useDirectoryStore.getState().resetForRuntimeSwitch();
    await environment.settle();
    expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: '/', currentDirectory: '/', isHomeReady: false });
    expect(opencodeClient.getDirectory()).toBeUndefined();
    expect(environment.storage.getItem('lastDirectory')).toBe(MAC_PROJECT);

    loggedInOnRemote = true;
    await ensureHomeDirectoryResolved();
    expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: REMOTE_HOME, currentDirectory: REMOTE_CHATS, isHomeReady: true });
    expect(opencodeClient.getDirectory()).toBe(REMOTE_CHATS);
    await environment.settle();
  });
});
