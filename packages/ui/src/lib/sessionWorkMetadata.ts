import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { hostReviewOfferAt, hostTurnEndedAt } from './sessionSourceClock';

export type SessionWork = NonNullable<NonNullable<SessionMetadata['openchamber']>['work']>;

export function getSessionWork(session: Session | null | undefined): SessionWork | null {
  return session?.metadata?.openchamber?.work ?? null;
}

/** Membership in the sidebar's "In work" block. */
export function isSessionInWork(session: Session | null | undefined): boolean {
  return getSessionWork(session)?.state === 'open';
}

export function isDoneSuggested(session: Session | null | undefined): boolean {
  const work = getSessionWork(session);
  return work?.state === 'open' && isHintCurrent(session, work.suggestDoneAt);
}

export function isReviewSuggested(session: Session | null | undefined): boolean {
  const offeredAt = hostReviewOfferAt(session);
  return isHintCurrent(session, offeredAt) && !isDoneSuggested(session);
}

/**
 * Hints are written by the Host after a turn settles, so they are current while
 * no newer Host turn end exists. Comparing them with the native file mtime
 * compared two clocks and dropped hints on any unrelated touch of the file.
 */
function isHintCurrent(session: Session | null | undefined, writtenAt: number | null | undefined): boolean {
  if (session === null || session === undefined || writtenAt === null || writtenAt === undefined) return false;
  const endedAt = hostTurnEndedAt(session);
  return endedAt === undefined || writtenAt >= endedAt;
}

export function withSessionWorkState(metadata: SessionMetadata, state: SessionWork['state'], now: number): SessionMetadata {
  const namespace = metadata.openchamber ?? {};
  const current = namespace.work ?? null;
  if (current?.state === state) return metadata;
  if (state === 'open') {
    return { ...metadata, openchamber: { ...namespace, work: { state: 'open', openedAt: now, openedBy: 'user' } } };
  }
  const work: SessionWork = { state: 'done', doneAt: now };
  if (current?.openedAt !== undefined) work.openedAt = current.openedAt;
  if (current?.openedBy !== undefined) work.openedBy = current.openedBy;
  return { ...metadata, openchamber: { ...namespace, work } };
}
