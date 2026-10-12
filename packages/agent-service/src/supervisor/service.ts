import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import { AgentServiceReadySchema, ProblemDetailsSchema } from '@openchamber/agent-contract';
import type { AgentServiceReady, ProblemCode, ProblemDetails } from '@openchamber/agent-contract';
import { WorkerBootstrapSchema } from '../protocol.ts';
import type { WorkerBootstrap, WorkerInfo } from '../protocol.ts';
import { WorkerRegistry } from './workers.ts';

interface ServiceOptions {
  workerEntrypoint: string;
  internalSecret: string;
  port?: number;
}

const InternalSecretSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const ListeningAddressSchema = z.object({ address: z.literal('127.0.0.1'), port: z.number().int().min(1).max(65_535) });

class RequestError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string) {
    super(message);
  }
}

type JsonResponse = AgentServiceReady | WorkerInfo | { workers: WorkerInfo[] };

function respondJson(response: ServerResponse, status: number, body: JsonResponse): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function respondProblem(response: ServerResponse, status: number, code: ProblemCode, detail: string): void {
  const problem: ProblemDetails = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`,
    title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status,
    code,
    detail,
    retryable: status >= 500,
  });
  response.writeHead(status, { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(problem));
}

async function readBootstrap(request: IncomingMessage): Promise<WorkerBootstrap> {
  const decoder = new StringDecoder('utf8');
  let bytes = 0;
  let text = '';
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65_536) throw new RequestError(413, 'PAYLOAD_TOO_LARGE', 'Worker bootstrap exceeds the request limit');
    text += decoder.write(chunk);
  }
  text += decoder.end();
  try {
    return WorkerBootstrapSchema.parse(JSON.parse(text));
  } catch {
    throw new RequestError(400, 'INVALID_REQUEST', 'Worker bootstrap is invalid');
  }
}

export class AgentService {
  private readonly secret: Buffer;
  private readonly workers: WorkerRegistry;
  private server: ReturnType<typeof createServer> | undefined;
  private ready = false;
  private closing = false;
  private stopping: Promise<void> | undefined;

  constructor(private readonly options: ServiceOptions) {
    this.secret = Buffer.from(InternalSecretSchema.parse(options.internalSecret), 'hex');
    this.workers = new WorkerRegistry({ workerEntrypoint: options.workerEntrypoint });
  }

  async start(): Promise<void> {
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
      await this.workers.start({
        rootSessionId, projectId: randomUUID(), workspaceId: randomUUID(),
        cwd, agentDirectory, sessionsDirectory,
        env: { HOME: profile, XDG_CONFIG_HOME: join(profile, 'config'), XDG_DATA_HOME: join(profile, 'data') },
      });
      if (!await this.workers.stop(rootSessionId)) throw new Error('SDK readiness disposal failed');
      if (!this.closing) this.ready = true;
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      if (profile) await rm(profile, { recursive: true, force: true });
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.ready = false;
    this.closing = true;
    this.stopping = (async () => {
      const server = this.server;
      this.server = undefined;
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
    if (!presented.success) return false;
    return timingSafeEqual(Buffer.from(presented.data, 'hex'), this.secret);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.authenticated(request)) {
      respondProblem(response, 403, 'UNAUTHORIZED', 'Private loopback authentication is required');
      return;
    }
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/ready') {
        if (!this.ready) respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'SDK initialization is unavailable');
        else respondJson(response, 200, AgentServiceReadySchema.parse({ ready: true, engine: 'omp', version: '1.0.0' }));
        return;
      }
      if (!this.ready || this.closing) {
        respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Agent Service is not admitting workers');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/internal/workers') {
        respondJson(response, 200, { workers: this.workers.list() });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/internal/workers') {
        respondJson(response, 201, await this.workers.start(await readBootstrap(request)));
        return;
      }
      const restart = url.pathname.match(/^\/internal\/workers\/([^/]+)\/restart$/);
      if (restart && request.method === 'POST') {
        const input = await readBootstrap(request);
        if (input.rootSessionId !== decodeURIComponent(restart[1])) throw new RequestError(400, 'INVALID_REQUEST', 'Worker identity does not match the route');
        respondJson(response, 200, await this.workers.start(input, true));
        return;
      }
      const stop = url.pathname.match(/^\/internal\/workers\/([^/]+)$/);
      if (stop && request.method === 'DELETE') {
        await this.workers.stop(decodeURIComponent(stop[1]));
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      respondProblem(response, 404, 'NOT_IMPLEMENTED', 'No matching private route');
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (error instanceof RequestError) respondProblem(response, error.status, error.code, error.message);
      else respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Worker operation failed');
    }
  }
}
