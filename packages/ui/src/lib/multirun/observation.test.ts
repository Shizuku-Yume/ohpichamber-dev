import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as loaders from '@/sync/session-message-loader';
import { ChildStoreManager } from '@/sync/child-store';
import { nativeClient, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { observeLaneSession } from './observation';

const spies: Array<{ mockRestore(): void }> = [];
const ownedLoaders: loaders.SessionMessageLoader[] = [];
afterEach(() => {
  for (const loader of ownedLoaders.splice(0)) loader.dispose();
  for (const spy of spies.splice(0)) spy.mockRestore();
});

describe('canonical lane observation before dispatch', () => {
  test('materialization invokes the existing snapshot observation hook before returning', async () => {
    const observed: string[] = [];
    const client = nativeClient({ getSnapshot: async (sessionId) => nativeSnapshot(sessionId, []) });
    const loader = new loaders.SessionMessageLoader(new ChildStoreManager(), { client, runtimeKey: 'owner', onSnapshot: (target) => { observed.push(target.sessionId); } });
    ownedLoaders.push(loader);
    spies.push(spyOn(loaders, 'getImperativeSessionMessageLoader').mockReturnValue(loader));
    await observeLaneSession({ sessionId: 'lane', directory: '/repo' }, () => {});
    expect(observed).toEqual(['lane']);
    expect(loader.getSnapshot({ sessionId: 'lane', directory: '/repo' }).status).toBe('ready');
  });
  test('failed materialization prevents dispatch even when loader captures the rejection', async () => {
    const client = nativeClient({ getSnapshot: async () => { throw new Error('Snapshot failed'); } });
    const loader = new loaders.SessionMessageLoader(new ChildStoreManager(), { client, runtimeKey: 'owner' });
    ownedLoaders.push(loader);
    spies.push(spyOn(loaders, 'getImperativeSessionMessageLoader').mockReturnValue(loader));
    await expect(observeLaneSession({ sessionId: 'lane', directory: '/repo' }, () => {})).rejects.toThrow('Snapshot failed');
  });
  test('absence of the canonical loader is not a successful observation', async () => {
    spies.push(spyOn(loaders, 'getImperativeSessionMessageLoader').mockReturnValue(null));
    await expect(observeLaneSession({ sessionId: 'lane', directory: '/repo' }, () => {})).rejects.toThrow('Canonical session message loader is unavailable');
  });
});
