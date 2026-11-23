import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { getAgentDir } from '@oh-my-pi/pi-utils';
import type { IncomingMessage } from 'node:http';
import {
  AgentCreateRequestSchema, AgentUpdateRequestSchema, AgentDeleteRequestSchema,
  ProviderConfigureRequestSchema, ProviderDeleteRequestSchema, ModelConfigureRequestSchema, ModelDeleteRequestSchema,
  ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema,
  ProviderAccountMutationRequestSchema, ProviderOAuthRequestSchema, ProviderModelDiscoveryRequestSchema,
  ProviderModelEnrichRequestSchema,
  CompletionRequestSchema, CompletionCancelRequestSchema, EntityIdSchema,
  MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPOAuthRequestSchema, MCPSecretWriteRequestSchema,
  CacheWarmingUpdateRequestSchema,
  ImageGenerateRequestSchema, ImageModelConfigureRequestSchema,
  UsageQuerySchema, UsageStatsSchema, UsageToolsResponseSchema,
  WebSearchUpdateRequestSchema, WebSearchCredentialWriteRequestSchema, WebSearchCredentialDeleteRequestSchema,
  OmpSettingsUpdateRequestSchema,
  SessionToolsCatalogSchema,
} from '@openchamber/agent-contract';
import type { WorkspaceCatalogs } from './workspaces.ts';
import type { WorkerRegistry } from './workers.ts';
import { WorkerOperationError } from './workers.ts';
import type { CatalogOperation, CatalogResult } from '../catalogs/protocol.ts';
import { PrivateCredentialResolveRequestSchema, PrivateCredentialHandoffRequestSchema } from '../catalogs/private-credentials.ts';
import type { CatalogCoordinator } from './catalog.ts';
import type { McpOperation } from '../worker/mcp/protocol.ts';
import {
  PluginInstallRequestSchema, PluginUninstallRequestSchema, PluginConfigureRequestSchema,
  LocalExtensionWriteRequestSchema, LocalExtensionDeleteRequestSchema, PluginApplyRequestSchema,
  PluginMarketplaceManageRequestSchema, PluginPreviewUpgradeRequestSchema, PluginUpgradeAllRequestSchema,
  PluginUpgradeRequestSchema,
  ExtensionToggleRequestSchema,
  type PluginApplyRequest, type PluginMutationResult
} from '@openchamber/agent-contract';
import type { NativePluginOperation, NativeExtensionOperation } from '../catalogs/plugins.ts';
import { fileResourceRoute } from './file-resource-routes.ts';
import { UsageAuthorizationSchema } from '../protocol.ts';
import type { SessionRegistry } from '../sessions/registry.ts';
import type { WebSearchCoordinator } from './websearch.ts';

const UsageRequestSchema = z.strictObject({ query: UsageQuerySchema, authorizedScopes: UsageAuthorizationSchema });

function id(value: string): string {
  try { return EntityIdSchema.parse(decodeURIComponent(value)); }
  catch { throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The workspace route does not match a known shape'); }
}
function match(actual: string, expected: string): void {
  if (actual !== expected) throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The request does not address the captured workspace');
}
function unwrap(result: CatalogResult) {
  switch (result.type) {
    case 'catalog.models': case 'catalog.providers': case 'catalog.agents': return result.catalog;
    case 'catalog.image.generated': case 'catalog.image.mutated': return result.result;
    case 'catalog.provider.mutated': case 'catalog.model.mutated': case 'catalog.credential.mutated': case 'catalog.agent.mutated': return result.result;
    case 'catalog.provider.accounts': case 'catalog.provider.oauth.methods': case 'catalog.provider.oauth':
    case 'catalog.provider.models.discovered': case 'catalog.provider.models.enriched':
    case 'catalog.provider.configuration': return result.result;
    default: throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The catalog operation returned an unknown result');
  }
}

/** Exact workspace catalog paths; private native envelopes never become canonical responses. */
export class WorkspaceRoutes {
  private readonly usageWorkerId = randomUUID();
  constructor(private readonly catalogs: WorkspaceCatalogs, private readonly workers: WorkerRegistry, private readonly mcp: CatalogCoordinator,
    private readonly sessions: SessionRegistry, private readonly stateDirectory: string, private readonly webSearch: WebSearchCoordinator,
    private readonly applyPlugins?: (workspaceId: string, request: PluginApplyRequest) => Promise<PluginMutationResult>) { }
  async handle(request: IncomingMessage, url: URL, readBody: <T>(request: IncomingMessage, schema: z.ZodType<T>) => Promise<T>) {
    const extensions = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/extensions$/.exec(url.pathname);
    if (extensions) {
      const workspaceId = id(extensions[1]);
      let operation: NativeExtensionOperation;
      if (request.method === 'GET') operation = { type: 'extensions.read' };
      else if (request.method === 'PATCH') operation = { type: 'extensions.toggle', request: await readBody(request, ExtensionToggleRequestSchema) };
      else return null;
      const result = await this.catalogs.operation(workspaceId, operation);
      if (result.type !== 'extensions.inventory') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested extensions.inventory operation.');
      return { status: 200, body: result.state };
    }
    const workspaceTools = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/tools$/.exec(url.pathname);
    if (workspaceTools && request.method === 'GET') {
      const workspaceId = id(workspaceTools[1]);
      const liveWorker = this.workers.list().find(w => {
        const bootstrap = this.workers.bootstrap(w.rootSessionId);
        return bootstrap?.workspaceId === workspaceId;
      });
      let result;
      if (liveWorker) {
        result = await this.workers.request(liveWorker.rootSessionId, { type: 'tools.catalog' });
      } else {
        const root = await this.catalogs.stateless(workspaceId);
        result = await this.workers.request(root, { type: 'tools.catalog' });
      }
      if (result.type !== 'tools.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested tools.catalog operation.');
      const catalog = SessionToolsCatalogSchema.parse(result.catalog);
      // The workspace catalog answers for the saved MCP configuration, not for
      // whichever session worker happened to apply it, so a saved profile can
      // select a server's tools before any chat exists.
      const mcp = await this.mcp.workspaceMcpTools(workspaceId);
      for (const tool of mcp.tools) {
        if (catalog.tools.some(entry => entry.name === tool.name)) continue;
        catalog.tools.push({ name: tool.name, label: tool.name, description: tool.description, tier: 'exec', availability: true });
      }
      return { status: 200, body: catalog };
    }
    const plugins = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/plugins(?:\/(.*))?$/.exec(url.pathname);
    if (plugins) {
      const workspaceId = id(plugins[1]);
      const action = plugins[2] ?? '';
      let operation: NativePluginOperation;
      if (request.method === 'GET' && action === '') operation = { type: 'plugins.read' };
      else if (request.method === 'GET' && action === 'doctor') operation = { type: 'plugins.doctor' };
      else if (request.method === 'GET' && action === 'marketplace') operation = { type: 'plugins.marketplace' };
      else if (request.method === 'GET' && action === 'marketplace/updates') operation = { type: 'plugins.marketplace.checkUpdates' };
      else if (request.method === 'POST' && action === 'marketplace/manage') operation = {
        type: 'plugins.marketplace.manage', request: await readBody(request, PluginMarketplaceManageRequestSchema)
      };
      else if (request.method === 'POST' && action === 'marketplace/preview-upgrade') operation = {
        type: 'plugins.marketplace.previewUpgrade', request: await readBody(request, PluginPreviewUpgradeRequestSchema)
      };
      else if (request.method === 'POST' && action === 'marketplace/upgrade-all') operation = {
        type: 'plugins.marketplace.upgradeAll', request: await readBody(request, PluginUpgradeAllRequestSchema)
      };
      else if (request.method === 'POST' && action === 'install') operation = { type: 'plugins.install', request: await readBody(request, PluginInstallRequestSchema) };
      else if (request.method === 'POST' && action === 'uninstall') operation = { type: 'plugins.uninstall', request: await readBody(request, PluginUninstallRequestSchema) };
      else if (request.method === 'POST' && action === 'apply') {
        if (!this.applyPlugins) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The plugin application owner is unavailable');
        return { status: 200, body: await this.applyPlugins(workspaceId, await readBody(request, PluginApplyRequestSchema)) };
      } else {
        let decoded: string;
        try { decoded = decodeURIComponent(action); } catch { throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The workspace action is not a valid path segment'); }
        if (action.startsWith('local/') && action.slice(6).length > 0 && !action.slice(6).includes('/')) {
          const extensionId = decoded.slice(6);
          if (request.method === 'GET') operation = { type: 'plugins.local.read', extensionId };
          else if (request.method === 'PUT') {
            const input = await readBody(request, LocalExtensionWriteRequestSchema);
            match(extensionId, input.extensionId);
            operation = { type: 'plugins.local.write', request: input };
          } else if (request.method === 'DELETE') {
            const input = await readBody(request, LocalExtensionDeleteRequestSchema);
            match(extensionId, input.extensionId);
            operation = { type: 'plugins.local.delete', request: input };
          } else return null;
        } else if (request.method === 'PATCH' && action !== '' && !action.includes('/')) {
          const input = await readBody(request, PluginConfigureRequestSchema);
          match(decoded, input.target.name);
          operation = { type: 'plugins.configure', request: input };
        } else if (request.method === 'POST' && action.endsWith('/update') && !action.slice(0, -7).includes('/')) {
          const input = await readBody(request, PluginUpgradeRequestSchema);
          match(decoded.slice(0, -7), input.target.name);
          operation = { type: 'plugins.update', request: input };
        } else return null;
      }
      const result = await this.catalogs.operation(workspaceId, operation);
      if (result.type === 'plugins.catalog') return { status: 200, body: result.catalog };
      if (result.type === 'plugins.marketplaceSources') {
        return {
          status: 200, body: {
            workspaceId: result.result.workspaceId, revision: result.result.revision,
            sources: result.result.sources
          }
        };
      }
      if (result.type === 'plugins.mutated' || result.type === 'plugins.local' || result.type === 'plugins.doctor'
        || result.type === 'plugins.marketplace' || result.type === 'plugins.updateCheck' || result.type === 'plugins.upgradePreview') {
        return { status: 200, body: result.result };
      }
      throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The plugin route does not support this request');
    }
    const resource = await fileResourceRoute(this.catalogs, request, url, readBody);
    if (resource) return resource;
    if ((url.pathname === '/internal/usage' || url.pathname === '/internal/usage/tools') && request.method === 'POST') {
      if (url.search) throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The plugin route does not accept query parameters');
      const { query, authorizedScopes } = await readBody(request, UsageRequestSchema);
      const projects = new Map(authorizedScopes.map(scope => [scope.workspaceId, scope.projectId]));
      if ((query.workspaceId !== undefined && !projects.has(query.workspaceId))
        || (query.projectId !== undefined && authorizedScopes.length > 0 && !authorizedScopes.some(scope => scope.projectId === query.projectId
          && (query.workspaceId === undefined || scope.workspaceId === query.workspaceId)))) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The requested usage scope is not authorized for this session');
      for (const scope of authorizedScopes) {
        if (this.catalogs.get(scope.workspaceId).projectId !== scope.projectId) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The session workspace does not match its catalog project');
      }
      await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
      await this.workers.startUsage({
        rootSessionId: this.usageWorkerId, workspaceId: this.usageWorkerId, projectId: this.usageWorkerId,
        cwd: this.stateDirectory, agentDirectory: getAgentDir(), agentDirectoryId: this.usageWorkerId, catalogRevision: '0'
      });
      if (url.pathname === '/internal/usage/tools') {
        const references = this.sessions.usageReferences(authorizedScopes, query);
        const result = await this.workers.request(this.usageWorkerId, { type: 'usage.tools', query, references });
        if (result.type !== 'usage.tools') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested usage.tools operation.');
        return { status: 200, body: UsageToolsResponseSchema.parse(result.result) };
      }
      // Every report is bounded by the Host-authorized inventory: the exact transcripts of the
      // roots in scope plus their subagents. A query with neither filter means that whole
      // inventory, never every file under a sessions folder — one folder can hold another
      // workspace's transcripts, and OMP's default folder discovery cannot see a root's own.
      const sessionFiles = this.sessions.usageSessionFiles(authorizedScopes, query);
      const result = await this.workers.request(this.usageWorkerId, { type: 'usage.stats', query, sessionFiles });
      if (result.type !== 'usage.stats') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested usage.stats operation.');
      // Accounts fail on their own: their errors are named beside the session errors, never folded into an empty success.
      const accounts = await this.workers.request(this.usageWorkerId, { type: 'usage.accounts', query });
      if (accounts.type !== 'usage.accounts') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested usage.accounts operation.');
      const partial = result.result.partial || Object.keys(accounts.result.errors).length > 0;
      const errors = { ...result.result.errors, ...accounts.result.errors };
      return { status: 200, body: UsageStatsSchema.parse({ ...result.result, accounts: accounts.result.accounts, partial, ...(partial ? { errors } : {}) }) };
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
        catch { throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The completion request body is invalid'); }
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
    // `omp/settings` is the canonical OMP settings path; `/settings` is the short
    // form the client uses. Both address the same workspace revision.
    const settingsRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/(?:omp\/)?settings$/.exec(url.pathname);
    if (settingsRoute) {
      const workspaceId = id(settingsRoute[1]);
      this.catalogs.get(workspaceId);
      if (request.method === 'GET') {
        const result = await this.catalogs.operation(workspaceId, { type: 'catalog.settings.read' });
        if (result.type !== 'catalog.settings') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested catalog.settings operation.');
        return { status: 200, body: result.state };
      }
      if (request.method === 'PUT' || request.method === 'PATCH') {
        const result = await this.catalogs.operation(workspaceId, {
          type: 'catalog.settings.write', request: await readBody(request, OmpSettingsUpdateRequestSchema),
        });
        if (result.type !== 'catalog.settings.mutated') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested catalog.settings mutation operation.');
        return { status: 200, body: result.state };
      }
      return null;
    }
    const mcpRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/mcp\/(config|apply|servers\/([^/]+)\/(test|reconnect|oauth|credentials))$/.exec(url.pathname);
    if (mcpRoute) {
      const workspaceId = id(mcpRoute[1]);
      this.catalogs.get(workspaceId);
      const execute = async (operation: McpOperation) => {
        const root = await this.catalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp', operation });
        if (result.type !== 'mcp') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp workspace read operation.');
        return result.result;
      };
      if (mcpRoute[2] === 'config' && request.method === 'GET') return { status: 200, body: await this.mcp.readWorkspaceMcpConfig(workspaceId) };
      if (mcpRoute[2] === 'config' && request.method === 'PUT') return { status: 200, body: await this.mcp.configureWorkspaceMcp(workspaceId, await readBody(request, MCPConfigureRequestSchema)) };
      if (mcpRoute[2] === 'apply' && request.method === 'POST') return { status: 200, body: await this.mcp.applyWorkspaceMcp(workspaceId, await readBody(request, MCPApplyRequestSchema)) };
      if (mcpRoute[3] === undefined) return null;
      const serverId = id(mcpRoute[3]);
      const action = mcpRoute[4];
      if (action === 'reconnect' && request.method === 'POST') {
        const body = await readBody(request, MCPApplyRequestSchema);
        return { status: 200, body: await this.mcp.reconnectWorkspaceMcp(workspaceId, serverId, body) };
      }
      if (action === 'test' && request.method === 'POST') {
        const body = await readBody(request, MCPApplyRequestSchema);
        return {
          status: 200, body: await this.mcp.withWorkspaceMcp(workspaceId, body.persistedRevision, async configuration => {
            const result = await execute({ type: 'test', serverId, configuration });
            if (result.type !== 'tested') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp connection test operation.');
            return result.result;
          })
        };
      }
      if (action === 'oauth' && (request.method === 'GET' || request.method === 'POST')) {
        const body = request.method === 'POST' ? await readBody(request, MCPOAuthRequestSchema) : undefined;
        return {
          status: 200, body: await this.mcp.workspaceOAuth(serverId, workspaceId, body?.persistedRevision, body?.workerGeneration, async configuration => {
            const result = await execute(body ? { type: 'oauth', serverId, request: body, configuration } : { type: 'oauth.status', serverId, configuration });
            if (result.type !== 'oauth') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp oauth operation.');
            return result.result;
          })
        };
      }
      if (action === 'credentials' && request.method === 'PUT') {
        const body = await readBody(request, MCPSecretWriteRequestSchema);
        return {
          status: 200, body: await this.mcp.withWorkspaceMcp(workspaceId, body.persistedRevision, async configuration => {
            const result = await execute({ type: 'secret.write', serverId, request: body, configuration });
            if (result.type !== 'secret.written') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp secret write operation.');
            return result.result;
          })
        };
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
      if (requestBody.agentDirectoryId !== workspace.agentDirectoryId) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The credential request addresses a different agent directory');
      const result = 'purpose' in requestBody
        ? await this.catalogs.operation(workspaceId, { type: 'catalog.credential.resolve', request: requestBody })
        : await this.catalogs.operation(workspaceId, { type: 'catalog.credential.handoff', request: requestBody });
      if (result.type !== 'catalog.credential.resolved' && result.type !== 'catalog.credential.handed-off')
        throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested catalog credential operation.');
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
        if (result.type !== 'completion' || result.result.type !== 'completion.cancelled') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested completion cancel operation.');
        return { status: 200, body: result.result.result };
      }
      const body = await readBody(request, CompletionRequestSchema);
      match(body.workspaceId, workspaceId);
      const result = await this.workers.request(rootSessionId, { type: 'completion', operation: { type: 'completion.start', request: body } });
      if (result.type !== 'completion' || result.result.type !== 'completion.result') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested completion operation.');
      return { status: 200, body: result.result.result };
    }
    const imageRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/images\/(generate|config)$/.exec(url.pathname);
    if (imageRoute) {
      if (request.method !== 'POST') return null;
      const workspaceId = id(imageRoute[1]);
      if (imageRoute[2] === 'config') {
        const body = await readBody(request, ImageModelConfigureRequestSchema);
        return { status: 200, body: unwrap(await this.catalogs.operation(workspaceId, { type: 'catalog.image.configure', request: body })) };
      }
      const body = await readBody(request, ImageGenerateRequestSchema);
      match(body.workspaceId, workspaceId);
      return { status: 200, body: unwrap(await this.catalogs.operation(workspaceId, { type: 'catalog.image.generate', request: body })) };
    }
    const providerRoute = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/providers\/(oauth-methods|discover|enrich|([^/]+)\/(accounts|oauth|config))$/.exec(url.pathname);
    if (providerRoute) {
      const workspaceId = id(providerRoute[1]);
      const providerId = providerRoute[3] === undefined ? undefined : id(providerRoute[3]);
      let operation: CatalogOperation | undefined;
      if (providerRoute[2] === 'oauth-methods' && request.method === 'GET') operation = { type: 'catalog.provider.oauth.methods' };
      else if (providerRoute[2] === 'discover' && request.method === 'POST') operation = { type: 'catalog.provider.models.discover', request: await readBody(request, ProviderModelDiscoveryRequestSchema) };
      else if (providerRoute[2] === 'enrich' && request.method === 'POST') operation = { type: 'catalog.provider.models.enrich', request: await readBody(request, ProviderModelEnrichRequestSchema) };
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
        const body = await readBody(request, ProviderConfigureRequestSchema);
        const targetProviderId = body.native?.providerId ?? body.configuration?.providerId;
        if (!targetProviderId) {
          throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The provider configuration is missing a provider identity');
        }
        match(targetProviderId, entity);
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
