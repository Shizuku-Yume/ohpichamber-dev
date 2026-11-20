import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { createSyncStores, prefetchSessionBeforeMount, takePrefetchedSyncStores } from './sync-stores';
import { deferred, nativeClient, nativeSnapshot } from './session-message-loader-test-fixtures';

const target = { directory: '/loader-repo', sessionId: 'session-a' };
const cleanups: Array<() => void> = [];
afterEach(() => {
  const pending = takePrefetchedSyncStores(canonicalClient, getRuntimeKey());
  pending?.messageLoader.dispose();
  pending?.childStores.disposeAll();
  for (const cleanup of cleanups.splice(0)) cleanup();
  mock.restore();
});

function setup(client = nativeClient()) {
  const stores = createSyncStores(client, getRuntimeKey());
  cleanups.push(() => { stores.messageLoader.dispose(); stores.childStores.disposeAll(); });
  return stores;
}

test.each([false, true])('adopting in-flight prefetch preserves canonical state and callbacks (empty=%s)', async (empty) => {
  const gate = deferred<ReturnType<typeof nativeSnapshot>>();
  const snapshot = nativeSnapshot(target.sessionId, empty ? [] : undefined);
  const read = mock(() => gate.promise);
  const stores = setup(nativeClient({ getSnapshot: read }));
  const prefetch = stores.messageLoader.prefetch(target);
  const onSnapshot = mock<NonNullable<typeof stores.callbacks.onSnapshot>>(() => {});
  stores.callbacks.onSnapshot = onSnapshot;
  stores.callbacks.isCurrent = () => true;
  stores.messageLoader.configure(stores.configuration);
  const visible = stores.messageLoader.ensure(target);
  gate.resolve(snapshot);
  await Promise.all([prefetch, visible]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  expect(stores.childStores.getChild(target.directory)?.getState().message[target.sessionId]).toEqual(snapshot.messages);
  expect(stores.messageLoader.getSnapshot(target).status).toBe('ready');
});

test('a failed canonical prefetch remains an explicit error, not empty success', async () => {
  const failure = new CanonicalApiError({ type: 'urn:test:missing', title: 'Missing', status: 404, detail: 'Missing session', code: 'SESSION_NOT_FOUND', retryable: false });
  const stores = setup(nativeClient({ getSnapshot: async () => { throw failure; } }));
  await stores.messageLoader.prefetch(target);
  expect(stores.messageLoader.getSnapshot(target)).toMatchObject({ status: 'error', error: failure, resolved: false });
  expect(stores.childStores.getChild(target.directory)?.getState().snapshot[target.sessionId]).toBeUndefined();
});

test('pre-mount reads are adopted once, without another snapshot request', async () => {
  const client = nativeClient();
  const read = spyOn(canonicalClient, 'getSnapshot').mockImplementation(client.getSnapshot);
  spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(client.resolveWorkspace);
  spyOn(canonicalClient, 'getSessionMetadata').mockImplementation(client.getSessionMetadata);
  spyOn(canonicalClient, 'getQueue').mockImplementation(client.getQueue);
  prefetchSessionBeforeMount(target);
  prefetchSessionBeforeMount(target);
  const stores = takePrefetchedSyncStores(canonicalClient, getRuntimeKey());
  expect(stores).not.toBeNull();
  if (!stores) throw new Error('Expected prefetched stores');
  cleanups.push(() => { stores.messageLoader.dispose(); stores.childStores.disposeAll(); });
  await stores.messageLoader.ensure(target);
  expect(read).toHaveBeenCalledTimes(1);
  expect(takePrefetchedSyncStores(canonicalClient, getRuntimeKey())).toBeNull();
});

test('empty targets allocate no pre-mount owner', () => {
  prefetchSessionBeforeMount({ directory: '', sessionId: '' });
  expect(takePrefetchedSyncStores(canonicalClient, getRuntimeKey())).toBeNull();
});

test('a runtime switch discards in-flight pre-mount state', async () => {
  const gate = deferred<ReturnType<typeof nativeSnapshot>>();
  const client = nativeClient();
  spyOn(canonicalClient, 'getSnapshot').mockImplementation(() => gate.promise);
  spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(client.resolveWorkspace);
  prefetchSessionBeforeMount(target);
  switchRuntimeEndpoint({ apiBaseUrl: 'https://prefetch.test', runtimeKey: 'prefetch-next' });
  gate.resolve(nativeSnapshot());
  await gate.promise;
  expect(takePrefetchedSyncStores(canonicalClient, getRuntimeKey())).toBeNull();
});
