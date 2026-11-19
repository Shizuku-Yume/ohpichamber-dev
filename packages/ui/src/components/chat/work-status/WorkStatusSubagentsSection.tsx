<<<<<<< HEAD
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import React, { useState } from 'react';
import { useSessionWorkflowRuns } from '@/lib/workflows/store';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
||||||| bc50ba56aa
import React from 'react';
import { isWorkflowAgentSession } from '@/lib/sessionWorkflowMetadata';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
=======
import React from 'react';
>>>>>>> upstream/main
import { Icon } from '@/components/icon/Icon';
<<<<<<< HEAD
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentHubModal } from '@/components/chat/AgentHubModal';
import { toast } from '@/components/ui';
import { canonicalClient } from '@/api/canonicalClient';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import type { IconName } from '@/components/icon/icons';
import { SessionActivityDuration } from '@/components/session/SessionActivityDuration';
import { useHasSessionActivityDuration } from '@/sync/session-activity-timing';
||||||| bc50ba56aa
import type { IconName } from '@/components/icon/icons';
import { SessionActivityDuration } from '@/components/session/SessionActivityDuration';
import { useHasSessionActivityDuration } from '@/sync/session-activity-timing';
=======
>>>>>>> upstream/main
import { useI18n } from '@/lib/i18n';
<<<<<<< HEAD
import { useAllLiveSessions, useAllSessionStatuses, useDirectorySync } from '@/sync/sync-context';
||||||| bc50ba56aa
import { useAllLiveSessions, useAllSessionStatuses, useDirectorySync } from '@/sync/sync-context';
import { useSessionWorkflowRuns } from '@/lib/workflows/store';
=======
>>>>>>> upstream/main
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { useSessionUIStore } from '@/sync/session-ui-store';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
||||||| bc50ba56aa
import { useConfigStore } from '@/stores/useConfigStore';
import { getProviderModelDisplayName } from '@/lib/modelDisplay';
import { normalizePath } from '@/lib/pathNormalization';
import { spaceIdOfDirectory } from '@/lib/spaces/space-route';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
=======
import { isVSCodeRuntime } from '@/lib/desktop';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { openSubagentsPanel } from '@/components/chat/subagents/panel';
import { WorkStatusCollapsibleSection } from './WorkStatusPrimitives';
import { SubagentStatusRow } from './SubagentStatusRow';
>>>>>>> upstream/main
import { useReportWorkStatusPresence } from './presenceContext';
<<<<<<< HEAD
import type { State } from '@/sync/types';
||||||| bc50ba56aa
import { useOpenChildSession } from './useOpenChildSession';
import { formatCost } from './subagentCost';
import { computeRollup } from './useSubagentCostRollup';
import type { State } from '@/sync/types';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
=======
import { useOpenChildSession } from './useOpenChildSession';
import { useSubagentRows } from './useSubagentRows';
>>>>>>> upstream/main

type Props = {
 sessionId: string | null;
 directory: string | null;
};

const SECTION_ID = 'subagents';
import type { Subagent } from '@openchamber/agent-contract';

const EMPTY_SUBAGENTS: Subagent[] = [];

<<<<<<< HEAD
const SubagentDuration: React.FC<{ sessionId: string }> = ({ sessionId }) => {
 const hasDuration = useHasSessionActivityDuration(sessionId, true);
 return hasDuration ? <SessionActivityDuration sessionId={sessionId} running /> : null;
};

/**
 * Running subagents and, more importantly, their blockers: a permission request
 * raised by a child session has no representation in the transcript, so this
 * panel is the only place it becomes visible.
 */
||||||| bc50ba56aa
const SubagentDuration: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const hasDuration = useHasSessionActivityDuration(sessionId, true);
  return hasDuration ? <SessionActivityDuration sessionId={sessionId} running /> : null;
};

/**
 * Running subagents and, more importantly, their blockers: a permission request
 * raised by a child session has no representation in the transcript, so this
 * panel is the only place it becomes visible.
 */
=======
>>>>>>> upstream/main
export const WorkStatusSubagentsSection: React.FC<Props> = ({ sessionId, directory }) => {
<<<<<<< HEAD
 const { t } = useI18n();
 const [hubOpen, setHubOpen] = useState(false);
 const isMobile = useUIStore((state) => state.isMobile);

 const liveSessions = useAllLiveSessions();
 const statuses = useAllSessionStatuses();
 // A workflow's agents are child sessions too; the Workflows section lists
 // them under their run, so they stay out of this list.
 const workflowRuns = useSessionWorkflowRuns(sessionId);
 const workflowAgentIds = React.useMemo(
  () => new Set(workflowRuns.flatMap((run) => run.agents.map((agent) => agent.sessionId))),
  [workflowRuns],
 );
 const children = React.useMemo(
  () => (sessionId ? liveSessions.filter((candidate) => candidate.parentSessionId === sessionId && !workflowAgentIds.has(candidate.sessionId)) : []),
  [liveSessions, sessionId, workflowAgentIds],
 );
 const liveSubagents = useSubagentsStore(
  React.useCallback((state) => (sessionId && state.byParent[sessionId]) ? state.byParent[sessionId] : EMPTY_SUBAGENTS, [sessionId]),
 );
 const [activeSteerId, setActiveSteerId] = React.useState<string | null>(null);
 const [steerInput, setSteerInput] = React.useState('');
 const [isSteering, setIsSteering] = React.useState(false);
 const [cancellingId, setCancellingId] = React.useState<string | null>(null);

 const handleSteerSubmit = async (e: React.FormEvent, subagentId: string) => {
  e.preventDefault();
  if (!sessionId || !steerInput.trim() || isSteering) return;
  setIsSteering(true);
  try {
   await canonicalClient.steerSubagent(sessionId, subagentId, steerInput.trim());
   setSteerInput('');
   setActiveSteerId(null);
   toast.success(t('chat.subagentHud.steer'));
  } catch (error) {
   toast.error(error instanceof Error ? error.message : t('chat.questionCard.submitFailed'));
  } finally {
   setIsSteering(false);
  }
 };

 const handleSubagentCancel = async (e: React.MouseEvent, subagentId: string) => {
  e.stopPropagation();
  if (!sessionId || cancellingId) return;
  setCancellingId(subagentId);
  try {
   await canonicalClient.cancelSubagent(sessionId, subagentId);
   const existing = useSubagentsStore.getState().byParent[sessionId]?.find(s => s.subagentId === subagentId);
   if (existing) {
    useSubagentsStore.getState().applySubagentUpdate(sessionId, { ...existing, status: 'cancelled' });
   }
   toast.info(t('chat.subagentHud.cancelled'));
  } catch (error) {
   toast.error(error instanceof Error ? error.message : t('chat.toolPart.subagent.stopFailed'));
  } finally {
   setCancellingId(null);
  }
 };

 // Canonical sessions do not carry legacy model/cost summaries; omit them.
 // One subscription covers every child: per-session hooks would multiply
 // store subscriptions by the number of subagents.
 const permissions = useDirectorySync(React.useCallback((state: State) => state.permission, []));
 const forms = useDirectorySync(React.useCallback((state: State) => state.form, []));
 // A loaded session record is not status authority: before the directory's
 // first status snapshot a child's `runtimeStatus` says nothing, so the row
 // stays unknown instead of claiming Done.
 const statusesReady = useDirectorySync(React.useCallback((state: State) => state.sessionStatusReady === true, []));
 // The last turn's outcome outlives the live status: a child that went idle
 // after an error reads as failed, not done. Joined to a string so the
 // selector stays stable while nothing about these children changes.
 const failedChildIds = useGlobalSessionStatusStore(React.useCallback((state) => children
  .filter((child) => state.observedById.get(child.sessionId)?.outcome === 'failed')
  .map((child) => child.sessionId)
  .join('\n'), [children]));

 const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);
 const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
 const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);

 // Subagents appearing where there were none is the one moment this section
 // has something urgent to say, so it opens itself. Only on the empty→present
 // edge: re-expanding on every count change would fight a user who just
 // collapsed it.
 const hadChildren = React.useRef(children.length > 0);
 React.useEffect(() => {
  const present = children.length > 0;
  if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
  hadChildren.current = present;
 }, [children.length, setSectionExpanded]);

 // Mobile selects the child session in place; other layouts open the child's
 // read-only chat in the context panel.
 const openChildSession = React.useCallback((childId: string, label: string) => {
  if (!directory) return;
  if (isMobile) {
   setCurrentSession(childId, directory);
   return;
  }
  openContextPanelTab(directory, {
   mode: 'chat',
   dedupeKey: `session:${childId}`,
   label,
   readOnly: true,
  });
 }, [directory, isMobile, openContextPanelTab, setCurrentSession]);
||||||| bc50ba56aa
  const { t } = useI18n();
  const providers = useConfigStore((state) => state.providers);

  const liveSessions = useAllLiveSessions();
  const statuses = useAllSessionStatuses();
  // A workflow's agents are child sessions too; the Workflows section lists
  // them under their run, so they stay out of this list: by their mark, and
  // by the runs for agents started before sessions carried one.
  const workflowRuns = useSessionWorkflowRuns(sessionId);
  const workflowAgentIds = React.useMemo(
    () => new Set(workflowRuns.flatMap((run) => run.agents.flatMap((agent) => (agent.sessionId ? [agent.sessionId] : [])))),
    [workflowRuns],
  );
  const children = React.useMemo(
    () => (sessionId ? liveSessions.filter((candidate) => (
      candidate.parentID === sessionId && !workflowAgentIds.has(candidate.id) && !isWorkflowAgentSession(candidate)
    )) : []),
    [liveSessions, sessionId, workflowAgentIds],
  );

  // Each child's own subtree total (its cost plus every descendant of its
  // own), so nested subagent-of-subagent cost rolls up under the immediate
  // child row shown here rather than disappearing. Computed from the list
  // already held: the hook would open a second live-session subscription.
  const { perChildCost } = React.useMemo(() => computeRollup(liveSessions, sessionId), [liveSessions, sessionId]);

  // One subscription covers every child: per-session hooks would multiply
  // store subscriptions by the number of subagents.
  const permissions = useDirectorySync(React.useCallback((state: State) => state.permission, []));
  const forms = useDirectorySync(React.useCallback((state: State) => state.form, []));
  const statusReady = useDirectorySync(
    React.useCallback((state: State) => state.sessionStatusReady, []),
    directory ?? undefined,
  );
  const statusInvalidated = useDirectorySync(
    React.useCallback((state: State) => state.sessionStatusInvalidated, []),
    directory ?? undefined,
  );
  // Every status event reaches the global store, whichever directory owns the
  // child, so a child seen going busy and then settling is known to be idle
  // even when the directory snapshot does not cover it. The last turn's
  // outcome outlives the live status: a child that went idle after an error
  // reads as failed, not done. Joined to a string so the selector stays
  // stable while nothing about these children changes.
  const observedChildren = useGlobalSessionStatusStore(React.useCallback((state) => children
    .flatMap((child) => {
      if (state.statusById.has(child.id)) return [`${child.id}\tbusy`];
      const observed = state.observedById.get(child.id);
      return observed ? [`${child.id}\t${observed.outcome === 'failed' ? 'failed' : 'settled'}`] : [];
    })
    .join('\n'), [children]));

  const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);

  // Subagents appearing where there were none is the one moment this section
  // has something urgent to say, so it opens itself. Only on the empty→present
  // edge: re-expanding on every count change would fight a user who just
  // collapsed it.
  const hadChildren = React.useRef(children.length > 0);
  React.useEffect(() => {
    const present = children.length > 0;
    if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
    hadChildren.current = present;
  }, [children.length, setSectionExpanded]);

  const openChildSession = useOpenChildSession(directory);

  useReportWorkStatusPresence('subagents', children.length > 0);

  if (children.length === 0) return null;

  const observedById = new Map<string, string>();
  for (const line of observedChildren.split('\n')) {
    const [id, observed] = line.split('\t');
    if (id && observed) observedById.set(id, observed);
  }
  const panelDirectory = normalizePath(directory);
  const panelSpaceId = spaceIdOfDirectory(panelDirectory);
  const rows = children.map((child) => {
    const blocked = (permissions[child.id]?.length ?? 0) > 0;
    const asked = (forms[child.id]?.length ?? 0) > 0;
    const status = statuses[child.id]?.type;
    const observed = observedById.get(child.id);
    const busy = status === 'busy' || status === 'retry' || (!status && observed === 'busy');
    const failed = !busy && observed === 'failed';
    // The snapshot is the server's list of running sessions: the host's for
    // every host directory, a space's own for that space. So it also speaks
    // for a child that moved to another worktree, never across that boundary.
    const snapshotCovers = statusReady === true && !statusInvalidated?.[child.id]
      && panelDirectory !== null && spaceIdOfDirectory(normalizePath(child.directory)) === panelSpaceId;
    const done = !failed && !busy && (status === 'idle' || (!status && (snapshotCovers || observed === 'settled')));
    const finished = !blocked && !asked && (done || failed);
    // Blockers first, then running rows, then rows whose status is not known
    // yet, then finished ones: an unknown row must not push a working one down.
    const rank = blocked || asked ? 0 : busy ? 1 : finished ? 3 : 2;
    return { child, blocked, asked, busy, failed, done, rank };
  });
  // Newest first by creation within each rank, never by last activity: an
  // activity order reshuffled the rows on every step, moving them under the
  // pointer. A fully finished list reads exactly as it did at launch.
  rows.sort((left, right) => (left.rank - right.rank)
    || ((right.child.time?.created ?? 0) - (left.child.time?.created ?? 0)));
=======
  const { t } = useI18n();
  const rows = useSubagentRows(sessionId, directory);
  const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);
  const isMobile = useUIStore((state) => state.isMobile);
  const panelAvailable = !isMobile && !isVSCodeRuntime();

  const hadChildren = React.useRef(rows.length > 0);
  React.useEffect(() => {
    const present = rows.length > 0;
    if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
    hadChildren.current = present;
  }, [rows.length, setSectionExpanded]);

  const openChildSession = useOpenChildSession(directory);

  useReportWorkStatusPresence('subagents', rows.length > 0);

  if (rows.length === 0) return null;
>>>>>>> upstream/main

 useReportWorkStatusPresence('subagents', children.length > 0);

<<<<<<< HEAD
 if (children.length === 0) return null;

 const failedIds = new Set(failedChildIds.split('\n'));
 const rows = children.map((child) => {
  const status = statusesReady ? statuses[child.sessionId] ?? child.runtimeStatus : statuses[child.sessionId];
  const blocked = status === 'awaiting_approval' || (permissions[child.sessionId]?.length ?? 0) > 0;
  const asked = status === 'awaiting_input' || (forms[child.sessionId]?.length ?? 0) > 0;
  const busy = status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';
  const failed = !busy && failedIds.has(child.sessionId);
  const done = !failed && status === 'idle';
  return { child, blocked, asked, busy, failed, done, finished: !blocked && !asked && (done || failed) };
 });
 // Newest first by creation, never by last activity: an activity order
 // reshuffled the rows on every step, moving them under the pointer. Finished
 // rows sink below the unfinished ones but keep the same order among
 // themselves, so a fully finished list reads exactly as it did at launch.
 rows.sort((left, right) => (Number(left.finished) - Number(right.finished))
  || (right.child.createdAt - left.child.createdAt));

 const busyChildren = rows.filter((row) => row.busy).length;

 return (
  <WorkStatusCollapsibleSection
   id={SECTION_ID}
   title={t('chat.workStatus.section.subagents')}
   icon="ai-agent"
   defaultExpanded
   summary={busyChildren > 0 ? `${busyChildren}/${children.length}` : children.length}
   action={(
    <Button variant="ghost" size="xs" onClick={() => setHubOpen(true)} title={t('chat.workStatus.section.subagents')}>
     <Icon name="apps" className="size-3" />
    </Button>
   )}
  >
   <ScrollableOverlay outerClassName="max-h-60" className="space-y-1" disableHorizontal>
    {rows.map(({ child, blocked, asked, busy, failed, done }) => {
     const label = child.title?.trim() || t('chat.workStatus.subagent.untitled');
     const live = liveSubagents.find(
      (s) => s.childSessionId === child.sessionId || s.subagentId === child.sessionId,
     );
     const subagentId = live?.subagentId ?? child.sessionId;
     let icon: IconName = 'time';
     let iconColor: string | undefined;
     let statusLabel = '';
     if (blocked || asked) {
      icon = 'alert';
      iconColor = 'var(--status-warning)';
      statusLabel = t(blocked ? 'chat.workStatus.subagent.needsPermission' : 'chat.workStatus.subagent.askedQuestion');
     } else if (busy) {
      icon = 'record-circle';
      iconColor = 'var(--status-info)';
      statusLabel = t('chat.workStatus.subagent.working');
     } else if (failed) {
      icon = 'close-circle';
      iconColor = 'var(--status-error)';
      statusLabel = t('chat.workStatus.subagent.failed');
     } else if (done) {
      icon = 'checkbox-circle';
      iconColor = 'var(--status-success)';
      statusLabel = t('chat.workStatus.subagent.done');
     }
     return (
      <div key={child.sessionId} className="flex flex-col">
       <WorkStatusRow
        onClick={directory ? () => openChildSession(child.sessionId, label) : undefined}
        ariaLabel={[t('chat.workStatus.action.openSubagent', { name: label }), statusLabel].filter(Boolean).join('. ')}
        leading={(
         <span className="flex size-4 shrink-0 items-center justify-center">
          <Icon name={icon} className="size-3.5" style={iconColor ? { color: iconColor } : undefined} />
         </span>
        )}
        label={label}
        value={(
         <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {live?.activeTool && (
           <span className="typography-micro font-mono text-muted-foreground px-1 py-0.5 rounded bg-muted/50">
            {live.activeTool}
           </span>
          )}
          {live?.tokens !== undefined && live.tokens > 0 && (
           <span className="typography-micro text-muted-foreground tabular-nums">
            {t('chat.subagentHud.tokens', { count: live.tokens })}
           </span>
          )}
          {live?.cost !== undefined && live.cost > 0 && (
           <span className="typography-micro text-muted-foreground tabular-nums">
            {`$${live.cost.toFixed(3)}`}
           </span>
          )}
          {blocked ? (
           <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.needsPermission')}</WorkStatusValue>
          ) : asked ? (
           <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.askedQuestion')}</WorkStatusValue>
          ) : busy ? <SubagentDuration sessionId={child.sessionId} /> : null}
          {busy && (
           <div className="flex items-center gap-0.5 ms-1">
            <Button
             variant="ghost"
             size="xs"
             className="text-muted-foreground hover:text-foreground"
             onClick={(e) => {
              e.stopPropagation();
              setActiveSteerId(activeSteerId === subagentId ? null : subagentId);
             }}
             title={t('chat.subagentHud.steer')}
            >
             <Icon name="edit" className="size-2.5" />
            </Button>
            <Button
             variant="ghost"
             size="xs"
             className="text-destructive hover:bg-destructive/10"
             onClick={(e) => handleSubagentCancel(e, subagentId)}
             disabled={cancellingId === subagentId}
             title={t('chat.subagentHud.cancel')}
            >
             <Icon name="close" className="size-2.5" />
            </Button>
           </div>
          )}
         </div>
        )}
       />
       {activeSteerId === subagentId && (
        <form
         onSubmit={(e) => handleSteerSubmit(e, subagentId)}
         className="flex items-center gap-1.5 ps-6 pe-2 py-1 bg-muted/30"
         onClick={(e) => e.stopPropagation()}
        >
         <Input
          inputSize="compact"
          placeholder={t('chat.subagentHud.steerPlaceholder')}
          value={steerInput}
          onChange={(e) => setSteerInput(e.target.value)}
          disabled={isSteering}
          autoFocus
         />
         <Button
          type="submit"
          size="xs"
          disabled={!steerInput.trim() || isSteering}
         >
          {t('chat.subagentHud.steerSend')}
         </Button>
        </form>
       )}
      </div>
     );
    })}
   </ScrollableOverlay>
   <AgentHubModal open={hubOpen} onOpenChange={setHubOpen} sessionId={sessionId} />
  </WorkStatusCollapsibleSection>
 );
||||||| bc50ba56aa
  return (
    <WorkStatusCollapsibleSection
      id={SECTION_ID}
      title={t('chat.workStatus.section.subagents')}
      icon="ai-agent"
      defaultExpanded
      summary={busyChildren > 0 ? `${busyChildren}/${children.length}` : children.length}
    >
      <ScrollableOverlay outerClassName="max-h-56" disableHorizontal>
        {rows.map(({ child, blocked, asked, busy, failed, done }) => {
          const label = child.title?.trim() || t('chat.workStatus.subagent.untitled');
          let icon: IconName = 'time';
          let iconColor: string | undefined;
          let statusLabel = '';
          if (blocked || asked) {
            icon = 'alert';
            iconColor = 'var(--status-warning)';
            statusLabel = t(blocked ? 'chat.workStatus.subagent.needsPermission' : 'chat.workStatus.subagent.askedQuestion');
          } else if (busy) {
            icon = 'record-circle';
            iconColor = 'var(--status-info)';
            statusLabel = t('chat.workStatus.subagent.working');
          } else if (failed) {
            icon = 'close-circle';
            iconColor = 'var(--status-error)';
            statusLabel = t('chat.workStatus.subagent.failed');
          } else if (done) {
            icon = 'checkbox-circle';
            iconColor = 'var(--status-success)';
            statusLabel = t('chat.workStatus.subagent.done');
          }
          const childCost = perChildCost.get(child.id) ?? 0;
          const modelName = getProviderModelDisplayName(
            providers.find((provider) => provider.id === child.model?.providerID),
            child.model?.id,
          );
          return (
            <WorkStatusRow
              key={child.id}
              onClick={directory ? () => openChildSession(child.id, label) : undefined}
              ariaLabel={[t('chat.workStatus.action.openSubagent', { name: label }), statusLabel].filter(Boolean).join('. ')}
              // The smaller status glyph sits centred in the panel's 14px icon
              // slot, so it lines up under the section icon and the label
              // starts where every other row's does.
              leading={(
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  <Icon name={icon} className="size-3" style={iconColor ? { color: iconColor } : undefined} />
                </span>
              )}
              label={label}
              tooltip={modelName || undefined}
              value={(
                <>
                  {blocked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.needsPermission')}</WorkStatusValue>
                  ) : asked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.askedQuestion')}</WorkStatusValue>
                  ) : busy ? <SubagentDuration sessionId={child.id} /> : null}
                  {childCost > 0 ? <WorkStatusValue tone="muted">{formatCost(childCost)}</WorkStatusValue> : null}
                </>
              )}
            />
          );
        })}
      </ScrollableOverlay>
    </WorkStatusCollapsibleSection>
  );
=======
  return (
    <WorkStatusCollapsibleSection
      id={SECTION_ID}
      title={t('chat.workStatus.section.subagents')}
      icon="ai-agent"
      defaultExpanded
      summary={busyChildren > 0 ? `${busyChildren}/${rows.length}` : rows.length}
      action={panelAvailable && directory ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0 text-muted-foreground"
                onClick={() => openSubagentsPanel(directory)}
                aria-label={t('chat.workStatus.subagent.openPanel')}
              >
                <Icon name="external-link" className="size-[13px]" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t('chat.workStatus.subagent.openPanel')}</TooltipContent>
        </Tooltip>
      ) : undefined}
    >
      <ScrollableOverlay outerClassName="max-h-[21rem]" disableHorizontal>
        {rows.map((row) => {
          const label = row.child.title?.trim() || t('chat.workStatus.subagent.untitled');
          return (
            <SubagentStatusRow
              key={row.child.id}
              row={row}
              directory={directory}
              onClick={directory ? () => openChildSession(row.child.id, label, row.child.directory) : undefined}
              ariaLabel={t('chat.workStatus.action.openSubagent', { name: label })}
            />
          );
        })}
      </ScrollableOverlay>
    </WorkStatusCollapsibleSection>
  );
>>>>>>> upstream/main
};
