import React from 'react';
import type { Session } from '@openchamber/agent-contract';

export function useParentSessionBack(
  parentSession: Pick<Session, 'sessionId' | 'displayPath'> | null | undefined,
  hidden: boolean,
  openSession: (id: string, directory: string | null) => void,
  register?: (handler: (() => void) | null) => void,
): () => void {
  const returnToParent = React.useCallback(() => {
    if (parentSession) openSession(parentSession.sessionId, parentSession.displayPath ?? null);
  }, [openSession, parentSession]);
  React.useLayoutEffect(() => {
    if (!register) return;
    register(parentSession && !hidden ? returnToParent : null);
    return () => register(null);
  }, [register, parentSession, hidden, returnToParent]);
  return returnToParent;
}
