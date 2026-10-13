import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  MCPConfigurationStateSchema, MCPConfigSchema, SkillSourceRevisionsSchema,
  MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPReconnectRequestSchema,
  SkillsApplyRequestSchema,
} from '@openchamber/agent-contract';
import type {
  MCPConfigurationState, MCPConfigureRequest, MCPApplyRequest, MCPReconnectRequest,
  MCPCatalogRead, MCPWorkerApplyOutcome, SkillsCatalogState, SkillsApplyResult,
  SkillsWorkerApplyOutcome, SkillExpandRequest, SkillExpandResult, SkillSourceRevisions,
  CatalogWorkerIdentity,
} from '@openchamber/agent-contract';
import { SkillExpandRequestSchema } from '@openchamber/agent-contract';

const StateSchema = z.strictObject({ configuration: MCPConfigurationStateSchema, sources: SkillSourceRevisionsSchema });
export interface CatalogWorker {
  identity: CatalogWorkerIdentity;
  mcp: {
    read(configuration: MCPConfigurationState): Promise<MCPCatalogRead>;
    apply(request: MCPApplyRequest, configuration: MCPConfigurationState): Promise<MCPWorkerApplyOutcome>;
    reconnect(serverId: string, request: MCPReconnectRequest, configuration: MCPConfigurationState): Promise<MCPCatalogRead>;
  };
  skills: {
    read(sources: SkillSourceRevisions): Promise<SkillsCatalogState>;
    apply(sources: SkillSourceRevisions): Promise<SkillsWorkerApplyOutcome>;
    expand(request: SkillExpandRequest): Promise<SkillExpandResult>;
  };
}
function aggregate(outcomes: Array<{ outcome: string }>): 'applied' | 'partial' | 'failed' | 'no-active-workers' {
  const applied = outcomes.some(item => item.outcome === 'applied');
  const failed = outcomes.some(item => item.outcome === 'failed');
  return applied ? (failed ? 'partial' : 'applied') : (failed ? 'failed' : 'no-active-workers');
}
export class CatalogCoordinator {
  private configuration: MCPConfigurationState;
  private sources: SkillSourceRevisions = { workspace: '0', agent: '0' };
  private readonly workers = new Map<string, CatalogWorker>();
  private tail: Promise<void> = Promise.resolve();
  private initialized = false;
  private readonly file: string;
  constructor(private readonly stateDirectory: string, private readonly workspaceId: string) {
    this.file = join(stateDirectory, 'catalog-state.json');
    this.configuration = { workspaceId, persistedRevision: '0', config: { servers: [] } };
  }
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const state = StateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
      if (state.configuration.workspaceId !== this.workspaceId) throw new Error('workspace mismatch');
      this.configuration = state.configuration;
      this.sources = state.sources;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Catalog state is corrupt');
      await this.persist();
    }
    this.initialized = true;
  }
  revision(): string { return this.configuration.persistedRevision; }
  register(worker: CatalogWorker): void { this.workers.set(worker.identity.rootSessionId, worker); }
  retire(rootSessionId: string, generation: string): void {
    const worker = this.workers.get(rootSessionId);
    if (worker?.identity.workerGeneration === generation) this.workers.delete(rootSessionId);
  }
  readMcp(rootSessionId: string): Promise<MCPCatalogRead> { return this.require(rootSessionId).mcp.read(this.configuration); }
  readSkills(rootSessionId: string): Promise<SkillsCatalogState> { return this.require(rootSessionId).skills.read(this.sources); }
  async configure(request: MCPConfigureRequest): Promise<unknown> {
    return this.serial(async () => {
      const input = MCPConfigureRequestSchema.parse(request);
      if (input.expectedPersistedRevision !== this.configuration.persistedRevision) throw new Error('Catalog revision conflict');
      const previous = this.configuration;
      const next: MCPConfigurationState = { workspaceId: this.workspaceId, persistedRevision: (BigInt(previous.persistedRevision) + 1n).toString(), config: MCPConfigSchema.parse(input.config) };
      this.configuration = next;
      try { await this.persist(); } catch (error) { this.configuration = previous; throw error; }
      return this.applyMcpNow({ persistedRevision: next.persistedRevision });
    });
  }
  async applyMcp(request: MCPApplyRequest): Promise<unknown> { return this.serial(() => this.applyMcpNow(request)); }
  private async applyMcpNow(request: MCPApplyRequest): Promise<unknown> {
    const input = MCPApplyRequestSchema.parse(request);
    if (input.persistedRevision !== this.configuration.persistedRevision) throw new Error('Catalog revision conflict');
    const outcomes: MCPWorkerApplyOutcome[] = [];
    for (const worker of [...this.workers.values()]) {
      try { outcomes.push(await worker.mcp.apply(input, this.configuration)); }
      catch (error) { outcomes.push({ worker: worker.identity, outcome: 'failed', revisions: { runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0' }, error: { code: 'MCP_APPLY_FAILED', detail: error instanceof Error ? error.message : 'MCP apply failed', retryable: true } }); }
    }
    return { kind: 'mcp', status: aggregate(outcomes), configuration: this.configuration, workers: outcomes };
  }
  async reconnect(rootSessionId: string, serverId: string, request: MCPReconnectRequest): Promise<MCPCatalogRead> {
    const input = MCPReconnectRequestSchema.parse(request);
    if (input.persistedRevision !== this.configuration.persistedRevision) throw new Error('Catalog revision conflict');
    return this.require(rootSessionId).mcp.reconnect(serverId, input, this.configuration);
  }
  async applySkills(request: { scope: 'workspace' | 'agent'; sourceRevision: string }): Promise<SkillsApplyResult> {
    const input = SkillsApplyRequestSchema.parse(request);
    return this.serial(async () => {
      const selected = input.scope === 'workspace' ? this.sources.workspace : this.sources.agent;
      if (selected !== input.sourceRevision) throw new Error('Skill source revision conflict');
      const outcomes: SkillsWorkerApplyOutcome[] = [];
      for (const worker of [...this.workers.values()]) {
        try { outcomes.push(await worker.skills.apply(this.sources)); }
        catch (error) { outcomes.push({ worker: worker.identity, outcome: 'failed', revisions: { runtimeStatus: 'unavailable', persistedSources: this.sources, appliedSources: null, catalogRevision: '0' }, error: { code: 'SKILLS_APPLY_FAILED', detail: error instanceof Error ? error.message : 'Skills apply failed', retryable: true } }); }
      }
      return { kind: 'skills', status: aggregate(outcomes), scope: input.scope === 'workspace' ? { kind: 'workspace', workspaceId: this.workspaceId } : { kind: 'agent', agentDirectoryId: this.workspaceId }, sourceRevision: input.sourceRevision, workers: outcomes };
    });
  }
  async expand(rootSessionId: string, request: SkillExpandRequest): Promise<SkillExpandResult> { return this.require(rootSessionId).skills.expand(SkillExpandRequestSchema.parse(request)); }
  private require(rootSessionId: string): CatalogWorker { const worker = this.workers.get(rootSessionId); if (!worker) throw new Error('Worker unavailable'); return worker; }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => undefined, () => undefined); return result; }
  private async persist(): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { const handle = await open(temporary, 'wx', 0o600); try { await handle.writeFile(JSON.stringify({ configuration: this.configuration, sources: this.sources })); } finally { await handle.close(); } await rename(temporary, this.file); }
    finally { try { await unlink(temporary); } catch {} }
  }
}
