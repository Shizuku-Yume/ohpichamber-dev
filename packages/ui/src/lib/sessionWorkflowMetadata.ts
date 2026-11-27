import { parseMetadata } from '@/lib/metadataParse';
import { z } from 'zod';

import type { Session } from '@openchamber/agent-contract';

const workflowAgentMarkSchema = z.object({ openchamber: z.object({ kind: z.literal('workflow-agent') }) });

export const isWorkflowAgentSession = (session: Session | null | undefined): boolean => (
  parseMetadata(workflowAgentMarkSchema, session?.metadata).success
);
