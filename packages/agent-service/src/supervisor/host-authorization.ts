import { randomUUID } from 'node:crypto';
import type { Serializable } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import {
  HostAuthorizationScopeSchema,
  HostWorkerAuthorizationReplySchema,
  type HostAuthorizationScope,
  type NativeOperationDescriptor,
  type NativePolicyResolver,
} from './host-authorization-protocol.ts';
import { nativeEditDescriptor } from '../worker/native-policy-descriptor.ts';
import type { WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';

const unavailable = (): WorkerPolicyResult => ({ allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 });

/** This process owns no permission authority; only its captured Node Host can grant work. */
export class HostWorkerAuthorization {
  private closed = false;
  private readonly pending = new Map<string, { scope: HostAuthorizationScope; resolve: (result: WorkerPolicyResult) => void; timer: NodeJS.Timeout }>();
  private readonly onMessage = (raw: Serializable): void => {
    const reply = HostWorkerAuthorizationReplySchema.safeParse(raw);
    if (!reply.success) return;
    const pending = this.pending.get(reply.data.requestId);
    if (!pending) return;
    this.pending.delete(reply.data.requestId);
    clearTimeout(pending.timer);
    try {
      const scope = HostAuthorizationScopeSchema.safeParse(this.resolveScope(pending.scope.rootSessionId));
      pending.resolve(scope.success && isDeepStrictEqual(scope.data, pending.scope) ? reply.data.result : unavailable());
    } catch { pending.resolve(unavailable()); }
  };
  private readonly onDisconnect = (): void => this.close();

  constructor(private readonly resolveScope: (rootSessionId: string) => HostAuthorizationScope | undefined, private readonly resolvePolicy?: NativePolicyResolver) {
    process.on('message', this.onMessage);
    process.once('disconnect', this.onDisconnect);
  }

  readonly authorize = async (rootSessionId: string, request: WorkerPolicyRequest): Promise<WorkerPolicyResult> => {
    if (this.closed || !process.send || !process.connected) return unavailable();
    let captured: HostAuthorizationScope | undefined;
    try { captured = this.resolveScope(rootSessionId); } catch { return unavailable(); }
    const scope = HostAuthorizationScopeSchema.safeParse(captured);
    if (!scope.success || scope.data.rootSessionId !== rootSessionId) return { allowed: false, code: 'UNAUTHORIZED', status: 403 };
    const message = HostWorkerAuthorizationRequestSchema.safeParse({
      type: 'worker.authorization.request', requestId: randomUUID(), scope: scope.data, request,
    });
    if (!message.success) return { allowed: false, code: 'UNAUTHORIZED', status: 403 };
    const descriptor = this.describe(message.data.request);
    const envelope = { ...message.data, ...(descriptor === undefined ? {} : { descriptor }) };
    const requestId = envelope.requestId;
    if (descriptor && this.resolvePolicy) return this.resolvePolicy(scope.data, descriptor);
    if (descriptor && !this.resolvePolicy) return { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 };
    return new Promise<WorkerPolicyResult>(resolve => {
      const fail = (): void => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        clearTimeout(pending.timer);
        this.cancel(requestId);
        pending.resolve(unavailable());
      };
      this.pending.set(requestId, { scope: scope.data, resolve, timer: setTimeout(fail, 5_000) });
      process.send!(envelope, error => { if (error) fail(); });
    });
  };
  private describe(request: WorkerPolicyRequest): NativeOperationDescriptor | undefined {
    if (request.type !== 'tool') return undefined;
    if (request.toolName !== 'edit') return undefined;
    const mode = typeof request.input.mode === 'string' ? request.input.mode : undefined;
    if (mode === undefined) return undefined;
    return nativeEditDescriptor(mode, request.input);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    process.removeListener('message', this.onMessage);
    process.removeListener('disconnect', this.onDisconnect);
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.cancel(requestId);
      pending.resolve(unavailable());
    }
    this.pending.clear();
  }

  private cancel(requestId: string): void {
    if (process.send && process.connected) process.send({ type: 'worker.authorization.cancel', requestId }, () => {});
  }
}
