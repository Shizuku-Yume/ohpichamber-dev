import React from 'react';

import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';

export type PendingRequests = { hasPermission: boolean; hasForm: boolean };

export const usePendingRequests = (sessionIds: readonly string[]): PendingRequests => {
  const hasPermission = useGlobalBlockingRequestsStore(React.useCallback(
    (state) => sessionIds.some((id) => Boolean(state.bySession.get(id)?.permissions.length)),
    [sessionIds],
  ));
  const hasForm = useGlobalBlockingRequestsStore(React.useCallback(
<<<<<<< HEAD
    (state) => sessionIds.some((id) => Boolean(state.bySession.get(id)?.forms.length)),
||||||| bc50ba56aa
    // A page that waits for the user's answer counts as a form.
    (state) => sessionIds.some((id) => {
      const pending = state.bySession.get(id);
      return Boolean(pending?.forms.length || pending?.pages.length);
    }),
=======
    (state) => sessionIds.some((id) => {
      const pending = state.bySession.get(id);
      return Boolean(pending?.forms.length || pending?.pages.length);
    }),
>>>>>>> upstream/main
    [sessionIds],
  ));
  return { hasPermission, hasForm };
};
