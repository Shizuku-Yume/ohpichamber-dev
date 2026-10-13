import { randomUUID } from 'node:crypto';
import type { Serializable } from 'node:child_process';
import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import type { ApprovalPolicyCommit, ApprovalPolicyLoad } from './manager.ts';

const PolicySchema = z.strictObject({
  policyId: EntityIdSchema, revision: CounterSchema, scope: z.enum(['session', 'workspace']),
  decision: z.enum(['allow', 'deny']), target: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }),
}).refine(policy => policy.scope === 'session' ? policy.decision === 'allow' : policy.decision === 'deny');
const ReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('approval.policy.committed'), requestId: EntityIdSchema, policyId: EntityIdSchema, revision: CounterSchema }),
  z.strictObject({ type: z.literal('approval.policy.listed'), requestId: EntityIdSchema, policies: z.array(PolicySchema) }),
  z.strictObject({ type: z.literal('approval.policy.failed'), requestId: EntityIdSchema, code: z.literal('APPROVAL_POLICY_WRITE_FAILED') }),
]);
type Reply = z.infer<typeof ReplySchema>;

/** Only the Node Host can acknowledge a committed policy. No worker owns this IPC channel. */
export class HostApprovalPolicies {
  private readonly pending = new Map<string, { resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly onMessage = (raw: Serializable): void => {
    const reply = ReplySchema.safeParse(raw);
    if (!reply.success) return;
    const pending = this.pending.get(reply.data.requestId);
    if (!pending) return;
    this.pending.delete(reply.data.requestId);
    clearTimeout(pending.timer);
    if (reply.data.type === 'approval.policy.failed') pending.reject(this.failure());
    else pending.resolve(reply.data);
  };
  private readonly onDisconnect = (): void => this.close();

  constructor() {
    process.on('message', this.onMessage);
    process.once('disconnect', this.onDisconnect);
  }

  readonly commit: ApprovalPolicyCommit = async request => {
    const reply = await this.request('approval.policy.commit', request);
    if (reply.type !== 'approval.policy.committed') throw this.failure();
    return { policyId: reply.policyId, revision: reply.revision };
  };

  readonly load: ApprovalPolicyLoad = async request => {
    const reply = await this.request('approval.policy.list', request);
    if (reply.type !== 'approval.policy.listed') throw this.failure();
    return reply.policies;
  };

  close(): void {
    process.removeListener('message', this.onMessage);
    process.removeListener('disconnect', this.onDisconnect);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(this.failure()); }
    this.pending.clear();
  }

  private failure(): ProjectionError {
    return new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Host approval policy persistence is unavailable');
  }

  private request(type: 'approval.policy.commit' | 'approval.policy.list', request: Parameters<ApprovalPolicyCommit>[0] | Parameters<ApprovalPolicyLoad>[0]): Promise<Reply> {
    if (!process.send || !process.connected) return Promise.reject(this.failure());
    const requestId = randomUUID();
    return new Promise<Reply>((resolve, reject) => {
      const fail = (): void => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        clearTimeout(pending.timer);
        pending.reject(this.failure());
      };
      const timer = setTimeout(fail, 5_000);
      this.pending.set(requestId, { resolve, reject, timer });
      process.send!({ type, requestId, request }, error => { if (error) fail(); });
    });
  }
}
