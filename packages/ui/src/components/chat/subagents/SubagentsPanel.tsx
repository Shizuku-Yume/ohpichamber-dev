import React from 'react';

import type { ApprovalRequest, QuestionRequest } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { FormCard } from '@/components/chat/FormCard';
import { PermissionCard } from '@/components/chat/PermissionCard';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { formatCost } from '@/components/chat/work-status/subagentCost';
import { SubagentStatusRow } from '@/components/chat/work-status/SubagentStatusRow';
import { useOpenChildSession } from '@/components/chat/work-status/useOpenChildSession';
import { useSubagentRows, type SubagentRow } from '@/components/chat/work-status/useSubagentRows';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync } from '@/sync/sync-context';
import type { State } from '@/sync/types';
import { resolveGlobalSessionDirectory } from '@/stores/globalSessionStructure';
import { findSubagentTask } from './subagentTask';

const NO_PERMISSIONS: ApprovalRequest[] = [];
const NO_FORMS: QuestionRequest[] = [];

const useSubagentTask = (
  parentId: string,
  childId: string | null,
  directory: string | null,
  target: { subagentId: string; name: string | null; role: string | null; task: string | undefined; solutionSpace: string | undefined; toolCallId: string | undefined },
): string | null => {
  const parentMessages = useDirectorySync(
    React.useCallback((state: State) => state.message[parentId], [parentId]),
    directory ?? undefined,
  );
  const childMessages = useDirectorySync(
    React.useCallback((state: State) => (childId ? state.message[childId] : undefined), [childId]),
    directory ?? undefined,
  );
  return React.useMemo(() => {
    return findSubagentTask(parentMessages, childMessages, {
      subagentId: target.subagentId,
      childSessionId: childId,
      name: target.name,
      role: target.role,
      task: target.task,
      solutionSpace: target.solutionSpace,
      toolCallId: target.toolCallId,
    });
  }, [childId, childMessages, parentMessages, target.subagentId, target.name, target.role, target.task, target.solutionSpace, target.toolCallId]);
};

const SubagentDetails: React.FC<{
  row: SubagentRow;
  parentId: string;
  directory: string | null;
  onOpenSession: (() => void) | null;
}> = ({ row, parentId, directory, onOpenSession }) => {
  const { t } = useI18n();
  const childId = row.childSessionId;
  const subagentId = row.subagentId;
  const activeToolCallId = row.subagent?.activeToolCallId;
  // Child blockers are attributed to the parent session; the Agent Service
  // stamps `subagentId`/`childSessionId` on them (older frames still match by
  // the child's in-flight toolCallId), so this surface resolves them from the
  // root bucket as well as the child's own key. Raw bucket references feed
  // `useDirectorySync`; the merge runs in a memo so the selector stays
  // referentially stable.
  const rootPermissions = useDirectorySync(
    React.useCallback((state: State) => state.permission[parentId] ?? NO_PERMISSIONS, [parentId]),
    directory ?? undefined,
  );
  const ownPermissions = useDirectorySync(
    React.useCallback((state: State) => (childId !== null ? state.permission[childId] ?? NO_PERMISSIONS : NO_PERMISSIONS), [childId]),
    directory ?? undefined,
  );
  const permissions = React.useMemo<ApprovalRequest[]>(() => {
    const linked = rootPermissions.filter((request) => request.status === 'pending'
      && (request.subagentId === subagentId
        || (childId !== null && request.childSessionId === childId)
        || (request.subagentId === undefined && request.childSessionId === undefined && activeToolCallId !== undefined && request.toolCallId === activeToolCallId)));
    if (linked.length === 0) return ownPermissions;
    const seen = new Set(linked.map((request) => request.approvalId));
    return [...linked, ...ownPermissions.filter((request) => !seen.has(request.approvalId))];
  }, [rootPermissions, ownPermissions, childId, subagentId, activeToolCallId]);
  const rootForms = useDirectorySync(
    React.useCallback((state: State) => state.form[parentId] ?? NO_FORMS, [parentId]),
    directory ?? undefined,
  );
  const ownForms = useDirectorySync(
    React.useCallback((state: State) => (childId !== null ? state.form[childId] ?? NO_FORMS : NO_FORMS), [childId]),
    directory ?? undefined,
  );
  const forms = React.useMemo<QuestionRequest[]>(() => {
    const linked = rootForms.filter((request) => request.status === 'pending'
      && (request.subagentId === subagentId || (childId !== null && request.childSessionId === childId)));
    if (linked.length === 0) return ownForms;
    const seen = new Set(linked.map((request) => request.questionId));
    return [...linked, ...ownForms.filter((request) => !seen.has(request.questionId))];
  }, [rootForms, ownForms, childId, subagentId]);
  const task = useSubagentTask(parentId, childId, directory, {
    subagentId: row.subagentId,
    name: row.subagent?.name ?? row.displayName,
    role: row.role,
    task: row.subagent?.task,
    solutionSpace: row.subagent?.solutionSpace,
    toolCallId: row.subagent?.toolCallId,
  });
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [steerOpen, setSteerOpen] = React.useState(false);
  const [steerInput, setSteerInput] = React.useState('');
  const [isSteering, setIsSteering] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const handleSteerSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = steerInput.trim();
    if (!message || isSteering) return;
    setIsSteering(true);
    try {
      await canonicalClient.steerSubagent(parentId, row.subagentId, message);
      setSteerInput('');
      setSteerOpen(false);
      toast.success(t('subagents.panel.steerSent'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('subagents.panel.steerFailed'));
    } finally {
      setIsSteering(false);
    }
  };

  const handleCancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      await canonicalClient.cancelSubagent(parentId, row.subagentId);
      toast.info(t('subagents.panel.cancelled'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('subagents.panel.cancelFailed'));
    } finally {
      setIsCancelling(false);
    }
  };

  const running = row.busy && !row.finished;
  const report = row.report;
  const reportFailed = report?.state === 'failed' || report?.state === 'cancelled' || row.failed || row.cancelled;

  return (
    <>
      {forms.length > 0 || permissions.length > 0 ? (
        <div className="mb-1.5 ms-[1.5625rem] flex flex-col gap-2">
          {forms.map((form) => <FormCard key={form.questionId} form={form} directory={directory ?? undefined} />)}
          {permissions.map((permission) => <PermissionCard key={permission.approvalId} permission={permission} />)}
        </div>
      ) : null}
      <div className="oc-tile mb-1.5 ms-[1.5625rem] flex flex-col gap-2.5 rounded-lg px-3 py-2.5">
        <section>
          <h4 className="typography-micro font-medium text-muted-foreground">{t('subagents.panel.report')}</h4>
          <div className="mt-1">
            {report?.output.trim() ? (
              <div style={reportFailed ? { color: 'var(--status-error)' } : undefined}>
                <SimpleMarkdownRenderer
                  content={report.output}
                  singleTilde={false}
                  className="typography-markdown-body"
                  enableFileReferences={false}
                  fallbackContent={<div className="whitespace-pre-wrap typography-markdown-body">{report.output}</div>}
                />
              </div>
            ) : (
              <p className="typography-meta text-muted-foreground">{t('subagents.panel.noReport')}</p>
            )}
          </div>
        </section>
        {task ? (
          <section>
            <button
              type="button"
              onClick={() => setTaskOpen((open) => !open)}
              aria-expanded={taskOpen}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 typography-micro font-medium text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground"
            >
              <Icon name="arrow-right-s" className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', taskOpen && 'rotate-90 rtl:-rotate-90')} />
              {t('subagents.panel.task')}
            </button>
            {taskOpen ? (
              <ScrollableOverlay as="pre" dir="auto" outerClassName="mt-1 max-h-72" className="whitespace-pre-wrap break-words font-mono typography-micro text-foreground" disableHorizontal>{task}</ScrollableOverlay>
            ) : null}
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          {running ? (
            <>
              <Button type="button" size="xs" variant="ghost" onClick={() => setSteerOpen((open) => !open)} aria-expanded={steerOpen}>
                <Icon name="edit" className="size-3.5" />
                {t('subagents.panel.steer')}
              </Button>
              <Button type="button" size="xs" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => void handleCancel()} disabled={isCancelling}>
                <Icon name="close" className="size-3.5" />
                {isCancelling ? t('subagents.panel.cancelling') : t('subagents.panel.cancel')}
              </Button>
            </>
          ) : null}
          {onOpenSession ? (
            <Button type="button" size="xs" variant="ghost" onClick={onOpenSession}>
              <Icon name="chat-4" className="size-3.5" />
              {t('subagents.panel.openSession')}
            </Button>
          ) : null}
        </div>
        {steerOpen && running ? (
          <form onSubmit={(event) => void handleSteerSubmit(event)} className="flex items-center gap-1.5">
            <Input
              inputSize="compact"
              placeholder={t('subagents.panel.steerPlaceholder')}
              value={steerInput}
              onChange={(event) => setSteerInput(event.target.value)}
              disabled={isSteering}
              autoFocus
            />
            <Button type="submit" size="xs" disabled={!steerInput.trim() || isSteering}>
              {t('subagents.panel.steerSend')}
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );
};

const SubagentEntry: React.FC<{
  row: SubagentRow;
  parentId: string;
  directory: string | null;
  open: boolean;
  onToggle: () => void;
  onOpenSession: (() => void) | null;
}> = ({ row, parentId, directory, open, onToggle, onOpenSession }) => {
  const { t } = useI18n();
  const label = row.displayName?.trim() || t('chat.workStatus.subagent.untitled');
  return (
    <>
      <SubagentStatusRow row={row} directory={directory} onClick={onToggle} ariaLabel={label} expanded={open} showActivity />
      {open ? <SubagentDetails row={row} parentId={parentId} directory={directory} onOpenSession={onOpenSession} /> : null}
    </>
  );
};

export const SubagentsPanel: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();
  const sessionId = useSessionUIStore((state) => state.currentSessionId);
  const rows = useSubagentRows(sessionId, directory);
  const openChildSession = useOpenChildSession(directory);
  const [toggled, setToggled] = React.useState<ReadonlySet<string>>(() => new Set());

  if (!sessionId || rows.length === 0) {
    return <p className="px-4 py-6 typography-meta text-muted-foreground">{t('subagents.panel.empty')}</p>;
  }

  const flip = (id: string) => setToggled((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const finished = rows.filter((row) => row.finished).length;
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollableOverlay outerClassName="min-h-0 flex-1" className="px-3 py-3" disableHorizontal>
        {rows.map((row) => {
          const label = row.displayName?.trim() || t('chat.workStatus.subagent.untitled');
          const open = (row.blocked || row.asked) !== toggled.has(row.key);
          const childId = row.childSessionId;
          const childDirectory = (row.child ? resolveGlobalSessionDirectory(row.child) : null) || directory;
          return (
            <SubagentEntry
              key={row.key}
              row={row}
              parentId={sessionId}
              directory={directory}
              open={open}
              onToggle={() => flip(row.key)}
              onOpenSession={childId && childDirectory
                ? () => openChildSession(childId, label, childDirectory)
                : null}
            />
          );
        })}
      </ScrollableOverlay>
      <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 border-t border-edge px-3 py-2 typography-micro text-muted-foreground">
        <span className="tabular-nums" dir="auto">{t('subagents.panel.summary', { done: finished, total: rows.length })}</span>
        {cost > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums" dir="ltr">{formatCost(cost)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
};
