import { beforeEach, describe, expect, test } from 'bun:test';
import { directoryEnvironment } from './test-support/directoryEnvironment';
import { ChildStoreManager } from '@/sync/child-store';
import { setSyncRefs } from '@/sync/sync-refs';

let fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
const runtimeFetchModule = await import('@/lib/runtime-fetch');
mock.module('@/lib/runtime-fetch', () => ({
  ...runtimeFetchModule,
  runtimeFetch: (input: string, init?: RequestInit) => fetchImpl(input, init),
}));
mock.module('@/sync/sync-refs', () => ({ getAllSyncSessionMap: () => new Map() }));
mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: { getState: () => ({ getDirectoryForSession: () => '/project' }) },
}));
mock.module('@/lib/host-filesystem', () => ({
  hostFilesystem: { getDirectory: () => '/fallback' },
}));

const { usePermissionStore } = await import('./permissionStore');
const { useUIStore } = await import('@/stores/useUIStore');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('permission store server policy', () => {
  beforeEach(() => {
    usePermissionStore.getState().reset();
    usePermissionStore.setState({ legacyCandidate: null, legacyRuntimeKey: null });
    fetchImpl = async () => json({ sessions: {} });
  });

  test('hydrates the authoritative server snapshot and marks the policy read', async () => {
    expect(usePermissionStore.getState().phase).toBe('unknown');
    fetchImpl = async () => json({ sessions: { root: true } });
    await usePermissionStore.getState().hydrate();
    expect(usePermissionStore.getState().modes).toEqual({ root: 'auto' });
    expect(usePermissionStore.getState().phase).toBe('ready');
  });

  test('an unread policy answers the configured default instead of claiming Ask', () => {
    // The store cannot know a mode it has not read; `ask` would claim a choice.
    expect(usePermissionStore.getState().getCurrentPermissionMode('root')).toBeNull();
    expect(usePermissionStore.getState().getSessionMode('root')).toBe(useUIStore.getState().permissionDefaultMode);
  });

  test('a failed read is an error phase, not a read policy with no modes', async () => {
    fetchImpl = async () => json({}, 503);
    await expect(usePermissionStore.getState().hydrate()).rejects.toThrow();
    expect(usePermissionStore.getState().phase).toBe('error');
    expect(usePermissionStore.getState().getCurrentPermissionMode('root')).toBeNull();
  });

  test('reads modes when the server has them and on/off as auto/ask when it does not', async () => {
    fetchImpl = async () => json({ sessions: { root: true, off: false }, modes: { root: 'safety', off: 'ask' }, revision: 1 });
    await usePermissionStore.getState().hydrate();
    expect(usePermissionStore.getState().modes).toEqual({ root: 'safety', off: 'ask' });
    expect(usePermissionStore.getState().getSessionMode('root')).toBe('safety');

    usePermissionStore.getState().reset();
    fetchImpl = async () => json({ sessions: { root: true, off: false } });
    await usePermissionStore.getState().hydrate();
    expect(usePermissionStore.getState().modes).toEqual({ root: 'auto', off: 'ask' });
  });

  test('preserves previous state when hydration fails', async () => {
    usePermissionStore.setState({ modes: { root: 'auto' }, loaded: true });
    fetchImpl = async () => json({}, 503);
    await expect(usePermissionStore.getState().hydrate()).rejects.toThrow();
    expect(usePermissionStore.getState().modes).toEqual({ root: 'auto' });
  });

  test('updates local state only after server persistence succeeds', async () => {
    fetchImpl = async () => json({}, 500);
    await expect(usePermissionStore.getState().setSessionMode('root', 'auto')).rejects.toThrow();
    expect(usePermissionStore.getState().modes).toEqual({});
  });

  test('sends the session directory for immediate pending reconciliation', async () => {
    let body: unknown;
    fetchImpl = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return json({ sessions: { root: true } });
    };
    await usePermissionStore.getState().setSessionMode('root', 'auto');
    expect(body).toEqual({ mode: 'auto', enabled: true, directory: '/project' });
  });

  test('migrates a legacy local policy when the server has no policy yet', async () => {
    usePermissionStore.setState({ legacyCandidate: { root: true }, legacyRuntimeKey: null });
    const requests: string[] = [];
    fetchImpl = async (input) => {
      requests.push(input);
      return input.includes('/sessions/')
        ? json({ sessions: { root: true } })
        : json({ sessions: {} });
    };
    await usePermissionStore.getState().hydrate();
    expect(requests).toEqual(['/api/permission-auto-accept', '/api/permission-auto-accept/sessions/root']);
    expect(usePermissionStore.getState().modes).toEqual({ root: 'auto' });
    expect(usePermissionStore.getState().legacyCandidate).toBe(null);
  });

  test('rejects a hydration response from before reset', async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
    fetchImpl = async () => oldResponse;
    const oldHydration = usePermissionStore.getState().hydrate();
    await environment.settle();

    usePermissionStore.getState().reset();
    fetchImpl = async () => json({ sessions: { current: true }, revision: 2 });
    await usePermissionStore.getState().hydrate();
    resolveOld(json({ sessions: { stale: true }, revision: 1 }));
    await oldHydration;

    expect(usePermissionStore.getState().modes).toEqual({ current: 'auto' });
  });

  test('rejects a mutation response from before reset', async () => {
    let resolveOld!: (response: Response) => void;
    fetchImpl = async () => new Promise<Response>((resolve) => { resolveOld = resolve; });
    const mutation = usePermissionStore.getState().setSessionMode('stale', 'auto');
    await environment.settle();

    usePermissionStore.getState().reset();
    resolveOld(json({ sessions: { stale: true }, revision: 1 }));
    await mutation;

    expect(usePermissionStore.getState().modes).toEqual({});
    expect(usePermissionStore.getState().saving).toBe(false);
  });

  test('keeps the highest authoritative revision when mutations resolve out of order', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    fetchImpl = async () => new Promise<Response>((resolve) => { resolvers.push(resolve); });
    const first = usePermissionStore.getState().setSessionMode('first', 'auto');
    const second = usePermissionStore.getState().setSessionMode('second', 'auto');
    await environment.settle();

    resolvers[1](json({ sessions: { first: true, second: true }, revision: 2 }));
    await second;
    resolvers[0](json({ sessions: { first: true }, revision: 1 }));
    await first;

    expect(usePermissionStore.getState().modes).toEqual({ first: 'auto', second: 'auto' });
    expect(usePermissionStore.getState().saving).toBe(false);
  });

  test('ignores an older broadcast revision', () => {
    usePermissionStore.getState().applySnapshot({ modes: { current: 'auto' }, revision: 4 });
    usePermissionStore.getState().applySnapshot({ modes: { stale: 'auto' }, revision: 3 });

    expect(usePermissionStore.getState().modes).toEqual({ current: 'auto' });
  });
});
