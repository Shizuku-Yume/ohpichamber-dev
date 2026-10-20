import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheWarmingPartialWriteDetailsSchema, CacheWarmingStateSchema, type CacheWarmingState } from '@openchamber/agent-contract';
import type { WorkerInfo, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import { NativeCacheWarming } from '../worker/catalog-warming.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { WorkerOperationError, WorkerRegistry, type RegisteredWorkerInfo, type StatelessWorkerInput } from './workers.ts';

class WarmingWorkers extends WorkerRegistry {
  readonly entries = new Map<string, RegisteredWorkerInfo>();
  readonly requests: { rootSessionId: string; operation: WorkerOperation; expectedGeneration?: string }[] = [];
  readonly starts: StatelessWorkerInput[] = [];
  readonly failing = new Set<string>();
  readonly beforeApply = new Map<string, () => void>();
  failFlush = false;
  nativeWarming?: NativeCacheWarming;
  constructor(private readonly directory: string) { super({ workerEntrypoint: 'unused-test-worker' }); }
  override list(): RegisteredWorkerInfo[] { return [...this.entries.values()].map(worker => ({ ...worker })); }
  override info(rootSessionId: string): WorkerInfo | undefined {
    const worker = this.entries.get(rootSessionId);
    return worker && { ...worker };
  }
  add(rootSessionId: string, workspaceId = 'workspace', state: WorkerInfo['state'] = 'ready', kind: RegisteredWorkerInfo['kind'] = 'session') {
    const worker: RegisteredWorkerInfo = { rootSessionId, workspaceId, projectId: 'project', workerGeneration: `generation-${rootSessionId}`, state, kind };
    this.entries.set(rootSessionId, worker);
    return worker;
  }
  override async startStateless(input: StatelessWorkerInput): Promise<WorkerInfo> {
    this.starts.push(input);
    return this.entries.get(input.rootSessionId) ?? this.add(input.rootSessionId, input.workspaceId, 'ready', 'stateless');
  }
  override async request(rootSessionId: string, operation: WorkerOperation, expectedGeneration?: string): Promise<WorkerOperationResult> {
    this.requests.push({ rootSessionId, operation, expectedGeneration });
    if (operation.type !== 'catalog') throw new Error('Unexpected non-catalog operation');
    const worker = this.entries.get(rootSessionId);
    if (!worker) throw new Error('Unknown worker');
    const catalog = operation.operation;
    if (catalog.type === 'catalog.warming.apply') {
      this.beforeApply.get(rootSessionId)?.();
      if (this.failing.has(rootSessionId) || worker.workerGeneration !== expectedGeneration || worker.state !== 'ready') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return { type: 'catalog', result: { type: 'catalog.warming.applied', mode: catalog.mode } };
    }
    if (this.nativeWarming && catalog.type === 'catalog.warming.persist') {
      const state = await this.nativeWarming.persist(worker.workspaceId, catalog.request.mode, operation.revision);
      return { type: 'catalog', result: { type: 'catalog.warming', state } };
    }
    if (this.nativeWarming && catalog.type === 'catalog.warming.read') {
      const state = await this.nativeWarming.read(worker.workspaceId, operation.revision);
      return { type: 'catalog', result: { type: 'catalog.warming', state } };
    }
    const file = join(this.directory, `${worker.workspaceId}.json`);
    if (catalog.type === 'catalog.warming.persist') {
      if (this.failFlush) throw new Error('Native settings flush failed');
      const state: CacheWarmingState = { workspaceId: worker.workspaceId, revision: operation.revision, mode: catalog.request.mode };
      await writeFile(file, JSON.stringify(state));
      return { type: 'catalog', result: { type: 'catalog.warming', state } };
    }
    if (catalog.type !== 'catalog.warming.read') throw new Error('Unexpected catalog operation');
    let mode: CacheWarmingState['mode'] = 'off';
    try { mode = CacheWarmingStateSchema.parse(JSON.parse(await readFile(file, 'utf8'))).mode; }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    return { type: 'catalog', result: { type: 'catalog.warming', state: { workspaceId: worker.workspaceId, revision: operation.revision, mode } } };
  }
  applications() { return this.requests.filter(request => request.operation.type === 'catalog' && request.operation.operation.type === 'catalog.warming.apply'); }
  writes() { return this.requests.filter(request => request.operation.type === 'catalog' && request.operation.operation.type === 'catalog.warming.persist'); }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-warming-'));
  const workers = new WarmingWorkers(directory);
  const stateDirectory = join(directory, 'supervisor');
  const catalogs = new WorkspaceCatalogs(stateDirectory, workers);
  await catalogs.initialize();
  const register = (workspaceId = 'workspace') => catalogs.register(workspaceId, {
    projectId: 'project', cwd: join(directory, workspaceId), agentDirectory: join(directory, workspaceId, 'agent'), agentDirectoryId: `agent-${workspaceId}`, env: {},
  });
  await register();
  return { directory, stateDirectory, workers, catalogs, register, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('warming CAS serializes concurrent stale requests and durably advances the owner revision', async () => {
  const f = await fixture();
  try {
    expect(await f.catalogs.readCacheWarming('workspace')).toEqual({ workspaceId: 'workspace', revision: '0', mode: 'off' });
    const results = await Promise.allSettled((['idle', 'streaming'] as const).map(mode => f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'CATALOG_CONFLICT', details: { currentRevision: '1' } } });
    expect(f.workers.writes()).toHaveLength(1);
    const reopened = new WorkspaceCatalogs(f.stateDirectory, f.workers);
    await reopened.initialize();
    await reopened.register('workspace', { projectId: 'project', cwd: join(f.directory, 'workspace'), agentDirectory: join(f.directory, 'workspace', 'agent'), agentDirectoryId: 'agent-workspace', env: {} });
    expect(await reopened.readCacheWarming('workspace')).toEqual({ workspaceId: 'workspace', revision: '1', mode: 'idle' });
    expect(await reopened.updateCacheWarming('workspace', { expectedRevision: '1', mode: 'streaming' })).toMatchObject({ persisted: { revision: '2', mode: 'streaming' }, status: 'no-active-workers', workers: [] });
  } finally { await f.cleanup(); }
});

test('warming without live sessions persists without counting or applying to the stateless writer', async () => {
  const f = await fixture();
  try {
    const result = await f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode: 'idle' });
    expect(result).toEqual({ persisted: { workspaceId: 'workspace', revision: '1', mode: 'idle' }, status: 'no-active-workers', workers: [] });
    expect(f.workers.list().map(worker => worker.kind)).toEqual(['stateless']);
    expect(f.workers.applications()).toEqual([]);
  } finally { await f.cleanup(); }
});

test('warming fanout preserves partial failures, exact generations and committed settings', async () => {
  const f = await fixture();
  try {
    f.workers.add('healthy');
    f.workers.add('broken');
    f.workers.failing.add('broken');
    const result = await f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode: 'streaming' });
    expect(result).toMatchObject({ status: 'partial', persisted: { revision: '1', mode: 'streaming' }, workers: [
      { worker: { workspaceId: 'workspace', rootSessionId: 'healthy', workerGeneration: 'generation-healthy' }, outcome: 'applied', mode: 'streaming' },
      { worker: { rootSessionId: 'broken', workerGeneration: 'generation-broken' }, outcome: 'failed', error: { code: 'SERVICE_UNAVAILABLE', retryable: true } },
    ] });
    expect(f.workers.applications().map(request => request.expectedGeneration)).toEqual(['generation-healthy', 'generation-broken']);
    expect(await f.catalogs.readCacheWarming('workspace')).toEqual(result.persisted);
  } finally { await f.cleanup(); }
});

test('a replaced worker generation cannot acknowledge application for the retired generation', async () => {
  const f = await fixture();
  try {
    f.workers.add('replaced');
    f.workers.beforeApply.set('replaced', () => { f.workers.entries.set('replaced', { ...f.workers.entries.get('replaced')!, workerGeneration: 'replacement-generation' }); });
    const result = await f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode: 'idle' });
    expect(result).toMatchObject({ status: 'failed', persisted: { revision: '1' }, workers: [{ worker: { workerGeneration: 'generation-replaced' }, outcome: 'failed' }] });
    expect(f.workers.applications()).toHaveLength(1);
  } finally { await f.cleanup(); }
});

test('warming targets only this workspace ready or starting sessions, never cold or stateless workers', async () => {
  const f = await fixture();
  try {
    await f.register('other');
    f.workers.add('ready');
    f.workers.add('starting', 'workspace', 'starting');
    for (const state of ['stopping', 'stopped', 'crashed'] as const) f.workers.add(state, 'workspace', state);
    f.workers.add('foreign', 'other');
    f.workers.add('completion', 'workspace', 'ready', 'stateless');
    const result = await f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode: 'idle' });
    expect(f.workers.applications().map(request => request.rootSessionId)).toEqual(['ready', 'starting']);
    expect(result).toMatchObject({ status: 'partial', workers: [{ outcome: 'applied' }, { outcome: 'failed' }] });
    expect(await f.catalogs.readCacheWarming('other')).toEqual({ workspaceId: 'other', revision: '0', mode: 'off' });
    expect(f.catalogs.revision('other')).toBe('0');
    await expect(f.catalogs.updateCacheWarming('unknown', { expectedRevision: '0', mode: 'off' })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
  } finally { await f.cleanup(); }
});

test('a native settings flush failure leaves the revision unchanged and never fans out', async () => {
  const f = await fixture();
  try {
    f.workers.add('live');
    f.workers.failFlush = true;
    await expect(f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode: 'idle' })).rejects.toThrow('Native settings flush failed');
    expect(f.catalogs.revision('workspace')).toBe('0');
    expect(f.workers.applications()).toEqual([]);
    expect(await f.catalogs.readCacheWarming('workspace')).toEqual({ workspaceId: 'workspace', revision: '0', mode: 'off' });
  } finally { await f.cleanup(); }
});

test('a supervisor revision flush failure reports committed native configuration without live application', async () => {
  const f = await fixture();
  try {
    const cwd = join(f.directory, 'workspace');
    const agentDirectory = join(cwd, 'agent');
    await mkdir(agentDirectory, { recursive: true });
    await mkdir(join(cwd, '.omp'));
    await writeFile(join(cwd, '.omp', 'config.yml'), 'providers:\n  cacheWarming: "off"\n');
    f.workers.nativeWarming = new NativeCacheWarming({ cwd, agentDirectory });
    expect(await f.catalogs.readCacheWarming('workspace')).toEqual({ workspaceId: 'workspace', revision: '0', mode: 'off' });
    f.workers.add('live');
    const ownerFile = join(f.stateDirectory, 'workspace-catalog-owners.json');
    await rm(ownerFile);
    await mkdir(ownerFile);
    let failure: unknown;
    try { await f.catalogs.updateCacheWarming('workspace', { expectedRevision: '0', mode: 'idle' }); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(WorkerOperationError);
    if (!(failure instanceof WorkerOperationError)) throw new Error('Expected a typed partial-write failure');
    expect(failure).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(CacheWarmingPartialWriteDetailsSchema.parse(failure.details)).toEqual({
      workspaceId: 'workspace', configuredMode: 'idle', currentRevision: '0',
      nativeConfigurationCommitted: true, liveApplication: 'not-started',
    });
    expect(await new NativeCacheWarming({ cwd, agentDirectory }).read('workspace', '0')).toEqual({ workspaceId: 'workspace', revision: '0', mode: 'idle' });
    expect(f.catalogs.revision('workspace')).toBe('0');
    expect(f.workers.applications()).toEqual([]);
    expect(f.workers.writes()).toHaveLength(1);
    expect(await f.catalogs.readCacheWarming('workspace')).toEqual({ workspaceId: 'workspace', revision: '0', mode: 'idle' });
  } finally { await f.cleanup(); }
});
