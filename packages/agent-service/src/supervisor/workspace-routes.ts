import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import {
  AgentCreateRequestSchema, AgentUpdateRequestSchema, AgentDeleteRequestSchema,
  ProviderConfigureRequestSchema, ProviderDeleteRequestSchema, ModelConfigureRequestSchema, ModelDeleteRequestSchema,
  ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema,
  ProviderAccountMutationRequestSchema, ProviderOAuthRequestSchema, ProviderModelDiscoveryRequestSchema,
  CompletionRequestSchema, CompletionCancelRequestSchema, EntityIdSchema,
  MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPConnectionTestRequestSchema, MCPWorkspaceReconnectRequestSchema, MCPOAuthRequestSchema, MCPSecretWriteRequestSchema,
  CacheWarmingUpdateRequestSchema,
  UsageQuerySchema, UsageStatsSchema, UsageToolsResponseSchema,
  WebSearchUpdateRequestSchema, WebSearchCredentialWriteRequestSchema, WebSearchCredentialDeleteRequestSchema,
} from '@openchamber/agent-contract';
import type { WorkspaceCatalogs } from './workspaces.ts';
import type { WorkerRegistry } from './workers.ts';
import { WorkerOperationError } from './workers.ts';
import type { CatalogOperation, CatalogResult } from '../catalogs/protocol.ts';
import { PrivateCredentialResolveRequestSchema, PrivateCredentialHandoffRequestSchema } from '../catalogs/private-credentials.ts';
import type { CatalogCoordinator } from './catalog.ts';
import type { McpOperation } from '../worker/mcp/protocol.ts';
import { UsageAuthorizationSchema } from '../protocol.ts';
import type { SessionRegistry } from '../sessions/registry.ts';
import type { WebSearchCoordinator } from './websearch.ts';

const UsageRequestSchema = z.strictObject({ query: UsageQuerySchema, authorizedScopes: UsageAuthorizationSchema });

function id(value: string): string {
  try { return EntityIdSchema.parse(decodeURIComponent(value)); }
  catch { throw new WorkerOperationError(400, 'INVALID_REQUEST'); }
}
function match(actual: string, expected: string): void {
  if (actual !== expected) throw new WorkerOperationError(400, 'INVALID_REQUEST');
}
function unwrap(result: CatalogResult) {
  switch (result.type) {
    case 'catalog.models': case 'catalog.providers': case 'catalog.agents': return result.catalog;
    case 'catalog.provider.mutated': case 'catalog.model.mutated': case 'catalog.credential.mutated': case 'catalog.agent.mutated': return result.result;
    case 'catalog.provider.accounts': case 'catalog.provider.oauth.methods': case 'catalog.provider.oauth':
    case 'catalog.provider.models.discovered': case 'catalog.provider.configuration': return result.result;
    default: throw new WorkerOperationError(503, 'INTERNAL_ERROR');
  }
}

/** Exact workspace catalog paths; private native envelopes never become canonical responses. */
export class WorkspaceRoutes {
  private readonly usageWorkerId = randomUUID();
  constructor(private readonly catalogs: WorkspaceCatalogs, private readonly workers: WorkerRegistry, private readonly mcp: CatalogCoordinator,
    private readonly sessions: SessionRegistry, private readonly stateDirectory: string, private readonly webSearch: WebSearchCoordinator) {}
  async handle(request: IncomingMessage, url: URL, readBody: <T>(request: IncomingMessage, schema: z.ZodType<T>) => Promise<T>) {
    if ((url.pathname === '/internal/usage' || url.pathname === '/internal/usage/tools') && request.method === 'POST') {
      if (url.search) throw new WorkerOperationError(400, 'INVALID_REQUEST');
      const { query, authorizedScopes } = await readBody(request, UsageRequestSchema);
      const projects = new Map(authorizedScopes.map(scope => [scope.workspaceId, scope.projectId]));
      if ((query.workspaceId !== undefined && !projects.has(query.workspaceId))
        || (query.projectId !== undefined && authorizedScopes.length > 0 && !authorizedScopes.some(scope => scope.projectId === query.projectId
          && (query.workspaceId === undefined || scope.workspaceId === query.workspaceId)))) throw new WorkerOperationError(403, 'UNAUTHORIZED');
      for (const scope of authorizedScopes) {
        if (this.catalogs.get(scope.workspaceId).projectId !== scope.projectId) throw new WorkerOperationError(403, 'UNAUTHORIZED');
      }
      const references = this.sessions.usageReferences(authorizedScopes, query);
      await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
      await this.workers.startUsage({ rootSessionId: this.usageWorkerId, workspaceId: this.usageWorkerId, projectId: this.usageWorkerId,
        cwd: this.stateDirectory, agentDirectory: this.stateDirectory, agentDirectoryId: this.usageWorkerId, catalogRevision: '0' });
      if (url.pathname === '/internal/usage/tools') {
        const result = await this.workers.request(this.usageWorkerId, { type: 'usage.tools', query, references });
        if (result.type !== 'usage.tools') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        return { status: 200, body: UsageToolsResponseSchema.parse(result.result) };
      }
      const result = await this.workers.request(this.usageWorkerId, { type: 'usage.stats', query, references });
      if (result.type !== 'usage.stats') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      return { status: 200, body: UsageStatsSchema.parse(result.result) };
    }
    const searchRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/web-search(?:\/credentials\/([^/]+))?$/.exec(url.pathname);
    if (searchRoute) {
      const workspaceId = id(searchRoute[1]);
      this.catalogs.get(workspaceId);
      if (searchRoute[2] === undefined) {
        if (request.method === 'GET') return { status: 200, body: await this.webSearch.read(workspaceId) };
        if (request.method === 'PUT') return { status: 200, body: await this.webSearch.mutate(workspaceId, { type: 'update', request: await readBody(request, WebSearchUpdateRequestSchema) }) };
      } else {
        let providerId: string;
        try { providerId = z.string().min(1).parse(decodeURIComponent(searchRoute[2])); }
        catch { throw new WorkerOperationError(400, 'INVALID_REQUEST'); }
        if (request.method === 'PUT') {
          const body = await readBody(request, WebSearchCredentialWriteRequestSchema);
          match(body.providerId, providerId);
          return { status: 200, body: await this.webSearch.mutate(workspaceId, { type: 'credential.write', request: body }) };
        }
        if (request.method === 'DELETE') {
          const body = await readBody(request, WebSearchCredentialDeleteRequestSchema);
          match(body.providerId, providerId);
          return { status: 200, body: await this.webSearch.mutate(workspaceId, { type: 'credential.delete', request: body }) };
        }
      }
      return null;
    }
    const warming = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/cache-warming$/.exec(url.pathname);
    if (warming) {
      const workspaceId = id(warming[1]);
      this.catalogs.get(workspaceId);
      if (request.method === 'GET') return { status: 200, body: await this.catalogs.readCacheWarming(workspaceId) };
      if (request.method === 'PUT') return { status: 200, body: await this.catalogs.updateCacheWarming(workspaceId, await readBody(request, CacheWarmingUpdateRequestSchema)) };
      return null;
    }
    const mcpRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/mcp\/(config|apply|servers\/([^/]+)\/(test|reconnect|oauth|credentials))$/.exec(url.pathname);
    if (mcpRoute) {
      const workspaceId = id(mcpRoute[1]);
      this.catalogs.get(workspaceId);
      const execute = async (operation: McpOperation) => {
        const root = await this.catalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp', operation });
        if (result.type !== 'mcp') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        return result.result;
      };
      if (mcpRoute[2] === 'config' && request.method === 'GET') return { status: 200, body: await this.mcp.readWorkspaceMcpConfig(workspaceId) };
      if (mcpRoute[2] === 'config' && request.method === 'PUT') return { status: 200, body: await this.mcp.configureWorkspaceMcp(workspaceId, await readBody(request, MCPConfigureRequestSchema)) };
      if (mcpRoute[2] === 'apply' && request.method === 'POST') return { status: 200, body: await this.mcp.applyWorkspaceMcp(workspaceId, await readBody(request, MCPApplyRequestSchema)) };
      if (mcpRoute[3] === undefined) return null;
      const serverId = id(mcpRoute[3]);
      const action = mcpRoute[4];
      if (action === 'reconnect' && request.method === 'POST') {
        const body = await readBody(request, MCPWorkspaceReconnectRequestSchema);
        return { status: 200, body: await this.mcp.reconnectWorkspaceMcp(workspaceId, serverId, body, async configuration => {
          const result = await execute({ type: 'test', serverId, configuration });
          if (result.type !== 'tested') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result;
        }) };
      }
      if (action === 'test' && request.method === 'POST') {
        const body = await readBody(request, MCPConnectionTestRequestSchema);
        return { status: 200, body: await this.mcp.withWorkspaceMcp(workspaceId, body.persistedRevision, async configuration => {
          const result = await execute({ type: 'test', serverId, configuration });
          if (result.type !== 'tested') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result;
        }) };
      }
      if (action === 'oauth' && (request.method === 'GET' || request.method === 'POST')) {
        const body = request.method === 'POST' ? await readBody(request, MCPOAuthRequestSchema) : undefined;
        return { status: 200, body: await this.mcp.workspaceOAuth(serverId, workspaceId, body?.persistedRevision, body?.workerGeneration, async configuration => {
          const result = await execute(body ? { type: 'oauth', serverId, request: body, configuration } : { type: 'oauth.status', serverId, configuration });
          if (result.type !== 'oauth') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result;
        }) };
      }
      if (action === 'credentials' && request.method === 'PUT') {
        const body = await readBody(request, MCPSecretWriteRequestSchema);
        return { status: 200, body: await this.mcp.withWorkspaceMcp(workspaceId, body.persistedRevision, async configuration => {
          const result = await execute({ type: 'secret.write', serverId, request: body, configuration });
          if (result.type !== 'secret.written') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return result.result;
        }) };
      }
      return null;
    }
    const privateCredential = /^\/internal\/workspaces\/([^/]+)\/credentials\/(resolve|handoff)$/.exec(url.pathname);
    if (privateCredential && request.method === 'POST') {
      const workspaceId = id(privateCredential[1]);
      const requestBody = privateCredential[2] === 'resolve'
        ? await readBody(request, PrivateCredentialResolveRequestSchema)
        : await readBody(request, PrivateCredentialHandoffRequestSchema);
      match(requestBody.workspaceId, workspaceId);
      const workspace = this.catalogs.get(workspaceId);
      // Private callers cannot redirect the stateless owner to a sibling agent directory.
      if (requestBody.agentDirectoryId !== workspace.agentDirectoryId) throw new WorkerOperationError(403, 'UNAUTHORIZED');
      const result = 'purpose' in requestBody
        ? await this.catalogs.operation(workspaceId, { type: 'catalog.credential.resolve', request: requestBody })
        : await this.catalogs.operation(workspaceId, { type: 'catalog.credential.handoff', request: requestBody });
      if (result.type !== 'catalog.credential.resolved' && result.type !== 'catalog.credential.handed-off')
        throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      return { status: 200, body: result.result };
    }
    const completion = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/completions(?:\/([^/]+)\/cancel)?$/.exec(url.pathname);
    if (completion && request.method === 'POST') {
      const workspaceId = id(completion[1]);
      const rootSessionId = await this.catalogs.stateless(workspaceId);
      if (completion[2] !== undefined) {
        const body = await readBody(request, CompletionCancelRequestSchema);
        match(body.completionId, id(completion[2]));
        const result = await this.workers.request(rootSessionId, { type: 'completion', operation: { type: 'completion.cancel', request: body } });
        if (result.type !== 'completion' || result.result.type !== 'completion.cancelled') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        return { status: 200, body: result.result.result };
      }
      const body = await readBody(request, CompletionRequestSchema);
      match(body.workspaceId, workspaceId);
      const result = await this.workers.request(rootSessionId, { type: 'completion', operation: { type: 'completion.start', request: body } });
      if (result.type !== 'completion' || result.result.type !== 'completion.result') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      return { status: 200, body: result.result.result };
    }
    const providerRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/providers\/(oauth-methods|discover|([^/]+)\/(accounts|oauth|config))$/.exec(url.pathname);
    if (providerRoute) {
      const workspaceId = id(providerRoute[1]);
      const providerId = providerRoute[3] === undefined ? undefined : id(providerRoute[3]);
      let operation: CatalogOperation | undefined;
      if (providerRoute[2] === 'oauth-methods' && request.method === 'GET') operation = { type: 'catalog.provider.oauth.methods' };
      else if (providerRoute[2] === 'discover' && request.method === 'POST') operation = { type: 'catalog.provider.models.discover', request: await readBody(request, ProviderModelDiscoveryRequestSchema) };
      else if (providerId !== undefined) {
        if (providerRoute[4] === 'accounts' && request.method === 'GET') operation = { type: 'catalog.provider.accounts.read', providerId };
        else if (providerRoute[4] === 'accounts' && request.method === 'POST') operation = { type: 'catalog.provider.account.mutate', providerId, request: await readBody(request, ProviderAccountMutationRequestSchema) };
        else if (providerRoute[4] === 'oauth' && request.method === 'POST') operation = { type: 'catalog.provider.oauth', providerId, request: await readBody(request, ProviderOAuthRequestSchema) };
        else if (providerRoute[4] === 'config' && request.method === 'GET') operation = { type: 'catalog.provider.configuration.read', providerId };
      }
      if (operation) return { status: 200, body: unwrap(await this.catalogs.operation(workspaceId, operation)) };
    }
    const route = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/(models|providers|agents)(?:\/([^/]+))?(?:\/(config|models|credential)(?:\/([^/]+))?)?$/.exec(url.pathname);
    if (!route) return null;
    const workspaceId = id(route[1]);
    const entity = route[3] === undefined ? undefined : id(route[3]);
    const item = route[5] === undefined ? undefined : id(route[5]);
    let operation: CatalogOperation;
    let status = 200;
    if (route[3] === undefined && route[4] === undefined && request.method === 'GET') {
      operation = { type: route[2] === 'models' ? 'catalog.models.read' : route[2] === 'providers' ? 'catalog.providers.read' : 'catalog.agents.read' };
    } else if (route[2] === 'agents' && route[4] === undefined) {
      if (entity === undefined && request.method === 'POST') {
        operation = { type: 'catalog.agent.create', request: await readBody(request, AgentCreateRequestSchema) }; status = 201;
      } else if (entity !== undefined && request.method === 'PUT') {
        const body = await readBody(request, AgentUpdateRequestSchema); match(body.agent.agentId, entity);
        operation = { type: 'catalog.agent.update', request: body };
      } else if (entity !== undefined && request.method === 'DELETE') {
        const body = await readBody(request, AgentDeleteRequestSchema); match(body.agentId, entity);
        operation = { type: 'catalog.agent.delete', request: body };
      } else return null;
    } else if (route[2] === 'providers' && entity !== undefined) {
      if (route[4] === 'config' && item === undefined && request.method === 'PUT') {
        const body = await readBody(request, ProviderConfigureRequestSchema); match(body.configuration.providerId, entity);
        operation = { type: 'catalog.provider.configure', request: body };
      } else if (route[4] === undefined && request.method === 'DELETE') {
        const body = await readBody(request, ProviderDeleteRequestSchema); match(body.providerId, entity);
        operation = { type: 'catalog.provider.delete', request: body };
      } else if (route[4] === 'models' && item !== undefined && request.method === 'PUT') {
        const body = await readBody(request, ModelConfigureRequestSchema); match(body.model.provider, entity); match(body.model.modelId, item);
        operation = { type: 'catalog.model.configure', request: body };
      } else if (route[4] === 'models' && item !== undefined && request.method === 'DELETE') {
        const body = await readBody(request, ModelDeleteRequestSchema); match(body.selection.providerId, entity); match(body.selection.modelId, item);
        operation = { type: 'catalog.model.delete', request: body };
      } else if (route[4] === 'credential' && item === undefined && request.method === 'PUT') {
        const body = await readBody(request, ProviderCredentialWriteRequestSchema); match(body.providerId, entity);
        operation = { type: 'catalog.credential.write', request: body };
      } else if (route[4] === 'credential' && item !== undefined && request.method === 'DELETE') {
        const body = await readBody(request, ProviderCredentialDeleteRequestSchema); match(body.providerId, entity); match(body.credentialRef, item);
        operation = { type: 'catalog.credential.delete', request: body };
      } else return null;
    } else return null;
    return { status, body: unwrap(await this.catalogs.operation(workspaceId, operation)) };
  }
}
