import { useOutsideRepository } from '@/components/sourceBoard/useOutsideRepository';
import { useEffectiveGitDirectory } from '@/stores/useGitStore';
import { useGitStore } from '@/stores/useGitStore';
import { useFreshestSourceControlVisualSummaryForBranch } from '@/stores/useGitHubPrStatusStore';
import { useCopyReferenceLink } from '@/components/references/useCopyReferenceLink';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/icon/Icon';
import { selectAvailableSkillsForDirectory, selectSkillsForDirectory, useSkillsStore } from '@/stores/useSkillsStore';
import { isMcpServerConnected, useMcpStore } from '@/stores/useMcpStore';
import { useSession, useSessionMessagesSelector } from '@/sync/sync-context';
import { sameLoadedSkills } from './loadedSkills';
import { getDistinctLinkedIssues, getLinkedSidebarChanges, getLinkedSidebarIssues, getRepositoryThreadRef, isLinkedChange, type LinkedIssue } from '@/lib/linkedIssues';
import { useRepositoryUrlMatcher } from '@/lib/source-control/repositoryUrlMatcher';
import { formatChangeRequestReference } from '@/lib/source-control/providers/terminology';
import type { ChangeRequestTerm } from '@/lib/source-control/providers/descriptor';
import { useTrackedIssueStates, useTrackedPullVisualSummaries, useTrackedWorkItemStates } from '@/stores/useTrackedItemsStore';
import { useTrackedItems } from '@/lib/trackedItems/interest';
import { repositoryThread, workItem } from '@/lib/trackedItems/fromLinks';
import { trackerPresentation } from '@/lib/trackers/presentation';
import { useTrackerDescriptors } from '@/lib/trackers/registry';
import { getPrStatusLabel } from '@/components/session/sidebar/prStatusLabel';
import { getIssueStateLook, getTrackerItemStateLook } from '@/components/session/sidebar/sessions/sessionPrSummaries';
import { fetchSessionKnowledgeSummary, setSessionProjectContextPin, type SessionKnowledgeSummary } from '@/lib/sessionKnowledgeApi';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
import { resolveProjectContextId } from '@/lib/projectContextApi';
import { useConfigStore } from '@/stores/useConfigStore';
import { useOpenTrackerItem } from '@/components/sourceBoard/openTrackerItem';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import { resolveDraftPinnedKnowledge } from './draftKnowledge';
import { changeRequestCopy } from '@/lib/source-control/changeRequestCopy';
import { refTintStyle } from '@/lib/source-control/prVisualState';
import { cn } from '@/lib/utils';


type Props = {
  sessionId: string | null;
  directory: string | null;
};

const LinkedReference: React.FC<{ reference: string; status?: string | null; url: string; directory: string | null }> = ({ reference, status, url, directory }) => {
  const repository = useOutsideRepository(url, directory);
  return <>{[reference, repository, status].filter(Boolean).join(' · ')}</>;
};

export const WorkStatusContextSection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();

  const session = useSession(sessionId ?? '', directory ?? undefined);
  const newSessionDraft = useSessionUIStore((state) => state.newSessionDraft);
  const setDraftProjectContextPin = useSessionUIStore((state) => state.setDraftProjectContextPin);
  const availableWorktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const projects = useProjectsStore((state) => state.projects);
  const isDraft = sessionId === null && newSessionDraft.open;
  const skills = useSkillsStore((state) => selectAvailableSkillsForDirectory(state, directory));
  const installedSkills = useSkillsStore((state) => selectSkillsForDirectory(state, directory));
  const loadedSkills = useSessionMessagesSelector(sessionId ?? '', directory ?? undefined, selectSessionLoadedSkills, sameLoadedSkills, true);
  const mcpStatus = useMcpStore(
    React.useCallback((state) => state.getStatusForDirectory(directory), [directory]),
  );

  const loadSkills = useSkillsStore((state) => state.loadSkills);
  const isConnected = useConfigStore((state) => state.isConnected);
  React.useEffect(() => {
    void loadSkills(directory);
    if (directory) void loadSkills(directory);
  }, [directory, isConnected, loadSkills]);

  const [knowledge, setKnowledge] = React.useState<SessionKnowledgeSummary>(
    { notes: [], plans: [] },
  );

  const contextEntries = useProjectContextStore((state) => state.entries);
  const loadProjectContext = useProjectContextStore((state) => state.load);

  const draftProject = React.useMemo(() => {
    if (!isDraft) return null;
    const selected = newSessionDraft.selectedProjectId
      ? projects.find((project) => project.id === newSessionDraft.selectedProjectId) ?? null
      : null;
    return selected ?? resolveProjectForSessionDirectory(
      projects,
      availableWorktreesByProject,
      newSessionDraft.directoryOverride ?? directory,
    );
  }, [availableWorktreesByProject, directory, isDraft, newSessionDraft.directoryOverride, newSessionDraft.selectedProjectId, projects]);

  const draftContextEntry = draftProject
    ? contextEntries[resolveProjectContextId({ id: draftProject.id, path: draftProject.path })]
    : undefined;

  React.useEffect(() => {
    if (!isDraft || !draftProject) return;
    void loadProjectContext({ id: draftProject.id, path: draftProject.path });
  }, [draftProject, isDraft, loadProjectContext]);

  const openchamberMetadataKey = JSON.stringify(session?.metadata?.openchamber ?? null);
  React.useEffect(() => {
    let cancelled = false;
    void fetchSessionKnowledgeSummary(directory, sessionId).then((summary) => {
      if (!cancelled) setKnowledge(summary);
    });
    return () => { cancelled = true; };
  }, [directory, sessionId, openchamberMetadataKey, contextEntries]);

  const visibleKnowledge = React.useMemo<SessionKnowledgeSummary>(() => {
    if (!isDraft) return knowledge;
    const pinned = resolveDraftPinnedKnowledge(
      draftContextEntry?.notes ?? [],
      draftContextEntry?.plans ?? [],
      newSessionDraft.projectContextPins ?? { notes: [], plans: [] },
    );
    return { ...knowledge, ...pinned };
  }, [draftContextEntry?.notes, draftContextEntry?.plans, isDraft, knowledge, newSessionDraft.projectContextPins]);

  const unpinNote = React.useCallback((noteId: string) => {
    if (isDraft) {
      setDraftProjectContextPin('note', noteId, false);
      return;
    }
    if (!directory || !sessionId) return;
    void setSessionProjectContextPin(directory, sessionId, 'note', noteId, false).then((pins) => {
      if (pins) setKnowledge((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== noteId) }));
    });
  }, [directory, isDraft, sessionId, setDraftProjectContextPin]);
  const unpinPlan = React.useCallback((planId: string) => {
    if (isDraft) {
      setDraftProjectContextPin('plan', planId, false);
      return;
    }
    if (!directory || !sessionId) return;
    void setSessionProjectContextPin(directory, sessionId, 'plan', planId, false).then((pins) => {
      if (pins) setKnowledge((current) => ({ ...current, plans: current.plans.filter((plan) => plan.id !== planId) }));
    });
  }, [directory, isDraft, sessionId, setDraftProjectContextPin]);

  const pinnedCount = visibleKnowledge.notes.length + visibleKnowledge.plans.length;

  const urlMatcher = useRepositoryUrlMatcher();
  const linked = React.useMemo(() => getDistinctLinkedIssues(session, urlMatcher), [session, urlMatcher]);
  const repositoryChanges = React.useMemo(
    () => getLinkedSidebarChanges(session, urlMatcher).flatMap((change) => (
      change.repository ? [{ ref: change.repository, item: repositoryThread('pull', change.repository), url: change.url, title: change.title }] : []
    )),
    [session, urlMatcher],
  );
  const linkedSidebarIssues = React.useMemo(() => getLinkedSidebarIssues(session, urlMatcher), [session, urlMatcher]);
  const repositoryIssueRefs = React.useMemo(
    () => linkedSidebarIssues.flatMap((issue) => (issue.source === 'repository' ? [issue.ref] : [])),
    [linkedSidebarIssues],
  );
  const repositoryIssueItems = React.useMemo(() => repositoryIssueRefs.map((ref) => repositoryThread(ref.thread, ref)), [repositoryIssueRefs]);
  const linkedTrackerEntries = React.useMemo(
    () => linkedSidebarIssues.flatMap((issue) => (issue.source === 'tracker' ? [{ key: issue.key, identifier: issue.identifier, item: workItem(issue.provider, issue.identifier) }] : [])),
    [linkedSidebarIssues],
  );
  const linkedWorkItems = React.useMemo(() => linkedTrackerEntries.map((entry) => entry.item), [linkedTrackerEntries]);
  const trackedItems = React.useMemo(() => [
    ...repositoryChanges.map((link) => link.item),
    ...repositoryIssueItems,
    ...linkedWorkItems,
  ], [linkedWorkItems, repositoryChanges, repositoryIssueItems]);
  useTrackedItems(trackedItems);
  const changeSummaries = useTrackedPullVisualSummaries(repositoryChanges);
  const repositoryIssueStates = useTrackedIssueStates(repositoryIssueItems);
  const linkedWorkItemStates = useTrackedWorkItemStates(linkedWorkItems);
  const gitDirectory = useEffectiveGitDirectory(directory);
  const branch = useGitStore(React.useCallback(
    (state) => (gitDirectory ? state.directories.get(gitDirectory)?.status?.current?.trim() || null : null),
    [gitDirectory],
  ));
  const branchPrSummary = useFreshestSourceControlVisualSummaryForBranch(gitDirectory, branch);
  const liveLookById = React.useMemo(() => {
    const looks = new Map<string, { color: string; text: string }>();
    repositoryChanges.forEach(({ ref }, index) => {
      const summary = changeSummaries[index];
      if (!summary) return;
      const descriptor = urlMatcher.descriptorOf(ref.provider);
      const reference = formatChangeRequestReference(descriptor, ref.number);
      const label = getPrStatusLabel(summary, descriptor.terminology.changeRequest, t);
      looks.set(ref.key, { color: `var(--pr-${summary.visualState})`, text: label ? `${reference} · ${label}` : reference });
    });
    repositoryIssueRefs.forEach((ref, index) => {
      const state = repositoryIssueStates[index];
      if (!state) return;
      const look = getIssueStateLook(state.state);
      const identifier = `${urlMatcher.descriptorOf(ref.provider).terminology.issuePrefix}${ref.number}`;
      looks.set(ref.key, { color: look.color, text: `${identifier} · ${t(look.statusKey)}` });
    });
    linkedTrackerEntries.forEach(({ key, identifier }, index) => {
      const state = linkedWorkItemStates[index];
      if (!state) return;
      looks.set(key.toLowerCase(), {
        color: getTrackerItemStateLook(state.state.category).color,
        text: `${identifier} · ${state.state.name}`,
      });
    });
    return looks;
  }, [changeSummaries, linkedTrackerEntries, linkedWorkItemStates, repositoryChanges, repositoryIssueRefs, repositoryIssueStates, t, urlMatcher]);
  const openTrackerItem = useOpenTrackerItem();
  const copyLink = useCopyReferenceLink();
  const trackerDescriptors = useTrackerDescriptors();
  const mcpCount = React.useMemo(
    () => Object.values(mcpStatus ?? {}).filter(isMcpServerConnected).length,
    [mcpStatus],
  );

  useReportWorkStatusPresence(
    'context-sources',
    linked.length > 0 || loadedSkills.length > 0 || skills.length > 0 || mcpCount > 0 || pinnedCount > 0,
  );

  if (linked.length === 0 && loadedSkills.length === 0 && skills.length === 0 && mcpCount === 0 && pinnedCount === 0) {
    return null;
  }

  const linkedChanges = linked.filter(isLinkedChange);
  const prCount = linkedChanges.length;
  const changeTerms = linkedChanges.map((entry) => {
    const ref = getRepositoryThreadRef(entry, urlMatcher);
    return ref ? urlMatcher.descriptorOf(ref.provider).terminology.changeRequest : 'pullRequest';
  });
  const changeTerm: ChangeRequestTerm = changeTerms.length > 0 && changeTerms.every((term) => term === changeTerms[0])
    ? changeTerms[0]
    : 'pullRequest';
  const issueCount = linked.length - prCount;
  const summaryParts: string[] = [];
  if (issueCount > 0) {
    summaryParts.push(issueCount === 1
      ? t('chat.workStatus.breakdown.issueCountSingle', { count: issueCount })
      : t('chat.workStatus.breakdown.issueCountPlural', { count: issueCount }));
  }
  if (prCount > 0) {
    summaryParts.push(prCount === 1
      ? t(changeRequestCopy('chat.workStatus.breakdown.prCountSingle', changeTerm), { count: prCount })
      : t(changeRequestCopy('chat.workStatus.breakdown.prCountPlural', changeTerm), { count: prCount }));
  }
  if (summaryParts.length === 0 && pinnedCount > 0) {
    summaryParts.push(pinnedCount === 1
      ? t('chat.workStatus.breakdown.pinnedKnowledgeSingle', { count: pinnedCount })
      : t('chat.workStatus.breakdown.pinnedKnowledgePlural', { count: pinnedCount }));
  }
  if (summaryParts.length === 0) {
    if (skills.length > 0) {
      summaryParts.push(skills.length === 1
        ? t('chat.workStatus.breakdown.skillCountSingle', { count: skills.length })
        : t('chat.workStatus.breakdown.skillCountPlural', { count: skills.length }));
    }
    if (mcpCount > 0) {
      summaryParts.push(mcpCount === 1
        ? t('chat.workStatus.breakdown.mcpCountSingle', { count: mcpCount })
        : t('chat.workStatus.breakdown.mcpCountPlural', { count: mcpCount }));
    }
  }

  const liveLookOf = (entry: LinkedIssue) => {
    if (entry.kind === 'tracker') return liveLookById.get(entry.id.toLowerCase());
    const ref = getRepositoryThreadRef(entry, urlMatcher);
    return ref ? liveLookById.get(ref.key) : undefined;
  };
  const renderedIdentifier = (entry: LinkedIssue) => {
    const ref = getRepositoryThreadRef(entry, urlMatcher);
    if (ref) {
      const descriptor = urlMatcher.descriptorOf(ref.provider);
      return ref.thread === 'pull' ? formatChangeRequestReference(descriptor, ref.number) : `${descriptor.terminology.issuePrefix}${ref.number}`;
    }
    return entry.kind === 'tracker' || entry.kind === 'guest' || entry.kind === 'external' ? entry.identifier : `#${entry.number}`;
  };
  const openLinkedAriaLabel = (entry: Extract<LinkedIssue, { kind: 'issue' | 'pull' }>) => {
    const ref = getRepositoryThreadRef(entry, urlMatcher);
    return ref
      ? t('chat.workStatus.linkedIssues.openOnProvider', { reference: renderedIdentifier(entry), provider: urlMatcher.descriptorOf(ref.provider).label })
      : t('chat.workStatus.linkedIssues.openGuest', { id: renderedIdentifier(entry) });
  };
  const trackerNameOf = (provider: string) => trackerDescriptors.find((descriptor) => descriptor.id === provider)?.name ?? provider;
  const renderLinkedIcon = (entry: LinkedIssue) => {
    const color = liveLookOf(entry)?.color;
    return (
      <Icon
        name={isLinkedChange(entry) ? 'git-pull-request' : entry.kind === 'tracker' ? trackerPresentation(entry.provider).icon : 'record-circle'}
        className={cn('size-[13px] shrink-0', color ? 'oc-ref-tint' : 'text-muted-foreground')}
        style={color ? refTintStyle(color) : undefined}
      />
    );
  };
  const renderLinkedLabel = (entry: LinkedIssue) => {
    const look = liveLookOf(entry);
    const identifier = renderedIdentifier(entry);
    return (
      <>
        <span className={cn('tabular-nums', look && 'oc-ref-tint')} style={look ? refTintStyle(look.color) : undefined}>{look ? look.text : identifier}</span>
        {entry.title ? <> · {entry.title}</> : null}
      </>
    );
  };

  return (
    <WorkStatusCollapsibleSection
      id="context-sources"
      title={t('chat.workStatus.section.contextBreakdown')}
      icon="stack"
      summary={summaryParts.join(' · ')}
    >
      {linkedPlans.map((plan) => (
        <WorkStatusRow
          key={`plan:${plan.id}`}
          muted
          leading={pinnedPlanIds.has(plan.id)
            ? renderUnpinButton(() => unpinPlan(plan.id))
            : <Icon name="file-text" className="size-[13px] shrink-0 text-muted-foreground" />}
          label={<span dir="auto">{plan.title}</span>}
          tooltip={plan.title}
          onClick={projectRef && directory ? () => {
            openLinkedPlan(plan);
            leaveWorkStatus?.();
          } : undefined}
          ariaLabel={t('chat.workStatus.linkedPlans.open', { title: plan.title })}
          value={plan.progress ? (
            plan.progress.done >= plan.progress.total
              ? <WorkStatusValue tone="success">{t('rightSidebar.contextNotesTodo.plans.progress.done')}</WorkStatusValue>
              : <WorkStatusValue tone="muted">{`${plan.progress.done}/${plan.progress.total}`}</WorkStatusValue>
          ) : <WorkStatusValue tone="muted">{t('chat.workStatus.breakdown.pinnedPlan')}</WorkStatusValue>}
        />
      ))}

      {linked.map((entry) => (
        <WorkStatusRow
          key={entry.id}
          leading={renderLinkedIcon(entry)}
          label={renderLinkedLabel(entry)}
          tooltip={entry.title ? renderLinkedLabel(entry) : undefined}
          muted
          onClick={(event) => openTrackerItem(entry.url, directory, event)}
          ariaLabel={entry.kind === 'tracker'
            ? t('chat.workStatus.linkedIssues.openTrackerItem', { identifier: entry.identifier, provider: trackerNameOf(entry.provider) })
            : entry.kind === 'guest' || entry.kind === 'external'
              ? t('chat.workStatus.linkedIssues.openGuest', { id: entry.identifier })
              : openLinkedAriaLabel(entry)}
        />
      ))}

      {visibleKnowledge.notes.map((note) => (
        <WorkStatusRow
          key={note.id}
          muted
          leading={(
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pointer-events-auto inline-flex shrink-0">
                  <button
                    type="button"
                    disabled={!isDraft && (!sessionId || !directory)}
                    aria-label={t('chat.workStatus.breakdown.unpin')}
                    onClick={(event) => {
                      event.stopPropagation();
                      unpinNote(note.id);
                    }}
                    className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70 disabled:opacity-40"
                  >
                    <Icon name="pushpin-2-fill" className="size-3.5" style={{ color: 'var(--primary)' }} />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>{t('chat.workStatus.breakdown.unpin')}</TooltipContent>
            </Tooltip>
          )}
          label={note.body.trim().split('\n')[0] || note.body.trim()}
          value={<WorkStatusValue tone="muted">{t('chat.workStatus.breakdown.pinnedNote')}</WorkStatusValue>}
        />
      ))}
      {visibleKnowledge.plans.map((plan) => (
        <WorkStatusRow
          key={plan.id}
          muted
          leading={(
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pointer-events-auto inline-flex shrink-0">
                  <button
                    type="button"
                    disabled={!isDraft && (!sessionId || !directory)}
                    aria-label={t('chat.workStatus.breakdown.unpin')}
                    onClick={(event) => {
                      event.stopPropagation();
                      unpinPlan(plan.id);
                    }}
                    className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70 disabled:opacity-40"
                  >
                    <Icon name="pushpin-2-fill" className="size-3.5" style={{ color: 'var(--primary)' }} />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>{t('chat.workStatus.breakdown.unpin')}</TooltipContent>
            </Tooltip>
          )}
          label={plan.title}
          value={<WorkStatusValue tone="muted">{t('chat.workStatus.breakdown.pinnedPlan')}</WorkStatusValue>}
        />
      ))}
      {loadedSkills.map((skill) => (
        <WorkStatusRow
          key={`skill:${skill.id}`}
          muted
          icon="book"
          label={<span dir="auto">{skill.name}</span>}
          tooltip={skill.name}
          onClick={() => openLoadedSkill(skill)}
          ariaLabel={t('chat.workStatus.loadedSkills.open', { name: skill.name })}
        />
      ))}
      {memoryCount > 0 ? (
        <WorkStatusRow
          muted
          label={t('chat.workStatus.breakdown.memory')}
          value={<WorkStatusValue>{memoryCount}</WorkStatusValue>}
        />
      ) : null}

      <WorkStatusRow
        muted
        label={t('chat.workStatus.breakdown.skills')}
        value={<WorkStatusValue>{skills.length}</WorkStatusValue>}
      />
      <WorkStatusRow
        muted
        label={t('chat.workStatus.breakdown.mcp')}
        value={<WorkStatusValue>{mcpCount}</WorkStatusValue>}
      />
    </WorkStatusCollapsibleSection>
  );
};
