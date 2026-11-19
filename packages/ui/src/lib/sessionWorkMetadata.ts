<<<<<<< HEAD
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { hostReviewOfferAt, hostTurnEndedAt } from './sessionSourceClock';
||||||| bc50ba56aa
import { z } from 'zod';
import type { Metadata, Session } from '@/lib/opencode/model';
=======
import { z } from 'zod';
import { parseMetadata } from '@/lib/metadataParse';
import type { Metadata, Session } from '@/lib/opencode/model';
>>>>>>> upstream/main

<<<<<<< HEAD
export type SessionWork = NonNullable<NonNullable<SessionMetadata['openchamber']>['work']>;
||||||| bc50ba56aa
/**
 * "In work", stored under `session.metadata.openchamber.work`. The server's
 * session-work runtime opens a session when the user sends a message in it
 * and stamps `suggestDoneAt` when Jev says a turn looks like the end of the
 * work; the user alone closes. The review offer (`session.metadata.openchamber.reviewOffer`) is
 * written by the same runtime but does not depend on work. The shape is owned by `packages/web/server/lib/session-work/state.js`.
 */
const workSchema = z.object({
  state: z.enum(['open', 'done']),
  openedAt: z.number().optional(),
  // `auto` for a sent message, `user` for Track; `jev` on older records.
  openedBy: z.enum(['auto', 'jev', 'user']).optional(),
  doneAt: z.number().optional(),
  suggestDoneAt: z.number().optional(),
});

export type SessionWork = z.infer<typeof workSchema>;

const namespaceSchema = z.object({ openchamber: z.object({ work: workSchema }) });
=======
const workSchema = z.object({
  state: z.enum(['open', 'done']),
  openedAt: z.number().optional(),
  openedBy: z.enum(['auto', 'jev', 'user']).optional(),
  doneAt: z.number().optional(),
  suggestDoneAt: z.number().optional(),
});

export type SessionWork = z.infer<typeof workSchema>;

const namespaceSchema = z.object({ openchamber: z.object({ work: workSchema }) });
>>>>>>> upstream/main

export function getSessionWork(session: Session | null | undefined): SessionWork | null {
<<<<<<< HEAD
  return session?.metadata?.openchamber?.work ?? null;
||||||| bc50ba56aa
  return namespaceSchema.safeParse(session?.metadata).data?.openchamber.work ?? null;
=======
  return parseMetadata(namespaceSchema, session?.metadata).data?.openchamber.work ?? null;
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Membership in the sidebar's "In work" block. */
||||||| bc50ba56aa
const inWorkSchema = z.object({ openchamber: z.object({ work: z.object({ state: z.literal('open') }) }) });

/** Membership in the sidebar's "In work" block. */
=======
const inWorkSchema = z.object({ openchamber: z.object({ work: z.object({ state: z.literal('open') }) }) });

>>>>>>> upstream/main
export function isSessionInWork(session: Session | null | undefined): boolean {
<<<<<<< HEAD
  return getSessionWork(session)?.state === 'open';
||||||| bc50ba56aa
  return inWorkSchema.safeParse(session?.metadata).success;
=======
  return parseMetadata(inWorkSchema, session?.metadata).success;
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Whether the Host's done hint was written after the last turn ended. */
||||||| bc50ba56aa
/**
 * Whether Jev's "looks done" hint is current. The server writes it after a
 * turn ended and deletes it when the next one starts; the `time.idle` check
 * retires a hint that outlived that (another process, a missed event), the
 * same rule the session assist uses. Callers still hide it while a turn runs.
 */
=======
>>>>>>> upstream/main
export function isDoneSuggested(session: Session | null | undefined): boolean {
  const work = getSessionWork(session);
  return work?.state === 'open' && isHintCurrent(session, work.suggestDoneAt);
}

<<<<<<< HEAD
||||||| bc50ba56aa
const reviewOfferSchema = z.object({ openchamber: z.object({ reviewOffer: z.object({ at: z.number() }) }) });

/**
 * Whether Jev's "changes are ready to look over" offer is current: the same
 * freshness rule, and a current done hint takes the slot instead.
 */
=======
const reviewOfferSchema = z.object({ openchamber: z.object({ reviewOffer: z.object({ at: z.number() }) }) });

>>>>>>> upstream/main
export function isReviewSuggested(session: Session | null | undefined): boolean {
<<<<<<< HEAD
  const offeredAt = hostReviewOfferAt(session);
||||||| bc50ba56aa
  const offeredAt = reviewOfferSchema.safeParse(session?.metadata).data?.openchamber.reviewOffer.at;
=======
  const offeredAt = parseMetadata(reviewOfferSchema, session?.metadata).data?.openchamber.reviewOffer.at;
>>>>>>> upstream/main
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

<<<<<<< HEAD
export function withSessionWorkState(metadata: SessionMetadata, state: SessionWork['state'], now: number): SessionMetadata {
  const namespace = metadata.openchamber ?? {};
  const current = namespace.work ?? null;
||||||| bc50ba56aa
const openchamberSchema = z.object({ openchamber: z.record(z.string(), z.json()) });

/**
 * The metadata after the user tracked the session (`open`) or marked it done.
 * Done keeps when and by whom the work was opened and drops Jev's hints.
 */
export function withSessionWorkState(metadata: Metadata, state: SessionWork['state'], now: number): Metadata {
  const namespace = openchamberSchema.safeParse(metadata).data?.openchamber ?? {};
  const current = namespaceSchema.safeParse(metadata).data?.openchamber.work ?? null;
=======
const openchamberSchema = z.object({ openchamber: z.record(z.string(), z.json()) });

export function withSessionWorkClosed(metadata: Metadata, now: number): Metadata {
  return inWorkSchema.safeParse(metadata).success ? withSessionWorkState(metadata, 'done', now) : metadata;
}

export function withSessionWorkState(metadata: Metadata, state: SessionWork['state'], now: number): Metadata {
  const namespace = openchamberSchema.safeParse(metadata).data?.openchamber ?? {};
  const current = namespaceSchema.safeParse(metadata).data?.openchamber.work ?? null;
>>>>>>> upstream/main
  if (current?.state === state) return metadata;
  if (state === 'open') {
    return { ...metadata, openchamber: { ...namespace, work: { state: 'open', openedAt: now, openedBy: 'user' } } };
  }
  const work: SessionWork = { state: 'done', doneAt: now };
  if (current?.openedAt !== undefined) work.openedAt = current.openedAt;
  if (current?.openedBy !== undefined) work.openedBy = current.openedBy;
  return { ...metadata, openchamber: { ...namespace, work } };
}
