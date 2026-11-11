import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useWorkflowRunsStore } from '@/lib/workflows/store';
import { seedGlobalSessionStatusFromHost } from './host-session-status-seed';

/**
 * OpenChamber's own announcements, from the control stream: the main event
 * stream carries the same ones over the WebSocket, and SSE clients hear them
 * here. A gap is not replayed, so each connection reads the shown workflow
 * runs again and the host's snapshot, which settles a page whose end was
 * missed.
 *
 * A workflow run is applied from its announcement instead of being re-read:
 * the payload is the run the server wrote, and the store's own event ordering
 * keeps a read that started earlier from overwriting it.
 */
export const subscribeControlStreamSync = (
  runtimeKey: string,
): (() => void) => subscribeOpenchamberEvents((event) => {
  if (runtimeKey !== getRuntimeKey()) return;
  if (event.type === 'event-stream-ready') {
    useWorkflowRunsStore.getState().reloadLoaded();
    void seedGlobalSessionStatusFromHost().catch(() => undefined);
  } else if (event.type === 'workflow-run') {
    useWorkflowRunsStore.getState().apply(event.run);
  } else if (event.type === 'workflow-run-removed') {
    useWorkflowRunsStore.getState().remove(event.parentSessionId, event.runId);
  }
});
