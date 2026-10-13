import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { HostAuthorizationScopeSchema, HostWorkerAuthorizationReplySchema, HostWorkerAuthorizationRequestSchema } from './host-authorization-protocol.ts';
import type { HostAuthorizationScope } from './host-authorization-protocol.ts';
import type { WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';

const unavailable = (): WorkerPolicyResult => ({ allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 });

/** This process owns no permission authority; only its captured Node Host can grant work. */
export class HostWorkerAuthorization {
  private closed = false;
  private readonly pending = new Map<string, { scope: HostAuthorizationScope; resolve: (result: WorkerPolicyResult) => void; timer: NodeJS.Timeout }>();
  private readonly onMessage = (raw: unknown): void => {
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

  constructor(private readonly resolveScope: (rootSessionId: string) => HostAuthorizationScope | undefined) {
    process.on('message', this.onMessage);
    process.once('disconnect', this.onDisconnect);
  }

  readonly authorize = async (rootSessionId: string, request: WorkerPolicyRequest): Promise<WorkerPolicyResult> => {
    if (this.closed || !process.send || !process.connected) return unavailable();
    let captured: HostAuthorizationScope | undefined;
    try { captured = this.resolveScope(rootSessionId); } catch { return unavailable(); }
    const scope = HostAuthorizationScopeSchema.safeParse(captured);
    if (!scope.success || scope.data.rootSessionId !== rootSessionId) return { allowed: false, code: 'UNAUTHORIZED', status: 403 };
    const requestId = randomUUID();
    const message = HostWorkerAuthorizationRequestSchema.safeParse({ type: 'worker.authorization.request', requestId, scope: scope.data, request });
    if (!message.success) return { allowed: false, code: 'UNAUTHORIZED', status: 403 };
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
      process.send!(message.data, error => { if (error) fail(); });
    });
  };

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
