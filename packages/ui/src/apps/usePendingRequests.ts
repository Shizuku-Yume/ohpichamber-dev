import React from 'react';

import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';

export type PendingRequests = { hasPermission: boolean; hasForm: boolean };

export const usePendingRequests = (sessionIds: readonly string[]): PendingRequests => {
  const hasPermission = useGlobalBlockingRequestsStore(React.useCallback(
    (state) => sessionIds.some((id) => Boolean(state.bySession.get(id)?.permissions.length)),
    [sessionIds],
  ));
  const hasForm = useGlobalBlockingRequestsStore(React.useCallback(
    (state) => sessionIds.some((id) => Boolean(state.bySession.get(id)?.forms.length)),
    [sessionIds],
  ));
  return { hasPermission, hasForm };
};
