import type { IncomingMessage } from 'node:http';
import {
 EntityIdSchema,
 SessionRecapListResponseSchema,
 SubagentListResponseSchema,
 SubagentTranscriptResponseSchema,
 SubagentTreeCostResponseSchema,
 SessionToolsCatalogSchema,
 type SessionRecapListResponse,
 type SubagentListResponse,
 type SubagentTranscriptResponse,
 type SubagentTreeCostResponse,
 type SessionToolsCatalog,
} from '@openchamber/agent-contract';
import { WorkerOperationError } from '../supervisor/workers.ts';
import type { SessionRegistry } from './registry.ts';

/** Public session read routes owned by the recap and Agent Hub surfaces. */
export interface SessionSurfaceResponse {
 status: number;
 body: SessionRecapListResponse | SubagentListResponse | SubagentTranscriptResponse | SubagentTreeCostResponse | SessionToolsCatalog;
}

function identity(value: string): string {
 try {
  return EntityIdSchema.parse(decodeURIComponent(value));
 } catch {
  throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The session id is not a valid entity id');
 }
}

/**
 * Recap and Agent Hub reads. They are GET-only and resolve through the session
 * registry, so a session the Host never admitted is refused before any native
 * transcript or index read happens.
 *
 * `GET /api/agent/v1/sessions/:id/recaps`
 * `GET /api/agent/v1/sessions/:id/subagents`
 * `GET /api/agent/v1/sessions/:id/subagents/:subagentId/transcript`
 * `GET /api/agent/v1/sessions/:id/subagents/tree-cost`
 */
export async function sessionSurfaceRoute(
 sessions: Pick<SessionRegistry, 'listRecaps' | 'listHubSubagents' | 'subagentTranscript' | 'subagentTreeCost' | 'tools'>,
 request: IncomingMessage,
 url: URL,
): Promise<SessionSurfaceResponse | null> {
 if (request.method !== 'GET') return null;
 const recaps = /^\/api\/agent\/v1\/sessions\/([^/]+)\/recaps$/.exec(url.pathname);
 if (recaps) {
  const sessionId = identity(recaps[1]);
  return { status: 200, body: SessionRecapListResponseSchema.parse({ recaps: await sessions.listRecaps(sessionId) }) };
 }
 const tools = /^\/api\/agent\/v1\/sessions\/([^/]+)\/tools(?:\/catalog)?$/.exec(url.pathname);
 if (tools) {
  const sessionId = identity(tools[1]);
  return { status: 200, body: SessionToolsCatalogSchema.parse(await sessions.tools(sessionId)) };
 }
 const hub = /^\/api\/agent\/v1\/sessions\/([^/]+)\/subagents(?:\/(.+))?$/.exec(url.pathname);
 if (!hub) return null;
 const sessionId = identity(hub[1]);
 const action = hub[2];
 if (action === undefined) {
  return { status: 200, body: SubagentListResponseSchema.parse({ subagents: await sessions.listHubSubagents(sessionId) }) };
 }
 if (action === 'tree-cost') {
  return { status: 200, body: SubagentTreeCostResponseSchema.parse(await sessions.subagentTreeCost(sessionId)) };
 }
 const transcript = /^([^/]+)\/transcript$/.exec(action);
 if (!transcript) return null;
 return { status: 200, body: SubagentTranscriptResponseSchema.parse(await sessions.subagentTranscript(sessionId, identity(transcript[1]))) };
}
