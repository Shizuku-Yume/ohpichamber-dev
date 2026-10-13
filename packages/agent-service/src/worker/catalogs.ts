import {
  CounterSchema, PositiveCounterSchema,
  type CompletionRequest, type ModelSelection, type SkillExpandRequest, type SkillExpandResult,
} from '@openchamber/agent-contract';
import {
  CatalogOperationSchema, CatalogResultSchema, type CatalogOperation, type CatalogResult,
} from '../catalogs/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { NativeAgents, type NativeAgentsContext } from './catalog-agents.ts';
import { NativeCredentials } from './catalog-credentials.ts';
import { NativeModels, type NativeModelsContext, type ResolvedModelSelection } from './catalog-models.ts';
import { WorkerSkills, type WorkerSkillsContext } from './catalog-skills.ts';

export type CatalogNativeContext = NativeModelsContext & NativeAgentsContext & WorkerSkillsContext & {
  // Authoritative policy is resolved at each provider-entry mutation, not cached at worker startup.
  readonly assertProviderEntryAllowed: () => void | Promise<void>;
};

export class WorkerCatalogs {
  readonly models: NativeModels;
  readonly agents: NativeAgents;
  readonly skills: WorkerSkills;
  private readonly credentials: NativeCredentials;

  constructor(private readonly context: CatalogNativeContext) {
    this.models = new NativeModels(context);
    this.agents = new NativeAgents(context);
    this.skills = new WorkerSkills(context);
    this.credentials = new NativeCredentials(context.authStorage, this.models, context.worker.workspaceId);
  }

  // Reads receive their current owning revision; mutations receive the next committed revision.
  // The root service serializes/CAS-checks requests before invoking this writer.
  async operation(input: CatalogOperation, revision: string): Promise<CatalogResult> {
    const operation = CatalogOperationSchema.parse(input);
    CounterSchema.parse(revision);
    if ('request' in operation && 'expectedRevision' in operation.request) {
      PositiveCounterSchema.parse(revision);
      if (BigInt(revision) !== BigInt(operation.request.expectedRevision) + 1n) {
        throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Mutation revision does not follow its expected owning revision');
      }
    }
    return CatalogResultSchema.parse(await this.execute(operation, revision));
  }

  private async execute(operation: CatalogOperation, revision: string): Promise<CatalogResult> {
    const workspaceId = this.context.worker.workspaceId;
    switch (operation.type) {
      case 'catalog.models.read':
        return { type: 'catalog.models', catalog: await this.models.readModels(workspaceId, revision) };
      case 'catalog.providers.read':
        return { type: 'catalog.providers', catalog: await this.models.readProviders(workspaceId, revision) };
      case 'catalog.agents.read':
        return { type: 'catalog.agents', catalog: await this.agents.read(workspaceId, revision) };
      case 'catalog.provider.configure':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.provider.mutated', result: await this.models.configureProvider(operation.request, revision) };
      case 'catalog.provider.delete':
        return { type: 'catalog.provider.mutated', result: await this.models.deleteProvider(operation.request, revision) };
      case 'catalog.model.configure':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.model.mutated', result: await this.models.configureModel(operation.request, revision) };
      case 'catalog.model.delete':
        return { type: 'catalog.model.mutated', result: await this.models.deleteModel(operation.request, revision) };
      case 'catalog.credential.write':
        await this.context.assertProviderEntryAllowed();
        return { type: 'catalog.credential.mutated', result: await this.credentials.write(operation.request, revision) };
      case 'catalog.credential.delete':
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
  }

  resolveSelection(selection: ModelSelection, controls?: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>): Promise<ResolvedModelSelection> {
    return this.models.selection(selection, controls);
  }


  prepareSkill(request: SkillExpandRequest): Promise<SkillExpandResult> {
    return this.skills.expand(request);
  }
}

export { resolveModelSelection, publicModel, credentialReference } from './catalog-models.ts';
export { expandNativeSkill } from './catalog-skills.ts';
