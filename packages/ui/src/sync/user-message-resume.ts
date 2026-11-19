import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { unarchiveSession } from './session-actions';

type ResumeDependencies = {
  runtimeKey: () => string;
  session: (id: string) => Session | undefined;
  restore: (id: string, runtimeKey: string) => Promise<boolean>;
  reportFailure: () => Promise<void>;
};

const defaultDependencies: ResumeDependencies = {
  runtimeKey: getRuntimeKey,
  session: (id) => useGlobalSessionsStore.getState().entityById.get(id),
  restore: unarchiveSession,
  reportFailure: async () => {
    const { toast } = await import('sonner');
    const { formatMessage, useI18nStore } = await import('@/lib/i18n');
    toast.error(formatMessage(useI18nStore.getState().dictionary, 'sessions.sidebar.session.restore.error'));
  },
};

export function prepareUserMessageResume(
  sessionId: string,
  runtimeKey: string,
  deps: ResumeDependencies = defaultDependencies,
): () => Promise<void> {
  const session = deps.runtimeKey() === runtimeKey ? deps.session(sessionId) : undefined;
  const archivedAt = session?.parentSessionId ? undefined : session?.archivedAt;
  return async () => {
    if (!archivedAt || deps.runtimeKey() !== runtimeKey) return;
<<<<<<< HEAD
    // A later archive or a manual restore supersedes the send's original state.
    if (deps.session(sessionId)?.archivedAt !== archivedAt) return;
||||||| bc50ba56aa
    // A later archive or a manual restore supersedes the send's original state.
    if (deps.session(sessionId)?.time.archived !== archivedAt) return;
=======
    if (deps.session(sessionId)?.time.archived !== archivedAt) return;
>>>>>>> upstream/main
    try {
      if (await deps.restore(sessionId, runtimeKey)) return;
    } catch {
      // The message is already accepted. Restoration must never retry it.
    }
    if (deps.runtimeKey() === runtimeKey) await deps.reportFailure();
  };
}
