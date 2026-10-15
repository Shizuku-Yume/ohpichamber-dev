import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import * as loaders from '@/sync/session-message-loader';
import { ChildStoreManager } from '@/sync/child-store';
import { nativeClient, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { observeLaneSession } from './observation';

const ownedLoaders: loaders.SessionMessageLoader[] = [];
afterEach(() => {
  for (const loader of ownedLoaders.splice(0)) loader.dispose();
  mock.restore();
});

const lane = (sessionId: string): Session => ({
  sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId,
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: {}, metadataRevision: '1', archiveRevision: '0',
});
describe('canonical lane observation before dispatch', () => {
  test('materialization invokes the existing snapshot observation hook before returning', async () => {
    const observed: string[] = [];
    const client = nativeClient({ getSnapshot: async (sessionId) => nativeSnapshot(sessionId, []) });
    const loader = new loaders.SessionMessageLoader(new ChildStoreManager(), { client, runtimeKey: 'owner', onSnapshot: (target) => { observed.push(target.sessionId); } });
    ownedLoaders.push(loader);
    spyOn(loaders, 'getImperativeSessionMessageLoader').mockReturnValue(loader);
    await observeLaneSession({ ...lane('lane'), directory: '/repo' }, () => {});
    expect(observed).toEqual(['lane']);
    expect(loader.getSnapshot({ ...lane('lane'), directory: '/repo' }).status).toBe('ready');
  });
  test('failed materialization prevents dispatch even when loader captures the rejection', async () => {
    const client = nativeClient({ getSnapshot: async () => { throw new Error('Snapshot failed'); } });
    const loader = new loaders.SessionMessageLoader(new ChildStoreManager(), { client, runtimeKey: 'owner' });
    ownedLoaders.push(loader);
    spyOn(loaders, 'getImperativeSessionMessageLoader').mockReturnValue(loader);
    await expect(observeLaneSession({ ...lane('lane'), directory: '/repo' }, () => {})).rejects.toThrow('Snapshot failed');
  });
  test('absence of the canonical loader is not a successful observation', async () => {
    spyOn(loaders, 'getImperativeSessionMessageLoader').mockReturnValue(null);
    await expect(observeLaneSession({ ...lane('lane'), directory: '/repo' }, () => {})).rejects.toThrow('Canonical session message loader is unavailable');
  });
});
