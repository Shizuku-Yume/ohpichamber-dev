import { z } from 'zod';

import { extensionProviderId, isExtensionProviderId } from '../source-control/provider-id.js';

/**
 * Usage providers installed extensions serve, listed beside the built-ins.
 *
 * The extension catalog is the authority and is read at request time: an
 * extension is a usage provider while it is enabled, holds an effective
 * `service` grant and declares `contributes.quota`. One that is paused,
 * unapproved, or refused by enterprise policy drops out on the next read
 * instead of needing a second registry kept in step by hand. `ext-<guestId>`
 * ids only, which no built-in takes, so an extension can never replace a
 * built-in's entry.
 */
export const isExtensionQuotaGuest = (guest) => {
 const grants = Array.isArray(guest?.capabilityGrants) ? guest.capabilityGrants : [];
 return Boolean(guest)
  && guest.enabled !== false
  && Array.isArray(guest.service?.provides) && guest.service.provides.includes('quota')
  && Boolean(guest.quota)
  && grants.includes('service')
  && isExtensionProviderId(`ext-${String(guest.id ?? '')}`);
};

/** What `GET /api/quota/extensions` lists, for the UI's cards: the id, the name and icon to draw, the extension they come from. */
export const listExtensionQuotaProviders = (guests = []) => guests
 .filter(isExtensionQuotaGuest)
 .map((guest) => ({ id: `ext-${guest.id}`, name: guest.name, icon: guest.icon, guestId: guest.id }));

/** Whether an id names an extension's usage provider; a built-in id never does. */
export const isExtensionQuotaProviderId = (providerId) => isExtensionProviderId(providerId);

/** The catalog row serving a usage provider id, or null; a built-in id never matches. */
export const extensionQuotaGuest = (guests = [], providerId) => {
 if (!isExtensionProviderId(providerId)) return null;
 const guestId = providerId.slice('ext-'.length);
 return guests.find((guest) => guest.id === guestId && isExtensionQuotaGuest(guest)) ?? null;
};

const QUOTA_PROVIDER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const quotaProvidersChangedPropertiesSchema = z.object({
 providerId: z.string().max(64).regex(QUOTA_PROVIDER_ID),
}).strict();

export const buildQuotaProvidersChangedEventForProvider = (providerId) => {
 const parsed = quotaProvidersChangedPropertiesSchema.safeParse({ providerId });
 if (!parsed.success) return null;
 return { type: 'openchamber:quota-providers-changed', properties: parsed.data };
};

export const buildQuotaProvidersChangedEvent = (guestId) => {
 const providerId = extensionProviderId(guestId);
 if (!providerId) return null;
 const parsed = quotaProvidersChangedPropertiesSchema.safeParse({ providerId });
 if (!parsed.success) return null;
 return { type: 'openchamber:quota-providers-changed', properties: parsed.data };
};
