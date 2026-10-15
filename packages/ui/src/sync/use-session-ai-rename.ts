import { useCallback } from 'react';
import type { Session, SessionMetadataState, SessionSnapshot } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { generateSessionTitle } from '@/lib/sessionTitle';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { buildSessionMessageRecordsSnapshot, useSyncRuntime } from './sync-context';
import { loadSessionTitleTurns, type NativeTitleTurn } from './session-title-context';
import { generateAndSaveSessionTitle, runSessionTitleGeneration, useSessionTitleGenerationPending } from './session-title-generation';
import { updateSessionTitle } from './session-actions';

async function readNativeTitleSession(
  sessionId: string,
  baseSession?: Session,
): Promise<{ session: Session; metadata: SessionMetadataState; snapshot: SessionSnapshot }> {
  const [snapshot, metadata] = await Promise.all([
    canonicalClient.getSession(sessionId),
    canonicalClient.getSessionMetadata(sessionId),
  ]);
  if (snapshot.session.sessionId !== sessionId || metadata.sessionId !== sessionId) {
    throw new Error('Native session response identified another session');
  }
  let session = baseSession ?? useGlobalSessionsStore.getState().entityById.get(sessionId);
  if (!session) {
    const listed = await canonicalClient.listSessions(snapshot.session.workspaceId);
    session = listed.items.find((candidate) => candidate.sessionId === sessionId);
  }
  if (!session) throw new Error('Native session projection is unavailable');
  if (session.workspaceId !== snapshot.session.workspaceId) throw new Error('Session moved');
  return {
    session: { ...session, ...snapshot.session, metadata: metadata.metadata, metadataRevision: metadata.revision },
    metadata,
    snapshot,
  };
}

export function useIsSessionAiRenamePending(sessionID: string, directory: string | null | undefined): boolean {
  const { runtimeKey } = useSyncRuntime();
  return useSessionTitleGenerationPending({ runtimeKey, sessionId: sessionID, directory: directory ?? '' });
}

export type SessionAiRenameController = {
  prepare: (signal: AbortSignal) => Promise<{ session: Session; metadata: SessionMetadataState; turns: NativeTitleTurn[] }>;
  rename: () => Promise<void>;
};

export function useSessionAiRename(sessionID: string, directory: string | null | undefined): SessionAiRenameController {
  const { runtimeKey, childStores, messageLoader } = useSyncRuntime();

  const prepare = useCallback(async (signal: AbortSignal) => {
    const normalizedDirectory = normalizePath(directory);
    if (!normalizedDirectory) throw new Error('Session title generation is unavailable');
    signal.throwIfAborted();
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
    const store = childStores.ensureChild(normalizedDirectory, { bootstrap: false });
    const baseSession = store.getState().session.find((session) => session.sessionId === sessionID);
    const native = await readNativeTitleSession(sessionID, baseSession);
    signal.throwIfAborted();
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
    const workspace = store.getState().workspace;
    if (workspace && workspace.workspaceId !== native.snapshot.session.workspaceId) throw new Error('Session moved');
    const release = messageLoader.retainSessionHistory({ directory: normalizedDirectory, sessionId: sessionID });
    try {
      const turns = await loadSessionTitleTurns({
        loader: messageLoader,
        target: { directory: normalizedDirectory, sessionId: sessionID },
        getMessages: () => buildSessionMessageRecordsSnapshot(store.getState(), sessionID).list,
        getTurns: () => store.getState().snapshot[sessionID]?.turns ?? native.snapshot.turns,
        signal,
      });
      signal.throwIfAborted();
      if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
      return { session: native.session, metadata: native.metadata, turns };
    } finally {
      release();
    }
  }, [childStores, directory, messageLoader, runtimeKey, sessionID]);

  const rename = useCallback(async () => {
    const normalizedDirectory = normalizePath(directory);
    if (!normalizedDirectory) return;
    await runSessionTitleGeneration({ runtimeKey, directory: normalizedDirectory, sessionId: sessionID }, async (signal) => {
      let workspaceId: string | undefined;
      await generateAndSaveSessionTitle({
        signal,
        prepare: async (requestSignal) => {
          const prepared = await prepare(requestSignal);
          workspaceId = prepared.session.workspaceId;
          return prepared;
        },
        generate: (turns, requestSignal) => generateSessionTitle({ turns, workspaceId, directory: normalizedDirectory, signal: requestSignal }),
        readSession: async () => {
          const native = await readNativeTitleSession(sessionID);
          return { session: native.session, metadata: native.metadata };
        },
        saveTitle: (title, requestSignal) => updateSessionTitle(sessionID, title, { directory: normalizedDirectory, expectedRuntimeKey: runtimeKey, signal: requestSignal }),
      });
    });
  }, [directory, prepare, runtimeKey, sessionID]);

  return { prepare, rename };
}
