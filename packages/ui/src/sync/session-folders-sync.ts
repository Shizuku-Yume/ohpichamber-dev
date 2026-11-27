import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { handleSessionFoldersChanged, handleSessionFoldersStreamReady } from '@/stores/useSessionFoldersStore';

const RETURN_READ_THROTTLE_MS = 2_000;

type SessionFoldersSyncHandlers = {
  onFoldersChanged: (updatedAt: number) => void;
  onStreamReady: () => void;
};

type SessionFoldersSyncDeps = SessionFoldersSyncHandlers & {
  subscribeEvents?: (listener: Parameters<typeof subscribeOpenchamberEvents>[0]) => () => void;
};

const storeHandlers: SessionFoldersSyncHandlers = {
  onFoldersChanged: handleSessionFoldersChanged,
  onStreamReady: handleSessionFoldersStreamReady,
};

export const subscribeSessionFoldersSync = (runtimeKey: string, deps: SessionFoldersSyncDeps = storeHandlers): (() => void) => {
  const handlers: SessionFoldersSyncHandlers = deps;
  const subscribeEvents = deps.subscribeEvents ?? subscribeOpenchamberEvents;
  const unsubscribe = subscribeEvents((event) => {
    if (runtimeKey !== getRuntimeKey()) return;
    if (event.type === 'session-folders-changed') handlers.onFoldersChanged(event.updatedAt);
    else if (event.type === 'event-stream-ready') handlers.onStreamReady();
  });

  let lastReturnRead = Number.NEGATIVE_INFINITY;
  const onReturn = (event: Event) => {
    if (runtimeKey !== getRuntimeKey() || document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (event.type !== 'online' && now - lastReturnRead < RETURN_READ_THROTTLE_MS) return;
    lastReturnRead = now;
    handlers.onStreamReady();
  };
  document.addEventListener('visibilitychange', onReturn);
  const windowSignals = ['focus', 'pageshow', 'online', 'openchamber:system-resume'];
  for (const signal of windowSignals) window.addEventListener(signal, onReturn);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onReturn);
    for (const signal of windowSignals) window.removeEventListener(signal, onReturn);
  };
};
