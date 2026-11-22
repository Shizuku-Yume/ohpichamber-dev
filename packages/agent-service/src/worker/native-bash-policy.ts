import type { CreateAgentSessionOptions } from '@oh-my-pi/pi-coding-agent/sdk';
import { JsonObjectSchema, type JsonObject } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import { NativeApprovalRequired } from './policy.ts';
import type { WorkerInteraction } from './interaction.ts';

export function createNativeBashAuthorizer({ interaction, authorize, nativeAuthorized }: {
  interaction: WorkerInteraction;
  authorize: (toolCallId: string, input: JsonObject, approvalId?: string) => Promise<void>;
  nativeAuthorized: (toolCallId: string, input: JsonObject) => boolean;
}): NonNullable<CreateAgentSessionOptions['authorizeBashExecution']> {
  return async (toolCallId, params, signal) => {
    signal?.throwIfAborted();
    const input = JsonObjectSchema.parse(params);
    const receipt = interaction.takeApprovalReceipt(toolCallId);
    try { await authorize(toolCallId, input, receipt); }
    catch (error) {
      if (!(error instanceof NativeApprovalRequired) || receipt !== undefined) throw error;
      const nativeApproved = nativeAuthorized(toolCallId, input)
        ? await interaction.requestNativeGrant(toolCallId, input, signal)
        : await interaction.approveBash(toolCallId, input, signal);
      if (!nativeApproved) throw new ProjectionError(403, 'UNAUTHORIZED', 'Native command approval was rejected');
      const approvalId = interaction.takeApprovalReceipt(toolCallId);
      if (!approvalId) throw new ProjectionError(403, 'UNAUTHORIZED', 'Native command approval is unavailable');
      await authorize(toolCallId, input, approvalId);
    }
    signal?.throwIfAborted();
  };
}
