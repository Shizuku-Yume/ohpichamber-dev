import { z } from 'zod';

export const AgentServiceReadySchema = z.strictObject({
  ready: z.literal(true),
  engine: z.literal('omp'),
  version: z.literal('1.0.0'),
});
export type AgentServiceReady = z.infer<typeof AgentServiceReadySchema>;

export const RuntimeCapabilitiesSchema = z.strictObject({
  version: z.literal('1.0.0'), engine: z.literal('omp'),
  capabilities: z.strictObject({
    streaming: z.boolean(), casApprovals: z.boolean(), midTurnSteering: z.boolean(), followUpQueue: z.boolean(),
    subagents: z.boolean(), attachments: z.boolean(), models: z.boolean(), providers: z.boolean(), agents: z.boolean(),
    mcp: z.boolean(), skills: z.boolean(), statelessCompletion: z.boolean(), shells: z.boolean(),
    credentialHandoff: z.boolean().optional(),
  }),
});
export type RuntimeCapabilities = z.infer<typeof RuntimeCapabilitiesSchema>;
