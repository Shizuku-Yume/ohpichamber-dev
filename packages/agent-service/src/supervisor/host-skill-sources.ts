import { randomUUID } from 'node:crypto';
import type { Serializable } from 'node:child_process';
import { HostSkillSourceOperationSchema, HostSkillSourceReplySchema, type HostSkillSourceOperation, type HostSkillSourceResult } from './file-resources-host-protocol.ts';
import { WorkerOperationError } from './workers.ts';

/** Only supervisor-owned source commits use this channel; model Host actions cannot invoke it. */
export class HostSkillSources {
  private closed = false;
  private readonly pending = new Map<string, { resolve: (result: HostSkillSourceResult) => void; reject: (error: Error) => void }>();
  private readonly onMessage = (raw: Serializable): void => {
    const reply = HostSkillSourceReplySchema.safeParse(raw);
    if (!reply.success) return;
    const pending = this.pending.get(reply.data.requestId);
    if (!pending) return;
    this.pending.delete(reply.data.requestId);
    pending.resolve(reply.data.result);
  };
  private readonly onDisconnect = (): void => this.close();
  constructor() {
    process.on('message', this.onMessage);
    process.once('disconnect', this.onDisconnect);
  }
  readonly execute = async (input: HostSkillSourceOperation): Promise<HostSkillSourceResult> => {
    const operation = HostSkillSourceOperationSchema.parse(input);
    if (this.closed || !process.send || !process.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    const requestId = randomUUID();
    const { promise, resolve, reject } = Promise.withResolvers<HostSkillSourceResult>();
    this.pending.set(requestId, { resolve, reject });
    // A timeout could release admission while the Host is still committing files.
    // The captured Host reply or channel shutdown is the only completion authority.
    process.send({ type: 'host.skill-source.request', requestId, operation }, error => {
      if (!error) return;
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      pending.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
    });
    return promise;
  };
  close(): void {
    if (this.closed) return;
    this.closed = true;
    process.removeListener('message', this.onMessage);
    process.removeListener('disconnect', this.onDisconnect);
    for (const pending of this.pending.values()) pending.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
    this.pending.clear();
  }
}
