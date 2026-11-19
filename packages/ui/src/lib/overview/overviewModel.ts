import type { Session } from '@openchamber/agent-contract';
import { getCurrentSessionAssist } from '@/lib/sessionAssistMetadata';
import { isDoneSuggested, isSessionInWork } from '@/lib/sessionWorkMetadata';
import type { PrVisualSummary } from '@/stores/useGitHubPrStatusStore';
import { isSessionUnread } from '@/sync/session-unread';
import type { WorktreeMetadata } from '@/types/worktree';

export const OVERVIEW_STALLED_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const OVERVIEW_STALE_WORKTREE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
export const OVERVIEW_UNTRACKED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

<<<<<<< HEAD
/**
 * What keeps a session's turn open (see `useSessionTurnActivity`), or that the
 * user asked to follow a pull request from it.
 */
export type OverviewActivity = 'running' | 'subagent' | 'shell' | 'pullRequest';
||||||| bc50ba56aa
/** What keeps a session's turn open (see `useSessionTurnActivity`). */
export type OverviewActivity = 'running' | 'subagent' | 'shell' | 'image' | 'pullRequest';
=======
export type OverviewActivity = 'running' | 'subagent' | 'shell' | 'image' | 'pullRequest' | 'extensionWait';
>>>>>>> upstream/main

export type OverviewBlocking = 'permission' | 'question';

export type OverviewSessionFacts = {
<<<<<<< HEAD
 session: Session;
 activity: OverviewActivity | null;
 /** A request of the session or of a subagent below it. */
 blocking: OverviewBlocking | null;
 /** The worktree branch's PR and the PRs linked to the session, whose state is known. */
 prs: readonly PrVisualSummary[];
 /** One of those PRs has no known state yet; a merged neighbour then proves nothing. */
 prsPending: boolean;
 /** Linked issues and tickets: open, completed, dropped (not planned, canceled), or null while unknown. */
 issues: ReadonlyArray<'open' | 'completed' | 'dropped' | null>;
 /** Uncommitted files in the session's own linked worktree; null outside one or before git answered. */
 worktreeDirty: boolean | null;
||||||| bc50ba56aa
  session: Session;
  activity: OverviewActivity | null;
  /** A request of the session or of a subagent below it. */
  blocking: OverviewBlocking | null;
  /** The worktree branch's PR and the PRs linked to the session, whose state is known. */
  prs: readonly PrVisualSummary[];
  /** One of those PRs has no known state yet; a merged neighbour then proves nothing. */
  prsPending: boolean;
  /** Linked issues and tickets: open, completed, dropped (not planned, canceled), or null while unknown. */
  issues: ReadonlyArray<'open' | 'completed' | 'dropped' | null>;
  /** Uncommitted files in the session's own linked worktree; null outside one or before git answered. */
  worktreeDirty: boolean | null;
=======
  session: Session;
  activity: OverviewActivity | null;
  blocking: OverviewBlocking | null;
  prs: readonly PrVisualSummary[];
  prsPending: boolean;
  issues: ReadonlyArray<'open' | 'completed' | 'dropped' | null>;
  worktreeDirty: boolean | null;
>>>>>>> upstream/main
};

export type OverviewWaitingReason = 'permission' | 'question' | 'error' | 'checks' | 'conflict' | 'finished';
export type OverviewDoneSignal = 'merged' | 'issueClosed' | 'issueDropped' | 'hint';
export type OverviewVeto = 'failed' | 'suggestion' | 'uncommitted';

export type OverviewSessionRow =
<<<<<<< HEAD
 /** `pr` is the blocked change request behind a `conflict` or `checks` reason, so the page can open it. */
 | { section: 'waiting'; session: Session; reason: OverviewWaitingReason; pr: PrVisualSummary | null }
 | { section: 'running'; session: Session; activity: OverviewActivity }
 | { section: 'done'; session: Session; signal: OverviewDoneSignal }
 /** In work and idle, with no done signal or a veto against it. `stalled` once nothing happened for days. */
 | { section: 'working'; session: Session; signal: OverviewDoneSignal | null; veto: OverviewVeto | null; stalled: boolean };
||||||| bc50ba56aa
  /** `pr` is the blocked change request behind a `conflict` or `checks` reason, so the page can open it. */
  | { section: 'waiting'; session: Session; reason: OverviewWaitingReason; pr: PrVisualSummary | null }
  | { section: 'running'; session: Session; activity: OverviewActivity }
  | { section: 'done'; session: Session; signal: OverviewDoneSignal }
  /** In work and idle, with no done signal or a veto against it. `stalled` once nothing happened for days. */
  | { section: 'working'; session: Session; signal: OverviewDoneSignal | null; veto: OverviewVeto | null; stalled: boolean };
=======
  | { section: 'waiting'; session: Session; reason: OverviewWaitingReason; pr: PrVisualSummary | null }
  | { section: 'running'; session: Session; activity: OverviewActivity }
  | { section: 'done'; session: Session; signal: OverviewDoneSignal }
  | { section: 'working'; session: Session; signal: OverviewDoneSignal | null; veto: OverviewVeto | null; stalled: boolean };
>>>>>>> upstream/main

const sessionKind = (session: Session): string | null => session.metadata?.openchamber?.kind ?? null;

const blockedReason = (prs: readonly PrVisualSummary[]): { reason: 'checks' | 'conflict'; pr: PrVisualSummary } | null => {
 const blocked = prs.find((pr) => pr.visualState === 'blocked');
 if (!blocked) return null;
 return { reason: blocked.mergeableState !== 'dirty' && blocked.checks?.state === 'failure' ? 'checks' : 'conflict', pr: blocked };
};

export const isOverviewFollowed = (session: Session, context: { workEnabled: boolean; now: number }): boolean => (
 // oxlint-disable-next-line openchamber/no-cross-source-time-compare -- a two-week display window, where clock skew in seconds cannot change the answer and no Host-sourced clock spans the whole list
 context.workEnabled ? isSessionInWork(session) : context.now - session.updatedAt < OVERVIEW_UNTRACKED_WINDOW_MS
);

const doneSignalOf = (facts: OverviewSessionFacts): OverviewDoneSignal | null => {
 const merged = facts.prs.some((pr) => pr.prState === 'merged');
 if (merged && !facts.prsPending && !facts.prs.some((pr) => pr.prState === 'open')) return 'merged';
 if (facts.issues.length > 0 && facts.issues.every((state) => state === 'completed' || state === 'dropped')) {
  return facts.issues.includes('completed') ? 'issueClosed' : 'issueDropped';
 }
 return isDoneSuggested(facts.session) ? 'hint' : null;
};

const vetoOf = (facts: OverviewSessionFacts): OverviewVeto | null => {
 if (facts.session.runtimeStatus === 'unavailable') return 'failed';
 if (getCurrentSessionAssist(facts.session)?.suggestion) return 'suggestion';
 return facts.worktreeDirty === true ? 'uncommitted' : null;
};

export function classifyOverviewSession(
 facts: OverviewSessionFacts,
 context: { workEnabled: boolean; now: number },
): OverviewSessionRow | null {
<<<<<<< HEAD
 const { session } = facts;
 const kind = sessionKind(session);
 if (session.parentSessionId || session.archivedAt !== undefined) return null;
||||||| bc50ba56aa
  const { session } = facts;
  const kind = sessionKind(session);
  // A `/btw` side question belongs to the session it was asked in.
  if (session.parentID || session.time.archived !== undefined || kind === 'btw') return null;
=======
  const { session } = facts;
  const kind = sessionKind(session);
  if (session.parentID || session.time.archived !== undefined || kind === 'btw') return null;
>>>>>>> upstream/main

 if (facts.blocking) return { section: 'waiting', session, reason: facts.blocking, pr: null };
 if (facts.activity) return { section: 'running', session, activity: facts.activity };

 const inWork = context.workEnabled && isSessionInWork(session);
 const followed = isOverviewFollowed(session, context);
 const unread = isSessionUnread(session);
 if (unread && session.runtimeStatus === 'unavailable' && (followed || kind === 'review')) {
  return { section: 'waiting', session, reason: 'error', pr: null };
 }
 if (!followed) return null;
 const blocked = blockedReason(facts.prs);
 if (blocked) return { section: 'waiting', session, reason: blocked.reason, pr: blocked.pr };
 if (unread) return { section: 'waiting', session, reason: 'finished', pr: null };
 if (!inWork) return null;

 const signal = doneSignalOf(facts);
 const veto = vetoOf(facts);
 if (signal && !veto) return { section: 'done', session, signal };
 // oxlint-disable-next-line openchamber/no-cross-source-time-compare -- a three-day "nothing happened" label; seconds of skew are immaterial
 return { section: 'working', session, signal, veto, stalled: context.now - session.updatedAt >= OVERVIEW_STALLED_AFTER_MS };
}

const WAITING_ORDER = {
 permission: 0,
 question: 1,
 error: 2,
 conflict: 3,
 checks: 4,
 finished: 5,
} satisfies Record<OverviewWaitingReason, number>;

const updatedAt = (session: Session): number => session.updatedAt;
const newestFirst = (left: { session: Session }, right: { session: Session }) => updatedAt(right.session) - updatedAt(left.session);

export type OverviewSessionSections = {
<<<<<<< HEAD
 waiting: Array<Extract<OverviewSessionRow, { section: 'waiting' }>>;
 running: Array<Extract<OverviewSessionRow, { section: 'running' }>>;
 done: Array<Extract<OverviewSessionRow, { section: 'done' }>>;
 /** In work, idle, not done, recent. */
 working: Array<Extract<OverviewSessionRow, { section: 'working' }>>;
 /** In work, idle, not done, untouched for days. */
 stalled: Array<Extract<OverviewSessionRow, { section: 'working' }>>;
||||||| bc50ba56aa
  waiting: Array<Extract<OverviewSessionRow, { section: 'waiting' }>>;
  running: Array<Extract<OverviewSessionRow, { section: 'running' }>>;
  done: Array<Extract<OverviewSessionRow, { section: 'done' }>>;
  /** In work, idle, not done, recent. */
  working: Array<Extract<OverviewSessionRow, { section: 'working' }>>;
  /** In work, idle, not done, untouched for days. */
  stalled: Array<Extract<OverviewSessionRow, { section: 'working' }>>;
=======
  waiting: Array<Extract<OverviewSessionRow, { section: 'waiting' }>>;
  running: Array<Extract<OverviewSessionRow, { section: 'running' }>>;
  done: Array<Extract<OverviewSessionRow, { section: 'done' }>>;
  working: Array<Extract<OverviewSessionRow, { section: 'working' }>>;
  stalled: Array<Extract<OverviewSessionRow, { section: 'working' }>>;
>>>>>>> upstream/main
};

export function buildOverviewSessionSections(
 facts: readonly OverviewSessionFacts[],
 context: { workEnabled: boolean; now: number },
): OverviewSessionSections {
 const sections: OverviewSessionSections = { waiting: [], running: [], done: [], working: [], stalled: [] };
 for (const entry of facts) {
  const row = classifyOverviewSession(entry, context);
  if (!row) continue;
  if (row.section === 'waiting') sections.waiting.push(row);
  else if (row.section === 'running') sections.running.push(row);
  else if (row.section === 'done') sections.done.push(row);
  else if (row.stalled) sections.stalled.push(row);
  else sections.working.push(row);
 }
 sections.waiting.sort((left, right) => (WAITING_ORDER[left.reason] - WAITING_ORDER[right.reason]) || newestFirst(left, right));
 sections.running.sort(newestFirst);
 sections.done.sort(newestFirst);
 sections.working.sort(newestFirst);
 sections.stalled.sort(newestFirst);
 return sections;
}

export const overviewLeftOutOfDone = (sections: OverviewSessionSections) => (
 [...sections.working, ...sections.stalled].filter((row) => row.signal !== null)
);

export type OverviewWorktreeLosses = { uncommittedFiles: number; unpushed: boolean | null };

export const isNothingLost = (losses: OverviewWorktreeLosses): boolean => losses.uncommittedFiles === 0 && losses.unpushed === false;

export type OverviewWorktreeFacts = {
<<<<<<< HEAD
 worktree: WorktreeMetadata;
 project: { id: string; path: string };
 /** The branch's change request, or `unknown` while its state has not been read. */
 pr: 'merged' | 'open' | 'closed' | 'none' | 'unknown';
 /** The merged change request's last commit; removal checks nothing is past it. */
 mergedHeadSha: string | null;
 /** Sessions working there, subsessions included. */
 sessions: readonly Session[];
 /** A session there is running or on screen, or the worktree is the directory on screen. */
 inUse: boolean;
 /** Null until git answered; nothing is offered on a guess. */
 git: { losses: OverviewWorktreeLosses; lastCommitAt: number | null } | null;
||||||| bc50ba56aa
  worktree: WorktreeMetadata;
  project: { id: string; path: string };
  /** The branch's change request, or `unknown` while its state has not been read. */
  pr: 'merged' | 'open' | 'closed' | 'none' | 'unknown';
  /** The merged change request's last commit; removal checks nothing is past it. */
  mergedHeadSha: string | null;
  /** Sessions working there, subsessions included. */
  sessions: readonly Session[];
  /** A session there is running or on screen, or the worktree is the directory on screen. */
  inUse: boolean;
  /** Null until git answered; nothing is offered on a guess. */
  git: { losses: OverviewWorktreeLosses; lastCommitAt: number | null } | null;
=======
  worktree: WorktreeMetadata;
  project: { id: string; path: string };
  pr: 'merged' | 'open' | 'closed' | 'none' | 'unknown';
  mergedHeadSha: string | null;
  sessions: readonly Session[];
  inUse: boolean;
  git: { losses: OverviewWorktreeLosses; lastCommitAt: number | null } | null;
>>>>>>> upstream/main
};

export type OverviewCleanupRow = {
 kind: 'merged' | 'stale';
 facts: OverviewWorktreeFacts;
 losses: OverviewWorktreeLosses;
};

export function classifyOverviewWorktree(
 facts: OverviewWorktreeFacts,
 context: { workEnabled: boolean; now: number },
): OverviewCleanupRow | null {
 if (facts.inUse || !facts.git) return null;
 if (context.workEnabled && facts.sessions.some((session) => !session.parentSessionId && isSessionInWork(session))) return null;
 const { losses, lastCommitAt } = facts.git;
 if (facts.pr === 'merged') return { kind: 'merged', facts, losses };
 if (facts.pr !== 'none' && facts.pr !== 'closed') return null;
 const lastActivity = Math.max(lastCommitAt ?? 0, ...facts.sessions.map(updatedAt));
 if (lastActivity === 0 || context.now - lastActivity < OVERVIEW_STALE_WORKTREE_AFTER_MS) return null;
 return { kind: 'stale', facts, losses };
}
