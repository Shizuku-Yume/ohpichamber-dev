import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { parseModelString, type Session, type Subagent } from '@openchamber/agent-contract';

import type { IconName } from '@/components/icon/icons';
import type { I18nKey } from '@/lib/i18n';
import { getProviderModelDisplayName, humanizeModelId } from '@/lib/modelDisplay';
import { normalizePath } from '@/lib/pathNormalization';
import { isWorkflowAgentSession } from '@/lib/sessionWorkflowMetadata';
import { spaceIdOfDirectory } from '@/lib/spaces/space-route';
import { useSessionWorkflowRuns } from '@/lib/workflows/store';
import { useConfigStore } from '@/stores/useConfigStore';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { isSessionDirectoryAdmitted } from '@/sync/session-admission-rule';
import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useAllLiveSessions, useAllSessionStatuses, useDirectorySync } from '@/sync/sync-context';
import type { State } from '@/sync/types';
import { reportFirstLine } from './subagentActivity';
import { computeRollup } from './useSubagentCostRollup';
import { findSubagentReport, useSubagentReports, type SubagentReport } from './useSubagentReports';

export type SubagentRow = {
  /** Stable identifier: subagentId from live/persisted subagent record, else child sessionId. */
  key: string;
  subagentId: string;
  /** Real child session UUID once persisted/known; null while live frame has no childSessionId yet. */
  childSessionId: string | null;
  child: Session | undefined;
  subagent: Subagent | undefined;
  displayName: string | null;
  role: string | null;
  modelName: string | null;
  identity: string;
  createdAt: number;
  elapsedMs: number | null;
  blocked: boolean;
  asked: boolean;
  busy: boolean;
  failed: boolean;
  cancelled: boolean;
  done: boolean;
  finished: boolean;
  detached: boolean;
  cost: number;
  tokens: number;
  report: SubagentReport | null;
  reportLine: string | null;
};

type SubagentRowLook = { icon: IconName; color: string | undefined; labelKey: I18nKey | null };

const NO_SESSIONS: Session[] = [];
const EMPTY_SUBAGENTS: Subagent[] = [];

export const resolveSubagentDisplayName = (
  subagent: Pick<Subagent, 'subagentId' | 'name' | 'role'> | undefined,
  child: Pick<Session, 'sessionId' | 'title'> | undefined,
): string | null => {
  const explicitName = subagent?.name?.trim();
  if (explicitName) return explicitName;
  const title = child?.title?.trim();
  if (title && title !== subagent?.role?.trim()) return title;
  const subagentId = subagent?.subagentId?.trim();
  if (subagentId && subagentId !== subagent?.role?.trim()) return subagentId;
  if (title) return title;
  if (subagentId) return subagentId;
  const role = subagent?.role?.trim();
  return role || null;
};

const formatModelLabel = (
  modelString: string | undefined,
  providers: ReturnType<typeof useConfigStore.getState>['providers'],
): string | null => {
  const trimmed = modelString?.trim();
  if (!trimmed) return null;
  const parsed = parseModelString(trimmed);
  if (parsed) {
    const provider = providers.find((entry) => entry.providerId === parsed.providerId);
    if (provider) {
      const displayModels = provider.models.map((entry) => ({ id: entry.modelId, name: entry.name }));
      return getProviderModelDisplayName({ models: displayModels }, parsed.modelId) || humanizeModelId(parsed.modelId);
    }
    return humanizeModelId(parsed.modelId);
  }
  return humanizeModelId(trimmed);
};

const subagentElapsedMs = (row: Pick<SubagentRow, 'child' | 'subagent' | 'report'>): number | null => {
  if (row.subagent?.durationMs !== undefined && Number.isFinite(row.subagent.durationMs)) {
    return Math.max(0, row.subagent.durationMs);
  }
  if (row.report?.durationMs !== undefined && Number.isFinite(row.report.durationMs)) {
    return Math.max(0, row.report.durationMs);
  }
  if (row.child) {
    const delta = row.child.updatedAt - row.child.createdAt;
    return delta > 0 ? delta : 0;
  }
  return null;
};

export const subagentRowLook = (row: Pick<SubagentRow, 'blocked' | 'asked' | 'busy' | 'failed' | 'cancelled' | 'done'>): SubagentRowLook => {
  if (row.blocked) return { icon: 'alert', color: 'var(--status-warning)', labelKey: 'chat.workStatus.subagent.needsPermission' };
  if (row.asked) return { icon: 'alert', color: 'var(--status-warning)', labelKey: 'chat.workStatus.subagent.askedQuestion' };
  if (row.busy) return { icon: 'record-circle', color: 'var(--status-info)', labelKey: 'chat.workStatus.subagent.working' };
  if (row.failed) return { icon: 'close-circle', color: 'var(--status-error)', labelKey: 'chat.workStatus.subagent.failed' };
  if (row.cancelled) return { icon: 'close-circle', color: 'var(--text-muted, var(--muted-foreground))', labelKey: 'subagents.status.cancelled' };
  if (row.done) return { icon: 'checkbox-circle', color: 'var(--status-success)', labelKey: 'chat.workStatus.subagent.done' };
  return { icon: 'time', color: undefined, labelKey: null };
};

export type DeriveSubagentRowsInput = {
  children: readonly Session[];
  liveSubagents: readonly Subagent[];
  statuses: Readonly<Record<string, State['session_status'][string]>>;
  statusReady: boolean;
  statusInvalidated: Readonly<Record<string, true>> | undefined;
  observedById: ReadonlyMap<string, string>;
  requestsById: ReadonlyMap<string, string>;
  permissions: State['permission'];
  forms: State['form'];
  perChildCost: ReadonlyMap<string, number>;
  reports: ReadonlyMap<string, SubagentReport>;
  providers: ReturnType<typeof useConfigStore.getState>['providers'];
  projects: ReturnType<typeof useProjectsStore.getState>['projects'];
  worktrees: ReturnType<typeof useSessionUIStore.getState>['availableWorktreesByProject'];
  directory: string | null;
  /** The parent session these rows belong to; root-keyed child requests resolve to their row from here. */
  sessionId: string | null;
};

export const deriveSubagentRows = (input: DeriveSubagentRowsInput): SubagentRow[] => {
  const {
    children,
    liveSubagents,
    statuses,
    statusReady,
    statusInvalidated,
    observedById,
    requestsById,
    permissions,
    forms,
    perChildCost,
    reports,
    providers,
    projects,
    worktrees,
    directory,
    sessionId,
  } = input;

  if (children.length === 0 && liveSubagents.length === 0) return [];

  const childById = new Map<string, Session>(children.map((child) => [child.sessionId, child]));
  const matchedChildIds = new Set<string>();
  const mergedEntries: Array<{ key: string; subagent: Subagent | undefined; child: Session | undefined }> = [];

  for (const subagent of liveSubagents) {
    const matchedChild = (subagent.childSessionId ? childById.get(subagent.childSessionId) : undefined)
      ?? childById.get(subagent.subagentId);
    if (matchedChild) matchedChildIds.add(matchedChild.sessionId);
    mergedEntries.push({
      key: subagent.subagentId,
      subagent,
      child: matchedChild,
    });
  }

  // A live `subagent.updated` can arrive before `childSessionId` is persisted,
  // while a discovered child `Session` (its title stamped to the subagent's
  // role/name) is already listed. Pair an unresolved record with such a session
  // only when the name/role bucket is unambiguous — never guess between two
  // same-role subagents, where a wrong merge is worse than a brief duplicate.
  const unmatchedSessions = children.filter((child) => !matchedChildIds.has(child.sessionId));
  const titleBuckets = new Map<string, Session[]>();
  for (const child of unmatchedSessions) {
    const title = child.title?.trim();
    if (!title) continue;
    const bucket = titleBuckets.get(title) ?? [];
    bucket.push(child);
    titleBuckets.set(title, bucket);
  }
  const claimed = new Set<string>();
  for (const entry of mergedEntries) {
    if (entry.child || !entry.subagent) continue;
    const record = entry.subagent;
    if (record.childSessionId && record.childSessionId !== record.subagentId) continue;
    const candidates = [record.name?.trim(), record.role?.trim()].flatMap((title) => {
      if (!title) return [];
      const bucket = titleBuckets.get(title)?.filter((child) => !claimed.has(child.sessionId)) ?? [];
      return bucket.map((child) => ({ title, child }));
    });
    if (candidates.length !== 1) continue;
    const { child } = candidates[0];
    // A second unresolved subagent competing for the same session would also
    // reach this branch; the bucket check above is per-name, so confirm no
    // other unresolved record names this same title.
    const rivals = mergedEntries.filter((other) => other !== entry && !other.child && other.subagent
      && !(other.subagent.childSessionId && other.subagent.childSessionId !== other.subagent.subagentId)
      && [other.subagent.name?.trim(), other.subagent.role?.trim()].includes(child.title?.trim()));
    if (rivals.length > 0) continue;
    entry.child = child;
    matchedChildIds.add(child.sessionId);
    claimed.add(child.sessionId);
  }

  for (const child of children) {
    if (matchedChildIds.has(child.sessionId)) continue;
    mergedEntries.push({
      key: child.sessionId,
      subagent: undefined,
      child,
    });
  }

  // Child approvals/questions are attributed to the parent session: the Agent
  // Service stamps `subagentId`/`childSessionId` on those requests, and an
  // older frame is still matched by the child's in-flight `activeToolCallId`.
  const rootPermissions = sessionId ? permissions[sessionId] ?? [] : [];
  const rootForms = sessionId ? forms[sessionId] ?? [] : [];
  const linkedPermissionIds = new Map<string, Set<string>>();
  const linkedPermissionCallIds = new Map<string, string>();
  const linkedFormIds = new Map<string, Set<string>>();
  for (const request of rootPermissions) {
    if (request.status !== 'pending') continue;
    if (request.subagentId || request.childSessionId) {
      if (request.subagentId) {
        const bucket = linkedPermissionIds.get(request.subagentId) ?? new Set<string>();
        bucket.add(request.approvalId);
        linkedPermissionIds.set(request.subagentId, bucket);
      }
      if (request.childSessionId) {
        const childBucket = linkedPermissionIds.get(request.childSessionId) ?? new Set<string>();
        childBucket.add(request.approvalId);
        linkedPermissionIds.set(request.childSessionId, childBucket);
      }
    } else {
      linkedPermissionCallIds.set(request.toolCallId, request.approvalId);
    }
  }
  for (const request of rootForms) {
    if (request.status !== 'pending' || (!request.subagentId && !request.childSessionId)) continue;
    if (request.subagentId) {
      const bucket = linkedFormIds.get(request.subagentId) ?? new Set<string>();
      bucket.add(request.questionId);
      linkedFormIds.set(request.subagentId, bucket);
    }
    if (request.childSessionId) {
      const childBucket = linkedFormIds.get(request.childSessionId) ?? new Set<string>();
      childBucket.add(request.questionId);
      linkedFormIds.set(request.childSessionId, childBucket);
    }
  }

  const panelDirectory = normalizePath(directory);
  const panelSpaceId = spaceIdOfDirectory(panelDirectory);

  const ranked = mergedEntries.map(({ key, subagent, child }) => {
    const childSessionId = (subagent?.childSessionId && subagent.childSessionId !== subagent.subagentId
      ? subagent.childSessionId
      : child?.sessionId) ?? null;
    const lookupIds = [childSessionId, subagent?.subagentId].filter((value): value is string => Boolean(value));

    const callLinkedPermission = subagent?.activeToolCallId ? linkedPermissionCallIds.get(subagent.activeToolCallId) : undefined;
    const hasPermission = callLinkedPermission !== undefined
      || lookupIds.some((id) => (linkedPermissionIds.get(id)?.size ?? 0) > 0 || (permissions[id]?.length ?? 0) > 0 || Boolean(requestsById.get(id)?.includes('p')));
    const hasForm = lookupIds.some((id) => (linkedFormIds.get(id)?.size ?? 0) > 0 || (forms[id]?.length ?? 0) > 0 || Boolean(requestsById.get(id)?.includes('f')));
    const liveStatus = lookupIds.map((id) => statuses[id]).find((value) => value !== undefined);
    const observed = lookupIds.map((id) => observedById.get(id)).find((value) => value !== undefined);

    const blocked = hasPermission || liveStatus === 'awaiting_approval';
    const asked = hasForm || liveStatus === 'awaiting_input';

    const subagentRunning = subagent?.status === 'running' || subagent?.status === 'idle';
    const subagentFailed = subagent?.status === 'failed';
    const subagentCancelled = subagent?.status === 'cancelled';
    const subagentCompleted = subagent?.status === 'completed' || subagent?.status === 'parked';

    const statusIsBusy = liveStatus === 'running' || liveStatus === 'awaiting_approval' || liveStatus === 'awaiting_input';
    const busy = subagent
      ? (subagentRunning || statusIsBusy) && !subagentFailed && !subagentCancelled && !subagentCompleted
      : (statusIsBusy || (!liveStatus && observed === 'busy'));
    const cancelled = !busy && subagentCancelled;
    const failed = !busy && !cancelled && (subagentFailed || observed === 'failed');

    const childDir = child ? normalizePath(resolveGlobalSessionDirectory(child)) : null;
    const snapshotCovers = Boolean(
      child
      && statusReady
      && !statusInvalidated?.[child.sessionId]
      && panelDirectory !== null
      && spaceIdOfDirectory(childDir) === panelSpaceId,
    );
    const done = !busy && !failed && !cancelled && (
      subagentCompleted
      || liveStatus === 'idle'
      || (!liveStatus && (snapshotCovers || observed === 'settled'))
    );
    const finished = !blocked && !asked && (done || failed || cancelled);
    const rank = blocked || asked ? 0 : busy ? 1 : finished ? 3 : 2;

    const displayName = resolveSubagentDisplayName(subagent, child);
    const role = subagent?.role?.trim() || null;
    const modelName = formatModelLabel(subagent?.model, providers);
    const identity = [role, modelName].filter(Boolean).join(' · ');

    const report = findSubagentReport(reports, {
      subagentId: key,
      childSessionId,
      name: subagent?.name ?? displayName,
      toolCallId: subagent?.toolCallId,
    });
    const reportLine = report ? reportFirstLine(report.output) : null;

    const cost = subagent?.treeCost ?? subagent?.cost ?? (childSessionId ? perChildCost.get(childSessionId) : undefined) ?? 0;
    const tokens = subagent?.tokens ?? 0;
    const createdAt = subagent?.createdAt ?? child?.createdAt ?? 0;

    const row: SubagentRow = {
      key,
      subagentId: key,
      childSessionId,
      child,
      subagent,
      displayName,
      role,
      modelName,
      identity,
      createdAt,
      elapsedMs: null,
      blocked,
      asked,
      busy,
      failed,
      cancelled,
      done,
      finished,
      detached: child ? !isSessionDirectoryAdmitted(resolveGlobalSessionDirectory(child), projects, worktrees) : false,
      cost,
      tokens,
      report,
      reportLine,
    };
    row.elapsedMs = subagentElapsedMs(row);
    return { row, rank };
  });

  ranked.sort((left, right) => (left.rank - right.rank)
    || (right.row.createdAt - left.row.createdAt)
    || left.row.key.localeCompare(right.row.key));
  return ranked.map(({ row }) => row);
};

const useSessionsWithListedChildren = (sessionId: string | null): Session[] => {
  const liveSessions = useAllLiveSessions();
  const listedChildren = useGlobalSessionsStore(useShallow((state) => {
    const childIds = sessionId ? state.structure.activeChildrenByParentId.get(sessionId) : undefined;
    if (!childIds) return NO_SESSIONS;
    return childIds.flatMap((id) => {
      const child = state.entityById.get(id);
      return child ? [child] : [];
    });
  }));
  return React.useMemo(() => {
    if (listedChildren.length === 0) return liveSessions;
    const listedById = new Map(listedChildren.map((child) => [child.sessionId, child]));
    const merged = liveSessions.map((session) => {
      const listed = listedById.get(session.sessionId);
      if (!listed) return session;
      listedById.delete(session.sessionId);
      return session;
    });
    return [...merged, ...listedById.values()];
  }, [listedChildren, liveSessions]);
};

export const useSubagentRows = (sessionId: string | null, directory: string | null): SubagentRow[] => {
  const providers = useConfigStore((state) => state.providers);
  const projects = useProjectsStore((state) => state.projects);
  const worktrees = useSessionUIStore((state) => state.availableWorktreesByProject);
  const statuses = useAllSessionStatuses();
  const workflowRuns = useSessionWorkflowRuns(sessionId);
  const workflowAgentIds = React.useMemo(
    () => new Set(workflowRuns.flatMap((run) => run.agents.flatMap((agent) => (agent.sessionId ? [agent.sessionId] : [])))),
    [workflowRuns],
  );
  const sessions = useSessionsWithListedChildren(sessionId);
  const children = React.useMemo(
    () => (sessionId ? sessions.filter((candidate) => (
      candidate.parentSessionId === sessionId
      && !workflowAgentIds.has(candidate.sessionId)
      && !isWorkflowAgentSession(candidate)
    )) : []),
    [sessions, sessionId, workflowAgentIds],
  );

  const liveSubagents = useSubagentsStore(
    React.useCallback((state) => (sessionId && state.byParent[sessionId] ? state.byParent[sessionId] : EMPTY_SUBAGENTS), [sessionId]),
  );

  React.useEffect(() => {
    if (!sessionId) return;
    void useSubagentsStore.getState().hydrateParent(sessionId);
  }, [sessionId]);

  const { perChildCost } = React.useMemo(() => computeRollup(sessions, sessionId), [sessions, sessionId]);

  const permissions = useDirectorySync(React.useCallback((state: State) => state.permission, []));
  const forms = useDirectorySync(React.useCallback((state: State) => state.form, []));
  const statusReady = useDirectorySync(
    React.useCallback((state: State) => state.sessionStatusReady === true, []),
    directory ?? undefined,
  );
  const statusInvalidated = useDirectorySync(
    React.useCallback((state: State) => state.sessionStatusInvalidated, []),
    directory ?? undefined,
  );

  const trackedIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const child of children) ids.add(child.sessionId);
    for (const sub of liveSubagents) {
      ids.add(sub.subagentId);
      if (sub.childSessionId) ids.add(sub.childSessionId);
    }
    return [...ids];
  }, [children, liveSubagents]);

  const observedChildren = useGlobalSessionStatusStore(React.useCallback((state) => trackedIds
    .flatMap((id) => {
      if (state.statusById.has(id)) return [`${id}\tbusy`];
      const observed = state.observedById.get(id);
      return observed ? [`${id}\t${observed.outcome === 'failed' ? 'failed' : 'settled'}`] : [];
    })
    .join('\n'), [trackedIds]));

  const indexedRequests = useGlobalBlockingRequestsStore(React.useCallback((state) => trackedIds
    .flatMap((id) => {
      const pending = state.bySession.get(id);
      if (!pending) return [];
      return [`${id}\t${pending.permissions.length > 0 ? 'p' : ''}${pending.forms.length > 0 ? 'f' : ''}`];
    })
    .join('\n'), [trackedIds]));

  const reports = useSubagentReports(sessionId, directory, children.length > 0 || liveSubagents.length > 0);

  return React.useMemo(() => {
    const observedById = new Map<string, string>();
    for (const line of observedChildren.split('\n')) {
      const [id, observed] = line.split('\t');
      if (id && observed) observedById.set(id, observed);
    }
    const requestsById = new Map<string, string>();
    for (const line of indexedRequests.split('\n')) {
      const [id, kinds] = line.split('\t');
      if (id && kinds) requestsById.set(id, kinds);
    }
    return deriveSubagentRows({
      children,
      liveSubagents,
      statuses,
      statusReady,
      statusInvalidated,
      observedById,
      requestsById,
      permissions,
      forms,
      perChildCost,
      reports,
      providers,
      projects,
      worktrees,
      directory,
      sessionId,
    });
  }, [
    children,
    directory,
    forms,
    indexedRequests,
    liveSubagents,
    observedChildren,
    perChildCost,
    permissions,
    projects,
    providers,
    sessionId,
    reports,
    statusInvalidated,
    statusReady,
    statuses,
    worktrees,
  ]);
};
