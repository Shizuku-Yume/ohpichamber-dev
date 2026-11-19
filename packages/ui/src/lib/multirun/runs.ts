import type { Session } from '@openchamber/agent-contract';
import { getMultiRunIdentity, type MultiRunIdentity } from './identity';

export type MultiRunMember = {
  sessionId: string;
  identity: MultiRunIdentity;
};

export type MultiRunSummary = {
  key: string;
  title: string;
  groupSlug: string;
  lanes: readonly MultiRunMember[];
  fusions: readonly MultiRunMember[];
  memberIds: readonly string[];
  providerIDs: readonly string[];
  variants: readonly (string | undefined)[];
  createdAt: number;
  lastActivity: number;
  autoFusion?: MultiRunIdentity['autoFusion'];
};

export type MultiRunIndex = {
  runs: ReadonlyMap<string, MultiRunSummary>;
  runKeyBySessionId: ReadonlyMap<string, string>;
};

export const EMPTY_MULTI_RUN_INDEX: MultiRunIndex = Object.freeze({
  runs: new Map(),
  runKeyBySessionId: new Map(),
});

const identityCache = new WeakMap<Session, { scoped: boolean; scope: string | null; identity: MultiRunIdentity | null }>();

export const readMultiRunIdentityWith = (
  session: Session,
  resolveScope: (session: Session) => string | null,
): MultiRunIdentity | null => {
  const cached = identityCache.get(session);
  if (cached && cached.scope === scope) return cached.identity;
  const identity = getMultiRunIdentity(session, scope ?? session.workspaceId);
  identityCache.set(session, { scope, identity });
  return identity;
};

export const readMultiRunIdentity = (session: Session, scope: string | null): MultiRunIdentity | null => (
  readMultiRunIdentityWith(session, () => scope)
);

const variantRank = (runGroup: string | undefined): number => (runGroup ? Number(runGroup.slice(1)) : 0);

export const multiRunVariantLabel = (runGroup: string | undefined): string => {
  const rank = Math.max(1, variantRank(runGroup));
  return rank <= 26 ? String.fromCharCode(64 + rank) : String(rank);
};

type IndexedMember = { session: Session; identity: MultiRunIdentity };

let lastIndexed: { members: IndexedMember[]; index: MultiRunIndex } | null = null;

const sameMembers = (left: readonly IndexedMember[], right: readonly IndexedMember[]): boolean => (
  left.length === right.length
  && left.every((member, index) => member.session === right[index].session && member.identity === right[index].identity)
);

export function buildMultiRunIndex(
  sessions: Iterable<Session>,
  resolveLegacyScope: (session: Session) => string | null,
): MultiRunIndex {
  const indexed: IndexedMember[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    if (seen.has(session.sessionId) || session.archivedAt || session.parentSessionId) continue;
    seen.add(session.sessionId);
    const identity = readMultiRunIdentity(session, resolveLegacyScope(session));
    if (!identity) continue;
    const list = members.get(identity.key);
    if (list) list.push({ session, identity });
    else members.set(identity.key, [{ session, identity }]);
  }

  const runs = new Map<string, MultiRunSummary>();
  const runKeyBySessionId = new Map<string, string>();
  for (const [key, list] of members) {
    if (list.length < 2) continue;
    const lanes = list
      .filter((entry) => entry.identity.role === 'run')
      .sort((a, b) => variantRank(a.identity.runGroup) - variantRank(b.identity.runGroup)
        || a.session.createdAt - b.session.createdAt || a.session.sessionId.localeCompare(b.session.sessionId));
    const fusions = list
      .filter((entry) => entry.identity.role === 'fusion')
      .sort((a, b) => b.session.createdAt - a.session.createdAt || a.session.sessionId.localeCompare(b.session.sessionId));
    const ordered = [...fusions, ...lanes];
    const titled = ordered.find((entry) => entry.identity.title);
    const withAutoFusion = lanes.find((entry) => entry.identity.autoFusion);
    runs.set(key, Object.freeze({
      key,
      title: titled?.identity.title ?? list[0].identity.groupSlug,
      groupSlug: list[0].identity.groupSlug,
      lanes: Object.freeze(lanes.map(({ session, identity }) => ({ sessionId: session.sessionId, identity }))),
      fusions: Object.freeze(fusions.map(({ session, identity }) => ({ sessionId: session.sessionId, identity }))),
      memberIds: Object.freeze(ordered.map((entry) => entry.session.sessionId)),
      providerIDs: Object.freeze([...new Set(lanes.map((entry) => entry.identity.providerID))]),
      variants: Object.freeze([...new Set(lanes.map((entry) => entry.identity.runGroup))]),
      createdAt: Math.min(...list.map((entry) => entry.session.createdAt)),
      lastActivity: Math.max(...list.map((entry) => entry.session.updatedAt)),
      autoFusion: withAutoFusion?.identity.autoFusion,
    }));
    for (const entry of list) runKeyBySessionId.set(entry.session.sessionId, key);
  }
  return Object.freeze({ runs, runKeyBySessionId });
}
