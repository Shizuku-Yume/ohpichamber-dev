import React from 'react';

import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { isExtensionQuotaProviderId } from '@/lib/quota/extensionProviders';
import { useQuotaStore } from '@/stores/useQuotaStore';

export const useQuotaProviderSync = (): void => {
  React.useEffect(() => subscribeOpenchamberEvents((event) => {
    if (event.type === 'event-stream-ready') void useQuotaStore.getState().refreshAfterCredentialChange();
    if (event.type === 'guests-changed' || event.type === 'event-stream-ready') {
      void useQuotaStore.getState().loadExtensionProviders();
      return;
    }
    if (event.type !== 'quota-providers-changed') return;
    if (isExtensionQuotaProviderId(event.providerId)) {
      void useQuotaStore.getState().loadExtensionProviders().then(() => useQuotaStore.getState().refreshProviderAfterChange(event.providerId));
      return;
    }
    void useQuotaStore.getState().refreshProviderAfterChange(event.providerId);
  }), []);
};
