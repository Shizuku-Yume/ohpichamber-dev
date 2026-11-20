import React from 'react';

import { useI18n } from '@/lib/i18n';
import type { Session } from '@openchamber/agent-contract';
import { isOperatorChildSession } from '@/lib/sessionOperatorChild';
import { useSessionWorkflowRuns } from '@/lib/workflows/store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { WorkflowRunCard } from './WorkflowRunCard';

const NO_SESSIONS: Session[] = [];

const collectOperatorChildren = (rootId: string, sessions: readonly Session[]): Session[] => {
  const found: Session[] = [];
  const queue = [rootId];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const session of sessions) {
      if (session.parentSessionId !== parentId || seen.has(session.sessionId) || !isOperatorChildSession(session)) continue;
      seen.add(session.sessionId);
      found.push(session);
      queue.push(session.sessionId);
    }
  }
  return found;
};

const useOperatorChildren = (sessionId: string): Session[] => {
  const activeSessions = useGlobalSessionsStore((state) => state.activeSessions);
  return React.useMemo(() => {
    if (isOperatorChildSession(activeSessions.find((session) => session.sessionId === sessionId))) return NO_SESSIONS;
    const children = collectOperatorChildren(sessionId, activeSessions);
    return children.length > 0 ? children : NO_SESSIONS;
  }, [activeSessions, sessionId]);
};

const ChildApprovals: React.FC<{ child: Session }> = ({ child }) => {
  const { t } = useI18n();
  const pending = useSessionWorkflowRuns(child.sessionId).filter((run) => run.state === 'awaiting-approval');
  if (pending.length === 0) return null;
  return (
    <>
      {pending.map((run) => (
        <div key={run.id} data-operator-child-workflow={child.sessionId}>
          <div dir="auto" className="truncate typography-meta text-muted-foreground">
            {t('chat.workflow.proposedBy', { title: child.title || t('sessions.sidebar.session.untitled') })}
          </div>
          <WorkflowRunCard sessionId={child.sessionId} runId={run.id} />
        </div>
      ))}
    </>
  );
};

export const OperatorChildWorkflowApprovals: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const children = useOperatorChildren(sessionId);
  if (children.length === 0) return null;
  return (
    <div className="chat-message-column">
      {children.map((child) => <ChildApprovals key={child.sessionId} child={child} />)}
    </div>
  );
};
