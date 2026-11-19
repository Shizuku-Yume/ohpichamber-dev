import { afterEach, describe, expect, test } from 'bun:test';
import { directoryEnvironment } from './test-support/directoryEnvironment';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';

const HOME = '/home/user';
const CHATS_ROOT = '/srv/openchamber/chats';
const environment = directoryEnvironment();
const storage = environment.storage;
const settingsUpdates = () => environment.settingsWrites.map((write) => write.changes);
let loggedIn = false;
let homeReads = 0;
<<<<<<< HEAD
const directoriesSet: string[] = [];
let runtimeKey = 'test';
let probeDirectory: (directory: string) => Promise<'available' | 'missing' | 'unknown'> = async () => 'available';

mock.module('@/lib/host-filesystem', () => ({
  hostFilesystem: {
    setDirectory: (directory: string) => {
      directoriesSet.push(directory);
    },
    getDirectory: () => directoriesSet.at(-1) ?? '/',
    getDirectoryAvailability: (directory: string) => probeDirectory(directory),
    getFilesystemHome: async () => {
      homeReads += 1;
      // Before login /api/fs/home answers 401, which this read reports as null.
      return loggedIn ? HOME : null;
    },
    getSystemInfo: async () => {
      if (!loggedIn) throw new Error('UI authentication required');
      return { homeDirectory: HOME };
    },
    getFilesystemHomeInfo: async () => {
      if (!loggedIn) throw new Error('Failed to resolve the chats root (401)');
      return { home: HOME, chatsRoot: CHATS_ROOT };
    },
  },
}));

mock.module('@/lib/desktop', () => ({
  getDesktopHomeDirectory: async () => null,
  isDesktopShell: () => false,
}));

const settingsUpdates: Array<Record<string, string>> = [];

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async (changes: Record<string, string>) => {
    settingsUpdates.push(changes);
  },
}));

mock.module('@/lib/runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: () => () => undefined,
  getRuntimeApiBaseUrl: () => 'http://127.0.0.1:9',
  getRuntimeKey: () => runtimeKey,
}));

mock.module('@/stores/useFileSearchStore', () => ({
  useFileSearchStore: {
    getState: () => ({ clearCache: () => undefined, invalidateDirectory: () => undefined }),
  },
}));

// Local storage writes land on the next tick.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
||||||| bc50ba56aa
const directoriesSet: string[] = [];
let runtimeKey = 'test';
let probeDirectory = async (_directory: string): Promise<'available' | 'missing' | 'unknown'> => 'available';

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    setDirectory: (directory: string) => {
      directoriesSet.push(directory);
    },
    getDirectory: () => directoriesSet.at(-1) ?? '/',
    getDirectoryAvailability: (directory: string) => probeDirectory(directory),
    getFilesystemHome: async () => {
      homeReads += 1;
      // Before login /api/fs/home answers 401, which this read reports as null.
      return loggedIn ? HOME : null;
    },
    getSystemInfo: async () => {
      if (!loggedIn) throw new Error('UI authentication required');
      return { homeDirectory: HOME };
    },
    getFilesystemHomeInfo: async () => {
      if (!loggedIn) throw new Error('Failed to resolve the chats root (401)');
      return { home: HOME, chatsRoot: CHATS_ROOT };
    },
  },
}));

mock.module('@/lib/desktop', () => ({
  getDesktopHomeDirectory: async () => null,
  isVSCodeRuntime: () => false,
  isDesktopShell: () => false,
}));

const settingsUpdates: Array<Record<string, string>> = [];

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async (changes: Record<string, string>) => {
    settingsUpdates.push(changes);
  },
}));

mock.module('@/lib/runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: () => () => undefined,
  getRuntimeApiBaseUrl: () => 'http://127.0.0.1:9',
  getRuntimeKey: () => runtimeKey,
}));

mock.module('@/stores/useFileSearchStore', () => ({
  useFileSearchStore: {
    getState: () => ({ clearCache: () => undefined, invalidateDirectory: () => undefined }),
  },
}));

// Local storage writes land on the next tick.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
=======
let probeDirectory = async (_directory: string): Promise<'available' | 'missing' | 'unknown'> => 'available';
environment.respond(async (url, init) => {
  if (url.pathname === '/api/fs/home') {
    homeReads += 1;
    return loggedIn ? Response.json({ home: HOME, chatsRoot: CHATS_ROOT }) : Response.json({}, { status: 401 });
  }
  if (url.pathname === '/api/fs/directory-stats') {
    const { paths } = JSON.parse(String(init?.body));
    const results = await Promise.all(paths.map(async (path: string) => {
      const availability = await probeDirectory(path);
      return { path, isDirectory: availability === 'available', reason: availability === 'missing' ? 'not-found' : 'unavailable' };
    }));
    return Response.json({ results });
  }
  if (url.pathname === '/api/location' || url.pathname === '/api/session') return Response.json({}, { status: 401 });
  throw new Error(`Unexpected request: ${url}`);
});
const settle = environment.settle;
const clientDirectory = async () => (await import('@/lib/opencode/client')).opencodeClient.getDirectory();
>>>>>>> upstream/main

describe('home directory on a first visit to a password-protected server', () => {
  test('starts on "/" before login and moves to the chats root once logged in', async () => {
    const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, HOMEDRIVE: process.env.HOMEDRIVE, HOMEPATH: process.env.HOMEPATH };
    const savedCwd = process.cwd;
    for (const key of Object.keys(savedEnv)) delete process.env[key];
    process.cwd = () => '';
    const { ensureHomeDirectoryResolved, useDirectoryStore } = await import('./useDirectoryStore');
    try {
      await ensureHomeDirectoryResolved();
      await settle();
      expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: '/', currentDirectory: '/', isHomeReady: false });
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      process.cwd = savedCwd;
    }
    loggedIn = true;
    await ensureHomeDirectoryResolved();
    expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: HOME, currentDirectory: CHATS_ROOT, isHomeReady: true });
    expect(await clientDirectory()).toBe(CHATS_ROOT);
    await settle();
    expect(storage.getItem('lastDirectory')).toBeNull();
    expect(settingsUpdates().some((changes) => 'lastDirectory' in changes)).toBe(false);
    expect(useDirectoryStore.getState().hasPersistedDirectory).toBe(false);
    const reads = homeReads;
    await ensureHomeDirectoryResolved();
    expect(homeReads).toBe(reads);
  });

  test('removing the last project moves to the chats root and forgets the last directory', async () => {
    const { useDirectoryStore } = await import('./useDirectoryStore');
    useDirectoryStore.getState().setDirectory('/home/user/project');
    await settle();
    expect(storage.getItem('lastDirectory')).toBe('/home/user/project');
    environment.settingsWrites.length = 0;
    await useDirectoryStore.getState().goToNoProjectDirectory();
    expect(useDirectoryStore.getState()).toMatchObject({ currentDirectory: CHATS_ROOT, hasPersistedDirectory: false });
    expect(await clientDirectory()).toBe(CHATS_ROOT);
    await settle();
    expect(storage.getItem('lastDirectory')).toBeNull();
    expect(settingsUpdates()).toEqual([{ lastDirectory: '' }]);
  });

  test('a known home without a chats root before login is resolved again after login', async () => {
    const { ensureHomeDirectoryResolved, useDirectoryStore } = await import('./useDirectoryStore');
    loggedIn = false;
    useDirectoryStore.getState().synchronizeHomeDirectory(HOME, null);
    expect(useDirectoryStore.getState()).toMatchObject({ currentDirectory: HOME, isHomeReady: false });
    loggedIn = true;
    await ensureHomeDirectoryResolved();
    expect(useDirectoryStore.getState()).toMatchObject({ currentDirectory: CHATS_ROOT, isHomeReady: true });
    await settle();
  });
});

describe('saved directory restoration', () => {
<<<<<<< HEAD
  afterEach(() => {
    runtimeKey = 'test';
    probeDirectory = async () => 'available';
    setTestWindow(undefined);
  });

||||||| bc50ba56aa
  afterEach(() => {
    runtimeKey = 'test';
    setTestWindow(undefined);
  });

=======
  afterEach(() => switchRuntimeEndpoint({ apiBaseUrl: 'https://local.test', runtimeKey: 'test' }));
>>>>>>> upstream/main
  const prepare = async () => {
<<<<<<< HEAD
    setTestWindow({
      localStorage: testLocalStorage,
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    loggedIn = true;
    const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
||||||| bc50ba56aa
    setTestWindow({
      localStorage: testLocalStorage,
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
=======
    const { useDirectoryStore } = await import('./useDirectoryStore');
    await (await import('./useDirectoryStore')).ensureHomeDirectoryResolved();
>>>>>>> upstream/main
    useDirectoryStore.getState().setDirectory('/saved/chat');
    await settle();
    environment.settingsWrites.length = 0;
    return useDirectoryStore;
  };

  for (const availability of ['available', 'missing', 'unknown'] as const) {
    test(`restores a saved directory reported as ${availability}`, async () => {
      const store = await prepare();
      const probes: string[] = [];
      probeDirectory = async (directory) => { probes.push(directory); return availability; };
      const { applyPersistedDirectoryPreferences } = await import('@/lib/directoryPersistence');
      const restoration = applyPersistedDirectoryPreferences();
      await settle();
      await restoration;
      await settle();
      expect(probes).toEqual(['/saved/chat']);
      if (availability === 'missing') {
        expect(store.getState()).toMatchObject({ currentDirectory: CHATS_ROOT, hasPersistedDirectory: false });
        expect(await clientDirectory()).toBe(CHATS_ROOT);
        expect(storage.getItem('lastDirectory')).toBeNull();
        expect(settingsUpdates()).toEqual([{ lastDirectory: '' }]);
      } else {
        expect(store.getState().currentDirectory).toBe('/saved/chat');
        expect(storage.getItem('lastDirectory')).toBe('/saved/chat');
      }
    });
  }

  for (const change of ['directory', 'runtime', 'storage'] as const) {
    test(`ignores a missing-directory probe after a newer ${change}`, async () => {
      const store = await prepare();
      let answerProbe: (value: 'missing') => void = () => undefined;
      probeDirectory = () => new Promise((resolve) => { answerProbe = resolve; });
      const { applyPersistedDirectoryPreferences } = await import('@/lib/directoryPersistence');
      const restoration = applyPersistedDirectoryPreferences();
      await settle();
      if (change === 'directory') store.getState().setDirectory('/new/project');
      if (change === 'runtime') switchRuntimeEndpoint({ apiBaseUrl: 'https://other-host.test', runtimeKey: 'other-host' });
      if (change === 'storage') storage.setItem('lastDirectory', '/new/project');
      answerProbe('missing');
      await restoration;
      await settle();
      expect(store.getState().currentDirectory).toBe(change === 'directory' ? '/new/project' : '/saved/chat');
      expect(settingsUpdates().some((changes) => changes.lastDirectory === '')).toBe(false);
      expect(storage.getItem('lastDirectory')).toBe(change === 'runtime' ? '/saved/chat' : '/new/project');
    });
  }

  test('does not clear the saved directory if the runtime changes while resolving the fallback', async () => {
    const store = await prepare();
    const fallback = store.getState().goToNoProjectDirectory();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other-host.test', runtimeKey: 'other-host' });
    await fallback;
    await settle();
    expect(store.getState().currentDirectory).toBe('/saved/chat');
    expect(storage.getItem('lastDirectory')).toBe('/saved/chat');
    expect(settingsUpdates().some((changes) => 'lastDirectory' in changes)).toBe(false);
  });
});
