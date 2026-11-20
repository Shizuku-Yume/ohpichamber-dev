import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { toast } from '@/components/ui';
import type { useI18n } from '@/lib/i18n';
import type { Session } from '@openchamber/agent-contract';
import { leaveFinishedSessions } from '@/lib/sessionTabs';
import { setSessionWorkState } from '@/sync/session-actions';
import { normalizePath } from '../utils';

export const toggleSessionWork = async (
  sessionId: string,
  directory: string | null,
  inWork: readonly Session[],
  t: ReturnType<typeof useI18n>['t'],
): Promise<void> => {
  try {
    if (inWork.length === 0) {
      await setSessionWorkState(sessionId, directory, 'open');
      return;
    }
    for (const entry of inWork) {
      await setSessionWorkState(entry.sessionId, normalizePath(resolveGlobalSessionDirectory(entry) ?? null) ?? directory, 'done');
    }
    leaveFinishedSessions(inWork.map((entry) => entry.sessionId));
  } catch {
    toast.error(t('sessions.sidebar.session.work.updateFailed'));
  }
};
