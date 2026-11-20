import { randomUUID } from 'node:crypto';
import type { Serializable } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { hostActionTimeoutMs, HostWorkerAuthorizationReplySchema, HostWorkerAuthorizationRequestSchema, HostWorkerActionReplySchema, HostWorkerActionRequestSchema, type HostAuthorizationScope, type NativeOperationDescriptor, type HostActionRequest, type HostActionResult } from './host-authorization-protocol.ts';
import type { WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';

const unavailable = (): WorkerPolicyResult & { allowed: false } => ({ allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503, detail: 'The Host authorization channel is unavailable' });
const actionUnavailable = (): HostActionResult => ({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 });

/** The supervisor parses native targets, but only its captured Node Host grants work. */
export class HostWorkerAuthorization {
  private closed = false;
  private readonly pending = new Map<string, { scope: HostAuthorizationScope; resolve: (result: WorkerPolicyResult) => void; timer: NodeJS.Timeout }>();
  private readonly actions = new Map<string, { scope: HostAuthorizationScope; resolve: (result: HostActionResult) => void; timer: NodeJS.Timeout | undefined; signal: AbortSignal; abort: () => void }>();
  private current(scope: HostAuthorizationScope): boolean {
    try { return isDeepStrictEqual(this.resolveScope(scope.rootSessionId), scope); } catch { return false; }
  }
  private readonly onMessage = (raw: Serializable): void => {
    const reply = HostWorkerAuthorizationReplySchema.safeParse(raw);
    if (reply.success) {
      const pending = this.pending.get(reply.data.requestId);
      if (!pending) return;
      this.pending.delete(reply.data.requestId); clearTimeout(pending.timer);
      pending.resolve(this.current(pending.scope) ? reply.data.result : unavailable());
      return;
    }
    const action = HostWorkerActionReplySchema.safeParse(raw);
    if (!action.success) return;
    const pending = this.actions.get(action.data.requestId);
    if (!pending) return;
    this.actions.delete(action.data.requestId); clearTimeout(pending.timer);
    pending.signal.removeEventListener('abort', pending.abort);
    pending.resolve(this.current(pending.scope) && !pending.signal.aborted ? action.data.result : actionUnavailable());
  };
  private readonly onDisconnect = (): void => this.close();
  constructor(private readonly resolveScope: (rootSessionId: string) => HostAuthorizationScope | undefined) {
    process.on('message', this.onMessage); process.once('disconnect', this.onDisconnect);
  }
  readonly authorize = async (rootSessionId: string, request: WorkerPolicyRequest, descriptor?: NativeOperationDescriptor): Promise<WorkerPolicyResult> => {
    if (this.closed || !process.send || !process.connected) return unavailable();
    const message = HostWorkerAuthorizationRequestSchema.safeParse({ type: 'worker.authorization.request', requestId: randomUUID(), scope: this.resolveScope(rootSessionId), request, descriptor });
    if (!message.success) return { allowed: false, code: 'UNAUTHORIZED', status: 403, detail: 'The worker authorization request did not match the Host protocol' };
    const { requestId, scope } = message.data;
    const { promise, resolve } = Promise.withResolvers<WorkerPolicyResult>();
    const fail = (): void => {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId); clearTimeout(pending.timer);
      this.cancel('worker.authorization.cancel', requestId); pending.resolve(unavailable());
    };
    this.pending.set(requestId, { scope, resolve, timer: setTimeout(fail, 5_000) });
    process.send!(message.data, error => { if (error) fail(); });
    return promise;
  };
  readonly invoke = async (rootSessionId: string, request: HostActionRequest, signal: AbortSignal): Promise<HostActionResult> => {
    if (this.closed || !process.send || !process.connected || signal.aborted) return actionUnavailable();
    const message = HostWorkerActionRequestSchema.safeParse({ type: 'worker.action.request', requestId: randomUUID(), scope: this.resolveScope(rootSessionId), request });
    if (!message.success || request.sessionId !== rootSessionId) return { ok: false, code: 'UNAUTHORIZED', status: 403 };
    const { requestId, scope } = message.data;
    const { promise, resolve } = Promise.withResolvers<HostActionResult>();
    const abort = (): void => {
      const pending = this.actions.get(requestId);
      if (!pending) return;
      this.actions.delete(requestId); clearTimeout(pending.timer); signal.removeEventListener('abort', abort);
      this.cancel('worker.action.cancel', requestId); pending.resolve(actionUnavailable());
    };
    const timeoutMs = hostActionTimeoutMs(message.data.request);
    this.actions.set(requestId, { scope, resolve, signal, abort, timer: timeoutMs === undefined ? undefined : setTimeout(abort, timeoutMs) });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else process.send!(message.data, error => { if (error) abort(); });
    return promise;
  };
  close(): void {
    if (this.closed) return;
    this.closed = true; process.removeListener('message', this.onMessage); process.removeListener('disconnect', this.onDisconnect);
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer); this.cancel('worker.authorization.cancel', requestId); pending.resolve(unavailable());
    }
    this.pending.clear();
    for (const pending of [...this.actions.values()]) pending.abort();
  }
  private cancel(type: 'worker.authorization.cancel' | 'worker.action.cancel', requestId: string): void {
    if (process.send && process.connected) process.send({ type, requestId }, () => {});
  }
}
