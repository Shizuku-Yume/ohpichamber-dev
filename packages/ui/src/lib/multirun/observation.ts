import { getImperativeSessionMessageLoader } from '@/sync/session-message-loader';

/** Materialization attaches replay-backed observation before any run can emit events. */
export async function observeLaneSession(target: { sessionId: string; directory: string }, assertCurrent: () => void): Promise<void> {
  assertCurrent();
  const loader = getImperativeSessionMessageLoader();
  if (!loader) throw new Error('Canonical session message loader is unavailable');
  await loader.ensure(target);
  assertCurrent();
  const loaded = loader.getSnapshot(target);
  if (loaded.status !== 'ready') throw loaded.error ?? new Error('Canonical lane observation could not be established');
}
