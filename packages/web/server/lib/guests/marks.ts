import { SERVICE_MARKS_MAX, isGuestApproved, requestedGuestCapabilities } from 'ohpichamber-sdk';

import { guestIdOfServiceToken } from './service.js';
import type { serviceHostCallSchema } from 'ohpichamber-sdk/schemas';
import { z } from 'zod';
import type { GuestRecord } from './contracts.js';
import { isString } from './input-guards.js';

type MarkInput = Extract<z.infer<typeof serviceHostCallSchema>, { method: 'marks.set' }>['input'];
type MarkTarget = { sessionId?: string; directory?: string; branch?: string | undefined };
type MarkEntry = { target: MarkInput['target']; mark: NonNullable<MarkInput['mark']> };

const targetKey = (target: MarkTarget) => (isString(target.sessionId)
  ? JSON.stringify(['session', target.sessionId])
  : JSON.stringify(['directory', target.directory, target.branch ?? null]));

const sameMark = (a: MarkEntry['mark'], b: MarkEntry['mark']) => a.icon === b.icon && a.tone === b.tone && a.text === b.text && (a.url ?? null) === (b.url ?? null);

export const mayGuestShowMarks = (guest: GuestRecord) => guest.marks === true
  && guest.enabled !== false
  && guest.capabilityGrants?.includes('marks') === true
  && isGuestApproved({ requested: requestedGuestCapabilities(guest), granted: guest.capabilityGrants });

export const createGuestMarks = ({ guestIdOfToken = guestIdOfServiceToken }: { guestIdOfToken?: (token: string) => string | null } = {}) => {
  const held = new Map<string, { token: string; marks: Map<string, MarkEntry> }>();

  const current = (guestId: string) => {
    const entry = held.get(guestId);
    if (!entry) return null;
    if (guestIdOfToken(entry.token) === guestId) return entry;
    held.delete(guestId);
    return null;
  };

  return {
    set: (guestId: string, token: string, target: MarkInput['target'], mark: MarkInput['mark'], mayChange = () => true): 'changed' | 'unchanged' | 'full' | 'limited' | 'ended' => {
      if (guestIdOfToken(token) !== guestId) return 'ended';
      const entry = current(guestId);
      const marks = entry?.token === token ? entry.marks : new Map<string, MarkEntry>();
      const key = targetKey(target);
      const previous = marks.get(key);
      if (mark === null) {
        if (!previous) return 'unchanged';
        if (!mayChange()) return 'limited';
        marks.delete(key);
        if (marks.size === 0) held.delete(guestId);
        return 'changed';
      }
      if (previous && sameMark(previous.mark, mark)) return 'unchanged';
      if (!previous && marks.size >= SERVICE_MARKS_MAX) return 'full';
      if (!mayChange()) return 'limited';
      marks.set(key, { target, mark });
      held.set(guestId, { token, marks });
      return 'changed';
    },

    clearGuest: (guestId: string) => held.delete(guestId),

    dropEnded: (guestId: string) => held.has(guestId) && current(guestId) === null,

    list: (guestId: string) => [...(current(guestId)?.marks.values() ?? [])],
  };
};

export const guestMarks = createGuestMarks();

export const guestMarksChangedPropertiesSchema = z.object({
  guestId: z.string().min(1),
  target: z.union([
    z.object({ sessionId: z.string().min(1) }).strict(),
    z.object({ directory: z.string().min(1), branch: z.string().min(1).optional() }).strict(),
  ]),
}).strict();

export type GuestMarksChangedProperties = z.infer<typeof guestMarksChangedPropertiesSchema>;

export const buildGuestMarksChangedEvent = (guestId: string, target: MarkInput['target']): { type: string; properties: GuestMarksChangedProperties } | null => {
  const parsed = guestMarksChangedPropertiesSchema.safeParse({ guestId, target });
  if (!parsed.success) return null;
  return { type: 'openchamber:guest-marks-changed', properties: parsed.data };
};
