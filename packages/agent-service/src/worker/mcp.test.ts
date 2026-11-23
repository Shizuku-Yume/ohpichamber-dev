import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readNativeMcpConfigurationIfPresent,
  writeNativeMcpConfiguration,
  NativeMcpError,
  WorkerMcp,
} from './mcp.ts';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import { MCP_OAUTH_LOOPBACK_CALLBACK_PORT, MCP_OAUTH_LOOPBACK_REDIRECT_URI, ProblemCodeSchema } from '@openchamber/agent-contract';
import type { MCPConfigurationState } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import { operationErrorDetail, WorkerReplySchema } from '../protocol.ts';

describe('MCP configuration management and unmanaged projection', () => {
  test('returns null when configuration file is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      const result = await readNativeMcpConfigurationIfPresent(configPath, 'workspace-1');
      expect(result).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('projects hand-written unmanaged mcp.json read-only with redacted secrets and sanitized paths/urls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      const unmanagedContent = JSON.stringify({
        mcpServers: {
          'local-tool': {
            type: 'stdio',
            command: '/usr/local/bin/custom-mcp',
            args: ['--debug', '--port', '8080'],
            env: {
              API_KEY: 'super-secret-key-123',
              TOKEN: 'bearer-secret',
            },
          },
          'remote-tool': {
            type: 'sse',
            url: 'https://admin:secret123@mcp.example.com/events?token=sensitive-query#frag',
            headers: {
              Authorization: 'Bearer top-secret-token',
              'X-Custom-Secret': 'confidential',
            },
          },
        },
        disabledServers: ['remote-tool'],
      }, null, 2);

      await writeFile(configPath, unmanagedContent, 'utf8');

      const projected = await readNativeMcpConfigurationIfPresent(configPath, 'workspace-1');
      expect(projected).not.toBeNull();
      expect(projected?.workspaceId).toBe('workspace-1');
      expect(projected?.persistedRevision).toBe('0');

      const servers = projected!.config.servers;
      expect(servers).toHaveLength(2);

      const local = servers.find(s => s.serverId === 'local-tool');
      expect(local).toBeDefined();
      expect(local?.managed).toBe(false);
      expect(local?.enabled).toBe(true);
      expect(local?.label).toBe('local-tool');
      expect(local?.transport.type).toBe('stdio');
      if (local?.transport.type === 'stdio') {
        expect(local.transport.command).toBe('custom-mcp');
        expect(local.transport.args).toEqual(['--debug', '--port', '8080']);
        expect(local.transport.envCredentialRefs).toBeUndefined();
      }

      const remote = servers.find(s => s.serverId === 'remote-tool');
      expect(remote).toBeDefined();
      expect(remote?.managed).toBe(false);
      expect(remote?.enabled).toBe(false);
      expect(remote?.transport.type).toBe('sse');
      if (remote?.transport.type === 'sse') {
        expect(remote.transport.url).toBe('https://mcp.example.com/events');
        expect(remote.transport.credentialRef).toBeUndefined();
        expect(remote.transport.headerCredentialRefs).toBeUndefined();
      }

      // Assert no secret substrings leaked in serialized projection
      const serialized = JSON.stringify(projected);
      expect(serialized).not.toContain('super-secret-key-123');
      expect(serialized).not.toContain('bearer-secret');
      expect(serialized).not.toContain('secret123');
      expect(serialized).not.toContain('sensitive-query');
      expect(serialized).not.toContain('top-secret-token');
      expect(serialized).not.toContain('confidential');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('refuses in-place mutation of unmanaged file, preserving exact bytes on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      const unmanagedRaw = JSON.stringify({
        mcpServers: {
          sqlite: {
            command: 'uvx',
            args: ['mcp-server-sqlite'],
            env: { DB_PASS: 'raw-secret' },
          },
        },
      }, null, 2);

      await writeFile(configPath, unmanagedRaw, 'utf8');

      const mutationAttempt: MCPConfigurationState = {
        workspaceId: 'workspace-1',
        persistedRevision: '1',
        config: {
          servers: [
            {
              serverId: 'sqlite',
              label: 'sqlite',
              enabled: true,
              transport: {
                type: 'stdio',
                command: 'uvx',
                args: ['mcp-server-sqlite'],
              },
            },
          ],
        },
      };

      await expect(writeNativeMcpConfiguration(configPath, mutationAttempt))
        .rejects
        .toThrow(NativeMcpError);

      try {
        await writeNativeMcpConfiguration(configPath, mutationAttempt);
      } catch (error) {
        expect(error).toBeInstanceOf(NativeMcpError);
        expect((error as NativeMcpError).code).toBe('CATALOG_CONFLICT');
      }

      // File on disk must be identical byte-for-byte
      const preservedBytes = await readFile(configPath, 'utf8');
      expect(preservedBytes).toBe(unmanagedRaw);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('writes and reads managed configuration correctly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      const managedState: MCPConfigurationState = {
        workspaceId: 'workspace-1',
        persistedRevision: '1',
        config: {
          servers: [
            {
              serverId: 'server-one',
              label: 'Server One',
              enabled: true,
              scope: 'project' as const,
              transport: {
                type: 'stdio',
                command: 'node',
                args: ['server.js'],
              },
            },
          ],
        },
      };

      const committed = await writeNativeMcpConfiguration(configPath, managedState);
      expect(committed).toEqual(managedState);

      const readBack = await readNativeMcpConfigurationIfPresent(configPath, 'workspace-1');
      expect(readBack).toEqual(managedState);

      // Mutating managed state succeeds
      const updatedState: MCPConfigurationState = {
        ...managedState,
        persistedRevision: '2',
        config: {
          servers: [
            {
              ...managedState.config.servers[0]!,
              label: 'Updated Label',
            },
          ],
        },
      };
      const updated = await writeNativeMcpConfiguration(configPath, updatedState);
      expect(updated).toEqual(updatedState);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails closed with MCP_CONFIG_READ_FAILED on malformed JSON or unreadable file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      await writeFile(configPath, '{ not valid json', 'utf8');

      await expect(readNativeMcpConfigurationIfPresent(configPath, 'workspace-1'))
        .rejects
        .toThrow(NativeMcpError);

      try {
        await readNativeMcpConfigurationIfPresent(configPath, 'workspace-1');
      } catch (error) {
        expect(error).toBeInstanceOf(NativeMcpError);
        expect((error as NativeMcpError).code).toBe('MCP_CONFIG_READ_FAILED');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('skips non-object server entries without dropping valid servers and handles odd field types leniently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      await writeFile(configPath, JSON.stringify({
        mcpServers: {
          'local-tool': {
            type: 'stdio',
            command: 'uvx',
            args: ['mcp-server-sqlite'],
          },
          'broken-null': null,
          'broken-string': 'not-an-object',
          'broken-array': ['not', 'an', 'object'],
          'lenient-numeric-cmd': {
            command: 123,
          },
          'lenient-odd-fields': {
            name: null,
            command: 'node',
            args: ['--port', 8080, 'server.js'],
            enabled: 'true',
          },
          'remote-tool': {
            type: 'http',
            url: 'https://mcp.example.com/api',
          },
        },
      }), 'utf8');

      const projected = await readNativeMcpConfigurationIfPresent(configPath, 'workspace-1');
      expect(projected).not.toBeNull();
      const servers = projected!.config.servers;
      expect(servers.map(server => server.serverId)).toEqual([
        'local-tool',
        'lenient-numeric-cmd',
        'lenient-odd-fields',
        'remote-tool',
      ]);

      const numericCmd = servers.find(server => server.serverId === 'lenient-numeric-cmd');
      expect(numericCmd?.transport).toEqual({
        type: 'stdio',
        command: 'stdio-server',
        args: [],
      });

      const oddFields = servers.find(server => server.serverId === 'lenient-odd-fields');
      expect(oddFields?.label).toBe('lenient-odd-fields');
      expect(oddFields?.enabled).toBe(true);
      expect(oddFields?.transport).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['--port', 'server.js'],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails closed with MCP_CONFIG_READ_FAILED when unmanaged file is wholly non-object', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    try {
      const configPath = join(dir, 'mcp.json');
      await writeFile(configPath, '[]', 'utf8');

      await expect(readNativeMcpConfigurationIfPresent(configPath, 'workspace-1'))
        .rejects
        .toMatchObject({ code: 'MCP_CONFIG_READ_FAILED' });

      await writeFile(configPath, JSON.stringify({ mcpServers: [] }), 'utf8');
      await expect(readNativeMcpConfigurationIfPresent(configPath, 'workspace-1'))
        .rejects
        .toMatchObject({ code: 'MCP_CONFIG_READ_FAILED' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('scope round-trip: writes user scope to userConfigPath in OMP format and project scope to projectConfigPath', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-scope-test-'));
    try {
      const projectPath = join(dir, 'project-mcp.json');
      const userPath = join(dir, 'user-mcp.json');

      const state: MCPConfigurationState = {
        workspaceId: 'workspace-1',
        persistedRevision: '1',
        config: {
          servers: [
            {
              serverId: 'proj-server',
              label: 'Project Server',
              enabled: true,
              scope: 'project',
              transport: { type: 'stdio', command: 'node', args: ['proj.js'] },
            },
            {
              serverId: 'user-server',
              label: 'User Server',
              enabled: true,
              scope: 'user',
              transport: { type: 'http', url: 'https://user-mcp.example/api' },
            },
          ],
        },
      };

      await writeNativeMcpConfiguration(projectPath, state, userPath);

      // Check project file content
      const projectRaw = JSON.parse(await readFile(projectPath, 'utf8'));
      expect(projectRaw.openchamber).toBeDefined();
      expect(projectRaw.mcpServers['proj-server']).toBeDefined();
      expect(projectRaw.mcpServers['user-server']).toBeUndefined();

      // The user file keeps OMP's native entry untouched. OpenChamber's own
      // references live under the `openchamber` key OMP ignores — the same
      // place credentials already lived — because a native entry cannot carry a
      // display label or the managed flag.
      const userRaw = JSON.parse(await readFile(userPath, 'utf8'));
      expect(userRaw.mcpServers['user-server']).toEqual({ type: 'http', url: 'https://user-mcp.example/api', enabled: true });
      expect(userRaw.mcpServers['proj-server']).toBeUndefined();
      expect(userRaw.openchamber.credentials).toBeUndefined();

      // Read back with both paths
      const readBack = await readNativeMcpConfigurationIfPresent(projectPath, 'workspace-1', userPath);
      expect(readBack).not.toBeNull();
      expect(readBack?.config.servers).toHaveLength(2);

      const projRead = readBack?.config.servers.find(s => s.serverId === 'proj-server');
      expect(projRead?.scope).toBe('project');

      const userRead = readBack?.config.servers.find(s => s.serverId === 'user-server');
      expect(userRead?.scope).toBe('user');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('user-scope MCP storage in a temp HOME keeps native entries and credentials', () => {
  const workspaceId = 'workspace-1';
  async function withHome(run: (paths: { home: string; userPath: string; projectPath: string }) => Promise<void>): Promise<void> {
    const home = await mkdtemp(join(tmpdir(), 'mcp-home-'));
    try {
      const userPath = join(home, '.omp', 'agent', 'mcp.json');
      await mkdir(join(home, '.omp', 'agent'), { recursive: true });
      await run({ home, userPath, projectPath: join(home, 'project', '.omp', 'mcp.json') });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }

  test('identity and credential edits preserve OMP 19.1 native fields', async () => {
    await withHome(async ({ userPath, projectPath }) => {
      const seeded = {
        $schema: 'https://example.test/mcp.schema.json',
        mcpServers: {
          local: { command: '/opt/private/bin/tool', args: ['serve'], env: { API_KEY: 'secret-123', PATH_VAR: '${FOO}', CMD: '!echo hi' }, cwd: '/home/someone/private', timeout: 45000, requestIdFormat: 'string', instructions: false },
          remote: { type: 'http', url: 'https://mcp.example/x?team=eng&token=qtok', headers: { Authorization: 'Bearer hdr-secret' }, oauth: { clientId: 'c', clientSecret: 'oauth-secret' }, auth: { type: 'apikey', clientSecret: 'auth-secret' } },
        },
        enabledServers: ['local', 'remote'], disabledServers: [],
      };
      await writeFile(userPath, JSON.stringify(seeded), 'utf8');
      const read = async () => {
        const state = await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath);
        if (!state) throw new Error('Missing configuration');
        for (const value of ['secret-123', '${FOO}', '!echo', '/opt/private', '/home/someone', 'qtok', 'team=eng', 'hdr-secret', 'oauth-secret', 'auth-secret']) expect(JSON.stringify(state)).not.toContain(value);
        return state;
      };
      let state = await read();
      for (const operation of ['label', 'enabled', 'credentials', 'project']) {
        state.config.servers = state.config.servers.map(server => {
          if (operation === 'label') return { ...server, label: 'Renamed' };
          if (operation === 'enabled') return { ...server, enabled: false };
          if (operation === 'credentials') return { ...server, transport: server.transport.type === 'stdio'
            ? { ...server.transport, envCredentialRefs: { EXTRA: 'credential.env' } }
            : { ...server.transport, headerCredentialRefs: { 'X-Extra': 'credential.header' } } };
          return server;
        });
        if (operation === 'project') state.config.servers.push({ serverId: 'project', label: 'Project', enabled: true, scope: 'project', transport: { type: 'stdio', command: 'node', args: [] } });
        await writeNativeMcpConfiguration(projectPath, state, userPath);
        const stored = JSON.parse(await readFile(userPath, 'utf8'));
        for (const key of ['local', 'remote'] as const) {
          const { enabled: _enabled, ...native } = stored.mcpServers[key];
          expect(native).toEqual(seeded.mcpServers[key]);
        }
        expect(stored.enabledServers).toEqual(seeded.enabledServers);
        expect(stored.$schema).toBe(seeded.$schema);
        if (operation === 'label') expect(stored.mcpServers).toEqual(seeded.mcpServers);
        state = await read();
        expect(state.config.servers.filter(server => server.scope === 'user').every(server => server.label === 'Renamed')).toBe(true);
      }
    });
  });

  test('a project save leaves the pre-seeded user mcp.json byte-identical', async () => {
    await withHome(async ({ userPath, projectPath }) => {
      const seeded = `${JSON.stringify({
        mcpServers: {
          'native-http': { type: 'http', url: 'https://native.example/mcp', headers: { 'X-Key': 'raw-header' }, auth: { type: 'apikey' } },
          'native-stdio': { command: 'uvx', args: ['mcp-x'], env: { TOKEN: 'raw-env' } },
        },
        enabledServers: ['native-stdio'],
      }, null, 2)}\n`;
      await writeFile(userPath, seeded, 'utf8');
      const visible = await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath);
      if (!visible) throw new Error('seeded configuration must be readable');
      expect(visible.config.servers.map(server => server.serverId).sort()).toEqual(['native-http', 'native-stdio']);
      const project = { serverId: 'proj-only', label: 'Project only', enabled: true, scope: 'project' as const, transport: { type: 'stdio' as const, command: 'node', args: ['p.js'] } };
      await writeNativeMcpConfiguration(projectPath, { workspaceId, persistedRevision: '1', config: { servers: [...visible.config.servers, project] } }, userPath);
      expect(await readFile(userPath, 'utf8')).toBe(seeded);
    });
  });

  test('a global server shadowed by a project server survives, and a user edit keeps native fields', async () => {
    await withHome(async ({ userPath, projectPath }) => {
      const seeded = `${JSON.stringify({
        mcpServers: {
          shadowed: { type: 'http', url: 'https://global.example/mcp', headers: { 'X-Key': 'raw' } },
          'native-stdio': { command: 'uvx', args: ['mcp-x'], env: { TOKEN: 'raw-env' } },
        },
        enabledServers: ['native-stdio'],
      }, null, 2)}\n`;
      const shadowing = { serverId: 'shadowed', label: 'Project shadow', enabled: true, scope: 'project' as const, transport: { type: 'stdio' as const, command: 'proj', args: [] } };
      await writeNativeMcpConfiguration(projectPath, { workspaceId, persistedRevision: '1', config: { servers: [shadowing] } }, userPath);
      await writeFile(userPath, seeded, 'utf8');
      expect(await readFile(userPath, 'utf8')).toBe(seeded);

      const read = await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath);
      if (!read) throw new Error('configuration must be readable');
      expect(read.config.servers.map(server => server.serverId).sort()).toEqual(['native-stdio', 'shadowed']);
      await writeNativeMcpConfiguration(projectPath, {
        workspaceId,
        persistedRevision: '2',
        config: { servers: read.config.servers.map(server => server.serverId === 'native-stdio' ? { ...server, enabled: false } : server) },
      }, userPath);

      const userRaw = JSON.parse(await readFile(userPath, 'utf8'));
      expect(userRaw.mcpServers.shadowed).toEqual({ type: 'http', url: 'https://global.example/mcp', headers: { 'X-Key': 'raw' } });
      expect(userRaw.mcpServers['native-stdio'].env).toEqual({ TOKEN: 'raw-env' });
      expect(userRaw.enabledServers).toEqual(['native-stdio']);
      expect(userRaw.disabledServers).toEqual(['native-stdio']);
    });
  });

  test('adding a project server that shadows a pre-existing global server does not delete the global server', async () => {
    await withHome(async ({ userPath, projectPath }) => {
      const seeded = `${JSON.stringify({
        mcpServers: {
          figma: { type: 'http', url: 'https://global.figma/mcp', headers: { 'X-Key': 'global-token' } },
        },
      }, null, 2)}\n`;
      await writeFile(userPath, seeded, 'utf8');

      // Add a project-scoped server named 'figma' to a fresh project file
      const projectServer = { serverId: 'figma', label: 'Project Figma', enabled: true, scope: 'project' as const, transport: { type: 'http' as const, url: 'https://project.figma/mcp' } };
      await writeNativeMcpConfiguration(projectPath, { workspaceId, persistedRevision: '1', config: { servers: [projectServer] } }, userPath);

      // Global server in userPath must survive intact
      const userRaw = JSON.parse(await readFile(userPath, 'utf8'));
      expect(userRaw.mcpServers.figma).toEqual({ type: 'http', url: 'https://global.figma/mcp', headers: { 'X-Key': 'global-token' } });
    });
  });

  test('a committed user-scope server reads back as the same server the Host authorized', async () => {
    await withHome(async ({ userPath, projectPath }) => {
      // The marketplace install commits this exact shape: a managed entry with a
      // display label and no secret. The Host authorizes `mcp-server` requests by
      // deep-comparing the requested server with its projection of this file, so a
      // reread that invented a different label or managed flag made every
      // user-scope server refuse with "The MCP server is not in the workspace
      // configuration" while Settings → MCP still listed it.
      const committed = {
        serverId: 'deepwiki', label: 'DeepWiki', enabled: true, scope: 'user' as const,
        transport: { type: 'http' as const, url: 'https://mcp.deepwiki.com/mcp' },
      };
      const state = { workspaceId, persistedRevision: '1', config: { servers: [committed] } };
      await writeNativeMcpConfiguration(projectPath, state, userPath);

      const reread = await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath);
      expect(reread?.config.servers).toEqual([committed]);

      // A second commit must not churn the file it just wrote.
      await writeNativeMcpConfiguration(projectPath, state, userPath);
      expect((await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath))?.config.servers).toEqual([committed]);

      // The native entry stays OMP's format: no OpenChamber identity leaks into it.
      const userRaw = JSON.parse(await readFile(userPath, 'utf8'));
      expect(userRaw.mcpServers.deepwiki).toEqual({ type: 'http', url: 'https://mcp.deepwiki.com/mcp', enabled: true });
    });
  });

  test('user-scope credential references survive a reread and a second session', async () => {
    await withHome(async ({ userPath, projectPath }) => {
      const httpTransport = { type: 'http' as const, url: 'https://mcp.figma.example/mcp', credentialRef: 'credential-figma', headerCredentialRefs: { 'X-Team': 'credential-team' } };
      const stdioTransport = { type: 'stdio' as const, command: 'node', args: ['s.js'], envCredentialRefs: { TOKEN: 'credential-token' } };
      const state = {
        workspaceId,
        persistedRevision: '1',
        config: {
          servers: [
            { serverId: 'figma', label: 'Figma', enabled: true, scope: 'user' as const, transport: httpTransport },
            { serverId: 'local-env', label: 'Local env', enabled: true, scope: 'user' as const, transport: stdioTransport },
          ]
        },
      };
      await writeNativeMcpConfiguration(projectPath, state, userPath);
      const userRaw = await readFile(userPath, 'utf8');
      expect(userRaw).not.toContain('secret');
      const first = await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath);
      const second = await readNativeMcpConfigurationIfPresent(projectPath, workspaceId, userPath);
      expect(second).toEqual(first);
      expect(first?.config.servers.find(server => server.serverId === 'figma')?.transport).toEqual(httpTransport);
      expect(first?.config.servers.find(server => server.serverId === 'local-env')?.transport).toEqual(stdioTransport);
    });
  });
});

describe('user-scope OAuth through WorkerMcp on real files', () => {
  test('oauth status and disconnect read the user-scope server from userConfigPath', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mcp-oauth-home-'));
    try {
      const agentDir = join(home, '.omp', 'agent');
      const projectDir = join(home, 'project');
      await mkdir(agentDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      const userPath = join(agentDir, 'mcp.json');
      const projectPath = join(projectDir, '.omp', 'mcp.json');
      await writeFile(userPath, `${JSON.stringify({
        mcpServers: { figma: { type: 'http', url: 'https://mcp.figma.example/mcp' } },
      }, null, 2)}\n`, 'utf8');
      const configuration = await readNativeMcpConfigurationIfPresent(projectPath, 'workspace-1', userPath);
      if (!configuration) throw new Error('user-scope server must be readable');
      expect(configuration.config.servers.map(server => server.serverId)).toEqual(['figma']);

      const authStorage = await discoverAuthStorage(agentDir, { cwd: projectDir });
      const mcp = new WorkerMcp({
        cwd: projectDir,
        configPath: projectPath,
        userConfigPath: userPath,
        worker: { rootSessionId: 'root-1', workspaceId: 'workspace-1', workerGeneration: 'generation-1' },
        authStorage,
        resolveCredentialRef: async reference => reference,
        resolveCommand: async command => command.command,
        authorizeServer: async () => { },
        authorizeOAuth: async () => { },
        sanitizeTool: tool => tool,
        onCatalog: () => { },
        onRuntimeFailure: () => { },
        isCurrent: () => true,
      });
      const status = await mcp.oauthRead('figma', configuration);
      expect(status).toMatchObject({ serverId: 'figma', status: 'unauthenticated', authenticated: false });
      const disconnected = await mcp.oauthExecute('figma', { action: 'disconnect', persistedRevision: configuration.persistedRevision, workerGeneration: 'generation-1' }, configuration);
      expect(disconnected).toMatchObject({ serverId: 'figma', status: 'unauthenticated' });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('MCP OAuth failure pass-through through WorkerMcp', () => {
  /** A loopback authorization server: the MCP endpoint challenges anonymously,
   * protected-resource metadata names this origin as the issuer, and dynamic
   * client registration is either closed (`unapproved_client`) or open. */
  function oauthStub(registration: 'reject' | 'issue', token: 'ok' | 'fail' = 'ok') {
    let base = '';
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/mcp') {
          return new Response('unauthorized', {
            status: 401,
            headers: { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` },
          });
        }
        if (url.pathname === '/.well-known/oauth-protected-resource') {
          return Response.json({ resource: `${base}/mcp`, authorization_servers: [base] });
        }
        if (url.pathname === '/.well-known/oauth-authorization-server') {
          return Response.json({
            issuer: base,
            authorization_endpoint: `${base}/authorize`,
            token_endpoint: `${base}/token`,
            registration_endpoint: `${base}/register`,
          });
        }
        if (url.pathname === '/register' && request.method === 'POST') {
          return registration === 'reject'
            ? new Response('unapproved_client', { status: 403 })
            : Response.json({ client_id: 'stub-client' });
        }
        if (url.pathname === '/authorize') return new Response('consent', { status: 200 });
        if (url.pathname === '/token' && request.method === 'POST') {
          return token === 'fail'
            ? new Response('invalid_grant: code expired', { status: 400 })
            : Response.json({ access_token: 'stub-access', refresh_token: 'stub-refresh', expires_in: 3600 });
        }
        return new Response('not found', { status: 404 });
      },
    });
    base = `http://127.0.0.1:${server.port}`;
    return { server, base };
  }

  async function withOAuthWorker(
    registration: 'reject' | 'issue',
    run: (fixture: { mcp: WorkerMcp; configuration: MCPConfigurationState; base: string }) => Promise<void>,
    token: 'ok' | 'fail' = 'ok',
  ): Promise<void> {
    const home = await mkdtemp(join(tmpdir(), 'mcp-oauth-flow-'));
    const stub = oauthStub(registration, token);
    try {
      const agentDir = join(home, '.omp', 'agent');
      const projectDir = join(home, 'project');
      await mkdir(agentDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      const userPath = join(agentDir, 'mcp.json');
      const projectPath = join(projectDir, '.omp', 'mcp.json');
      await writeFile(userPath, `${JSON.stringify({
        mcpServers: { linear: { type: 'http', url: `${stub.base}/mcp` } },
      }, null, 2)}\n`, 'utf8');
      const configuration = await readNativeMcpConfigurationIfPresent(projectPath, 'workspace-1', userPath);
      if (!configuration) throw new Error('user-scope server must be readable');
      const authStorage = await discoverAuthStorage(agentDir, { cwd: projectDir });
      const mcp = new WorkerMcp({
        cwd: projectDir,
        configPath: projectPath,
        userConfigPath: userPath,
        worker: { rootSessionId: 'root-1', workspaceId: 'workspace-1', workerGeneration: 'generation-1' },
        authStorage,
        resolveCredentialRef: async reference => reference,
        resolveCommand: async command => command.command,
        authorizeServer: async () => { },
        authorizeOAuth: async () => { },
        sanitizeTool: tool => tool,
        onCatalog: () => { },
        onRuntimeFailure: () => { },
        isCurrent: () => true,
      });
      await run({ mcp, configuration, base: stub.base });
    } finally {
      stub.server.stop(true);
      await rm(home, { recursive: true, force: true });
    }
  }

  /** Attach the rejection handler at creation: a flow call can settle while the
   * test is still awaiting the next action, and an unobserved rejection reads as
   * a crash rather than the code under test. */
  function outcome<T>(promise: Promise<T>): Promise<{ value: T } | { error: unknown }> {
    return promise.then(value => ({ value }), error => ({ error }));
  }

  const owner = { persistedRevision: '0', workerGeneration: 'generation-1' };

  /** The flow settles off the request path, so a poll can still observe the
   * pending flow right after the browser answered. Poll the way the panel does,
   * with a bounded wait so a hang fails the test instead of stalling it. */
  async function settledRead(mcp: WorkerMcp, configuration: MCPConfigurationState) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await mcp.oauthRead('linear', configuration);
      if (result.status !== 'pending') return result;
      await Bun.sleep(10);
    }
    throw new Error('The OAuth flow never settled');
  }

  test('a closed dynamic client registration keeps the provider message and a stable code', async () => {
    await withOAuthWorker('reject', async ({ mcp, configuration, base }) => {
      const rejection = await outcome(mcp.oauthExecute('linear', { action: 'start', ...owner }, configuration));
      if (!('error' in rejection)) throw new Error('A rejected registration must not produce a pending flow');
      if (!(rejection.error instanceof NativeMcpError)) throw rejection.error;
      expect(rejection.error.code).toBe('MCP_OAUTH_CLIENT_REGISTRATION_REJECTED');
      // The panel pre-fills its client-ID field from this sentence, which names
      // the endpoint, the status and the provider's own payload: an opaque
      // "MCP OAuth authentication failed." would erase all three.
      expect(rejection.error.message).toContain('dynamic client registration was rejected');
      expect(rejection.error.message).toContain('unapproved_client');
      expect(rejection.error.message).toContain(`${base}/register`);
      expect(rejection.error.message).toContain('oauth.clientId');

      // The sentence must survive the worker wire, not only this call: the
      // panel reads the problem detail, so the send-site bound has to admit an
      // MCP OAuth cause whole while it still trims every other code.
      const code = ProblemCodeSchema.parse(rejection.error.code);
      const detail = operationErrorDetail(code, rejection.error.message);
      expect(detail).toBe(rejection.error.message);
      expect(detail).toContain('oauth.clientId');
      expect(WorkerReplySchema.safeParse({
        type: 'operation.error', workerGeneration: 'generation-1', commandId: 'command-1',
        code, status: 422, detail,
      }).success).toBe(true);
      const other = 'x'.repeat(2_000);
      expect(operationErrorDetail('MCP_APPLY_FAILED', other)).toBe('x'.repeat(200));
      expect(WorkerReplySchema.safeParse({
        type: 'operation.error', workerGeneration: 'generation-1', commandId: 'command-1',
        code: 'MCP_APPLY_FAILED', status: 503, detail: operationErrorDetail('MCP_APPLY_FAILED', other),
      }).success).toBe(true);
    });
  });

  test('a second start while pending reports in-progress and cancel reports cancellation', async () => {
    await withOAuthWorker('issue', async ({ mcp, configuration, base }) => {
      const started = await mcp.oauthExecute('linear', { action: 'start', ...owner }, configuration);
      if (started.status !== 'pending') throw new Error(`expected a pending flow, received ${started.status}`);
      const flow = started.pendingFlow;
      expect(flow.authorizationUrl.startsWith(`${base}/authorize?`)).toBe(true);

      const duplicate = await outcome(mcp.oauthExecute('linear', { action: 'start', ...owner }, configuration));
      if (!('error' in duplicate)) throw new Error('A second start must not open a second flow');
      if (!(duplicate.error instanceof NativeMcpError)) throw duplicate.error;
      expect(duplicate.error.code).toBe('MCP_OAUTH_IN_PROGRESS');

      // A joined completion before the cancel observes the flow's own outcome,
      // so the panel renders a sign-in that ended rather than a generic failure.
      const completing = outcome(mcp.oauthExecute('linear', {
        action: 'complete', ...owner, flowId: flow.flowId,
      }, configuration));
      const cancelled = await mcp.oauthExecute('linear', {
        action: 'cancel', ...owner, flowId: flow.flowId,
      }, configuration);
      expect(cancelled).toMatchObject({ serverId: 'linear', status: 'unauthenticated', authenticated: false });
      // A user cancel is neutral: no error for the panel to render as a failure.
      expect(cancelled).not.toHaveProperty('error');
      const ended = await completing;
      if (!('error' in ended)) throw new Error('The joined completion must report the cancellation');
      if (!(ended.error instanceof NativeMcpError)) throw ended.error;
      expect(ended.error.code).toBe('MCP_OAUTH_CANCELLED');
    });
  });

  /** The flow fails after the browser handoff: the panel has only oauthRead to
   * poll, so the cause must arrive there. A raw fetch to the callback server is
   * the browser; the state nonce comes from the authorization URL. */

  test('a consent denial after the handoff is reported once on the next read', async () => {
    await withOAuthWorker('issue', async ({ mcp, configuration, base }) => {
      const started = await mcp.oauthExecute('linear', { action: 'start', ...owner }, configuration);
      if (started.status !== 'pending') throw new Error(`expected a pending flow, received ${started.status}`);
      const flow = started.pendingFlow;
      const authorizationUrl = new URL(flow.authorizationUrl);
      expect(base.startsWith('http://127.0.0.1:')).toBe(true);

      // The provider's consent screen redirects to the callback server with
      // error=access_denied; that redirect target is the flow's own redirect_uri.
      const callbackUrl = new URL(authorizationUrl.searchParams.get('redirect_uri') ?? '');
      callbackUrl.search = `?error=access_denied&error_description=${encodeURIComponent('The user denied the request')}&state=${authorizationUrl.searchParams.get('state')}`;
      // The callback server answers a denial with 500; the browser status is not
      // the outcome — the flow's error is.
      expect((await fetch(callbackUrl)).status).toBe(500);

      const failing = await outcome(settledRead(mcp, configuration));
      if ('error' in failing) throw failing.error;
      if (failing.value.status !== 'unauthenticated') throw new Error('The failing poll must still report unauthenticated');
      expect(failing.value.error?.code).toBe('MCP_OAUTH_FAILED');
      expect(failing.value.error?.detail).toContain('Authorization failed');
      expect(failing.value.error?.detail).toContain('The user denied the request');
      expect(failing.value.error?.retryable).toBe(false);

      // Exactly once: the failure is retired by the read that reported it.
      const after = await mcp.oauthRead('linear', configuration);
      expect(after).toMatchObject({ serverId: 'linear', status: 'unauthenticated', authenticated: false });
      expect(after).not.toHaveProperty('error');
    });
  });

  test('a local start pins the dedicated loopback redirect instead of a random fallback', async () => {
    await withOAuthWorker('issue', async ({ mcp, configuration }) => {
      const started = await mcp.oauthExecute('linear', { action: 'start', ...owner }, configuration);
      if (started.status !== 'pending') throw new Error(`expected a pending flow, received ${started.status}`);
      const authorizationUrl = new URL(started.pendingFlow.authorizationUrl);
      // A provider registers the URI it first saw; the pinned port makes every
      // later attempt use the same one, so a registered client keeps working.
      expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(MCP_OAUTH_LOOPBACK_REDIRECT_URI);
      expect(MCP_OAUTH_LOOPBACK_REDIRECT_URI).toBe(`http://localhost:${MCP_OAUTH_LOOPBACK_CALLBACK_PORT}/callback`);
      // The launch target must point at the same loopback listener the provider
      // will call back, not a different port.
      expect(started.pendingFlow.launchUrl).toBe(`http://localhost:${MCP_OAUTH_LOOPBACK_CALLBACK_PORT}/launch`);
      await mcp.oauthExecute('linear', { action: 'cancel', ...owner, flowId: started.pendingFlow.flowId }, configuration);
    });
  });

  test('a Host redirect completes through callbackInput without a loopback listener', async () => {
    const hostRedirect = 'https://chamber.example.test/api/agent/v1/mcp/oauth/callback';
    await withOAuthWorker('issue', async ({ mcp, configuration }) => {
      const started = await mcp.oauthExecute('linear', {
        action: 'start', ...owner, oauth: { redirectUri: hostRedirect },
      }, configuration);
      if (started.status !== 'pending') throw new Error(`expected a pending flow, received ${started.status}`);
      const authorizationUrl = new URL(started.pendingFlow.authorizationUrl);
      // The redirect the caller named reaches the Host, so the flow must not
      // advertise a loopback launch target for it.
      expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(hostRedirect);
      expect(started.pendingFlow.launchUrl).toBeUndefined();

      const state = authorizationUrl.searchParams.get('state');
      if (!state) throw new Error('Missing state');
      const completed = await mcp.oauthExecute('linear', {
        action: 'complete', ...owner, flowId: started.pendingFlow.flowId,
        callbackInput: `${hostRedirect}?code=stub-code&state=${state}`,
      }, configuration);
      expect(completed).toMatchObject({ serverId: 'linear', status: 'authenticated', authenticated: true });
    });
  });

  test('a loopback-shaped redirect the flow does not bind advertises no launch URL', async () => {
    // An SSH tunnel's Host is a loopback address on a port this worker does not
    // own. OMP still offers a `/launch` URL for any loopback hostname, but that
    // port belongs to the Host, so the browser would hit a dead route there.
    const tunnelRedirect = 'http://127.0.0.1:62545/api/agent/v1/mcp/oauth/callback';
    await withOAuthWorker('issue', async ({ mcp, configuration }) => {
      const started = await mcp.oauthExecute('linear', {
        action: 'start', ...owner, oauth: { redirectUri: tunnelRedirect },
      }, configuration);
      if (started.status !== 'pending') throw new Error(`expected a pending flow, received ${started.status}`);
      expect(started.pendingFlow.launchUrl).toBeUndefined();
      const authorizationUrl = new URL(started.pendingFlow.authorizationUrl);
      const state = authorizationUrl.searchParams.get('state');
      if (!state) throw new Error('Missing state');
      const completed = await mcp.oauthExecute('linear', {
        action: 'complete', ...owner, flowId: started.pendingFlow.flowId,
        callbackInput: `${tunnelRedirect}?code=stub-code&state=${state}`,
      }, configuration);
      expect(completed).toMatchObject({ status: 'authenticated', authenticated: true });
    });
  });

  test('a token exchange failure after the handoff is reported once on the next read', async () => {
    await withOAuthWorker('issue', async ({ mcp, configuration, base }) => {
      const started = await mcp.oauthExecute('linear', { action: 'start', ...owner }, configuration);
      if (started.status !== 'pending') throw new Error(`expected a pending flow, received ${started.status}`);
      const authorizationUrl = new URL(started.pendingFlow.authorizationUrl);
      expect(base.startsWith('http://127.0.0.1:')).toBe(true);

      const callbackUrl = new URL(authorizationUrl.searchParams.get('redirect_uri') ?? '');
      callbackUrl.search = `?code=stub-code&state=${authorizationUrl.searchParams.get('state')}`;
      expect((await fetch(callbackUrl)).status).toBe(200);

      const failing = await outcome(settledRead(mcp, configuration));
      if ('error' in failing) throw failing.error;
      expect(failing.value.status).toBe('unauthenticated');
      expect(failing.value.error?.code).toBe('MCP_OAUTH_FAILED');
      expect(failing.value.error?.detail).toContain('Token exchange failed: 400');
      expect(failing.value.error?.detail).toContain('invalid_grant');

      const after = await mcp.oauthRead('linear', configuration);
      expect(after).not.toHaveProperty('error');
    }, 'fail');
  });
});

describe('MCP failure detail credential scrubbing', () => {
  test('a child error that echoes an injected connection string never reaches the detail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-scrub-'));
    const agentDir = join(root, 'agent');
    const projectDir = join(root, 'project');
    await mkdir(agentDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });
    // A handshake that fails after echoing the env value it was given, the way a
    // provider prints its DSN in a startup error.
    const childPath = join(root, 'failing-mcp.js');
    await writeFile(childPath, [
      'let buffer = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", chunk => {',
      '  buffer += chunk;',
      '  const lines = buffer.split("\\n");',
      '  buffer = lines.pop() ?? "";',
      '  for (const line of lines) {',
      '    if (!line.trim()) continue;',
      '    const request = JSON.parse(line);',
      '    if (request.id === undefined) continue;',
      '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: `connect failed: ${process.env.MDB_MCP_CONNECTION_STRING}` } }) + "\\n");',
      '  }',
      '});',
    ].join('\n'), 'utf8');
    const connectionString = 'mongodb://fake-user:fake-pass@127.0.0.1:1/fakedb';
    try {
      const authStorage = await discoverAuthStorage(agentDir, { cwd: projectDir });
      await authStorage.credentials.set('provider-credential-mongo', { type: 'api_key', key: connectionString, source: 'login' });
      const configuration: MCPConfigurationState = {
        workspaceId: 'workspace-1', persistedRevision: '0',
        config: {
          servers: [{
            serverId: 'mongodb', label: 'MongoDB', enabled: true,
            transport: { type: 'stdio', command: 'bun', args: [childPath], envCredentialRefs: { MDB_MCP_CONNECTION_STRING: 'credential-mongo' } },
          }],
        },
      };
      const mcp = new WorkerMcp({
        cwd: projectDir,
        configPath: join(projectDir, '.omp', 'mcp.json'),
        worker: { rootSessionId: 'root-1', workspaceId: 'workspace-1', workerGeneration: 'generation-1' },
        authStorage,
        resolveCredentialRef: async reference => `provider-${reference}`,
        resolveCommand: async command => command.command,
        authorizeServer: async () => { },
        authorizeOAuth: async () => { },
        sanitizeTool: tool => tool,
        onCatalog: () => { },
        onRuntimeFailure: () => { },
        isCurrent: () => true,
      });
      const probe = await mcp.test('mongodb', configuration);
      expect(probe.status).toBe('failed');
      if (probe.status !== 'failed') throw new Error('The handshake must fail');
      expect(probe.error.detail).toContain('[redacted]');
      expect(probe.error.detail).not.toContain('fake-pass');
      expect(probe.error.detail).not.toContain(connectionString);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('MCP OAuth policy refusal', () => {
  test('an enterprise-mode refusal keeps its code instead of becoming a provider failure', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mcp-oauth-policy-'));
    try {
      const agentDir = join(home, '.omp', 'agent');
      const projectDir = join(home, 'project');
      await mkdir(agentDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      const userPath = join(agentDir, 'mcp.json');
      const projectPath = join(projectDir, '.omp', 'mcp.json');
      await writeFile(userPath, `${JSON.stringify({
        mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
      }, null, 2)}\n`, 'utf8');
      const configuration = await readNativeMcpConfigurationIfPresent(projectPath, 'workspace-1', userPath);
      if (!configuration) throw new Error('user-scope server must be readable');
      const authStorage = await discoverAuthStorage(agentDir, { cwd: projectDir });
      const mcp = new WorkerMcp({
        cwd: projectDir,
        configPath: projectPath,
        userConfigPath: userPath,
        worker: { rootSessionId: 'root-1', workspaceId: 'workspace-1', workerGeneration: 'generation-1' },
        authStorage,
        resolveCredentialRef: async reference => reference,
        resolveCommand: async command => command.command,
        authorizeServer: async () => { },
        // The Host refuses the crossing the way its authorizer does.
        authorizeOAuth: async () => {
          throw new ProjectionError(403, 'enterprise_mode', 'MCP sign-in is not available in enterprise mode.');
        },
        sanitizeTool: tool => tool,
        onCatalog: () => { },
        onRuntimeFailure: () => { },
        isCurrent: () => true,
      });
      await expect(mcp.oauthExecute('linear', {
        action: 'start', persistedRevision: configuration.persistedRevision, workerGeneration: 'generation-1',
      }, configuration)).rejects.toMatchObject({
        code: 'enterprise_mode', status: 403, message: 'MCP sign-in is not available in enterprise mode.',
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
