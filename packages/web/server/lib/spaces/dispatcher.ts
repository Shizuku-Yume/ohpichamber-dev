import http from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import path from 'node:path';
import { PassThrough, pipeline } from 'node:stream';
import type { Duplex } from 'node:stream';
import { z } from 'zod';

import { writeSseChunkWithBackpressure } from '../host/sse-stream.js';
import type { NextFunction, Request, Response } from '../shared/http-contracts.js';
import { SpaceError } from './errors.js';
import { isSpaceId } from './labels.js';
import { SPACE_SERVER_HOST, SPACE_SERVER_PORT, spaceWorkPath } from './layout.js';

const SPACE_ROUTE_PREFIX = '/api/spaces/';
const SPACES_ROOT = '/spaces';

const LIST_TTL_MS = 2_000;
const LIST_MISS_RETRY_MS = 500;

const SESSION_RENEW_FRACTION = 0.9;
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 30_000;

const MAX_SOCKETS_PER_SPACE = 8;
const FREE_SOCKET_TIMEOUT_MS = 4_000;

const ERROR_TEXT_CHARACTERS = 300;

const HOST_ONLY_ROUTES: readonly string[] = Object.freeze([
  '/api/provider',
  '/api/providers',
  '/api/integration',
  '/api/credential',
  '/api/auth',
  '/api/config/settings',
  '/api/config/themes',
  '/api/themes',
  '/api/github',
  '/api/linear',
  '/api/voice',
  '/api/tts',
  '/api/dictation',
  '/api/guests',
  '/api/projects',
  '/api/client-auth',
  '/api/system',
  '/api/push',
  '/api/notifications',
  '/api/openchamber/tunnel',
]);

const REFUSED_ACROSS_BOUNDARY_ROUTES: readonly string[] = Object.freeze([
  '/api/git/worktrees',
  '/api/git/project-worktrees',
  '/api/git/worktree-type',
  '/api/git/integrate',
  '/api/fs/preview',
  '/api/fs/serve',
  '/api/preview/proxy',
]);
const SESSION_MOVE_ROUTE = /^\/api\/session\/[^/]+\/move(?:\/|$)/;

const DROPPED_REQUEST_HEADERS = new Set([
  'cookie',
  'authorization',
  'proxy-authorization',
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'expect',
  'origin',
  'referer',
  'accept-encoding',
  'proxy-connection',
]);
const DROPPED_REQUEST_HEADER_PREFIXES = ['x-forwarded-', 'forwarded', 'sec-websocket-'];

const FORWARDED_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'cache-control',
  'expires',
  'pragma',
  'etag',
  'last-modified',
  'vary',
  'date',
  'x-accel-buffering',
  'x-next-cursor',
]);

const DROPPED_QUERY_PARAMETERS = ['oc_url_token', 'oc_client_token'];

const PAGE_CONTENT_TYPES = /^\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|application\/pdf)\b/i;
const RAW_FILE_CONTENT_TYPES = /^\s*(?:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+)\s*(?:;|$)/i;
const RAW_FILE_ROUTE = '/api/fs/raw';
const isRawFileRoute = (pathname: string): boolean => pathname.toLowerCase() === RAW_FILE_ROUTE;

const PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/;

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

const isString = (value: unknown): value is string => typeof value === 'string';

const DEAD_STREAM = new PassThrough();

export interface SpaceRouteMatch {
  spaceId: string;
  path: string;
}

export type SpacePathRule = 'host_only' | 'refused_across_boundary' | null;

export interface SpaceFailureDescription {
  status: number;
  code: string;
  message: string;
}

export interface SpaceTransport {
  listSpaceIds: () => Promise<string[]>;
  connect: (spaceId: string) => Promise<Duplex>;
  readToken: (spaceId: string) => Promise<string>;
}

export interface SpaceDispatcherLogger {
  warn?: ((message: string) => void) | undefined;
}

export interface CreateSpaceDispatcherOptions {
  transport: SpaceTransport;
  now?: (() => number) | undefined;
  logger?: SpaceDispatcherLogger | undefined;
}

export interface SpaceRequestInsideOptions {
  method?: string | undefined;
  path: string;
  headers?: OutgoingHttpHeaders | undefined;
  body?: string | null | undefined;
  timeoutMs?: number | undefined;
}

export interface SpaceSessionBridge {
  isKnownSpace: (spaceId: string) => Promise<boolean>;
  cookieFor: (spaceId: string) => Promise<string>;
  renew: (spaceId: string) => Promise<string>;
}

export interface SpaceDispatcher {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  close: () => void;
  isSpaceDirectory: (value: string) => boolean;
  isSpaceRequestPath: (pathname: string) => boolean;
  requestInside: (spaceId: string, options: SpaceRequestInsideOptions) => Promise<IncomingMessage>;
  spaceSessions: SpaceSessionBridge;
}

export function parseSpaceRoute(pathname: string): SpaceRouteMatch | null {
  if (!pathname.startsWith(SPACE_ROUTE_PREFIX)) {
    return null;
  }
  const rest = pathname.slice(SPACE_ROUTE_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) {
    return null;
  }
  return { spaceId: rest.slice(0, slash), path: `/api${rest.slice(slash)}` };
}

export const isSpaceRequestPath = (pathname: string): boolean => parseSpaceRoute(pathname) !== null;

const normalizeDirectory = (value: string): string | null => {
  if (value.trim() === '') return null;
  const normalized = path.posix.normalize(value.trim().replace(/\\/g, '/'));
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const isUnder = (directory: string, root: string): boolean =>
  directory === root || directory.startsWith(`${root}/`);

export const isSpaceDirectory = (value: string): boolean => {
  const directory = normalizeDirectory(value);
  return directory !== null && isUnder(directory, SPACES_ROOT);
};

export const isDirectoryOfSpace = (value: string, spaceId: string): boolean => {
  const directory = normalizeDirectory(value);
  return directory !== null && isUnder(directory, spaceWorkPath(spaceId));
};

const matchesRoute = (pathname: string, route: string): boolean =>
  pathname === route || pathname.startsWith(`${route}/`);

export function classifySpacePath(pathname: string): SpacePathRule {
  const lower = pathname.toLowerCase();
  if (HOST_ONLY_ROUTES.some((route) => matchesRoute(lower, route))) return 'host_only';
  if (REFUSED_ACROSS_BOUNDARY_ROUTES.some((route) => matchesRoute(lower, route)) || SESSION_MOVE_ROUTE.test(lower)) {
    return 'refused_across_boundary';
  }
  return null;
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function requestedDirectories(req: IncomingMessage, url: URL): string[] {
  const directories: string[] = [];
  for (const key of ['directory', 'location[directory]']) {
    for (const value of url.searchParams.getAll(key)) directories.push(value);
  }
  const headerPairs: Array<[string, string]> = [
    ['x-openchamber-directory', 'x-openchamber-directory-encoding'],
    ['x-opencode-directory', 'x-opencode-directory-encoding'],
  ];
  for (const [headerKey, encodingKey] of headerPairs) {
    const header = req.headers[headerKey];
    if (isString(header) && header.length > 0) {
      const encoded = req.headers[encodingKey] === 'uri' || PERCENT_ESCAPE.test(header);
      directories.push(encoded ? safeDecode(header) : header);
    }
  }
  return directories;
}

const shortText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, ERROR_TEXT_CHARACTERS);

const answer = (res: Response, status: number, code: string, message: string): void => {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(status).json({ error: message, code });
};

export const describeFailure = (cause: unknown): SpaceFailureDescription => {
  if (cause instanceof SpaceError) {
    switch (cause.code) {
      case 'space_not_found':
      case 'space_not_ours':
      case 'invalid_space_id':
        return { status: 404, code: 'space_not_found', message: 'There is no such space.' };
      case 'space_not_running':
      case 'space_move_unfinished':
        return { status: 503, code: cause.code, message: shortText(cause.message) };
      case 'space_token_unreadable':
      case 'space_setup_failed':
      case 'space_login_failed':
        return { status: 502, code: cause.code, message: shortText(cause.message) };
      case 'space_request_body_consumed':
        return { status: 500, code: cause.code, message: shortText(cause.message) };
      case 'space_redirected':
        return { status: 502, code: cause.code, message: shortText(cause.message) };
      default:
        return {
          status: 502,
          code: 'space_unreachable',
          message: `The server inside the space could not be reached: ${shortText(cause.message)}`,
        };
    }
  }
  const detail = errorDetailSchema.safeParse(cause).data;
  const text = cause instanceof Error ? cause.message : (detail?.message ?? String(cause));
  return { status: 502, code: 'space_unreachable', message: `The server inside the space could not be reached: ${shortText(text)}` };
};

const parseSetCookie = (header: string[] | undefined): { cookie: string; ttlMs: number } | null => {
  const line = header?.[0] ?? '';
  if (line.length === 0) return null;
  const [pair = '', ...attributes] = line.split(';');
  const equals = pair.indexOf('=');
  if (equals <= 0) return null;
  let ttlMs = DEFAULT_SESSION_TTL_MS;
  for (const attribute of attributes) {
    const [name = '', value] = attribute.trim().split('=');
    if (name.toLowerCase() === 'max-age' && /^\d+$/.test(value ?? '')) ttlMs = Number(value) * 1000;
  }
  return { cookie: pair.trim(), ttlMs };
};

const hasBody = (req: IncomingMessage): boolean =>
  'content-length' in req.headers || 'transfer-encoding' in req.headers;

export const forwardRequestHeaders = (
  requestHeaders: IncomingHttpHeaders,
  cookie: string,
): OutgoingHttpHeaders => {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(requestHeaders)) {
    const lower = name.toLowerCase();
    if (DROPPED_REQUEST_HEADERS.has(lower) || DROPPED_REQUEST_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    if (value !== undefined) headers[lower] = value;
  }
  headers.host = `${SPACE_SERVER_HOST}:${SPACE_SERVER_PORT}`;
  headers.cookie = cookie;
  headers['accept-encoding'] = 'identity';
  return headers;
};

export const stripCredentialQuery = (url: URL): void => {
  for (const parameter of DROPPED_QUERY_PARAMETERS) url.searchParams.delete(parameter);
};

export function createSpaceDispatcher({
  transport,
  now = Date.now,
  logger = console,
}: CreateSpaceDispatcherOptions): SpaceDispatcher {
  const agents = new Map<string, http.Agent>();
  const sessions = new Map<string, { cookie: string; renewAt: number }>();
  const tokens = new Map<string, string>();
  const logins = new Map<string, Promise<string>>();
  interface KnownSpaceIds {
    ids: Set<string>;
    readAt: number;
  }
  let known: KnownSpaceIds = { ids: new Set(), readAt: -Infinity };
  let listing: Promise<void> | null = null;

  const readSpaceIds = async (): Promise<void> => {
    if (!listing) {
      listing = transport.listSpaceIds()
        .then((ids) => { known = { ids: new Set(ids), readAt: now() }; })
        .finally(() => { listing = null; });
    }
    await listing;
  };
  const isKnownSpace = async (spaceId: string): Promise<boolean> => {
    const age = now() - known.readAt;
    if (age >= LIST_TTL_MS || (!known.ids.has(spaceId) && age >= LIST_MISS_RETRY_MS)) {
      await readSpaceIds();
    }
    return known.ids.has(spaceId);
  };

  const agentFor = (spaceId: string): http.Agent => {
    let agent = agents.get(spaceId);
    if (!agent) {
      agent = new http.Agent({ keepAlive: true, maxSockets: MAX_SOCKETS_PER_SPACE, timeout: FREE_SOCKET_TIMEOUT_MS });
      agent.createConnection = (_options, callback) => {
        transport.connect(spaceId).then(
          (stream) => { callback?.(null, stream); },
          (cause) => {
            const failure = cause instanceof Error ? cause : new Error(String(cause));
            callback?.(failure, DEAD_STREAM);
          },
        );
      };
      agents.set(spaceId, agent);
    }
    return agent;
  };

  const tokenFor = async (spaceId: string, fresh: boolean): Promise<string> => {
    const existing = tokens.get(spaceId);
    if (!fresh && existing !== undefined) return existing;
    const token = await transport.readToken(spaceId);
    tokens.set(spaceId, token);
    return token;
  };

  const sendInside = (
    spaceId: string,
    { method, path: requestPath, headers, body }: { method: string; path: string; headers: OutgoingHttpHeaders; body: string },
  ): Promise<{ status: number; headers: IncomingHttpHeaders }> => new Promise((resolve, reject) => {
    const request = http.request({
      agent: agentFor(spaceId),
      method,
      path: requestPath,
      timeout: LOGIN_TIMEOUT_MS,
      headers: { ...headers, host: `${SPACE_SERVER_HOST}:${SPACE_SERVER_PORT}`, 'accept-encoding': 'identity', 'content-length': String(Buffer.byteLength(body)) },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new SpaceError('space_login_failed', 'The server inside the space did not answer the login in time')));
    request.on('error', reject);
    request.end(body);
  });

  const attemptLogin = async (
    spaceId: string,
    fresh: boolean,
  ): Promise<{ session: { cookie: string; ttlMs: number } | null; status: number }> => {
    const token = await tokenFor(spaceId, fresh);
    const response = await sendInside(spaceId, {
      method: 'POST',
      path: '/auth/session',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: token }),
    });
    const session = response.status === 200 ? parseSetCookie(response.headers['set-cookie']) : null;
    return session ? { session, status: response.status } : { session: null, status: response.status };
  };

  const logIn = (spaceId: string, { fresh }: { fresh: boolean }): Promise<string> => {
    const inFlight = logins.get(spaceId);
    if (inFlight) return inFlight;
    const login = (async () => {
      let attempt = await attemptLogin(spaceId, fresh);
      if (!attempt.session && !fresh) {
        tokens.delete(spaceId);
        attempt = await attemptLogin(spaceId, true);
      }
      if (!attempt.session) {
        throw new SpaceError('space_login_failed', `The server inside the space did not accept the space's token (status ${attempt.status})`);
      }
      sessions.set(spaceId, { cookie: attempt.session.cookie, renewAt: now() + attempt.session.ttlMs * SESSION_RENEW_FRACTION });
      return attempt.session.cookie;
    })().finally(() => logins.delete(spaceId));
    logins.set(spaceId, login);
    return login;
  };

  const sessionFor = async (spaceId: string): Promise<string> => {
    const session = sessions.get(spaceId);
    if (session && now() < session.renewAt) return session.cookie;
    return logIn(spaceId, { fresh: false });
  };

  const forgetSession = (spaceId: string): void => { sessions.delete(spaceId); };

  const requestInside = async (
    spaceId: string,
    { method = 'GET', path: requestPath, headers = {}, body = null, timeoutMs = 0 }: SpaceRequestInsideOptions,
  ): Promise<IncomingMessage> => {
    if (!await isKnownSpace(spaceId)) throw new SpaceError('space_not_found', `There is no space ${spaceId}`);
    const once = (cookie: string): Promise<IncomingMessage> => new Promise((resolve, reject) => {
      const request = http.request({
        agent: agentFor(spaceId),
        method,
        path: requestPath,
        headers: { ...headers, host: `${SPACE_SERVER_HOST}:${SPACE_SERVER_PORT}`, cookie, 'accept-encoding': 'identity' },
        ...(timeoutMs > 0 ? { timeout: timeoutMs } : undefined),
      });
      request.on('timeout', () => request.destroy(new SpaceError('space_unreachable', 'The server inside the space did not answer in time')));
      request.on('response', resolve);
      request.on('error', reject);
      request.end(body === null ? undefined : body);
    });
    let response: IncomingMessage;
    try {
      response = await once(await sessionFor(spaceId));
    } catch (error) {
      if (errorDetailSchema.safeParse(error).data?.code !== 'command_stream_failed') throw error;
      response = await once(await sessionFor(spaceId));
    }
    if (response.statusCode !== 401) return response;
    response.resume();
    forgetSession(spaceId);
    const renewed = await logIn(spaceId, { fresh: true });
    const again = await once(renewed);
    if (again.statusCode === 401) {
      again.resume();
      throw new SpaceError('space_login_failed', 'The server inside the space refused a session it had just issued');
    }
    return again;
  };

  const applyResponseHeaders = (upstream: IncomingMessage, res: Response, innerPath: string): void => {
    for (const [name, value] of Object.entries(upstream.headers)) {
      if (!FORWARDED_RESPONSE_HEADERS.has(name) || value === undefined) continue;
      res.setHeader(name, value);
    }
    res.setHeader('x-content-type-options', 'nosniff');
    const contentType = String(upstream.headers['content-type'] ?? '');
    if (isRawFileRoute(innerPath)) {
      if (!RAW_FILE_CONTENT_TYPES.test(contentType)) {
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-disposition', 'attachment');
      }
    } else if (contentType === '' || PAGE_CONTENT_TYPES.test(contentType)) {
      res.setHeader('content-type', 'text/plain; charset=utf-8');
    }
  };

  const isEventStream = (upstream: IncomingMessage): boolean =>
    String(upstream.headers['content-type'] ?? '').toLowerCase().includes('text/event-stream');

  const pipeEventStream = (upstream: IncomingMessage, res: Response): void => {
    const abort = new AbortController();
    let queue = Promise.resolve(true);
    const enqueue = (chunk: string | Buffer): Promise<boolean> => {
      queue = queue.catch(() => false).then((canContinue) => (canContinue ? writeSseChunkWithBackpressure(res, chunk, abort.signal) : false));
      return queue;
    };
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders?.();
    res.socket?.setNoDelay?.(true);
    const stop = (): void => {
      abort.abort();
      upstream.destroy();
    };
    res.on('close', stop);
    upstream.on('data', (chunk: string | Buffer) => {
      void enqueue(chunk).then((canContinue) => { if (!canContinue) stop(); });
    });
    upstream.on('end', () => { void queue.then(() => { if (!res.writableEnded) res.end(); }); });
    upstream.on('error', () => { void queue.then(() => { if (!res.writableEnded) res.end(); }); });
  };

  const forwardOnce = (
    req: Request,
    res: Response,
    {
      spaceId,
      innerPath,
      search,
      cookie,
      onUnauthorized,
    }: {
      spaceId: string;
      innerPath: string;
      search: string;
      cookie: string;
      onUnauthorized: 'report';
    },
  ): Promise<'done' | 'unauthorized'> => new Promise((resolve, reject) => {
    if (hasBody(req) && req.readableEnded) {
      reject(new SpaceError('space_request_body_consumed', 'The body of this request was read on the host before the dispatcher saw it'));
      return;
    }
    const upstreamRequest = http.request({
      agent: agentFor(spaceId),
      method: req.method,
      path: `${innerPath}${search}`,
      headers: forwardRequestHeaders(req.headers, cookie),
    });
    let settled = false;
    const settle = <Value>(fn: (value: Value) => void) => (value: Value): void => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const finish = settle(resolve);
    const fail = settle(reject);
    const onClientGone = (): void => { if (!res.writableFinished) upstreamRequest.destroy(); };
    res.on('close', onClientGone);

    upstreamRequest.on('response', (upstream) => {
      if (res.destroyed) {
        upstream.destroy();
        finish('done');
        return;
      }
      if (upstream.statusCode === 401 && onUnauthorized === 'report') {
        upstream.resume();
        upstream.on('end', () => finish('unauthorized'));
        upstream.on('error', () => finish('unauthorized'));
        return;
      }
      const statusCode = upstream.statusCode ?? 502;
      if (statusCode >= 300 && statusCode < 400 && statusCode !== 304) {
        upstream.resume();
        fail(new SpaceError('space_redirected', 'The server inside the space answered with a redirect, which is not followed'));
        return;
      }
      res.status(statusCode);
      applyResponseHeaders(upstream, res, innerPath);
      if (isEventStream(upstream)) {
        pipeEventStream(upstream, res);
        finish('done');
        return;
      }
      pipeline(upstream, res, () => { });
      finish('done');
    });
    upstreamRequest.on('error', (error) => {
      if (res.destroyed) {
        finish('done');
        return;
      }
      fail(error);
    });
    if (hasBody(req)) {
      req.pipe(upstreamRequest);
      req.on('error', () => upstreamRequest.destroy());
    } else {
      upstreamRequest.end();
    }
  });

  const forward = async (req: Request, res: Response, spaceId: string, innerPath: string, search: string): Promise<void> => {
    if (!await isKnownSpace(spaceId)) {
      answer(res, 404, 'space_not_found', 'There is no such space.');
      return;
    }
    let cookie: string;
    try {
      cookie = await sessionFor(spaceId);
    } catch (error) {
      const failure = describeFailure(error);
      logger.warn?.(`[spaces] login to space ${spaceId} failed: ${failure.code}`);
      answer(res, failure.status, failure.code, failure.message);
      return;
    }
    try {
      let outcome: 'done' | 'unauthorized';
      try {
        outcome = await forwardOnce(req, res, { spaceId, innerPath, search, cookie, onUnauthorized: 'report' });
      } catch (error) {
        if (errorDetailSchema.safeParse(error).data?.code !== 'command_stream_failed' || hasBody(req) || res.headersSent) throw error;
        outcome = await forwardOnce(req, res, { spaceId, innerPath, search, cookie, onUnauthorized: 'report' });
      }
      if (outcome !== 'unauthorized') return;
      forgetSession(spaceId);
      const renewed = await logIn(spaceId, { fresh: true });
      if (hasBody(req)) {
        answer(res, 503, 'space_session_expired', 'The session with the server inside the space had expired and was renewed. Send the request again.');
        return;
      }
      const again = await forwardOnce(req, res, { spaceId, innerPath, search, cookie: renewed, onUnauthorized: 'report' });
      if (again === 'unauthorized') {
        throw new SpaceError('space_login_failed', 'The server inside the space refused a session it had just issued');
      }
    } catch (error) {
      const failure = describeFailure(error);
      logger.warn?.(`[spaces] request to space ${spaceId} failed: ${failure.code}`);
      answer(res, failure.status, failure.code, failure.message);
    }
  };

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const url = new URL(req.originalUrl ?? req.url, 'http://localhost');
    const route = parseSpaceRoute(url.pathname);
    if (!route) {
      if (url.pathname.toLowerCase().startsWith('/api/') && requestedDirectories(req, url).some(isSpaceDirectory)) {
        answer(res, 400, 'space_directory_needs_prefix', 'A directory under /spaces/ belongs to an isolated space and is addressed as /api/spaces/<id>/... only.');
        return;
      }
      next();
      return;
    }
    if (!isSpaceId(route.spaceId)) {
      answer(res, 404, 'space_not_found', 'There is no such space.');
      return;
    }
    const rule = classifySpacePath(route.path);
    if (rule === 'host_only') {
      answer(res, 403, 'host_only_route', 'This route exists on the host only and is not forwarded to a space.');
      return;
    }
    if (rule === 'refused_across_boundary') {
      answer(res, 403, 'refused_across_boundary', 'This action does not cross the boundary of an isolated space.');
      return;
    }
    if (requestedDirectories(req, url).some((directory) => !isDirectoryOfSpace(directory, route.spaceId))) {
      answer(res, 400, 'directory_outside_space', `A request to space ${route.spaceId} may name a directory under ${spaceWorkPath(route.spaceId)} only.`);
      return;
    }
    stripCredentialQuery(url);
    forward(req, res, route.spaceId, route.path, url.search).catch((cause) => {
      const failure = describeFailure(cause);
      answer(res, failure.status, failure.code, failure.message);
    });
  };

  const close = (): void => {
    for (const agent of agents.values()) agent.destroy();
    agents.clear();
    sessions.clear();
    tokens.clear();
  };

  const spaceSessions: SpaceSessionBridge = {
    isKnownSpace,
    cookieFor: sessionFor,
    renew: (spaceId: string) => {
      forgetSession(spaceId);
      return logIn(spaceId, { fresh: true });
    },
  };

  return { middleware, close, isSpaceDirectory, isSpaceRequestPath, requestInside, spaceSessions };
}
