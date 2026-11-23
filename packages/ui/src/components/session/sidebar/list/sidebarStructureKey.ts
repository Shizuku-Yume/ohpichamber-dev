import { z } from 'zod';
import { parseMetadata } from '@/lib/metadataParse';
import type { Session } from '@openchamber/agent-contract';
import type { GlobalSessionStructure } from '@/stores/globalSessionStructure';
import { isDoneSuggested, isReviewSuggested } from '@/lib/sessionWorkMetadata';

const openchamberSchema = z.object({ openchamber: z.record(z.string(), z.json()) });

const structuralMetadata = (metadata: Session['metadata']): Session['metadata'] => {
  if (!metadata) return null;
  const openchamber = parseMetadata(openchamberSchema, metadata).data?.openchamber;
  const { openchamber: _openchamber, ...base } = metadata;
  if (!openchamber) return metadata;
  const { turn: _turn, ...rest } = metadata.openchamber ?? {};
  const next = Object.keys(rest).length > 0 ? { ...base, openchamber: rest } : base;
  return Object.keys(next).length > 0 ? next : null;
};

const buildKey = (session: Session, withActivityTime: boolean): string => JSON.stringify({
  sessionId: session.sessionId,
  projectId: session.projectId,
  workspaceId: session.workspaceId,
  displayPath: session.displayPath,
  parentSessionId: session.parentSessionId,
  rootSessionId: session.rootSessionId,
  title: session.title,
  createdAt: session.createdAt,
  updatedAt: withActivityTime ? session.updatedAt : undefined,
  runtimeStatus: withActivityTime ? session.runtimeStatus : undefined,
  archivedAt: session.archivedAt,
  mode: session.mode,
  metadata: structuralMetadata(session.metadata),
  doneSuggested: isDoneSuggested(session),
  reviewSuggested: isReviewSuggested(session),
});

const keysBySession = new WeakMap<Session, { plain?: string; withActivityTime?: string }>();

const sidebarStructureKey = (session: Session, withActivityTime: boolean): string => {
  let keys = keysBySession.get(session);
  if (!keys) {
    keys = {};
    keysBySession.set(session, keys);
  }
  if (withActivityTime) {
    keys.withActivityTime ??= buildKey(session, true);
    return keys.withActivityTime;
  }
  keys.plain ??= buildKey(session, false);
  return keys.plain;
};

export const haveSameSidebarStructure = (
  previous: readonly Session[],
  next: readonly Session[],
  withActivityTime: boolean,
): boolean => {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    const before = previous[index];
    const after = next[index];
    if (before === after) continue;
    if (!before || !after || before.sessionId !== after.sessionId) return false;
    if (sidebarStructureKey(before, withActivityTime) !== sidebarStructureKey(after, withActivityTime)) return false;
  }
  return true;
};

const sameIds = (left: readonly string[], right: readonly string[]): boolean => (
  left === right || (left.length === right.length && left.every((id, index) => id === right[index]))
);

export const haveSameSidebarHierarchy = (previous: GlobalSessionStructure, next: GlobalSessionStructure): boolean => {
  if (!sameIds(previous.activeRootIds, next.activeRootIds)) return false;
  const before = previous.activeChildrenByParentId;
  const after = next.activeChildrenByParentId;
  if (before === after) return true;
  if (before.size !== after.size) return false;
  for (const [parentId, childIds] of after) {
    const previousChildIds = before.get(parentId);
    if (!previousChildIds || !sameIds(previousChildIds, childIds)) return false;
  }
  return true;
};
