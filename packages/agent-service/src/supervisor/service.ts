import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import { AgentServiceReadySchema, ApprovalReplySchema, EntityIdSchema, HistoryPageRequestSchema, ProblemDetailsSchema, PromptRequestSchema, QuestionReplySchema, MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPReconnectRequestSchema, SkillsApplyRequestSchema, SkillExpandRequestSchema, ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema } from '@openchamber/agent-contract';
import type { AgentServiceReady, ApprovalRequest, CanonicalEvent, HistoryPage, ProblemCode, ProblemDetails, QuestionRequest, Run, RuntimeSession, SessionDeleteAck, SessionSnapshot, StreamInvalidated } from '@openchamber/agent-contract';
import { WorkerBootstrapSchema, WorkerOperationSchema } from '../protocol.ts';
import type { WorkerInfo, WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { PrivateSessionBootstrapSchema, SessionRegistry } from '../sessions/registry.ts';
import type { ApprovalPolicyCommit, ApprovalPolicyLoad } from '../interaction/manager.ts';
import type { SessionList } from '../sessions/registry.ts';
import { SessionReferenceError } from '../sessions/references.ts';
import { WorkerOperationError, WorkerRegistry } from './workers.ts';
import { CatalogResultSchema } from '../catalogs/protocol.ts';
import { CatalogCoordinator } from './catalog.ts';
interface ServiceOptions {
  workerEntrypoint: string;
  internalSecret: string;
  stateDirectory: string;
  port?: number;
  approvalPolicyCommit?: ApprovalPolicyCommit;
  approvalPolicyLoad?: ApprovalPolicyLoad;
  catalogWorkspaceId?: string;
  policyCheck?: (rootSessionId: string, request: WorkerPolicyRequest) => Promise<WorkerPolicyResult>;
}
const InternalSecretSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const ListeningAddressSchema = z.object({ address: z.literal('127.0.0.1'), port: z.number().int().min(1).max(65_535) });
class RequestError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string) { super(message); }
}
type JsonResponse = AgentServiceReady | WorkerInfo | { workers: WorkerInfo[] } | RuntimeSession | SessionSnapshot | HistoryPage | { run: Run } | SessionDeleteAck | ApprovalRequest[] | QuestionRequest[] | ApprovalRequest | QuestionRequest | SessionList | Record<string, unknown>;
function respondJson(response: ServerResponse, status: number, body: JsonResponse): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
function respondHealth(response: ServerResponse, ready: boolean): void {
  respondJson(response, 200, { status: ready ? 'ready' : 'starting', engine: 'omp', version: '1.0.0' });
}
function respondProblem(response: ServerResponse, status: number, code: ProblemCode, detail: string): void {
  const problem: ProblemDetails = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status, code, detail, retryable: status >= 500,
  });
  response.writeHead(status, { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(problem));
}
async function readBody<T>(request: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const decoder = new StringDecoder('utf8');
  let bytes = 0;
  let text = '';
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) throw new RequestError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds the service limit');
    text += decoder.write(chunk);
  }
  text += decoder.end();
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Request body is invalid'); }
}
function identity(value: string): string {
  try { return EntityIdSchema.parse(decodeURIComponent(value)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Route identity is invalid'); }
}

export class AgentService {
  private readonly secret: Buffer;
  private readonly workers: WorkerRegistry;
  private readonly sessions: SessionRegistry;
  private readonly catalog: CatalogCoordinator;
  private server: ReturnType<typeof createServer> | undefined;
  private ready = false;
  private closing = false;
  constructor(private readonly options: ServiceOptions) {
    this.secret = Buffer.from(InternalSecretSchema.parse(options.internalSecret), 'hex');
    this.catalog = new CatalogCoordinator(options.stateDirectory, options.catalogWorkspaceId ?? 'workspace');
    this.workers = new WorkerRegistry({ workerEntrypoint: options.workerEntrypoint, policyCheck: options.policyCheck, callbacks: {
      onOpened: (...args) => {
        this.sessions.onOpened(...args);
        const rootSessionId = args[0];
        const generation = args[1];
        this.catalog.register({ identity: { rootSessionId, workspaceId: this.options.catalogWorkspaceId ?? 'workspace', workerGeneration: generation }, mcp: { read: async configuration => { const result = await this.workers.request(rootSessionId, { type: 'mcp', operation: { type: 'read', configuration } }); if (result.type !== 'mcp' || result.result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); return result.result.catalog; }, apply: async (request, configuration) => { const result = await this.workers.request(rootSessionId, { type: 'mcp', operation: { type: 'apply', request, configuration } }); if (result.type !== 'mcp' || result.result.type !== 'applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); return result.result.result; }, reconnect: async (serverId, request, configuration) => { const result = await this.workers.request(rootSessionId, { type: 'mcp', operation: { type: 'reconnect', serverId, request, configuration } }); if (result.type !== 'mcp' || result.result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); return result.result.catalog; } }, skills: { read: async sources => { const result = await this.workers.request(rootSessionId, { type: 'catalog', revision: this.catalog.revision(), operation: { type: 'skills.read', persistedSources: sources } }); if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); const parsed = CatalogResultSchema.parse(result.result); if (parsed.type !== 'skills.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); return parsed.catalog; }, apply: async sources => { const result = await this.workers.request(rootSessionId, { type: 'catalog', revision: this.catalog.revision(), operation: { type: 'skills.apply', request: { scope: 'workspace', sourceRevision: sources.workspace }, sources, catalogRevision: this.catalog.revision() } }); if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); const parsed = CatalogResultSchema.parse(result.result); if (parsed.type !== 'skills.applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); return parsed.result; }, expand: async request => { const result = await this.workers.request(rootSessionId, { type: 'catalog', revision: request.catalogRevision, operation: { type: 'skills.expand', request } }); if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); const parsed = CatalogResultSchema.parse(result.result); if (parsed.type !== 'skills.expanded') throw new WorkerOperationError(503, 'INTERNAL_ERROR'); return parsed.result; } } });
      },
      onEvents: (...args) => this.sessions.onEvents(...args),
      onInteraction: (...args) => this.sessions.onInteraction(...args),
      onExit: (...args) => { this.sessions.onExit(...args); this.catalog.retire(args[0], args[1]); },
    } });
    this.sessions = new SessionRegistry(options.stateDirectory, this.workers, options.approvalPolicyCommit, options.approvalPolicyLoad);
  }
  async start(): Promise<void> {
    await this.catalog.initialize();
    await this.sessions.initialize();
    const server = createServer((request, response) => { void this.handle(request, response); });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port ?? 0, '127.0.0.1', resolve);
    });
    const address = ListeningAddressSchema.parse(server.address());
    process.stdout.write(`${JSON.stringify({ type: 'agent-service.listening', port: address.port })}\n`);
    let profile: string | undefined;
    try {
      profile = await mkdtemp(join(tmpdir(), 'ohpichamber-agent-ready-'));
      const cwd = join(profile, 'workspace');
      const agentDirectory = join(profile, 'agent');
      const sessionsDirectory = join(profile, 'sessions');
      await Promise.all([cwd, agentDirectory, sessionsDirectory].map(path => mkdir(path, { mode: 0o700 })));
      const rootSessionId = randomUUID();
      await this.workers.start({ rootSessionId, projectId: randomUUID(), workspaceId: randomUUID(), cwd, agentDirectory, sessionsDirectory,
        env: { HOME: profile, XDG_CONFIG_HOME: join(profile, 'config'), XDG_DATA_HOME: join(profile, 'data') },
      });
      if (!await this.workers.stop(rootSessionId)) throw new Error('SDK readiness disposal failed');
      if (!this.closing) this.ready = true;
    } catch (error) { await this.stop(); throw error; }
    finally { if (profile) await rm(profile, { recursive: true, force: true }); }
  }
  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.ready = false;
    this.closing = true;
    this.stopping = (async () => {
      const server = this.server;
      this.server = undefined;
      // Close streams before waiting for HTTP shutdown or worker disposal.
      await this.sessions.close();
      const closed = server ? new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      }) : Promise.resolve();
      await this.workers.close();
      await closed;
    })();
    return this.stopping;
  }
  private authenticated(request: IncomingMessage): boolean {
    const peer = request.socket.remoteAddress;
    if (peer !== '127.0.0.1' && peer !== '::ffff:127.0.0.1') return false;
    const presented = InternalSecretSchema.safeParse(request.headers['x-internal-secret']);
    return presented.success && timingSafeEqual(Buffer.from(presented.data, 'hex'), this.secret);
  }
  private stream(request: IncomingMessage, response: ServerResponse, sessionId: string, url: URL): void {
    const header = request.headers['last-event-id'];
    if (Array.isArray(header)) throw new RequestError(400, 'INVALID_CURSOR', 'Only one event cursor is accepted');
    const cursors = url.searchParams.getAll('cursor');
    const cursor = cursors[0];
    if (cursors.length > 1 || (header !== undefined && cursor !== undefined && header !== cursor)) {
      throw new RequestError(400, 'INVALID_CURSOR', 'Event cursor sources disagree');
    }
    const journal = this.sessions.journal(sessionId);
    const write = (event: CanonicalEvent | StreamInvalidated): void => {
      if (response.destroyed || response.writableEnded) return;
      if (event.type === 'stream.invalidated') {
        response.end(`event: stream.invalidated\ndata: ${JSON.stringify(event)}\n\n`);
        return;
      }
      if (!response.write(`id: ${event.epoch}:${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)) {
        subscription.unsubscribe();
        const invalidated: StreamInvalidated = { type: 'stream.invalidated', sessionId, epoch: event.epoch, reason: 'DELIVERY_OVERFLOW' };
        response.end(`event: stream.invalidated\ndata: ${JSON.stringify(invalidated)}\n\n`);
      }
    };
    // Subscribe and write captured replay in one synchronous turn.
    const subscription = journal.subscribe(header ?? cursor, write);
    response.once('close', subscription.unsubscribe);
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    response.flushHeaders();
    for (const event of subscription.replay) {
      write(event);
      if (response.writableEnded || response.destroyed) break;
    }
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.authenticated(request)) { respondProblem(response, 403, 'UNAUTHORIZED', 'Private loopback authentication is required'); return; }
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/health') { respondHealth(response, this.ready && !this.closing); return; }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/ready') {
        if (!this.ready) respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'SDK initialization is unavailable');
        else respondJson(response, 200, AgentServiceReadySchema.parse({ ready: true, engine: 'omp', version: '1.0.0' }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/capabilities') {
        respondJson(response, 200, { version: '1.0.0', engine: 'omp', capabilities: { streaming: true, casApprovals: true, midTurnSteering: false, followUpQueue: false, subagents: false, attachments: false, models: true, mcp: true, skills: true } });
        return;
      }
      if (!this.ready || this.closing) { respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Agent Service is not admitting work'); return; }
      if (request.method === 'POST' && url.pathname === '/internal/sessions') {
        respondJson(response, 201, await this.sessions.open(await readBody(request, PrivateSessionBootstrapSchema))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/sessions') {
        const workspaceId = EntityIdSchema.safeParse(url.searchParams.get('workspaceId'));
        if (!workspaceId.success) throw new RequestError(400, 'INVALID_REQUEST', 'Workspace identity is required');
        respondJson(response, 200, this.sessions.list(workspaceId.data)); return;
      }
      const privateRun = /^\/internal\/sessions\/([^/]+)\/runs$/.exec(url.pathname);
      if (privateRun && request.method === 'POST') {
        const operation = await readBody(request, WorkerOperationSchema.options[0]);
        respondJson(response, 202, { run: await this.sessions.prompt(identity(privateRun[1]), operation) }); return;
      }
      const approvalList = /^\/api\/agent\/v1\/sessions\/([^/]+)\/approvals$/.exec(url.pathname);
      if (approvalList && request.method === 'GET') { respondJson(response, 200, this.sessions.approvals(identity(approvalList[1]))); return; }
      const approvalRespond = /^\/api\/agent\/v1\/sessions\/([^/]+)\/approvals\/([^/]+)\/respond$/.exec(url.pathname);
      if (approvalRespond && request.method === 'POST') {
        const sessionId = identity(approvalRespond[1]);
        respondJson(response, 200, await this.sessions.resolveApproval(sessionId, identity(approvalRespond[2]), await readBody(request, ApprovalReplySchema))); return;
      }
      const questionList = /^\/api\/agent\/v1\/sessions\/([^/]+)\/questions$/.exec(url.pathname);
      if (questionList && request.method === 'GET') { respondJson(response, 200, this.sessions.questions(identity(questionList[1]))); return; }
      const questionRespond = /^\/api\/agent\/v1\/sessions\/([^/]+)\/questions\/([^/]+)\/respond$/.exec(url.pathname);
      if (questionRespond && request.method === 'POST') {
        const sessionId = identity(questionRespond[1]);
        respondJson(response, 200, await this.sessions.resolveQuestion(sessionId, identity(questionRespond[2]), await readBody(request, QuestionReplySchema))); return;
      }
      const sessionRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)(?:\/(snapshot|history|events)|\/(runs)(?:\/([^/]+)\/abort)?)?$/.exec(url.pathname);
      if (sessionRoute) {
        const sessionId = identity(sessionRoute[1]);
        const action = sessionRoute[2] ?? sessionRoute[3];
        if (action === undefined && request.method === 'GET') { respondJson(response, 200, this.sessions.runtime(sessionId)); return; }
        if (action === undefined && request.method === 'DELETE') { respondJson(response, 200, await this.sessions.delete(sessionId)); return; }
        if (action === 'snapshot' && request.method === 'GET') { respondJson(response, 200, this.sessions.journal(sessionId).snapshot()); return; }
        if (action === 'history' && request.method === 'GET') {
          const parsed = HistoryPageRequestSchema.safeParse({ sessionId,
            cursor: url.searchParams.get('cursor') ?? undefined,
            leafTurnId: url.searchParams.get('leafTurnId') ?? undefined,
            limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
          });
          if (!parsed.success) throw new RequestError(400, 'INVALID_REQUEST', 'History request is invalid');
          respondJson(response, 200, await this.sessions.history(parsed.data)); return;
        }
        if (action === 'events' && request.method === 'GET') { this.stream(request, response, sessionId, url); return; }
        if (action === 'runs' && request.method === 'POST') {
          if (sessionRoute[4] !== undefined) { respondJson(response, 200, { run: await this.sessions.abort(sessionId, identity(sessionRoute[4])) }); return; }
          const prompt = await readBody(request, PromptRequestSchema);
          respondJson(response, 202, { run: await this.sessions.prompt(sessionId, { type: 'prompt', runId: randomUUID(), request: prompt }) }); return;
        }
      }
      const shellRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/shell$/.exec(url.pathname);
      if (shellRoute && request.method === 'POST') {
        const sessionId = identity(shellRoute[1]);
        const operation = await readBody(request, z.object({ type: z.enum(['start','output','snapshot','stop']), request: z.unknown().optional() }));
        const result = await this.workers.request(sessionId, { type: 'shell', operation: operation as never });
        if (result.type !== 'shell') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        respondJson(response, 200, result.result); return;
      }
      const completionRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/completion$/.exec(url.pathname);
      if (completionRoute && request.method === 'POST') {
        const sessionId = identity(completionRoute[1]);
        const operation = await readBody(request, z.object({ type: z.enum(['complete','cancel']), request: z.unknown().optional() }));
        const result = await this.workers.request(sessionId, { type: 'completion', operation: operation as never });
        if (result.type !== 'completion') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        respondJson(response, 200, result.result); return;
      }
      const credentialRoute = /^\/api\/agent\/v1\/providers\/([^/]+)\/credentials$/.exec(url.pathname);
      if (credentialRoute && request.method === 'PUT') {
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Session identity is required');
        const body = await readBody(request, ProviderCredentialWriteRequestSchema);
        const result = await this.workers.request(identity(sessionId), { type: 'catalog', revision: body.expectedRevision, operation: { type: 'credential.write', request: { ...body, providerId: identity(credentialRoute[1]) } } as never });
        if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        respondJson(response, 200, result.result); return;
      }
      const credentialDelete = /^\/api\/agent\/v1\/providers\/([^/]+)\/credentials\/([^/]+)$/.exec(url.pathname);
      if (credentialDelete && request.method === 'DELETE') {
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Session identity is required');
        const body = await readBody(request, ProviderCredentialDeleteRequestSchema);
        const result = await this.workers.request(identity(sessionId), { type: 'catalog', revision: body.expectedRevision, operation: { type: 'credential.delete', request: { ...body, providerId: identity(credentialDelete[1]), credentialRef: identity(credentialDelete[2]) } } as never });
        if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        respondJson(response, 200, result.result); return;
      }
      const catalogCrud = /^\/api\/agent\/v1\/(models|providers|agents)(?:\/([^/]+))?$/.exec(url.pathname);
      if (catalogCrud) {
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Session identity is required');
        const rootSessionId = identity(sessionId);
        let type: string;
        if (catalogCrud[1] === 'models') type = request.method === 'GET' ? 'models.read' : catalogCrud[2] ? 'model.configure' : 'model.configure';
        else if (catalogCrud[1] === 'providers') type = request.method === 'GET' ? 'providers.read' : catalogCrud[2] ? 'provider.configure' : 'provider.configure';
        else type = 'agents.read';
        const body = request.method === 'GET' ? undefined : await readBody(request, z.unknown());
        const operation = body === undefined ? { type } : { type, request: body };
        const result = await this.workers.request(rootSessionId, { type: 'catalog', operation: operation as never, revision: url.searchParams.get('revision') ?? '0' });
        if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        respondJson(response, 200, result.result); return;
      }
      const catalogRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/(mcp|skills)(?:\/(catalog|config|apply|install|expand|servers\/([^/]+)\/reconnect))?$/.exec(url.pathname);
      if (catalogRoute) {
        const sessionId = identity(catalogRoute[1]);
        const kind = catalogRoute[2];
        const action = catalogRoute[3] ?? 'catalog';
        if (kind === 'mcp' && action === 'catalog' && request.method === 'GET') { respondJson(response, 200, await this.catalog.readMcp(sessionId)); return; }
        if (kind === 'mcp' && action === 'config' && request.method === 'PUT') { respondJson(response, 200, await this.catalog.configure(await readBody(request, MCPConfigureRequestSchema))); return; }
        if (kind === 'mcp' && action === 'apply' && request.method === 'POST') { respondJson(response, 200, await this.catalog.applyMcp(await readBody(request, MCPApplyRequestSchema))); return; }
        if (kind === 'mcp' && catalogRoute[4] !== undefined && request.method === 'POST') { respondJson(response, 200, await this.catalog.reconnect(sessionId, identity(catalogRoute[4]), await readBody(request, MCPReconnectRequestSchema))); return; }
        if (kind === 'skills' && action === 'catalog' && request.method === 'GET') { respondJson(response, 200, await this.catalog.readSkills(sessionId)); return; }
        if (kind === 'skills' && action === 'apply' && request.method === 'POST') { respondJson(response, 200, await this.catalog.applySkills(await readBody(request, SkillsApplyRequestSchema))); return; }
        if (kind === 'skills' && action === 'expand' && request.method === 'POST') { respondJson(response, 200, await this.catalog.expand(sessionId, await readBody(request, SkillExpandRequestSchema))); return; }
      }
      if (request.method === 'GET' && url.pathname === '/internal/workers') { respondJson(response, 200, { workers: this.workers.list() }); return; }
      if (request.method === 'POST' && url.pathname === '/internal/workers') { respondJson(response, 201, await this.workers.start(await readBody(request, WorkerBootstrapSchema))); return; }
      const restart = /^\/internal\/workers\/([^/]+)\/restart$/.exec(url.pathname);
      if (restart && request.method === 'POST') {
        const input = await readBody(request, WorkerBootstrapSchema);
        if (input.rootSessionId !== identity(restart[1])) throw new RequestError(400, 'INVALID_REQUEST', 'Worker identity does not match the route');
        respondJson(response, 200, await this.workers.start(input, true)); return;
      }
      const stop = /^\/internal\/workers\/([^/]+)$/.exec(url.pathname);
      if (stop && request.method === 'DELETE') { await this.workers.stop(identity(stop[1])); response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return; }
      respondProblem(response, 404, 'NOT_IMPLEMENTED', 'No matching private route');
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) { response.destroy(); return; }
      if (error instanceof RequestError || error instanceof ProjectionError || error instanceof SessionReferenceError || error instanceof WorkerOperationError) {
        respondProblem(response, error.status, error.code, error.message);
      } else respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Session operation failed');
    }
  }
}
