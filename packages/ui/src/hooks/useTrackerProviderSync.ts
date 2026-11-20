
import React from 'react';

import type { TrackerAPI } from '@/lib/api/types';
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { refreshTrackers } from '@/stores/useTrackerAuthStore';

export const useTrackerProviderSync = (trackers: TrackerAPI | undefined): void => {
  React.useEffect(() => subscribeOpenchamberEvents((event) => {
    // The extension catalog is what changes the tracker list here: a package
    // approved, enabled, updated or removed. A reconnect reads again too.
    if (event.type !== 'guests-changed' && event.type !== 'event-stream-ready') return;
    void refreshTrackers(trackers);
  }), [trackers]);
};
