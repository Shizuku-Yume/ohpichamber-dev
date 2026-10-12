import { z } from 'zod';

export const AgentServiceReadySchema = z.strictObject({
  ready: z.literal(true),
  engine: z.literal('omp'),
  version: z.literal('1.0.0'),
});
export type AgentServiceReady = z.infer<typeof AgentServiceReadySchema>;
