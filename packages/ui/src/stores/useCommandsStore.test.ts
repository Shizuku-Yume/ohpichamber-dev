<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';
import { CommandCreateRequestSchema, CommandUpdateRequestSchema, type CommandCatalogState, type CommandEntry } from '@openchamber/agent-contract';
import { useCommandsStore, invalidateCommandsLoadCache, selectCommandsForDirectory } from './useCommandsStore';
||||||| bc50ba56aa
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Command } from './useCommandsStore';
import { runSessionListNetworkTask } from '../lib/background-network';
=======
import { beforeEach, describe, expect, test } from 'bun:test';
import type { Command } from './useCommandsStore';
import { runSessionListNetworkTask } from '../lib/background-network';
import { directoryEnvironment } from './test-support/directoryEnvironment';

const environment = directoryEnvironment({ home: '/workspace', fakeTimers: false });
>>>>>>> upstream/main

const command: CommandEntry = {
  commandId: 'command_1', name: 'team/review', description: 'Review', content: '\n# Review\n\n$ARGUMENTS\n',
  scope: 'workspace', source: 'project', editable: true, group: 'team', argumentHint: '<files>',
  agentId: 'agent_review', modelSelection: { providerId: 'provider_a', modelId: 'model_a' },
};
let lastUpdateRequest: unknown;
let catalog: CommandCatalogState;
let requests: Request[];
let failRead = false;
let conflict = false;
let delayedRead: Promise<CommandCatalogState> | null = null;
let restoreFetch: () => void = () => { };
let onRead: () => void = () => { };
let readyAt = 0;

<<<<<<< HEAD
const advanceStartup = async () => {
  for (let second = 0; second < 45; second += 1) {
    for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
    jest.advanceTimersByTime(1000);
  }
||||||| bc50ba56aa
let activeProjectPath = '/workspace/project';

let listCommandsCalls = 0;
let listCommandsImpl: (directory?: string | null) => Promise<Command[]> = async () => [];
let getDirectoryImpl: () => string = () => '/fallback/project';
// `/api/config/commands/:name/config` answers the stored entity plus where it
// lives; the v2 `CommandInfo` the list returns carries only name + description.
let runtimeFetchImpl: () => Promise<Response> = async () => new Response(
  JSON.stringify({ source: 'md', scope: 'project', path: null, legacy: false, config: {} }),
  { headers: { 'Content-Type': 'application/json' } },
);

const listCommandsMock = async (directory?: string | null) => {
  listCommandsCalls += 1;
  return listCommandsImpl(directory);
=======
let activeProjectPath = '/workspace/project';

let listCommandsCalls = 0;
let listCommandsImpl: (directory?: string | null) => Promise<Command[]> = async () => [];
// `/api/config/commands/:name/config` answers the stored entity plus where it
// lives; the v2 `CommandInfo` the list returns carries only name + description.
let runtimeFetchImpl: () => Promise<Response> = async () => new Response(
  JSON.stringify({ source: 'md', scope: 'project', path: null, legacy: false, config: {} }),
  { headers: { 'Content-Type': 'application/json' } },
);

const listCommandsMock = async (directory?: string | null) => {
  listCommandsCalls += 1;
  return listCommandsImpl(directory);
>>>>>>> upstream/main
};

<<<<<<< HEAD
beforeEach(() => {
  useCommandsStore.getState().resetForRuntimeSwitch();
  catalog = { workspaceId: 'workspace_1', revision: '1', commands: [command], builtinCommands: ['context', 'compact'] };
  requests = []; failRead = false; conflict = false; delayedRead = null; onRead = () => { };
  lastUpdateRequest = undefined;
  readyAt = 0;
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (Date.now() < readyAt) return Response.json({ type: 'urn:test:warmup', title: 'Unavailable', status: 503, detail: 'The Agent Service is not ready.', code: 'SERVICE_UNAVAILABLE', retryable: true }, { status: 503 });
    if (path === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace' });
    if (path === '/api/agent/v1/workspaces/workspace_1/commands' && request.method === 'GET') {
      onRead();
      if (failRead) return new Response('unavailable', { status: 503 });
      return Response.json(delayedRead ? await delayedRead : catalog);
||||||| bc50ba56aa
const getDirectoryMock = () => getDirectoryImpl();
const runtimeFetchMock = async () => runtimeFetchImpl();

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    getDirectory: getDirectoryMock,
    listCommands: listCommandsMock,
  },
}));

mock.module('@/stores/useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({
      getActiveProject: () => ({ path: activeProjectPath }),
    }),
  },
}));

mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: runtimeFetchMock,
}));

mock.module('@/lib/configUpdate', () => ({
  startConfigUpdate: mock(() => undefined),
  finishConfigUpdate: mock(() => undefined),
  updateConfigUpdateMessage: mock(() => undefined),
}));

mock.module('@/lib/configSync', () => ({
  emitConfigChange: mock(() => undefined),
  scopeMatches: mock(() => false),
  subscribeToConfigChanges: mock(() => () => undefined),
}));

const { useCommandsStore, invalidateCommandsLoadCache, resolveCommandDirectory, selectCommandsForComposer, selectCommandsForDirectory, isCommandOfferedInComposer } = await import('./useCommandsStore');

describe('useCommandsStore', () => {
  beforeEach(() => {
    activeProjectPath = '/workspace/project';
    invalidateCommandsLoadCache(activeProjectPath);
    invalidateCommandsLoadCache('/workspace/other');
    listCommandsCalls = 0;
    listCommandsImpl = async () => [];
    getDirectoryImpl = () => '/fallback/project';
    runtimeFetchImpl = async () => new Response(
      JSON.stringify({ source: 'md', scope: 'project', path: null, legacy: false, config: {} }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    useCommandsStore.setState({
      selectedCommandName: null,
      commands: [],
      commandsByDirectory: {},
      isLoading: false,
      commandDraft: null,
    });
  });

  test('command scope enrichment stays bounded and leaves room for session lists', async () => {
    const release = deferred<void>();
    const started = deferred<void>();
    let active = 0;
    let peak = 0;
    listCommandsImpl = async () => Array.from({ length: 24 }, (_, index) => ({ name: `command-${index}` }));
    runtimeFetchImpl = async () => {
      active += 1;
      peak = Math.max(peak, active);
      if (active === 2) started.resolve();
      await release.promise;
      active -= 1;
      return Response.json({ scope: 'project' });
    };
    const load = useCommandsStore.getState().loadCommands();
    try {
      await started.promise;
      expect(peak).toBe(2);
      expect(await runSessionListNetworkTask(async () => 'sessions ready')).toBe('sessions ready');
    } finally {
      release.resolve();
      expect(await load).toBe(true);
=======
// These tests read entries per command, as against a server without the batch
// route; `batchEntries` answers that route when a test sets it.
let batchEntries: ((names: string[]) => Promise<Response>) | null = null;
const runtimeFetchMock = async (input: string) => {
  if (!input.startsWith('/api/config/command-configs')) return runtimeFetchImpl();
  if (!batchEntries) return new Response(null, { status: 404 });
  return batchEntries(new URLSearchParams(input.split('?')[1]).getAll('name'));
};

environment.respond(async (url, init) => {
  if (url.pathname === '/api/command') {
    const directory = decodeURIComponent(new Headers(init?.headers).get('x-opencode-directory') ?? '');
    return Response.json({ data: await listCommandsMock(directory) });
  }
  if (url.pathname.startsWith('/api/config/command')) return runtimeFetchMock(`${url.pathname}${url.search}`);
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/workspace', chatsRoot: '/workspace/chats' });
  if (url.pathname === '/api/location' || url.pathname === '/api/session') return Response.json({}, { status: 401 });
  throw new Error(`Unexpected request: ${url}`);
});
const { useProjectsStore } = await import('./useProjectsStore');
const selectProject = (path: string) => {
  activeProjectPath = path;
  useProjectsStore.setState({ projects: [{ id: path, path }], activeProjectId: path });
};

const { useCommandsStore, invalidateCommandsLoadCache, resolveCommandDirectory, selectCommandsForComposer, selectCommandsForDirectory, isCommandOfferedInComposer } = await import('./useCommandsStore');

describe('useCommandsStore', () => {
  beforeEach(() => {
    selectProject('/workspace/project');
    invalidateCommandsLoadCache(activeProjectPath);
    invalidateCommandsLoadCache('/workspace/other');
    listCommandsCalls = 0;
    listCommandsImpl = async () => [];
    runtimeFetchImpl = async () => new Response(
      JSON.stringify({ source: 'md', scope: 'project', path: null, legacy: false, config: {} }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    useCommandsStore.setState({
      selectedCommandName: null,
      commands: [],
      commandsByDirectory: {},
      isLoading: false,
      commandDraft: null,
    });
  });

  test('reads every command entry in one request when the server has the batch route', async () => {
    let perCommandReads = 0;
    const batches: string[][] = [];
    listCommandsImpl = async () => [{ name: 'review' }, { name: 'git/commit' }, { name: 'unknown' }];
    runtimeFetchImpl = async () => {
      perCommandReads += 1;
      return Response.json({});
    };
    batchEntries = async (names) => {
      batches.push(names);
      return Response.json({ commands: [
        { name: 'review', entry: { source: 'none', scope: null, path: null, legacy: false, config: {} } },
        { name: 'git/commit', entry: { source: 'md', scope: 'user', path: '/home/commands/git/commit.md', legacy: false, config: { description: 'Commit' } } },
      ] });
    };
    try {
      expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    } finally {
      batchEntries = null;
    }
    expect(batches).toEqual([['review', 'git/commit', 'unknown']]);
    expect(perCommandReads).toBe(0);
    expect(useCommandsStore.getState().commands).toMatchObject([
      { name: 'review', fromOpenCode: true },
      { name: 'git/commit', scope: 'user', description: 'Commit', path: '/home/commands/git/commit.md' },
      { name: 'unknown' },
    ]);
  });

  test('an invalidated batch metadata read cannot publish stale entries', async () => {
    const pending = deferred<Response>();
    const started = deferred<void>();
    let reads = 0;
    listCommandsImpl = async () => [{ name: 'review' }];
    batchEntries = async () => {
      reads += 1;
      if (reads === 1) {
        started.resolve();
        return pending.promise;
      }
      return Response.json({ commands: [{ name: 'review', entry: { config: { description: 'fresh' } } }] });
    };
    const descriptions: Array<string | undefined> = [];
    const unsubscribe = useCommandsStore.subscribe(state => descriptions.push(state.commands[0]?.description));
    try {
      const first = useCommandsStore.getState().loadCommands();
      await started.promise;
      invalidateCommandsLoadCache(activeProjectPath);
      const refreshed = useCommandsStore.getState().loadCommands();
      pending.resolve(Response.json({ commands: [{ name: 'review', entry: { config: { description: 'stale' } } }] }));
      expect(await Promise.all([first, refreshed])).toEqual([true, true]);
      expect(useCommandsStore.getState().commands[0]?.description).toBe('fresh');
      expect(descriptions).not.toContain('stale');
      expect(reads).toBe(2);
    } finally {
      pending.resolve(Response.json({ commands: [] }));
      unsubscribe();
      batchEntries = null;
    }
  });

  test('command scope enrichment stays bounded and leaves room for session lists', async () => {
    const release = deferred<void>();
    const started = deferred<void>();
    let active = 0;
    let peak = 0;
    listCommandsImpl = async () => Array.from({ length: 24 }, (_, index) => ({ name: `command-${index}` }));
    runtimeFetchImpl = async () => {
      active += 1;
      peak = Math.max(peak, active);
      if (active === 2) started.resolve();
      await release.promise;
      active -= 1;
      return Response.json({ scope: 'project' });
    };
    const load = useCommandsStore.getState().loadCommands();
    try {
      await started.promise;
      expect(peak).toBe(2);
      expect(await runSessionListNetworkTask(async () => 'sessions ready')).toBe('sessions ready');
    } finally {
      release.resolve();
      expect(await load).toBe(true);
>>>>>>> upstream/main
    }
    if (conflict) return Response.json({ type: 'urn:ohpichamber:problem:CATALOG_CONFLICT', title: 'Conflict', status: 409, detail: 'Revision changed', code: 'CATALOG_CONFLICT', retryable: false }, { status: 409 });
    if (request.method === 'POST' && path.endsWith('/commands')) {
      const input = CommandCreateRequestSchema.parse(await request.json());
      expect(input.expectedRevision).toBe(catalog.revision);
      const created: CommandEntry = { ...input, commandId: 'command_new', description: input.description ?? '', source: 'project', editable: true };
      // Project only the canonical entry rather than persisting request CAS fields.
      catalog = { ...catalog, revision: String(BigInt(catalog.revision) + 1n), commands: [...catalog.commands, { commandId: created.commandId, name: created.name, description: created.description, content: created.content, scope: created.scope, source: created.source, editable: true, group: created.group, argumentHint: created.argumentHint, agentId: created.agentId, modelSelection: created.modelSelection }] };
      return Response.json(catalog);
    }
    if (request.method === 'PATCH' && path.includes('/commands/')) {
      const input = CommandUpdateRequestSchema.parse(await request.json());
      lastUpdateRequest = input;
      const target = catalog.commands.find(c => c.commandId === input.commandId) ?? command;
      const updated: CommandEntry = { ...target, name: input.name, description: input.description ?? '', content: input.content, modelSelection: input.modelSelection, group: input.group, argumentHint: input.argumentHint };
      delete updated.agentId;
      if (input.agentId) updated.agentId = input.agentId;
      catalog = { ...catalog, revision: String(BigInt(catalog.revision) + 1n), commands: catalog.commands.map(c => c.commandId === updated.commandId ? updated : c) };
      return Response.json(catalog);
    }
    if (request.method === 'DELETE' && path.includes('/commands/')) {
      const body = await request.json();
      expect(body.expectedRevision).toBe(catalog.revision);
      catalog = { ...catalog, revision: String(BigInt(catalog.revision) + 1n), commands: catalog.commands.filter(c => c.commandId !== body.commandId) };
      return Response.json(catalog);
    }
    throw new Error(`Unexpected request ${request.method} ${path}`);
  });
  restoreFetch = () => fetchSpy.mockRestore();
});
afterEach(() => { jest.useRealTimers(); restoreFetch(); useCommandsStore.getState().resetForRuntimeSwitch(); });

describe('native command consumers', () => {
  test('loads commands automatically after delayed Agent Service readiness', async () => {
    jest.useFakeTimers();
    readyAt = Date.now() + 25000;
    const loading = useCommandsStore.getState().loadCommands('/repo');
    await advanceStartup();
    expect(await loading).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([command]);
    expect(requests.filter(request => new URL(request.url).pathname.endsWith('/commands'))).toHaveLength(1);
  });
  test('an empty command catalog after readiness is authoritative', async () => {
    jest.useFakeTimers();
    readyAt = Date.now() + 1000;
    catalog = { ...catalog, commands: [], builtinCommands: [] };
    const loading = useCommandsStore.getState().loadCommands('/repo');
    await advanceStartup();
    expect(await loading).toBe(true);
    expect(useCommandsStore.getState().catalogsByDirectory['/repo']).toEqual(catalog);
  });
  test('runtime reset cancels startup retries before resolving another workspace', async () => {
    jest.useFakeTimers();
    readyAt = Date.now() + 25000;
    const loading = useCommandsStore.getState().loadCommands('/repo');
    for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
    useCommandsStore.getState().resetForRuntimeSwitch();
    await advanceStartup();
    expect(await loading).toBe(false);
    expect(requests).toHaveLength(1);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([]);
  });
  test('loads one authoritative catalog with native grouping, source and bindings', async () => {
    expect(await useCommandsStore.getState().loadCommands('/repo')).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([command]);
    expect(requests.map(request => new URL(request.url).pathname)).toEqual(['/api/agent/v1/workspaces/resolve', '/api/agent/v1/workspaces/workspace_1/commands']);
    expect(await useCommandsStore.getState().loadCommands('/repo')).toBe(true);
    expect(requests).toHaveLength(2);
  });
  test('writes exact Markdown, CAS and clears legacy bindings', async () => {
    const content = '\n  ## Heading\n\n```ts\nconst value = 1;\n```\n';
    expect(await useCommandsStore.getState().updateCommand(command.name, { content }, '/repo')).toBe(true);
    expect(lastUpdateRequest).toMatchObject({ content, agentId: null });
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')[0].agentId).toBeUndefined();
    expect(await useCommandsStore.getState().updateCommand(command.name, { agentId: null, modelSelection: undefined }, '/repo')).toBe(true);
    expect(lastUpdateRequest).toMatchObject({ agentId: null });
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')[0].agentId).toBeUndefined();
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')[0].modelSelection).toBeUndefined();
  });
  test('read and CAS failures preserve previously published data', async () => {
    jest.useFakeTimers();
    await useCommandsStore.getState().loadCommands('/repo');
    failRead = true;
    invalidateCommandsLoadCache('/repo');
    const loading = useCommandsStore.getState().loadCommands('/repo');
    await advanceStartup();
    expect(await loading).toBe(false);
    expect(requests.filter(request => new URL(request.url).pathname.endsWith('/commands'))).toHaveLength(9);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([command]);
    conflict = true;
    expect(await useCommandsStore.getState().updateCommand(command.name, { content: 'not committed' }, '/repo')).toBe(false);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([command]);
  });
<<<<<<< HEAD
  test('old reads cannot overwrite a successful mutation', async () => {
    await useCommandsStore.getState().loadCommands('/repo');
    const { promise, resolve: finish } = Promise.withResolvers<CommandCatalogState>();
    const started = Promise.withResolvers<void>();
    onRead = () => started.resolve();
    delayedRead = promise;
    invalidateCommandsLoadCache('/repo');
    const staleLoad = useCommandsStore.getState().loadCommands('/repo');
||||||| bc50ba56aa

  test('first load publishes a directory even when its commands match the previous project', async () => {
    const commands = [{ name: 'shared', scope: 'project' as const, path: null, legacy: false }];
    useCommandsStore.setState({
      commands,
      commandsByDirectory: { '/workspace/other': commands },
    });
    listCommandsImpl = async () => commands;

    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath)).toEqual(commands);
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(listCommandsCalls).toBe(1);
  });

  test('revisiting a cached project restores its mirror without another request', async () => {
    listCommandsImpl = async () => [{ name: 'first' }];
    await useCommandsStore.getState().loadCommands();
    const firstCommands = useCommandsStore.getState().commands;
    activeProjectPath = '/workspace/other';
    listCommandsImpl = async () => [{ name: 'second' }];
    await useCommandsStore.getState().loadCommands();
    activeProjectPath = '/workspace/project';

    await useCommandsStore.getState().loadCommands();
    expect(useCommandsStore.getState().commands).toBe(firstCommands);
    expect(listCommandsCalls).toBe(2);

    invalidateCommandsLoadCache(activeProjectPath);
    listCommandsImpl = async () => [{ name: 'first' }];
    useCommandsStore.setState({ commands: [] });
    await useCommandsStore.getState().loadCommands();
    expect(useCommandsStore.getState().commands).toBe(firstCommands);
  });

  test('a late response only updates its own directory after a project switch', async () => {
    const pending = deferred<Command[]>();
    const started = deferred<void>();
    listCommandsImpl = async (directory) => {
      expect(directory).toBe('/workspace/project');
      started.resolve();
      return pending.promise;
    };
    const firstLoad = useCommandsStore.getState().loadCommands();
=======

  test('first load publishes a directory even when its commands match the previous project', async () => {
    const commands = [{ name: 'shared', scope: 'project' as const, path: null, legacy: false }];
    useCommandsStore.setState({
      commands,
      commandsByDirectory: { '/workspace/other': commands },
    });
    listCommandsImpl = async () => commands;

    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath)).toEqual(commands);
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(listCommandsCalls).toBe(1);
  });

  test('revisiting a cached project restores its mirror without another request', async () => {
    listCommandsImpl = async () => [{ name: 'first' }];
    await useCommandsStore.getState().loadCommands();
    const firstCommands = useCommandsStore.getState().commands;
    selectProject('/workspace/other');
    listCommandsImpl = async () => [{ name: 'second' }];
    await useCommandsStore.getState().loadCommands();
    selectProject('/workspace/project');

    await useCommandsStore.getState().loadCommands();
    expect(useCommandsStore.getState().commands).toBe(firstCommands);
    expect(listCommandsCalls).toBe(2);

    invalidateCommandsLoadCache(activeProjectPath);
    listCommandsImpl = async () => [{ name: 'first' }];
    useCommandsStore.setState({ commands: [] });
    await useCommandsStore.getState().loadCommands();
    expect(useCommandsStore.getState().commands).toBe(firstCommands);
  });

  test('a late response only updates its own directory after a project switch', async () => {
    const pending = deferred<Command[]>();
    const started = deferred<void>();
    listCommandsImpl = async (directory) => {
      expect(directory).toBe('/workspace/project');
      started.resolve();
      return pending.promise;
    };
    const firstLoad = useCommandsStore.getState().loadCommands();
>>>>>>> upstream/main
    await started.promise;
<<<<<<< HEAD
    expect(await useCommandsStore.getState().updateCommand(command.name, { content: 'new Markdown' }, '/repo')).toBe(true);
    finish({ workspaceId: 'workspace_1', revision: '1', commands: [command], builtinCommands: ['context', 'compact'] });
    await staleLoad;
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')[0].content).toBe('new Markdown');
  });
  test('runtime reset rejects an old authoritative response', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<CommandCatalogState>();
    const started = Promise.withResolvers<void>();
    onRead = () => started.resolve();
    delayedRead = promise;
    const oldLoad = useCommandsStore.getState().loadCommands('/repo');
    await started.promise;
    useCommandsStore.getState().resetForRuntimeSwitch();
    finish(catalog);
    expect(await oldLoad).toBe(false);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([]);
  });
  test('read-only resources never send mutation requests', async () => {
    catalog = { ...catalog, commands: [{ ...command, scope: 'inherited', editable: false }] };
    expect(await useCommandsStore.getState().updateCommand(command.name, { content: 'no' }, '/repo')).toBe(false);
    expect(await useCommandsStore.getState().deleteCommand(command.name, '/repo')).toBe(false);
    expect(requests.every(request => request.method !== 'PATCH' && request.method !== 'DELETE')).toBe(true);
  });
  test('same-name builtin and custom commands route update and delete to custom id while builtin stays read-only', async () => {
    const builtinCompact: CommandEntry = { commandId: 'command_builtin_compact', name: 'compact', description: 'Built-in', content: '', scope: 'inherited', source: 'builtin', editable: false };
    const customCompact: CommandEntry = { commandId: 'command_custom_compact', name: 'compact', description: 'Custom', content: 'Custom content', scope: 'workspace', source: 'workspace', editable: true };
    catalog = { ...catalog, commands: [builtinCompact, customCompact] };
    await useCommandsStore.getState().loadCommands('/repo');
||||||| bc50ba56aa
    activeProjectPath = '/workspace/other';
    listCommandsImpl = async () => [{ name: 'second' }];
    await useCommandsStore.getState().loadCommands();
    const secondCommands = useCommandsStore.getState().commands;
    pending.resolve([{ name: 'first' }]);
    await firstLoad;
=======
    selectProject('/workspace/other');
    listCommandsImpl = async () => [{ name: 'second' }];
    await useCommandsStore.getState().loadCommands();
    const secondCommands = useCommandsStore.getState().commands;
    pending.resolve([{ name: 'first' }]);
    await firstLoad;
>>>>>>> upstream/main

    expect(await useCommandsStore.getState().updateCommand('compact', { content: 'Updated custom' }, '/repo', customCompact.commandId)).toBe(true);
    expect(lastUpdateRequest).toMatchObject({ commandId: customCompact.commandId, content: 'Updated custom' });

    lastUpdateRequest = undefined;
    expect(await useCommandsStore.getState().updateCommand('compact', { content: 'Should fail' }, '/repo', builtinCompact.commandId)).toBe(false);
    expect(lastUpdateRequest).toBeUndefined();

    expect(await useCommandsStore.getState().updateCommand('compact', { content: 'Unambiguous editable' }, '/repo')).toBe(true);
    expect(lastUpdateRequest).toMatchObject({ commandId: customCompact.commandId, content: 'Unambiguous editable' });

    expect(await useCommandsStore.getState().deleteCommand('compact', '/repo', customCompact.commandId)).toBe(true);
    const deleteRequest = requests.find(r => r.method === 'DELETE');
    expect(deleteRequest).toBeDefined();
    expect(new URL(deleteRequest!.url).pathname).toBe('/api/agent/v1/workspaces/workspace_1/commands/command_custom_compact');
  });

<<<<<<< HEAD
  test('deleting custom command does not clear selected builtin command with same name', async () => {
    const builtinCompact: CommandEntry = { commandId: 'command_builtin_compact', name: 'compact', description: 'Built-in', content: '', scope: 'inherited', source: 'builtin', editable: false };
    const customCompact: CommandEntry = { commandId: 'command_custom_compact', name: 'compact', description: 'Custom', content: 'Custom content', scope: 'workspace', source: 'workspace', editable: true };
    catalog = { ...catalog, commands: [builtinCompact, customCompact] };
    await useCommandsStore.getState().loadCommands('/repo');
||||||| bc50ba56aa
  test('successful empty discovery clears only that project and is cached', async () => {
    const commands = [{ name: 'old' }];
    useCommandsStore.setState({ commands, commandsByDirectory: { [activeProjectPath]: commands } });
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath)).toEqual([]);
    expect(useCommandsStore.getState().commands).toEqual([]);
    await useCommandsStore.getState().loadCommands();
    expect(listCommandsCalls).toBe(1);
  });
=======
  test('successful empty discovery clears only that project and allows a fresh read', async () => {
    const commands = [{ name: 'old' }];
    useCommandsStore.setState({ commands, commandsByDirectory: { [activeProjectPath]: commands } });
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath)).toEqual([]);
    expect(useCommandsStore.getState().commands).toEqual([]);
    await useCommandsStore.getState().loadCommands();
    expect(listCommandsCalls).toBe(2);
  });
>>>>>>> upstream/main

    useCommandsStore.getState().setSelectedCommandId(builtinCompact.commandId);
    useCommandsStore.getState().setSelectedCommand('compact');
    expect(useCommandsStore.getState().selectedCommandId).toBe(builtinCompact.commandId);

    expect(await useCommandsStore.getState().deleteCommand('compact', '/repo', customCompact.commandId)).toBe(true);

<<<<<<< HEAD
    expect(useCommandsStore.getState().selectedCommandId).toBe(builtinCompact.commandId);
    expect(useCommandsStore.getState().selectedCommandName).toBe('compact');
||||||| bc50ba56aa
    listCommandsImpl = async () => [{ name: 'recovered' }];
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath).map(c => c.name)).toEqual(['recovered']);
  });

  test('an in-flight settings load becomes the active mirror if its project is selected', async () => {
    const pending = deferred<Command[]>();
    listCommandsImpl = () => pending.promise;
    const settingsLoad = useCommandsStore.getState().loadCommands('/workspace/other');
    activeProjectPath = '/workspace/other';
    const activeLoad = useCommandsStore.getState().loadCommands();
    pending.resolve([{ name: 'selected' }]);
    expect(await settingsLoad).toBe(true);
    expect(await activeLoad).toBe(true);
    expect(listCommandsCalls).toBe(1);
    expect(useCommandsStore.getState().commands.map(c => c.name)).toEqual(['selected']);
  });

  test('a worktree draft reads the commands of the folder its session starts in, once that folder is known', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const folder = `${worktreeRoot}/ai`;
    const resolved = { open: true, worktreeStartDirectory: { worktreeRoot, directory: folder } };

    expect(resolveCommandDirectory(worktreeRoot, resolved)).toEqual({ status: 'resolved', directory: folder });
    expect(resolveCommandDirectory(`${worktreeRoot}/`, resolved)).toEqual({ status: 'resolved', directory: folder });
    // Another worktree, a closed draft, a composer that shows no draft, or no directory: unchanged.
    expect(resolveCommandDirectory('/repo/worktrees/other', resolved)).toEqual({ status: 'resolved', directory: '/repo/worktrees/other' });
    expect(resolveCommandDirectory(worktreeRoot, { ...resolved, open: false })).toEqual({ status: 'resolved', directory: worktreeRoot });
    expect(resolveCommandDirectory(worktreeRoot, null)).toEqual({ status: 'resolved', directory: worktreeRoot });
    expect(resolveCommandDirectory(null, resolved)).toEqual({ status: 'resolved', directory: null });
  });

  test('a worktree draft whose start folder is still resolving lists nothing and requests nothing', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const pending = { open: true, worktreeStartDirectory: { worktreeRoot, directory: null } };
    const rootOnly = [{ name: 'root-only', description: '', template: '', scope: 'project' as const }];
    useCommandsStore.setState({ commandsByDirectory: { [worktreeRoot]: rootOnly } });

    expect(resolveCommandDirectory(worktreeRoot, pending)).toEqual({ status: 'pending' });
    // The root's cached commands are not offered for a draft that has not resolved its folder.
    expect(selectCommandsForComposer(useCommandsStore.getState(), { status: 'pending' })).toEqual([]);
    expect(selectCommandsForComposer(useCommandsStore.getState(), { status: 'resolved', directory: worktreeRoot })).toBe(rootOnly);
  });

  test('a worktree draft whose start folder fell back to the root lists the root', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const fallback = { open: true, worktreeStartDirectory: { worktreeRoot, directory: worktreeRoot } };

    expect(resolveCommandDirectory(worktreeRoot, fallback)).toEqual({ status: 'resolved', directory: worktreeRoot });
  });

  test('a pinned root session keeps its own directory beside a subfolder draft', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const folder = `${worktreeRoot}/ai`;
    const draft = { open: true, worktreeStartDirectory: { worktreeRoot, directory: folder } };

    // The main composer maps the draft; the pinned column passes no draft and stays on the root.
    expect(resolveCommandDirectory(worktreeRoot, draft)).toEqual({ status: 'resolved', directory: folder });
    expect(resolveCommandDirectory(worktreeRoot, null)).toEqual({ status: 'resolved', directory: worktreeRoot });
  });

});

describe('isCommandOfferedInComposer', () => {
  test('hides OpenCode\'s own /goal but keeps a user command of that name', () => {
    expect(isCommandOfferedInComposer({ name: 'goal', fromOpenCode: true })).toBe(false);
    expect(isCommandOfferedInComposer({ name: 'goal', scope: 'project' })).toBe(true);
    // A failed metadata read leaves the command unclassified: keep it.
    expect(isCommandOfferedInComposer({ name: 'goal' })).toBe(true);
    expect(isCommandOfferedInComposer({ name: 'review' })).toBe(true);
=======
    listCommandsImpl = async () => [{ name: 'recovered' }];
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath).map(c => c.name)).toEqual(['recovered']);
  });

  test('an in-flight settings load becomes the active mirror if its project is selected', async () => {
    const pending = deferred<Command[]>();
    listCommandsImpl = () => pending.promise;
    const settingsLoad = useCommandsStore.getState().loadCommands('/workspace/other');
    selectProject('/workspace/other');
    const activeLoad = useCommandsStore.getState().loadCommands();
    pending.resolve([{ name: 'selected' }]);
    expect(await settingsLoad).toBe(true);
    expect(await activeLoad).toBe(true);
    expect(listCommandsCalls).toBe(1);
    expect(useCommandsStore.getState().commands.map(c => c.name)).toEqual(['selected']);
  });

  test('a worktree draft reads the commands of the folder its session starts in, once that folder is known', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const folder = `${worktreeRoot}/ai`;
    const resolved = { open: true, worktreeStartDirectory: { worktreeRoot, directory: folder } };

    expect(resolveCommandDirectory(worktreeRoot, resolved)).toEqual({ status: 'resolved', directory: folder });
    expect(resolveCommandDirectory(`${worktreeRoot}/`, resolved)).toEqual({ status: 'resolved', directory: folder });
    // Another worktree, a closed draft, a composer that shows no draft, or no directory: unchanged.
    expect(resolveCommandDirectory('/repo/worktrees/other', resolved)).toEqual({ status: 'resolved', directory: '/repo/worktrees/other' });
    expect(resolveCommandDirectory(worktreeRoot, { ...resolved, open: false })).toEqual({ status: 'resolved', directory: worktreeRoot });
    expect(resolveCommandDirectory(worktreeRoot, null)).toEqual({ status: 'resolved', directory: worktreeRoot });
    expect(resolveCommandDirectory(null, resolved)).toEqual({ status: 'resolved', directory: null });
  });

  test('a worktree draft whose start folder is still resolving lists nothing and requests nothing', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const pending = { open: true, worktreeStartDirectory: { worktreeRoot, directory: null } };
    const rootOnly = [{ name: 'root-only', description: '', template: '', scope: 'project' as const }];
    useCommandsStore.setState({ commandsByDirectory: { [worktreeRoot]: rootOnly } });

    expect(resolveCommandDirectory(worktreeRoot, pending)).toEqual({ status: 'pending' });
    // The root's cached commands are not offered for a draft that has not resolved its folder.
    expect(selectCommandsForComposer(useCommandsStore.getState(), { status: 'pending' })).toEqual([]);
    expect(selectCommandsForComposer(useCommandsStore.getState(), { status: 'resolved', directory: worktreeRoot })).toBe(rootOnly);
  });

  test('a worktree draft whose start folder fell back to the root lists the root', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const fallback = { open: true, worktreeStartDirectory: { worktreeRoot, directory: worktreeRoot } };

    expect(resolveCommandDirectory(worktreeRoot, fallback)).toEqual({ status: 'resolved', directory: worktreeRoot });
  });

  test('a pinned root session keeps its own directory beside a subfolder draft', () => {
    const worktreeRoot = '/repo/worktrees/feature';
    const folder = `${worktreeRoot}/ai`;
    const draft = { open: true, worktreeStartDirectory: { worktreeRoot, directory: folder } };

    // The main composer maps the draft; the pinned column passes no draft and stays on the root.
    expect(resolveCommandDirectory(worktreeRoot, draft)).toEqual({ status: 'resolved', directory: folder });
    expect(resolveCommandDirectory(worktreeRoot, null)).toEqual({ status: 'resolved', directory: worktreeRoot });
  });

});

describe('isCommandOfferedInComposer', () => {
  test('hides OpenCode\'s own /goal but keeps a user command of that name', () => {
    expect(isCommandOfferedInComposer({ name: 'goal', fromOpenCode: true })).toBe(false);
    expect(isCommandOfferedInComposer({ name: 'goal', scope: 'project' })).toBe(true);
    // A failed metadata read leaves the command unclassified: keep it.
    expect(isCommandOfferedInComposer({ name: 'goal' })).toBe(true);
    expect(isCommandOfferedInComposer({ name: 'review' })).toBe(true);
>>>>>>> upstream/main
  });
});
