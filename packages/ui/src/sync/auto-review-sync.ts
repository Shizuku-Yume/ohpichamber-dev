import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { applyAutoReviewUpdatedEvent, isAutoReviewAvailable, useAutoReviewStore } from '@/stores/useAutoReviewStore';

const hydrateAutoReviews = (): Promise<void> => useAutoReviewStore.getState().hydrate().catch(() => undefined);

/**
 * Auto-review runs ride the control SSE stream: read once at mount, again after
 * every reconnect of that stream, and kept by its `openchamber:auto-review.updated`
 * broadcasts in between, so the strip shows progress and completion as they happen.
 */
export const subscribeAutoReviewSync = (runtimeKey: string): (() => void) => {
  if (!isAutoReviewAvailable()) return () => undefined;
  void hydrateAutoReviews();
  return subscribeOpenchamberEvents((event) => {
    if (runtimeKey !== getRuntimeKey()) return;
    if (event.type === 'event-stream-ready') void hydrateAutoReviews();
    else if (event.type === 'openchamber:auto-review.updated') applyAutoReviewUpdatedEvent(event, runtimeKey);
  });
};
