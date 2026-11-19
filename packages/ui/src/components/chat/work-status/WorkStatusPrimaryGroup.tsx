import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useGitStore } from '@/stores/useGitStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useNestedGitDirectory } from '@/hooks/useNestedGitDirectory';
import { useWorktreeBootstrapPending } from '@/hooks/useWorktreeBootstrapPending';
import { runBackgroundNetworkTask } from '@/lib/background-network';
import { useFreshestSourceControlVisualSummaryForBranch } from '@/stores/useGitHubPrStatusStore';
import { useSessionMessages } from '@/sync/sync-context';
import { useContextWindowLimits } from '@/hooks/useContextWindowLimits';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveUsageTone } from '@/lib/quota';
import { sessionEvents } from '@/lib/sessionEvents';
import { normalizePath } from '@/lib/pathNormalization';
import { computeContextUsage } from './contextUsage';
import { formatCost } from './subagentCost';
import { useSubagentCostRollup } from './useSubagentCostRollup';
import {
  WorkStatusCallout,
  WorkStatusMeter,
  WorkStatusPill,
  WorkStatusRow,
  WorkStatusSection,
  WorkStatusValue,
} from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import { changeRequestCopy } from '@/lib/source-control/changeRequestCopy';
<<<<<<< HEAD
import { formatChangeRequestReference } from '@/lib/source-control/identity';
||||||| bc50ba56aa
import { formatChangeRequestReference } from '@/lib/source-control/providers/terminology';
import { useSourceControlProvider } from '@/lib/source-control/providers/registry';
import { PrChecksValue } from './PrChecksValue';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { useOpenTrackerItem } from '@/components/sourceBoard/openTrackerItem';
import { useLeaveWorkStatus } from './leaveWorkStatus';
import { prChecksTooltip } from './prChecks';
=======
import { formatChangeRequestReference } from '@/lib/source-control/providers/terminology';
import { useSourceControlProvider } from '@/lib/source-control/providers/registry';
import { PrChecksValue } from './PrChecksValue';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { useOpenTrackerItem } from '@/components/sourceBoard/openTrackerItem';
import { useLeaveWorkStatus } from './leaveWorkStatus';
import { prChecksTooltip } from './prChecks';
import { resolvePrRowTarget } from './prRowTarget';
import { isVSCodeRuntime } from '@/lib/desktop';
import { openExternalUrl } from '@/lib/url';
import { DiffCount } from '@/components/ui/diff-count';
>>>>>>> upstream/main

type Props = {
  sessionId: string | null;
  directory: string | null;
  goalRow: React.ReactNode;
  showSession: boolean;
  showRepository: boolean;
  children: (sections: { session: React.ReactNode; repository: React.ReactNode }) => React.ReactNode;
};

const formatPercent = (percent: number): string => `${Math.min(percent, 999).toFixed(1)}%`;
const UNKNOWN_PERCENT = '\u2014';

export const WorkStatusPrimaryGroup: React.FC<Props> = ({ sessionId, directory, goalRow, showSession, showRepository, children }) => {
  const { t } = useI18n();
<<<<<<< HEAD
||||||| bc50ba56aa
  // On the phone the rows lead to the phone's own pages.
  const mobile = useMobileAppActions();
  const leaveWorkStatus = useLeaveWorkStatus();
  const openTrackerItem = useOpenTrackerItem();
=======
  const mobile = useMobileAppActions();
  const isVSCode = isVSCodeRuntime();
  const leaveWorkStatus = useLeaveWorkStatus();
  const openTrackerItem = useOpenTrackerItem();
>>>>>>> upstream/main
  const { git } = useRuntimeAPIs();
  const ensureStatus = useGitStore((state) => state.ensureStatus);
  const fetchStatus = useGitStore((state) => state.fetchStatus);
  const clearDiffCache = useGitStore((state) => state.clearDiffCache);

<<<<<<< HEAD
  // The repository the readouts describe. Same resolution as the Git tab: the
  // session directory itself when it is a repository, otherwise the nested
  // repository selected (or auto-selected) for it, so a session in a plain
  // folder of repositories still reports the branch and changes the Git tab
  // shows. Navigation below stays keyed on `directory` — context-panel tabs
  // are per project root.
  const { gitDirectory } = useNestedGitDirectory(directory, { enabled: showRepository });
||||||| bc50ba56aa
  // The repository the readouts describe. Same resolution as the Git tab: the
  // session directory itself when it is a repository, otherwise the nested
  // repository selected (or auto-selected) for it, so a session in a plain
  // folder of repositories still reports the branch and changes the Git tab
  // shows. Navigation below stays keyed on `directory` — context-panel tabs
  // are per project root.
  // A draft waiting for a new space reads the space's tree once it runs, and
  // none while it is made, as the other panels do (`panelContentDirectory`).
  const draftSpace = useDraftSpaceTarget();
  const repositoryDirectory = sessionId ? directory : panelContentDirectory(draftSpace, directory);
  const { gitDirectory } = useNestedGitDirectory(repositoryDirectory, { enabled: showRepository });
=======
  const draftSpace = useDraftSpaceTarget();
  const repositoryDirectory = sessionId ? directory : panelContentDirectory(draftSpace, directory);
  const { gitDirectory } = useNestedGitDirectory(repositoryDirectory, { enabled: showRepository });
>>>>>>> upstream/main

  const gitStatus = useGitStore(
    React.useCallback(
      (state) => (gitDirectory ? state.directories.get(gitDirectory)?.status ?? null : null),
      [gitDirectory],
    ),
  );

  const worktreeCreationPending = useWorktreeBootstrapPending(gitDirectory);
  const [postBootstrapRefreshDirectory, setPostBootstrapRefreshDirectory] = React.useState<string | null>(null);
  const awaitingPostBootstrapStatus = postBootstrapRefreshDirectory !== null
    && postBootstrapRefreshDirectory === gitDirectory;

  React.useEffect(() => {
    if (!showRepository || !gitDirectory || !git) return;
    if (worktreeCreationPending) {
      setPostBootstrapRefreshDirectory(gitDirectory);
      return;
    }
    if (awaitingPostBootstrapStatus) {
      let cancelled = false;
      void runBackgroundNetworkTask(() => fetchStatus(gitDirectory, git, {
        force: true,
        silent: true,
        throwOnError: true,
      }))
        .then(() => {
          if (!cancelled) {
            setPostBootstrapRefreshDirectory((current) => (current === gitDirectory ? null : current));
          }
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }
    void runBackgroundNetworkTask(() => ensureStatus(gitDirectory, git));
  }, [gitDirectory, git, ensureStatus, fetchStatus, showRepository, worktreeCreationPending, awaitingPostBootstrapStatus]);

  React.useEffect(() => {
    if (!showRepository || !gitDirectory || !git) return;
    return sessionEvents.onGitRefreshHint((hint) => {
      if (normalizePath(hint.directory) !== normalizePath(gitDirectory)) return;
      if (hint.paths?.length) {
        clearDiffCache(gitDirectory, hint.paths);
      }
      void fetchStatus(gitDirectory, git, { silent: true });
    });
  }, [clearDiffCache, gitDirectory, fetchStatus, git, showRepository]);

  const branch = gitStatus?.current?.trim() || null;

  const nestedRepoLabel = React.useMemo(() => {
    if (!directory || !gitDirectory || gitDirectory === directory) return null;
    const rootPrefix = `${directory}/`;
    return gitDirectory.startsWith(rootPrefix) ? gitDirectory.slice(rootPrefix.length) : gitDirectory;
  }, [directory, gitDirectory]);

  const availableWorktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
<<<<<<< HEAD
  // Worktrees normally sit beside rather than beneath their project directory,
  // so a prefix match alone cannot find their owning project. Reuse the shared
  // session-directory resolver, which consults the discovered worktree map.
||||||| bc50ba56aa
  // Worktrees normally sit beside rather than beneath their project directory,
  // so a prefix match alone cannot find their owning project. Reuse the shared
  // session-directory resolver, which consults the discovered worktree map.
  const spaceProjectDirectory = useSpaceProjectDirectory(directory);
=======
  const spaceProjectDirectory = useSpaceProjectDirectory(directory);
>>>>>>> upstream/main
  const projectLabel = useProjectsStore(
    React.useCallback((state) => {
      const project = resolveProjectForSessionDirectory(
        state.projects,
        availableWorktreesByProject,
        directory,
      );
      if (!project) return null;
      return project.label?.trim()
        || project.path.split('/').filter(Boolean).pop()
        || project.path;
    }, [availableWorktreesByProject, directory]),
  );

  const prSummary = useFreshestSourceControlVisualSummaryForBranch(gitDirectory, branch);

  const sessionMessages = useSessionMessages(sessionId ?? '', directory ?? undefined);
  const { context: contextLimit } = useContextWindowLimits(sessionId, directory ?? undefined);

  const contextUsage = React.useMemo(
    () => computeContextUsage(sessionMessages, contextLimit),
    [sessionMessages, contextLimit],
  );

<<<<<<< HEAD
||||||| bc50ba56aa
  // What the provider caches right now, from the reply the context reading comes from.
  const lastReplyCacheHit = React.useMemo(() => computeLastReplyCacheHit(sessionMessages), [sessionMessages]);

=======
  const lastReplyCacheHit = React.useMemo(() => computeLastReplyCacheHit(sessionMessages), [sessionMessages]);

>>>>>>> upstream/main
  const openContextSurface = useUIStore((state) => state.openContextSurface);
  const openContextOverview = useUIStore((state) => state.openContextOverview);
  const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);
  const openSurface = React.useCallback(
<<<<<<< HEAD
    (mode: 'git' | 'pr') => { if (directory) openContextSurface(directory, mode); },
    [directory, openContextSurface],
||||||| bc50ba56aa
    (mode: 'git' | 'pr') => {
      if (!directory) return;
      if (mobile) {
        // The phone's Changes tab holds the branch; the board shows the PR.
        if (mode === 'git') mobile.openChanges();
        else if (prUrl) {
          openTrackerItem(prUrl, directory);
          leaveWorkStatus?.();
        }
        return;
      }
      // The branch's pull request is the Tracker's branch tab, whichever item tab was last in front.
      if (mode === 'pr') openContextPanelTab(directory, { mode: 'pr' });
      else openContextSurface(directory, mode);
    },
    [directory, leaveWorkStatus, mobile, openContextPanelTab, openContextSurface, openTrackerItem, prUrl],
=======
    (mode: 'git' | 'pr') => {
      if (!directory) return;
      if (isVSCode) {
        if (mode === 'pr' && prUrl) void openExternalUrl(prUrl);
        return;
      }
      if (mobile) {
        if (mode === 'git') mobile.openChanges();
        else if (prUrl) {
          openTrackerItem(prUrl, directory);
          leaveWorkStatus?.();
        }
        return;
      }
      if (mode === 'pr') openContextPanelTab(directory, { mode: 'pr' });
      else openContextSurface(directory, mode);
    },
    [directory, isVSCode, leaveWorkStatus, mobile, openContextPanelTab, openContextSurface, openTrackerItem, prUrl],
>>>>>>> upstream/main
  );
<<<<<<< HEAD
  // Working-tree diff without a target path: the panel opens on the whole
  // change set rather than picking a file on the user's behalf.
  // Same destination as the header's context readout.
||||||| bc50ba56aa
  // The phone opens the PR by its link on the board; without one there is nowhere to go.
  const openPr = directory && (!mobile || prUrl) ? () => openSurface('pr') : undefined;
  // Working-tree diff without a target path: the panel opens on the whole
  // change set rather than picking a file on the user's behalf.
  // Same destination as the header's context readout.
=======
  const openPr = resolvePrRowTarget({ directory, prUrl, mobile: Boolean(mobile), vscode: isVSCode })
    ? () => openSurface('pr')
    : undefined;
>>>>>>> upstream/main
  const openContext = React.useCallback(() => {
    if (directory) openContextOverview(directory);
  }, [directory, openContextOverview]);

  const openChanges = React.useCallback(() => {
    if (directory) openContextPanelTab(directory, { mode: 'diff', diffScope: 'working' });
  }, [directory, openContextPanelTab]);

  const changed = React.useMemo(() => {
    if (worktreeCreationPending || awaitingPostBootstrapStatus) return null;
    const files = gitStatus?.files ?? [];
    if (files.length === 0) return null;
    const stats = gitStatus?.diffStats;
    let additions = 0;
    let deletions = 0;
    if (stats) {
      for (const entry of [...Object.values(stats.staged ?? {}), ...Object.values(stats.working ?? {})]) {
        additions += entry?.insertions ?? 0;
        deletions += entry?.deletions ?? 0;
      }
    }
    return { files: files.length, additions, deletions, hasStats: Boolean(stats) };
  }, [gitStatus?.files, gitStatus?.diffStats, worktreeCreationPending, awaitingPostBootstrapStatus]);

  const attentionReason = gitStatus?.attentionReason
    ?? (gitStatus?.rebaseInProgress ? 'rebase' : null)
    ?? (gitStatus?.mergeInProgress ? 'merge' : null);
  const attentionLabel = attentionReason === 'merge' ? t('chat.workStatus.attention.merge')
    : attentionReason === 'rebase' ? t('chat.workStatus.attention.rebase')
      : attentionReason === 'cherry-pick' ? t('chat.workStatus.attention.cherryPick')
        : attentionReason === 'revert' ? t('chat.workStatus.attention.revert')
          : attentionReason === 'bisect' ? t('chat.workStatus.attention.bisect')
            : null;

  const usagePercent = contextUsage?.state === 'measured' ? contextUsage.percent : null;
  const usageTone = usagePercent === null ? null : resolveUsageTone(Math.round(usagePercent));
  const meterColor = usageTone === 'critical' ? 'var(--status-error)'
    : usageTone === 'warn' ? 'var(--status-warning)'
      : 'var(--muted-foreground)';

  const { totalCost, ownCost, subagentCost, subagentCount } = useSubagentCostRollup(sessionId);
  const cost = totalCost !== null && totalCost > 0 ? totalCost : null;
  const showCostBreakdown = cost !== null && subagentCount > 0 && subagentCost > 0;
  const hasSession = showSession && (contextUsage !== null || cost !== null || Boolean(goalRow));
  const hasRepository = showRepository && Boolean(branch || changed || prSummary || attentionLabel);

  useReportWorkStatusPresence('session-repository', hasSession || hasRepository);

  return children({
      session: hasSession ? (
        <WorkStatusSection title={t('chat.workStatus.section.session')} icon="chat-4">
          {contextUsage !== null ? (
            <>
              <WorkStatusRow
                icon="donut-chart"
<<<<<<< HEAD
                onClick={directory ? openContext : undefined}
||||||| bc50ba56aa
                // The context overview is a desktop panel; the phone has none.
                onClick={directory && !mobile ? openContext : undefined}
=======
                onClick={directory && !mobile && !isVSCode ? openContext : undefined}
>>>>>>> upstream/main
                ariaLabel={t('chat.workStatus.action.openContext')}
                label={t('chat.workStatus.context.label')}
                value={(
                  <>
<<<<<<< HEAD
                    <WorkStatusValue>{usagePercent !== null ? formatPercent(usagePercent) : UNKNOWN_PERCENT}</WorkStatusValue>
                    {/* No icon of its own: the sprite has no currency glyph, and
                        spend belongs with consumption anyway. The `$` labels it. */}
                    {cost !== null ? <WorkStatusValue tone="muted">{formatCost(cost)}</WorkStatusValue> : null}
||||||| bc50ba56aa
                    {/* Keeping the cache warm is about this context, so its switch sits on the row. */}
                    <WorkStatusWarmingToggle sessionId={sessionId} directory={directory} />
                    <WorkStatusValue>{usagePercent !== null ? formatPercent(usagePercent) : UNKNOWN_PERCENT}</WorkStatusValue>
                    {/* No icon of its own: the sprite has no currency glyph, and
                        spend belongs with consumption anyway. The `$` labels it. */}
                    {cost !== null ? <WorkStatusValue tone="muted">{formatCost(cost)}</WorkStatusValue> : null}
=======
                    <WorkStatusWarmingToggle sessionId={sessionId} directory={directory} />
                    <WorkStatusValue>
                      {`${usagePercent !== null ? formatPercent(usagePercent) : UNKNOWN_PERCENT}${cost !== null ? ` · ${formatCost(cost)}` : ''}`}
                    </WorkStatusValue>
>>>>>>> upstream/main
                  </>
                )}
              />
              <WorkStatusMeter percent={usagePercent ?? 0} color={meterColor} />
              {contextUsage.state === 'compacted' ? (
<<<<<<< HEAD
                <p className="mx-1 mb-1 text-[11px] leading-4 text-muted-foreground">
                  {t('contextUsage.compacted.description')}
                </p>
||||||| bc50ba56aa
                <WorkStatusNote>{t('contextUsage.compacted.description')}</WorkStatusNote>
=======
                <WorkStatusNote tooltip={t('contextUsage.compacted.description')}>{t('contextUsage.compacted.short')}</WorkStatusNote>
>>>>>>> upstream/main
              ) : null}
              {showCostBreakdown ? (
                <p className="mx-1 mb-1 truncate text-[11px] leading-4 text-muted-foreground tabular-nums">
                  {t('chat.workStatus.cost.breakdown', {
                    session: formatCost(ownCost),
                    subagents: formatCost(subagentCost),
                  })}
                </p>
              ) : null}
            </>
          ) : null}
<<<<<<< HEAD
          {/* Below the context readout: the goal is a standing instruction,
              while context is the live number the reader came for. */}
||||||| bc50ba56aa
          {/* Under the meter, from the same reply, so it reads as the cache right now. */}
          {lastReplyCacheHit !== null ? (
            <WorkStatusRow
              muted
              label={t('contextSidebar.tokens.cacheHit')}
              value={<WorkStatusValue>{`${lastReplyCacheHit.toFixed(1)}%`}</WorkStatusValue>}
            />
          ) : null}
          {/* Below the context readout: the goal is a standing instruction,
              while context is the live number the reader came for. */}
=======
          {lastReplyCacheHit !== null ? (
            <WorkStatusRow
              icon="database-2"
              label={t('chat.workStatus.replyCacheHit')}
              value={<WorkStatusValue>{`${lastReplyCacheHit.toFixed(1)}%`}</WorkStatusValue>}
            />
          ) : null}
>>>>>>> upstream/main
          {goalRow}
        </WorkStatusSection>
      ) : null,

      repository: hasRepository ? (
        <WorkStatusSection
          title={t('chat.workStatus.section.project')}
<<<<<<< HEAD
          summary={projectLabel}
||||||| bc50ba56aa
          subject={projectLabel}
=======
          icon="folder"
          subject={projectLabel}
>>>>>>> upstream/main
        >
          {attentionLabel ? <WorkStatusCallout>{attentionLabel}</WorkStatusCallout> : null}

          {branch ? (
            <WorkStatusRow
              icon="git-branch"
              onClick={directory && !isVSCode ? () => openSurface('git') : undefined}
              ariaLabel={t('chat.workStatus.action.openGit')}
              label={branch}
              value={(gitStatus?.ahead ?? 0) > 0 || (gitStatus?.behind ?? 0) > 0 ? (
                <>
                  {(gitStatus?.ahead ?? 0) > 0
                    ? <WorkStatusValue tone="muted">{`↑${gitStatus?.ahead}`}</WorkStatusValue> : null}
                  {(gitStatus?.behind ?? 0) > 0
                    ? <WorkStatusValue tone="muted">{`↓${gitStatus?.behind}`}</WorkStatusValue> : null}
                </>
              ) : undefined}
            />
          ) : null}

          {nestedRepoLabel ? (
            <WorkStatusRow
              icon="folder"
              onClick={directory && !isVSCode ? () => openSurface('git') : undefined}
              ariaLabel={t('chat.workStatus.action.openGit')}
              label={nestedRepoLabel}
              muted
            />
          ) : null}

          {changed ? (
            <WorkStatusRow
              icon="file-edit"
              onClick={directory && !isVSCode ? openChanges : undefined}
              ariaLabel={t('chat.workStatus.action.openChanges')}
              label={changed.files === 1
                ? t('chat.workStatus.git.changedFileSingle', { count: changed.files })
                : t('chat.workStatus.git.changedFilePlural', { count: changed.files })}
              value={changed.hasStats && (changed.additions > 0 || changed.deletions > 0) ? (
                <DiffCount added={changed.additions} removed={changed.deletions} />
              ) : undefined}
            />
          ) : null}

          {prSummary ? (
            <>
              <WorkStatusRow
                icon="git-pull-request"
                onClick={directory ? () => openSurface('pr') : undefined}
                ariaLabel={t(changeRequestCopy('chat.workStatus.action.openPr', prSummary.provider))}
                iconColor={`var(--pr-${prSummary.visualState})`}
                label={prSummary.title ?? t(changeRequestCopy('chat.workStatus.pr.untitled', prSummary.provider))}
                value={(
                  <WorkStatusPill
                    color={`var(--pr-${prSummary.visualState})`}
                    background={`color-mix(in srgb, var(--pr-${prSummary.visualState}) 18%, transparent)`}
                  >
                    {prSummary.draft ? t('chat.workStatus.pr.draft') : formatChangeRequestReference(prSummary.provider, prSummary.number)}
                  </WorkStatusPill>
                )}
              />
              {prSummary.checks && prSummary.checks.total > 0 ? (
                <WorkStatusRow
                  icon="checkbox-circle"
                  onClick={directory ? () => openSurface('pr') : undefined}
                  ariaLabel={t(changeRequestCopy('chat.workStatus.action.openPr', prSummary.provider))}
                  label={t('chat.workStatus.pr.checks')}
                  muted
                  value={(
                    <>
                      {prSummary.checks.failure > 0 ? (
                        <WorkStatusValue tone="error">
                          {t('chat.workStatus.pr.checksFailed', { count: prSummary.checks.failure })}
                        </WorkStatusValue>
                      ) : null}
                      {prSummary.checks.pending > 0 ? (
                        <WorkStatusValue tone="warning">
                          {t('chat.workStatus.pr.checksPending', { count: prSummary.checks.pending })}
                        </WorkStatusValue>
                      ) : null}
                      {prSummary.checks.failure === 0 && prSummary.checks.pending === 0 ? (
                        <WorkStatusValue tone="success">
                          {t('chat.workStatus.pr.checksPassed', { count: prSummary.checks.success })}
                        </WorkStatusValue>
                      ) : null}
                    </>
                  )}
                />
              ) : null}
            </>
          ) : null}
        </WorkStatusSection>
      ) : null,
  });
};
