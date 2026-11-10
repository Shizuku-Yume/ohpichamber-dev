/**
 * Keeps the extension catalog current while the app runs.
 *
 * The rail reads the catalog on mount and on a runtime switch, but another
 * window, another device, or an author rebuilding a folder install can change
 * it at any time. The server announces each change on the control stream; this
 * hook reads the catalog again then, and when the stream reconnects, since a
 * change made during the gap was not announced to this client. Frames reload
 * on their own when a package's revision moves.
 */

import React from 'react';

import { loadGuestCatalog, reloadGuestCatalog } from '@/lib/guests/load-catalog';
<<<<<<< HEAD
import { subscribeOpenchamberEvents, type OpenChamberEvent } from '@/lib/openchamberEvents';

/**
 * What one control-stream event asks of the catalog: a change is read from a
 * request that starts after it, a reconnection from a plain read, since a
 * change made during the gap was never announced to this client. Anything
 * else is another surface's business.
 */
export const handleGuestCatalogEvent = (
  event: OpenChamberEvent,
  actions: { reload: () => void; load: () => void } = { reload: () => void reloadGuestCatalog(), load: () => void loadGuestCatalog() },
): void => {
  if (event.type === 'guests-changed') actions.reload();
  else if (event.type === 'event-stream-ready') actions.load();
};

export const useGuestCatalogSync = (): void => {
  React.useEffect(() => subscribeOpenchamberEvents((event) => handleGuestCatalogEvent(event)), []);
=======
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';

export const useGuestCatalogSync = (): void => {
  React.useEffect(() => subscribeOpenchamberEvents((event) => {
    if (event.type === 'guests-changed') void reloadGuestCatalog();
    else if (event.type === 'event-stream-ready') void loadGuestCatalog();
  }), []);
>>>>>>> bc50ba56a
};
