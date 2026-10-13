import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { SelectedCredentialHandoffRequestSchema, SelectedCredentialHandoffResultSchema } from '@openchamber/agent-service/private-protocol';
import { isEnterpriseMode } from '../enterprise-mode.js';

const PREFIX = '/api/agent/v1';
const ScopeSchema = z.strictObject({
  workspaceId: C.EntityIdSchema, projectId: C.EntityIdSchema, agentDirectoryId: C.EntityIdSchema,
  cwd: z.string().refine(isAbsolute), agentDirectory: z.string().refine(isAbsolute),
});
const RunResponseSchema = z.strictObject({ run: C.RunSchema });
// Only SDK-owned operations appear here. Host session admission, metadata and delivery have their own routers.
const AGENT_ROUTES = [
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/models$/, response: C.ModelCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers$/, response: C.ProviderCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents$/, response: C.AgentCatalogSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents$/, request: C.AgentCreateRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents\/[^/]+$/, request: C.AgentUpdateRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/agents\/[^/]+$/, request: C.AgentDeleteRequestSchema, response: C.AgentMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/config$/, request: C.ProviderConfigureRequestSchema, response: C.ProviderMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+$/, request: C.ProviderDeleteRequestSchema, response: C.ProviderMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/models\/[^/]+$/, request: C.ModelConfigureRequestSchema, response: C.ModelMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/models\/[^/]+$/, request: C.ModelDeleteRequestSchema, response: C.ModelMutationResultSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/credential$/, request: C.ProviderCredentialWriteRequestSchema, response: C.ProviderCredentialMutationResultSchema, providerEntry: true },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/providers\/[^/]+\/credential\/[^/]+$/, request: C.ProviderCredentialDeleteRequestSchema, response: C.ProviderCredentialMutationResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/completions$/, request: C.CompletionRequestSchema, response: C.CompletionResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/completions\/[^/]+\/cancel$/, request: C.CompletionCancelRequestSchema, response: C.CompletionCancelResultSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/snapshot$/, response: C.SessionSnapshotSchema },
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
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs$/, request: C.ShellStartRequestSchema, response: C.ShellJobSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema },
  { method: 'GET', pattern: /^\/projects\/(?<projectId>[^/]+)\/shell\/jobs$/, response: C.ShellSnapshotSchema },
  { method: 'GET', pattern: /^\/shell\/jobs$/, response: C.ShellSnapshotSchema },
  { method: 'GET', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/output$/, response: C.ShellOutputSchema, query: ['epoch', 'workerGeneration', 'cursor', 'tailBytes'] },
  { method: 'POST', pattern: /^\/sessions\/(?<sessionId>[^/]+)\/shell\/jobs\/[^/]+\/stop$/, request: C.ShellStopRequestSchema, response: C.ShellStopResultSchema },
];

function problem(res, status, code, detail) {
  return res.status(status).type('application/problem+json').json(C.ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status, code, detail, retryable: status >= 500,
  }));
}

function capturedScope(value, expectedWorkspaceId) {
  if (!value || (expectedWorkspaceId !== undefined && value.workspaceId !== expectedWorkspaceId)) return null;
  const { workspaceId, projectId, agentDirectoryId, cwd, agentDirectory } = value;
  const parsed = ScopeSchema.safeParse({ workspaceId, projectId, agentDirectoryId, cwd, agentDirectory });
  return parsed.success ? parsed.data : null;
}

/** The external Host owns authentication, trusted selection and local delivery before private agent forwarding. */
export function registerCanonicalHostRoutes(app, {
  express, service, uiAuthController, tunnelAuthController, isRequestOriginAllowed, enterprisePolicyOptions,
  resolveWorkspaceScope, resolveSessionScope, listProjects, listWorkspaces,
  resolveCredentialHandoff, queueRoutes, sessionRoutes, attachmentRoutes,
}) {
  if (!service || typeof service.request !== 'function' || typeof service.getState !== 'function')
    throw new TypeError('Canonical gateway requires the real Agent Service request/getState');
  if (!express || typeof express.Router !== 'function' || typeof express.json !== 'function'
    || typeof uiAuthController?.resolveAuthContext !== 'function'
    || typeof tunnelAuthController?.classifyRequestScope !== 'function'
    || typeof tunnelAuthController?.getTunnelSessionFromRequest !== 'function')
    throw new TypeError('Canonical gateway requires the production HTTP and auth owners');
  for (const value of [isRequestOriginAllowed, resolveWorkspaceScope, resolveSessionScope, listProjects, listWorkspaces,
    resolveCredentialHandoff, queueRoutes, sessionRoutes, attachmentRoutes]) {
    if (typeof value !== 'function') throw new TypeError('Canonical gateway requires every scoped local owner');
  }
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/health', (_req, res) => {
    const { phase } = service.getState();
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
      const capabilities = C.RuntimeCapabilitiesSchema.parse(await response.json());
      return res.json(C.RuntimeCapabilitiesSchema.parse({ ...capabilities,
        capabilities: { ...capabilities.capabilities, followUpQueue: true, credentialHandoff: true } }));
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
  // Queue routes address /sessions/:sessionId/queue and run delivery before any SDK proxy.
  router.use(queueRoutes);
  router.use('/sessions', sessionRoutes);
  router.use('/attachments', attachmentRoutes);
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
    } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The selected credential owner is unavailable.'); }
  });
  router.use((req, res, next) => {
    const route = AGENT_ROUTES.find(candidate => candidate.method === req.method && candidate.pattern.test(req.path));
    if (!route) return problem(res, 404, 'NOT_IMPLEMENTED', 'No canonical operation matches this route.');
    if (service.getState().phase !== 'ready') return problem(res, 503, 'SERVICE_UNAVAILABLE', 'The Agent Service is not ready.');
    if (route.providerEntry && isEnterpriseMode(enterprisePolicyOptions))
      return problem(res, 403, 'enterprise_mode', 'Provider entry is not available in enterprise mode.');
    if (route.request && !req.is('application/json'))
      return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
    res.locals.canonicalProxyRoute = route;
    next();
  });
  router.use(express.json({ limit: '1mb', strict: true }));
  router.use(async (req, res) => {
    const route = res.locals.canonicalProxyRoute;
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
        scope = capturedScope(await resolveSessionScope(sessionId));
        if (!scope) return problem(res, 403, 'UNAUTHORIZED', 'The selected session is not authorized.');
      } else if (groups?.projectId) {
        const projectId = C.EntityIdSchema.parse(decodeURIComponent(groups.projectId));
        const projects = C.ProjectListSchema.parse(await listProjects());
        if (!projects.items.some(project => project.projectId === projectId)) return problem(res, 403, 'UNAUTHORIZED', 'The selected project is not authorized.');
      }
      const url = new URL(req.originalUrl, 'http://canonical.invalid');
      for (const key of url.searchParams.keys()) {
        if (!(route.query ?? []).includes(key) || url.searchParams.getAll(key).length !== 1)
          return problem(res, 400, 'INVALID_REQUEST', 'The canonical query is invalid.');
      }
      let body;
      if (route.request) {
        const parsed = route.request.safeParse(req.body);
        if (!parsed.success) return problem(res, 400, 'INVALID_REQUEST', 'The canonical request is invalid.');
        if ('workspaceId' in parsed.data && parsed.data.workspaceId !== scope?.workspaceId)
          return problem(res, 403, 'UNAUTHORIZED', 'The request does not match the selected workspace.');
        body = JSON.stringify(parsed.data);
      } else if (req.body !== undefined && (typeof req.body !== 'object' || Object.keys(req.body).length > 0)) {
        return problem(res, 400, 'INVALID_REQUEST', 'This canonical operation accepts no body.');
      }
      const headers = { Accept: route.stream ? 'text/event-stream' : 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (route.stream && req.headers['last-event-id'] !== undefined) {
        if (typeof req.headers['last-event-id'] !== 'string') return problem(res, 400, 'INVALID_CURSOR', 'Only one event cursor is accepted.');
        headers['Last-Event-ID'] = req.headers['last-event-id'];
      }
      const response = await service.request(`${PREFIX}${req.path}${url.search}`, {
        method: req.method, headers, body, signal: controller.signal,
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
      if (route.response === C.ShellSnapshotSchema) {
        for (const job of [...result.running, ...result.ended]) {
          const jobScope = capturedScope(await resolveSessionScope(job.sessionId));
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
