import { describe, expect, test } from 'bun:test';
import type { WebSearchConfigState, WebSearchMutationResult, Workspace } from '@openchamber/agent-contract';
import { createWebSearchStore } from './useWebSearchStore';

const initial: WebSearchConfigState = {
  workspaceId: 'workspace', revision: '1', enabled: true, selectedProviderId: 'native/primary', fallbackProviderIds: [], timeoutSeconds: 20,
  providers: [{ providerId: 'native/primary', name: 'Primary', configured: false, requiresCredential: true, isSelfHosted: false, credentialWritable: true, credentialConfigured: false }],
};
const workspace: Workspace = { workspaceId: 'workspace', projectId: 'project', name: 'Project', displayPath: '.' };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const fixture = () => {
  let scope = 'runtime-a:/project';
  let state = initial;
  let read = async () => state;
  let mutate = async (): Promise<WebSearchMutationResult> => ({ state, status: 'applied', persistence: 'persisted', workers: [] });
  const reports: string[] = [];
  const store = createWebSearchStore({
    directory: () => '/project', scope: () => scope, report: value => { reports.push(value); },
    client: {
      resolveWorkspace: async () => workspace,
      getWebSearch: () => read(),
      updateWebSearch: async (_workspaceId, changes) => {
        state = { ...state, ...changes, fallbackProviderIds: changes.fallbackProviderIds ?? state.fallbackProviderIds, revision: String(Number(state.revision) + 1) };
        return mutate();
      },
      writeWebSearchCredential: () => mutate(), deleteWebSearchCredential: () => mutate(),
    },
  });
  return { store, reports, setScope: (value: string) => { scope = value; }, setRead: (value: typeof read) => { read = value; }, setMutation: (value: typeof mutate) => { mutate = value; } };
};

describe('canonical web search settings ownership', () => {
  test('failed authoritative reload preserves the visible settings and exposes the error', async () => {
    const { store, setRead } = fixture();
    await store.getState().load();
    const previous = store.getState().state;
    setRead(async () => { throw new Error('offline'); });
    await store.getState().load();
    expect(store.getState().state).toBe(previous);
    expect(store.getState().error).toBe('read');
  });
  test('saved settings with worker failures remain visible as partial, never saved success', async () => {
    const { store, setMutation, reports } = fixture();
    await store.getState().load();
    setMutation(async () => ({ state: { ...initial, enabled: false, revision: '2' }, status: 'partial', persistence: 'persisted', workers: [{ sessionId: 'session', workerGeneration: 'generation', status: 'failed', code: 'APPLY_FAILED' }] }));
    expect(await store.getState().update({ enabled: false })).toBe(false);
    expect(store.getState().outcome?.persistence).toBe('persisted');
    expect(store.getState().outcome?.workers[0]?.code).toBe('APPLY_FAILED');
    expect(reports).toEqual(['saving', 'error']);
    expect(store.getState().state).toMatchObject({ kind: 'ready', snapshot: { enabled: false, revision: '2' } });
  });
  test('persistence failure retains its distinct outcome', async () => {
    const { store, setMutation } = fixture();
    await store.getState().load();
    setMutation(async () => ({ state: initial, status: 'failed', persistence: 'failed', workers: [] }));
    expect(await store.getState().saveKey('native/primary', 'secret')).toBe(false);
    expect(store.getState().outcome).toMatchObject({ status: 'failed', persistence: 'failed' });
  });
  test('an obsolete directory cannot issue writes or commit an old read', async () => {
    const { store, setRead, setScope } = fixture();
    await store.getState().load();
    const pending = deferred<WebSearchConfigState>();
    setRead(() => pending.promise);
    const loading = store.getState().load();
    await Promise.resolve();
    setScope('runtime-b:/project');
    pending.resolve({ ...initial, revision: '3', enabled: false });
    await loading;
    expect(store.getState().state).toMatchObject({ kind: 'ready', snapshot: { revision: '1', enabled: true } });
    expect(await store.getState().removeKey('native/primary')).toBe(false);
  });
  test('a read started before a mutation cannot replace its authoritative result', async () => {
    const { store, setRead } = fixture();
    await store.getState().load();
    const pending = deferred<WebSearchConfigState>();
    setRead(() => pending.promise);
    const loading = store.getState().load();
    await Promise.resolve();
    expect(await store.getState().update({ enabled: false })).toBe(true);
    pending.resolve(initial);
    await loading;
    expect(store.getState().state).toMatchObject({ kind: 'ready', snapshot: { enabled: false, revision: '2' } });
  });
  test('runtime invalidation rejects pending writes even after returning to the same endpoint', async () => {
    const { store, setMutation, reports } = fixture();
    await store.getState().load();
    const pending = deferred<WebSearchMutationResult>();
    setMutation(() => pending.promise);
    const saving = store.getState().update({ enabled: false });
    store.getState().invalidate();
    pending.resolve({ state: { ...initial, enabled: false }, status: 'applied', persistence: 'persisted', workers: [] });
    expect(await saving).toBe(false);
    expect(store.getState().state.kind).toBe('idle');
    expect(store.getState().busy).toBe(false);
    expect(reports).not.toContain('saved');
  });
});
