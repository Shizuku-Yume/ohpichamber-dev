import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { HostAuthorizationScopeSchema, HostWorkspacePolicySchema, WorkerPolicyRequestSchema, NativeOperationDescriptorSchema } from '@openchamber/agent-service/private-protocol';
import { resolveGuestFilePath } from '../guests/files.js';
import { unsupportedRepositoryRootReason } from '../git/repository-root.js';
import { isEnterpriseMode } from '../enterprise-mode.js';

const GITHUB_READONLY_OPS = new Set(['repo_view', 'file_read', 'search_issues', 'search_prs', 'search_code', 'search_commits', 'search_repos', 'run_watch']);
const DEBUG_READONLY_ACTIONS = new Set(['output', 'threads', 'stack_trace', 'scopes', 'variables', 'disassemble', 'read_memory', 'loaded_sources', 'modules', 'sessions']);

const sanitizeMcp = name => name?.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || '';
const resolveMcpServerForTool = (toolName, servers) => {
 if (!toolName.startsWith('mcp__')) return null;
 const suffix = toolName.slice(5);
 let best = null;
 let bestLen = 0;
 for (const server of servers) {
  const candidates = [server.serverId, server.name, server.label].filter(Boolean);
  for (const raw of candidates) {
   const sanitized = sanitizeMcp(raw);
   for (const prefix of [`${sanitized}__`, `${sanitized}_`, `${raw}__`, `${raw}_`]) {
    if (suffix.startsWith(prefix) && suffix.length > prefix.length) {
     if (prefix.length > bestLen) {
      bestLen = prefix.length;
      best = server;
     }
    }
   }
  }
 }
 return best;
};

// A refusal names the check that refused, so the person reading it can act on it.
const denied = (reason, code = 'UNAUTHORIZED', status = 403) => ({ allowed: false, code, status, detail: reason });
const approvalRequired = reason => ({ ...denied(reason), approvalRequired: true });
const allowed = { allowed: true };
// A proposed value is one the authorized operation itself introduces into the
// workspace, so the pre-operation snapshot cannot describe it and the check
// validates the candidate the post-operation state will contain instead.
// For a server that means: the workspace will actually run it — enabled, and not
// hand-written config the UI must never mutate. Reusing an existing server id is
// how an edit is expressed, so it is not a refusal.
const proposedServerPermitted = server => server.enabled && server.managed !== false;
// A write tier the tool declared itself is only actionable when the descriptor
// names the path it will touch; otherwise the Host has nothing to check and must
// ask the user before granting the call.
const hasCheckableDestination = descriptor => descriptor.destinationPaths.length > 0 || descriptor.fileOps.length > 0;
// A proposed provider/model must name a complete, well-formed selection: the
// worker resolves it against the live catalog, and the Host still refuses an
// empty or query-bearing endpoint rather than authorizing an opaque target.
const proposedProviderPermitted = descriptor => typeof descriptor?.providerId === 'string' && descriptor.providerId.length > 0
 && typeof descriptor.modelId === 'string' && descriptor.modelId.length > 0
 && (descriptor.endpoint === undefined || (typeof descriptor.endpoint === 'string'
  && /^https?:\/\/[^\s]+$/.test(descriptor.endpoint) && !descriptor.endpoint.includes('@')));
// SDK isolation drops the programmatic tool extensions that re-enter this
// authorizer, so an isolated child could write or run unobserved. Host-owned
// workers only admit non-isolated delegation, and a caller-supplied artifact id
// must stay a single safe path segment.
const safeTaskName = value => typeof value !== 'string' || /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const taskDelegation = input => {
 const items = Array.isArray(input.tasks) ? input.tasks.filter(isObject) : [];
 const isolated = input.isolated === true || items.some(item => item.isolated === true);
 const names = [input.name, ...items.map(item => item.name)];
 return isolated ? 'isolated' : names.every(safeTaskName) ? 'allowed' : 'invalid-name';
};

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
   if (!scopeResult.success || !requestResult.success) return denied('The authorization request did not match the Host policy protocol', 'INVALID_REQUEST', 400);
   const scope = scopeResult.data; const request = requestResult.data;
   const policyResult = HostWorkspacePolicySchema.safeParse(await resolvePolicy(scope));
   if (!policyResult.success) return denied('The workspace policy is unavailable');
   const policy = policyResult.data;
   if (policy.projectId !== scope.projectId || policy.workspaceId !== scope.workspaceId
    || policy.agentDirectoryId !== scope.agentDirectoryId || policy.cwd !== scope.cwd
    || policy.agentDirectory !== scope.agentDirectory) return denied('The workspace policy does not match the authorized scope');
   const directory = await validateDirectoryPath(scope.cwd);
   if (!directory?.ok || unsupportedRepositoryRootReason(directory.directory)
    || directory.directory !== await fs.realpath(policy.cwd)
    || await fs.realpath(scope.agentDirectory) !== await fs.realpath(policy.agentDirectory)) return denied('The authorized workspace directory could not be validated');
   const policies = approvalPolicyStore?.list({ sessionId: scope.rootSessionId, projectId: scope.projectId, workspaceId: scope.workspaceId }) ?? [];
   const toolName = request.type === 'tool' ? request.toolName : request.type === 'shell' ? 'bash' : null;
   const input = request.type === 'tool' ? request.input : request.type === 'shell' ? request.request : null;
   const nativeTool = toolName !== null && ['read', 'write', 'edit', 'grep', 'glob', 'bash', 'provider.use', 'lsp'].includes(toolName);
   const descriptorResult = rawDescriptor === undefined ? null : NativeOperationDescriptorSchema.safeParse(rawDescriptor);
   if ((nativeTool && (!descriptorResult?.success || descriptorResult.data.toolName !== toolName))
    || (descriptorResult !== null && (!descriptorResult.success || descriptorResult.data.toolName !== toolName))) {
    return denied(`The native operation descriptor for the ${toolName ?? 'requested'} tool is missing or names a different tool`, 'INVALID_REQUEST', 400);
   }
   const descriptor = descriptorResult?.success ? descriptorResult.data : null;
   const exactPolicies = toolName === null ? [] : policies.filter(row => row.target.toolName === toolName && row.target.pattern === JSON.stringify(input));
   if (exactPolicies.some(row => row.decision === 'deny')) return denied(`An approval policy denies this exact ${toolName} tool request`);
   const approvalGranted = descriptor?.approvalGrant !== undefined
    && descriptor.approvalGrant.rootSessionId === scope.rootSessionId
    && descriptor.approvalGrant.workerGeneration === scope.workerGeneration
    && request.type === 'tool' && descriptor.approvalGrant.approvalId === request.approvalId
    && descriptor.approvalGrant.toolCallId === request.toolCallId
    && (descriptor.approvalGrant.toolName === undefined || descriptor.approvalGrant.toolName === toolName);
   const commandGranted = command => policy.shellCommands.includes(command)
    || exactPolicies.some(row => row.decision === 'allow')
    || (approvalGranted && (descriptor?.approvalGrant?.command === undefined || descriptor.approvalGrant.command === command || descriptor.approvalGrant.input?.command === command));
   const pathAllowed = async rawPath => {
    const target = FilePathInputSchema.safeParse(rawPath);
    if (!target.success) return false;
    const relative = path.isAbsolute(target.data) ? path.relative(directory.directory, target.data) : target.data;
    const resolved = await resolveGuestFilePath({ path: relative || '.', projectDirectory: directory.directory, patterns: [], homeDir: os.homedir() });
    return resolved.ok && resolved.scope === 'project';
   };
   if (request.type === 'web-search') return isEnterpriseMode(enterprisePolicyOptions) ? denied('The web_search tool is refused in enterprise mode', 'enterprise_mode', 403) : allowed;
   if (request.type === 'provider-entry') {
    if (isEnterpriseMode(enterprisePolicyOptions)) return denied('Enterprise mode refuses provider credential entry', 'enterprise_mode', 403);
    return policy.providerEntry ? allowed : denied('The workspace does not allow provider credential entry');
   }
   if (request.type === 'mcp-server' || request.type === 'mcp-oauth') {
    if (request.type === 'mcp-oauth' && isEnterpriseMode(enterprisePolicyOptions))
     return denied('MCP sign-in is not available in enterprise mode', 'enterprise_mode', 403);
    const permitted = request.proposed === true
     ? proposedServerPermitted(request.server)
     : policy.mcpServers.some(server => isDeepStrictEqual(server, request.server));
    if (!permitted) return denied(request.proposed === true
     ? 'The proposed MCP server is disabled or is not managed by OhPiChamber'
     : 'The MCP server is not in the workspace configuration');
    if (request.type === 'mcp-oauth' && (request.server.transport.type === 'stdio'
     || !OAuthPolicyConfigurationSchema.safeParse(request.configuration).success)) return denied('The MCP OAuth configuration is not a valid remote OAuth configuration', 'INVALID_REQUEST', 400);
    return allowed;
   }
   if (request.type === 'shell') return descriptor?.command !== undefined && commandGranted(descriptor.command) ? allowed : denied('The bash tool has no Host grant for this command');
   if (request.type !== 'tool') return denied('The request type is not authorized for this workspace');
   if (request.agentId !== undefined && !policy.agentIds.includes(request.agentId)) return denied(`The agent profile is not in the workspace catalog for the ${request.toolName} tool`);
   if (request.toolName === 'provider.use') {
    const permitted = request.proposed === true
     ? proposedProviderPermitted(descriptor)
     : descriptor !== null && policy.providers.some(provider => provider.providerId === descriptor.providerId
      && provider.modelId === descriptor.modelId && provider.endpoint === descriptor.endpoint);
    return permitted ? allowed : denied(request.proposed === true
     ? 'The provider.use tool does not name a complete provider and model selection'
     : 'The provider.use tool does not name a provider and model enabled in this workspace');
   }
   // Native ask only opens a scoped, CAS-protected interaction; it grants no machine capability.
   if (request.toolName === 'ask') return allowed;
   // Native yield submits the child's structured result to its parent; it opens no
   // machine capability and is the only successful child-completion path.
   if (request.toolName === 'yield') return allowed;
   // Native goal operations only read or change this session's OMP goal state.
   // Provider turns and machine tools still require their own authorization.
   if (request.toolName === 'goal') return allowed;
   // Native todo operations only read or update this session's OMP task/todo state.
   // Provider turns and machine tools still require their own authorization.
   if (request.toolName === 'todo') return allowed;
   // Native wait only observes this session's async jobs; it opens no machine
   // capability and OMP resolves its own job identifiers.
   if (request.toolName === 'wait') return allowed;
   // Native task delegation starts an SDK child under the captured workspace. A
   // non-isolated child's tool calls re-enter this authorizer, so the request grants
   // no machine capability; the selected profile's allowedTools gate already ran in
   // the worker. Isolated children are refused because that path bypasses these hooks.
   if (request.toolName === 'task') {
    const delegation = taskDelegation(request.input);
    return delegation === 'allowed' ? allowed : delegation === 'isolated'
     ? denied('The task tool cannot delegate to an isolated child because that path bypasses the Host authorization hooks')
     : denied('The task tool names a delegation that is not a safe path segment', 'INVALID_REQUEST', 400);
   }
   // The OMP tool declares its own tier for this call and the worker forwards it;
   // the Host classifies everything it has no argument-aware rule for by it. A
   // tool the worker cannot resolve arrives without a tier and is treated as
   // exec, so an unknown tool can never be silently allowed.
   const isDebugReadOnly = request.toolName === 'debug' && typeof input?.action === 'string' && DEBUG_READONLY_ACTIONS.has(input.action.toLowerCase());
   const isGithubReadOnly = request.toolName === 'github' && typeof input?.op === 'string' && GITHUB_READONLY_OPS.has(input.op.toLowerCase());
   const isIdaReadOnly = request.toolName === 'ida' && typeof input?.action === 'string' && input.action.toLowerCase() === 'list';
   // A few tools decide their tier from the arguments; the Host keeps those
   // readings because the tier selects the workspace grant and the extra guards
   // below. `write` and `edit` only ever run a file mutation, so keeping them here
   // makes the "no destination named" guard hold even when no tier was sent.
   const argTier = (() => {
    switch (request.toolName) {
     case 'context_notes': return input?.text === undefined ? 'read' : 'write';
     case 'retain': return Array.isArray(input?.items) && input.items.some(item => item?.scope === 'global') ? 'write' : 'read';
     case 'learn': return input?.skill || input?.scope === 'global' ? 'write' : 'read';
     case 'write':
     case 'edit':
     case 'ast_edit': return 'write';
     // A generated image is produced by a provider, not written to a workspace
     // path the descriptor could name, so this tool's write tier is its own.
     case 'generate_image': return 'write';
     case 'ast_grep': return 'read';
     case 'debug': return isDebugReadOnly ? 'read' : 'exec';
     case 'github': return isGithubReadOnly ? 'read' : 'exec';
     case 'ida': return isIdaReadOnly ? 'read' : 'exec';
     default: return undefined;
    }
   })();
   const declaredTier = descriptor?.declaredTier ?? 'exec';
   const tier = argTier ?? declaredTier;
   if (descriptor) {
    const internalReadUrls = descriptor.internalReadUrls ?? [];
    if (internalReadUrls.length > 0 && request.toolName !== 'read') {
     return denied(`The ${request.toolName} tool may read OMP internal URLs but may not write them`);
    }
    const internalWriteUrls = descriptor.internalWriteUrls ?? [];
    if (internalWriteUrls.length > 0 && request.toolName !== 'write') {
     return denied(`The ${request.toolName} tool may write OMP internal URLs but may not read them`);
    }
    for (const target of [...descriptor.destinationPaths, ...descriptor.fileOps.flatMap(operation => operation.to === undefined ? [operation.path] : [operation.path, operation.to])]) {
     if (!await pathAllowed(target)) return denied(`The ${request.toolName} tool targets a path outside the authorized workspace`);
    }
    for (const target of descriptor.sourcePaths) {
     if (!await pathAllowed(target)) {
      // A read outside the workspace is an approval card, never a hard refusal;
      // `read` is named too so the card survives a worker that sent no tier.
      if (tier === 'read' || request.toolName === 'read') {
       if (!approvalGranted) return approvalRequired(`The ${request.toolName} tool targets a path outside the authorized workspace and needs approval`);
      } else {
       return denied(`The ${request.toolName} tool targets a path outside the authorized workspace`);
      }
     }
    }
   }
   if (request.toolName === 'bash') {
    const command = descriptor?.command ?? input?.command;
    return (descriptor?.command !== undefined || input?.command !== undefined) && commandGranted(command)
     ? allowed : approvalRequired('The bash tool requires approval');
   }
   if (request.toolName === 'lsp') {
    const action = descriptor?.lspAction;
    if (typeof action !== 'string' || action.length === 0) return denied('The lsp tool request has no action', 'INVALID_REQUEST', 400);
    const readOnlyActions = ['diagnostics', 'definition', 'type_definition', 'implementation', 'references', 'hover', 'symbols', 'status', 'capabilities'];
    const isReadOnly = readOnlyActions.includes(action) || (action === 'code_actions' && request.input?.apply !== true);
    if (isReadOnly) {
     if ((descriptor?.destinationPaths?.length ?? 0) > 0 || (descriptor?.fileOps?.length ?? 0) > 0) return denied('The lsp tool may not modify files for a read-only action');
     return policy.fileTools.includes('read') ? allowed : denied('The workspace does not grant file reads to the lsp tool');
    }
    const mutationActions = ['rename', 'rename_file', 'format'];
    const isCodeActionApply = action === 'code_actions' && request.input?.apply === true;
    if (mutationActions.includes(action) || isCodeActionApply) {
     if (!policy.fileTools.includes('write')) return denied('The workspace does not grant file writes to the lsp tool');
     if (descriptor && descriptor.destinationPaths.length === 0) return denied('The lsp tool mutation names no destination path');
     return approvalGranted ? allowed : approvalRequired(`The lsp tool requires approval for the ${action} mutation`);
    }
    return denied(`The lsp tool action ${action} is not authorized`);
   }
   if (request.toolName.startsWith('mcp__')) {
    const matchedServer = resolveMcpServerForTool(request.toolName, policy.mcpServers);
    if (!matchedServer || matchedServer.enabled === false) {
     return denied(`The ${request.toolName} tool names an MCP server that is not in the workspace configuration`);
    }
    return approvalGranted ? allowed : approvalRequired(`The ${request.toolName} tool requires approval`);
   }
   if (tier === 'read') {
    if (!policy.fileTools.includes('read')) return denied(`The workspace does not grant file reads to the ${request.toolName} tool`);
    if (['read', 'grep', 'glob'].includes(request.toolName) && descriptor && descriptor.sourcePaths.length === 0 && (descriptor.internalReadUrls ?? []).length === 0) {
     return denied(`The ${request.toolName} tool names no readable target`);
    }
    return allowed;
   }
   if (tier === 'write') {
    if (!policy.fileTools.includes('write')) return denied(`The workspace does not grant file writes to the ${request.toolName} tool`);
    if (request.toolName === 'edit' && descriptor && descriptor.effectiveMode === undefined) return denied(`The ${request.toolName} tool carries no effective edit mode`);
    if (['write', 'edit'].includes(request.toolName) && descriptor &&
     descriptor.destinationPaths.length === 0 &&
     (!descriptor.fileOps || descriptor.fileOps.length === 0) &&
     (descriptor.internalWriteUrls ?? []).length === 0) {
     return denied(`The ${request.toolName} tool names no writable destination`);
    }
    // A write tier the tool declared itself proves only that it will write; when
    // it names no destination the Host can check, the user must see the call.
    // Host-known arg-tier writes are not affected here.
    if (argTier === undefined && !hasCheckableDestination(descriptor)) {
     return approvalGranted ? allowed : approvalRequired(`The ${request.toolName} tool declares a file write but names no destination the Host can check, so it requires approval`);
    }
    return allowed;
   }
   return approvalGranted ? allowed : approvalRequired(`The ${request.toolName} tool requires approval`);
  } catch { return denied('The Host authorization check failed before it could decide', 'SERVICE_UNAVAILABLE', 503); }
 };
};
