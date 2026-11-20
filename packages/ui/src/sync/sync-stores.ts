import { canonicalClient, type CanonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';
import { ChildStoreManager } from './child-store';
import { SessionMessageLoader, type LoaderConfiguration, type SessionMessageTarget } from './session-message-loader';

export function createSyncStores(client: CanonicalClient, runtimeKey: string) {
  const childStores = new ChildStoreManager();
  const callbacks: Pick<LoaderConfiguration, 'onSnapshot' | 'isCurrent'> = {};
  const configuration: LoaderConfiguration = {
    client,
    runtimeKey,
    isCurrent: () => getRuntimeKey() === runtimeKey && (callbacks.isCurrent?.() ?? true),
    onSnapshot: (...args) => callbacks.onSnapshot?.(...args),
  };
  const messageLoader = new SessionMessageLoader(childStores, configuration);
  return { childStores, messageLoader, configuration, callbacks };
}

let prefetched: ReturnType<typeof createSyncStores> | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;

function disposePrefetched(): void {
  clearTimeout(expiry);
  expiry = undefined;
  prefetched?.messageLoader.dispose();
  prefetched?.childStores.disposeAll();
  prefetched = null;
}

subscribeRuntimeEndpointWillChange(disposePrefetched);

export function takePrefetchedSyncStores(client: CanonicalClient, runtimeKey: string) {
  if (!prefetched) return null;
  if (prefetched.configuration.client !== client || prefetched.configuration.runtimeKey !== runtimeKey) {
    disposePrefetched();
    return null;
  }
  const stores = prefetched;
  prefetched = null;
  clearTimeout(expiry);
  expiry = undefined;
  return stores;
}

export function prefetchSessionBeforeMount(target: SessionMessageTarget): void {
  const directory = normalizePath(target.directory);
  if (!directory || !target.sessionId) return;
  const loaderTarget = { directory, sessionId: target.sessionId };
  const runtimeKey = getRuntimeKey();
  if (prefetched && prefetched.configuration.runtimeKey !== runtimeKey) disposePrefetched();
  prefetched ??= createSyncStores(canonicalClient, runtimeKey);
  clearTimeout(expiry);
  expiry = setTimeout(disposePrefetched, 30_000);
  void prefetched.messageLoader.prefetch(loaderTarget);
}
