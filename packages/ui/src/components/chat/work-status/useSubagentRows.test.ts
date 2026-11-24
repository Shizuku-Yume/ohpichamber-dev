import { describe, expect, test } from 'bun:test';

import type { ApprovalRequest, Session, Subagent } from '@openchamber/agent-contract';
import type { SubagentReport } from './useSubagentReports';
import { deriveSubagentRows, isSubagentsSurfaceShown, resolveSubagentDisplayName, type DeriveSubagentRowsInput } from './useSubagentRows';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { formatSubagentLiveDetail } from './subagentActivity';

const session = (sessionId: string, overrides: Partial<Session> = {}): Session => ({
  sessionId,
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: 'dir',
  rootSessionId: 'parent',
  createdAt: 1,
  updatedAt: 1,
  epoch: 'epoch',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
  ...overrides,
});

const subagent = (overrides: Partial<Subagent> = {}): Subagent => ({
  subagentId: 'sub-1',
  parentSessionId: 'parent',
  role: 'scout',
  status: 'running',
  ...overrides,
});

const input = (overrides: Partial<DeriveSubagentRowsInput> = {}): DeriveSubagentRowsInput => ({
  children: [],
  liveSubagents: [],
  statuses: {},
  statusReady: false,
  statusInvalidated: undefined,
  observedById: new Map(),
  requestsById: new Map(),
  permissions: {},
  forms: {},
  perChildCost: new Map(),
  reports: new Map(),
  providers: [],
  projects: [],
  worktrees: new Map(),
  directory: '/dir',
  sessionId: 'parent',
  ...overrides,
});

describe('resolveSubagentDisplayName', () => {
  test('prefers the allocated name, then the child title, then the subagentId', () => {
    const child = session('child', { title: 'Settings audit' });
    expect(resolveSubagentDisplayName(subagent({ name: 'SettingsAuditScout' }), child)).toBe('SettingsAuditScout');
    expect(resolveSubagentDisplayName(subagent(), child)).toBe('Settings audit');
    expect(resolveSubagentDisplayName(subagent({ subagentId: 'Scout-7' }), undefined)).toBe('Scout-7');
  });

  test('never collapses distinct subagents to the same role label', () => {
    const scout1 = resolveSubagentDisplayName(subagent({ subagentId: 'scout-1', role: 'scout' }), undefined);
    const scout2 = resolveSubagentDisplayName(subagent({ subagentId: 'scout-2', role: 'scout' }), undefined);
    expect(scout1).not.toBe(scout2);
  });
});

describe('subagentElapsedMs', () => {
  test('uses the reported duration before any computed delta', () => {
    const row = deriveSubagentRows(input({
      liveSubagents: [subagent({ status: 'completed', durationMs: 4_200, createdAt: 0, updatedAt: 99_999 })],
    }))[0];
    expect(row.elapsedMs).toBe(4_200);
  });

  test('prefers subagent.updatedAt - subagent.createdAt over child session timestamps so settled rows do not tick with parent age', () => {
    const child = session('child', { createdAt: 1_000, updatedAt: 99_000 });
    const live = subagent({
      subagentId: 'BetaWorker-3',
      childSessionId: 'child',
      status: 'cancelled',
      createdAt: 10_000,
      updatedAt: 22_061,
    });
    const row = deriveSubagentRows(input({ children: [child], liveSubagents: [live] }))[0];
    expect(row.elapsedMs).toBe(12_061);
  });

  test('falls back to the child session lifetime', () => {
    const child = session('child', { createdAt: 10, updatedAt: 25 });
    const row = deriveSubagentRows(input({ children: [child], statuses: { child: 'idle' }, statusReady: true }))[0];
    expect(row.elapsedMs).toBe(15);
  });
});

describe('deriveSubagentRows', () => {
  test('merges live subagent records with child sessions by childSessionId', () => {
    const child = session('child-uuid', { title: 'Ignored title' });
    const live = subagent({ subagentId: 'NamedScout', name: 'Named Scout', childSessionId: 'child-uuid', status: 'running' });
    const [row] = deriveSubagentRows(input({ children: [child], liveSubagents: [live], statuses: { 'child-uuid': 'running' } }));
    expect(row.key).toBe('NamedScout');
    expect(row.childSessionId).toBe('child-uuid');
    expect(row.displayName).toBe('Named Scout');
    expect(row.busy).toBe(true);
  });

  test('keeps a settled subagent visible after its child session parks', () => {
    const live = subagent({ subagentId: 'ParkedScout', status: 'completed', childSessionId: 'gone', durationMs: 500 });
    const rows = deriveSubagentRows(input({ liveSubagents: [live] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].subagentId).toBe('ParkedScout');
    expect(rows[0].done).toBe(true);
    expect(rows[0].childSessionId).toBe('gone');
  });

  test('links an unresolved live record to its discovered child session by unique title', () => {
    const child = session('child-uuid', { title: 'scout' });
    const live = subagent({ subagentId: 'scout-1', role: 'scout', status: 'running' });
    const rows = deriveSubagentRows(input({ children: [child], liveSubagents: [live], statuses: { 'child-uuid': 'running' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].childSessionId).toBe('child-uuid');
    expect(rows[0].child?.sessionId).toBe('child-uuid');
  });

  test('never guesses between two same-role unresolved subagents and sessions', () => {
    const childA = session('child-a', { title: 'scout' });
    const childB = session('child-b', { title: 'scout' });
    const subA = subagent({ subagentId: 'scout-1', role: 'scout', status: 'running' });
    const subB = subagent({ subagentId: 'scout-2', role: 'scout', status: 'running' });
    const rows = deriveSubagentRows(input({ children: [childA, childB], liveSubagents: [subA, subB] }));
    // Ambiguous: keep all four records rather than fabricate a wrong merge.
    expect(rows).toHaveLength(4);
  });

  test('a pending permission on the resolved childSessionId marks the row blocked', () => {
    const blocker: ApprovalRequest = {
      version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a', sessionId: 'child-uuid', turnId: 'run', toolCallId: 'tool',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'bash', details: {}, status: 'pending', requestedAt: 1,
    };
    const live = subagent({ subagentId: 'scout-1', role: 'scout', status: 'running', childSessionId: 'child-uuid' });
    const rows = deriveSubagentRows(input({ liveSubagents: [live], permissions: { 'child-uuid': [blocker] } }));
    expect(rows[0].blocked).toBe(true);
    expect(rows[0].busy).toBe(true);
  });

  test('orders blockers first, then running, then finished', () => {
    const blocked = subagent({ subagentId: 'blocked', status: 'running' });
    const running = subagent({ subagentId: 'running', status: 'running', createdAt: 5 });
    const done = subagent({ subagentId: 'done', status: 'completed', createdAt: 9 });
    const blocker: ApprovalRequest = {
      version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a', sessionId: 'blocked', turnId: 'run', toolCallId: 'tool',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'bash', details: {}, status: 'pending', requestedAt: 1,
    };
    const rows = deriveSubagentRows(input({
      liveSubagents: [done, running, blocked],
      permissions: { blocked: [blocker] },
    }));
    expect(rows.map((row) => row.subagentId)).toEqual(['blocked', 'running', 'done']);
  });

  test('a root-keyed child approval stamped with subagent linkage marks the row blocked', () => {
    // The Agent Service attributes a child worker's pending approval to the
    // root session; its `subagentId`/`childSessionId` stamp is the row's link.
    const blocker: ApprovalRequest = {
      version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a-child', sessionId: 'parent', turnId: 'run', toolCallId: 'call_bash_b',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'sleep 12 && ls', details: {}, status: 'pending', requestedAt: 1,
      subagentId: 'BetaWorker-2', childSessionId: 'child-uuid',
    };
    const live = subagent({ subagentId: 'BetaWorker-2', role: 'task', status: 'running', childSessionId: 'child-uuid' });
    const rows = deriveSubagentRows(input({ liveSubagents: [live], permissions: { parent: [blocker] } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].blocked).toBe(true);
    expect(rows[0].busy).toBe(true);
    expect(rows[0].finished).toBe(false);
  });

  test('a root-keyed child approval still resolves by the child in-flight toolCallId', () => {
    const blocker: ApprovalRequest = {
      version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a-child', sessionId: 'parent', turnId: 'run', toolCallId: 'call_bash_b',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'sleep 12 && ls', details: {}, status: 'pending', requestedAt: 1,
    };
    const live = subagent({ subagentId: 'BetaWorker-2', role: 'task', status: 'running', childSessionId: 'child-uuid', activeTool: 'bash', activeToolCallId: 'call_bash_b' });
    const rows = deriveSubagentRows(input({ liveSubagents: [live], permissions: { parent: [blocker] } }));
    expect(rows[0].blocked).toBe(true);
  });

  test('an unlinked root-keyed approval does not block a sibling subagent row', () => {
    const blocker: ApprovalRequest = {
      version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a-root', sessionId: 'parent', turnId: 'run', toolCallId: 'call_root',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'ls', details: {}, status: 'pending', requestedAt: 1,
    };
    const live = subagent({ subagentId: 'AlphaScout', role: 'scout', status: 'running', childSessionId: 'child-uuid', activeToolCallId: 'call_other' });
    const rows = deriveSubagentRows(input({ liveSubagents: [live], permissions: { parent: [blocker] } }));
    expect(rows[0].blocked).toBe(false);
  });

  test('terminal subagent statuses are never pinned as blocked or asked by stale pending requests', () => {
    const staleApproval: ApprovalRequest = {
      version: '1', epoch: 'epoch', workerGeneration: 'worker', approvalId: 'a-stale', sessionId: 'parent', turnId: 'run', toolCallId: 'call_bash',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'sleep 15 && pwd', details: {}, status: 'pending', requestedAt: 1,
      subagentId: 'CancelledChild', childSessionId: 'child-cancelled',
    };
    const cancelled = subagent({ subagentId: 'CancelledChild', status: 'cancelled', childSessionId: 'child-cancelled', createdAt: 10 });
    const failed = subagent({ subagentId: 'FailedChild', status: 'failed', childSessionId: 'child-failed', createdAt: 9 });
    const completed = subagent({ subagentId: 'DoneChild', status: 'completed', childSessionId: 'child-done', createdAt: 8 });
    const running = subagent({ subagentId: 'RunningChild', status: 'running', childSessionId: 'child-running', createdAt: 5 });

    const rows = deriveSubagentRows(input({
      liveSubagents: [cancelled, failed, completed, running],
      statuses: { 'child-cancelled': 'awaiting_approval', 'child-failed': 'awaiting_input' },
      permissions: { parent: [staleApproval], 'child-cancelled': [staleApproval] },
      forms: {
        'child-failed': [{
          version: '1', epoch: 'epoch', workerGeneration: 'worker', questionId: 'q-stale', sessionId: 'child-failed', turnId: 'run', prompt: 'Continue?',
          status: 'pending', requestedAt: 1,
        }],
      },
    }));

    expect(rows.map((row) => row.subagentId)).toEqual(['RunningChild', 'CancelledChild', 'FailedChild', 'DoneChild']);
    const cancelledRow = rows.find((row) => row.subagentId === 'CancelledChild')!;
    expect(cancelledRow.blocked).toBe(false);
    expect(cancelledRow.asked).toBe(false);
    expect(cancelledRow.cancelled).toBe(true);
    expect(cancelledRow.finished).toBe(true);
    const failedRow = rows.find((row) => row.subagentId === 'FailedChild')!;
    expect(failedRow.asked).toBe(false);
    expect(failedRow.failed).toBe(true);
    expect(failedRow.finished).toBe(true);
  });
  test('looks up a report by subagentId for the row tooltip', () => {
    const report: SubagentReport = { subagentId: 'S1', state: 'completed', output: '## Summary\nAll clear.' };
    const rows = deriveSubagentRows(input({
      liveSubagents: [subagent({ subagentId: 'S1', status: 'completed', durationMs: 10 })],
      reports: new Map([['S1', report]]),
    }));
    expect(rows[0].report).toBe(report);
    expect(rows[0].reportLine).toBe('Summary');
  });

  test('derives clean name, role/model subtitle, tokens/cost/duration, and report for vibe workers', () => {
    const child = session('uuid-vibe-2', { title: 'home-disk-usage-2', createdAt: 1000, updatedAt: 9000 });
    const live = subagent({
      subagentId: 'home-disk-usage-2',
      childSessionId: 'uuid-vibe-2',
      name: 'home-disk-usage-2',
      role: 'sonic',
      model: 'openai/gpt-5.4-mini',
      status: 'completed',
      activeTool: 'bash',
      tokens: 18400,
      cost: 0.0123,
      durationMs: 4800,
    });
    const report: SubagentReport = {
      subagentId: 'home-disk-usage-2',
      childSessionId: 'uuid-vibe-2',
      state: 'completed',
      output: '### Disk Usage\nAll clear.',
    };
    const [row] = deriveSubagentRows(input({
      children: [child],
      liveSubagents: [live],
      reports: new Map([['home-disk-usage-2', report]]),
    }));
    expect(row.displayName).toBe('home-disk-usage-2');
    expect(row.role).toBe('sonic');
    expect(row.identity).toBe('sonic · GPT-5.4 Mini');
    expect(row.tokens).toBe(18400);
    expect(row.cost).toBe(0.0123);
    expect(row.elapsedMs).toBe(4800);
    expect(row.reportLine).toBe('Disk Usage');
    expect(row.done).toBe(true);
  });
});

describe('formatSubagentLiveDetail', () => {
  const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;

  test('shows the retry countdown while a live record is retrying', () => {
    const line = formatSubagentLiveDetail(subagent({ retryCountdown: 30 }), false, t, 'en');
    expect(line?.text).toContain('chat.agentStatus.retry.in');
    expect(line?.tone).toBe('warning');
  });

  test('shows the active tool with its argument', () => {
    const line = formatSubagentLiveDetail(subagent({ activeTool: 'bash', activeToolArgs: 'ls -la' }), false, t, 'en');
    expect(line?.text).toBe('bash ls -la');
  });

  test('suppresses non-warning detail in alertsOnly mode', () => {
    expect(formatSubagentLiveDetail(subagent({ activeTool: 'bash' }), true, t, 'en')).toBeNull();
    expect(formatSubagentLiveDetail(subagent({ retryCountdown: 5 }), true, t, 'en')).not.toBeNull();
  });
});

describe('isSubagentsSurfaceShown', () => {
  test('matches rail visibility for open tabs and live or listed subagents', () => {
    expect(isSubagentsSurfaceShown([], 'parent', [])).toBe(false);
    expect(isSubagentsSurfaceShown([{ mode: 'subagents' }], null, [])).toBe(true);
    expect(isSubagentsSurfaceShown([], 'parent', [session('child-1', { parentSessionId: 'parent' })])).toBe(true);
    expect(isSubagentsSurfaceShown([], 'parent', [session('wf-1', {
      parentSessionId: 'parent',
      // SAFETY: test fixture exercises runtime parser for workflow-agent metadata absent from SessionMetadata schema.
      metadata: { openchamber: { kind: 'workflow-agent' } } as unknown as Session['metadata'],
    })])).toBe(false);

    useSubagentsStore.getState().setSubagents('parent', [subagent()]);
    try {
      expect(isSubagentsSurfaceShown([], 'parent', [])).toBe(true);
    } finally {
      useSubagentsStore.getState().clearSession('parent');
    }
  });
});
