import type { CompletionWorkerBootstrap, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerCompletion } from './completion.ts';
import { NativeModels } from './catalog-models.ts';
import { nativeModelsContext, openNativeRuntime, type NativeWorkerRuntime } from './native-runtime.ts';
import type { WorkerAuthorize } from './policy.ts';

/** A completion process owns credentials and models, never a session or transcript. */
export class StatelessWorker {
  private readonly completion: WorkerCompletion;
  private nativeSessionId: string;
  private activeCompletionId: string | undefined;
  private closed = false;
  private constructor(private readonly runtime: NativeWorkerRuntime, input: CompletionWorkerBootstrap, authorize: WorkerAuthorize) {
    this.nativeSessionId = input.workerGeneration;
    const models = new NativeModels(nativeModelsContext(runtime, () => this.nativeSessionId));
    this.completion = new WorkerCompletion(runtime.modelRegistry, input.workspaceId, async (selection, controls) => {
      const resolved = await models.selection(selection, controls);
      await authorize({ type: 'tool', toolName: 'provider.use', input: { providerId: selection.providerId, modelId: selection.modelId, endpoint: resolved.nativeModel.baseUrl } });
      return resolved;
    });
  }

  static async open(input: CompletionWorkerBootstrap, authorize: WorkerAuthorize): Promise<StatelessWorker> {
    const runtime = await openNativeRuntime(input);
    try { return new StatelessWorker(runtime, input, authorize); }
    catch (error) { runtime.authStorage.close(); throw error; }
  }

  async operation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    if (this.closed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Completion worker is closed');
    if (operation.type !== 'completion') throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Stateless workers only accept completion operations');
    if (operation.operation.type === 'completion.cancel') return { type: 'completion', result: await this.completion.operation(operation.operation) };
    if (this.activeCompletionId !== undefined) throw new ProjectionError(409, 'INVALID_REQUEST', 'Completion is already active');
    this.activeCompletionId = operation.operation.request.completionId;
    this.nativeSessionId = this.activeCompletionId;
    try { return { type: 'completion', result: await this.completion.operation(operation.operation) }; }
    finally { this.activeCompletionId = undefined; }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try { await this.completion.close(); }
    finally { this.runtime.authStorage.close(); }
  }
}
