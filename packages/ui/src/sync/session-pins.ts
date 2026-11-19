import { getRuntimeKey } from '@/lib/runtime-switch';
import { getPinnedSessionKey, isSessionPinnedInMetadata } from '@/lib/sessionPins';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { forgetLegacyPins, getLegacyPins, setPendingPin, useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { setSessionPinned } from './session-actions';

export type PinTarget = { directory: string; sessionId: string };

const pinQueues = new Map<string, { tail: Promise<void>; count: number }>();

export function toggleSessionPin(target: PinTarget): Promise<void> {
 const key = getPinnedSessionKey(getRuntimeKey(), target.directory, target.sessionId);
 if (!key) return Promise.resolve();
 const pinned = !useSessionPinnedStore.getState().ids.has(key);
 return writeSessionPin(key, target, pinned);
}

<<<<<<< HEAD
function writeSessionPin(key: string, target: PinTarget, pinned: boolean): Promise<void> {
 setPendingPin(key, pinned);
||||||| bc50ba56aa
/**
 * Pin to: file the session's pin in `list` (null is Pinned), or unpin it with
 * `pinned` false. Moving a pin between lists shows once the server answers.
 */
export function setSessionPinList(target: PinTarget, pinned: boolean, list: string | null): Promise<void> {
  const key = getPinnedSessionKey(getRuntimeKey(), target.directory, target.sessionId);
  if (!key) return Promise.resolve();
  return writeSessionPin(key, target, pinned, list);
}
=======
export function setSessionPinList(target: PinTarget, pinned: boolean, list: string | null): Promise<void> {
  const key = getPinnedSessionKey(getRuntimeKey(), target.directory, target.sessionId);
  if (!key) return Promise.resolve();
  return writeSessionPin(key, target, pinned, list);
}
>>>>>>> upstream/main

<<<<<<< HEAD
 const queue = pinQueues.get(key) ?? { tail: Promise.resolve(), count: 0 };
 queue.count += 1;
 pinQueues.set(key, queue);
 const run = queue.tail.then(async () => {
  try {
   await setSessionPinned(target.sessionId, target.directory, pinned);
   // An old local pin must not bring back a session the user just unpinned.
   if (!pinned) forgetLegacyPins([key]);
  } finally {
   queue.count -= 1;
   if (queue.count === 0) {
    pinQueues.delete(key);
    setPendingPin(key, null);
   }
  }
 });
 queue.tail = run.catch(() => undefined);
 return run;
||||||| bc50ba56aa
function writeSessionPin(key: string, target: PinTarget, pinned: boolean, list: string | null): Promise<void> {
  setPendingPin(key, pinned);

  const queue = pinQueues.get(key) ?? { tail: Promise.resolve(), count: 0 };
  queue.count += 1;
  pinQueues.set(key, queue);
  const run = queue.tail.then(async () => {
    try {
      await setSessionPinned(target.sessionId, target.directory, pinned, list);
      // An old local pin must not bring back a session the user just unpinned.
      if (!pinned) forgetLegacyPins([key]);
    } finally {
      queue.count -= 1;
      if (queue.count === 0) {
        pinQueues.delete(key);
        setPendingPin(key, null);
      }
    }
  });
  queue.tail = run.catch(() => undefined);
  return run;
=======
function writeSessionPin(key: string, target: PinTarget, pinned: boolean, list: string | null): Promise<void> {
  setPendingPin(key, pinned);

  const queue = pinQueues.get(key) ?? { tail: Promise.resolve(), count: 0 };
  queue.count += 1;
  pinQueues.set(key, queue);
  const run = queue.tail.then(async () => {
    try {
      await setSessionPinned(target.sessionId, target.directory, pinned, list);
      if (!pinned) forgetLegacyPins([key]);
    } finally {
      queue.count -= 1;
      if (queue.count === 0) {
        pinQueues.delete(key);
        setPendingPin(key, null);
      }
    }
  });
  queue.tail = run.catch(() => undefined);
  return run;
>>>>>>> upstream/main
}

const migratingRuntimes = new Set<string>();

<<<<<<< HEAD
/**
 * Pins used to live on each device only. Once the server's session list is
 * complete, this device's old pins for that server move into session
 * metadata; a pin whose session is gone is dropped, and one that fails to
 * write stays local and is tried again on the next complete load.
 */
export async function migrateLegacyPins(): Promise<void> {
 const state = useGlobalSessionsStore.getState();
 if (!state.hasLoaded || state.status !== 'ready') return;
 const runtimeKey = getRuntimeKey();
 const pins = getLegacyPins(runtimeKey);
 if (pins.length === 0 || migratingRuntimes.has(runtimeKey)) return;
 migratingRuntimes.add(runtimeKey);
 try {
  for (const pin of pins) {
   if (getRuntimeKey() !== runtimeKey) return;
   const session = useGlobalSessionsStore.getState().entityById.get(pin.sessionId);
   if (!session || isSessionPinnedInMetadata(session)) {
    forgetLegacyPins([pin.key]);
    continue;
   }
   try {
    const directory = resolveGlobalSessionDirectory(session) ?? pin.directory;
    if (await setSessionPinned(pin.sessionId, directory, true)) {
     forgetLegacyPins([pin.key]);
||||||| bc50ba56aa
/**
 * Pins used to live on each device only. Once the server's session list is
 * complete, this device's old pins for that server move into session
 * metadata; a pin whose session is gone is dropped, and one that fails to
 * write stays local and is tried again on the next complete load.
 */
async function migrateLegacyPins(): Promise<void> {
  const state = useGlobalSessionsStore.getState();
  if (!state.hasLoaded || state.status !== 'ready') return;
  const runtimeKey = getRuntimeKey();
  const pins = getLegacyPins(runtimeKey);
  if (pins.length === 0 || migratingRuntimes.has(runtimeKey)) return;
  migratingRuntimes.add(runtimeKey);
  try {
    for (const pin of pins) {
      if (getRuntimeKey() !== runtimeKey) return;
      const session = useGlobalSessionsStore.getState().entityById.get(pin.sessionId);
      if (!session || isSessionPinnedInMetadata(session)) {
        forgetLegacyPins([pin.key]);
        continue;
      }
      try {
        if (await setSessionPinned(pin.sessionId, session.directory ?? pin.directory, true)) forgetLegacyPins([pin.key]);
      } catch (error) {
        console.warn('[session-pins] could not move a local pin to the server', error);
      }
=======
async function migrateLegacyPins(): Promise<void> {
  const state = useGlobalSessionsStore.getState();
  if (!state.hasLoaded || state.status !== 'ready') return;
  const runtimeKey = getRuntimeKey();
  const pins = getLegacyPins(runtimeKey);
  if (pins.length === 0 || migratingRuntimes.has(runtimeKey)) return;
  migratingRuntimes.add(runtimeKey);
  try {
    for (const pin of pins) {
      if (getRuntimeKey() !== runtimeKey) return;
      const session = useGlobalSessionsStore.getState().entityById.get(pin.sessionId);
      if (!session || isSessionPinnedInMetadata(session)) {
        forgetLegacyPins([pin.key]);
        continue;
      }
      try {
        if (await setSessionPinned(pin.sessionId, session.directory ?? pin.directory, true)) forgetLegacyPins([pin.key]);
      } catch (error) {
        console.warn('[session-pins] could not move a local pin to the server', error);
      }
>>>>>>> upstream/main
    }
   } catch (error) {
    console.warn('[session-pins] could not move a local pin to the server', error);
   }
  }
 } finally {
  migratingRuntimes.delete(runtimeKey);
 }
}

useGlobalSessionsStore.subscribe((state, previous) => {
 if (state.hasLoaded && state.status === 'ready' && (previous.status !== 'ready' || !previous.hasLoaded)) {
  void migrateLegacyPins();
 }
});
void migrateLegacyPins();
