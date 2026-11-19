import React from 'react';
import { z } from 'zod';
import { toast } from '@/components/ui';
import { formatMessage, useI18nStore, type I18nKey } from '@/lib/i18n';
import { getGitLog, getGitStatus } from '@/lib/gitApi';
import { normalizePath } from '@/lib/pathNormalization';
import { isCapacitorApp } from '@/lib/platform';
import { isMobileSurfaceRuntime } from '@/lib/runtimeSurface';
import {
  hasUnmergedCommits,
  runMergedWorktreeCleanup,
  type MergedWorktreeCandidate,
  type MergedWorktreeCleanupDeps,
  type MergedWorktreeOutcome,
} from '@/lib/worktrees/mergedWorktreeCleanup';
import { getWorktreeDisplayName, removeProjectWorktree } from '@/lib/worktrees/worktreeManager';
import { archiveWorktreeWork, takeRestoredWorktree } from '@/lib/worktrees/worktreeArchive';
import { isWorktreeRemoving } from '@/lib/worktrees/worktreeRemovalState';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { getFreshestBranchStatusForDirectory, useGitHubPrStatusStore } from '@/stores/useGitHubPrStatusStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { archiveSessions, getSessionLiveActivity } from '@/sync/session-actions';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { changeRequestCopy } from '@/lib/source-control/changeRequestCopy';
import { readSourceControlProvider } from '@/lib/source-control/providers/registry';

const HANDLED_STORAGE_KEY = 'openchamber.mergedWorktreeCleanup.handled';
const HANDLED_LIMIT = 200;
const PASS_INTERVAL_MS = 60_000;
const PASS_DEBOUNCE_MS = 2_000;

const handledKey = (candidate: MergedWorktreeCandidate): string =>
  `${normalizePath(candidate.worktree.path) ?? candidate.worktree.path}#${candidate.prNumber}`;

const handledSchema = z.array(z.string());

const readHandled = (): string[] => {
  try {
    return handledSchema.safeParse(JSON.parse(getSafeStorage().getItem(HANDLED_STORAGE_KEY) ?? '[]')).data ?? [];
  } catch {
    return [];
  }
};

const writeHandled = (entries: string[]): void => {
  getSafeStorage().setItem(HANDLED_STORAGE_KEY, JSON.stringify(entries.slice(-HANDLED_LIMIT)));
};

<<<<<<< HEAD
// Linked worktrees the sidebar already knows, whose branch PR is merged. The
// PR status comes from what the sidebar keeps fresh; this asks GitHub nothing.
const listCandidates = (): MergedWorktreeCandidate[] => {
  const projects = useProjectsStore.getState().projects;
  const prState = useGitHubPrStatusStore.getState();
  const candidates: MergedWorktreeCandidate[] = [];
  for (const [projectPath, worktrees] of useSessionUIStore.getState().availableWorktreesByProject) {
||||||| bc50ba56aa
// Delays before retrying a failed archive, the last one repeating.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
// Failed archives of this app run, by handled key. A reload tries them again at once.
const failures = new Map<string, { attempts: number; retryAt: number }>();

type LinkedWorktree = { worktree: WorktreeMetadata; project: { id: string; path: string }; directory: string; branch: string };

// Linked worktrees the sidebar has discovered, in every project, collapsed ones included.
const listLinkedWorktrees = (
  projects = useProjectsStore.getState().projects,
  worktreesByProject = useSessionUIStore.getState().availableWorktreesByProject,
): LinkedWorktree[] => {
  const linked: LinkedWorktree[] = [];
  for (const [projectPath, worktrees] of worktreesByProject) {
=======
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const failures = new Map<string, { attempts: number; retryAt: number }>();

type LinkedWorktree = { worktree: WorktreeMetadata; project: { id: string; path: string }; directory: string; branch: string };

const listLinkedWorktrees = (
  projects = useProjectsStore.getState().projects,
  worktreesByProject = useSessionUIStore.getState().availableWorktreesByProject,
): LinkedWorktree[] => {
  const linked: LinkedWorktree[] = [];
  for (const [projectPath, worktrees] of worktreesByProject) {
>>>>>>> upstream/main
    const project = projects.find((entry) => normalizePath(entry.path) === projectPath);
    if (!project) continue;
    for (const worktree of worktrees) {
      const worktreePath = normalizePath(worktree.path);
      const branch = worktree.branch?.trim();
      if (!worktreePath || !branch || worktreePath === projectPath || worktree.worktreeStatus !== 'ready') continue;
      // The status the sidebar keeps fresh, read for the worktree's own directory.
      const status = getFreshestBranchStatusForDirectory(prState, worktreePath, branch);
      // Either shape of the status: a change request, or the older pull request.
      const pr = status?.changeRequest ?? status?.pr ?? null;
      if (pr?.state !== 'merged') continue;
      candidates.push({
        worktree,
        project: { id: project.id, path: project.path },
        prNumber: pr.number,
        provider: status?.changeRequest?.provider ?? null,
        mergedHeadSha: pr.headSha ?? null,
      });
    }
  }
<<<<<<< HEAD
  return candidates;
||||||| bc50ba56aa
  return linked;
};

// Linked worktrees whose branch PR is merged, by the status the sidebar and
// the background follow below keep fresh; this asks GitHub nothing itself.
const listCandidates = (): MergedWorktreeCandidate[] => {
  const prState = useGitHubPrStatusStore.getState();
  return listLinkedWorktrees().flatMap(({ worktree, project, directory, branch }) => {
    const status = getFreshestBranchStatusForDirectory(prState, directory, branch);
    const pr = status?.changeRequest ?? status?.pr;
    if (pr?.state !== 'merged') return [];
    return [{
      worktree,
      project,
      prNumber: pr.number,
      provider: status?.changeRequest?.provider ?? status?.identity?.provider ?? null,
      mergedHeadSha: pr.headSha ?? null,
    }];
  });
};

const NO_KEYS: string[] = [];

/**
 * The open PRs of every linked worktree, followed by the server while cleanup
 * is on, so a merge is seen in a project collapsed in the sidebar too. Only a
 * PR the app already knows is followed; finding a branch's first PR stays
 * with the rows on screen.
 */
const useFollowLinkedWorktreePulls = (active: boolean): void => {
  const projects = useProjectsStore((state) => state.projects);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const targets = React.useMemo(
    () => (active ? listLinkedWorktrees(projects, worktreesByProject) : []),
    [active, projects, worktreesByProject],
  );
  const keysSignature = useGitHubPrStatusStore((state) => (
    targets.length > 0 ? getBoundStatusKeysForBranches(state, targets).sort().join('\n') : ''
  ));
  const keys = React.useMemo(() => (keysSignature ? keysSignature.split('\n') : NO_KEYS), [keysSignature]);
  useTrackedItems(useBranchTrackedPulls(keys), { background: true });
=======
  return linked;
};

const listCandidates = (): MergedWorktreeCandidate[] => {
  const prState = useGitHubPrStatusStore.getState();
  return listLinkedWorktrees().flatMap(({ worktree, project, directory, branch }) => {
    const status = getFreshestBranchStatusForDirectory(prState, directory, branch);
    const pr = status?.changeRequest ?? status?.pr;
    if (pr?.state !== 'merged') return [];
    return [{
      worktree,
      project,
      prNumber: pr.number,
      provider: status?.changeRequest?.provider ?? status?.identity?.provider ?? null,
      mergedHeadSha: pr.headSha ?? null,
    }];
  });
};

const NO_KEYS: string[] = [];

const useFollowLinkedWorktreePulls = (active: boolean): void => {
  const projects = useProjectsStore((state) => state.projects);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const targets = React.useMemo(
    () => (active ? listLinkedWorktrees(projects, worktreesByProject) : []),
    [active, projects, worktreesByProject],
  );
  const keysSignature = useGitHubPrStatusStore((state) => (
    targets.length > 0 ? getBoundStatusKeysForBranches(state, targets).sort().join('\n') : ''
  ));
  const keys = React.useMemo(() => (keysSignature ? keysSignature.split('\n') : NO_KEYS), [keysSignature]);
  useTrackedItems(useBranchTrackedPulls(keys), { background: true });
>>>>>>> upstream/main
};

const report = (outcome: MergedWorktreeOutcome): void => {
  const dictionary = useI18nStore.getState().dictionary;
  const name = getWorktreeDisplayName(outcome.candidate.worktree);
  const params = { name, number: outcome.candidate.prNumber };
  const term = readSourceControlProvider(outcome.candidate.provider).terminology.changeRequest;
  const key = (base: I18nKey) => changeRequestCopy(base, term);
<<<<<<< HEAD
  if (outcome.kind === 'removed') {
    toast.success(formatMessage(dictionary, key('sessions.mergedCleanup.toast.removedTitle'), params), {
      description: formatMessage(dictionary, 'sessions.mergedCleanup.toast.removedDescription', params),
    });
  } else if (outcome.kind === 'archived') {
    toast.info(formatMessage(dictionary, key('sessions.mergedCleanup.toast.archivedTitle'), params), {
      description: formatMessage(dictionary, key('sessions.mergedCleanup.toast.archivedDescription'), params),
    });
  } else {
||||||| bc50ba56aa
  if (outcome.kind === 'archived') {
    failures.delete(handledKey(outcome.candidate));
    toast.success(formatMessage(dictionary, key('sessions.mergedCleanup.toast.archivedTitle'), params), { description: name });
  } else if (failures.get(handledKey(outcome.candidate))?.attempts === 1) {
    // Retries stay quiet: one toast per failing worktree is enough.
=======
  if (outcome.kind === 'archived') {
    failures.delete(handledKey(outcome.candidate));
    toast.success(formatMessage(dictionary, key('sessions.mergedCleanup.toast.archivedTitle'), params), { description: name });
  } else if (failures.get(handledKey(outcome.candidate))?.attempts === 1) {
>>>>>>> upstream/main
    toast.error(formatMessage(dictionary, key('sessions.mergedCleanup.toast.failedTitle'), params), {
      description: outcome.error.message,
    });
  }
};

const createDeps = (): MergedWorktreeCleanupDeps => {
  const handled = new Set(readHandled());
  return {
    listCandidates,
    isHandled: (candidate) => handled.has(handledKey(candidate)),
    markHandled: (candidate) => {
      handled.add(handledKey(candidate));
      writeHandled([...handled]);
    },
    getActiveSessions: () => useGlobalSessionsStore.getState().activeSessions,
    // "unknown" is not idle: without a live status answer the agent may be running.
    isSessionIdle: (sessionId) => getSessionLiveActivity(sessionId) === 'idle',
    isWorktreeOpen: (path) => normalizePath(useDirectoryStore.getState().currentDirectory ?? null) === normalizePath(path),
    isSessionOpen: (sessionId) => useSessionUIStore.getState().currentSessionId === sessionId,
    isWorktreeRemoving,
    takeRestored: takeRestoredWorktree,
    readWorktreeState: async (candidate) => {
      const path = candidate.worktree.path;
      const status = await getGitStatus(path, { fresh: true });
      return {
        isDirty: !status.isClean,
        hasUnmergedCommits: await hasUnmergedCommits({
          mergedHeadSha: candidate.mergedHeadSha,
          status,
          hasCommitsAfter: async (sha) => (await getGitLog(path, { from: sha, to: 'HEAD', maxCount: 1 })).all.length > 0,
        }),
      };
    },
    archiveSessions: (sessionIds) => archiveSessions(sessionIds),
    removeWorktree: (candidate) => removeProjectWorktree(candidate.project, candidate.worktree, { deleteLocalBranch: true }),
    archiveWorktree: async (candidate, sessions) => {
<<<<<<< HEAD
      await archiveWorktreeWork({ project: candidate.project, worktree: candidate.worktree, sessions });
||||||| bc50ba56aa
      // A background pass never opens the trust prompt.
      await archiveWorktreeWork({ project: candidate.project, worktree: candidate.worktree, sessions, askForTrust: false });
=======
      await archiveWorktreeWork({ project: candidate.project, worktree: candidate.worktree, sessions, askForTrust: false });
>>>>>>> upstream/main
    },
    report,
  };
};

<<<<<<< HEAD
/**
 * Archives a worktree's sessions once its PR is merged, and removes the
 * worktree with its local branch when nothing there can be lost. Opt-in
 * (`mergedWorktreeCleanupEnabled`). Runs on desktop and web only: a phone
 * would race the desktop it drives for the same worktree.
 */
||||||| bc50ba56aa
/**
 * Archives a worktree with its sessions once its PR is merged, when nobody
 * works there. Opt-in
 * (`mergedWorktreeCleanupEnabled`). Runs on desktop and web only: VS Code has
 * no worktrees, and a phone would race the desktop it drives for the same
 * worktree.
 */
=======
>>>>>>> upstream/main
export const useMergedWorktreeCleanup = ({ enabled }: { enabled: boolean }): void => {
  const settingEnabled = useUIStore((state) => state.mergedWorktreeCleanupEnabled);
  const active = enabled && settingEnabled && !isCapacitorApp() && !isMobileSurfaceRuntime();

  React.useEffect(() => {
    if (!active) return;
    let disposed = false;
    let running = false;
    let rerun: { recheckKept: boolean } | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const pass = async (options: { recheckKept: boolean }) => {
      if (running) {
        rerun = { recheckKept: options.recheckKept || Boolean(rerun?.recheckKept) };
        return;
      }
      running = true;
      try {
        await runMergedWorktreeCleanup(createDeps(), options);
      } catch (error) {
        console.warn('[MergedWorktreeCleanup] pass failed', error);
      } finally {
        running = false;
      }
      const next = rerun;
      rerun = null;
      if (next && !disposed) void pass(next);
    };
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (!disposed) void pass({ recheckKept: false });
      }, PASS_DEBOUNCE_MS);
    };

    const unsubscribePr = useGitHubPrStatusStore.subscribe((state, previous) => {
      if (state.entries !== previous.entries) schedule();
    });
    const unsubscribeUi = useSessionUIStore.subscribe((state, previous) => {
      if (state.currentSessionId !== previous.currentSessionId
        || state.availableWorktreesByProject !== previous.availableWorktreesByProject) schedule();
    });
<<<<<<< HEAD
    // Kept worktrees change by hand (a pull, a cleanup), which no event reports.
    const interval = setInterval(() => void pass({ recheckKept: true }), PASS_INTERVAL_MS);
    void pass({ recheckKept: true });
||||||| bc50ba56aa
    // An agent going idle is no event here; a periodic pass catches it.
    const interval = setInterval(() => void pass(), PASS_INTERVAL_MS);
    void pass();
=======
    const interval = setInterval(() => void pass(), PASS_INTERVAL_MS);
    void pass();
>>>>>>> upstream/main

    return () => {
      disposed = true;
      unsubscribePr();
      unsubscribeUi();
      clearInterval(interval);
      if (debounce) clearTimeout(debounce);
    };
  }, [active]);
};
