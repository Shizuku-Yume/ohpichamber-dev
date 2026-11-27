import { z } from 'zod';
import { isRecord } from '../shared/guards.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const workSchema = z.object({
  state: z.enum(['open', 'done']),
  openedAt: z.number().optional(),
  openedBy: z.enum(['jev', 'user']).optional(),
  doneAt: z.number().optional(),
  suggestDoneAt: z.number().optional(),
});

export type SessionWorkRecord = z.infer<typeof workSchema>;

const metadataSchema = z.object({ openchamber: z.object({ work: workSchema }) });
const reviewOfferSchema = z.object({ openchamber: z.object({ reviewOffer: z.object({ at: z.number() }) }) });

export type SessionWorkPatch = {
  openchamber: JsonObject;
};

export const readWork = (metadata: JsonValue | null | undefined): SessionWorkRecord | null => (
  metadataSchema.safeParse(metadata).data?.openchamber.work ?? null
);

const patchOf = (work: JsonObject): SessionWorkPatch => ({ openchamber: { work } });

export const isPinnedMetadata = (metadata: JsonValue | null | undefined): boolean => (
  isRecord(metadata) && Boolean(metadata.isPinned || (isRecord(metadata.openchamber) && metadata.openchamber.pinned))
);

export const userStatePatch = (
  metadata: JsonValue | null | undefined,
  { state, now }: { state: 'open' | 'done'; now: number },
): SessionWorkPatch | null => {
  if (readWork(metadata)?.state === state || (state === 'open' && isPinnedMetadata(metadata))) return null;
  return patchOf(state === 'open'
    ? { state: 'open', openedAt: now, openedBy: 'user', doneAt: null, suggestDoneAt: null }
    : { state: 'done', doneAt: now, suggestDoneAt: null });
};

export const openByJevPatch = (
  metadata: JsonValue | null | undefined,
  { requestAt, now }: { requestAt: number; now: number },
): SessionWorkPatch | null => {
  const work = readWork(metadata);
  if (work?.state === 'open') return null;
  if (work?.state === 'done' && Number.isFinite(requestAt) && (work.doneAt ?? 0) >= requestAt) return null;
  return patchOf({ state: 'open', openedAt: now, openedBy: 'jev', doneAt: null, suggestDoneAt: null });
};

export const suggestDonePatch = (
  metadata: JsonValue | null | undefined,
  { now }: { now: number },
): SessionWorkPatch | null => {
  if (readWork(metadata)?.state !== 'open') return null;
  return patchOf({ suggestDoneAt: now });
};

export const offerReviewPatch = (
  _metadata: JsonValue | null | undefined,
  { now }: { now: number },
): SessionWorkPatch => ({ openchamber: { reviewOffer: { at: now } } });

export const clearSuggestionPatch = (metadata: JsonValue | null | undefined): SessionWorkPatch | null => {
  const patch: JsonObject = {};
  if (readWork(metadata)?.suggestDoneAt !== undefined) patch.work = { suggestDoneAt: null };
  if (reviewOfferSchema.safeParse(metadata).success) patch.reviewOffer = null;
  return Object.keys(patch).length > 0 ? { openchamber: patch } : null;
};
