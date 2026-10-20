import { expect, test } from 'bun:test';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { z } from 'zod';
import type { WebSearchConfigState } from '@openchamber/agent-contract';
import type { WorkerBootstrap, WorkerInfo, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import { WorkerRegistry, WorkerOperationError, type RegisteredWorkerInfo, type StatelessWorkerInput } from './workers.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { CatalogCoordinator } from './catalog.ts';
import { WorkspaceRoutes } from './workspace-routes.ts';
import { WebSearchCoordinator } from './websearch.ts';
import { SessionRegistry } from '../sessions/registry.ts';

// Stateful transport double: durable CAS and each live worker's applied revision are
// independent, so assertions observe publication rather than forwarded payloads.
class SearchWorkers extends WorkerRegistry {
  readonly roots = new Map<string, WorkerBootstrap>();
  readonly statelessRoots = new Map<string, StatelessWorkerInput>();
  readonly durable = new Map<string, WebSearchConfigState>();
  readonly applied = new Map<string, string>();
  readonly failing = new Set<string>();
  persistenceFails = false;
  beforeCommit: (() => Promise<void>) | undefined;

  constructor() { super({ workerEntrypoint: '/unused-test-worker' }); }

  add(rootSessionId: string, workspaceId: string, agentDirectoryId = 'shared') {
    this.roots.set(rootSessionId, { rootSessionId, workspaceId, projectId: 'project', cwd: `/${workspaceId}`, agentDirectory: `/${agentDirectoryId}`, agentDirectoryId });
    this.applied.set(rootSessionId, this.state(workspaceId, agentDirectoryId).revision);
  }

  override list(): RegisteredWorkerInfo[] {
    return [...this.roots.values()].map(root => ({ rootSessionId: root.rootSessionId, workspaceId: root.workspaceId, projectId: root.projectId, workerGeneration: `generation-${root.rootSessionId}`, state: 'ready', kind: 'session' }));
  }

  override bootstrap(rootSessionId: string): WorkerBootstrap | undefined {
    return this.roots.get(rootSessionId);
  }

  override async startStateless(input: StatelessWorkerInput): Promise<WorkerInfo> {
    this.statelessRoots.set(input.rootSessionId, input);
    return { rootSessionId: input.rootSessionId, workspaceId: input.workspaceId, projectId: input.projectId, workerGeneration: 'stateless-generation', state: 'ready' };
  }

  state(workspaceId: string, owner = 'shared'): WebSearchConfigState {
    return { ...(this.durable.get(owner) ?? { revision: '0', enabled: false, selectedProviderId: null, fallbackProviderIds: [], timeoutSeconds: 30,
      providers: [{ providerId: 'native-provider', name: 'Native Provider', configured: false, requiresCredential: true, isSelfHosted: false, credentialWritable: true, credentialConfigured: false }] }), workspaceId };
  }

  override async request(rootSessionId: string, operation: WorkerOperation, generation?: string): Promise<WorkerOperationResult> {
    if (operation.type !== 'web-search') throw new Error('Unrelated operation');
    const input = this.roots.get(rootSessionId) ?? this.statelessRoots.get(rootSessionId);
    if (!input) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    const owner = input.agentDirectoryId ?? 'shared';
    const state = this.state(input.workspaceId, owner);
    if (operation.operation.type === 'apply') {
      if (generation !== `generation-${rootSessionId}` || this.failing.has(rootSessionId)) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      this.applied.set(rootSessionId, state.revision);
      return { type: 'web-search', result: { type: 'applied' } };
    }
    if (operation.operation.type === 'read') return { type: 'web-search', result: { type: 'state', state } };
    if (operation.operation.request.expectedRevision !== state.revision) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
    await this.beforeCommit?.();
    if (this.persistenceFails) return { type: 'web-search', result: { type: 'mutated', result: { state, status: 'failed', persistence: 'failed', workers: [] } } };
    const next = { ...state, revision: (BigInt(state.revision) + 1n).toString() };
    if (operation.operation.type === 'update') {
      const { expectedRevision: _expectedRevision, ...configuration } = operation.operation.request;
      Object.assign(next, configuration);
    } else {
      next.providers = state.providers.map(provider => ({ ...provider, configured: operation.operation.type === 'credential.write', credentialConfigured: operation.operation.type === 'credential.write' }));
    }
    this.durable.set(owner, next);
    return { type: 'web-search', result: { type: 'mutated', result: { state: next, status: 'applied', persistence: 'persisted', workers: [] } } };
  }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'search-supervisor-'));
  const workers = new SearchWorkers();
  const workspaces = new WorkspaceCatalogs(directory, workers);
  await workspaces.initialize();
  for (const [workspaceId, agentDirectoryId] of [['first', 'shared'], ['second', 'shared'], ['other', 'independent']]) {
    await workspaces.register(workspaceId, { projectId: 'project', cwd: `/${workspaceId}`, agentDirectory: `/${agentDirectoryId}`, agentDirectoryId });
  }
  const search = new WebSearchCoordinator(workspaces, workers);
  const catalog = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null, commitMcp: async () => { throw new Error('Unrelated MCP mutation'); } });
  const routes = new WorkspaceRoutes(workspaces, workers, catalog, new SessionRegistry(directory, workers), directory, search);
  const request = async (method: string, path: string, body?: object) => {
    const message = new IncomingMessage(new Socket());
    message.method = method;
    return routes.handle(message, new URL(`http://service${path}`), async <T>(_request: IncomingMessage, schema: z.ZodType<T>): Promise<T> => schema.parse(body));
  };
  return { workers, search, request, close: () => rm(directory, { recursive: true, force: true }) };
}

test('workspace routes persist and apply to every matching root across workspaces, but not other owners', async () => {
  const f = await fixture();
  try {
    f.workers.add('root-first', 'first');
    f.workers.add('root-second', 'second');
    f.workers.add('root-independent', 'other', 'independent');
    const result = await f.request('PUT', '/api/agent/v1/workspaces/first/web-search', { expectedRevision: '0', enabled: true });
    expect(result).toMatchObject({ status: 200, body: { status: 'applied', persistence: 'persisted', state: { revision: '1', enabled: true }, workers: [
      { sessionId: 'root-first', workerGeneration: 'generation-root-first', status: 'applied', code: null },
      { sessionId: 'root-second', workerGeneration: 'generation-root-second', status: 'applied', code: null },
    ] } });
    expect(f.workers.applied.get('root-first')).toBe('1');
    expect(f.workers.applied.get('root-second')).toBe('1');
    expect(f.workers.applied.get('root-independent')).toBe('0');
    expect(await f.request('GET', '/api/agent/v1/workspaces/second/web-search')).toMatchObject({ body: { workspaceId: 'second', revision: '1', enabled: true } });
    expect(await f.request('GET', '/api/agent/v1/workspaces/other/web-search')).toMatchObject({ body: { revision: '0', enabled: false } });
  } finally { await f.close(); }
});

for (const failures of [1, 2]) {
  test(`durable mutation with ${failures} failed root applications is partial, not persistence failure`, async () => {
    const f = await fixture();
    try {
      f.workers.add('one', 'first');
      f.workers.add('two', 'second');
      f.workers.failing.add('one');
      if (failures === 2) f.workers.failing.add('two');
      const result = await f.search.mutate('first', { type: 'update', request: { expectedRevision: '0', enabled: true } });
      expect(result.status).toBe('partial');
      expect(result.persistence).toBe('persisted');
      expect(result.workers.filter(worker => worker.status === 'failed')).toHaveLength(failures);
      expect((await f.search.read('second')).enabled).toBe(true);
    } finally { await f.close(); }
  });
}

test('failed persistence never applies uncommitted settings and zero-root mutation succeeds', async () => {
  const f = await fixture();
  try {
    f.workers.add('one', 'first');
    f.workers.persistenceFails = true;
    expect(await f.search.mutate('first', { type: 'update', request: { expectedRevision: '0', enabled: true } })).toMatchObject({ status: 'failed', persistence: 'failed', workers: [], state: { revision: '0', enabled: false } });
    expect(f.workers.applied.get('one')).toBe('0');
    f.workers.persistenceFails = false;
    f.workers.roots.clear();
    expect(await f.search.mutate('first', { type: 'update', request: { expectedRevision: '0', enabled: true } })).toMatchObject({ status: 'applied', persistence: 'persisted', workers: [] });
  } finally { await f.close(); }
});

test('concurrent sibling CAS mutations serialize and stale caller receives current authorized state', async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    f.workers.beforeCommit = async () => { entered.resolve(); await release.promise; };
    const first = f.search.mutate('first', { type: 'update', request: { expectedRevision: '0', enabled: true } });
    await entered.promise;
    const second = f.search.mutate('second', { type: 'update', request: { expectedRevision: '0', enabled: false } }).catch(error => error);
    release.resolve();
    expect((await first).state.revision).toBe('1');
    const conflict = await second;
    expect(conflict).toBeInstanceOf(WorkerOperationError);
    expect(conflict).toMatchObject({ status: 409, code: 'CATALOG_CONFLICT', details: { currentRevision: '1', state: { workspaceId: 'second', enabled: true, revision: '1' } } });
    expect((await f.search.read('first')).enabled).toBe(true);
  } finally { release.resolve(); await f.close(); }
});

test('admission and mutations share the native owner barrier in both directions', async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    const opening = f.search.admit('shared', async () => {
      entered.resolve();
      await release.promise;
      f.workers.add('admitted-before', 'second');
    });
    await entered.promise;
    const mutation = f.search.mutate('first', { type: 'update', request: { expectedRevision: '0', enabled: true } });
    release.resolve();
    await opening;
    expect((await mutation).workers.map(worker => worker.sessionId)).toEqual(['admitted-before']);
    expect(f.workers.applied.get('admitted-before')).toBe('1');
    const committing = Promise.withResolvers<void>();
    const allowCommit = Promise.withResolvers<void>();
    f.workers.beforeCommit = async () => { committing.resolve(); await allowCommit.promise; };
    const nextMutation = f.search.mutate('second', { type: 'update', request: { expectedRevision: '1', enabled: false } });
    await committing.promise;
    let admitted = false;
    const laterOpening = f.search.admit('shared', async () => { f.workers.add('admitted-after', 'first'); admitted = true; });
    await f.search.admit('independent', async () => { f.workers.add('other-root', 'other', 'independent'); });
    expect(admitted).toBe(false);
    allowCommit.resolve();
    await nextMutation;
    await laterOpening;
    expect(f.workers.applied.get('admitted-after')).toBe('2');
  } finally { release.resolve(); await f.close(); }
});

test('credential routes enforce strict bodies, exact identity, authorization, and public secret redaction', async () => {
  const f = await fixture();
  try {
    const path = '/api/agent/v1/workspaces/first/web-search/credentials/native-provider';
    await expect(f.request('PUT', path, { expectedRevision: '0', providerId: 'different', apiKey: 'secret' })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(f.request('DELETE', path, { expectedRevision: '0', providerId: 'different' })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(f.request('PUT', path, { expectedRevision: '0', providerId: 'native-provider', apiKey: 'secret', extra: true })).rejects.toThrow();
    await expect(f.request('GET', '/api/agent/v1/workspaces/unauthorized/web-search')).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    const write = await f.request('PUT', path, { expectedRevision: '0', providerId: 'native-provider', apiKey: 'private-credential-value' });
    expect(write).toMatchObject({ body: { state: { revision: '1', providers: [{ configured: true }] } } });
    expect(JSON.stringify(write)).not.toContain('private-credential-value');
    expect(await f.request('DELETE', path, { expectedRevision: '1', providerId: 'native-provider' })).toMatchObject({ body: { state: { revision: '2', providers: [{ configured: false }] } } });
    expect(await f.request('POST', path, {})).toBeNull();
    expect(await f.request('GET', '/api/agent/v1/workspaces/first/web-search/unrecognized')).toBeNull();
  } finally { await f.close(); }
});
