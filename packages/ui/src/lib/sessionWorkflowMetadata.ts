import { z } from 'zod';

<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
||||||| bc50ba56aa
import type { Session } from '@/lib/opencode/model';
=======
import { parseMetadata } from '@/lib/metadataParse';
import type { Metadata, Session } from '@/lib/opencode/model';
>>>>>>> upstream/main

const workflowAgentMarkSchema = z.object({ openchamber: z.object({ kind: z.literal('workflow-agent') }) });
const workflowAgentLinkSchema = z.object({
  openchamber: z.object({ kind: z.literal('workflow-agent'), parentID: z.string().min(1) }),
});

export const isWorkflowAgentSession = (session: Session | null | undefined): boolean => (
  parseMetadata(workflowAgentMarkSchema, session?.metadata).success
);

export const workflowAgentParentId = (metadata: Metadata | undefined): string | undefined => (
  parseMetadata(workflowAgentLinkSchema, metadata).data?.openchamber.parentID
);
