import React from 'react';
import { mapWithConcurrency } from '@/lib/concurrency';
import type { Session } from '@openchamber/agent-contract';
import {
  buildOverviewSessionSections,
  classifyOverviewWorktree,
  isOverviewFollowed,
  overviewLeftOutOfDone,
  type OverviewActivity,
  type OverviewBlocking,
  type OverviewCleanupRow,
  type OverviewSessionFacts,
  type OverviewSessionSections,
  type OverviewWorktreeFacts,
} from '@/lib/overview/overviewModel';

import { useWorktreeChangeRequests } from './useWorktreeChangeRequests';
import { sessionsInWorktree } from '@/lib/worktrees/worktreeUse';
import { readOverviewWorktreeGit, type OverviewWorktreeGit, type OverviewWorktreeTarget } from './overviewActions';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
import { spaceProjectDirectoryIn, useSpacesStore } from '@/lib/spaces/spaces-store';
import { resolveProjectColor } from '@/lib/projectMeta';
import { getRuntimeKey } from '@/lib/runtime-switch';

import { findWorktreeHoldingDirectory } from '@/lib/worktrees/worktreePaths';
import { listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import type { WorktreeMetadata } from '@/types/worktree';
import type { PrVisualSummary } from '@/stores/useGitHubPrStatusStore';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useMinuteTickerNow } from '@/hooks/useDurationTicker';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import type { ProjectEntry } from '@/lib/api/types';
import { useBackgroundShellsStore } from '@/sync/background-shells';
import { useBackgroundImagesStore } from '@/sync/background-images';
import { usePrWatchStore } from '@/sync/pr-watch';
import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';
import { usePrWatchStore } from '@/sync/pr-watch';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useSessionUIStore } from '@/sync/session-ui-store';

/** Subagents nest; a deeper chain than this is treated as unrelated, as the status index does. */
const GIT_READ_CONCURRENCY = 3;

/** A linked worktree of a registered project, with what its branch's change request says. */
export type OverviewWorktree = OverviewWorktreeTarget & { pr: OverviewWorktreeFacts['pr'] };

export type OverviewData = {
  /** The session list has loaded; before that an empty page would claim there is nothing. */
  ready: boolean;
  /** True when session loading failed; displayed as an error state instead of empty list. */
  error: boolean;
  sections: OverviewSessionSections;
  /** Sessions with a done signal held back by a veto, for the bulk Done confirmation. */
  leftOut: OverviewSessionSections['working'];
  cleanup: OverviewCleanupRow[];
  /** The linked worktree a session works in, when its project's worktrees are known. */
  worktreeOf: (session: Session) => OverviewWorktree | null;
  /** What git last said about a worktree; null before it answered. */
  gitOf: (path: string) => OverviewWorktreeGit | null;
  sessionsIn: (path: string) => Session[];
  /** A session there runs or is open, or the worktree is the directory on screen. */
  isWorktreeInUse: (path: string) => boolean;
  /** The project a session belongs to: its name and its colour, when the user gave it one. */
  projectOf: (session: Session) => { label: string; color: string | null };
  /** Reads git again for every worktree, e.g. after a removal. */
  refreshGit: () => void;
};

const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed;
};

const projectLabel = (project: ProjectEntry | null, directory: string): string => (
  project ? project.label?.trim() || basename(project.path) : basename(directory)
);

/**
 * Git state of the given worktrees while the page is on screen: read when it
 * opens, when the set changes and when the window comes back. A failed read
 * leaves the worktree unknown, and an unknown worktree is never offered.
 */
function useWorktreeGit(targets: readonly OverviewWorktree[]) {
  const [byPath, setByPath] = React.useState<ReadonlyMap<string, OverviewWorktreeGit>>(new Map());
  const [generation, setGeneration] = React.useState(0);
  const signature = targets.map((target) => `${target.worktree.path}@${target.mergedHeadSha ?? ''}`).sort().join('\n');
  const targetsRef = React.useRef(targets);
  targetsRef.current = targets;

  React.useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible') setGeneration((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, []);

  React.useEffect(() => {
    if (!signature) return;
    let cancelled = false;
    const runtimeKey = getRuntimeKey();
    void mapWithConcurrency([...targetsRef.current], GIT_READ_CONCURRENCY, async (target) => {
      try {
        return [target.worktree.path, await readOverviewWorktreeGit(target)] as const;
      } catch {
        return null;
      }
    }).then((results) => {
      if (cancelled || runtimeKey !== getRuntimeKey()) return;
      const next = new Map<string, OverviewWorktreeGit>();
      for (const entry of results) if (entry) next.set(normalizePath(entry[0]) ?? entry[0], entry[1]);
      setByPath(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signature, generation]);

  const refresh = React.useCallback(() => setGeneration((value) => value + 1), []);
  return { byPath, refresh };
}

type OverviewReviewRequest = { url: string; title: string; number: number; repo: string; directory: string };
type OverviewReviewRequests = { items: OverviewReviewRequest[]; hasMore: boolean };

export function useOverviewReviewRequests(): OverviewReviewRequests {
  return { items: [], hasMore: false };
}

/**
 * Every project's worktree list, read when the page opens and when the window
 * comes back. The sidebar fills its own map only for the projects its Tree view
 * expands, so the page cannot rely on it. A project that is not a repository,
 * or whose read fails, keeps whatever the sidebar knows.
 */
function useProjectWorktrees(projects: readonly ProjectEntry[]): ReadonlyMap<string, readonly WorktreeMetadata[]> {
  const [byProject, setByProject] = React.useState<ReadonlyMap<string, readonly WorktreeMetadata[]>>(new Map());
  const [generation, setGeneration] = React.useState(0);
  const signature = projects.map((project) => `${project.id}:${project.path}`).join('\n');
  const projectsRef = React.useRef(projects);
  projectsRef.current = projects;

  React.useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible') setGeneration((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const runtimeKey = getRuntimeKey();
    void mapWithConcurrency([...projectsRef.current], GIT_READ_CONCURRENCY, async (project) => {
      try {
        return [normalizePath(project.path) ?? project.path, await listProjectWorktrees({ id: project.id, path: project.path })] as const;
      } catch {
        return null;
      }
    }).then((results) => {
      if (cancelled || runtimeKey !== getRuntimeKey()) return;
      setByProject(new Map(results.flatMap((entry) => (entry ? [entry] : []))));
    });
    return () => {
      cancelled = true;
    };
  }, [signature, generation]);

  return byProject;
}

const rootOf = (sessionId: string, entityById: ReadonlyMap<string, Session>): string => (
  entityById.get(sessionId)?.rootSessionId ?? sessionId
);


/**
 * Everything the overview shows, derived from what the app already keeps live:
 * sessions and their status, requests, background commands, In work, the
 * branch PRs the sidebar discovered, linked items, and git for the linked
 * worktrees. While the page is on screen it follows the linked items and the
 * branch PRs of the sessions it shows, and reads git for the worktrees.
 */
export function useOverviewData(): OverviewData {
  const sessions = useGlobalSessionsStore((state) => state.activeSessions);
  const entityById = useGlobalSessionsStore((state) => state.entityById);
  const sessionsStatus = useGlobalSessionsStore((state) => state.status);
  const hasLoaded = useGlobalSessionsStore((state) => state.hasLoaded);
  const activeSessionIds = useGlobalSessionStatusStore((state) => state.activeSessionIds);
  const shellSessionIds = useBackgroundShellsStore((state) => state.sessionIds);
<<<<<<< HEAD
  // A session the user asked the host to watch a pull request for is waiting
  // on it, so its row says so while nothing else on it is running.
=======
  const imageSessionIds = useBackgroundImagesStore((state) => state.sessionIds);
>>>>>>> bc50ba56a
  const prWatches = usePrWatchStore((state) => state.bySession);
  const blockingBySession = useGlobalBlockingRequestsStore((state) => state.bySession);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const projects = useProjectsStore((state) => state.projects);
  const workEnabled = useUIStore((state) => state.sessionWorkEnabled);


  // Ages (stalled, stale) move by the minute, not on every render.
  const now = useMinuteTickerNow(true);

  const discoveredWorktrees = useProjectWorktrees(projects);

  // Linked worktrees of registered projects, with the project they belong to.
  // The page reads every project's list itself; the sidebar's map adds the
  // worktrees it already knows, and a fresh read of a project wins.
  const linkedWorktrees = React.useMemo(() => {
    const byProject = new Map<string, readonly WorktreeMetadata[]>(worktreesByProject);
    for (const [projectPath, entries] of discoveredWorktrees) byProject.set(projectPath, entries);
    const list: Array<{ worktree: WorktreeMetadata; project: { id: string; path: string }; path: string; branch: string | null }> = [];
    for (const [projectPath, entries] of byProject) {
      const project = projects.find((entry) => normalizePath(entry.path) === projectPath);
      if (!project) continue;
      for (const worktree of entries) {
        const path = normalizePath(worktree.path);
        // A fresh list carries no status; one still being set up or gone says so.
        if (!path || path === projectPath || (worktree.worktreeStatus && worktree.worktreeStatus !== 'ready')) continue;
        list.push({ worktree, project: { id: project.id, path: project.path }, path, branch: worktree.branch?.trim() || null });
      }
    }
    return list;
  }, [discoveredWorktrees, projects, worktreesByProject]);

  const changeRequests = useWorktreeChangeRequests(React.useMemo(
    () => linkedWorktrees.flatMap(({ path, branch }) => (branch ? [{ path, branch }] : [])),
    [linkedWorktrees],
  ));

  const worktrees = React.useMemo((): OverviewWorktree[] => linkedWorktrees.map(({ worktree, project, path }) => ({
    worktree,
    project,
    ...changeRequests.changeRequestOf(path),
  })), [changeRequests, linkedWorktrees]);

  const worktreeOfDirectory = React.useCallback((directory: string | null): OverviewWorktree | null => {
    if (!directory) return null;
    const match = findWorktreeHoldingDirectory(worktrees.map((entry) => entry.worktree), directory);
    return match ? worktrees.find((entry) => entry.worktree === match) ?? null : null;
  }, [worktrees]);

  const worktreeOf = React.useCallback(
    (session: Session) => worktreeOfDirectory(resolveGlobalSessionDirectory(session)),
    [worktreeOfDirectory],
  );

  const { byPath: gitByPath, refresh: refreshGit } = useWorktreeGit(worktrees);
  const gitOf = React.useCallback((path: string) => gitByPath.get(normalizePath(path) ?? path) ?? null, [gitByPath]);

  // Running and waiting, rolled up to the top-level session the user sees.
  const activityByRoot = React.useMemo(() => {
    const map = new Map<string, OverviewActivity>();
    for (const id of activeSessionIds) {
      const root = rootOf(id, entityById);
      map.set(root, root === id ? 'running' : map.get(root) === 'running' ? 'running' : 'subagent');
    }
    for (const id of shellSessionIds) {
      const root = rootOf(id, entityById);
      if (!map.has(root)) map.set(root, 'shell');
    }
<<<<<<< HEAD
=======
    for (const id of imageSessionIds) {
      const root = rootOf(id, entityById);
      if (!map.has(root)) map.set(root, 'image');
    }
>>>>>>> bc50ba56a
    for (const id of prWatches.keys()) {
      const root = rootOf(id, entityById);
      if (!map.has(root)) map.set(root, 'pullRequest');
    }
    return map;
<<<<<<< HEAD
  }, [activeSessionIds, entityById, prWatches, shellSessionIds]);
=======
  }, [activeSessionIds, entityById, imageSessionIds, prWatches, shellSessionIds]);
>>>>>>> bc50ba56a

  const blockingByRoot = React.useMemo(() => {
    const map = new Map<string, OverviewBlocking>();
    for (const [sessionId, pending] of blockingBySession) {
      const root = rootOf(sessionId, entityById);
      if (pending.permissions.length > 0) map.set(root, 'permission');
      else if (pending.forms.length > 0 && !map.has(root)) map.set(root, 'question');
    }
    return map;
  }, [blockingBySession, entityById]);

  // Sessions whose PRs and issues matter: the ones in work, or recent ones when In work is off.
  const isFollowed = React.useCallback(
    (session: Session) => isOverviewFollowed(session, { workEnabled, now }),
    [now, workEnabled],
  );

  const topLevel = React.useMemo(
    () => sessions.filter((session) => !session.parentSessionId && session.archivedAt === undefined),
    [sessions],
  );


  const factsOf = React.useCallback((session: Session): OverviewSessionFacts => {
    const base: OverviewSessionFacts = {
      session,
      activity: activityByRoot.get(session.sessionId) ?? null,
      blocking: blockingByRoot.get(session.sessionId) ?? null,
      prs: [],
      prsPending: false,
      issues: [],
      worktreeDirty: null,
    };
    if (!isFollowed(session)) return base;
    const entry = worktreeOf(session);
    const prs: PrVisualSummary[] = [];
    let prsPending = false;
    const add = (summary: PrVisualSummary | null) => {
      if (summary) prs.push(summary);
      else prsPending = true;
    };
    if (entry) {
      const path = normalizePath(entry.worktree.path) ?? entry.worktree.path;
      if (entry.pr === 'unknown') prsPending = true;
      else if (entry.pr !== 'none') add(changeRequests.summaryOf(path));
    }
    const git = entry ? gitOf(entry.worktree.path) : null;
    return { ...base, prs, prsPending, issues: [], worktreeDirty: git ? git.losses.uncommittedFiles > 0 : null };
  }, [activityByRoot, blockingByRoot, changeRequests, gitOf, isFollowed, worktreeOf]);

  const sections = React.useMemo(
    () => buildOverviewSessionSections(topLevel.map(factsOf), { workEnabled, now }),
    [factsOf, now, topLevel, workEnabled],
  );

  const sessionsIn = React.useCallback((path: string): Session[] => sessionsInWorktree(sessions, path), [sessions]);

  // The page's view of what the action checks again when it runs (`removeOverviewWorktree`).
  const isWorktreeInUse = React.useCallback((path: string): boolean => {
    const root = normalizePath(path) ?? path;
    const onScreen = normalizePath(currentDirectory ?? null);
    if (onScreen === root || Boolean(onScreen?.startsWith(`${root}/`))) return true;
    return sessionsIn(root).some((session) => session.sessionId === currentSessionId || activityByRoot.has(rootOf(session.sessionId, entityById)));
  }, [activityByRoot, currentDirectory, currentSessionId, entityById, sessionsIn]);

  const cleanup = React.useMemo(() => {
    const rows: OverviewCleanupRow[] = [];
    for (const entry of worktrees) {
      const path = normalizePath(entry.worktree.path) ?? entry.worktree.path;
      const row = classifyOverviewWorktree({
        worktree: entry.worktree,
        project: entry.project,
        pr: entry.pr,
        mergedHeadSha: entry.mergedHeadSha,
        sessions: sessionsIn(path),
        inUse: isWorktreeInUse(path),
        git: gitOf(path),
      }, { workEnabled, now });
      if (row) rows.push(row);
    }
    return rows;
  }, [gitOf, isWorktreeInUse, now, sessionsIn, workEnabled, worktrees]);

  // A space's session belongs to the project the space was made from, once the space list names it.
  const spaceMarks = useSpacesStore((state) => state.spaces);
  const spacesJourney = useSpacesStore((state) => state.journey);
  const projectOf = React.useCallback((session: Session) => {
<<<<<<< HEAD
    const directory = resolveGlobalSessionDirectory(session) ?? session.displayPath;
    const project = resolveProjectForSessionDirectory(projects, worktreesByProject, directory);
=======
    const directory = resolveGlobalSessionDirectory(session) ?? session.directory;
    const spaceProject = spaceProjectDirectoryIn({ spaces: spaceMarks, journey: spacesJourney }, directory);
    const project = resolveProjectForSessionDirectory(projects, worktreesByProject, directory, spaceProject);
>>>>>>> bc50ba56a
    return { label: projectLabel(project, directory), color: resolveProjectColor(project?.color) };
  }, [projects, spaceMarks, spacesJourney, worktreesByProject]);

  return {
    ready: hasLoaded || sessionsStatus === 'ready',
    error: sessionsStatus === 'error',
    sections,
    leftOut: overviewLeftOutOfDone(sections),
    cleanup,
    worktreeOf,
    gitOf,
    sessionsIn,
    isWorktreeInUse,
    projectOf,
    refreshGit,
  };
}
