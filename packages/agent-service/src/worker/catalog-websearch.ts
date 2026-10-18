import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { withFileLock } from '@oh-my-pi/pi-utils/file-lock';
import { modelKind } from '@oh-my-pi/pi-catalog/types';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { getRoleInfo, roleCandidatePool } from '@oh-my-pi/pi-coding-agent/config/model-roles';
import { resolveRoleChain, formatModelStringWithRouting as selector } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { cfgWebSearchEnabled } from '@oh-my-pi/pi-coding-agent/tools/settings';
import { cfgProvidersWebSearchTimeoutSeconds, cfgRetryFallbackChains } from '@oh-my-pi/pi-coding-agent/session/settings';
import { getSearchProvider, getGroundedSearchProvider, type SearchProvider } from '@oh-my-pi/pi-coding-agent/web/search/provider';
import { CounterSchema, WebSearchConfigStateSchema, WebSearchMutationResultSchema, type WebSearchConfigState, type WebSearchProviderEntry } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import type { NativeWorkerRuntime } from './native-runtime.ts';
import type { WorkerAuthorize } from './policy.ts';
import { WebSearchOperationSchema, type WebSearchOperation, type WebSearchResult } from './websearch/protocol.ts';

import type { NativeCatalogModel } from './catalog-models.ts';
type SearchModel = NativeCatalogModel;
const guarded = new WeakMap<SearchProvider, { runtime: NativeWorkerRuntime; authorize: WorkerAuthorize }>();
const poisoned = new WeakSet<NativeWorkerRuntime>();

// Credential owners below mirror the pinned transports' keys.resolver calls, not engine discovery.
const engineCredentialOwners = {
  brave: 'brave', exa: 'exa', firecrawl: 'firecrawl', jina: 'jina', kagi: 'kagi', kimi: 'kimi-code',
  ollama: 'ollama-cloud', parallel: 'parallel', perplexity: 'perplexity', synthetic: 'synthetic',
  tavily: 'tavily', tinyfish: 'tinyfish', zai: 'zai',
};
const optionalCredentialEngines = ['exa', 'firecrawl', 'parallel', 'perplexity'];
/** Native cached transports are guarded, not a parallel search implementation. */
export async function installWebSearchAuthorization(runtime: NativeWorkerRuntime, authorize: WorkerAuthorize): Promise<void> {
  const models = runtime.modelRegistry.getAll('all').filter(getRoleInfo('web', runtime.settings).accepts);
  const transports = await Promise.all(models.filter(model => model.id !== 'hosted').map(model => providerFor(model)));
  for (const provider of transports) {
    if (!provider) continue;
    const installed = guarded.has(provider);
    guarded.set(provider, { runtime, authorize });
    if (installed) continue;
    const search = provider.search.bind(provider);
    provider.search = async params => {
      const context = guarded.get(provider);
      if (!context || poisoned.has(context.runtime)) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native search settings are unavailable');
      if (!cfgWebSearchEnabled.get(context.runtime.settings)) throw new ProjectionError(403, 'UNAUTHORIZED', 'Web search is disabled');
      await context.authorize({ type: 'web-search' });
      return search(params);
    };
  }
}

function providerFor(model: SearchModel): Promise<SearchProvider | undefined> {
  if (modelKind(model) === 'search') return model.id === 'hosted' ? Promise.resolve(undefined) : getSearchProvider(model.id);
  return model.webSearch ? getGroundedSearchProvider(model.webSearch) : Promise.resolve(undefined);
}

/** Durable revision and native global settings share their actual agent-directory owner. */
export class NativeWebSearch {
  private readonly revisionPath: string;
  private failed = false;
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly runtime: NativeWorkerRuntime, private readonly workspaceId: string, private readonly authorize: WorkerAuthorize) {
    this.revisionPath = join(realpathSync(runtime.settings.getAgentDir()), 'openchamber-web-search-revision');
  }

  get requiresRestart(): boolean { return this.failed; }

  operation(input: WebSearchOperation): Promise<WebSearchResult> {
    const operation = WebSearchOperationSchema.parse(input);
    const task = this.tail.then(() => this.execute(operation));
    this.tail = task.then(() => undefined, () => undefined);
    return task;
  }

  private async execute(operation: WebSearchOperation): Promise<WebSearchResult> {
    if (operation.type === 'read') return { type: 'state', state: await this.read() };
    if (operation.type === 'apply') {
      if (this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native search settings require a fresh worker');
      await this.reload();
      return { type: 'applied' };
    }
    if (this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native search settings require a fresh worker');
    await mkdir(this.runtime.settings.getAgentDir(), { recursive: true, mode: 0o700 });
    return withFileLock(this.revisionPath, async () => {
      await this.reload();
      const before = await this.readCurrent(this.runtime.settings);
      if (before.revision !== operation.request.expectedRevision) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Web search configuration revision changed');
      if (operation.type === 'update') {
        const request = operation.request;
        const blockedSources = ['project', 'overlay', 'env'];
        if ((request.enabled !== undefined && blockedSources.includes(cfgWebSearchEnabled.provenance(this.runtime.settings)))
          || (request.timeoutSeconds !== undefined && blockedSources.includes(cfgProvidersWebSearchTimeoutSeconds.provenance(this.runtime.settings)))
          || (request.selectedProviderId !== undefined && blockedSources.includes(this.runtime.settings.getModelRoleProvenance('web')))
          || (request.fallbackProviderIds !== undefined && blockedSources.includes(cfgRetryFallbackChains.provenance(this.runtime.settings)))) {
          throw new ProjectionError(409, 'CATALOG_CONFLICT', 'A higher-priority native settings source owns the requested value');
        }
        const selected = operation.request.selectedProviderId === undefined ? before.selectedProviderId : operation.request.selectedProviderId;
        const fallbacks = operation.request.fallbackProviderIds ?? before.fallbackProviderIds;
        if (selected && fallbacks.includes(selected)) throw new ProjectionError(400, 'INVALID_REQUEST', 'Primary search model cannot also be a fallback');
        for (const id of [...(selected ? [selected] : []), ...fallbacks]) {
          if (!before.providers.some(provider => provider.providerId === id)) throw new ProjectionError(400, 'INVALID_REQUEST', 'Unknown native web search model selector');
        }
      } else {
        const provider = before.providers.find(entry => entry.providerId === operation.request.providerId);
        if (!provider?.credentialWritable) throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Search model credentials are managed by its native provider');
      }
      if (operation.type === 'credential.write') await this.authorize({ type: 'provider-entry' });
      // Reserve durably before either native store is touched. Failed writes consume the CAS token.
      const revision = CounterSchema.parse((BigInt(before.revision) + 1n).toString());
      try { await this.persistRevision(revision); }
      catch { return { type: 'mutated', result: WebSearchMutationResultSchema.parse({ state: before, status: 'failed', persistence: 'failed', workers: [] }) }; }
      try {
        if (operation.type === 'update') {
          const request = operation.request;
          if (request.enabled !== undefined) cfgWebSearchEnabled.set(this.runtime.settings, request.enabled);
          if (request.timeoutSeconds !== undefined) cfgProvidersWebSearchTimeoutSeconds.set(this.runtime.settings, request.timeoutSeconds);
          if (request.selectedProviderId !== undefined) this.runtime.settings.setModelRole('web', request.selectedProviderId ?? undefined);
          if (request.fallbackProviderIds !== undefined) cfgRetryFallbackChains.setEntry(this.runtime.settings, 'web', request.fallbackProviderIds);
          await this.runtime.settings.flush();
        } else {
          const nativeModel = this.runtime.modelRegistry.getAll('all').find(model => selector(model) === operation.request.providerId);
          const providerId = nativeModel ? Object.entries(engineCredentialOwners).find(([engine]) => engine === nativeModel.id)?.[1] : undefined;
          if (!providerId) throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Search credential ownership is unavailable');
          if (operation.type === 'credential.write') await this.runtime.authStorage.credentials.set(providerId, { type: 'api_key', key: operation.request.key, source: 'login' });
          else await this.runtime.authStorage.credentials.remove(providerId);
        }
      } catch {
        // SDK keeps failed writes pending; quarantine this worker rather than allowing later replay.
        this.failed = true;
        poisoned.add(this.runtime);
        this.runtime.settings.cancelPendingSaves();
        return { type: 'mutated', result: WebSearchMutationResultSchema.parse({ state: await this.read(), status: 'failed', persistence: 'failed', workers: [] }) };
      }
      await this.reload();
      return { type: 'mutated', result: WebSearchMutationResultSchema.parse({ state: await this.readCurrent(this.runtime.settings), status: 'applied', persistence: 'persisted', workers: [] }) };
    });
  }

  private async reload(): Promise<void> {
    await this.runtime.settings.reloadFromDisk();
    await this.runtime.authStorage.credentials.reload();
    await this.runtime.modelRegistry.refresh('offline');
    await installWebSearchAuthorization(this.runtime, this.authorize);
  }

  private async read(): Promise<WebSearchConfigState> {
    if (!this.failed) { await this.reload(); return this.readCurrent(this.runtime.settings); }
    const committed = await Settings.loadIsolated({ cwd: this.runtime.settings.getCwd(), agentDir: this.runtime.settings.getAgentDir() });
    try { await this.runtime.authStorage.credentials.reload(); return await this.readCurrent(committed); }
    finally { committed.cancelPendingSaves(); }
  }

  private async readCurrent(settings: Settings): Promise<WebSearchConfigState> {
    const models = this.runtime.modelRegistry.getAll('all').filter(getRoleInfo('web', settings).accepts);
    const providers: WebSearchProviderEntry[] = await Promise.all(models.map(async model => {
      const provider = await providerFor(model);
      const engine = modelKind(model) === 'search' && model.provider === 'web' && model.id !== 'hosted';
      const credentialOwner = engine ? Object.entries(engineCredentialOwners).find(([id]) => id === model.id)?.[1] : undefined;
      const credentialConfigured = credentialOwner !== undefined && this.runtime.authStorage.credentials.has(credentialOwner);
      return { providerId: selector(model), name: model.name, configured: provider ? await provider.isExplicitlyAvailable(this.runtime.authStorage, model) : false,
        credentialConfigured, requiresCredential: engine ? credentialOwner !== undefined && !optionalCredentialEngines.includes(model.id) : model.id !== 'hosted',
        isSelfHosted: engine && model.id === 'searxng', credentialWritable: credentialOwner !== undefined };
    }));
    const chain = resolveRoleChain('web', settings, roleCandidatePool('web', settings, this.runtime.modelRegistry));
    const configuredPrimary = settings.getModelRole('web') ?? null;
    const primary = configuredPrimary === null ? null : chain[0] ? selector(chain[0].model) : configuredPrimary;
    const fallback = chain.map(candidate => selector(candidate.model)).filter(id => id !== primary);
    return WebSearchConfigStateSchema.parse({ workspaceId: this.workspaceId, revision: await this.revision(), enabled: cfgWebSearchEnabled.get(settings), selectedProviderId: primary,
      fallbackProviderIds: fallback, timeoutSeconds: cfgProvidersWebSearchTimeoutSeconds.get(settings), providers });
  }

  private async revision(): Promise<string> {
    try { return CounterSchema.parse((await readFile(this.revisionPath, 'utf8')).trim()); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '0'; throw error; }
  }

  private async persistRevision(revision: string): Promise<void> {
    const temporary = `${this.revisionPath}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(revision); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.revisionPath);
    } finally { try { await unlink(temporary); } catch {} }
  }
}
