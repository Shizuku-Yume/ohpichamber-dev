import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { HostAuthorizationScopeSchema, HostWorkspacePolicySchema, WorkerPolicyRequestSchema } from '@openchamber/agent-service/private-protocol';
import { resolveGuestFilePath } from '../guests/files.js';
import { unsupportedRepositoryRootReason } from '../git/repository-root.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { isPermissionMode } from '../permission-auto-accept/modes.js';

const denied = (code = 'UNAUTHORIZED', status = 403) => ({ allowed: false, code, status });
const allowed = { allowed: true };

const OAuthEndpointSchema = z.string().url().refine(value => {
  const endpoint = new URL(value);
  return ['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password && !endpoint.hash;
});
const OAuthPolicyConfigurationSchema = z.strictObject({
  authorizationUrl: OAuthEndpointSchema.optional(), tokenUrl: OAuthEndpointSchema.optional(),
  issuerUrl: OAuthEndpointSchema.optional(), registrationUrl: OAuthEndpointSchema.optional(),
  resourceMetadataUrl: OAuthEndpointSchema.optional(), redirectUri: OAuthEndpointSchema.optional(),
  resource: OAuthEndpointSchema.optional(), clientId: z.string().min(1).optional(),
  scopes: z.string().min(1).optional(), prompt: z.string().optional(),
  callbackPort: z.number().int().min(1).max(65_535).optional(),
  callbackPath: z.string().startsWith('/').optional(), stripSameOriginResource: z.boolean().optional(),
});

/** Host configuration grants and native approval consent are independent authorities.
 * Shell grants authorize exact machine commands; a workspace cwd is not an OS sandbox.
 */
export const createWorkerOperationAuthorizer = ({
  resolvePolicy, validateDirectoryPath, enterprisePolicyOptions, approvalPolicyStore,
} = {}) => {
  if (typeof resolvePolicy !== 'function' || typeof validateDirectoryPath !== 'function') {
    throw new TypeError('Worker authorization requires Host policy and directory owners');
  }
  return async (rawScope, rawRequest) => {
    try {
      const scopeResult = HostAuthorizationScopeSchema.safeParse(rawScope);
      const requestResult = WorkerPolicyRequestSchema.safeParse(rawRequest);
      if (!scopeResult.success || !requestResult.success) return denied('INVALID_REQUEST', 400);
      const scope = scopeResult.data; const request = requestResult.data;
      const policyResult = HostWorkspacePolicySchema.safeParse(await resolvePolicy(scope));
      if (!policyResult.success) return denied();
      const policy = policyResult.data;
      if (policy.projectId !== scope.projectId || policy.workspaceId !== scope.workspaceId
        || policy.agentDirectoryId !== scope.agentDirectoryId || policy.cwd !== scope.cwd
        || policy.agentDirectory !== scope.agentDirectory) return denied();
      const directory = await validateDirectoryPath(scope.cwd);
      if (!directory?.ok || unsupportedRepositoryRootReason(directory.directory)
        || directory.directory !== await fs.realpath(policy.cwd)
        || await fs.realpath(scope.agentDirectory) !== await fs.realpath(policy.agentDirectory)) return denied();
      const policies = approvalPolicyStore?.list({ sessionId: scope.rootSessionId, projectId: scope.projectId, workspaceId: scope.workspaceId }) ?? [];
      const toolName = request.type === 'tool' ? request.toolName : request.type === 'shell' ? 'bash' : null;
      const input = request.type === 'tool' ? request.input : request.type === 'shell' ? request.request : null;
      const exactPolicies = toolName === null ? [] : policies.filter(row => row.target.toolName === toolName && row.target.pattern === JSON.stringify(input));
      if (exactPolicies.some(row => row.scope === 'workspace' && row.decision === 'deny')) return denied();
      const commandGranted = command => policy.shellCommands.includes(command)
        || exactPolicies.some(row => row.scope === 'session' && row.decision === 'allow');
      const pathAllowed = async rawPath => {
        if (typeof rawPath !== 'string' || /[:;?*\u0000]/.test(rawPath)) return false;
        const relative = path.isAbsolute(rawPath) ? path.relative(directory.directory, rawPath) : rawPath;
        const resolved = await resolveGuestFilePath({ path: relative, projectDirectory: directory.directory, patterns: [], homeDir: os.homedir() });
        return resolved.ok && resolved.scope === 'project';
      };
      if (request.type === 'provider-entry') {
        if (isEnterpriseMode(enterprisePolicyOptions)) return denied('enterprise_mode', 403);
        return policy.providerEntry ? allowed : denied();
      }
      if (request.type === 'mcp-server' || request.type === 'mcp-oauth') {
        if (!policy.mcpServers.some(server => isDeepStrictEqual(server, request.server))) return denied();
        if (request.type === 'mcp-oauth' && (request.server.transport.type === 'stdio'
          || !OAuthPolicyConfigurationSchema.safeParse(request.configuration).success)) return denied('INVALID_REQUEST', 400);
        return allowed;
      }
      if (request.type === 'shell') return commandGranted(request.request.command) ? allowed : denied();
      if (request.type !== 'tool') return denied();
      if (request.agentId !== undefined && !policy.agentIds.includes(request.agentId)) return denied();
      if (request.permissionPresetId !== undefined && (!isPermissionMode(request.permissionPresetId)
        || !policy.permissionPresetIds.includes(request.permissionPresetId))) return denied();
      if (request.toolName === 'provider.use') {
        if (typeof request.input.providerId !== 'string' || typeof request.input.modelId !== 'string') return denied();
        if (request.input.endpoint !== undefined) {
          const endpoint = new URL(request.input.endpoint);
          if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return denied();
        }
        return policy.providers.some(provider => provider.providerId === request.input.providerId
          && provider.modelId === request.input.modelId && provider.endpoint === request.input.endpoint) ? allowed : denied();
      }
      if (request.toolName === 'permission.preset') {
        return request.input.presetId === request.permissionPresetId && isPermissionMode(request.input.presetId)
          && policy.permissionPresetIds.includes(request.input.presetId) ? allowed : denied();
      }
      if (request.toolName === 'bash') {
        if (typeof request.input.command !== 'string' || (request.input.cwd !== undefined && !await pathAllowed(request.input.cwd))) return denied();
        return commandGranted(request.input.command) ? allowed : denied();
      }
      if (['read', 'write', 'edit'].includes(request.toolName)) {
        // Selector and patch-text formats need their owning parser, not guessed path extraction.
        if (!await pathAllowed(request.input.path) || (request.toolName === 'edit' && request.input.edits !== undefined)) return denied();
        if (policy.fileTools.includes(request.toolName)) return allowed;
      }
      return policy.toolRequests.some(candidate => isDeepStrictEqual(candidate, request)) ? allowed : denied();
    } catch { return denied('SERVICE_UNAVAILABLE', 503); }
  };
};
