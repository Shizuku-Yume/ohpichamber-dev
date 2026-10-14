import type { Session } from '@openchamber/agent-contract';
import { resolveWorkspaceDirectory } from './globalSessions';

export { mergeSessionDirectoryMetadata } from './globalSessions';

export type GlobalSessionStructure = {
  activeSessionIds: readonly string[];
  activeRootIds: readonly string[];
  activeChildrenByParentId: ReadonlyMap<string, readonly string[]>;
  activeIdsByDirectory: ReadonlyMap<string, readonly string[]>;
};

export type GlobalSessionStructureMutation = {
  sessionId: string;
  previous: Session | null;
  next: Session | null;
};

type SessionLocation = { directory: string | null; parentId: string | null };
type BucketChange = { additions: Set<string>; removals: Set<string> };

export const resolveGlobalSessionDirectory = (session: Session): string | null => resolveWorkspaceDirectory(session.workspaceId);

const locationOf = (session: Session | null): SessionLocation | null => (
  session === null || session.archivedAt !== undefined ? null : {
    directory: resolveGlobalSessionDirectory(session),
    parentId: session.parentSessionId ?? null,
  }
);

const appendToBucket = (buckets: Map<string, string[]>, key: string, sessionId: string): void => {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(sessionId);
  else buckets.set(key, [sessionId]);
};

export const buildGlobalSessionStructure = (activeSessions: readonly Session[]): GlobalSessionStructure => {
  const activeSessionIds: string[] = [];
  const activeRootIds: string[] = [];
  const activeChildrenByParentId = new Map<string, string[]>();
  const activeIdsByDirectory = new Map<string, string[]>();
  for (const session of activeSessions) {
    const location = locationOf(session);
    if (!location) continue;
    activeSessionIds.push(session.sessionId);
    if (location.parentId) appendToBucket(activeChildrenByParentId, location.parentId, session.sessionId);
    else activeRootIds.push(session.sessionId);
    if (location.directory) appendToBucket(activeIdsByDirectory, location.directory, session.sessionId);
  }
  return { activeSessionIds, activeRootIds, activeChildrenByParentId, activeIdsByDirectory };
};

const recordChange = (change: BucketChange, sessionId: string, operation: 'add' | 'remove'): void => {
  if (operation === 'add') {
    change.removals.delete(sessionId);
    change.additions.delete(sessionId);
    change.additions.add(sessionId);
  } else {
    change.additions.delete(sessionId);
    change.removals.add(sessionId);
  }
};

const recordBucketChange = (
  changes: Map<string, BucketChange>, key: string, sessionId: string, operation: 'add' | 'remove',
): void => {
  const change = changes.get(key) ?? { additions: new Set<string>(), removals: new Set<string>() };
  recordChange(change, sessionId, operation);
  changes.set(key, change);
};

const applyListChange = (source: readonly string[], change: BucketChange): readonly string[] => {
  if (change.additions.size === 0 && change.removals.size === 0) return source;
  const additions = [...change.additions].reverse();
  const next = [...additions, ...source.filter((id) => !change.removals.has(id) && !change.additions.has(id))];
  return next.length === source.length && next.every((id, index) => id === source[index]) ? source : next;
};

const applyBucketChanges = (
  source: ReadonlyMap<string, readonly string[]>, changes: Map<string, BucketChange>,
): ReadonlyMap<string, readonly string[]> => {
  let next: Map<string, readonly string[]> | null = null;
  for (const [key, change] of changes) {
    const previous = source.get(key) ?? [];
    const bucket = applyListChange(previous, change);
    if (bucket === previous) continue;
    next ??= new Map(source);
    if (bucket.length === 0) next.delete(key);
    else next.set(key, bucket);
  }
  return next ?? source;
};

export const applyGlobalSessionStructureMutations = (
  structure: GlobalSessionStructure, mutations: readonly GlobalSessionStructureMutation[],
): GlobalSessionStructure => {
  const members: BucketChange = { additions: new Set(), removals: new Set() };
  const roots: BucketChange = { additions: new Set(), removals: new Set() };
  const children = new Map<string, BucketChange>();
  const directories = new Map<string, BucketChange>();
  for (const mutation of mutations) {
    const previous = locationOf(mutation.previous);
    const next = locationOf(mutation.next);
    if (previous === null && next === null) continue;
    if (previous === null) recordChange(members, mutation.sessionId, 'add');
    else if (next === null) recordChange(members, mutation.sessionId, 'remove');
    if (previous?.parentId !== next?.parentId || (previous === null) !== (next === null)) {
      if (previous) {
        if (previous.parentId) recordBucketChange(children, previous.parentId, mutation.sessionId, 'remove');
        else recordChange(roots, mutation.sessionId, 'remove');
      }
      if (next) {
        if (next.parentId) recordBucketChange(children, next.parentId, mutation.sessionId, 'add');
        else recordChange(roots, mutation.sessionId, 'add');
      }
    }
    if (previous?.directory !== next?.directory) {
      if (previous?.directory) recordBucketChange(directories, previous.directory, mutation.sessionId, 'remove');
      if (next?.directory) recordBucketChange(directories, next.directory, mutation.sessionId, 'add');
    }
  }
  const activeSessionIds = applyListChange(structure.activeSessionIds, members);
  const activeRootIds = applyListChange(structure.activeRootIds, roots);
  const activeChildrenByParentId = applyBucketChanges(structure.activeChildrenByParentId, children);
  const activeIdsByDirectory = applyBucketChanges(structure.activeIdsByDirectory, directories);
  if (activeSessionIds === structure.activeSessionIds && activeRootIds === structure.activeRootIds
    && activeChildrenByParentId === structure.activeChildrenByParentId && activeIdsByDirectory === structure.activeIdsByDirectory) return structure;
  return { activeSessionIds, activeRootIds, activeChildrenByParentId, activeIdsByDirectory };
};
