import { randomUUID } from 'node:crypto';
import type { WorkerPolicyRequest, WorkerPolicyResult, WorkerReply } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import type { NativePolicyContext } from '../native-policy-protocol.ts';

export type WorkerAuthorize = (request: WorkerPolicyRequest, nativeContext?: NativePolicyContext) => Promise<void>;
export class NativeApprovalRequired extends ProjectionError {
  constructor() { super(403, 'UNAUTHORIZED', 'Host policy requires approval for this exact native command'); }
}

/** Policy decisions belong to the Host; worker identity is supplied by the supervisor. */
export class WorkerPolicy {
  private readonly pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  private closed = false;
  constructor(private readonly generation: string, private readonly send: (reply: WorkerReply) => void) {}

  readonly authorize: WorkerAuthorize = (request, nativeContext) => {
    if (this.closed || !process.connected) return Promise.reject(new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Host policy is unavailable'));
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try { this.send({ type: 'policy.request', workerGeneration: this.generation, requestId, request, nativeContext }); }
      catch (error) { this.pending.delete(requestId); reject(error); }
    });
  };

  settle(requestId: string, result: WorkerPolicyResult): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (result.allowed) pending.resolve();
    else pending.reject(result.approvalRequired ? new NativeApprovalRequired() : new ProjectionError(result.status, result.code, 'Host policy refused the operation'));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Host policy is unavailable'));
    this.pending.clear();
  }
}
