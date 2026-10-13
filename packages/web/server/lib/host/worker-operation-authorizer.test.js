import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProjectDirectoryRuntime } from './project-directory-runtime.js';
import { createWorkerOperationAuthorizer } from './worker-operation-authorizer.js';

const server = { serverId: 'oauth-server', label: 'OAuth server', enabled: true, transport: { type: 'http', url: 'https://mcp.example/tools' } };
const endpointFields = ['authorizationUrl', 'tokenUrl', 'issuerUrl', 'registrationUrl', 'resourceMetadataUrl', 'redirectUri', 'resource'];
let scope;
let authorize;

beforeAll(async () => {
  const cwd = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
  const agentDirectory = await fs.realpath(fileURLToPath(new URL('.', import.meta.url)));
  scope = { rootSessionId: 'root', workerGeneration: 'generation', projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'agent-directory', cwd, agentDirectory };
  const policy = { projectId: scope.projectId, workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId, cwd, agentDirectory,
    providers: [], mcpServers: [server], fileTools: [], shellCommands: [], toolRequests: [], agentIds: [], permissionPresetIds: [], providerEntry: true };
  const directoryOwner = createProjectDirectoryRuntime({ fsPromises: fs, path, normalizeDirectoryPath: value => value });
  authorize = createWorkerOperationAuthorizer({
    resolvePolicy: async () => policy,
    validateDirectoryPath: directoryOwner.validateDirectoryPath,
    enterprisePolicyOptions: { env: { OPENCHAMBER_ENTERPRISE_MODE: '1' }, readFile: () => { const error = new Error('Absent policy'); error.code = 'ENOENT'; throw error; } },
  });
});

describe('Host MCP OAuth authorization', () => {
  it('allows configured remote MCP discovery and sanitized flow endpoints under enterprise policy', async () => {
    expect(await authorize(scope, { type: 'mcp-oauth', server, configuration: {} })).toEqual({ allowed: true });
    const configuration = Object.fromEntries(endpointFields.map(field => [field, `https://oauth.example/${field}?resource=tools`]));
    Object.assign(configuration, { clientId: 'public-client', scopes: 'mcp:tools', prompt: 'consent', callbackPort: 3000, callbackPath: '/callback', stripSameOriginResource: false });
    expect(await authorize(scope, { type: 'mcp-oauth', server, configuration })).toEqual({ allowed: true });
    expect(await authorize(scope, { type: 'provider-entry' })).toEqual({ allowed: false, code: 'enterprise_mode', status: 403 });
  });

  it.each(endpointFields)('refuses unsafe %s without treating it as an unavailable policy', async field => {
    for (const url of ['file:///etc/passwd', 'https://user:secret@oauth.example/token', 'https://oauth.example/token#fragment', 'not-a-url']) {
      expect(await authorize(scope, { type: 'mcp-oauth', server, configuration: { [field]: url } })).toEqual({ allowed: false, code: 'INVALID_REQUEST', status: 400 });
    }
  });

  it('refuses secret, transport injection and unknown configuration fields', async () => {
    for (const configuration of [{ clientSecret: 'private' }, { fetch: 'injected' }, { headers: { Authorization: 'private' } }, { arbitrary: true }]) {
      expect(await authorize(scope, { type: 'mcp-oauth', server, configuration })).toEqual({ allowed: false, code: 'INVALID_REQUEST', status: 400 });
    }
  });

  it('keeps configured-server and captured-source authority independent of endpoint validity', async () => {
    expect(await authorize(scope, { type: 'mcp-oauth', server: { ...server, transport: { type: 'http', url: 'https://foreign.example/tools' } }, configuration: {} })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
    expect(await authorize({ ...scope, agentDirectoryId: 'foreign-agent-directory' }, { type: 'mcp-oauth', server, configuration: {} })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
  });
});
