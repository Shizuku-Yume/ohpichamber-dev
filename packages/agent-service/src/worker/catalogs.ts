import { join, dirname } from 'node:path';
import { NativeProviderOAuth } from './provider-oauth.ts';
import {
  CounterSchema, PositiveCounterSchema,
  type CompletionRequest, type ModelSelection,
} from '@openchamber/agent-contract';
import {
  CatalogOperationSchema, CatalogResultSchema, type CatalogOperation, type CatalogResult,
} from '../catalogs/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { NativeAgents, type NativeAgentsContext } from './catalog-agents.ts';
import { NativeCredentials } from './catalog-credentials.ts';
import type { NativeModels, NativeModelsContext, ResolvedModelSelection } from './catalog-models.ts';
import { WorkerSkills, type WorkerSkillsContext } from './catalog-skills.ts';
import { NativePlugins } from './catalog-plugins.ts';
import { NativeExtensions } from './catalog-extensions.ts';
import { NativePluginOperationSchema, NativeExtensionOperationSchema } from '../catalogs/plugins.ts';
import type { NativeCacheWarming } from './catalog-warming.ts';
import { NativeSettings } from './catalog-settings.ts';
export type CatalogNativeContext = NativeModelsContext & NativeAgentsContext & WorkerSkillsContext & {
  readonly models: NativeModels;
  readonly warming: NativeCacheWarming;
  // Authoritative policy is resolved at each provider-entry mutation, not cached at worker startup.
  readonly assertProviderEntryAllowed: () => void | Promise<void>;
  readonly session?: { refreshIdleMaintenance?: () => void };
};

export class WorkerCatalogs {
  readonly models: NativeModels;
  readonly agents: NativeAgents;
  readonly skills: WorkerSkills;
  readonly settingsStore: NativeSettings;
  private readonly credentials: NativeCredentials;
  private readonly oauth: NativeProviderOAuth;
  constructor(private readonly context: CatalogNativeContext) {
    this.models = context.models;
    this.agents = new NativeAgents(context);
    this.skills = new WorkerSkills(context);
    // OMP keeps its global behaviour config beside the agent directory the
    // catalog already knows; the page offers that file for what it hides.
    this.settingsStore = new NativeSettings(context.settings, context.agentDirectory);
    this.credentials = new NativeCredentials(context.authStorage, this.models, context.worker.workspaceId, context.agentDirectoryId,
      join(dirname(context.modelsPath), 'provider-account-labels.json'));
    this.oauth = new NativeProviderOAuth(context.authStorage, context.worker.workerGeneration);
  }

  // Reads receive their current owning revision; mutations receive the next committed revision.
  // The root service serializes/CAS-checks requests before invoking this writer.
  async operation(input: CatalogOperation, revision: string): Promise<CatalogResult> {
    const operation = CatalogOperationSchema.parse(input);
    CounterSchema.parse(revision);
    if ('request' in operation && 'expectedRevision' in operation.request
      && !(operation.type === 'catalog.provider.oauth' && operation.request.action !== 'commit')) {
      PositiveCounterSchema.parse(revision);
      if (BigInt(revision) !== BigInt(operation.request.expectedRevision) + 1n) {
        throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Mutation revision does not follow its expected owning revision');
      }
    }
    return CatalogResultSchema.parse(await this.execute(operation, revision));
  }

  private async execute(operation: CatalogOperation, revision: string): Promise<CatalogResult> {
    const extensionOperation = NativeExtensionOperationSchema.safeParse(operation);
    if (extensionOperation.success) return new NativeExtensions(this.context).operation(extensionOperation.data, revision);
    const pluginOperation = NativePluginOperationSchema.safeParse(operation);
    if (pluginOperation.success) return new NativePlugins(this.context).operation(pluginOperation.data, revision);
    const workspaceId = this.context.worker.workspaceId;
    switch (operation.type) {
      case 'fileResources':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'File resources use the workspace worker');
      case 'catalog.models.read':
        return { type: 'catalog.models', catalog: await this.models.readModels(workspaceId, revision) };
      case 'catalog.image.generate':
        return { type: 'catalog.image.generated', result: await this.models.generate(operation.request) };
      case 'catalog.image.configure':
        return { type: 'catalog.image.mutated', result: await this.models.configureImageModel(operation.request, revision) };
      case 'catalog.providers.read':
        return { type: 'catalog.providers', catalog: await this.models.readProviders(workspaceId, revision) };
      case 'catalog.agents.read':
        return { type: 'catalog.agents', catalog: await this.agents.read(workspaceId, revision) };
      case 'catalog.warming.read':
        return { type: 'catalog.warming', state: await this.context.warming.read(workspaceId, revision) };
      case 'catalog.settings.read':
        return { type: 'catalog.settings', state: await this.settingsStore.read(workspaceId, revision) };
      case 'catalog.settings.write':
        return { type: 'catalog.settings.mutated', state: await this.settingsStore.write(workspaceId, revision, operation.request) };
      case 'catalog.settings.apply':
        await this.context.settings.reloadFromDisk();
        this.context.session?.refreshIdleMaintenance?.();
        return { type: 'catalog.settings.applied' };
      case 'catalog.warming.apply':
        return { type: 'catalog.warming.applied', mode: this.context.warming.apply(operation.mode) };
      case 'catalog.warming.persist':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Cache warming persistence requires the workspace writer');
      case 'catalog.provider.accounts.read':
        return { type: 'catalog.provider.accounts', result: await this.credentials.accounts(operation.providerId, revision) };
      case 'catalog.provider.account-selection.read':
        return { type: 'catalog.provider.account-selection', result: await this.credentials.selection(operation.providerId, revision) };
      case 'catalog.provider.account.mutate':
        if (operation.request.action === 'remove') this.oauth.cancelProvider(operation.providerId);
        return { type: 'catalog.provider.accounts', result: await this.credentials.account(operation.providerId, operation.request, revision) };
      case 'catalog.provider.oauth.methods':
        return { type: 'catalog.provider.oauth.methods', result: this.oauth.methods() };
      case 'catalog.provider.oauth':
        if (['start', 'input', 'commit'].includes(operation.request.action)) await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.provider.oauth', result: await this.oauth.execute(operation.providerId, operation.request, revision) };
      case 'catalog.provider.configuration.read':
        return { type: 'catalog.provider.configuration', result: await this.models.readProviderConfiguration(operation.providerId, revision) };
      case 'catalog.provider.models.discover':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.provider.models.discovered', result: await this.models.discoverProviderModels(operation.request) };
      case 'catalog.provider.models.enrich':
        // A local catalog read: no provider entry, endpoint, or credential.
        return { type: 'catalog.provider.models.enriched', result: await this.models.enrichProviderModels(operation.request) };
      case 'catalog.provider.configure':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.provider.mutated', result: await this.models.configureProvider(operation.request, revision) };
      case 'catalog.provider.delete':
        this.oauth.cancelProvider(operation.request.providerId);
        return { type: 'catalog.provider.mutated', result: await this.models.deleteProvider(operation.request, revision) };
      case 'catalog.model.configure':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.model.mutated', result: await this.models.configureModel(operation.request, revision) };
      case 'catalog.model.delete':
        return { type: 'catalog.model.mutated', result: await this.models.deleteModel(operation.request, revision) };
      case 'catalog.credential.write':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.credential.mutated', result: await this.credentials.write(operation.request, revision) };
      case 'catalog.credential.resolve':
        return { type: 'catalog.credential.resolved', result: await this.credentials.resolve(operation.request) };
      case 'catalog.credential.handoff':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.credential.handed-off', result: await this.credentials.handoff(operation.request, revision) };
      case 'catalog.credential.delete':
        this.oauth.cancelProvider(operation.request.providerId);
        return { type: 'catalog.credential.mutated', result: await this.credentials.delete(operation.request, revision) };
      case 'catalog.agent.create':
        return { type: 'catalog.agent.mutated', result: await this.agents.create(operation.request, revision) };
      case 'catalog.agent.update':
        return { type: 'catalog.agent.mutated', result: await this.agents.update(operation.request, revision) };
      case 'catalog.agent.delete':
        return { type: 'catalog.agent.mutated', result: await this.agents.delete(operation.request, revision) };
      case 'skills.read':
        return { type: 'skills.catalog', catalog: this.skills.read(operation.persistedSources) };
      case 'skills.apply':
        return { type: 'skills.applied', result: await this.skills.apply(operation.sources, operation.catalogRevision) };
      case 'skills.expand':
        return { type: 'skills.expanded', result: await this.skills.expand(operation.request) };
    }
    throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Catalog operation is unavailable');
  }

  resolveSelection(selection: ModelSelection, controls?: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>): Promise<ResolvedModelSelection> {
    return this.models.selection(selection, controls);
  }

  async close(): Promise<void> {
    await this.oauth.close();
  }
}
