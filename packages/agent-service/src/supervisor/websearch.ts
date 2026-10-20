import { JsonObjectSchema, WebSearchConfigStateSchema, WebSearchMutationResultSchema } from '@openchamber/agent-contract';
import type { WebSearchConfigState, WebSearchMutationResult, WebSearchWorkerApplyOutcome } from '@openchamber/agent-contract';
import type { WebSearchOperation } from '../worker/websearch/protocol.ts';
import type { WorkspaceCatalogs } from './workspaces.ts';
import { WorkerOperationError, type WorkerRegistry } from './workers.ts';

type Mutation = Exclude<WebSearchOperation, { type: 'read' | 'apply' }>;

/** Native settings are shared by agent-directory owner, including across workspaces. */
export class WebSearchCoordinator {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly workspaces: Pick<WorkspaceCatalogs, 'get' | 'stateless'>,
    private readonly workers: Pick<WorkerRegistry, 'list' | 'bootstrap' | 'request'>,
  ) {}

  /** A newly admitted root must observe the committed settings before joining fanout. */
  admit<T>(agentDirectoryId: string, launch: () => Promise<T>): Promise<T> {
    return this.serial(agentDirectoryId, launch);
  }

  read(workspaceId: string): Promise<WebSearchConfigState> {
    return this.serial(this.workspaces.get(workspaceId).agentDirectoryId, () => this.readState(workspaceId));
  }

  mutate(workspaceId: string, operation: Mutation): Promise<WebSearchMutationResult> {
    return this.serial(this.workspaces.get(workspaceId).agentDirectoryId, async () => {
      const owner = this.workspaces.get(workspaceId).agentDirectoryId;
      const root = await this.workspaces.stateless(workspaceId);
      let persisted: WebSearchMutationResult;
      try {
        const reply = await this.workers.request(root, { type: 'web-search', operation });
        if (reply.type !== 'web-search' || reply.result.type !== 'mutated') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        persisted = WebSearchMutationResultSchema.parse(reply.result.result);
        this.assertWorkspace(workspaceId, persisted.state);
      } catch (error) {
        if (error instanceof WorkerOperationError && error.status === 409 && error.code === 'CATALOG_CONFLICT') {
          const state = await this.readState(workspaceId);
          throw new WorkerOperationError(409, 'CATALOG_CONFLICT', JsonObjectSchema.parse({ currentRevision: state.revision, state }));
        }
        throw error;
      }
      // Persistence failure must not install a state that was never committed.
      if (persisted.persistence === 'failed') return persisted;
      const outcomes: WebSearchWorkerApplyOutcome[] = [];
      for (const worker of this.workers.list()) {
        if (worker.kind !== 'session' || (worker.state !== 'ready' && worker.state !== 'starting')) continue;
        const input = this.workers.bootstrap(worker.rootSessionId);
        if (!input || input.agentDirectoryId !== owner) continue;
        const identity = { sessionId: worker.rootSessionId, workerGeneration: worker.workerGeneration };
        try {
          const reply = await this.workers.request(worker.rootSessionId, { type: 'web-search', operation: { type: 'apply' } }, worker.workerGeneration);
          if (reply.type !== 'web-search' || reply.result.type !== 'applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          outcomes.push({ ...identity, status: 'applied', code: null });
        } catch (error) {
          outcomes.push({ ...identity, status: 'failed', code: error instanceof WorkerOperationError ? error.code : 'INTERNAL_ERROR' });
        }
      }
      return WebSearchMutationResultSchema.parse({
        state: persisted.state, persistence: 'persisted', workers: outcomes,
        status: outcomes.some(worker => worker.status === 'failed') ? 'partial' : 'applied',
      });
    });
  }

  private async readState(workspaceId: string): Promise<WebSearchConfigState> {
    const root = await this.workspaces.stateless(workspaceId);
    const reply = await this.workers.request(root, { type: 'web-search', operation: { type: 'read' } });
    if (reply.type !== 'web-search' || reply.result.type !== 'state') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    const state = WebSearchConfigStateSchema.parse(reply.result.state);
    this.assertWorkspace(workspaceId, state);
    return state;
  }

  private assertWorkspace(workspaceId: string, state: WebSearchConfigState): void {
    if (state.workspaceId !== workspaceId) throw new WorkerOperationError(503, 'INTERNAL_ERROR');
  }

  private serial<T>(owner: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(owner) ?? Promise.resolve()).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(owner, tail);
    void tail.then(() => { if (this.tails.get(owner) === tail) this.tails.delete(owner); });
    return result;
  }
}
