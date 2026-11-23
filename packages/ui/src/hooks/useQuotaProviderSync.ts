import React from 'react';

import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { useQuotaStore } from '@/stores/useQuotaStore';

export const useQuotaProviderSync = (): void => {
  React.useEffect(() => subscribeOpenchamberEvents((event) => {
    if (event.type === 'quota-credentials-changed' || event.type === 'event-stream-ready') void useQuotaStore.getState().refreshAfterCredentialChange();
    if (!['guests-changed', 'quota-providers-changed', 'event-stream-ready'].includes(event.type)) return;
    void useQuotaStore.getState().loadExtensionProviders();
  }), []);
};
