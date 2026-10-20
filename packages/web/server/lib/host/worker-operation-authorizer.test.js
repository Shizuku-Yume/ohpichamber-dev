import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
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

async function nativeHarness(rows = [], enterprisePolicyOptions) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'native-host-policy-'));
  await Promise.all(['workspace', 'agent', 'outside'].map(name => fs.mkdir(path.join(root, name))));
  const cwd = await fs.realpath(path.join(root, 'workspace'));
  const agentDirectory = await fs.realpath(path.join(root, 'agent'));
  const nativeScope = { rootSessionId: 'native-root', workerGeneration: 'native-generation', projectId: 'native-project', workspaceId: 'native-workspace', agentDirectoryId: 'native-source', cwd, agentDirectory };
  const policy = { projectId: nativeScope.projectId, workspaceId: nativeScope.workspaceId, agentDirectoryId: nativeScope.agentDirectoryId, cwd, agentDirectory,
    providers: [{ providerId: 'fixture', modelId: 'small', endpoint: 'https://fixture.example/v1' }], mcpServers: [], fileTools: ['read', 'write'], shellCommands: [], toolRequests: [], agentIds: [], permissionPresetIds: [], providerEntry: true };
  const directoryOwner = createProjectDirectoryRuntime({ fsPromises: fs, path, normalizeDirectoryPath: value => value });
  const nativeAuthorize = createWorkerOperationAuthorizer({ resolvePolicy: async () => policy, validateDirectoryPath: directoryOwner.validateDirectoryPath, approvalPolicyStore: { list: () => rows }, enterprisePolicyOptions });
  return { scope: nativeScope, policy, authorize: nativeAuthorize, outside: path.join(root, 'outside'), close: () => fs.rm(root, { recursive: true, force: true }) };
}

describe('Host-owned native descriptor authority', () => {
  it('requires a trusted descriptor and contains every native read/write/rename target', async () => {
    const harness = await nativeHarness();
    try {
      const inside = path.join(harness.scope.cwd, 'inside.txt');
      const outside = path.join(harness.outside, 'outside.txt');
      await fs.writeFile(inside, 'inside');
      await fs.writeFile(outside, 'outside');
      const read = { type: 'tool', toolName: 'read', input: { path: 'inside.txt:2-8' } };
      const descriptor = { toolName: 'read', sourcePaths: [inside], destinationPaths: [], fileOps: [] };
      expect(await harness.authorize(harness.scope, read)).toEqual({ allowed: false, code: 'INVALID_REQUEST', status: 400 });
      expect(await harness.authorize(harness.scope, read, descriptor)).toEqual({ allowed: true });
      expect(await harness.authorize(harness.scope, read, { ...descriptor, sourcePaths: [outside] })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      for (const effectiveMode of ['apply_patch', 'hashline', 'patch', 'replace', 'sloppy']) {
        const request = { type: 'tool', toolName: 'edit', input: { changes: 'source-owned native edit input' } };
        const edit = { toolName: 'edit', effectiveMode, sourcePaths: [inside], destinationPaths: [inside], fileOps: [{ kind: 'rename', path: inside, to: outside }] };
        expect(await harness.authorize(harness.scope, request, edit)).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
        expect(await fs.readFile(outside, 'utf8')).toBe('outside');
      }
      expect(await fs.readFile(inside, 'utf8')).toBe('inside');
    } finally { await harness.close(); }
  });

  it('rejects symlink escapes after trusted Bun path parsing', async () => {
    const harness = await nativeHarness();
    try {
      await fs.symlink(harness.outside, path.join(harness.scope.cwd, 'linked'));
      await fs.writeFile(path.join(harness.outside, 'secret.txt'), 'SECRET_UNCHANGED');
      const escaped = path.join(harness.scope.cwd, 'linked', 'secret.txt');
      expect(await harness.authorize(harness.scope, { type: 'tool', toolName: 'read', input: { path: 'linked/secret.txt:1' } }, { toolName: 'read', sourcePaths: [escaped], destinationPaths: [], fileOps: [] })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      expect(await harness.authorize(harness.scope, { type: 'tool', toolName: 'write', input: { path: 'linked/secret.txt', content: 'overwrite' } }, { toolName: 'write', sourcePaths: [], destinationPaths: [escaped], fileOps: [{ kind: 'write', path: escaped }] })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      expect(await fs.readFile(path.join(harness.outside, 'secret.txt'), 'utf8')).toBe('SECRET_UNCHANGED');
    } finally { await harness.close(); }
  });

  it('binds initialized provider/model/endpoint instead of accepting a worker-declared fallback', async () => {
    const harness = await nativeHarness();
    try {
      const request = { type: 'tool', toolName: 'provider.use', input: {} };
      const descriptor = { toolName: 'provider.use', sourcePaths: [], destinationPaths: [], fileOps: [], providerId: 'fixture', modelId: 'small', endpoint: 'https://fixture.example/v1' };
      expect(await harness.authorize(harness.scope, request, descriptor)).toEqual({ allowed: true });
      for (const delta of [{ providerId: 'foreign' }, { modelId: 'foreign' }, { endpoint: 'https://foreign.example/v1' }]) {
        expect(await harness.authorize(harness.scope, request, { ...descriptor, ...delta })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      }
    } finally { await harness.close(); }
  });

  it('requires exact consent for the native workspace-root command descriptor unless machine policy grants it', async () => {
    const harness = await nativeHarness();
    try {
      const command = 'printf harmless';
      const request = { type: 'tool', toolName: 'bash', input: { command }, approvalId: 'approval', toolCallId: 'call' };
      const descriptor = { toolName: 'bash', sourcePaths: [harness.scope.cwd], destinationPaths: [], fileOps: [], command };
      const approvalGrant = { approvalId: 'approval', toolCallId: 'call', rootSessionId: harness.scope.rootSessionId, workerGeneration: harness.scope.workerGeneration, epoch: 'epoch', command };
      expect(await harness.authorize(harness.scope, request, descriptor)).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403, approvalRequired: true });
      expect(await harness.authorize(harness.scope, request, { ...descriptor, sourcePaths: [harness.outside] })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      expect(await harness.authorize(harness.scope, request, { ...descriptor, approvalGrant })).toEqual({ allowed: true });
      for (const mismatch of [{ command: 'printf other' }, { toolCallId: 'other-call' }, { rootSessionId: 'foreign-root' }, { workerGeneration: 'retired-generation' }]) {
        expect(await harness.authorize(harness.scope, request, { ...descriptor, approvalGrant: { ...approvalGrant, ...mismatch } })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403, approvalRequired: true });
      }
      harness.policy.shellCommands.push(command);
      expect(await harness.authorize(harness.scope, { type: 'tool', toolName: 'bash', input: { command } }, descriptor)).toEqual({ allowed: true });
    } finally { await harness.close(); }
  });

  it('keeps explicit workspace deny authoritative over one-shot approval and machine grants', async () => {
    const command = 'printf denied';
    const input = { command };
    const harness = await nativeHarness([{ scope: 'workspace', decision: 'deny', target: { toolName: 'bash', pattern: JSON.stringify(input) } }]);
    try {
      harness.policy.shellCommands.push(command);
      const request = { type: 'tool', toolName: 'bash', input, approvalId: 'approval', toolCallId: 'call' };
      const descriptor = { toolName: 'bash', sourcePaths: [], destinationPaths: [], fileOps: [], command,
        approvalGrant: { approvalId: 'approval', toolCallId: 'call', rootSessionId: harness.scope.rootSessionId, workerGeneration: harness.scope.workerGeneration, epoch: 'epoch', command } };
      expect(await harness.authorize(harness.scope, request, descriptor)).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
    } finally { await harness.close(); }
  });

  it('admits native questions without granting unknown tools and keeps scope, profile and explicit deny checks', async () => {
    const input = { questions: [{ id: 'choice', question: 'Choose', options: [{ label: 'One' }, { label: 'Two' }] }] };
    const request = { type: 'tool', toolName: 'ask', input };
    const harness = await nativeHarness();
    try {
      expect(await harness.authorize(harness.scope, request)).toEqual({ allowed: true });
      expect(await harness.authorize(harness.scope, { ...request, toolName: 'custom-question' })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      expect(await harness.authorize({ ...harness.scope, workspaceId: 'foreign' }, request)).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      expect(await harness.authorize(harness.scope, { ...request, agentId: 'foreign' })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      expect(await harness.authorize(harness.scope, { ...request, permissionPresetId: 'foreign' })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
    } finally { await harness.close(); }
    const denied = await nativeHarness([{ scope: 'workspace', decision: 'deny', target: { toolName: 'ask', pattern: JSON.stringify(input) } }]);
    try {
      expect(await denied.authorize(denied.scope, request)).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
    } finally { await denied.close(); }
  });
});

describe('native web-search egress authority', () => {
  it('reads machine policy for each actual query and fails closed for malformed policy', async () => {
    let policyText = JSON.stringify({ enterpriseMode: false });
    const harness = await nativeHarness([], { env: {}, readFile: () => policyText });
    try {
      expect(await harness.authorize(harness.scope, { type: 'web-search' })).toEqual({ allowed: true });
      policyText = JSON.stringify({ enterpriseMode: true });
      expect(await harness.authorize(harness.scope, { type: 'web-search' })).toEqual({ allowed: false, code: 'enterprise_mode', status: 403 });
      policyText = '{broken';
      expect(await harness.authorize(harness.scope, { type: 'web-search' })).toEqual({ allowed: false, code: 'enterprise_mode', status: 403 });
      policyText = JSON.stringify({ enterpriseMode: false });
      expect(await harness.authorize(harness.scope, { type: 'web-search' })).toEqual({ allowed: true });
    } finally { await harness.close(); }
  });

  it('requires captured workspace and source authority even when enterprise mode is off', async () => {
    const harness = await nativeHarness([], { env: {}, readFile: () => '{}' });
    try {
      for (const mismatch of [{ workspaceId: 'foreign' }, { agentDirectoryId: 'foreign' }, { cwd: harness.outside }, { agentDirectory: harness.outside }]) {
        expect(await harness.authorize({ ...harness.scope, ...mismatch }, { type: 'web-search' })).toEqual({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
      }
      expect(await harness.authorize(harness.scope, { type: 'web-search', endpoint: 'http://localhost:8080' })).toEqual({ allowed: false, code: 'INVALID_REQUEST', status: 400 });
    } finally { await harness.close(); }
  });
});
