import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CommandCreateRequestSchema, CommandUpdateRequestSchema, type CommandCatalogState, type CommandEntry } from '@openchamber/agent-contract';
import { useCommandsStore, invalidateCommandsLoadCache, selectCommandsForDirectory } from './useCommandsStore';

const command: CommandEntry = {
  commandId: 'command_1', name: 'team/review', description: 'Review', content: '\n# Review\n\n$ARGUMENTS\n',
  scope: 'workspace', source: 'project', editable: true, group: 'team', argumentHint: '<files>',
  agentId: 'agent_review', modelSelection: { providerId: 'provider_a', modelId: 'model_a' },
};
let catalog: CommandCatalogState;
let requests: Request[];
let failRead = false;
let conflict = false;
let delayedRead: Promise<CommandCatalogState> | null = null;
let restoreFetch: () => void = () => {};
let onRead: () => void = () => {};

beforeEach(() => {
  useCommandsStore.getState().resetForRuntimeSwitch();
  catalog = { workspaceId: 'workspace_1', revision: '1', commands: [command] };
  requests = []; failRead = false; conflict = false; delayedRead = null; onRead = () => {};
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace' });
    if (path === '/api/agent/v1/workspaces/workspace_1/commands' && request.method === 'GET') {
      onRead();
      if (failRead) return new Response('unavailable', { status: 503 });
      return Response.json(delayedRead ? await delayedRead : catalog);
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
    if (request.method === 'PATCH' && path.endsWith('/commands/command_1')) {
      const input = CommandUpdateRequestSchema.parse(await request.json());
      expect(input.expectedRevision).toBe(catalog.revision);
      catalog = { ...catalog, revision: String(BigInt(catalog.revision) + 1n), commands: [{ ...command, name: input.name, description: input.description ?? '', content: input.content, agentId: input.agentId, modelSelection: input.modelSelection, group: input.group, argumentHint: input.argumentHint }] };
      return Response.json(catalog);
    }
    if (request.method === 'DELETE' && path.endsWith('/commands/command_1')) {
      expect(await request.json()).toEqual({ commandId: 'command_1', expectedRevision: catalog.revision });
      catalog = { ...catalog, revision: String(BigInt(catalog.revision) + 1n), commands: [] };
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
  test('writes exact Markdown, CAS and canonical metadata without legacy bindings', async () => {
    const content = '\n  ## Heading\n\n```ts\nconst value = 1;\n```\n';
    expect(await useCommandsStore.getState().updateCommand(command.name, { content }, '/repo')).toBe(true);
    const input = CommandUpdateRequestSchema.parse(await requests.find(request => request.method === 'PATCH')?.json());
    expect(input.content).toBe(content);
    expect(input.agentId).toBe(command.agentId);
    expect(input.modelSelection).toEqual(command.modelSelection);
    expect(input.group).toBe('team');
    expect(input.argumentHint).toBe('<files>');
    expect(await useCommandsStore.getState().updateCommand(command.name, { agentId: undefined, modelSelection: undefined }, '/repo')).toBe(true);
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
    finish({ workspaceId: 'workspace_1', revision: '1', commands: [command] });
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
});
