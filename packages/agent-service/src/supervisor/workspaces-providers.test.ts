import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerOperationResult } from '../protocol.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { WorkerRegistry } from './workers.ts';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'provider-coordinator-'));
  const workers = new WorkerRegistry({ workerEntrypoint: 'unused-test-entrypoint' });
  const catalogs = new WorkspaceCatalogs(directory, workers);
  await catalogs.initialize();
  await catalogs.register('workspace', { projectId: 'project', agentDirectoryId: 'agent', cwd: directory, agentDirectory: join(directory, 'agent'), env: {} });
  const owner = spyOn(catalogs, 'stateless').mockResolvedValue('persistent-owner');
  const revisions: string[] = [];
  const requests = spyOn(workers, 'request').mockImplementation(async (_root, operation): Promise<WorkerOperationResult> => {
    if (operation.type !== 'catalog' || operation.operation.type !== 'catalog.provider.oauth') throw new Error('Unexpected operation');
    revisions.push(operation.revision);
    const request = operation.operation.request;
    return { type: 'catalog', result: { type: 'catalog.provider.oauth', result: {
      flowId: 'flow', generation: 'generation', providerId: 'stored-provider', revision: operation.revision,
      status: request.action === 'commit' ? 'authenticated' : request.action === 'cancel' ? 'cancelled' : 'ready', manualInput: false,
    } } };
  });
  return { catalogs, revisions, requests, close: async () => { requests.mockRestore(); owner.mockRestore(); await rm(directory, { recursive: true, force: true }); } };
}
const identity = { flowId: 'flow', generation: 'generation' };

test('OAuth start, status, input and cancellation do not consume a catalog revision; explicit commit does', async () => {
  const { catalogs, revisions, close } = await fixture();
  try {
    await catalogs.operation('workspace', { type: 'catalog.provider.oauth', providerId: 'login-method', request: { action: 'start', expectedRevision: '0' } });
    for (const request of [{ action: 'status', ...identity }, { action: 'input', ...identity, input: 'authorization-code' }, { action: 'cancel', ...identity }] as const) {
      await catalogs.operation('workspace', { type: 'catalog.provider.oauth', providerId: 'login-method', request });
    }
    expect(catalogs.revision('workspace')).toBe('0');
    expect(revisions).toEqual(['0', '0', '0', '0']);
    await catalogs.operation('workspace', { type: 'catalog.provider.oauth', providerId: 'login-method', request: { action: 'commit', ...identity, expectedRevision: '0' } });
    expect(catalogs.revision('workspace')).toBe('1');
    expect(revisions).toEqual(['0', '0', '0', '0', '1']);
  } finally { await close(); }
});

test('OAuth start checks CAS without advancing and concurrent commits serialize one winner', async () => {
  const { catalogs, revisions, close } = await fixture();
  try {
    await expect(catalogs.operation('workspace', { type: 'catalog.provider.oauth', providerId: 'login-method', request: { action: 'start', expectedRevision: '1' } })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
    expect(revisions).toEqual([]);
    const commit = () => catalogs.operation('workspace', { type: 'catalog.provider.oauth', providerId: 'login-method', request: { action: 'commit', ...identity, expectedRevision: '0' } });
    const results = await Promise.allSettled([commit(), commit()]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(revisions).toEqual(['1']);
    expect(catalogs.revision('workspace')).toBe('1');
  } finally { await close(); }
});
