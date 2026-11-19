import type { Session, SessionMetadata, SessionMetadataPatch } from '@openchamber/agent-contract';
import { SessionMetadataSchema } from '@openchamber/agent-contract';
import { parseMultiRunSessionTitle } from './title';
import { omitKeys } from '@/lib/omitKeys';

type StoredMembership = NonNullable<NonNullable<SessionMetadata['openchamber']>['multirun']>;
export type MultiRunMembership = StoredMembership;
export type MultiRunIdentity = Omit<MultiRunMembership, 'version' | 'sessionID'> & { key: string };

export const multiRunGroupKey = (group: MultiRunMembership['group'], groupSlug: string): string =>
  group.kind === 'id' ? JSON.stringify(['id', group.id]) : JSON.stringify(['legacy', group.scope, groupSlug]);

export function getMultiRunMembership(session: Session): MultiRunMembership | null {
  const parsed = SessionMetadataSchema.safeParse(session.metadata);
  const membership = parsed.success ? parsed.data.openchamber?.multirun : undefined;
  return membership?.sessionID === session.sessionId ? membership : null;
}

/** A present marker is authoritative, even if pending, invalid, or inherited by a fork. */
export function getMultiRunIdentity(session: Session, legacyScope = session.projectId): MultiRunIdentity | null {
  const openchamber = session.metadata?.openchamber;
  if (openchamber && Object.hasOwn(openchamber, 'multirun')) {
    const membership = getMultiRunMembership(session);
    if (!membership) return null;
    const identity = omitKeys(membership, ['version', 'sessionID']);
    return { ...identity, key: multiRunGroupKey(membership.group, membership.groupSlug) };
  }
  if (session.parentSessionId || openchamber?.kind === 'review') return null;
  const title = parseMultiRunSessionTitle(session.title ?? '');
  if (!title || !legacyScope) return null;
  const group: MultiRunMembership['group'] = { kind: 'legacy', scope: legacyScope };
  return {
    group, groupSlug: title.groupSlug, runGroup: title.runGroup,
    providerID: title.providerID, modelID: title.modelID, index: title.index,
    role: title.fusion ? 'fusion' : 'run',
    key: multiRunGroupKey(group, title.groupSlug),
  };
}

export function withMultiRunMembership(session: Pick<Session, 'metadata'>, membership: MultiRunMembership): SessionMetadata {
  return SessionMetadataSchema.parse({
    ...session.metadata,
    openchamber: { ...session.metadata?.openchamber, multirun: membership },
  });
}

/** Host merge patches preserve unrelated operational metadata. */
export const multiRunMembershipPatch = (membership: MultiRunMembership): SessionMetadataPatch => ({
  changes: { openchamber: { multirun: membership } },
});

export function sameMultiRunIdentity(a: Session, b: Session): boolean {
  if (a.sessionId === b.sessionId && a.metadata === b.metadata && a.workspaceId === b.workspaceId && a.parentSessionId === b.parentSessionId) return true;
  const left = getMultiRunIdentity(a);
  const right = getMultiRunIdentity(b);
  if (!left || !right) return left === right;
  return left.key === right.key && left.runGroup === right.runGroup && left.role === right.role
    && left.groupSlug === right.groupSlug && left.providerID === right.providerID
    && left.modelID === right.modelID && left.index === right.index && left.title === right.title;
}
