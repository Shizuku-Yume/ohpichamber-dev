import { z } from 'zod';
import { PublicWorkspaceListSchema } from './canonical-contracts.js';

const PREFIX = '/api/agent/v1';
const privateScopeSchema = z.object({ workspaceId: z.string(), agentDirectoryId: z.string(), cwd: z.string(), agentDirectory: z.string() }).strict();
const selectionSchema = z.object({ providerId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), source: z.enum(['stored-credential', 'managed-environment', 'external-environment']), credentialType: z.enum(['key', 'oauth']), credentialRef: z.string().min(1).max(128).optional() }).strict();
const preflightSchema = z.object({ intent: z.literal('credential-handoff'), consent: z.literal(true), workspaceId: z.string().min(1), selections: z.array(selectionSchema).min(1).max(16) }).strict();
const problem = (res, status, code, title, detail, retryable = false, details) => { const body = { type: `urn:ohpichamber:problem:${code}`, title, status, detail, code, retryable }; if (details !== undefined) body.details = details; return res.status(status).type('application/problem+json').json(body); };
const safeServiceError = (error) => ({ status: error?.status >= 400 && error.status <= 599 ? error.status : 503, code: typeof error?.code === 'string' ? error.code : 'SERVICE_UNAVAILABLE' });

/** Canonical Host gateway. Main supplies the real Agent Service and authoritative private scope resolvers. */
export const registerCanonicalHostRoutes = (app, {
  express, service, uiAuthController, tunnelAuthController, isRequestOriginAllowed,
  enterprisePolicyOptions, resolveWorkspaceScope, resolveSessionScope, listProjects, listWorkspaces,
  resolveSelectedCredential, queueRoutes, sessionRoutes, attachmentRoutes,
}) => {
  if (!service || typeof service.request !== 'function') throw new TypeError('Canonical gateway requires the Agent Service');
  if (typeof resolveWorkspaceScope !== 'function' || typeof resolveSessionScope !== 'function') throw new TypeError('Canonical gateway requires Host scope resolvers');
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/health', (_req, res) => { const state = service.getState?.() ?? {}; res.json({ status: 'ok', engine: 'omp', agent: { ready: state.ready === true, status: state.status ?? 'unknown' } }); });
  router.get('/ready', (_req, res) => { const state = service.getState?.() ?? {}; if (state.ready !== true) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent Service unavailable', 'The OMP Agent Service is not ready.', true); return res.json({ ready: true, engine: 'omp', version: state.version ?? '1.0.0' }); });
  router.use(async (req, res, next) => {
    try {
      const scope = tunnelAuthController.classifyRequestScope(req);
      const auth = scope === 'tunnel' || scope === 'unknown-public' ? (tunnelAuthController.getTunnelSessionFromRequest(req) ? { type: 'tunnel' } : null) : await uiAuthController.resolveAuthContext(req, res, { allowUrlToken: false, allowAnonymousSession: false });
      if (!auth) return problem(res, 401, 'UNAUTHORIZED', 'Authentication required', 'Authenticate with the Host before using this operation.');
      if (req.headers.origin && !await isRequestOriginAllowed(req)) return problem(res, 403, 'INVALID_ORIGIN', 'Origin refused', 'Use an authorized Host client origin.');
      res.locals.canonicalAuthType = auth.type; next();
    } catch { problem(res, 500, 'INTERNAL_ERROR', 'Host request failed', 'The Host could not authorize the request.'); }
  });
  router.use('/attachments', attachmentRoutes ?? ((_req, res) => problem(res, 503, 'UNSUPPORTED_CAPABILITY', 'Attachments unavailable', 'The Host attachment owner is unavailable.')));
  router.get('/projects', async (_req, res) => { if (!listProjects) return problem(res, 503, 'UNSUPPORTED_CAPABILITY', 'Projects unavailable', 'The Host project catalog is unavailable.'); try { return res.json(await listProjects()); } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Projects unavailable', 'The Host project catalog could not be read.', true); } });
  router.get('/workspaces', async (req, res) => { if (!listWorkspaces) return problem(res, 503, 'UNSUPPORTED_CAPABILITY', 'Workspaces unavailable', 'The Host workspace catalog is unavailable.'); try { const result = await listWorkspaces(typeof req.query.projectId === 'string' ? req.query.projectId : undefined); const safe = { items: (result?.items ?? []).map(({ workspaceId, projectId, name, displayPath }) => ({ workspaceId, projectId, name, displayPath: displayPath ?? null })), errors: result?.errors ?? [] }; return res.json(PublicWorkspaceListSchema.parse(safe)); } catch { return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Workspaces unavailable', 'The Host workspace catalog could not be read.', true); } });
  router.post('/credentials/preflight', express.json({ limit: '16kb', strict: true }), async (req, res) => {
    if (!req.is('application/json')) return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON required', 'Send an application/json request body.');
    if (isEnterpriseMode(enterprisePolicyOptions)) return problem(res, 403, 'ENTERPRISE_POLICY', 'Provider entry refused', 'Credential handoff is not available in enterprise mode.');
    const parsed = preflightSchema.safeParse(req.body); if (!parsed.success) return problem(res, 400, 'INVALID_REQUEST', 'Invalid credential intent', 'Provide explicit credential-handoff intent, consent, workspace and selected descriptors.');
    const scope = resolveWorkspaceScope(parsed.data.workspaceId); if (!scope || !privateScopeSchema.safeParse(scope).success) return problem(res, 403, 'FORBIDDEN', 'Workspace refused', 'The selected workspace is not authorized.');
    if (!service.getState?.().ready) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent Service unavailable', 'No credentials were read or imported because the Agent Service is not ready.', true);
    if (!resolveSelectedCredential) return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Credential handoff unavailable', 'The selected credential owner is unavailable.', true);
    const results = []; for (const selection of parsed.data.selections) { try { results.push(await resolveSelectedCredential({ ...selection, workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId })); } catch (error) { const failure = safeServiceError(error); results.push({ providerId: selection.providerId, status: failure.code === 'OAUTH_REAUTH_REQUIRED' ? 're-auth-required' : failure.code === 'CREDENTIAL_UNAVAILABLE' ? 'unavailable' : 'unsupported', code: failure.code }); } }
    return res.status(207).json({ workspaceId: scope.workspaceId, results });
  });
  app.use(PREFIX, router);
};
