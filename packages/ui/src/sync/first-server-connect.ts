

import type { ChildStoreManager } from './child-store';
import { getRuntimeKey } from '@/lib/runtime-switch';

// Canonical discovery, including a successful empty session scope, proves the
// active Host can answer. No removed server.connected wire event is required.
type FirstServerConnectListener = (runtimeKey: string) => void;
const connectedRuntimeByOwner = new WeakMap<ChildStoreManager, string>();
const listeners = new Set<FirstServerConnectListener>();

/** Retry failed startup scopes and notify polling once per owner/runtime. */
export function notifyFirstCanonicalBootstrap(owner: ChildStoreManager, runtimeKey: string): void {
  if (getRuntimeKey() !== runtimeKey || connectedRuntimeByOwner.get(owner) === runtimeKey) return;
  connectedRuntimeByOwner.set(owner, runtimeKey);
  owner.retryFailedBootstraps();
  for (const listener of listeners) listener(runtimeKey);
}

/** Retained consumer subscription; readiness comes only from native bootstrap. */
export function subscribeFirstServerConnect(listener: FirstServerConnectListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function claimFirstServerConnect(owner: ChildStoreManager, runtimeKey: string): boolean {
  if (connectedRuntimeByOwner.get(owner) === runtimeKey) return false
  connectedRuntimeByOwner.set(owner, runtimeKey)
  return true
}

export function notifyFirstServerConnect(runtimeKey: string): void {
  for (const listener of listeners) listener(runtimeKey)
}
