import {
 GUEST_ITEM_MESSAGE_TEXT_MAX,
 GUEST_ITEM_SESSION_MAX,
 type GuestActionContribution,
 type GuestActionRole,
 type GuestItemRole,
 type GuestMessageItem,
 type GuestSessionItem,
 type GuestSessionItemMessage,
} from 'ohpichamber-sdk';

import type { Message } from '@openchamber/agent-contract';
import type { IconName } from '@/components/icon/icons';
import { formatMessageRecordText } from '@/lib/exportSession';

import { isGuestActive } from './capabilities.ts';
import { guestPackageIconSrc, resolveGuestIconName } from './icon.ts';
import type { InstalledGuest } from './types.ts';

export type GuestActionEntry = {
 guest: InstalledGuest;
 action: GuestActionContribution;
 icon: IconName;
 iconSrc?: string;
};

export const guestActionEntries = (
 guests: readonly InstalledGuest[],
 authenticatedAsset: (path: string) => string,
): GuestActionEntry[] => {
 const entries: GuestActionEntry[] = [];
 for (const guest of guests) {
  if (!isGuestActive(guest) || (!guest.entry && !guest.backgroundEntry) || !guest.actions?.length) continue;
  for (const action of guest.actions) {
   if (action.mode !== 'background' && !guest.entry) continue;
   const icon = action.icon ?? guest.icon;
   entries.push({
    guest,
    action,
    icon: resolveGuestIconName(icon),
    iconSrc: guestPackageIconSrc(guest.id, icon, authenticatedAsset),
   });
  }
 }
 return entries;
};

export const guestMessageActionsFor = (
 entries: readonly GuestActionEntry[],
 role: GuestActionRole,
): GuestActionEntry[] => entries.filter((entry) => (
 entry.action.where === 'message' && (entry.action.roles?.includes(role) ?? true)
));

export const guestSessionActions = (
 entries: readonly GuestActionEntry[],
): GuestActionEntry[] => entries.filter((entry) => entry.action.where === 'session');

export const guestActionsWhere = (
 entries: readonly GuestActionEntry[],
 where: 'selection' | 'file' | 'diff',
): GuestActionEntry[] => entries.filter((entry) => entry.action.where === where);


/** Entries for text selected in a message, a Files row, or selected lines. */
export const guestActionWantsMessages = (action: GuestActionContribution): boolean => (
 action.payload?.includes('messages') ?? false
);

/** Only assistant replies are sent as assistant items; system messages are omitted. */
const recordRole = (record: Message): GuestItemRole => (
 record.role === 'assistant' ? 'assistant' : 'user'
);

/** A message's text the way the Markdown export writes it. */
const recordText = (record: Message): string => {
 if (record.role === 'system') return '';
 return formatMessageRecordText(record);
};

type SessionRef = {
 sessionId: string;
 sessionTitle: string | null | undefined;
 directory: string | null | undefined;
};

export const buildGuestMessageItem = (
 action: string,
 session: SessionRef,
 record: Message,
): GuestMessageItem => ({
 kind: 'message',
 action,
 sessionId: session.sessionId,
 sessionTitle: session.sessionTitle?.trim() || session.sessionId,
 directory: session.directory ?? null,
 messageId: record.messageId,
 role: recordRole(record),
 text: recordText(record).slice(0, GUEST_ITEM_MESSAGE_TEXT_MAX),
});

const toSessionItemMessage = (record: Message): GuestSessionItemMessage | null => {
 const text = recordText(record);
 if (!text) return null;
 return {
  id: record.messageId,
  role: recordRole(record),
  text: text.slice(0, GUEST_ITEM_MESSAGE_TEXT_MAX),
  createdAt: record.createdAt,
 };
};

export const buildGuestSessionItem = (
 action: string,
 session: SessionRef,
 records?: readonly Message[],
): GuestSessionItem => {
 const item: GuestSessionItem = {
  kind: 'session',
  action,
  sessionId: session.sessionId,
  sessionTitle: session.sessionTitle?.trim() || session.sessionId,
  directory: session.directory ?? null,
 };
 if (!records) return item;

  const messages: GuestSessionItemMessage[] = [];
  for (const record of records) {
    const message = toSessionItemMessage(record);
    if (message) messages.push(message);
  }
  const frame = JSON.stringify({ ...item, messages: [], truncated: true }).length;
  const sizes = messages.map((message) => JSON.stringify(message).length);
  let total = sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, messages.length - 1);
  let dropped = 0;
  while (messages.length - dropped > 0 && frame + total > GUEST_ITEM_SESSION_MAX) {
    total -= sizes[dropped] + (messages.length - dropped > 1 ? 1 : 0);
    dropped += 1;
  }
  item.messages = dropped > 0 ? messages.slice(dropped) : messages;
  if (dropped > 0) item.truncated = true;
  return item;
};
