import { create } from 'zustand';
import { z } from 'zod';
import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';
import { getPinnedSessionKey, isSessionPinned, isSessionPinnedInMetadata } from '@/lib/sessionPins';
import { resolveGlobalSessionDirectory } from './globalSessionStructure';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';
import { getDeferredSafeStorage } from './utils/safeStorage';

export { getPinnedSessionKey, isSessionPinned };

type SessionPinnedTarget = { directory: string; sessionId: string };

type LegacyPin = { key: string; runtimeKey: string; directory: string; sessionId: string };

type SessionPinnedStore = {
  ids: Set<string>;
  touchedAt?: Record<string, number>;
  setIds?: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  toggle: (target: SessionPinnedTarget) => void;
  clearPinnedSession: (runtimeKey: string, directory: string, sessionId: string) => void;
};

const STORAGE_KEY = 'oc.sessions.pinned.v2';
const LEGACY_STORAGE_KEY = 'oc.sessions.pinned';

const storage = getDeferredSafeStorage();

const pinKeySchema = z.tuple([z.string(), z.string(), z.string()]);

const parsePinnedSessionKey = (key: string): LegacyPin | null => {
  try {
    const parsed = pinKeySchema.safeParse(JSON.parse(key));
    if (!parsed.success) return null;
    const [runtimeKey, directory, sessionId] = parsed.data;
    const normalizedDirectory = normalizePath(directory);
    if (!runtimeKey || !normalizedDirectory || normalizedDirectory !== directory || !sessionId) return null;
    return { key, runtimeKey, directory: normalizedDirectory, sessionId };
  } catch {
    return null;
  }
};

const legacyStorageSchema = z.object({ version: z.literal(2), sessions: z.record(z.string(), z.number()) });

const readLegacyPins = (): Map<string, LegacyPin> => {
  storage.removeItem(LEGACY_STORAGE_KEY);
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return new Map();
  try {
    const parsed = legacyStorageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return new Map();
    const pins = Object.keys(parsed.data.sessions).flatMap((key) => {
      const pin = parsePinnedSessionKey(key);
      return pin ? [[key, pin] as const] : [];
    });
    return new Map(pins);
  } catch {
    storage.removeItem(STORAGE_KEY);
    return new Map();
  }
};

const pendingPins = new Map<string, boolean>();
const pinnedBySession = new WeakMap<Session, boolean>();

const isPinnedInMetadata = (session: Session): boolean => {
  const cached = pinnedBySession.get(session);
  if (cached !== undefined) return cached;
  const pinned = isSessionPinnedInMetadata(session);
  pinnedBySession.set(session, pinned);
  return pinned;
};

const derivePinnedIds = (): Set<string> => {
  const runtimeKey = getRuntimeKey();
  const ids = new Set<string>();
  let globalSessions: Session[] = [];
  try {
    globalSessions = useGlobalSessionsStore.getState()?.activeSessions ?? [];
  } catch {
    // useGlobalSessionsStore is in TDZ during circular module evaluation
  }
  for (const session of globalSessions) {
    const directory = resolveGlobalSessionDirectory(session);
    if (!directory || !isPinnedInMetadata(session)) continue;
    const key = getPinnedSessionKey(runtimeKey, directory, session.sessionId);
    if (key) ids.add(key);
  }
  for (const pin of readLegacyPins().values()) {
    if (pin.runtimeKey === runtimeKey) ids.add(pin.key);
  }
  for (const [key, pinned] of pendingPins) {
    if (pinned) ids.add(key);
    else ids.delete(key);
  }
  return ids;
};

const sameIds = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => (
  left.size === right.size && [...left].every((key) => right.has(key))
);

export const useSessionPinnedStore = create<SessionPinnedStore>((set, get) => ({
  ids: derivePinnedIds(),
  setIds: (next) => {
    const current = get().ids;
    const resolved = typeof next === 'function' ? next(current) : next;
    if (resolved === current) return;
    set({ ids: resolved });
  },
  toggle: (target) => {
    const key = getPinnedSessionKey(getRuntimeKey(), target.directory, target.sessionId);
    if (!key) return;
    const ids = new Set(get().ids);
    if (ids.has(key)) {
      ids.delete(key);
      setPendingPin(key, false);
    } else {
      ids.add(key);
      setPendingPin(key, true);
    }
    set({ ids });
  },
  clearPinnedSession: (runtimeKey, directory, sessionId) => {
    const key = getPinnedSessionKey(runtimeKey, directory, sessionId);
    if (!key) return;
    pendingPins.delete(key);
    forgetLegacyPins([key]);
    const ids = new Set(get().ids);
    ids.delete(key);
    set({ ids });
  },
}));

useSessionPinnedStore.subscribe((state) => {
  if (state.ids.size === 0 && pendingPins.size > 0) {
    pendingPins.clear();
  }
});

const publishPinnedIds = (): void => {
  const next = derivePinnedIds();
  if (!sameIds(next, useSessionPinnedStore.getState().ids)) {
    useSessionPinnedStore.setState({ ids: next });
  }
};

useGlobalSessionsStore.subscribe((state, previous) => {
  if (state.activeSessions !== previous.activeSessions) publishPinnedIds();
});
publishPinnedIds();

export const setPendingPin = (key: string, pinned: boolean | null): void => {
  if (pinned === null) pendingPins.delete(key);
  else pendingPins.set(key, pinned);
  publishPinnedIds();
};

export const getLegacyPins = (runtimeKey: string): LegacyPin[] => (
  [...readLegacyPins().values()].filter((pin) => pin.runtimeKey === runtimeKey)
);

export const forgetLegacyPins = (keys: readonly string[]): void => {
  const current = readLegacyPins();
  let changed = false;
  for (const key of keys) changed = current.delete(key) || changed;
  if (!changed) return;
  if (current.size === 0) storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, sessions: Object.fromEntries([...current.keys()].map((key) => [key, 0])) }));
  publishPinnedIds();
};
