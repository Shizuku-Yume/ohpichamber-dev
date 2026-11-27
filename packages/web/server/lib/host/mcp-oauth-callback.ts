import * as C from '@openchamber/agent-contract';
import { isString } from '../shared/guards.js';
import type { Query } from '../shared/http-contracts.js';

export const MCP_OAUTH_CALLBACK_PATH = C.MCP_OAUTH_HOST_CALLBACK_PATH;

const FLOW_BUDGET_MS = 5 * 60_000;

export interface McpOAuthCallbackPage {
  title: string;
  message: string;
}

export interface McpOAuthCallbackOutcome {
  status: number;
  title: string;
  message: string;
}

export interface McpOAuthPendingFlowEntry {
  completionPath: string;
  workspaceId: string;
  serverId: string;
  flowId: string;
  persistedRevision: string;
  workerGeneration: string;
  expiresAt: number;
}

export interface McpOAuthRecordInput {
  authorizationUrl: string;
  completionPath: string;
  workspaceId: string;
  serverId: string;
  flowId: string;
  persistedRevision: string;
  workerGeneration: string;
}

export interface McpOAuthPendingFlowsOptions {
  currently?: () => number;
  ttlMs?: number;
  maxEntries?: number;
}

export interface McpOAuthPendingFlows {
  record: (input: McpOAuthRecordInput) => McpOAuthPendingFlowEntry | null;
  take: (state: string | undefined) => McpOAuthPendingFlowEntry | null;
  dropServer: (workspaceId: string, serverId: string) => void;
  size: () => number;
}

export interface McpOAuthServicePort {
  getState: () => { phase: string };
  request: (path: string, init: RequestInit) => Promise<Response>;
}

export interface McpOAuthRequestLike {
  protocol?: string;
  host?: string;
  originalUrl?: string;
}

export interface CompleteMcpOAuthCallbackOptions {
  service: McpOAuthServicePort;
  pendingFlows: McpOAuthPendingFlows;
  query: Query | undefined;
  callbackUrl: string;
}

const escapeHtml = (value: string): string => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const renderMcpOAuthCallbackPage = ({ title, message }: McpOAuthCallbackPage): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — OhPiChamber</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: Canvas; color: CanvasText; }
  main { max-width: 34rem; padding: 2.5rem 2rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
  p { margin: 0; line-height: 1.5; opacity: 0.85; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
</main>
</body>
</html>`;

export const createMcpOAuthPendingFlows = ({
  currently = Date.now,
  ttlMs = FLOW_BUDGET_MS,
  maxEntries = 100,
}: McpOAuthPendingFlowsOptions = {}): McpOAuthPendingFlows => {
  const now = currently;
  const entries = new Map<string, McpOAuthPendingFlowEntry>();
  const invalidate = (entry: McpOAuthPendingFlowEntry): boolean => entry.expiresAt <= now();
  const sweep = (): void => {
    for (const [state, entry] of entries) if (invalidate(entry)) entries.delete(state);
  };
  const take = (state: string | undefined): McpOAuthPendingFlowEntry | null => {
    if (!isString(state) || !state) return null;
    sweep();
    const entry = entries.get(state);
    if (!entry) return null;
    entries.delete(state);
    return entry;
  };
  const record = ({
    authorizationUrl,
    completionPath,
    workspaceId,
    serverId,
    flowId,
    persistedRevision,
    workerGeneration,
  }: McpOAuthRecordInput): McpOAuthPendingFlowEntry | null => {
    if (!isString(authorizationUrl) || !isString(completionPath) || !completionPath.startsWith('/')) return null;
    let state: string | null;
    try { state = new URL(authorizationUrl).searchParams.get('state'); } catch { return null; }
    if (!state || state.length > 512 || entries.has(state)) return null;
    sweep();
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
    const entry: McpOAuthPendingFlowEntry = {
      completionPath,
      workspaceId,
      serverId,
      flowId,
      persistedRevision,
      workerGeneration,
      expiresAt: now() + Math.min(ttlMs, FLOW_BUDGET_MS),
    };
    entries.set(state, entry);
    return entry;
  };
  const dropServer = (workspaceId: string, serverId: string): void => {
    for (const [state, entry] of entries) {
      if (entry.workspaceId === workspaceId && entry.serverId === serverId) entries.delete(state);
    }
  };
  return { record, take, dropServer, size: () => entries.size };
};

export const callbackUrlForRequest = (req: McpOAuthRequestLike): string => {
  const proto = isString(req.protocol) && req.protocol ? req.protocol : 'http';
  const host = isString(req.host) ? req.host : '';
  const original = isString(req.originalUrl) ? req.originalUrl : MCP_OAUTH_CALLBACK_PATH;
  const queryIndex = original.indexOf('?');
  const search = queryIndex === -1 ? '' : original.slice(queryIndex);
  const target = `${MCP_OAUTH_CALLBACK_PATH}${search}`;
  return host ? `${proto}://${host}${target}` : target;
};

const queryValue = (query: Query | undefined, name: string): string | undefined => {
  const value = query?.[name];
  return isString(value) ? value : undefined;
};

const boundedDetail = (value: string): string => value.slice(0, 300);

export const completeMcpOAuthCallback = async ({
  service,
  pendingFlows,
  query,
  callbackUrl,
}: CompleteMcpOAuthCallbackOptions): Promise<McpOAuthCallbackOutcome> => {
  const state = queryValue(query, 'state');
  const entry = pendingFlows.take(state);
  if (!entry) {
    return {
      status: 400,
      title: 'Sign-in link is invalid',
      message: 'This sign-in link is unknown, has expired, or was already used. Start the sign-in again from OhPiChamber.',
    };
  }
  const providerError = queryValue(query, 'error');
  const rawDescription = queryValue(query, 'error_description');
  const providerDescription = rawDescription !== undefined ? boundedDetail(rawDescription) : undefined;
  if (providerError === undefined && queryValue(query, 'code') === undefined) {
    return { status: 400, title: 'Sign-in was not completed', message: 'The provider did not return an authorization code.' };
  }
  if (service.getState().phase !== 'ready') {
    return { status: 503, title: 'Sign-in could not finish', message: 'The Agent Service is not running. Start OhPiChamber again and retry the sign-in.' };
  }
  const body = {
    action: 'complete',
    persistedRevision: entry.persistedRevision,
    workerGeneration: entry.workerGeneration,
    flowId: entry.flowId,
    callbackInput: callbackUrl,
  };
  try {
    const response = await service.request(entry.completionPath, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (providerError !== undefined) {
      await response.text().catch(() => '');
      return {
        status: 400,
        title: 'Sign-in was not completed',
        message: providerDescription ? `${boundedDetail(providerError)}: ${providerDescription}` : boundedDetail(providerError),
      };
    }
    if (!response.ok) {
      const parsed = C.ProblemDetailsSchema.safeParse(await response.json().catch(() => null));
      const detail = parsed.success ? parsed.data.detail : `The Agent Service answered HTTP ${response.status}.`;
      return { status: 502, title: 'Sign-in could not finish', message: boundedDetail(detail) };
    }
    const result = C.MCPOAuthResultSchema.safeParse(await response.json().catch(() => null));
    if (!result.success) {
      return { status: 502, title: 'Sign-in could not finish', message: 'The Agent Service returned an unexpected answer.' };
    }
    if (result.data.status === 'authenticated') {
      return { status: 200, title: 'Sign-in complete', message: 'You can close this tab and return to OhPiChamber.' };
    }
    const detail = result.data.status === 'unauthenticated' ? result.data.error?.detail : undefined;
    return {
      status: 400,
      title: 'Sign-in was not completed',
      message: detail !== undefined ? boundedDetail(detail) : 'The provider rejected the sign-in. Start it again from OhPiChamber.',
    };
  } catch {
    return { status: 502, title: 'Sign-in could not finish', message: 'The Agent Service could not be reached. Start OhPiChamber again and retry the sign-in.' };
  }
};
