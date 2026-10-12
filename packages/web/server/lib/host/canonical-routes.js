import { z } from 'zod';
import { isEnterpriseMode } from '../enterprise-mode.js';

const PREFIX = '/api/agent/v1';
const selectionSchema = z.object({
  providerId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  source: z.enum(['stored-credential', 'managed-environment', 'external-environment']),
  credentialType: z.enum(['key', 'oauth']),
}).strict();
const preflightSchema = z.object({
  intent: z.literal('credential-handoff'),
  consent: z.literal(true),
  selections: z.array(selectionSchema).min(1).max(16),
}).strict().refine(({ selections }) => new Set(selections.map(
  ({ providerId, source, credentialType }) => `${providerId}:${source}:${credentialType}`,
)).size === selections.length);

const observedOAuthProviders = new Set(['anthropic', 'openai-codex', 'github-copilot', 'google-gemini-cli']);
const observedOfficialKeyProviders = new Set(['anthropic', 'openai', 'google']);

const problem = (res, status, code, title, detail, retryable = false, details) => {
  const body = { type: `urn:ohpichamber:problem:${code}`, title, status, detail, code, retryable };
  if (details !== undefined) body.details = details;
  return res.status(status).type('application/problem+json').json(body);
};

const unavailableAgent = () => ({ status: 'unavailable', ready: false });

const preflightResult = (selection) => {
  const { providerId, source, credentialType } = selection;
  if (providerId === 'opencode') {
    return { ...selection, status: 'unsupported', code: 'CONSOLE_CREDENTIAL_UNSUPPORTED' };
  }
  if (credentialType === 'oauth') {
    if (source !== 'stored-credential' || !observedOAuthProviders.has(providerId)) {
      return { ...selection, status: 'unsupported', code: 'CREDENTIAL_FORMAT_UNSUPPORTED' };
    }
    // M0 did not establish conversion, refresh, scopes, or account selection.
    return { ...selection, status: 're-auth-required', code: 'OAUTH_REAUTH_REQUIRED' };
  }
  if (source === 'external-environment') {
    return { ...selection, status: 'unavailable', code: 'LEGACY_ENVIRONMENT_UNAVAILABLE' };
  }
  if (observedOfficialKeyProviders.has(providerId)) {
    return { ...selection, status: 'unavailable', code: 'PROVIDER_CONVERSION_UNVERIFIED' };
  }
  return { ...selection, status: 'unavailable', code: 'AGENT_SERVICE_UNAVAILABLE' };
};

/** M1 refuses handoff; task 22 replaces this refusal with the real private service owner. */
export const registerCanonicalHostRoutes = (app, {
  express,
  uiAuthController,
  tunnelAuthController,
  isRequestOriginAllowed,
  enterprisePolicyOptions,
}) => {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', engine: 'omp', agent: unavailableAgent() });
  });
  router.get('/ready', (_req, res) => problem(
    res, 503, 'SERVICE_UNAVAILABLE', 'Agent Service unavailable',
    'The OMP Agent Service is not available.', true,
  ));

  router.use(async (req, res, next) => {
    try {
      const scope = tunnelAuthController.classifyRequestScope(req);
      let auth;
      if (scope === 'tunnel' || scope === 'unknown-public') {
        auth = tunnelAuthController.getTunnelSessionFromRequest(req) ? { type: 'tunnel' } : null;
      } else {
        auth = await uiAuthController.resolveAuthContext(req, res, {
          allowUrlToken: false,
          allowAnonymousSession: false,
        });
      }
      if (!auth) {
        return problem(res, 401, 'UNAUTHORIZED', 'Authentication required',
          'Authenticate with the Host before using this operation.');
      }
      res.locals.canonicalAuthType = auth.type;
      next();
    } catch {
      problem(res, 500, 'INTERNAL_ERROR', 'Host request failed', 'The Host could not authorize the request.');
    }
  });

  router.get('/capabilities', (_req, res) => res.json({
    version: '1.0.0',
    engine: 'omp',
    agent: unavailableAgent(),
    capabilities: {
      streaming: false,
      casApprovals: false,
      midTurnSteering: false,
      followUpQueue: false,
      subagents: false,
      sessionBranching: false,
      reasoningParts: false,
      documentExtraction: false,
      credentialHandoff: false,
    },
  }));

  router.post('/credentials/preflight', async (req, res, next) => {
    try {
      const origin = req.headers.origin;
      // Only a validated paired client can omit Origin. Cookies never grant this bypass.
      if (origin ? !await isRequestOriginAllowed(req) : res.locals.canonicalAuthType !== 'client') {
        return problem(res, 403, 'INVALID_ORIGIN', 'Origin refused', 'Use an authorized Host client origin.');
      }
      if (isEnterpriseMode(enterprisePolicyOptions)) {
        return problem(res, 403, 'enterprise_mode', 'Provider entry refused',
          'Credential handoff is not available in enterprise mode.');
      }
      if (!req.is('application/json')) {
        return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON required', 'Send an application/json request body.');
      }
      next();
    } catch {
      problem(res, 500, 'INTERNAL_ERROR', 'Host request failed', 'The Host could not check the request boundary.');
    }
  }, express.json({ limit: '16kb', strict: true }), (req, res) => {
    const parsed = preflightSchema.safeParse(req.body);
    if (!parsed.success) {
      return problem(res, 400, 'INVALID_REQUEST', 'Invalid credential intent',
        'Provide explicit credential-handoff intent, consent, and selected nonsecret credential descriptors.');
    }
    // No legacy source, SDK store, staging writer, or process launcher is reachable here.
    return problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent Service unavailable',
      'No credentials were read or imported. The real Agent Service handoff is not available.', true,
      { results: parsed.data.selections.map(preflightResult) });
  });

  router.use((_req, res) => problem(res, 503, 'SERVICE_UNAVAILABLE', 'Agent Service unavailable',
    'The OMP Agent Service is not available.', true));
  router.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') {
      return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'Request too large', 'The preflight body exceeds 16 KiB.');
    }
    if (error.type === 'entity.parse.failed') {
      return problem(res, 400, 'INVALID_REQUEST', 'Invalid JSON', 'Send a valid JSON object.');
    }
    return problem(res, 400, 'INVALID_REQUEST', 'Invalid request body', 'The request body could not be read.');
  });
  app.use(PREFIX, router);
};
