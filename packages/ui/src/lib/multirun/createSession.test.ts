import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { CapturedSendOptions, Session, SessionMetadata } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { createMultiRunSession } from './createSession';
import { getMultiRunIdentity, type MultiRunIdentity } from './identity';

const identity: Omit<MultiRunIdentity, 'key'> = {
  group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' },
  groupSlug: 'bench', providerID: 'provider', modelID: 'vendor/model', role: 'run',
};
const selection: CapturedSendOptions = { providerId: 'provider', modelId: 'vendor/model', agentId: 'agent', variant: 'high', reasoningEffort: 'high' };
const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });

function fixture(options: { fail?: boolean; omitMarker?: boolean; switchAfterCreate?: boolean } = {}) {
  const calls: string[] = [];
  let current = true;
  let metadata: SessionMetadata = {};
  const session: Session = {
    sessionId: 'new', projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: 'new',
    createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: {}, metadataRevision: '1', archiveRevision: '0',
  };
  spies.push(spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => {
    expect(directory).toBe('/repo'); calls.push('resolve');
    return { projectId: 'project', workspaceId: 'workspace', name: 'repo' };
  }));
  spies.push(spyOn(canonicalClient, 'createSession').mockImplementation(async (input) => {
    calls.push('create');
    expect(input.options).toEqual(selection);
    expect(input.workspaceId).toBe('workspace');
    metadata = { ...input.metadata, openchamber: { ...input.metadata?.openchamber, goal: { status: 'active' } } };
    const created = { ...session, metadata };
    expect(getMultiRunIdentity(created)).toBeNull();
    if (options.switchAfterCreate) current = false;
    return { session: created };
  }));
  spies.push(spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(async (id, patch) => {
    calls.push('metadata'); expect(id).toBe('new');
    if (options.fail) throw new Error('Write failed');
    metadata = options.omitMarker ? {} : {
      ...metadata, openchamber: { ...metadata.openchamber, multirun: patch.changes.openchamber?.multirun ?? undefined },
    };
    return { sessionId: id, metadata, revision: '2' };
  }));
  spies.push(spyOn(canonicalClient, 'deleteSession').mockImplementation(async (id) => {
    calls.push('delete'); return { sessionId: id, deletedSessionIds: [id] };
  }));
  return { calls, assertCurrent: () => { if (!current) throw new Error('Runtime changed'); } };
}

describe('canonical multi-run creation', () => {
  for (const role of ['run', 'fusion'] as const) test(`binds ${role} while preserving Host metadata`, async () => {
    const api = fixture();
    const result = await createMultiRunSession({ title: 'title', directory: '/repo', identity: { ...identity, role }, selection }, api.assertCurrent);
    expect(getMultiRunIdentity(result)).toMatchObject({ role, modelID: 'vendor/model' });
    expect(result.metadata?.openchamber?.goal?.status).toBe('active');
    expect(result.metadataRevision).toBe('2');
    expect(getMultiRunIdentity({ ...result, sessionId: 'fork' })).toBeNull();
    expect(api.calls).toEqual(['resolve', 'create', 'metadata']);
  });
  for (const failure of [{ fail: true }, { omitMarker: true }]) test(`cleans only the unbound session: ${JSON.stringify(failure)}`, async () => {
    const api = fixture(failure);
    await expect(createMultiRunSession({ title: 'title', directory: '/repo', identity, selection }, api.assertCurrent)).rejects.toThrow();
    expect(api.calls).toEqual(['resolve', 'create', 'metadata', 'delete']);
  });
  test('runtime switch stops binding and cleanup', async () => {
    const api = fixture({ switchAfterCreate: true });
    await expect(createMultiRunSession({ title: 'title', directory: '/repo', identity, selection }, api.assertCurrent)).rejects.toThrow('Runtime changed');
    expect(api.calls).toEqual(['resolve', 'create']);
  });
});
