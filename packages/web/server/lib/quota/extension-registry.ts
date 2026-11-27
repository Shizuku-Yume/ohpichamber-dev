import { z } from 'zod';

import { extensionProviderId, isExtensionProviderId } from '../source-control/provider-id.js';

export interface ExtensionQuotaGuest {
  id: string;
  name?: string | undefined;
  icon?: string | undefined;
  enabled?: boolean | undefined;
  capabilityGrants?: readonly string[] | undefined;
  service?: {
    provides?: readonly string[] | undefined;
  } | undefined;
  quota?: {
    providers?: readonly string[] | undefined;
  } | undefined;
}

export interface ExtensionQuotaProviderSummary {
  id: string;
  name: string | undefined;
  icon: string | undefined;
  guestId: string;
}

export interface QuotaProvidersChangedEvent {
  type: 'openchamber:quota-providers-changed';
  properties: z.infer<typeof quotaProvidersChangedPropertiesSchema>;
}

export const isExtensionQuotaGuest = <Guest extends ExtensionQuotaGuest>(guest: Guest | null | undefined): guest is Guest => {
  if (!guest) return false;
  const grants = Array.isArray(guest.capabilityGrants) ? guest.capabilityGrants : [];
  return guest.enabled !== false
    && Array.isArray(guest.service?.provides) && guest.service.provides.includes('quota')
    && Boolean(guest.quota)
    && grants.includes('service')
    && isExtensionProviderId(`ext-${String(guest.id ?? '')}`);
};

export const listExtensionQuotaProviders = <Guest extends ExtensionQuotaGuest>(guests: readonly Guest[] = []): ExtensionQuotaProviderSummary[] => guests
  .filter(isExtensionQuotaGuest)
  .map((guest) => ({ id: `ext-${guest.id}`, name: guest.name, icon: guest.icon, guestId: guest.id }));

export const isExtensionQuotaProviderId = (providerId: string): boolean => isExtensionProviderId(providerId);

export const extensionQuotaGuest = <Guest extends ExtensionQuotaGuest>(guests: readonly Guest[] = [], providerId: string): Guest | null => {
  if (!isExtensionProviderId(providerId)) return null;
  const guestId = providerId.slice('ext-'.length);
  return guests.find((guest) => guest.id === guestId && isExtensionQuotaGuest(guest)) ?? null;
};

const QUOTA_PROVIDER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const quotaProvidersChangedPropertiesSchema = z.object({
  providerId: z.string().max(64).regex(QUOTA_PROVIDER_ID),
}).strict();

export const buildQuotaProvidersChangedEventForProvider = (providerId: string): QuotaProvidersChangedEvent | null => {
  const parsed = quotaProvidersChangedPropertiesSchema.safeParse({ providerId });
  if (!parsed.success) return null;
  return { type: 'openchamber:quota-providers-changed', properties: parsed.data };
};

export const buildQuotaProvidersChangedEvent = (guestId: string): QuotaProvidersChangedEvent | null => {
  const providerId = extensionProviderId(guestId);
  if (!providerId) return null;
  const parsed = quotaProvidersChangedPropertiesSchema.safeParse({ providerId });
  if (!parsed.success) return null;
  return { type: 'openchamber:quota-providers-changed', properties: parsed.data };
};
