import { isVSCodeRuntime } from '@/lib/desktop';
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { captureRuntimeInstance, getRuntimeKey } from '@/lib/runtime-switch';
import { seedGlobalSessionStatusFromHost } from './host-session-status-seed';
import {
  applyExtensionWaits,
  applyExtensionWaitsSnapshot,
  extensionWaitsSnapshotSchema,
  restoreExtensionWaits,
  takeExtensionWaits,
} from './extension-waits';

const isExtensionWaitsAvailable = (): boolean => !isVSCodeRuntime();

const hydrateExtensionWaits = async (): Promise<void> => {
  if (!isExtensionWaitsAvailable()) return;
  const isCurrent = captureRuntimeInstance();
  const response = await runtimeFetch('/api/extension-waits', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Extension waits failed to load (${response.status})`);
  const parsed = extensionWaitsSnapshotSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Invalid extension waits response');
  if (!isCurrent()) return;
  applyExtensionWaitsSnapshot(parsed.data);
  if (parsed.data.waits.length > 0) void seedGlobalSessionStatusFromHost().catch(() => undefined);
};

export const subscribeExtensionWaitsSync = (runtimeKey: string): (() => void) => {
  if (!isExtensionWaitsAvailable()) return () => undefined;
  const isCurrent = captureRuntimeInstance();
  void hydrateExtensionWaits().catch(() => undefined);
  return subscribeOpenchamberEvents((event) => {
    if (runtimeKey !== getRuntimeKey() || !isCurrent()) return;
    if (event.type === 'event-stream-ready') void hydrateExtensionWaits().catch(() => undefined);
    else if (event.type === 'openchamber:extension-waits.updated') {
      const { revision, sessionID, waits } = event.properties;
      applyExtensionWaits(revision, sessionID, waits);
    }
  });
};

export const stopExtensionWaits = async (sessionID: string): Promise<void> => {
  const previous = takeExtensionWaits(sessionID);
  const response = await runtimeFetch(`/api/extension-waits/sessions/${encodeURIComponent(sessionID)}`, { method: 'DELETE' }).catch(() => null);
  if (response?.ok) return;
  if (previous) restoreExtensionWaits(previous);
  await hydrateExtensionWaits().catch(() => undefined);
  throw new Error(`Stopping the extension waits failed (${response?.status ?? 'network'})`);
};
