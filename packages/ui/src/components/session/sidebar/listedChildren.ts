<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
import type { SessionNode } from './types';

const isWorkflowAgent = (session: Session): boolean => (
 ((session.metadata?.openchamber as { kind?: string } | undefined)?.kind === 'workflow-agent')
);

=======
import { isWorkflowAgentSession } from '@/lib/sessionWorkflowMetadata';
import type { SessionNode } from './types';

>>>>>>> bc50ba56a
/**
 * The children a sidebar row lists. Workflow agents stay in the session tree,
 * so their pending requests, activity and subtree actions still count for the
 * row above them, but they get no rows of their own, and neither does what
 * they started: one run can start a hundred agents. The run's card and the
 * Workflows panel open them.
 */
export const listedChildren = (node: SessionNode): readonly SessionNode[] => (
<<<<<<< HEAD
 node.children.some((child) => isWorkflowAgent(child.session))
  ? node.children.filter((child) => !isWorkflowAgent(child.session))
  : node.children
=======
  node.children.some((child) => isWorkflowAgentSession(child.session))
    ? node.children.filter((child) => !isWorkflowAgentSession(child.session))
    : node.children
>>>>>>> bc50ba56a
);
