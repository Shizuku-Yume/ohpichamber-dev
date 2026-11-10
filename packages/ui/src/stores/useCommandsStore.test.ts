import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CommandCreateRequestSchema, CommandUpdateRequestSchema, type CommandCatalogState, type CommandEntry } from '@openchamber/agent-contract';
import { useCommandsStore, invalidateCommandsLoadCache, selectCommandsForDirectory } from './useCommandsStore';

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

<<<<<<< HEAD
beforeEach(() => {
  useCommandsStore.getState().resetForRuntimeSwitch();
  catalog = { workspaceId: 'workspace_1', revision: '1', commands: [command], builtinCommands: ['context', 'compact'] };
  requests = []; failRead = false; conflict = false; delayedRead = null; onRead = () => { };
  lastUpdateRequest = undefined;
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace' });
    if (path === '/api/agent/v1/workspaces/workspace_1/commands' && request.method === 'GET') {
      onRead();
      if (failRead) return new Response('unavailable', { status: 503 });
      return Response.json(delayedRead ? await delayedRead : catalog);
=======
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
>>>>>>> bc50ba56a
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
afterEach(() => { restoreFetch(); useCommandsStore.getState().resetForRuntimeSwitch(); });

describe('native command consumers', () => {
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
    await useCommandsStore.getState().loadCommands('/repo');
    failRead = true;
    invalidateCommandsLoadCache('/repo');
    expect(await useCommandsStore.getState().loadCommands('/repo')).toBe(false);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([command]);
    conflict = true;
    expect(await useCommandsStore.getState().updateCommand(command.name, { content: 'not committed' }, '/repo')).toBe(false);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/repo')).toEqual([command]);
  });
  test('old reads cannot overwrite a successful mutation', async () => {
    await useCommandsStore.getState().loadCommands('/repo');
    const { promise, resolve: finish } = Promise.withResolvers<CommandCatalogState>();
    const started = Promise.withResolvers<void>();
    onRead = () => started.resolve();
    delayedRead = promise;
    invalidateCommandsLoadCache('/repo');
    const staleLoad = useCommandsStore.getState().loadCommands('/repo');
    await started.promise;
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

  test('deleting custom command does not clear selected builtin command with same name', async () => {
    const builtinCompact: CommandEntry = { commandId: 'command_builtin_compact', name: 'compact', description: 'Built-in', content: '', scope: 'inherited', source: 'builtin', editable: false };
    const customCompact: CommandEntry = { commandId: 'command_custom_compact', name: 'compact', description: 'Custom', content: 'Custom content', scope: 'workspace', source: 'workspace', editable: true };
    catalog = { ...catalog, commands: [builtinCompact, customCompact] };
    await useCommandsStore.getState().loadCommands('/repo');

    useCommandsStore.getState().setSelectedCommandId(builtinCompact.commandId);
    useCommandsStore.getState().setSelectedCommand('compact');
    expect(useCommandsStore.getState().selectedCommandId).toBe(builtinCompact.commandId);

    expect(await useCommandsStore.getState().deleteCommand('compact', '/repo', customCompact.commandId)).toBe(true);

    expect(useCommandsStore.getState().selectedCommandId).toBe(builtinCompact.commandId);
    expect(useCommandsStore.getState().selectedCommandName).toBe('compact');
  });
<<<<<<< HEAD
=======

  test('loading another project leaves the active project\'s commands alone', async () => {
    // Settings can browse a project the app is not on. Chat reads `commands`,
    // so that list must keep describing the active project.
    const activeCommands = [{
      name: 'active-only',
      description: 'Active project command',
      template: 'run it',
      scope: 'project' as const,
    }];
    useCommandsStore.setState({
      commands: activeCommands,
      commandsByDirectory: { [activeProjectPath]: activeCommands },
    });
    listCommandsImpl = async () => [
      { name: 'other-only', description: 'Other project command', template: 'run there' },
    ];

    const result = await useCommandsStore.getState().loadCommands('/workspace/other');

    expect(result).toBe(true);
    const state = useCommandsStore.getState();
    expect(state.commands).toEqual(activeCommands);
    expect(state.commandsByDirectory['/workspace/other']?.map((command) => command.name)).toEqual(['other-only']);
    expect(state.commandsByDirectory[activeProjectPath]).toEqual(activeCommands);
  });

  test('loadCommands preserves previous commands when the command list fails', async () => {
    const previousCommands = [{
      name: 'existing',
      description: 'Existing command',
      template: 'do the previous thing',
      scope: 'project' as const,
    }];
    useCommandsStore.setState({ commands: previousCommands, commandsByDirectory: { [activeProjectPath]: previousCommands } });
    listCommandsImpl = async () => {
      throw new Error('network down');
    };

    const result = await useCommandsStore.getState().loadCommands();

    expect(result).toBe(false);
    expect(listCommandsCalls).toBe(3);
    expect(useCommandsStore.getState().commands).toEqual(previousCommands);
    expect(useCommandsStore.getState().isLoading).toBe(false);
  });

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
    await started.promise;
    activeProjectPath = '/workspace/other';
    listCommandsImpl = async () => [{ name: 'second' }];
    await useCommandsStore.getState().loadCommands();
    const secondCommands = useCommandsStore.getState().commands;
    pending.resolve([{ name: 'first' }]);
    await firstLoad;

    expect(useCommandsStore.getState().commands).toBe(secondCommands);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/workspace/project').map(c => c.name)).toEqual(['first']);
  });

  test('successful empty discovery clears only that project and is cached', async () => {
    const commands = [{ name: 'old' }];
    useCommandsStore.setState({ commands, commandsByDirectory: { [activeProjectPath]: commands } });
    expect(await useCommandsStore.getState().loadCommands()).toBe(true);
    expect(selectCommandsForDirectory(useCommandsStore.getState(), activeProjectPath)).toEqual([]);
    expect(useCommandsStore.getState().commands).toEqual([]);
    await useCommandsStore.getState().loadCommands();
    expect(listCommandsCalls).toBe(1);
  });


  test('a failed first load cannot copy the previous project and can recover on retry', async () => {
    const otherCommands = [{ name: 'other-only' }];
    useCommandsStore.setState({ commands: otherCommands, commandsByDirectory: { '/workspace/other': otherCommands } });
    listCommandsImpl = async () => { throw new Error('unavailable'); };
    expect(await useCommandsStore.getState().loadCommands()).toBe(false);
    expect(useCommandsStore.getState().commands).toEqual([]);
    expect(useCommandsStore.getState().commandsByDirectory[activeProjectPath]).toBeUndefined();
    expect(selectCommandsForDirectory(useCommandsStore.getState(), '/workspace/other')).toBe(otherCommands);

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
  });
>>>>>>> bc50ba56a
});
