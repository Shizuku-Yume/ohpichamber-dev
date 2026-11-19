/* eslint-disable react-refresh/only-export-components -- Provider and hooks are one contract. */
import React from 'react';
import type { Session } from '@/lib/opencode/model';
import type { SessionGroup } from '../types';

export type SessionRowOrderEntry = {
  id: string;
  rowKey: string | null;
  scopeKey: string | null;
  archived: boolean;
  descendantRange?: readonly [start: number, end: number];
};

export type SessionRowLifecycle = { time?: { archived?: number | null }; archived?: boolean };

export function mergeSessionRowLifecycle(entries: readonly SessionRowOrderEntry[], sessions: ReadonlyMap<string, SessionRowLifecycle>): ReadonlyMap<string, SessionRowLifecycle> {
  const lifecycle = new Map(sessions);
  for (const entry of entries) if (!lifecycle.has(entry.id)) lifecycle.set(entry.id, { archived: entry.archived });
  return lifecycle;
}

type SessionRowOrderRegistry = {
  getEntries: () => readonly SessionRowOrderEntry[];
  getDescendantIds: () => readonly string[];
<<<<<<< HEAD
  getSessionsById: () => ReadonlyMap<string, { archivedAt?: number }>;
||||||| bc50ba56aa
  getSessionsById: () => ReadonlyMap<string, { time?: { archived?: number | null } }>;
=======
  getSessionsById: () => ReadonlyMap<string, Session>;
  getLifecycleById: () => ReadonlyMap<string, SessionRowLifecycle>;
  getWorks: () => readonly SessionRowOrderWork[];
>>>>>>> upstream/main
};

export type SessionRowOrderWork = { group: SessionGroup; projectId: string };

const EMPTY_WORKS: readonly SessionRowOrderWork[] = [];

const SessionRowOrderContext = React.createContext<SessionRowOrderRegistry | null>(null);

export const SessionRowOrderProvider: React.FC<{
  entries: readonly SessionRowOrderEntry[];
  descendantIds: readonly string[];
<<<<<<< HEAD
  sessionsById: ReadonlyMap<string, { archivedAt?: number }>;
||||||| bc50ba56aa
  sessionsById: ReadonlyMap<string, { time?: { archived?: number | null } }>;
=======
  sessionsById: ReadonlyMap<string, Session>;
  works?: readonly SessionRowOrderWork[];
>>>>>>> upstream/main
  children: React.ReactNode;
}> = ({ entries, descendantIds, sessionsById, works = EMPTY_WORKS, children }) => {
  const entriesRef = React.useRef(entries);
  const descendantIdsRef = React.useRef(descendantIds);
  const sessionsByIdRef = React.useRef(sessionsById);
  const lifecycleById = React.useMemo(() => mergeSessionRowLifecycle(entries, sessionsById), [entries, sessionsById]);
  const lifecycleByIdRef = React.useRef(lifecycleById);
  const worksRef = React.useRef(works);
  worksRef.current = works;
  entriesRef.current = entries;
  descendantIdsRef.current = descendantIds;
  sessionsByIdRef.current = sessionsById;
  lifecycleByIdRef.current = lifecycleById;
  const registryRef = React.useRef<SessionRowOrderRegistry | null>(null);
  if (registryRef.current === null) {
    registryRef.current = {
      getEntries: () => entriesRef.current,
      getDescendantIds: () => descendantIdsRef.current,
      getSessionsById: () => sessionsByIdRef.current,
      getLifecycleById: () => lifecycleByIdRef.current,
      getWorks: () => worksRef.current,
    };
  }
  return <SessionRowOrderContext.Provider value={registryRef.current}>{children}</SessionRowOrderContext.Provider>;
};

export const useSessionRowOrderRegistry = (): SessionRowOrderRegistry | null => (
  React.useContext(SessionRowOrderContext)
);

export const deriveSessionRowBulkSelectAll = (
  entries: readonly SessionRowOrderEntry[],
  descendantIds: readonly string[],
  currentScopeKey: string | null,
): { ids: string[]; scopeKey: string | null } | null => {
  const first = entries[0];
  if (!first) return null;
  const scopeKey = currentScopeKey ?? first.scopeKey;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (scopeKey && entry.scopeKey !== scopeKey) continue;
    const range = entry.descendantRange;
    const entryIds = range ? [entry.id, ...descendantIds.slice(range[0], range[1])] : [entry.id];
    for (const id of entryIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.length > 0 ? { ids, scopeKey } : null;
};

export const deriveSessionRowSelectionArchived = (
  selectedIds: ReadonlySet<string>,
<<<<<<< HEAD
  sessionsById: ReadonlyMap<string, { archivedAt?: number }>,
||||||| bc50ba56aa
  sessionsById: ReadonlyMap<string, { time?: { archived?: number | null } }>,
=======
  sessionsById: ReadonlyMap<string, SessionRowLifecycle>,
>>>>>>> upstream/main
): boolean => {
  if (selectedIds.size === 0) return false;
  for (const id of selectedIds) {
<<<<<<< HEAD
    if (!sessionsById.get(id)?.archivedAt) return false;
||||||| bc50ba56aa
    if (!sessionsById.get(id)?.time?.archived) return false;
=======
    const session = sessionsById.get(id);
    if (!(session?.archived ?? Boolean(session?.time?.archived))) return false;
>>>>>>> upstream/main
  }
  return true;
};
