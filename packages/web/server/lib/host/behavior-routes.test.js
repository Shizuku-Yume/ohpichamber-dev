import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rename, unlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerBehaviorRoutes, resolveGlobalAgentsPath } from './behavior-routes.js';

/** Minimal Express-shaped app that records the two handlers this module adds. */
const createApp = () => {
  const handlers = new Map();
  return {
    app: {
      get: (route, handler) => handlers.set(`GET ${route}`, handler),
      put: (route, handler) => handlers.set(`PUT ${route}`, handler),
    },
    handlers,
  };
};

const createResponse = () => {
  const result = { status: 200, body: undefined, headers: {} };
  const response = {
    setHeader: (name, value) => { result.headers[name] = value; },
    status(code) { result.status = code; return response; },
    json(body) { result.body = body; return response; },
  };
  return { response, result };
};

const invoke = async (handler, request) => {
  const { response, result } = createResponse();
  await handler(request, response);
  return result;
};

const setup = async (workspaces = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openchamber-behavior-'));
  const agentDirectory = path.join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  const projectDirectory = path.join(root, 'project');
  await mkdir(agentDirectory, { recursive: true });
  await mkdir(projectDirectory, { recursive: true });
  const { app, handlers } = createApp();
  registerBehaviorRoutes(app, {
    fsPromises: { readFile, writeFile, mkdir, rename, unlink },
    os: { homedir: () => root },
    resolveWorkspaceDirectory: async (directory) => (directory === projectDirectory ? { cwd: projectDirectory } : null),
  });
  return {
    root,
    agentDirectory,
    projectDirectory,
    handlers,
    globalFile: path.join(agentDirectory, 'AGENTS.md'),
    cleanup: async () => { delete process.env.PI_CODING_AGENT_DIR; await rm(root, { recursive: true, force: true }); },
    ...workspaces,
  };
};

describe('behavior rules routes', () => {
  it('resolves the global file inside OMP\'s agent directory', () => {
    expect(resolveGlobalAgentsPath({ os: { homedir: () => '/home/user' }, env: {} }))
      .toBe('/home/user/.omp/agent/AGENTS.md');
    expect(resolveGlobalAgentsPath({ os: { homedir: () => '/home/user' }, env: { PI_CODING_AGENT_DIR: '/custom/agent' } }))
      .toBe('/custom/agent/AGENTS.md');
    // An explicit agent directory outranks the relocated config root.
    expect(resolveGlobalAgentsPath({ os: { homedir: () => '/home/user' }, env: { PI_CONFIG_DIR: '.omp-alt', PI_CODING_AGENT_DIR: '/custom/agent' } }))
      .toBe('/custom/agent/AGENTS.md');
    expect(resolveGlobalAgentsPath({ os: { homedir: () => '/home/user' }, env: { PI_CONFIG_DIR: '.omp-alt' } }))
      .toBe('/home/user/.omp-alt/agent/AGENTS.md');
    // An absolute config root is used as-is, not joined onto home.
    expect(resolveGlobalAgentsPath({ os: { homedir: () => '/home/user' }, env: { PI_CONFIG_DIR: '/srv/omp-iso' } }))
      .toBe('/srv/omp-iso/agent/AGENTS.md');
  });

  it('reports a missing global file without creating it', async () => {
    const context = await setup();
    try {
      const result = await invoke(context.handlers.get('GET /api/behavior/agents-md'), { query: { scope: 'global' }, body: {} });
      expect(result.body).toEqual({ content: '', exists: false });
    } finally {
      await context.cleanup();
    }
  });

  it('writes the global file and then reads it back', async () => {
    const context = await setup();
    try {
      const put = context.handlers.get('PUT /api/behavior/agents-md');
      const written = await invoke(put, { query: { scope: 'global' }, body: { content: 'Global rules', expectedContent: null } });
      expect(written.status).toBe(200);
      expect(await readFile(context.globalFile, 'utf8')).toBe('Global rules');

      const read = await invoke(context.handlers.get('GET /api/behavior/agents-md'), { query: { scope: 'global' }, body: {} });
      expect(read.body).toEqual({ content: 'Global rules', exists: true });
    } finally {
      await context.cleanup();
    }
  });

  it('refuses to overwrite a file edited since it was loaded', async () => {
    const context = await setup();
    try {
      await writeFile(context.globalFile, 'changed elsewhere', 'utf8');
      const put = context.handlers.get('PUT /api/behavior/agents-md');
      const result = await invoke(put, { query: { scope: 'global' }, body: { content: 'mine', expectedContent: null } });
      expect(result.status).toBe(409);
      expect(result.body.code).toBe('AGENTS_MD_CONFLICT');
      expect(await readFile(context.globalFile, 'utf8')).toBe('changed elsewhere');
    } finally {
      await context.cleanup();
    }
  });

  it('edits the project file for an authorized workspace only', async () => {
    const context = await setup();
    try {
      const put = context.handlers.get('PUT /api/behavior/agents-md');
      const denied = await invoke(put, { query: { scope: 'project', directory: '/not/authorized' }, body: { content: 'x' } });
      expect(denied.status).toBe(403);

      const written = await invoke(put, { query: { scope: 'project', directory: context.projectDirectory }, body: { content: 'Project rules' } });
      expect(written.status).toBe(200);
      expect(await readFile(path.join(context.projectDirectory, 'AGENTS.md'), 'utf8')).toBe('Project rules');
    } finally {
      await context.cleanup();
    }
  });

  it('rejects an unknown scope and a non-string body', async () => {
    const context = await setup();
    try {
      const put = context.handlers.get('PUT /api/behavior/agents-md');
      expect((await invoke(put, { query: { scope: 'session' }, body: { content: 'x' } })).status).toBe(400);
      expect((await invoke(put, { query: { scope: 'global' }, body: { content: 1 } })).status).toBe(400);
    } finally {
      await context.cleanup();
    }
  });
});
