import { useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { selectAutoReady, useRoutingStore } from '@/stores/useRoutingStore';
import { isStaleAutoSelection } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncRuntimeContext } from '@/sync/sync-runtime-context';
import { isDraftSessionId } from '@/lib/sessionIdentity';
import {
  isSessionRunActive,
  resolveActiveRunModelSelection,
  type ModelPair,
} from '@/lib/messages/userModelChoice';

const noopSubscribe = () => () => undefined;

const areModelPairsEqual = (left: ModelPair | null, right: ModelPair | null): boolean => (
  left === right
  || (Boolean(left && right) && left?.providerId === right?.providerId && left?.modelId === right?.modelId)
);

export const useActiveRunModelSelection = (options?: {
  enabled?: boolean;
  sessionId?: string | null;
  directory?: string | null;
}): ModelPair | null => {
  const enabled = options?.enabled ?? true;
  const syncRuntime = useContext(SyncRuntimeContext);
  const storeSessionId = useSessionUIStore((state) => (
    enabled && options?.sessionId === undefined ? state.currentSessionId : null
  ));
  const newSessionDraftOpen = useSessionUIStore((state) => state.newSessionDraft.open);
  const getDirectoryForSession = useSessionUIStore((state) => state.getDirectoryForSession);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

  const sessionId = enabled ? (options?.sessionId ?? storeSessionId) : null;
  const activeSessionId = sessionId && !newSessionDraftOpen && !isDraftSessionId(sessionId) ? sessionId : null;
  const targetDirectory = options?.directory
    ?? (activeSessionId ? getDirectoryForSession(activeSessionId) : undefined)
    ?? currentDirectory;

  const sessionSavedModel = useSelectionStore((state) => (
    activeSessionId ? state.sessionModelSelections.get(activeSessionId) ?? null : null
  ));
  const autoReady = useRoutingStore(selectAutoReady);

  const resolvedDirectory = useSyncExternalStore(
    syncRuntime ? syncRuntime.currentDirectory.subscribe : noopSubscribe,
    () => targetDirectory ?? syncRuntime?.currentDirectory.get() ?? '',
  );
  const childStore = syncRuntime && resolvedDirectory
    ? syncRuntime.childStores.ensureChild(resolvedDirectory, { bootstrap: false })
    : null;

  const cache = useRef<ModelPair | null>(null);
  const getSnapshot = useCallback((): ModelPair | null => {
    if (!activeSessionId || !childStore) {
      cache.current = null;
      return null;
    }
    const state = childStore.getState();
    const snapshot = state.snapshot[activeSessionId];
    const sessionRecord = state.session.find((item) => item.sessionId === activeSessionId);
    const activeRun = snapshot?.activeRun ?? state.runControlActiveRun?.[activeSessionId] ?? null;
    const status = state.sessionStatusInvalidated?.[activeSessionId]
      ? 'unavailable'
      : state.session_status[activeSessionId];
    const isRunActive = isSessionRunActive({
      status,
      sessionRuntimeStatus: sessionRecord?.runtimeStatus,
      activeRun,
    });
    const next = resolveActiveRunModelSelection({
      isRunActive,
      activeRun,
      turns: snapshot?.turns,
      messages: state.message[activeSessionId],
      snapshotSelectionModel: snapshot?.selection?.model ?? null,
      sessionSavedModel,
      autoReady,
      isStaleAuto: sessionSavedModel
        ? isStaleAutoSelection(sessionSavedModel.providerId, sessionSavedModel.modelId)
        : false,
    });
    if (!areModelPairsEqual(cache.current, next)) {
      cache.current = next;
    }
    return cache.current;
  }, [activeSessionId, autoReady, childStore, sessionSavedModel]);

  return useSyncExternalStore(
    useCallback((notify) => (childStore ? childStore.subscribe(notify) : noopSubscribe()), [childStore]),
    getSnapshot,
    getSnapshot,
  );
};
