import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { CompletionWorkerBootstrap } from '../protocol.ts';
import { StatelessWorker } from './stateless.ts';
import { openNativeRuntime } from './native-runtime.ts';
import { NativeMcpCredentials } from './mcp-credentials.ts';
import type { MCPServerConfig } from '@openchamber/agent-contract';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

function workspacePrefix(workspaceId: string): string {
  return `openchamber-mcp-${createHash('sha256').update(workspaceId).digest('hex')}-`;
}

async function fixture(workspaceId: string) {
  const root = await mkdtemp(join(tmpdir(), 'mcp-credentials-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const bootstrap: CompletionWorkerBootstrap = {
    type: 'completion.bootstrap', authorizationRootId: 'workspace-authorization-owner', workerGeneration: 'workspace-generation',
    projectId: 'project', workspaceId, cwd, agentDirectory, agentDirectoryId: 'agent', catalogRevision: '0',
    mcpConfigPath: join(cwd, '.omp', 'mcp.json'),
  };
  return { root, bootstrap };
}

async function openWorker(bootstrap: CompletionWorkerBootstrap): Promise<StatelessWorker> {
  return StatelessWorker.open(bootstrap, async () => { });
}

async function persist(worker: StatelessWorker, workspaceId: string, servers: MCPServerConfig[], previous: string) {
  const configuration = { workspaceId, persistedRevision: (BigInt(previous) + 1n).toString(), config: { servers } };
  const result = await worker.operation({ type: 'mcp', operation: { type: 'persist', request: { expectedPersistedRevision: previous, config: configuration.config }, configuration } });
  if (result.type !== 'mcp' || result.result.type !== 'persisted') throw new Error('Expected persisted result');
  return result.result.configuration;
}

async function writeSecret(worker: StatelessWorker, serverId: string, configuration: { persistedRevision: string; workspaceId: string; config: { servers: MCPServerConfig[] } }, value: string): Promise<string> {
  const written = await worker.operation({ type: 'mcp', operation: { type: 'secret.write', serverId, configuration, request: { persistedRevision: configuration.persistedRevision, value } } });
  if (written.type !== 'mcp' || written.result.type !== 'secret.written') throw new Error('Expected private secret receipt');
  return written.result.result.credentialRef;
}

function userServer(reference: string): MCPServerConfig {
  return { serverId: 'shared', label: 'Shared', enabled: false, scope: 'user', transport: { type: 'stdio', command: 'mcp-shared', args: [], envCredentialRefs: { SHARED_KEY: reference } } };
}

test('a user-file credential written in workspace A saves and resolves from workspace B', async () => {
  const a = await fixture('workspace-a');
  let workerA: StatelessWorker | undefined;
  let workerB: StatelessWorker | undefined;
  try {
    workerA = await openWorker(a.bootstrap);
    const first = await persist(workerA, 'workspace-a', [{ serverId: 'shared', label: 'Shared', enabled: false, scope: 'user', transport: { type: 'stdio', command: 'mcp-shared', args: [] } }], '0');
    const reference = await writeSecret(workerA, 'shared', first, 'user-scope-private-value');
    const withReference = await persist(workerA, 'workspace-a', [userServer(reference)], first.persistedRevision);
    // The user-scope write minted the workspace-independent provider, not the workspace-hashed one.
    const runtimeA = await openNativeRuntime(a.bootstrap);
    try {
      await runtimeA.authStorage.credentials.reload();
      expect(runtimeA.authStorage.credentials.get(`openchamber-mcp-user-${reference}`)).toMatchObject({ type: 'api_key', key: 'user-scope-private-value' });
      expect(runtimeA.authStorage.credentials.get(`${workspacePrefix('workspace-a')}${reference}`)).toBeUndefined();
    } finally { runtimeA.authStorage.close(); }
    await workerA.close();
    workerA = undefined;

    // A different workspace shares the agent directory (the user file is per
    // agent directory) and saves the same user-scope reference without a conflict.
    const bCwd = join(a.root, 'workspace-b');
    await mkdir(bCwd, { recursive: true });
    const bBootstrap: CompletionWorkerBootstrap = { ...a.bootstrap, workspaceId: 'workspace-b', workerGeneration: 'workspace-b-generation', cwd: bCwd, mcpConfigPath: join(bCwd, '.omp', 'mcp.json') };
    workerB = await openWorker(bBootstrap);
    const readBack = await workerB.operation({ type: 'mcp.configuration.read' });
    if (readBack.type !== 'mcp.configuration' || !readBack.configuration) throw new Error('Expected configuration');
    const carried = readBack.configuration.config.servers.find(server => server.serverId === 'shared');
    expect(carried?.transport).toMatchObject({ envCredentialRefs: { SHARED_KEY: reference } });
    const saved = await persist(workerB, 'workspace-b', [userServer(reference)], readBack.configuration.persistedRevision);
    expect(saved.config.servers).toHaveLength(1);
    // And the reference resolves from workspace B's own credential owner.
    const runtimeB = await openNativeRuntime(bBootstrap);
    try {
      const ownerB = new NativeMcpCredentials(runtimeB.authStorage, 'workspace-b');
      const provider = await ownerB.resolve(reference, { scope: 'user' });
      expect(provider).toBe(`openchamber-mcp-user-${reference}`);
      expect(runtimeB.authStorage.credentials.get(provider)).toMatchObject({ key: 'user-scope-private-value' });
      await runtimeB.authStorage.close();
    } catch (error) { runtimeB.authStorage.close(); throw error; }
    expect(withReference.config.servers[0]?.serverId).toBe('shared');
  } finally {
    await workerA?.close();
    await workerB?.close();
    await rm(a.root, { recursive: true, force: true });
  }
});

test('a project-file credential written in workspace A is still refused in workspace B', async () => {
  const a = await fixture('workspace-a');
  let workerA: StatelessWorker | undefined;
  let workerB: StatelessWorker | undefined;
  try {
    workerA = await openWorker(a.bootstrap);
    const first = await persist(workerA, 'workspace-a', [{ serverId: 'proj', label: 'Proj', enabled: false, scope: 'project', transport: { type: 'stdio', command: 'mcp-proj', args: [] } }], '0');
    const reference = await writeSecret(workerA, 'proj', first, 'project-private-value');
    const runtimeA = await openNativeRuntime(a.bootstrap);
    try {
      await runtimeA.authStorage.credentials.reload();
      expect(runtimeA.authStorage.credentials.get(`${workspacePrefix('workspace-a')}${reference}`)).toMatchObject({ key: 'project-private-value' });
      expect(runtimeA.authStorage.credentials.get(`openchamber-mcp-user-${reference}`)).toBeUndefined();
    } finally { runtimeA.authStorage.close(); }
    await workerA.close();
    workerA = undefined;

    const bBootstrap: CompletionWorkerBootstrap = { ...a.bootstrap, workspaceId: 'workspace-b', workerGeneration: 'workspace-b-generation' };
    const runtimeB = await openNativeRuntime(bBootstrap);
    try {
      const ownerB = new NativeMcpCredentials(runtimeB.authStorage, 'workspace-b');
      // Project scope: another workspace's project credential never resolves.
      await expect(ownerB.resolve(reference)).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
      // Even asked as a user-scope reference it cannot cross: there is no user
      // row, and the workspace-hashed legacy row belongs to workspace A, not B.
      await expect(ownerB.resolve(reference, { scope: 'user' })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    } finally { runtimeB.authStorage.close(); }
    workerB = await openWorker(bBootstrap);
    const readBack = await workerB.operation({ type: 'mcp.configuration.read' });
    if (readBack.type !== 'mcp.configuration') throw new Error('Expected configuration');
    const revision = readBack.configuration?.persistedRevision ?? '0';
    // A persist from workspace B carrying workspace A's project reference is refused.
    const foreign: MCPServerConfig = { serverId: 'foreign', label: 'Foreign', enabled: false, scope: 'project', transport: { type: 'stdio', command: 'mcp-foreign', args: [], envCredentialRefs: { KEY: reference } } };
    await expect(persist(workerB, 'workspace-b', [foreign], revision)).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
  } finally {
    await workerA?.close();
    await workerB?.close();
    await rm(a.root, { recursive: true, force: true });
  }
});

test('a legacy workspace-hashed user-file reference is migrated and resolves from every workspace', async () => {
  const a = await fixture('workspace-a');
  let workerA: StatelessWorker | undefined;
  let workerB: StatelessWorker | undefined;
  try {
    // Hand-craft the pre-migration end state: a workspace-hashed credential row
    // (written by workspace A under the legacy naming) behind a reference the
    // shared user file carries, and no migration marker.
    const reference = 'mcp_12345678-1234-4234-8234-123456789abc';
    const runtime = await openNativeRuntime(a.bootstrap);
    const legacyProvider = `${workspacePrefix('workspace-a')}${reference}`;
    try {
      await runtime.authStorage.credentials.set(legacyProvider, { type: 'api_key', key: 'legacy-private-value', source: 'login' });
    } finally { runtime.authStorage.close(); }
    const userPath = join(a.bootstrap.agentDirectory, 'mcp.json');
    const seededUserFile = {
      mcpServers: { shared: { type: 'stdio', command: 'mcp-shared', args: [], enabled: false } },
      openchamber: {
        credentials: { shared: { envCredentialRefs: { SHARED_KEY: reference } } },
        servers: { shared: { label: 'Shared', managed: true } },
      },
    };
    const seededBytes = JSON.stringify(seededUserFile);
    await writeFile(userPath, seededBytes, 'utf8');

    workerA = await openWorker(a.bootstrap);
    // Reading alone does not migrate.
    const read = await workerA.operation({ type: 'mcp.configuration.read' });
    if (read.type !== 'mcp.configuration' || !read.configuration) throw new Error('Expected configuration');
    const runtimeCheck = await openNativeRuntime(a.bootstrap);
    try {
      await runtimeCheck.authStorage.credentials.reload();
      expect(runtimeCheck.authStorage.credentials.get(`openchamber-mcp-user-${reference}`)).toBeUndefined();
    } finally { runtimeCheck.authStorage.close(); }

    // The first persist migrates: the credential moves to the
    // workspace-independent namespace and the file gains only the marker.
    const carried = read.configuration.config.servers.find(server => server.serverId === 'shared');
    if (!carried) throw new Error('Expected the shared server');
    const saved = await persist(workerA, 'workspace-a', [carried], read.configuration.persistedRevision);
    expect(saved.config.servers).toHaveLength(1);
    const migrated = JSON.parse(await readFile(userPath, 'utf8'));
    expect(migrated.openchamber.migratedCredentials).toEqual([reference]);
    expect(migrated.mcpServers).toEqual(seededUserFile.mcpServers);
    expect(migrated.openchamber.credentials).toEqual(seededUserFile.openchamber.credentials);
    expect(JSON.stringify(migrated)).not.toContain('legacy-private-value');
    const runtimeAfter = await openNativeRuntime(a.bootstrap);
    try {
      await runtimeAfter.authStorage.credentials.reload();
      expect(runtimeAfter.authStorage.credentials.get(`openchamber-mcp-user-${reference}`)).toMatchObject({ type: 'api_key', key: 'legacy-private-value' });
      expect(runtimeAfter.authStorage.credentials.get(legacyProvider)).toBeUndefined();
    } finally { runtimeAfter.authStorage.close(); }
    await workerA.close();
    workerA = undefined;

    // Workspace B now resolves the migrated reference and saves it.
    const bCwd = join(a.root, 'workspace-b');
    await mkdir(bCwd, { recursive: true });
    const bBootstrap: CompletionWorkerBootstrap = { ...a.bootstrap, workspaceId: 'workspace-b', workerGeneration: 'workspace-b-generation', cwd: bCwd, mcpConfigPath: join(bCwd, '.omp', 'mcp.json') };
    workerB = await openWorker(bBootstrap);
    const runtimeB = await openNativeRuntime(bBootstrap);
    try {
      const ownerB = new NativeMcpCredentials(runtimeB.authStorage, 'workspace-b');
      expect(await ownerB.resolve(reference, { scope: 'user' })).toBe(`openchamber-mcp-user-${reference}`);
    } finally { runtimeB.authStorage.close(); }
    const readB = await workerB.operation({ type: 'mcp.configuration.read' });
    if (readB.type !== 'mcp.configuration' || !readB.configuration) throw new Error('Expected configuration');
    const carriedB = readB.configuration.config.servers.find(server => server.serverId === 'shared');
    if (!carriedB) throw new Error('Expected the shared server');
    const bytesBeforeSecondSave = await readFile(userPath, 'utf8');
    const savedB = await persist(workerB, 'workspace-b', [carriedB], readB.configuration.persistedRevision);
    expect(savedB.config.servers).toHaveLength(1);

    // Running the migration again inside that persist was a no-op: the file is unchanged.
    expect(await readFile(userPath, 'utf8')).toBe(bytesBeforeSecondSave);
  } finally {
    await workerA?.close();
    await workerB?.close();
    await rm(a.root, { recursive: true, force: true });
  }
});

test('migration run twice is a byte-for-byte no-op and a missing credential is not marked migrated', async () => {
  const a = await fixture('workspace-a');
  try {
    const present = 'mcp_12345678-1234-4234-8234-123456789abc';
    const missing = 'mcp_00000000-0000-4000-8000-000000000000';
    const runtime = await openNativeRuntime(a.bootstrap);
    const legacyProvider = `${workspacePrefix('workspace-a')}${present}`;
    try {
      await runtime.authStorage.credentials.set(legacyProvider, { type: 'api_key', key: 'legacy-private-value', source: 'login' });
    } finally { runtime.authStorage.close(); }
    const userPath = join(a.bootstrap.agentDirectory, 'mcp.json');
    await writeFile(userPath, JSON.stringify({
      mcpServers: {
        shared: { type: 'stdio', command: 'mcp-shared', args: [], enabled: false },
        broken: { type: 'stdio', command: 'mcp-broken', args: [], enabled: false },
      },
      openchamber: {
        credentials: {
          shared: { envCredentialRefs: { SHARED_KEY: present } },
          broken: { envCredentialRefs: { BROKEN_KEY: missing } },
        },
        servers: {
          shared: { label: 'Shared', managed: true },
          broken: { label: 'Broken', managed: true },
        },
      },
    }), 'utf8');

    const runtimeOwner = await openNativeRuntime(a.bootstrap);
    try {
      const owner = new NativeMcpCredentials(runtimeOwner.authStorage, 'workspace-a');
      await owner.migrateUserCredentials(userPath);
      const onceBytes = await readFile(userPath, 'utf8');
      const once = JSON.parse(onceBytes);
      // The reference whose credential exists is claimed; the missing one is
      // deliberately not marked, so a later store repair can still adopt it.
      expect(once.openchamber.migratedCredentials).toEqual([present]);
      await owner.migrateUserCredentials(userPath);
      expect(await readFile(userPath, 'utf8')).toBe(onceBytes);
      // The missing reference still resolves to nothing, in either workspace.
      await expect(owner.resolve(missing, { scope: 'user' })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
      // Adopting the credential late makes it resolvable without any file edit.
      await runtimeOwner.authStorage.credentials.set(`openchamber-mcp-user-${missing}`, { type: 'api_key', key: 're-entered-value', source: 'login' });
      expect(await owner.resolve(missing, { scope: 'user' })).toBe(`openchamber-mcp-user-${missing}`);
    } finally { runtimeOwner.authStorage.close(); }
  } finally {
    await rm(a.root, { recursive: true, force: true });
  }
});
