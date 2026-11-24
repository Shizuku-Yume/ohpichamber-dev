import type { Session, Subagent } from '@openchamber/agent-contract';
import { SessionSchema } from '@openchamber/agent-contract';

const SUBAGENT_GENERIC_DESCRIPTION = /^vibe\s+(?:fast|good)\s+session$/i;
const SUBAGENT_TASK_TITLE_MAX = 80;

const firstUsefulLine = (value: string | undefined, skipBoilerplate: boolean): string | undefined => {
  if (!value) return undefined;
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (skipBoilerplate && SUBAGENT_GENERIC_DESCRIPTION.test(trimmed)) continue;
    return trimmed;
  }
  return undefined;
};

const resolveSubagentSessionTitle = (child: Subagent): string => {
  const role = child.role.trim();
  const name = child.name?.trim();
  if (name && name !== role) return name;
  const description = firstUsefulLine(child.description, true);
  if (description) return description;
  const task = firstUsefulLine(child.task, false);
  if (task) return task.length > SUBAGENT_TASK_TITLE_MAX ? task.slice(0, SUBAGENT_TASK_TITLE_MAX) : task;
  return child.role;
};

export const buildSubagentChildSessionRecord = (
  parent: Session,
  child: Subagent,
  previous?: Session,
): Session => {
  const active = child.status === 'running' && parent.activeRunId !== null;
  const runtimeStatus = parent.runtimeStatus === 'unavailable' ? 'unavailable' : active ? parent.runtimeStatus : 'idle';
  const resolvedTitle = resolveSubagentSessionTitle(child) || undefined;
  const previousTitle = previous?.title?.trim();
  const title = previous && previousTitle && previousTitle !== child.role ? previous.title : resolvedTitle;
  return SessionSchema.parse({
    sessionId: child.childSessionId,
    parentSessionId: parent.sessionId,
    rootSessionId: parent.rootSessionId,
    projectId: parent.projectId,
    workspaceId: parent.workspaceId,
    displayPath: parent.displayPath,
    createdAt: child.createdAt ?? parent.createdAt,
    updatedAt: child.updatedAt ?? parent.updatedAt,
    epoch: parent.epoch,
    headSequence: parent.headSequence,
    mode: { kind: 'main' },
    runtimeStatus,
    activeRunId: runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : parent.activeRunId,
    title,
    metadata: null,
    metadataRevision: '0',
    archiveRevision: parent.archiveRevision,
  });
};
