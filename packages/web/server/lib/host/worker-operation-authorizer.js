import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { HostAuthorizationScopeSchema, HostWorkspacePolicySchema, WorkerPolicyRequestSchema, NativeOperationDescriptorSchema } from '@openchamber/agent-service/private-protocol';
import { resolveGuestFilePath } from '../guests/files.js';
import { unsupportedRepositoryRootReason } from '../git/repository-root.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { isPermissionMode } from '../permission-auto-accept/modes.js';

const denied = (code = 'UNAUTHORIZED', status = 403) => ({ allowed: false, code, status });
const allowed = { allowed: true };

const OAuthEndpointSchema = z.string().url().pipe(z.string().refine(value => {
  const endpoint = new URL(value);
  return ['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password && !endpoint.hash;
}));
const OAuthPolicyConfigurationSchema = z.strictObject({
  authorizationUrl: OAuthEndpointSchema.optional(), tokenUrl: OAuthEndpointSchema.optional(),
  issuerUrl: OAuthEndpointSchema.optional(), registrationUrl: OAuthEndpointSchema.optional(),
  resourceMetadataUrl: OAuthEndpointSchema.optional(), redirectUri: OAuthEndpointSchema.optional(),
  resource: OAuthEndpointSchema.optional(), clientId: z.string().min(1).optional(),
  scopes: z.string().min(1).optional(), prompt: z.string().optional(),
  callbackPort: z.number().int().min(1).max(65_535).optional(),
  callbackPath: z.string().startsWith('/').optional(), stripSameOriginResource: z.boolean().optional(),
});
const FilePathInputSchema = z.string().min(1).refine(value => path.isAbsolute(value) && !value.includes('\u0000'));

/** Host machine policy and source-bound consent authorize exact native operations.
 * A workspace cwd is not an OS sandbox; yolo does not confer a machine command grant.
 */
export const createWorkerOperationAuthorizer = ({
  resolvePolicy, validateDirectoryPath, enterprisePolicyOptions, approvalPolicyStore,
}) => {
  return async (rawScope, rawRequest, rawDescriptor) => {
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
      const nativeTool = toolName !== null && ['read', 'write', 'edit', 'grep', 'glob', 'bash', 'provider.use'].includes(toolName);
      const descriptorResult = rawDescriptor === undefined ? null : NativeOperationDescriptorSchema.safeParse(rawDescriptor);
      if (nativeTool && (!descriptorResult?.success || descriptorResult.data.toolName !== toolName)) return denied('INVALID_REQUEST', 400);
      const descriptor = descriptorResult?.success ? descriptorResult.data : null;
      const exactPolicies = toolName === null ? [] : policies.filter(row => row.target.toolName === toolName && row.target.pattern === JSON.stringify(input));
      if (exactPolicies.some(row => row.decision === 'deny')) return denied();
      const commandGranted = command => policy.shellCommands.includes(command)
        || exactPolicies.some(row => row.decision === 'allow')
        || (descriptor?.approvalGrant?.command === command
          && descriptor.approvalGrant.rootSessionId === scope.rootSessionId
          && descriptor.approvalGrant.workerGeneration === scope.workerGeneration
          && request.type === 'tool' && descriptor.approvalGrant.approvalId === request.approvalId
          && descriptor.approvalGrant.toolCallId === request.toolCallId);
      const pathAllowed = async rawPath => {
        const target = FilePathInputSchema.safeParse(rawPath);
        if (!target.success) return false;
        const relative = path.isAbsolute(target.data) ? path.relative(directory.directory, target.data) : target.data;
        const resolved = await resolveGuestFilePath({ path: relative || '.', projectDirectory: directory.directory, patterns: [], homeDir: os.homedir() });
        return resolved.ok && resolved.scope === 'project';
      };
      if (request.type === 'web-search') return isEnterpriseMode(enterprisePolicyOptions) ? denied('enterprise_mode', 403) : allowed;
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
      if (request.type === 'shell') return descriptor?.command !== undefined && commandGranted(descriptor.command) ? allowed : denied();
      if (request.type !== 'tool') return denied();
      if (request.agentId !== undefined && !policy.agentIds.includes(request.agentId)) return denied();
      if (request.permissionPresetId !== undefined && (!isPermissionMode(request.permissionPresetId)
        || !policy.permissionPresetIds.includes(request.permissionPresetId))) return denied();
      if (request.toolName === 'provider.use') {
        return descriptor !== null && policy.providers.some(provider => provider.providerId === descriptor.providerId
          && provider.modelId === descriptor.modelId && provider.endpoint === descriptor.endpoint) ? allowed : denied();
      }
      if (request.toolName === 'permission.preset') {
        return request.input.presetId === request.permissionPresetId && isPermissionMode(request.input.presetId)
          && policy.permissionPresetIds.includes(request.input.presetId) ? allowed : denied();
      }
      if (nativeTool && descriptor) {
        for (const target of [...descriptor.sourcePaths, ...descriptor.destinationPaths, ...descriptor.fileOps.flatMap(operation => operation.to === undefined ? [operation.path] : [operation.path, operation.to])]) {
          if (!await pathAllowed(target)) return denied();
        }
        if (request.toolName === 'bash') return descriptor.command !== undefined && commandGranted(descriptor.command)
          ? allowed : { ...denied(), approvalRequired: true };
        const capability = ['write', 'edit'].includes(request.toolName) ? 'write' : 'read';
        if (request.toolName === 'edit' && descriptor.effectiveMode === undefined) return denied();
        const targets = capability === 'write' ? descriptor.destinationPaths : descriptor.sourcePaths;
        return targets.length > 0 && policy.fileTools.includes(capability) ? allowed : denied();
      }
      return policy.toolRequests.some(candidate => isDeepStrictEqual(candidate, request)) ? allowed : denied();
    } catch { return denied('SERVICE_UNAVAILABLE', 503); }
  };
};
