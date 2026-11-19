import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { applyAutoReviewUpdatedEvent, isAutoReviewAvailable, useAutoReviewStore } from '@/stores/useAutoReviewStore';

<<<<<<< HEAD
const hydrateAutoReviews = (): Promise<void> => useAutoReviewStore.getState().hydrate().catch(() => undefined);

/**
 * Auto-review runs ride the control SSE stream: read once at mount, again after
 * every reconnect of that stream, and kept by its `openchamber:auto-review.updated`
 * broadcasts in between, so the strip shows progress and completion as they happen.
 */
||||||| bc50ba56aa
/**
 * Auto-review changes ride the control SSE stream, like the message queue. A space's runs live
 * in that space's own server and come over the same connection the host makes for its queue, so
 * they are read once the space is known, again when the host follows that connection again, and
 * with the host's after a gap in the stream.
 */
=======
>>>>>>> upstream/main
export const subscribeAutoReviewSync = (runtimeKey: string): (() => void) => {
  if (!isAutoReviewAvailable()) return () => undefined;
  void hydrateAutoReviews();
  return subscribeOpenchamberEvents((event) => {
    if (runtimeKey !== getRuntimeKey()) return;
    if (event.type === 'event-stream-ready') void hydrateAutoReviews();
    else if (event.type === 'openchamber:auto-review.updated') applyAutoReviewUpdatedEvent(event, runtimeKey);
  });
};
