import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { SelectedCredentialHandoffRequestSchema, SelectedCredentialHandoffResultSchema } from '@openchamber/agent-service/private-protocol';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { FILE_RESOURCE_AGENT_ROUTES } from './file-resource-agent-routes.js';
import { registerSkillFileRoutes } from './skill-file-routes.js';
import { createSkillCatalogOwner } from './skill-catalog-owner.js';
import { registerSkillRepositoryRoutes } from './skill-catalog-routes.js';

const PREFIX = '/api/agent/v1';
const HostScopeSchema = z.strictObject({
  workspaceId: C.EntityIdSchema, projectId: C.EntityIdSchema, agentDirectoryId: C.EntityIdSchema,
  cwd: z.string().refine(isAbsolute), agentDirectory: z.string().refine(isAbsolute),
});
const NativeServiceCapabilitiesSchema = C.RuntimeCapabilitiesSchema.extend({
  capabilities: C.RuntimeCapabilitySetSchema.omit({ documentExtraction: true, credentialHandoff: true })
    .extend({ attachments: z.boolean() }),
});
const RunResponseSchema = z.strictObject({ run: C.RunSchema });
const EmptyRequestBodySchema = z.strictObject({});
const WorkspaceResolveRequestSchema = z.strictObject({ directory: z.string().min(1) });
// Only SDK-owned operations appear here. Host session admission, metadata and delivery have their own routers.
const AGENT_ROUTES = [
  ...FILE_RESOURCE_AGENT_ROUTES,
  { method: 'GET', pattern: /^\/usage$/, response: C.UsageStatsSchema, query: ['from', 'to', 'timezone', 'workspaceId', 'projectId'], usage: true },
  { method: 'GET', pattern: /^\/usage\/tools$/, response: C.UsageToolsResponseSchema, query: ['from', 'to', 'timezone', 'workspaceId', 'projectId'], usage: true },
  { method: 'GET', pattern: /^\/subagents$/, response: z.array(C.SubagentSchema), query: ['sessionId'], subagent: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/models$/, response: C.ModelCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers$/, response: C.ProviderCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/oauth-methods$/, response: C.ProviderOAuthMethodsSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/discover$/, request: C.ProviderModelDiscoveryRequestSchema, response: C.ProviderModelDiscoveryResultSchema, providerEntry: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/accounts$/, response: C.ProviderAccountsSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/accounts$/, request: C.ProviderAccountMutationRequestSchema, response: C.ProviderAccountsSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/oauth$/, request: C.ProviderOAuthRequestSchema, response: C.ProviderOAuthResultSchema, providerOAuth: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/config$/, response: C.ProviderConfigurationReadSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents$/, response: C.AgentCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/cache-warming$/, response: C.CacheWarmingStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/cache-warming$/, request: C.CacheWarmingUpdateRequestSchema, response: C.CacheWarmingApplyResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search$/, response: C.WebSearchConfigStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search$/, request: C.WebSearchUpdateRequestSchema, response: C.WebSearchMutationResultSchema, websearch: true },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search\/credentials\/(?<websearchProviderId>[^/]+)$/, request: C.WebSearchCredentialWriteRequestSchema, response: C.WebSearchMutationResultSchema, providerEntry: true, websearch: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/web-search\/credentials\/(?<websearchProviderId>[^/]+)$/, request: C.WebSearchCredentialDeleteRequestSchema, response: C.WebSearchMutationResultSchema, websearch: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents$/, request: C.AgentCreateRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents\/[^/]+$/, request: C.AgentUpdateRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents\/[^/]+$/, request: C.AgentDeleteRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/config$/, request: C.ProviderConfigureRequestSchema, response: C.ProviderMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+$/, request: C.ProviderDeleteRequestSchema, response: C.ProviderMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/models\/[^/]+$/, request: C.ModelConfigureRequestSchema, response: C.ModelMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/models\/[^/]+$/, request: C.ModelDeleteRequestSchema, response: C.ModelMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/credential$/, request: C.ProviderCredentialWriteRequestSchema, response: C.ProviderCredentialMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/credential\/[^/]+$/, request: C.ProviderCredentialDeleteRequestSchema, response: C.ProviderCredentialMutationResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins$/, response: C.PluginCatalogStateSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/install$/, request: C.PluginInstallRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/uninstall$/, request: C.PluginUninstallRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/apply$/, request: C.PluginApplyRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/marketplace$/, response: C.PluginMarketplaceStateSchema, pluginEgress: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/doctor$/, response: C.PluginDoctorResultSchema },
  { method: 'PATCH', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/(?<pluginName>[^/]+)$/, request: C.PluginConfigureRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/(?<pluginName>[^/]+)\/update$/, request: C.PluginUpdateRequestSchema, response: C.PluginMutationResultSchema, pluginEgress: true },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/local\/(?<extensionId>[^/]+)$/, response: C.LocalExtensionSourceSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/local\/(?<extensionId>[^/]+)$/, request: C.LocalExtensionWriteRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/plugins\/local\/(?<extensionId>[^/]+)$/, request: C.LocalExtensionDeleteRequestSchema, response: C.PluginMutationResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/config$/, response: C.MCPConfigurationStateSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/config$/, request: C.MCPConfigureRequestSchema, response: C.MCPApplyResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/apply$/, request: C.MCPApplyRequestSchema, response: C.MCPApplyResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/test$/, request: C.MCPConnectionTestRequestSchema, response: C.MCPConnectionTestResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/reconnect$/, request: C.MCPWorkspaceReconnectRequestSchema, response: C.MCPWorkspaceReconnectResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/credentials$/, request: C.MCPSecretWriteRequestSchema, response: C.MCPSecretWriteResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, response: C.MCPOAuthResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, request: C.MCPOAuthRequestSchema, response: C.MCPOAuthResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/completions$/, request: C.CompletionRequestSchema, response: C.CompletionResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/completions\/[^/]+\/cancel$/, request: C.CompletionCancelRequestSchema, response: C.CompletionCancelResultSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/history$/, response: C.HistoryPageSchema, query: ['cursor', 'leafTurnId', 'limit'] },
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
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/mcp\/servers\/[^/]+\/oauth$/, request: C.MCPOAuthRequestSchema, response: C.MCPOAuthResultSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/skills\/catalog$/, response: C.SkillsCatalogStateSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/skills\/apply$/, request: C.SkillsApplyRequestSchema, response: C.SkillsApplyResultSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/skills\/expand$/, request: C.SkillExpandRequestSchema, response: C.SkillExpandResultSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs$/, request: C.ShellStartRequestSchema, response: C.ShellJobSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/projects\/(?<projectId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/shell\/jobs$/, response: C.ShellSnapshotSchema, shellObservation: true },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/output$/, response: C.ShellOutputSchema, query: ['epoch', 'workerGeneration', 'cursor', 'tailBytes'], shellObservation: true },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/stop$/, request: C.ShellStopRequestSchema, response: C.ShellStopResultSchema, shellObservation: true },
];

function problem(res, status, code, detail) {
  return res.status(status).type('application/problem+json').json(C.ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status, code, detail, retryable: status >= 500,
  }));
}

function credentialProblem(res, error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
  const parsedCode = C.ProblemCodeSchema.safeParse(error?.code);
  const code = parsedCode.success ? parsedCode.data : 'SERVICE_UNAVAILABLE';
  return problem(res, status, code, status >= 500 ? 'The selected credential owner is unavailable.' : 'The selected credential operation was refused.');
}

function capturedScope(value, expectedWorkspaceId) {
  if (!value || (expectedWorkspaceId !== undefined && value.workspaceId !== expectedWorkspaceId)) return null;
  const { workspaceId, projectId, agentDirectoryId, cwd, agentDirectory } = value;
  const parsed = HostScopeSchema.safeParse({ workspaceId, projectId, agentDirectoryId, cwd, agentDirectory });
  return parsed.success ? parsed.data : null;
}

/** The external Host owns authentication, trusted selection and local delivery before private agent forwarding. */
export function registerCanonicalHostRoutes(app, {
  express, service, uiAuthController, tunnelAuthController, isRequestOriginAllowed, enterprisePolicyOptions,
  resolveWorkspaceScope, resolveWorkspaceDirectory, resolveSessionScope, resolveHostSessionScope, listProjects, listWorkspaces,
  resolveCredentialHandoff, queueRoutes, sessionRoutes, attachmentRoutes,
  skillFileOwner, getSkillRepositoryDependencies,
 }) {
  const validService = service && z.function().safeParse(service.request).success && z.function().safeParse(service.getState).success;
  if (!validService) throw new TypeError('Canonical gateway requires the real Agent Service request/getState');
  const validHttp = express && z.function().safeParse(express.Router).success && z.function().safeParse(express.json).success
    && z.function().safeParse(uiAuthController?.resolveAuthContext).success
    && z.function().safeParse(tunnelAuthController?.classifyRequestScope).success
    && z.function().safeParse(tunnelAuthController?.getTunnelSessionFromRequest).success;
  if (!validHttp) throw new TypeError('Canonical gateway requires the production HTTP and auth owners');
  if (!z.function().safeParse(resolveHostSessionScope).success)
    throw new TypeError('Canonical gateway requires the authorized Host session scope');
  const owners = [isRequestOriginAllowed, resolveWorkspaceScope, resolveWorkspaceDirectory, resolveSessionScope, listProjects, listWorkspaces,
     resolveCredentialHandoff, queueRoutes, sessionRoutes, attachmentRoutes];
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/health', (_req, res) => {
    const { phase } = z.strictObject({ phase: z.string() }).passthrough().parse(service.getState());
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
  router.use(async (req, res, next) => {
    try {
      const requestScope = tunnelAuthController.classifyRequestScope(req);
      const auth = requestScope === 'tunnel' || requestScope === 'unknown-public'
        ? (tunnelAuthController.getTunnelSessionFromRequest(req) ? { type: 'tunnel' } : null)
        : await uiAuthController.resolveAuthContext(req, res, { allowUrlToken: false, allowAnonymousSession: false });
      if (!auth) return problem(res, 401, 'UNAUTHORIZED', 'Authenticate with the Host before using this operation.');
      const explicitOrigin = req.headers.origin !== undefined;
      const verifiedBearer = auth.type === 'client' && /^Bearer\s+\S+$/i.test(req.headers.authorization ?? '');
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if ((explicitOrigin || (mutation && !verifiedBearer)) && !await isRequestOriginAllowed(req))
        return problem(res, 403, 'INVALID_ORIGIN', 'Use an authorized Host client origin.');
      res.locals.canonicalAuthType = auth.type;
      next();
    } catch { return problem(res, 500, 'INTERNAL_ERROR', 'The Host could not authorize the request.'); }
  });
  router.get('/capabilities', async (_req, res) => {
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
    try {
      const response = await service.request(`${PREFIX}/capabilities`);
      if (!response.ok) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent capabilities are unavailable.');
      const capabilities = NativeServiceCapabilitiesSchema.parse(await response.json());
      delete capabilities.capabilities.attachments;
      return res.json(C.RuntimeCapabilitiesSchema.parse({ ...capabilities,
        capabilities: { ...capabilities.capabilities, followUpQueue: true, credentialHandoff: true, documentExtraction: false } }));
    } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent capabilities are unavailable.'); }
  });
  router.get('/projects', async (_req, res) => {
    try { return res.json(C.ProjectListSchema.parse(await listProjects())); }
    catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host project catalog could not be read.'); }
  });
  router.get('/workspaces', async (req, res) => {
    const query = z.strictObject({ projectId: C.EntityIdSchema.optional() }).safeParse(req.query);
    if (!query.success) return problem(res, 400, 'INVALID_REQUEST', 'The workspace discovery query is invalid.');
    try {
      return res.json(C.WorkspaceListSchema.parse(await listWorkspaces(query.data.projectId)));
    } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace catalog could not be read.'); }
  });
  router.post('/workspaces/resolve', express.json({ limit: '64kb', strict: true }), async (req, res) => {
    const parsed = WorkspaceResolveRequestSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.directory.trim()) return problem(res, 400, 'INVALID_REQUEST', 'Provide a directory to resolve.');
    try {
      const scope = await resolveWorkspaceDirectory(parsed.data.directory);
      if (!scope) return problem(res, 404, 'UNAUTHORIZED', 'The requested workspace is not authorized.');
      const result = C.WorkspaceSchema.safeParse({
        workspaceId: scope.workspaceId, projectId: scope.projectId, name: scope.name, displayPath: scope.displayPath,
      });
      if (!result.success) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace projection is unavailable.');
      return res.json(result.data);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof URIError) return problem(res, 400, 'INVALID_REQUEST', 'The workspace directory is invalid.');
      return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace discovery is unavailable.');
    }
  });
  // Queue routes address /sessions/:sessionId/queue and run delivery before any SDK proxy.
  router.use(/^\/sessions\/[^/]+\/queue(?:\/|$)/, express.json({ limit: '1mb', strict: true }));
  queueRoutes(router);
  const sessionRouter = express.Router();
  sessionRoutes(sessionRouter);
  router.use('/sessions', sessionRouter);
  const attachmentRouter = express.Router();
  attachmentRoutes(attachmentRouter);
  router.use('/attachments', attachmentRouter);
  registerSkillFileRoutes(router, { express, owner: skillFileOwner, resolveWorkspaceScope });
  registerSkillRepositoryRoutes(router, {
    express, resolveWorkspaceScope,
    catalogOwner: createSkillCatalogOwner({ owner: skillFileOwner, getDependencies: getSkillRepositoryDependencies, policyOptions: enterprisePolicyOptions }),
  });
  router.post('/credentials/preflight', (_req, res, next) => {
    if (isEnterpriseMode(enterprisePolicyOptions)) return problem(res, 403, 'enterprise_mode', 'Credential handoff is not available in enterprise mode.');
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'No credentials were read because the Agent Service is not ready.');
    next();
  }, express.json({ limit: '256kb', strict: true }), async (req, res) => {
    if (!req.is('application/json')) return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
    const parsed = SelectedCredentialHandoffRequestSchema.safeParse(req.body);
    if (!parsed.success) return problem(res, 400, 'INVALID_REQUEST', 'Provide explicit selected credential intent and consent.');
    try {
      const scope = capturedScope(await resolveWorkspaceScope(parsed.data.workspaceId), parsed.data.workspaceId);
      if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected workspace is not authorized.');
      return res.status(207).json(SelectedCredentialHandoffResultSchema.parse(await resolveCredentialHandoff(parsed.data)));
    } catch (error) { return credentialProblem(res, error); }
  });
  router.use((req, res, next) => {
    const route = AGENT_ROUTES.find(candidate => candidate.method === req.method && candidate.pattern.test(req.path));
    if (!route) return problem(res, 404, 'NOT_IMPLEMENTED', 'No canonical operation matches this route.');
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
    if (route.providerEntry && isEnterpriseMode(enterprisePolicyOptions))
      return problem(res, 403, 'enterprise_mode', 'Provider entry is not available in enterprise mode.');
    if (route.pluginEgress && isEnterpriseMode(enterprisePolicyOptions))
      return problem(res, 403, 'enterprise_mode', 'Native plugin package management and marketplace access are not available in enterprise mode.');
    if (route.request && !req.is('application/json'))
      return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
    res.locals.canonicalProxyRoute = route;
    next();
  });
  router.use(express.json({ limit: '1mb', strict: true }));
  router.use(async (req, res) => {
    const route = res.locals.canonicalProxyRoute;
    const resolveRouteSessionScope = route.shellObservation ? resolveHostSessionScope : resolveSessionScope;
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    try {
      const groups = route.pattern.exec(req.path).groups;
      let scope;
      if (groups?.workspaceId) {
        const workspaceId = C.EntityIdSchema.parse(decodeURIComponent(groups.workspaceId));
        scope = capturedScope(await resolveWorkspaceScope(workspaceId), workspaceId);
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected workspace is not authorized.');
      } else if (groups?.sessionId) {
        const sessionId = C.EntityIdSchema.parse(decodeURIComponent(groups.sessionId));
        scope = capturedScope(await resolveRouteSessionScope(sessionId));
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected session is not authorized.');
      } else if (groups?.projectId) {
        const projectId = C.EntityIdSchema.parse(decodeURIComponent(groups.projectId));
        const projects = C.ProjectListSchema.parse(await listProjects());
        if (!projects.items.some(project => project.projectId === projectId)) return problem(res, 403, 'UNAUTHORIZED', 'The selected project is not authorized.');
      }
      if (route.subagent) {
        const sessionId = C.EntityIdSchema.safeParse(req.query.sessionId);
        if (!sessionId.success) return problem(res, 400, 'INVALID_REQUEST', 'The subagent session identity is invalid.');
        scope = capturedScope(await resolveSessionScope(sessionId.data));
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected session is not authorized.');
      }
      if (groups?.extensionId) C.LocalExtensionIdSchema.parse(decodeURIComponent(groups.extensionId));
      const url = new URL(req.originalUrl, 'http://canonical.invalid');
      for (const key of url.searchParams.keys()) {
        if (!(route.query ?? []).includes(key) || url.searchParams.getAll(key).length !== 1)
          return problem(res, 400, 'INVALID_REQUEST', 'The canonical query is invalid.');
      }
      let usageRequest;
      if (route.usage) {
        const input = Object.fromEntries(url.searchParams);
        for (const key of ['from', 'to']) {
          if (input[key] !== undefined) input[key] = /^\d+$/.test(input[key]) ? Number(input[key]) : NaN;
        }
        const query = C.UsageQuerySchema.parse(input);
        if (query.projectId !== undefined) {
          const projects = C.ProjectListSchema.parse(await listProjects());
          if (Object.keys(projects.errors).length) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host project inventory is incomplete.');
          if (!projects.items.some(project => project.projectId === query.projectId))
            return problem(res, 403, 'UNAUTHORIZED', 'The selected project is not authorized.');
        }
        let workspaceIds;
        if (query.workspaceId !== undefined) workspaceIds = [query.workspaceId];
        else {
          const workspaces = C.WorkspaceListSchema.parse(await listWorkspaces(query.projectId));
          if (Object.keys(workspaces.errors).length) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Host workspace inventory is incomplete.');
          workspaceIds = workspaces.items.filter(workspace => query.projectId === undefined || workspace.projectId === query.projectId).map(workspace => workspace.workspaceId);
        }
        const authorizedScopes = [];
        for (const workspaceId of new Set(workspaceIds)) {
          const authorized = capturedScope(await resolveWorkspaceScope(workspaceId), workspaceId);
          if (!authorized || (query.projectId !== undefined && authorized.projectId !== query.projectId))
            return problem(res, 403, 'UNAUTHORIZED', 'The selected usage scope is not authorized.');
          authorizedScopes.push({ workspaceId: authorized.workspaceId, projectId: authorized.projectId });
        }
        usageRequest = { query, authorizedScopes };
      }
      let body;
      if (route.request) {
        const parsed = route.request.safeParse(req.body);
        if (!parsed.success) return problem(res, 400, 'INVALID_REQUEST', 'The canonical request is invalid.');
        if (groups?.pluginName && decodeURIComponent(groups.pluginName) !== parsed.data.target.name)
          return problem(res, 400, 'INVALID_REQUEST', 'The plugin target does not match its route.');
        if (groups?.extensionId && C.LocalExtensionIdSchema.parse(decodeURIComponent(groups.extensionId)) !== parsed.data.extensionId)
          return problem(res, 400, 'INVALID_REQUEST', 'The extension target does not match its route.');
        if (route.providerOAuth && ['start', 'input', 'commit'].includes(parsed.data.action) && isEnterpriseMode(enterprisePolicyOptions))
          return problem(res, 403, 'enterprise_mode', 'Provider entry is not available in enterprise mode.');
        if ('workspaceId' in parsed.data && parsed.data.workspaceId !== scope?.workspaceId)
          return problem(res, 403, 'UNAUTHORIZED', 'The request does not match the selected workspace.');
        if (groups?.websearchProviderId !== undefined && parsed.data.providerId !== decodeURIComponent(groups.websearchProviderId))
          return problem(res, 400, 'INVALID_REQUEST', 'The credential provider does not match the selected search provider.');
        body = JSON.stringify(parsed.data);
      } else if (req.body !== undefined && !EmptyRequestBodySchema.safeParse(req.body).success) {
        return problem(res, 400, 'INVALID_REQUEST', 'This canonical operation accepts no body.');
      }
      if (usageRequest) body = JSON.stringify(usageRequest);
      const headers = { Accept: route.stream ? 'text/event-stream' : 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (route.stream && req.headers['last-event-id'] !== undefined) {
        const cursor = z.string().safeParse(req.headers['last-event-id']);
        if (!cursor.success) return problem(res, 400, 'INVALID_CURSOR', 'Only one event cursor is accepted.');
        headers['Last-Event-ID'] = cursor.data;
      }
      const target = route.usage ? (req.path === '/usage/tools' ? '/internal/usage/tools' : '/internal/usage') : `${PREFIX}${req.path}${url.search}`;
      const response = await service.request(target, {
        method: route.usage ? 'POST' : req.method, headers, body, signal: controller.signal,
      });
      if (!response.ok) {
        const parsedError = C.ProblemDetailsSchema.safeParse(await response.json());
        if (!parsedError.success) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent error response is invalid.');
        return res.status(response.status).type('application/problem+json').json(parsedError.data);
      }
      if (route.stream) {
        if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'text/event-stream')
          return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent event stream is unavailable.');
        res.status(response.status).set({ 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        // pipeline preserves backpressure; disconnect aborts fetch and cancels the upstream body.
        await pipeline(Readable.fromWeb(response.body), res, { signal: controller.signal });
        return;
      }
      const parsedResult = route.response.safeParse(await response.json());
      if (!parsedResult.success) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent response is invalid.');
      const result = parsedResult.data;
      if (result.workspaceId !== undefined && scope && result.workspaceId !== scope.workspaceId)
        return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The agent response does not match its selected workspace.');
      if (route.response === C.CacheWarmingApplyResultSchema && (!scope || result.persisted.workspaceId !== scope.workspaceId || result.workers.some(outcome => outcome.worker.workspaceId !== scope.workspaceId)))
        return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The cache-warming response does not match its selected workspace.');
      if (route.websearch && (!scope || (result.state?.workspaceId ?? result.workspaceId) !== scope.workspaceId))
        return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The search response does not match its selected workspace.');
      if (route.response === C.ShellSnapshotSchema) {
        for (const job of [...result.running, ...result.ended]) {
          const jobScope = capturedScope(await resolveRouteSessionScope(job.sessionId));
          if (!jobScope || jobScope.projectId !== job.projectId || jobScope.workspaceId !== job.workspaceId)
            return problem(res, 403, 'UNAUTHORIZED', 'The shell observation includes an unauthorized session.');
        }
      }
      return res.status(response.status).json(result);
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      return problem(res, error instanceof z.ZodError || error instanceof URIError ? 400 : 503,
        error instanceof z.ZodError || error instanceof URIError ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE',
        'The canonical operation could not be completed.');
    } finally {
      req.removeListener('aborted', disconnect);
      res.removeListener('close', disconnect);
    }
  });
  router.use((error, _req, res, _next) => {
    if (res.headersSent) { res.destroy(); return; }
    if (error?.type === 'entity.too.large') return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'The canonical request body exceeds its limit.');
    if (error?.type === 'entity.parse.failed' || error?.type === 'request.size.invalid')
      return problem(res, 400, 'INVALID_REQUEST', 'The canonical request body is invalid.');
    if (error?.type === 'encoding.unsupported' || error?.type === 'charset.unsupported')
      return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'The canonical request encoding is unsupported.');
    return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The canonical operation owner is unavailable.');
  });
  app.use(PREFIX, router);
}
