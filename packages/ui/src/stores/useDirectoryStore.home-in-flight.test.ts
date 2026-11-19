import { describe, expect, test } from 'bun:test';
import { directoryEnvironment } from './test-support/directoryEnvironment';

const HOME = '/home/user';
<<<<<<< HEAD
const CHATS_ROOT = '/home/user/.config/ohpichamber/chats';

const storage = new Map<string, string>();
const testLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: () => null,
  length: 0,
} satisfies Storage;

interface TestWindow {
  localStorage: Storage;
  matchMedia: () => { matches: boolean };
  addEventListener: () => void;
  removeEventListener: () => void;
}

const setTestWindow = (value: TestWindow | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
    return;
  }
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: value.localStorage, configurable: true, writable: true });
};

||||||| bc50ba56aa
const CHATS_ROOT = '/home/user/.config/openchamber/chats';

const storage = new Map<string, string>();
const testLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: () => null,
  length: 0,
} satisfies Storage;

interface TestWindow {
  localStorage: Storage;
  matchMedia: () => { matches: boolean };
  addEventListener: () => void;
  removeEventListener: () => void;
}

const setTestWindow = (value: TestWindow | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
    return;
  }
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: value.localStorage, configurable: true, writable: true });
};

=======
const CHATS_ROOT = '/home/user/.config/openchamber/chats';
const environment = directoryEnvironment();
>>>>>>> upstream/main
let homeReads = 0;
let answerPageLoadRead: () => void = () => undefined;
<<<<<<< HEAD
const directoriesSet: string[] = [];

mock.module('@/lib/host-filesystem', () => ({
  hostFilesystem: {
    setDirectory: (directory: string) => {
      directoriesSet.push(directory);
    },
    getDirectory: () => directoriesSet.at(-1) ?? '/',
    getFilesystemHome: async () => {
      homeReads += 1;
      if (homeReads > 1) throw new Error('a second read must not happen');
      await new Promise<void>((resolve) => {
        answerPageLoadRead = resolve;
      });
      return HOME;
    },
    getSystemInfo: async () => {
      throw new Error('a second source must not be asked');
    },
    getFilesystemHomeInfo: async () => ({ home: HOME, chatsRoot: CHATS_ROOT }),
  },
}));

mock.module('@/lib/desktop', () => ({
  getDesktopHomeDirectory: async () => null,
  isDesktopShell: () => false,
}));

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async () => undefined,
}));

mock.module('@/lib/runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: () => () => undefined,
  getRuntimeApiBaseUrl: () => 'http://127.0.0.1:9',
  getRuntimeKey: () => 'test',
}));

mock.module('@/stores/useFileSearchStore', () => ({
  useFileSearchStore: {
    getState: () => ({ clearCache: () => undefined, invalidateDirectory: () => undefined }),
  },
}));
||||||| bc50ba56aa
const directoriesSet: string[] = [];

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    setDirectory: (directory: string) => {
      directoriesSet.push(directory);
    },
    getDirectory: () => directoriesSet.at(-1) ?? '/',
    getFilesystemHome: async () => {
      homeReads += 1;
      if (homeReads > 1) throw new Error('a second read must not happen');
      await new Promise<void>((resolve) => {
        answerPageLoadRead = resolve;
      });
      return HOME;
    },
    getSystemInfo: async () => {
      throw new Error('a second source must not be asked');
    },
    getFilesystemHomeInfo: async () => ({ home: HOME, chatsRoot: CHATS_ROOT }),
  },
}));

mock.module('@/lib/desktop', () => ({
  getDesktopHomeDirectory: async () => null,
  isVSCodeRuntime: () => false,
  isDesktopShell: () => false,
}));

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async () => undefined,
}));

mock.module('@/lib/runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: () => () => undefined,
  getRuntimeApiBaseUrl: () => 'http://127.0.0.1:9',
  getRuntimeKey: () => 'test',
}));

mock.module('@/stores/useFileSearchStore', () => ({
  useFileSearchStore: {
    getState: () => ({ clearCache: () => undefined, invalidateDirectory: () => undefined }),
  },
}));
=======
environment.respond(async (url) => {
  if (url.pathname !== '/api/fs/home') throw new Error(`Unexpected request: ${url}`);
  homeReads += 1;
  if (homeReads === 1) await new Promise<void>((resolve) => { answerPageLoadRead = resolve; });
  return Response.json({ home: HOME, chatsRoot: CHATS_ROOT });
});
>>>>>>> upstream/main

describe('home directory read still in flight when the gate asks for it', () => {
  test('waits for the page-load read instead of starting a second one', async () => {
    const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, HOMEDRIVE: process.env.HOMEDRIVE, HOMEPATH: process.env.HOMEPATH };
    const savedCwd = process.cwd;
    for (const key of Object.keys(savedEnv)) delete process.env[key];
    process.cwd = () => '';
    const { ensureHomeDirectoryResolved, useDirectoryStore } = await import('./useDirectoryStore').finally(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      process.cwd = savedCwd;
    });
    expect(useDirectoryStore.getState().isHomeReady).toBe(false);
    const ensured = ensureHomeDirectoryResolved();
    await environment.settle();
    answerPageLoadRead();
    await ensured;
    expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: HOME, currentDirectory: CHATS_ROOT, isHomeReady: true });
    expect((await import('@/lib/opencode/client')).opencodeClient.getDirectory()).toBe(CHATS_ROOT);
    expect(homeReads).toBe(2);
    await environment.settle();
  });
});
