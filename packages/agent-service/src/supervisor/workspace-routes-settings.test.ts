import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { z } from 'zod';
import { OmpSettingsStateSchema, type JsonValue } from '@openchamber/agent-contract';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { WorkerOperationResult } from '../protocol.ts';
import { NativeSettings } from '../worker/catalog-settings.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { WorkerRegistry, WorkerOperationError } from './workers.ts';
import { CatalogCoordinator } from './catalog.ts';
import { WorkspaceRoutes } from './workspace-routes.ts';
import { WebSearchCoordinator } from './websearch.ts';
import { SessionRegistry } from '../sessions/registry.ts';

const ROLES = ['default', 'smol', 'slow', 'vision', 'plan', 'commit', 'tiny', 'memory',
  'task', 'advisor', 'widget', 'image', 'web', 'speech', 'dictation', 'judge'] as const;
const MODELS = ROLES.map((_role, index) => `provider/model-${index}`);

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-settings-routes-'));
  const cwd = join(directory, 'workspace');
  const agentDirectory = join(directory, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const native = new NativeSettings(settings);
  const workers = new WorkerRegistry({ workerEntrypoint: 'unused-test-entrypoint' });
  const catalogs = new WorkspaceCatalogs(directory, workers);
  await catalogs.initialize();
  await catalogs.register('workspace', { projectId: 'project', agentDirectoryId: 'agent', cwd, agentDirectory, env: {} });
  const owner = spyOn(catalogs, 'stateless').mockResolvedValue('owner');
  let requests = 0;
  let unavailable = false;
  const request = spyOn(workers, 'request').mockImplementation(async (_root, operation): Promise<WorkerOperationResult> => {
    if (operation.type !== 'catalog') throw new Error('Unexpected operation');
    requests += 1;
    if (unavailable) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    if (operation.operation.type === 'catalog.settings.read') {
      return { type: 'catalog', result: { type: 'catalog.settings', state: await native.read('workspace', operation.revision) } };
    }
    if (operation.operation.type === 'catalog.provider.account-selection.read') {
      return { type: 'catalog', result: { type: 'catalog.provider.account-selection', result: {
        revision: operation.revision, providerId: operation.operation.providerId,
        selectionMode: 'automatic', pinnedCredentialRef: null, selectionOverriddenBy: null,
      } } };
    }
    if (operation.operation.type === 'catalog.settings.write') {
      return { type: 'catalog', result: { type: 'catalog.settings.mutated', state: await native.write('workspace', operation.revision, operation.operation.request) } };
    }
    if (operation.operation.type === 'catalog.provider.models.enrich') {
      return { type: 'catalog', result: { type: 'catalog.provider.models.enriched', result: { models: [{ modelId: 'catalogued-model', catalog: {
        source: 'omp-catalog', input: ['text'], contextWindow: 8192, maxTokens: 1024,
        cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, reasoning: false,
      } }, { modelId: 'unknown-model' }] } } };
    }
    throw new Error('Unexpected catalog operation');
  });
  const search = new WebSearchCoordinator(catalogs, workers);
  const coordinator = new CatalogCoordinator(directory, {
    readMcpConfiguration: async () => null,
    commitMcp: async () => { throw new Error('Unrelated MCP mutation'); },
  });
  const routes = new WorkspaceRoutes(catalogs, workers, coordinator, new SessionRegistry(directory, workers), directory, search);
  const call = async (method: string, path: string, body?: JsonValue) => {
    const message = new IncomingMessage(new Socket());
    message.method = method;
    return routes.handle(message, new URL(`http://service${path}`), async <T>(_request: IncomingMessage, schema: z.ZodType<T>): Promise<T> => schema.parse(body));
  };
  return {
    catalogs, call, requests: () => requests,
    unavailable(value: boolean) { unavailable = value; },
    async close() {
      request.mockRestore();
      owner.mockRestore();
      settings.cancelPendingSaves();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('provider account selection GET dispatches the read without advancing catalog revision', async () => {
  const f = await fixture();
  try {
    const result = await f.call('GET', '/api/agent/v1/workspaces/workspace/providers/native/account-selection');
    expect(result).toEqual({ status: 200, body: {
      revision: '0', providerId: 'native', selectionMode: 'automatic', pinnedCredentialRef: null, selectionOverriddenBy: null,
    } });
    expect(f.catalogs.revision('workspace')).toBe('0');
  } finally { await f.close(); }
});

test('GET and PATCH /workspaces/:id/omp/settings round-trip all sixteen OMP model roles', async () => {
  const f = await fixture();
  try {
    const read = OmpSettingsStateSchema.parse((await f.call('GET', '/api/agent/v1/workspaces/workspace/omp/settings'))?.body);
    expect(read).toMatchObject({ workspaceId: 'workspace', revision: '0' });
    const ids = read.settings.map((setting) => setting.id);
    expect(ids).toContain('modelRoles');
    expect(ids).toContain('defaultThinkingLevel');
    expect(ids).toContain('retry.modelFallback');
    expect(ids).toContain('retry.fallbackOn');

    const roles = Object.fromEntries(ROLES.map((role, index) => [role, MODELS[index]]));
    const write = OmpSettingsStateSchema.parse((await f.call('PATCH', '/api/agent/v1/workspaces/workspace/omp/settings', {
      expectedRevision: '0', changes: [{ id: 'modelRoles', value: roles }],
    }))?.body);
    expect(write).toMatchObject({ workspaceId: 'workspace', revision: '1' });
    const written = write.settings.find((setting) => setting.id === 'modelRoles');
    expect(written).toMatchObject({ type: 'record', configured: true, value: roles });
    expect(Object.keys(written?.value ?? {})).toEqual([...ROLES]);

    // The short canonical form keeps addressing the same workspace revision.
    const again = OmpSettingsStateSchema.parse((await f.call('GET', '/api/agent/v1/workspaces/workspace/settings'))?.body);
    expect(again).toMatchObject({ revision: '1' });
    expect(again.settings.find((setting) => setting.id === 'modelRoles')).toMatchObject({ value: roles });
  } finally { await f.close(); }
});

test('a stale revision is refused with the current revision and no write reaches the worker', async () => {
  const f = await fixture();
  try {
    expect(await f.call('PUT', '/api/agent/v1/workspaces/workspace/omp/settings', {
      expectedRevision: '0', changes: [{ id: 'compaction.thresholdPercent', value: 55 }],
    })).toMatchObject({ status: 200, body: { revision: '1' } });
    const before = f.requests();
    await expect(f.call('PATCH', '/api/agent/v1/workspaces/workspace/omp/settings', {
      expectedRevision: '0', changes: [{ id: 'compaction.thresholdPercent', value: 60 }],
    })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT', details: { currentRevision: '1' } });
    expect(f.requests()).toBe(before);
  } finally { await f.close(); }
});

test('an unregistered workspace is unauthorized while a ready workspace with no worker is unavailable', async () => {
  const f = await fixture();
  try {
    await expect(f.call('GET', '/api/agent/v1/workspaces/foreign/omp/settings'))
      .rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    f.unavailable(true);
    await expect(f.call('GET', '/api/agent/v1/workspaces/workspace/omp/settings'))
      .rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  } finally { await f.close(); }
});

test('POST /workspaces/:id/providers/enrich reaches the catalog worker and returns unknown ids bare', async () => {
  const f = await fixture();
  try {
    const response = await f.call('POST', '/api/agent/v1/workspaces/workspace/providers/enrich', {
      models: [{ modelId: 'catalogued-model' }, { modelId: 'unknown-model' }],
    });
    expect(response?.status).toBe(200);
    expect(response?.body).toMatchObject({ models: [
      { modelId: 'catalogued-model', catalog: { source: 'omp-catalog', input: ['text'], contextWindow: 8192, maxTokens: 1024 } },
      { modelId: 'unknown-model' },
    ] });
    expect(f.requests()).toBe(1);
  } finally { await f.close(); }
});
