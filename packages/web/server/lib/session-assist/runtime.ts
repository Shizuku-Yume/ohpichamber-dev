import type { CanonicalEvent, HistoryPage, RuntimeSession, SessionSnapshot } from '@openchamber/agent-contract';
import type { SessionLineage } from '../session-lineage.js';

export interface AssistSessionScope {
  sessionId: string;
  rootSessionId?: string;
  projectId?: string;
  workspaceId?: string;
  cwd?: string;
}

export interface SessionAssistSessionService {
  open: (sessionId: string) => Promise<SessionSnapshot | { session: RuntimeSession }>;
  history: (sessionId: string, query?: string) => Promise<HistoryPage>;
}

export interface SessionAssistDependencies {
  sessionService: SessionAssistSessionService;
  resolveSessionScope: (sessionId: string) => Promise<AssistSessionScope | null>;
  lineage?: Pick<SessionLineage, 'isChild'> | null;
  onTurnSettled?: ((sessionId: string) => void | Promise<void>) | null;
}

export interface SessionAssistRuntime {
  processCanonicalEvent: (event: CanonicalEvent, scope?: AssistSessionScope | null) => void;
  stop: () => void;
}

export const createSessionAssistRuntime = ({
  lineage = null,
  onTurnSettled = null,
}: SessionAssistDependencies): SessionAssistRuntime => {
  const settled = new Set<string>();
  let stopped = false;

  const processCanonicalEvent = (event: CanonicalEvent, scope?: AssistSessionScope | null): void => {
    if (stopped) return;
    if (event.type === 'session.deleted') {
      for (const id of event.deletedSessionIds) {
        settled.delete(id);
      }
      return;
    }
    const sessionId = event.sessionId;
    if (!sessionId || (scope?.sessionId && scope.sessionId !== sessionId)) return;
    if (lineage?.isChild?.(sessionId) === true) return;

    if (event.type === 'run.started' || event.type === 'turn.started') {
      settled.delete(sessionId);
      return;
    }

    if (event.type === 'message.created' && event.role === 'user') {
      settled.delete(sessionId);
      return;
    }

    const isTurnCompleted = event.type === 'run.completed' || (event.type === 'session.status' && event.runtimeStatus === 'idle');
    if (isTurnCompleted) {
      if (!settled.has(sessionId)) {
        settled.add(sessionId);
        void onTurnSettled?.(sessionId);
      }
      return;
    }

    if (event.type === 'run.failed' || event.type === 'run.cancelled' || (event.type === 'session.status' && event.runtimeStatus === 'unavailable')) {
      if (!settled.has(sessionId)) {
        settled.add(sessionId);
        void onTurnSettled?.(sessionId);
      }
    }
  };

  const stop = (): void => {
    stopped = true;
    settled.clear();
  };

  return { processCanonicalEvent, stop };
};
