import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import { AgentServiceReadySchema, ApprovalReplySchema, CounterSchema, EntityIdSchema, HistoryPageRequestSchema, JsonObjectSchema, ProblemDetailsSchema, PromptRequestSchema, QuestionReplySchema, MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPReconnectRequestSchema, MCPOAuthRequestSchema, SkillsApplyRequestSchema, SkillExpandRequestSchema } from '@openchamber/agent-contract';
import type {
  AgentCatalog, AgentMutationResult, AgentServiceReady, ApprovalRequest, CanonicalEvent,
  CompletionCancelResult, CompletionResult, HistoryPage, JsonObject, MCPCatalogRead,
  MCPApplyResult, MCPOAuthResult, ModelCatalog, ModelMutationResult, ProblemCode,
  ProblemDetails, ProviderCatalog, ProviderCredentialMutationResult, ProviderMutationResult,
  QuestionRequest, Run, RuntimeSession, SessionDeleteAck, SessionSnapshot,
  ShellJob, ShellOutput, ShellSnapshot, ShellStopResult, SkillExpandResult,
  SkillInstallResult, SkillsApplyResult, SkillsCatalogState, StreamInvalidated,
} from '@openchamber/agent-contract';
import { WorkerBootstrapSchema, WorkerOperationSchema } from '../protocol.ts';
import type { WorkerBootstrap, WorkerInfo, WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { SessionRegistry, type SessionList } from '../sessions/registry.ts';
import type { ApprovalPolicyCommit, ApprovalPolicyLoad } from '../interaction/manager.ts';
import { SessionReferenceError } from '../sessions/references.ts';
import { WorkerOperationError, WorkerRegistry, type RegisteredWorkerInfo } from './workers.ts';
import { CatalogCoordinator, CatalogCoordinatorError } from './catalog.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { WorkspaceRoutes } from './workspace-routes.ts';
import { ShellCoordinator } from './shell.ts';
import { HostAuthorizationScopeSchema, HostSessionBootstrapSchema, HostWorkspaceBootstrapSchema, HostWorkspaceRegisteredSchema } from './host-authorization-protocol.ts';
import type { PrivateCredentialResolveResult, PrivateCredentialHandoffResult } from '../catalogs/private-credentials.ts';
const SessionForkRequestSchema = z.strictObject({ sourceSessionId: EntityIdSchema, entryId: EntityIdSchema.nullable(), mode: z.enum(['selected', 'full']) }).refine(input => input.mode === 'full' || input.entryId !== null, { message: 'Selected forks require an entry identity', path: ['entryId'] });
const SessionForkAckSchema = z.strictObject({ sessionId: EntityIdSchema, rootSessionId: EntityIdSchema, sessionFile: z.string().min(1), sourceSessionId: EntityIdSchema, entryId: EntityIdSchema.nullable(), mode: z.enum(['selected', 'full']) });
interface ServiceOptions {
  workerEntrypoint: string;
  workerRuntime?: string;
  internalSecret: string;
  stateDirectory: string;
  port?: number;
  approvalPolicyCommit?: ApprovalPolicyCommit;
  approvalPolicyLoad?: ApprovalPolicyLoad;
  policyCheck?: (rootSessionId: string, request: WorkerPolicyRequest) => Promise<WorkerPolicyResult>;
}
const InternalSecretSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const HostSkillSourcePublicationSchema = z.strictObject({
  scope: z.enum(['workspace', 'agent']), sourceRevision: CounterSchema, expectedSourceRevision: CounterSchema, agentDirectoryId: EntityIdSchema.optional(),
}).refine(input => (input.scope === 'agent') === (input.agentDirectoryId !== undefined), 'Agent source publication selects its captured owner');
const ListeningAddressSchema = z.object({ address: z.literal('127.0.0.1'), port: z.number().int().min(1).max(65_535) });
class RequestError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string) { super(message); }
}
const capabilitiesResponse = { version: '1.0.0', engine: 'omp', capabilities: { streaming: true, casApprovals: true, midTurnSteering: false, followUpQueue: false, subagents: false, attachments: false, models: true, providers: true, agents: true, mcp: true, skills: true, statelessCompletion: true, shells: true } };
type ServiceHealthObservation = Pick<AgentServiceReady, 'engine' | 'version'> & { status: 'ready' | 'starting' };
type ServiceResponse =
  | ServiceHealthObservation
  | typeof capabilitiesResponse
  | AgentServiceReady
  | z.infer<typeof HostAuthorizationScopeSchema | typeof HostWorkspaceRegisteredSchema>
  | WorkerInfo | { workers: RegisteredWorkerInfo[] }
  | SessionList | RuntimeSession | HistoryPage | SessionSnapshot | SessionDeleteAck
  | ApprovalRequest | ApprovalRequest[] | QuestionRequest | QuestionRequest[] | { run: Run }
  | MCPCatalogRead | MCPApplyResult | MCPOAuthResult
  | SkillsCatalogState | SkillsApplyResult | SkillExpandResult | SkillInstallResult
  | ModelCatalog | ProviderCatalog | AgentCatalog
  | ProviderMutationResult | ModelMutationResult | ProviderCredentialMutationResult | AgentMutationResult
  | CompletionResult | CompletionCancelResult
  | PrivateCredentialResolveResult | PrivateCredentialHandoffResult
  | ShellJob | ShellSnapshot | ShellOutput | ShellStopResult;

function respondJson(response: ServerResponse, status: number, body: ServiceResponse): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
function respondHealth(response: ServerResponse, ready: boolean): void {
  respondJson(response, 200, { status: ready ? 'ready' : 'starting', engine: 'omp', version: '1.0.0' });
}
function respondProblem(response: ServerResponse, status: number, code: ProblemCode, detail: string, details?: JsonObject): void {
  const problem: ProblemDetails = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status, code, detail, retryable: status >= 500, details,
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
  private readonly workspaceCatalogs: WorkspaceCatalogs;
  private readonly workspaceRoutes: WorkspaceRoutes;
  private readonly shell: ShellCoordinator;
  private readonly observationEpoch = randomUUID();
  private server: ReturnType<typeof createServer> | undefined;
  private ready = false;
  private closing = false;
  private stopping: Promise<void> | undefined;
  constructor(private readonly options: ServiceOptions) {
    this.secret = Buffer.from(InternalSecretSchema.parse(options.internalSecret), 'hex');
    this.workers = new WorkerRegistry({ workerEntrypoint: options.workerEntrypoint, workerRuntime: options.workerRuntime, policyCheck: options.policyCheck,
      prepareBootstrap: async input => {
        if (!this.ready) return input;
        if (!this.workspaceCatalogs.matches(input)) throw new WorkerOperationError(403, 'UNAUTHORIZED');
        const workspace = this.workspaceCatalogs.get(input.workspaceId);
        const agentDirectoryId = input.agentDirectoryId ?? workspace.agentDirectoryId;
        return { ...input, agentDirectoryId, catalogRevision: this.workspaceCatalogs.revision(input.workspaceId, agentDirectoryId), observationEpoch: this.observationEpoch };
      }, callbacks: {
        onOpened: (...args) => this.sessions.onOpened(...args),
        onEvents: (...args) => this.sessions.onEvents(...args),
        onInteraction: (...args) => this.sessions.onInteraction(...args),
        onExit: (...args) => { this.sessions.onExit(...args); this.catalog.retire(args[0], args[1]); },
      },
    });
    this.workspaceCatalogs = new WorkspaceCatalogs(options.stateDirectory, this.workers);
    this.catalog = new CatalogCoordinator(options.stateDirectory, {
      readMcpConfiguration: async workspaceId => {
        const root = await this.workspaceCatalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp.configuration.read' });
        if (result.type !== 'mcp.configuration') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        return result.configuration;
      },
      commitMcp: async (workspaceId, request, configuration) => {
        const root = await this.workspaceCatalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'persist', request, configuration } });
        if (result.type !== 'mcp' || result.result.type !== 'persisted' || result.result.configuration.persistedRevision !== configuration.persistedRevision) throw new WorkerOperationError(503, 'MCP_CONFIG_WRITE_FAILED');
      },
    });
    this.sessions = new SessionRegistry(options.stateDirectory, this.workers, options.approvalPolicyCommit, options.approvalPolicyLoad);
    this.workspaceRoutes = new WorkspaceRoutes(this.workspaceCatalogs, this.workers);
    this.shell = new ShellCoordinator(this.workers, this.sessions, this.observationEpoch, rootSessionId => {
      const input = this.workers.bootstrap(rootSessionId);
      return input !== undefined && this.workspaceCatalogs.matches(input);
    });
  }
  authorizationScope(rootSessionId: string) {
    const scope = this.workers.authorizationScope(rootSessionId);
    return scope === undefined ? undefined : HostAuthorizationScopeSchema.parse(scope);
  }
  private async admit<T>(input: WorkerBootstrap, launch: (bootstrap: WorkerBootstrap) => Promise<T>): Promise<T> {
    const captured = this.workers.bootstrap(input.rootSessionId);
    if (captured && (captured.workspaceId !== input.workspaceId || captured.projectId !== input.projectId || captured.cwd !== input.cwd || captured.agentDirectory !== input.agentDirectory || (input.agentDirectoryId !== undefined && captured.agentDirectoryId !== input.agentDirectoryId))) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    const agentDirectoryId = await this.workspaceCatalogs.registerRoot(input);
    await this.catalog.registerWorkspace(input.workspaceId, agentDirectoryId);
    return this.catalog.admit({ workspaceId: input.workspaceId, agentDirectoryId, catalogRevision: this.workspaceCatalogs.revision(input.workspaceId, agentDirectoryId) }, async authority => {
      const bootstrap = WorkerBootstrapSchema.parse({ ...input, ...authority, agentDirectoryId, observationEpoch: this.observationEpoch, mcpConfigPath: join(input.cwd, '.omp', 'mcp.json') });
      const result = await launch(bootstrap);
      try {
        const scope = this.workers.authorizationScope(bootstrap.rootSessionId);
        if (!scope || scope.agentDirectoryId !== agentDirectoryId) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
        await this.registerCatalogWorker(bootstrap, scope.workerGeneration);
        return result;
      } catch (error) {
        await this.workers.stop(bootstrap.rootSessionId);
        throw error;
      }
    });
  }
  private async registerCatalogWorker(input: WorkerBootstrap, generation: string): Promise<void> {
    const root = input.rootSessionId;
    if (input.agentDirectoryId === undefined) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    await this.catalog.register({
      identity: { rootSessionId: root, workspaceId: input.workspaceId, agentDirectoryId: input.agentDirectoryId, workerGeneration: generation },
      isLive: () => this.workers.authorizationScope(root)?.workerGeneration === generation,
      mcp: {
        read: async configuration => {
          const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'read', configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.catalog;
        },
        apply: async (request, configuration) => {
          const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'apply', request, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.result;
        },
        reconnect: async (serverId, request, configuration) => {
          const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'reconnect', serverId, request, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.catalog;
        },
        oauthStatus: async (serverId, configuration) => {
          const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'oauth.status', serverId, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'oauth') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.result;
        },
        oauth: async (serverId, request, configuration) => {
          const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'oauth', serverId, request, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'oauth') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.result;
        },
      },
      skills: {
        read: async persistedSources => {
          const result = await this.workers.request(root, { type: 'catalog', revision: this.workspaceCatalogs.revision(input.workspaceId, input.agentDirectoryId), operation: { type: 'skills.read', persistedSources } }, generation);
          if (result.type !== 'catalog' || result.result.type !== 'skills.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.catalog;
        },
        apply: async (sources, catalogRevision) => {
          const result = await this.workers.request(root, { type: 'catalog', revision: this.workspaceCatalogs.revision(input.workspaceId, input.agentDirectoryId), operation: { type: 'skills.apply', request: { scope: 'workspace', sourceRevision: sources.workspace }, sources, catalogRevision } }, generation);
          if (result.type !== 'catalog' || result.result.type !== 'skills.applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.result;
        },
        expand: async request => {
          const result = await this.workers.request(root, { type: 'catalog', revision: this.workspaceCatalogs.revision(input.workspaceId, input.agentDirectoryId), operation: { type: 'skills.expand', request } }, generation);
          if (result.type !== 'catalog' || result.result.type !== 'skills.expanded') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result.result;
        },
      },
    });
  }
  async start(): Promise<void> {
    await this.catalog.initialize();
    await this.workspaceCatalogs.initialize();
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
        respondJson(response, 200, capabilitiesResponse);
        return;
      }
      if (!this.ready || this.closing) { respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Agent Service is not admitting work'); return; }
      const authorization = /^\/internal\/authorizations\/([^/]+)$/.exec(url.pathname);
      if (authorization && request.method === 'GET') {
        const scope = this.authorizationScope(identity(authorization[1]));
        if (!scope) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
        respondJson(response, 200, scope); return;
      }
      const workspace = /^\/internal\/workspaces\/([^/]+)$/.exec(url.pathname);
      if (workspace && request.method === 'POST') {
        const workspaceId = identity(workspace[1]);
        const input = await readBody(request, HostWorkspaceBootstrapSchema);
        const registered = await this.workspaceCatalogs.register(workspaceId, input);
        await this.catalog.registerWorkspace(workspaceId, input.agentDirectoryId);
        respondJson(response, 201, HostWorkspaceRegisteredSchema.parse(registered)); return;
      }
      const skillSources = /^\/internal\/workspaces\/([^/]+)\/skill-sources$/.exec(url.pathname);
      if (skillSources && request.method === 'PUT') {
        const workspaceId = identity(skillSources[1]);
        const input = await readBody(request, HostSkillSourcePublicationSchema);
        const owner = this.workspaceCatalogs.get(workspaceId);
        if (input.agentDirectoryId !== undefined && !owner.agentDirectoryIds.includes(input.agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED');
        respondJson(response, 200, await this.catalog.publishSources(workspaceId, input)); return;
      }
      if (request.method === 'POST' && url.pathname === '/internal/sessions') {
        const { displayPath, ...input } = await readBody(request, HostSessionBootstrapSchema);
        respondJson(response, 201, await this.admit(input, bootstrap => this.sessions.open({ ...bootstrap, displayPath }))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/sessions') {
        const workspaceId = EntityIdSchema.safeParse(url.searchParams.get('workspaceId'));
        if (!workspaceId.success) throw new RequestError(400, 'INVALID_REQUEST', 'Workspace identity is required');
        respondJson(response, 200, this.sessions.list(workspaceId.data)); return;
      }
      const privateEntry = /^\/internal\/sessions\/([^/]+)\/native-entry\/([^/]+)$/.exec(url.pathname);
      if (privateEntry && request.method === 'GET') { respondJson(response, 200, await this.sessions.resolveNativeEntry(identity(privateEntry[1]), identity(privateEntry[2]))); return; }
      const privateFork = /^\/internal\/sessions\/([^/]+)\/fork$/.exec(url.pathname);
      if (privateFork && request.method === 'POST') {
        const sourceSessionId = identity(privateFork[1]);
        const input = SessionForkRequestSchema.parse(await readBody(request, SessionForkRequestSchema));
        if (input.sourceSessionId !== sourceSessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Fork source identity does not match the route');
        const ack = SessionForkAckSchema.parse(await this.sessions.fork(sourceSessionId, input.entryId, input.mode));
        respondJson(response, 201, ack); return;
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
      const workspaceResponse = await this.workspaceRoutes.handle(request, url, readBody);
      if (workspaceResponse) { respondJson(response, workspaceResponse.status, workspaceResponse.body); return; }
      const shellResponse = await this.shell.handle(request, url, readBody);
      if (shellResponse) { respondJson(response, shellResponse.status, shellResponse.body); return; }
      const oauthRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/mcp\/servers\/([^/]+)\/oauth$/.exec(url.pathname);
      if (oauthRoute) {
        const addressedId = identity(oauthRoute[1]);
        const rootSessionId = this.workers.bootstrap(addressedId) ? addressedId : this.sessions.runtime(addressedId).rootSessionId;
        const serverId = identity(oauthRoute[2]);
        if (request.method === 'GET') { respondJson(response, 200, await this.catalog.oauthStatus(rootSessionId, serverId)); return; }
        if (request.method === 'POST') { respondJson(response, 200, await this.catalog.oauth(rootSessionId, serverId, await readBody(request, MCPOAuthRequestSchema))); return; }
      }
      const catalogRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/(mcp|skills)\/(catalog|config|apply|expand|servers\/([^/]+)\/reconnect)$/.exec(url.pathname);
      if (catalogRoute) {
        const addressedId = identity(catalogRoute[1]);
        const sessionId = this.workers.bootstrap(addressedId) ? addressedId : this.sessions.runtime(addressedId).rootSessionId;
        const kind = catalogRoute[2];
        const action = catalogRoute[3];
        if (kind === 'mcp' && action === 'catalog' && request.method === 'GET') { respondJson(response, 200, await this.catalog.readMcp(sessionId)); return; }
        if (kind === 'mcp' && action === 'config' && request.method === 'PUT') { respondJson(response, 200, await this.catalog.configure(sessionId, await readBody(request, MCPConfigureRequestSchema))); return; }
        if (kind === 'mcp' && action === 'apply' && request.method === 'POST') { respondJson(response, 200, await this.catalog.applyMcp(sessionId, await readBody(request, MCPApplyRequestSchema))); return; }
        if (kind === 'mcp' && catalogRoute[4] !== undefined && request.method === 'POST') { respondJson(response, 200, await this.catalog.reconnect(sessionId, identity(catalogRoute[4]), await readBody(request, MCPReconnectRequestSchema))); return; }
        if (kind === 'skills' && action === 'catalog' && request.method === 'GET') { respondJson(response, 200, await this.catalog.readSkills(sessionId)); return; }
        if (kind === 'skills' && action === 'apply' && request.method === 'POST') { respondJson(response, 200, await this.catalog.applySkills(sessionId, await readBody(request, SkillsApplyRequestSchema))); return; }
        if (kind === 'skills' && action === 'expand' && request.method === 'POST') { respondJson(response, 200, await this.catalog.expand(sessionId, await readBody(request, SkillExpandRequestSchema))); return; }
      }
      if (request.method === 'GET' && url.pathname === '/internal/workers') { respondJson(response, 200, { workers: this.workers.list() }); return; }
      if (request.method === 'POST' && url.pathname === '/internal/workers') {
        const input = await readBody(request, WorkerBootstrapSchema);
        respondJson(response, 201, await this.admit(input, bootstrap => this.workers.start(bootstrap))); return;
      }
      const restart = /^\/internal\/workers\/([^/]+)\/restart$/.exec(url.pathname);
      if (restart && request.method === 'POST') {
        const input = await readBody(request, WorkerBootstrapSchema);
        if (input.rootSessionId !== identity(restart[1])) throw new RequestError(400, 'INVALID_REQUEST', 'Worker identity does not match the route');
        respondJson(response, 200, await this.admit(input, async bootstrap => {
          if (!await this.sessions.restart(bootstrap)) return this.workers.start(bootstrap, true);
          const info = this.workers.info(bootstrap.rootSessionId);
          if (!info || info.state !== 'ready') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
          return info;
        })); return;
      }
      const stop = /^\/internal\/workers\/([^/]+)$/.exec(url.pathname);
      if (stop && request.method === 'DELETE') { await this.workers.stop(identity(stop[1])); response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return; }
      respondProblem(response, 404, 'NOT_IMPLEMENTED', 'No matching private route');
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) { response.destroy(); return; }
      if (error instanceof CatalogCoordinatorError) {
        respondProblem(response, error.status, error.code, 'Catalog operation failed', JsonObjectSchema.parse(error.details));
      } else if (error instanceof RequestError || error instanceof ProjectionError || error instanceof SessionReferenceError || error instanceof WorkerOperationError) {
        respondProblem(response, error.status, error.code, error.message, error instanceof WorkerOperationError || error instanceof ProjectionError ? error.details : undefined);
      } else respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Session operation failed');
    }
  }
}
