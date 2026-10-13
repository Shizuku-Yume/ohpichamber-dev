import { randomUUID } from 'node:crypto';
import type { JsonValue } from '@openchamber/agent-contract';
import type { WorkerReply } from '../protocol.ts';
import type { HostActionRequest, HostActionResult } from '../native-policy-protocol.ts';
import { ProjectionError } from '../projection/journal.ts';

export type WorkerHostInvoke = (request: HostActionRequest, signal: AbortSignal) => Promise<JsonValue>;

export class WorkerHostActions {
  private closed = false;
  private readonly pending = new Map<string, { resolve: (value: JsonValue) => void; reject: (error: Error) => void; signal: AbortSignal; abort: () => void }>();
  constructor(private readonly generation: string, private readonly send: (reply: WorkerReply) => void) {}
  readonly invoke: WorkerHostInvoke = (request, signal) => {
    if (this.closed || !process.connected) return Promise.reject(new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Host capability is unavailable'));
    signal.throwIfAborted();
    const requestId = randomUUID();
    const result = Promise.withResolvers<JsonValue>();
    const abort = (): void => {
      if (!this.pending.delete(requestId)) return;
      signal.removeEventListener('abort', abort);
      this.send({ type: 'action.cancel', workerGeneration: this.generation, requestId });
      result.reject(new DOMException('Host action cancelled', 'AbortError'));
    };
    this.pending.set(requestId, { ...result, signal, abort });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else {
      try { this.send({ type: 'action.request', workerGeneration: this.generation, requestId, request }); }
      catch { this.pending.delete(requestId); signal.removeEventListener('abort', abort); result.reject(new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Host capability is unavailable')); }
    }
    return result.promise;
  };
  settle(requestId: string, result: HostActionResult): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId); pending.signal.removeEventListener('abort', pending.abort);
    if (result.ok) pending.resolve(result.value);
    else pending.reject(new ProjectionError(result.status, result.code, 'Host capability refused the action'));
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [requestId, pending] of this.pending) {
      pending.signal.removeEventListener('abort', pending.abort);
      this.send({ type: 'action.cancel', workerGeneration: this.generation, requestId });
      pending.reject(new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Host capability is unavailable'));
    }
    this.pending.clear();
  }
}
