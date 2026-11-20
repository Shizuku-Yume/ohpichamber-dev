import type { RepositoryReferenceFilter } from '@/lib/api/types';
import { useRepositoryAcrossReferenceList } from '@/components/references/referenceSources';
import { useRepositoryUrlMatcher } from '@/lib/source-control/repositoryUrlMatcher';
import { useBranchTrackedPulls } from '@/stores/useGitHubPrStatusStore';
import type { TrackedItem } from '@/lib/trackedItems/model';
import { getLinkedSidebarChanges } from '@/lib/linkedIssues';
import { repositoryThread } from '@/lib/trackedItems/fromLinks';
import { getLinkedSidebarIssues } from '@/lib/linkedIssues';
import { workItem } from '@/lib/trackedItems/fromLinks';
import { useTrackedItems } from '@/lib/trackedItems/interest';
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
import { readOverviewWorktreeGit, sessionsInWorktree, type OverviewWorktreeGit, type OverviewWorktreeTarget } from './overviewActions';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
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
import { useExtensionWaitsStore } from '@/sync/extension-waits';
import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';
import { usePrWatchStore } from '@/sync/pr-watch';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useSessionUIStore } from '@/sync/session-ui-store';

const GIT_READ_CONCURRENCY = 3;

export type OverviewWorktree = OverviewWorktreeTarget & { pr: OverviewWorktreeFacts['pr'] };

export type OverviewData = {
  ready: boolean;
  /** True when session loading failed; displayed as an error state instead of empty list. */
  error: boolean;
  sections: OverviewSessionSections;
  leftOut: OverviewSessionSections['working'];
  cleanup: OverviewCleanupRow[];
  worktreeOf: (session: Session) => OverviewWorktree | null;
  gitOf: (path: string) => OverviewWorktreeGit | null;
  sessionsIn: (path: string) => Session[];
  isWorktreeInUse: (path: string) => boolean;
  projectOf: (session: Session) => { label: string; color: string | null };
  refreshGit: () => void;
};

const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed;
};

const projectLabel = (project: ProjectEntry | null, directory: string): string => (
  project ? project.label?.trim() || basename(project.path) : basename(directory)
);

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

const REVIEW_REQUESTED: RepositoryReferenceFilter = { state: 'open', people: 'reviewRequested', labels: [] };

type OverviewReviewRequests = { items: OverviewReviewRequest[]; hasMore: boolean };

export function useOverviewReviewRequests(): OverviewReviewRequests {
  const projects = useProjectsStore((state) => state.projects);
  const directories = React.useMemo(() => projects.map((project) => project.path), [projects]);
  const list = useRepositoryAcrossReferenceList({ enabled: true, directories, kind: 'pull', filter: REVIEW_REQUESTED, query: '' });
  const items = React.useMemo(() => {
    const seen = new Set<string>();
    return list.items.flatMap((item) => {
      if (item.kind !== 'pull' || seen.has(item.url)) return [];
      seen.add(item.url);
      return [{ url: item.url, title: item.title, number: item.number, repo: item.sourceRepo.repo, directory: item.directory }];
    });
  }, [list.items]);
  return { items, hasMore: list.hasMore };
}

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

export function useOverviewData(): OverviewData {
  const sessions = useGlobalSessionsStore((state) => state.activeSessions);
  const entityById = useGlobalSessionsStore((state) => state.entityById);
  const sessionsStatus = useGlobalSessionsStore((state) => state.status);
  const hasLoaded = useGlobalSessionsStore((state) => state.hasLoaded);
  const activeSessionIds = useGlobalSessionStatusStore((state) => state.activeSessionIds);
  const shellSessionIds = useBackgroundShellsStore((state) => state.sessionIds);
  // A session the user asked the host to watch a pull request for is waiting
  // on it, so its row says so while nothing else on it is running.
  const prWatches = usePrWatchStore((state) => state.bySession);
  const extensionWaits = useExtensionWaitsStore((state) => state.bySession);
  const blockingBySession = useGlobalBlockingRequestsStore((state) => state.bySession);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const projects = useProjectsStore((state) => state.projects);
  const workEnabled = useUIStore((state) => state.sessionWorkEnabled);


  const now = useMinuteTickerNow(true);

  const discoveredWorktrees = useProjectWorktrees(projects);

  const linkedWorktrees = React.useMemo(() => {
    const byProject = new Map<string, readonly WorktreeMetadata[]>(worktreesByProject);
    for (const [projectPath, entries] of discoveredWorktrees) byProject.set(projectPath, entries);
    const list: Array<{ worktree: WorktreeMetadata; project: { id: string; path: string }; path: string; branch: string | null }> = [];
    for (const [projectPath, entries] of byProject) {
      const project = projects.find((entry) => normalizePath(entry.path) === projectPath);
      if (!project) continue;
      for (const worktree of entries) {
        const path = normalizePath(worktree.path);
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
    for (const id of prWatches.keys()) {
      const root = rootOf(id, entityById);
      if (!map.has(root)) map.set(root, 'pullRequest');
    }
    for (const id of extensionWaits.keys()) {
      const root = rootOf(id, entityById);
      if (!map.has(root)) map.set(root, 'extensionWait');
    }
    return map;
  }, [activeSessionIds, entityById, extensionWaits, prWatches, shellSessionIds]);

  const blockingByRoot = React.useMemo(() => {
    const map = new Map<string, OverviewBlocking>();
    for (const [sessionId, pending] of blockingBySession) {
      const root = rootOf(sessionId, entityById);
      if (pending.permissions.length > 0) map.set(root, 'permission');
      else if (pending.forms.length > 0 && !map.has(root)) map.set(root, 'question');
    }
    return map;
  }, [blockingBySession, entityById]);

  const isFollowed = React.useCallback(
    (session: Session) => isOverviewFollowed(session, { workEnabled, now }),
    [now, workEnabled],
  );

  const topLevel = React.useMemo(
    () => sessions.filter((session) => !session.parentSessionId && session.archivedAt === undefined),
    [sessions],
  );

  const followed = React.useMemo(() => topLevel.filter(isFollowed), [isFollowed, topLevel]);

  const urlMatcher = useRepositoryUrlMatcher();
  const branchPulls = useBranchTrackedPulls(changeRequests.keys);
  const trackedItems = React.useMemo((): TrackedItem[] => {
    const items: TrackedItem[] = [...branchPulls];
    for (const session of followed) {
      for (const change of getLinkedSidebarChanges(session, urlMatcher)) if (change.repository) items.push(repositoryThread('pull', change.repository));
      for (const issue of getLinkedSidebarIssues(session, urlMatcher)) {
        if (issue.source === 'repository') items.push(repositoryThread(issue.ref.thread, issue.ref));
        else if (issue.source === 'tracker') items.push(workItem(issue.provider, issue.identifier));
      }
    }
    return items;
  }, [branchPulls, followed, urlMatcher]);
  useTrackedItems(trackedItems);

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

  const projectOf = React.useCallback((session: Session) => {
    const directory = resolveGlobalSessionDirectory(session) ?? session.displayPath;
    const project = resolveProjectForSessionDirectory(projects, worktreesByProject, directory);
    return { label: projectLabel(project, directory), color: resolveProjectColor(project?.color) };
  }, [projects, worktreesByProject]);

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
