import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { isAbsolute } from 'node:path';
import { z, type ZodType } from 'zod';
import * as C from '@openchamber/agent-contract';
import {
  SelectedCredentialHandoffRequestSchema,
  SelectedCredentialHandoffResultSchema,
} from '@openchamber/agent-service/private-protocol';
import { isEnterpriseMode, type EnterprisePolicyOptions } from '../enterprise-mode.js';
import type { Application, ErrorRequestHandler, ExpressFactory, Response, Router } from '../shared/http-contracts.js';
import type { SelectedCredentialHandoffRequest, SelectedCredentialHandoffResult } from './private-credential.js';
import type { JsonValue } from '../shared/json-values.js';
import type { RequestOriginChecker } from '../security/request-security.js';
import type { createUiAuth } from '../ui-auth/ui-auth.js';
import type { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import type { AgentServiceSupervisor } from './agent-service-supervisor.js';
import type { SkillFileOwner } from './skill-file-owner.js';
import { createSkillCatalogOwner, type SkillCatalogDependencies } from './skill-catalog-owner.js';
import { FILE_RESOURCE_AGENT_ROUTES } from './file-resource-agent-routes.js';
import {
  callbackUrlForRequest,
  completeMcpOAuthCallback,
  createMcpOAuthPendingFlows,
  MCP_OAUTH_CALLBACK_PATH,
  renderMcpOAuthCallbackPage,
} from './mcp-oauth-callback.js';
import { registerSkillFileRoutes } from './skill-file-routes.js';
import { registerSkillRepositoryRoutes } from './skill-catalog-routes.js';

const PREFIX = '/api/agent/v1';

const HostScopeSchema = z.strictObject({
  workspaceId: C.EntityIdSchema,
  projectId: C.EntityIdSchema,
  agentDirectoryId: C.EntityIdSchema,
  cwd: z.string().refine(isAbsolute),
  agentDirectory: z.string().refine(isAbsolute),
  rootSessionId: C.EntityIdSchema.optional(),
  displayPath: C.DisplayPathSchema.optional(),
  env: z.record(z.string(), z.string()).optional(),
});
const NativeServiceCapabilitiesSchema = C.RuntimeCapabilitiesSchema.extend({
  capabilities: C.RuntimeCapabilitySetSchema.omit({ documentExtraction: true, credentialHandoff: true })
    .extend({ attachments: z.boolean() }),
});
const RunResponseSchema = z.strictObject({ run: C.RunSchema });
const EmptyRequestBodySchema = z.strictObject({});
const WorkspaceResolveRequestSchema = z.strictObject({ directory: z.string().min(1) });
const CredentialErrorSchema = z.object({
  status: z.number().int().min(400).max(599).optional().catch(undefined),
  code: C.ProblemCodeSchema.optional().catch(undefined),
}).catch({});
const BodyErrorTypeSchema = z.object({ type: z.string() });
const PluginTargetSchema = z.object({ target: z.object({ name: z.string() }) });
const ExtensionTargetSchema = z.object({ extensionId: z.string() });
const ActionFieldSchema = z.object({ action: z.string() });
const WorkspaceIdFieldSchema = z.object({ workspaceId: z.string() });
const ProviderIdFieldSchema = z.object({ providerId: z.string() });
const WebSearchWorkspaceResultSchema = z.object({
  workspaceId: z.string().optional(),
  state: z.object({ workspaceId: z.string().optional() }).optional(),
});
const OAuthStatusFieldSchema = z.object({ status: z.string().optional() });
const ServiceStatePhaseSchema = z.looseObject({ phase: z.string() });

type HostScope = z.infer<typeof HostScopeSchema>;

export interface CanonicalScopeInput {
  workspaceId: string;
  projectId: string;
  agentDirectoryId: string;
  cwd: string;
  agentDirectory: string;
  rootSessionId?: string | undefined;
  displayPath?: string | null | undefined;
  env?: Record<string, string> | undefined;
  checkoutRemoved?: boolean;
}

export interface CanonicalGlobalEventHubPort {
  retainSession?: ((sessionId: string, leaseKey: string) => Promise<{ release: () => Promise<void> } | void>) | undefined;
  releaseSession?: ((sessionId: string, leaseKey: string) => Promise<void>) | undefined;
}

export interface CanonicalHostRoutesOptions {
  express: ExpressFactory;
  service: Pick<AgentServiceSupervisor, 'request' | 'getState'> & Partial<Pick<AgentServiceSupervisor, 'getDiagnostics'>>;
  uiAuthController: Pick<ReturnType<typeof createUiAuth>, 'resolveAuthContext'>;
  tunnelAuthController: Pick<ReturnType<typeof createTunnelAuth>, 'classifyRequestScope' | 'getTunnelSessionFromRequest'>;
  isRequestOriginAllowed: RequestOriginChecker;
  enterprisePolicyOptions?: EnterprisePolicyOptions | undefined;
  resolveWorkspaceScope: (workspaceId: string) => Promise<CanonicalScopeInput | null>;
  resolveWorkspaceDirectory: (directory: string) => Promise<C.Workspace | null>;
  resolveSessionScope: (sessionId: string) => Promise<CanonicalScopeInput | null>;
  resolveHostSessionScope: (sessionId: string) => Promise<CanonicalScopeInput | null>;
  listProjects: () => Promise<C.ProjectList>;
  listWorkspaces: (projectId?: string) => Promise<C.WorkspaceList>;
  resolveCredentialHandoff: (request: SelectedCredentialHandoffRequest) => Promise<SelectedCredentialHandoffResult>;
  queueRoutes: (router: Router) => void;
  sessionRoutes: (router: Router) => void;
  attachmentRoutes: (router: Router) => void;
  skillFileOwner?: SkillFileOwner | undefined;
  getSkillRepositoryDependencies?: (() => SkillCatalogDependencies) | undefined;
  globalEventHub?: CanonicalGlobalEventHubPort | undefined;
  resolveHostTools?: (() => Promise<Record<string, boolean>>) | undefined;
  onProviderConfigurationMutation?: ((payload: JsonValue) => void) | undefined;
}

interface CanonicalAgentRoute {
  method: string;
  pattern: RegExp;
  request?: ZodType | undefined;
  response?: ZodType | undefined;
  query?: readonly string[] | undefined;
  usage?: boolean | undefined;
  subagent?: boolean | undefined;
  imageEgress?: boolean | undefined;
  providerEntry?: boolean | undefined;
  providerOAuth?: boolean | undefined;
  quotaMutation?: boolean | undefined;
  websearch?: boolean | undefined;
  mcpOAuth?: boolean | undefined;
  pluginEgress?: boolean | undefined;
  coldSessionMutation?: boolean | undefined;
  shellObservation?: boolean | undefined;
  stream?: boolean | undefined;
}

interface CanonicalResponseState {
  canonicalAuthType?: string;
  canonicalProxyRoute?: CanonicalAgentRoute;
  canonicalMcpOAuthPath?: string;
}

interface HostScopeDraft {
  workspaceId: string;
  projectId: string;
  agentDirectoryId: string;
  cwd: string;
  agentDirectory: string;
  rootSessionId?: string;
  displayPath?: string;
  env?: Record<string, string>;
}

interface ReopenSessionBootstrap {
  rootSessionId: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
  agentDirectory: string;
  agentDirectoryId: string;
  displayPath: string;
  hostTools?: Record<string, boolean>;
  env?: Record<string, string>;
}

interface RawUsageQueryParams {
  from?: number | string;
  to?: number | string;
  timezone?: string;
  workspaceId?: string;
  projectId?: string;
  providerId?: string;
}

type CanonicalProxyHeaders = {
  Accept: string;
  'Content-Type'?: string;
  'Last-Event-ID'?: string;
};

const AGENT_ROUTES: CanonicalAgentRoute[] = [
  ...FILE_RESOURCE_AGENT_ROUTES,
  { method: 'GET', pattern: /^\/usage$/, response: C.UsageStatsSchema, query: ['from', 'to', 'timezone', 'workspaceId', 'projectId', 'providerId'], usage: true },
  { method: 'GET', pattern: /^\/usage\/tools$/, response: C.UsageToolsResponseSchema, query: ['from', 'to', 'timezone', 'workspaceId', 'projectId'], usage: true },
  { method: 'GET', pattern: /^\/subagents$/, response: z.array(C.SubagentSchema), query: ['sessionId'], subagent: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/models$/, response: C.ModelCatalogSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/images\/generate$/, request: C.ImageGenerateRequestSchema, response: C.ImageGenerateResultSchema, imageEgress: true },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/images\/config$/, request: C.ImageModelConfigureRequestSchema, response: C.ImageModelMutationResultSchema, providerEntry: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers$/, response: C.ProviderCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/oauth-methods$/, response: C.ProviderOAuthMethodsSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/discover$/, request: C.ProviderModelDiscoveryRequestSchema, response: C.ProviderModelDiscoveryResultSchema, providerEntry: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/enrich$/, request: C.ProviderModelEnrichRequestSchema, response: C.ProviderModelEnrichResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/accounts$/, response: C.ProviderAccountsSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/account-selection$/, response: C.ProviderAccountSelectionSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/accounts$/, request: C.ProviderAccountMutationRequestSchema, response: C.ProviderAccountsSchema, quotaMutation: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/oauth$/, request: C.ProviderOAuthRequestSchema, response: C.ProviderOAuthResultSchema, providerOAuth: true, quotaMutation: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/config$/, response: C.ProviderConfigurationReadSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents$/, response: C.AgentCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/cache-warming$/, response: C.CacheWarmingStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/cache-warming$/, request: C.CacheWarmingUpdateRequestSchema, response: C.CacheWarmingApplyResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/(?:omp\/)?settings$/, response: C.OmpSettingsStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/(?:omp\/)?settings$/, request: C.OmpSettingsUpdateRequestSchema, response: C.OmpSettingsStateSchema },
  { method: 'PATCH', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/(?:omp\/)?settings$/, request: C.OmpSettingsUpdateRequestSchema, response: C.OmpSettingsStateSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search$/, response: C.WebSearchConfigStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search$/, request: C.WebSearchUpdateRequestSchema, response: C.WebSearchMutationResultSchema, websearch: true },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search\/credentials\/(?<websearchProviderId>[^/]+)$/, request: C.WebSearchCredentialWriteRequestSchema, response: C.WebSearchMutationResultSchema, providerEntry: true, websearch: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search\/credentials\/(?<websearchProviderId>[^/]+)$/, request: C.WebSearchCredentialDeleteRequestSchema, response: C.WebSearchMutationResultSchema, websearch: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents$/, request: C.AgentCreateRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents\/[^/]+$/, request: C.AgentUpdateRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents\/[^/]+$/, request: C.AgentDeleteRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/config$/, request: C.ProviderConfigureRequestSchema, response: C.ProviderMutationResultSchema, providerEntry: true, quotaMutation: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+$/, request: C.ProviderDeleteRequestSchema, response: C.ProviderMutationResultSchema, quotaMutation: true },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/models\/[^/]+$/, request: C.ModelConfigureRequestSchema, response: C.ModelMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/models\/[^/]+$/, request: C.ModelDeleteRequestSchema, response: C.ModelMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/credential$/, request: C.ProviderCredentialWriteRequestSchema, response: C.ProviderCredentialMutationResultSchema, providerEntry: true, quotaMutation: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/credential\/[^/]+$/, request: C.ProviderCredentialDeleteRequestSchema, response: C.ProviderCredentialMutationResultSchema, quotaMutation: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/extensions$/, response: C.ExtensionInventoryStateSchema },
  { method: 'PATCH', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/extensions$/, request: C.ExtensionToggleRequestSchema, response: C.ExtensionInventoryStateSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins$/, response: C.PluginCatalogStateSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/install$/, request: C.PluginInstallRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/uninstall$/, request: C.PluginUninstallRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/apply$/, request: C.PluginApplyRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/marketplace$/, response: C.PluginMarketplaceStateSchema, pluginEgress: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/marketplace\/updates$/, response: C.PluginUpdateCheckResultSchema, pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/marketplace\/manage$/, request: C.PluginMarketplaceManageRequestSchema, response: z.union([C.PluginMutationResultSchema, C.PluginMarketplaceSourcesSchema]), pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/marketplace\/preview-upgrade$/, request: C.PluginPreviewUpgradeRequestSchema, response: C.PluginUpgradePreviewResultSchema, pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/marketplace\/upgrade-all$/, request: C.PluginUpgradeAllRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/doctor$/, response: C.PluginDoctorResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/lifecycle$/, response: C.PluginLifecycleStateSchema },
  { method: 'PATCH', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/(?<pluginName>[^/]+)$/, request: C.PluginConfigureRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/(?<pluginName>[^/]+)\/update$/, request: C.PluginUpgradeRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/local\/(?<extensionId>[^/]+)$/, response: C.LocalExtensionSourceSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/local\/(?<extensionId>[^/]+)$/, request: C.LocalExtensionWriteRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/local\/(?<extensionId>[^/]+)$/, request: C.LocalExtensionDeleteRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/config$/, response: C.MCPConfigurationStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/config$/, request: C.MCPConfigureRequestSchema, response: C.MCPApplyResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/apply$/, request: C.MCPApplyRequestSchema, response: C.MCPApplyResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/test$/, request: C.MCPApplyRequestSchema, response: C.MCPConnectionTestResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/reconnect$/, request: C.MCPApplyRequestSchema, response: C.MCPWorkspaceReconnectResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/credentials$/, request: C.MCPSecretWriteRequestSchema, response: C.MCPSecretWriteResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, response: C.MCPOAuthResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, request: C.MCPOAuthRequestSchema, response: C.MCPOAuthResultSchema, mcpOAuth: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/completions$/, request: C.CompletionRequestSchema, response: C.CompletionResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/completions\/[^/]+\/cancel$/, request: C.CompletionCancelRequestSchema, response: C.CompletionCancelResultSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/recaps$/, response: C.SessionRecapListResponseSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/subagents$/, response: C.SubagentListResponseSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/subagents\/tree-cost$/, response: C.SubagentTreeCostResponseSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/subagents\/(?<subagentId>[^/]+)\/transcript$/, response: C.SubagentTranscriptResponseSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/cache-warming$/, response: C.SessionCacheWarmingStateSchema },
  { method: 'PUT', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/cache-warming$/, request: C.SessionCacheWarmingUpdateRequestSchema, response: C.SessionCacheWarmingApplyResultSchema, coldSessionMutation: true },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/history$/, response: C.HistoryPageSchema, query: ['cursor', 'leafTurnId', 'limit'] },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/turns\/[^/]+\/diff$/, response: C.TurnDiffSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/events$/, stream: true, query: ['cursor'] },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/runs\/[^/]+\/abort$/, response: RunResponseSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/approvals$/, response: z.array(C.ApprovalRequestSchema) },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/approvals\/[^/]+\/respond$/, request: C.ApprovalReplySchema, response: C.ApprovalRequestSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/questions$/, response: z.array(C.QuestionRequestSchema) },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/questions\/[^/]+\/respond$/, request: C.QuestionReplySchema, response: C.QuestionRequestSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/catalog$/, response: C.MCPCatalogReadSchema },
  { method: 'PUT', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/config$/, request: C.MCPConfigureRequestSchema, response: C.MCPApplyResultSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/apply$/, request: C.MCPApplyRequestSchema, response: C.MCPApplyResultSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/servers\/[^/]+\/reconnect$/, request: C.MCPReconnectRequestSchema, response: C.MCPCatalogReadSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, response: C.MCPOAuthResultSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, request: C.MCPOAuthRequestSchema, response: C.MCPOAuthResultSchema, mcpOAuth: true },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/skills\/catalog$/, response: C.SkillsCatalogStateSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/skills\/apply$/, request: C.SkillsApplyRequestSchema, response: C.SkillsApplyResultSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/skills\/expand$/, request: C.SkillExpandRequestSchema, response: C.SkillExpandResultSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/tools$/, response: C.SessionToolsCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/tools$/, response: C.SessionToolsCatalogSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs$/, request: C.ShellStartRequestSchema, response: C.ShellJobSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/projects\/(?<projectId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/output$/, response: C.ShellOutputSchema, query: ['epoch', 'workerGeneration', 'cursor', 'tailBytes'], shellObservation: true },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/stop$/, request: C.ShellStopRequestSchema, response: C.ShellStopResultSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/stream$/, response: C.ShellStreamResponseSchema, query: ['epoch', 'workerGeneration', 'streamId', 'from'], shellObservation: true },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/stdin$/, request: C.ShellStdinRequestSchema, response: C.ShellStdinResultSchema, shellObservation: true },
];

function problem(res: Response, status: number, code: C.ProblemCode, detail: string): Response {
  return res.status(status).type('application/problem+json').json(C.ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`,
    title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status,
    code,
    detail,
    retryable: status >= 500,
  }));
}

function credentialProblem(res: Response, cause: unknown): Response {
  const parsed = CredentialErrorSchema.parse(cause);
  const status = parsed.status ?? 503;
  const code = parsed.code ?? 'SERVICE_UNAVAILABLE';
  return problem(res, status, code, status >= 500 ? 'The selected credential owner is unavailable.' : 'The selected credential operation was refused.');
}

function capturedScope(value: CanonicalScopeInput | null | undefined, expectedWorkspaceId?: string): HostScope | null {
  if (!value || (expectedWorkspaceId !== undefined && value.workspaceId !== expectedWorkspaceId)) return null;
  const { workspaceId, projectId, agentDirectoryId, cwd, agentDirectory, rootSessionId, displayPath, env } = value;
  const narrowed: HostScopeDraft = { workspaceId, projectId, agentDirectoryId, cwd, agentDirectory };
  if (rootSessionId !== undefined) narrowed.rootSessionId = rootSessionId;
  if (displayPath !== undefined && displayPath !== null) narrowed.displayPath = displayPath;
  if (env !== undefined) narrowed.env = env;
  const parsed = HostScopeSchema.safeParse(narrowed);
  return parsed.success ? parsed.data : null;
}

export function registerCanonicalHostRoutes(app: Application, {
  express,
  service,
  uiAuthController,
  tunnelAuthController,
  isRequestOriginAllowed,
  enterprisePolicyOptions,
  resolveWorkspaceScope,
  resolveWorkspaceDirectory,
  resolveSessionScope,
  resolveHostSessionScope,
  listProjects,
  listWorkspaces,
  resolveCredentialHandoff,
  queueRoutes,
  sessionRoutes,
  attachmentRoutes,
  skillFileOwner,
  getSkillRepositoryDependencies,
  globalEventHub,
  resolveHostTools,
  onProviderConfigurationMutation,
}: CanonicalHostRoutesOptions): void {
  const validService = Boolean(service) && z.function().safeParse(service.request).success && z.function().safeParse(service.getState).success;
  if (!validService) throw new TypeError('Canonical gateway requires the real Agent Service request/getState');
  const validHttp = Boolean(express) && z.function().safeParse(express.Router).success && z.function().safeParse(express.json).success
    && z.function().safeParse(uiAuthController?.resolveAuthContext).success
    && z.function().safeParse(tunnelAuthController?.classifyRequestScope).success
    && z.function().safeParse(tunnelAuthController?.getTunnelSessionFromRequest).success;
  if (!validHttp) throw new TypeError('Canonical gateway requires the production HTTP and auth owners');
  if (!z.function().safeParse(resolveHostSessionScope).success) {
    throw new TypeError('Canonical gateway requires the authorized Host session scope');
  }
  const responseStates = new WeakMap<Response, CanonicalResponseState>();
  const getResponseState = (res: Response): CanonicalResponseState => {
    let state = responseStates.get(res);
    if (!state) {
      state = {};
      responseStates.set(res, state);
    }
    return state;
  };
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/health', (_req, res) => {
    const { phase } = ServiceStatePhaseSchema.parse(service.getState());
    res.json({ status: 'ok', engine: 'omp', agent: { status: phase, ready: phase === 'ready' } });
  });
  router.get('/ready', async (_req, res) => {
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
    try {
      const response = await service.request(`${PREFIX}/ready`);
      if (!response.ok) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
      return res.json(C.AgentServiceReadySchema.parse(await response.json()));
    } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.'); }
  });
  const mcpOAuthPendingFlows = createMcpOAuthPendingFlows();
  router.get(MCP_OAUTH_CALLBACK_PATH.slice(PREFIX.length), async (req, res) => {
    const sendPage = ({ status, title, message }: { status: number; title: string; message: string }) =>
      res.status(status).type('html').send(renderMcpOAuthCallbackPage({ title, message }));
    if (isEnterpriseMode(enterprisePolicyOptions)) {
      return problem(res, 403, 'enterprise_mode', 'MCP sign-in is not available in enterprise mode.');
    }
    return sendPage(await completeMcpOAuthCallback({
      service,
      pendingFlows: mcpOAuthPendingFlows,
      query: req.query,
      callbackUrl: callbackUrlForRequest(req),
    }));
  });
  router.use(async (req, res, next) => {
    try {
      const requestScope = tunnelAuthController.classifyRequestScope(req);
      const auth = requestScope === 'tunnel' || requestScope === 'unknown-public'
        ? (tunnelAuthController.getTunnelSessionFromRequest(req) ? { type: 'tunnel' } : null)
        : await uiAuthController.resolveAuthContext(req, res, { allowUrlToken: false, allowAnonymousSession: false });
      if (!auth) return problem(res, 401, 'UNAUTHORIZED', 'Authenticate with the Host before using this operation.');
      const explicitOrigin = req.headers.origin !== undefined;
      const verifiedBearer = auth.type === 'client' && /^Bearer\s+\S+$/i.test(req.headers.authorization ?? '');
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '');
      if ((explicitOrigin || (mutation && !verifiedBearer)) && !await isRequestOriginAllowed(req)) {
        return problem(res, 403, 'INVALID_ORIGIN', 'Use an authorized Host client origin.');
      }
      getResponseState(res).canonicalAuthType = auth.type;
      next();
    } catch { return problem(res, 500, 'INTERNAL_ERROR', 'The Host could not authorize the request.'); }
  });
  router.get('/diagnostics', (_req, res) => {
    res.json({ entries: service.getDiagnostics?.() ?? [] });
  });
  router.get('/capabilities', async (_req, res) => {
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
    try {
      const response = await service.request(`${PREFIX}/capabilities`);
      if (!response.ok) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent capabilities are unavailable.');
      const parsedCapabilities = NativeServiceCapabilitiesSchema.parse(await response.json());
      const { attachments: _attachments, ...capabilityFlags } = parsedCapabilities.capabilities;
      return res.json(C.RuntimeCapabilitiesSchema.parse({
        ...parsedCapabilities,
        capabilities: { ...capabilityFlags, followUpQueue: true, credentialHandoff: true, documentExtraction: false },
      }));
    } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent capabilities are unavailable.'); }
  });
  router.get('/projects', async (_req, res) => {
    try { return res.json(C.ProjectListSchema.parse(await listProjects())); } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host project catalog could not be read.'); }
  });
  router.get('/workspaces', async (req, res) => {
    const query = z.strictObject({ projectId: C.EntityIdSchema.optional() }).safeParse(req.query);
    if (!query.success) return problem(res, 400, 'INVALID_REQUEST', 'The workspace discovery query is invalid.');
    try {
      return res.json(C.WorkspaceListSchema.parse(await listWorkspaces(query.data.projectId)));
    } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace catalog could not be read.'); }
  });
  router.post(
    '/workspaces/resolve',
    (req, res, next) => express.json({ limit: '64kb', strict: true })(req, res, next),
    async (req, res) => {
      const parsed = WorkspaceResolveRequestSchema.safeParse(req.body);
      if (!parsed.success || !parsed.data.directory.trim()) return problem(res, 400, 'INVALID_REQUEST', 'Provide a directory to resolve.');
      try {
        const scope = await resolveWorkspaceDirectory(parsed.data.directory);
        if (!scope) return problem(res, 404, 'UNAUTHORIZED', 'The requested workspace is not authorized.');
        const result = C.WorkspaceSchema.safeParse({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          name: scope.name,
          displayPath: scope.displayPath,
        });
        if (!result.success) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace projection is unavailable.');
        return res.json(result.data);
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof URIError) return problem(res, 400, 'INVALID_REQUEST', 'The workspace directory is invalid.');
        return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace discovery is unavailable.');
      }
    },
  );
  router.use('/sessions/:sessionId/queue', (req, res, next) => express.json({ limit: '1mb', strict: true })(req, res, next));
  queueRoutes(router);
  const sessionRouter = express.Router();
  sessionRoutes(sessionRouter);
  router.use('/sessions', sessionRouter);
  const attachmentRouter = express.Router();
  attachmentRoutes(attachmentRouter);
  router.use('/attachments', attachmentRouter);
  if (skillFileOwner) {
    registerSkillFileRoutes(router, { express, owner: skillFileOwner, resolveWorkspaceScope });
    if (getSkillRepositoryDependencies) {
      registerSkillRepositoryRoutes(router, {
        express,
        resolveWorkspaceScope,
        catalogOwner: createSkillCatalogOwner({
          owner: skillFileOwner,
          getDependencies: getSkillRepositoryDependencies,
          policyOptions: enterprisePolicyOptions,
        }),
      });
    }
  }
  router.post(
    '/credentials/preflight',
    (_req, res, next) => {
      if (isEnterpriseMode(enterprisePolicyOptions)) return problem(res, 403, 'enterprise_mode', 'Credential handoff is not available in enterprise mode.');
      if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'No credentials were read because the Agent Service is not ready.');
      next();
    },
    (req, res, next) => express.json({ limit: '256kb', strict: true })(req, res, next),
    async (req, res) => {
      if (!req.is('application/json')) return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
      const parsed = SelectedCredentialHandoffRequestSchema.safeParse(req.body);
      if (!parsed.success) return problem(res, 400, 'INVALID_REQUEST', 'Provide explicit selected credential intent and consent.');
      try {
        const scope = capturedScope(await resolveWorkspaceScope(parsed.data.workspaceId), parsed.data.workspaceId);
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected workspace is not authorized.');
        return res.status(207).json(SelectedCredentialHandoffResultSchema.parse(await resolveCredentialHandoff(parsed.data)));
      } catch (error) { return credentialProblem(res, error); }
    },
  );
  router.use((req, res, next) => {
    const route = AGENT_ROUTES.find((candidate) => candidate.method === req.method && candidate.pattern.test(req.path));
    if (!route) return problem(res, 404, 'NOT_IMPLEMENTED', 'No canonical operation matches this route.');
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
    if (route.providerEntry && isEnterpriseMode(enterprisePolicyOptions)) {
      return problem(res, 403, 'enterprise_mode', 'Provider entry is not available in enterprise mode.');
    }
    if (route.imageEgress && isEnterpriseMode(enterprisePolicyOptions)) {
      return problem(res, 403, 'enterprise_mode', 'Image generation is not available in enterprise mode.');
    }
    if (route.pluginEgress && isEnterpriseMode(enterprisePolicyOptions)) {
      return problem(res, 403, 'enterprise_mode', 'Native plugin package management and marketplace access are not available in enterprise mode.');
    }
    if (route.request && !req.is('application/json')) {
      return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
    }
    getResponseState(res).canonicalProxyRoute = route;
    next();
  });
  router.use((req, res, next) => express.json({ limit: '1mb', strict: true })(req, res, next));
  router.use(async (req, res) => {
    const routeState = getResponseState(res);
    const route = routeState.canonicalProxyRoute;
    if (!route) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The canonical operation could not be completed.');
    const resolveRouteSessionScope = (route.shellObservation || route.stream) ? resolveHostSessionScope : resolveSessionScope;
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const groups = route.pattern.exec(req.path)?.groups;
      let scope: HostScope | null = null;
      if (groups?.workspaceId) {
        const workspaceId = C.EntityIdSchema.parse(decodeURIComponent(groups.workspaceId));
        const resolved = await resolveWorkspaceScope(workspaceId);
        scope = capturedScope(resolved, workspaceId);
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected workspace is not authorized.');
        if (resolved?.checkoutRemoved) return problem(res, 409, 'SESSION_READ_ONLY', 'This workspace\'s worktree was deleted, so it is read-only.');
      } else if (groups?.sessionId) {
        const sessionId = C.EntityIdSchema.parse(decodeURIComponent(groups.sessionId));
        scope = capturedScope(await resolveRouteSessionScope(sessionId));
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected session is not authorized.');
      } else if (groups?.projectId) {
        const projectId = C.EntityIdSchema.parse(decodeURIComponent(groups.projectId));
        const projects = C.ProjectListSchema.parse(await listProjects());
        if (!projects.items.some((project) => project.projectId === projectId)) {
          return problem(res, 403, 'UNAUTHORIZED', 'The selected project is not authorized.');
        }
      }
      if (route.subagent) {
        const sessionId = C.EntityIdSchema.safeParse(req.query.sessionId);
        if (!sessionId.success) return problem(res, 400, 'INVALID_REQUEST', 'The subagent session identity is invalid.');
        scope = capturedScope(await resolveSessionScope(sessionId.data));
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected session is not authorized.');
      }
      if (groups?.extensionId) C.LocalExtensionIdSchema.parse(decodeURIComponent(groups.extensionId));
      if (groups?.sessionId && req.method !== 'GET' && !route.shellObservation && !route.coldSessionMutation && scope) {
        const sessionId = C.EntityIdSchema.parse(decodeURIComponent(groups.sessionId));
        const bootstrap: ReopenSessionBootstrap = {
          rootSessionId: scope.rootSessionId ?? sessionId,
          projectId: scope.projectId,
          workspaceId: scope.workspaceId,
          cwd: scope.cwd,
          agentDirectory: scope.agentDirectory,
          agentDirectoryId: scope.agentDirectoryId,
          displayPath: scope.displayPath ?? 'workspace',
        };
        if (resolveHostTools) {
          const hostTools = await resolveHostTools().catch(() => null);
          if (hostTools) bootstrap.hostTools = hostTools;
        }
        if (scope.env !== undefined) bootstrap.env = scope.env;
        const reopened = await service.request(`/internal/sessions/${encodeURIComponent(sessionId)}/reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bootstrap),
          signal: controller.signal,
        });
        if (!reopened.ok) {
          const parsedError = C.ProblemDetailsSchema.safeParse(await reopened.json());
          if (!parsedError.success) {
            return problem(res, 503, 'SERVICE_UNAVAILABLE', `The Agent Service refused the session reopen with HTTP ${reopened.status} without a problem document.`);
          }
          return res.status(reopened.status).type('application/problem+json').json(parsedError.data);
        }
      }
      const url = new URL(req.originalUrl, 'http://canonical.invalid');
      for (const key of url.searchParams.keys()) {
        if (!(route.query ?? []).includes(key) || url.searchParams.getAll(key).length !== 1) {
          return problem(res, 400, 'INVALID_REQUEST', 'The canonical query is invalid.');
        }
      }
      let usageRequest: {
        query: C.UsageQuery;
        authorizedScopes: Array<{ workspaceId: string; projectId: string }>;
      } | undefined;
      if (route.usage) {
        const rawParams: RawUsageQueryParams = {};
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'from') rawParams.from = /^\d+$/.test(value) ? Number(value) : NaN;
          else if (key === 'to') rawParams.to = /^\d+$/.test(value) ? Number(value) : NaN;
          else if (key === 'timezone') rawParams.timezone = value;
          else if (key === 'workspaceId') rawParams.workspaceId = value;
          else if (key === 'projectId') rawParams.projectId = value;
          else if (key === 'providerId') rawParams.providerId = value;
        }
        const query = C.UsageQuerySchema.parse(rawParams);
        if (query.projectId !== undefined) {
          const projects = C.ProjectListSchema.parse(await listProjects());
          if (Object.keys(projects.errors).length) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host project inventory is incomplete.');
          if (!projects.items.some((project) => project.projectId === query.projectId)) {
            return problem(res, 403, 'UNAUTHORIZED', 'The selected project is not authorized.');
          }
        }
        let workspaceIds: string[];
        if (query.workspaceId !== undefined) workspaceIds = [query.workspaceId];
        else {
          const workspaces = C.WorkspaceListSchema.parse(await listWorkspaces(query.projectId));
          if (Object.keys(workspaces.errors).length) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace inventory is incomplete.');
          workspaceIds = workspaces.items
            .filter((workspace) => query.projectId === undefined || workspace.projectId === query.projectId)
            .map((workspace) => workspace.workspaceId);
        }
        const authorizedScopes: Array<{ workspaceId: string; projectId: string }> = [];
        for (const workspaceId of new Set(workspaceIds)) {
          const authorized = capturedScope(await resolveWorkspaceScope(workspaceId), workspaceId);
          if (!authorized || (query.projectId !== undefined && authorized.projectId !== query.projectId)) {
            return problem(res, 403, 'UNAUTHORIZED', 'The selected usage scope is not authorized.');
          }
          authorizedScopes.push({ workspaceId: authorized.workspaceId, projectId: authorized.projectId });
        }
        usageRequest = { query, authorizedScopes };
      }
      let body: string | undefined;
      if (route.request) {
        const parsed = route.request.safeParse(req.body);
        if (!parsed.success) return problem(res, 400, 'INVALID_REQUEST', 'The canonical request is invalid.');
        if (groups?.pluginName) {
          const pluginTarget = PluginTargetSchema.parse(parsed.data);
          if (decodeURIComponent(groups.pluginName) !== pluginTarget.target.name) {
            return problem(res, 400, 'INVALID_REQUEST', 'The plugin target does not match its route.');
          }
        }
        if (groups?.extensionId) {
          const extensionTarget = ExtensionTargetSchema.parse(parsed.data);
          if (C.LocalExtensionIdSchema.parse(decodeURIComponent(groups.extensionId)) !== extensionTarget.extensionId) {
            return problem(res, 400, 'INVALID_REQUEST', 'The extension target does not match its route.');
          }
        }
        if (route.providerOAuth) {
          const oauthAction = ActionFieldSchema.parse(parsed.data);
          if (['start', 'input', 'commit'].includes(oauthAction.action) && isEnterpriseMode(enterprisePolicyOptions)) {
            return problem(res, 403, 'enterprise_mode', 'Provider entry is not available in enterprise mode.');
          }
        }
        if (route.mcpOAuth) {
          const oauthAction = ActionFieldSchema.parse(parsed.data);
          if (oauthAction.action === 'start' && isEnterpriseMode(enterprisePolicyOptions)) {
            return problem(res, 403, 'enterprise_mode', 'MCP sign-in is not available in enterprise mode.');
          }
          routeState.canonicalMcpOAuthPath = `${PREFIX}${req.path}`;
        }
        const workspaceField = WorkspaceIdFieldSchema.safeParse(parsed.data);
        if (workspaceField.success && workspaceField.data.workspaceId !== scope?.workspaceId) {
          return problem(res, 403, 'UNAUTHORIZED', 'The request does not match the selected workspace.');
        }
        if (groups?.websearchProviderId !== undefined) {
          const providerField = ProviderIdFieldSchema.parse(parsed.data);
          if (providerField.providerId !== decodeURIComponent(groups.websearchProviderId)) {
            return problem(res, 400, 'INVALID_REQUEST', 'The credential provider does not match the selected search provider.');
          }
        }
        body = JSON.stringify(parsed.data);
      } else if (req.body !== undefined && !EmptyRequestBodySchema.safeParse(req.body).success) {
        return problem(res, 400, 'INVALID_REQUEST', 'This canonical operation accepts no body.');
      }
      if (usageRequest) body = JSON.stringify(usageRequest);
      const headers: CanonicalProxyHeaders = { Accept: route.stream ? 'text/event-stream' : 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (route.stream && req.headers['last-event-id'] !== undefined) {
        const cursor = z.string().safeParse(req.headers['last-event-id']);
        if (!cursor.success) return problem(res, 400, 'INVALID_CURSOR', 'Only one event cursor is accepted.');
        headers['Last-Event-ID'] = cursor.data;
      }
      const target = route.usage ? (req.path === '/usage/tools' ? '/internal/usage/tools' : '/internal/usage') : `${PREFIX}${req.path}${url.search}`;
      if (!route.stream) {
        requestTimeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
        requestTimeout.unref();
      }
      const requestInit: RequestInit = {
        method: route.usage ? 'POST' : (req.method ?? 'GET'),
        headers,
        signal: controller.signal,
      };
      if (body !== undefined) requestInit.body = body;
      const response = await service.request(target, requestInit);
      if (!response.ok) {
        const parsedError = C.ProblemDetailsSchema.safeParse(await response.json());
        if (!parsedError.success) {
          return problem(res, 503, 'SERVICE_UNAVAILABLE', `The Agent Service answered HTTP ${response.status} without a problem document.`);
        }
        return res.status(response.status).type('application/problem+json').json(parsedError.data);
      }
      if (route.stream) {
        if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'text/event-stream') {
          return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent event stream is unavailable.');
        }
        res.status(response.status).set({ 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        const sessionId = groups?.sessionId;
        const leaseKey = sessionId ? `sse-${randomUUID()}` : null;
        if (sessionId && globalEventHub?.retainSession && leaseKey) {
          void globalEventHub.retainSession(sessionId, leaseKey).catch(() => { void 0; });
        }
        try {
          await pipeline(Readable.fromWeb(response.body), res, { signal: controller.signal });
        } finally {
          if (sessionId && leaseKey && globalEventHub?.releaseSession) {
            void globalEventHub.releaseSession(sessionId, leaseKey).catch(() => { void 0; });
          }
        }
        return;
      }
      if (!route.response) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent response is invalid.');
      const parsedResult = route.response.safeParse(await response.json());
      if (!parsedResult.success) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent response is invalid.');
      const result = parsedResult.data;
      const resultWorkspace = WorkspaceIdFieldSchema.safeParse(result);
      if (resultWorkspace.success && scope && resultWorkspace.data.workspaceId !== scope.workspaceId) {
        return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent response does not match its selected workspace.');
      }
      if (route.response === C.CacheWarmingApplyResultSchema) {
        const warming = C.CacheWarmingApplyResultSchema.parse(result);
        if (!scope || warming.persisted.workspaceId !== scope.workspaceId || warming.workers.some((outcome) => outcome.worker.workspaceId !== scope.workspaceId)) {
          return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The cache-warming response does not match its selected workspace.');
        }
      }
      const expectedRootId = scope?.rootSessionId ?? (groups?.sessionId ? decodeURIComponent(groups.sessionId) : undefined);
      if (route.response === C.SessionCacheWarmingStateSchema) {
        const sessionWarming = C.SessionCacheWarmingStateSchema.parse(result);
        if (!scope || sessionWarming.workspaceId !== scope.workspaceId || sessionWarming.sessionId !== expectedRootId) {
          return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The session cache-warming response does not match its selected session.');
        }
      }
      if (route.response === C.SessionCacheWarmingApplyResultSchema) {
        const sessionWarmingApply = C.SessionCacheWarmingApplyResultSchema.parse(result);
        if (
          !scope
          || sessionWarmingApply.persisted.workspaceId !== scope.workspaceId
          || sessionWarmingApply.persisted.sessionId !== expectedRootId
          || (sessionWarmingApply.worker !== null && (
            sessionWarmingApply.worker.worker.workspaceId !== scope.workspaceId
            || sessionWarmingApply.worker.worker.rootSessionId !== expectedRootId
          ))
        ) {
          return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The session cache-warming response does not match its selected session.');
        }
      }
      if (route.websearch) {
        const websearch = WebSearchWorkspaceResultSchema.safeParse(result);
        const resolvedWorkspaceId = websearch.success ? (websearch.data.state?.workspaceId ?? websearch.data.workspaceId) : undefined;
        if (!scope || resolvedWorkspaceId !== scope.workspaceId) {
          return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The search response does not match its selected workspace.');
        }
      }
      if (route.mcpOAuth) {
        const oauthResult = C.MCPOAuthResultSchema.parse(result);
        if (oauthResult.status === 'pending' && scope && routeState.canonicalMcpOAuthPath) {
          mcpOAuthPendingFlows.record({
            authorizationUrl: oauthResult.pendingFlow.authorizationUrl,
            completionPath: routeState.canonicalMcpOAuthPath,
            workspaceId: scope.workspaceId,
            serverId: oauthResult.serverId,
            flowId: oauthResult.pendingFlow.flowId,
            persistedRevision: oauthResult.persistedRevision,
            workerGeneration: oauthResult.worker.workerGeneration,
          });
        } else {
          mcpOAuthPendingFlows.dropServer(scope?.workspaceId ?? oauthResult.worker.workspaceId, oauthResult.serverId);
        }
      }
      if (route.response === C.ShellSnapshotSchema) {
        const snapshot = C.ShellSnapshotSchema.parse(result);
        for (const job of [...snapshot.running, ...snapshot.ended]) {
          const jobScope = capturedScope(await resolveRouteSessionScope(job.sessionId));
          if (!jobScope || jobScope.projectId !== job.projectId || jobScope.workspaceId !== job.workspaceId) {
            return problem(res, 403, 'UNAUTHORIZED', 'The shell observation includes an unauthorized session.');
          }
        }
      }
      if (route.quotaMutation && onProviderConfigurationMutation) {
        try {
          const statusField = OAuthStatusFieldSchema.safeParse(result);
          const credentialMaterialized = route.providerOAuth !== true || (statusField.success && statusField.data.status === 'authenticated');
          const providerMatch = /^\/workspaces\/[^/]+\/providers\/([^/]+)(?:\/|$)/.exec(req.path);
          const providerSegment = providerMatch?.[1];
          const mutationProviderId = providerSegment !== undefined ? decodeURIComponent(providerSegment) : null;
          if (credentialMaterialized && mutationProviderId !== null) onProviderConfigurationMutation({ providerId: mutationProviderId });
        } catch (error) {
          console.warn('Failed to announce a provider configuration change:', error instanceof Error ? error.message : error);
        }
      }
      return res.status(response.status).json(result);
    } catch (error) {
      if ((controller.signal.aborted && !timedOut) || res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      return problem(
        res,
        error instanceof z.ZodError || error instanceof URIError ? 400 : 503,
        error instanceof z.ZodError || error instanceof URIError ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE',
        'The canonical operation could not be completed.',
      );
    } finally {
      clearTimeout(requestTimeout);
      req.removeListener('aborted', disconnect);
      res.removeListener('close', disconnect);
    }
  });
  const handleProxyBodyError: ErrorRequestHandler = (error, _req, res, next) => {
    void next;
    if (res.headersSent) { res.destroy(); return; }
    const parsed = BodyErrorTypeSchema.safeParse(error);
    const errorType = parsed.success ? parsed.data.type : undefined;
    if (errorType === 'entity.too.large') return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'The canonical request body exceeds its limit.');
    if (errorType === 'entity.parse.failed' || errorType === 'request.size.invalid') {
      return problem(res, 400, 'INVALID_REQUEST', 'The canonical request body is invalid.');
    }
    if (errorType === 'encoding.unsupported' || errorType === 'charset.unsupported') {
      return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'The canonical request encoding is unsupported.');
    }
    return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The canonical operation owner is unavailable.');
  };
  router.use(handleProxyBodyError);
  app.use(PREFIX, router);
}
