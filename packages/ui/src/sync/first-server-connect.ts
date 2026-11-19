<<<<<<< HEAD
import type { ChildStoreManager } from './child-store';
import { getRuntimeKey } from '@/lib/runtime-switch';
||||||| bc50ba56aa
/**
 * The first `server.connected` OpenCode sends to a sync owner in a runtime.
 *
 * Startup reads that ran while OpenCode was still starting fail, and the boot
 * window ignores `server.connected` as a stream restart. This first event is
 * the moment OpenCode answers, so work that failed before it is retried once,
 * here, instead of waiting for a poll or a user action.
 */
=======
>>>>>>> upstream/main

// Canonical discovery, including a successful empty session scope, proves the
// active Host can answer. No removed server.connected wire event is required.
type FirstServerConnectListener = (runtimeKey: string) => void;
const connectedRuntimeByOwner = new WeakMap<ChildStoreManager, string>();
const listeners = new Set<FirstServerConnectListener>();

<<<<<<< HEAD
/** Retry failed startup scopes and notify polling once per owner/runtime. */
export function notifyFirstCanonicalBootstrap(owner: ChildStoreManager, runtimeKey: string): void {
  if (getRuntimeKey() !== runtimeKey || connectedRuntimeByOwner.get(owner) === runtimeKey) return;
  connectedRuntimeByOwner.set(owner, runtimeKey);
  owner.retryFailedBootstraps();
  for (const listener of listeners) listener(runtimeKey);
||||||| bc50ba56aa
type FirstServerConnectListener = (runtimeKey: string) => void

const connectedRuntimeByOwner = new WeakMap<ChildStoreManager, string>()
const listeners = new Set<FirstServerConnectListener>()

/**
 * True exactly once per owner and runtime: for the first `server.connected`
 * after the owner started or switched runtime.
 */
export function claimFirstServerConnect(owner: ChildStoreManager, runtimeKey: string): boolean {
  if (connectedRuntimeByOwner.get(owner) === runtimeKey) return false
  connectedRuntimeByOwner.set(owner, runtimeKey)
  return true
}

export function notifyFirstServerConnect(runtimeKey: string): void {
  for (const listener of listeners) listener(runtimeKey)
=======
type FirstServerConnectListener = (runtimeKey: string) => void

const connectedRuntimeByOwner = new WeakMap<ChildStoreManager, string>()
const listeners = new Set<FirstServerConnectListener>()

export function claimFirstServerConnect(owner: ChildStoreManager, runtimeKey: string): boolean {
  if (connectedRuntimeByOwner.get(owner) === runtimeKey) return false
  connectedRuntimeByOwner.set(owner, runtimeKey)
  return true
}

export function notifyFirstServerConnect(runtimeKey: string): void {
  for (const listener of listeners) listener(runtimeKey)
>>>>>>> upstream/main
}

/** Retained consumer subscription; readiness comes only from native bootstrap. */
export function subscribeFirstServerConnect(listener: FirstServerConnectListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
