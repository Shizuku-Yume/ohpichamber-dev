<<<<<<< HEAD
import { afterEach, expect, spyOn, test } from 'bun:test';
import { useSkillsStore } from './useSkillsStore';
||||||| bc50ba56aa
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { McpServerStatus } from '@/lib/opencode/model';
=======
import { beforeEach, describe, expect, test } from 'bun:test';
import type { McpServerStatus } from '@/lib/opencode/model';
import { directoryEnvironment } from './test-support/directoryEnvironment';

const environment = directoryEnvironment({ home: '/home/test' });
>>>>>>> upstream/main

let restoreFetch: () => void = () => {};
afterEach(() => { restoreFetch(); useSkillsStore.getState().resetForRuntimeSwitch(); });

<<<<<<< HEAD
test('a skill workspace resolution from the previous runtime cannot publish native resources', async () => {
  useSkillsStore.getState().resetForRuntimeSwitch();
  const pending = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const paths: string[] = [];
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    const path = new URL(request.url).pathname;
    paths.push(path);
    if (path !== '/api/agent/v1/workspaces/resolve') throw new Error(`Unexpected request ${path}`);
    started.resolve();
    return pending.promise;
||||||| bc50ba56aa
let mcpStatusResponse: Deferred<McpServerStatus[]> = deferred();
const opencodeModule = await import('@/lib/opencode/client');
// Derived from the real client rather than spread from it: the client is a
// class instance, so a spread drops every prototype method the other modules
// loaded in this process call at import time.
// SAFETY: `Object.create` returns `any`; the object delegates to the real
// client for everything the two overrides below do not define.
const opencodeClientStub = Object.create(opencodeModule.opencodeClient) as typeof opencodeModule.opencodeClient;
opencodeClientStub.listMcpServers = () => mcpStatusResponse.promise;
mock.module('@/lib/opencode/client', () => ({ ...opencodeModule, opencodeClient: opencodeClientStub }));

let skillsResponse: Deferred<Response> = deferred();
const runtimeFetchModule = await import('@/lib/runtime-fetch');
mock.module('@/lib/runtime-fetch', () => ({
  ...runtimeFetchModule,
  runtimeFetch: () => skillsResponse.promise,
}));

const { useMcpStore } = await import('./useMcpStore');
const { useSkillsStore } = await import('./useSkillsStore');

const connectedServer = (name: string): McpServerStatus[] => ([
  { name, status: { status: 'connected' } },
]);

describe('instance-scoped stores reject responses from the previous instance', () => {
  beforeEach(() => {
    mcpStatusResponse = deferred();
    skillsResponse = deferred();
    useMcpStore.getState().resetForRuntimeSwitch();
    useSkillsStore.getState().resetForRuntimeSwitch();
  });

  test('an MCP status in flight during a switch does not land in the new instance', async () => {
    const refresh = useMcpStore.getState().refresh({ directory: '/repo', silent: true });

    useMcpStore.getState().resetForRuntimeSwitch();
    mcpStatusResponse.resolve(connectedServer('from-instance-a'));
    await refresh;

    expect(useMcpStore.getState().getStatusForDirectory('/repo')).toEqual({});
  });

  test('an MCP status that arrives with no switch is stored', async () => {
    const refresh = useMcpStore.getState().refresh({ directory: '/repo', silent: true });
    mcpStatusResponse.resolve(connectedServer('server-a'));
    await refresh;

    expect(Object.keys(useMcpStore.getState().getStatusForDirectory('/repo'))).toEqual(['server-a']);
  });

  test('a skills load in flight during a switch does not land in the new instance', async () => {
    const load = useSkillsStore.getState().loadSkills('/repo');

    useSkillsStore.getState().resetForRuntimeSwitch();
    skillsResponse.resolve(new Response(
      JSON.stringify({ skills: [{ name: 'from-instance-a', path: '/repo/.agents/skills/a/SKILL.md' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await load;

    expect(useSkillsStore.getState().skillsByDirectory['/repo']).toBe(undefined);
=======
let mcpStatusResponse: Deferred<McpServerStatus[]> = deferred();
let skillsResponse: Deferred<Response> = deferred();
let mcpStarted = deferred<void>();
let skillsStarted = deferred<void>();
environment.respond(async (url) => {
  if (url.pathname === '/api/mcp') {
    mcpStarted.resolve();
    return Response.json({ data: await mcpStatusResponse.promise });
  }
  if (url.pathname === '/api/config/skills') {
    skillsStarted.resolve();
    return skillsResponse.promise;
  }
  if (url.pathname === '/api/config') return Response.json([]);
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/home/test', chatsRoot: '/home/test/chats' });
  throw new Error(`Unexpected request: ${url}`);
});

const { useMcpStore } = await import('./useMcpStore');
const { useSkillsStore } = await import('./useSkillsStore');

const connectedServer = (name: string): McpServerStatus[] => ([
  { name, status: { status: 'connected' } },
]);

describe('instance-scoped stores reject responses from the previous instance', () => {
  beforeEach(() => {
    mcpStatusResponse = deferred();
    skillsResponse = deferred();
    mcpStarted = deferred();
    skillsStarted = deferred();
    useMcpStore.getState().resetForRuntimeSwitch();
    useSkillsStore.getState().resetForRuntimeSwitch();
  });

  test('an MCP status in flight during a switch does not land in the new instance', async () => {
    const refresh = useMcpStore.getState().refresh({ directory: '/repo', silent: true });
    await mcpStarted.promise;

    useMcpStore.getState().resetForRuntimeSwitch();
    mcpStatusResponse.resolve(connectedServer('from-instance-a'));
    await refresh;

    expect(useMcpStore.getState().getStatusForDirectory('/repo')).toEqual({});
  });

  test('an MCP status that arrives with no switch is stored', async () => {
    const refresh = useMcpStore.getState().refresh({ directory: '/repo', silent: true });
    await mcpStarted.promise;
    mcpStatusResponse.resolve(connectedServer('server-a'));
    await refresh;

    expect(Object.keys(useMcpStore.getState().getStatusForDirectory('/repo'))).toEqual(['server-a']);
  });

  test('a skills load in flight during a switch does not land in the new instance', async () => {
    const load = useSkillsStore.getState().loadSkills('/repo');
    await skillsStarted.promise;

    useSkillsStore.getState().resetForRuntimeSwitch();
    skillsResponse.resolve(new Response(
      JSON.stringify({ skills: [{ name: 'from-instance-a', path: '/repo/.agents/skills/a/SKILL.md' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await load;

    expect(useSkillsStore.getState().skillsByDirectory['/repo']).toBe(undefined);
>>>>>>> upstream/main
  });
  restoreFetch = () => fetchSpy.mockRestore();
  const load = useSkillsStore.getState().loadSkills('/repo');
  await started.promise;
  useSkillsStore.getState().resetForRuntimeSwitch();
  pending.resolve(Response.json({ workspaceId: 'old_workspace', projectId: 'old_project', name: 'Old workspace' }));
  expect(await load).toBe(false);
  expect(useSkillsStore.getState().skillsByDirectory['/repo']).toBeUndefined();
  expect(paths).toEqual(['/api/agent/v1/workspaces/resolve']);
});
