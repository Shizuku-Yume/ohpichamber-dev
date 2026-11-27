import {
  QUOTA_PROVIDER_PATH,
  QUOTA_PROVIDER_RESPONSE_MAX,
  QUOTA_PROVIDER_TIMEOUT_MS,
  QUOTA_PROVIDER_WIRE_VERSION,
} from 'ohpichamber-sdk';
import { quotaProviderSchemasV1 as schemas } from 'ohpichamber-sdk/schemas';
import type { z } from 'zod';

import { extensionProviderId } from '../source-control/provider-id.js';
import type { ExtensionQuotaGuest } from './extension-registry.js';
import type { NativeResolvedCredential } from './native.js';
import type { ProviderUsage, QuotaResult, UsageWindow, UsageWindowInput } from './utils/contracts.js';
import { buildResult, toUsageWindow } from './utils/formatters.js';

const usageDataSchema = schemas.data['usage.read'];
type UsageReadData = z.infer<typeof usageDataSchema>;
type UsageReadWindow = NonNullable<NonNullable<UsageReadData['usage']>['windows']>[string];
type QuotaEnvelope = z.infer<typeof schemas.envelope>;

export interface ExtensionQuotaRequestParams {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  responseMax: number;
  timeoutMs: number;
}

export interface ExtensionQuotaResponse {
  status: number;
  body: string;
}

export interface ReadExtensionQuotaProviderInput<Guest extends ExtensionQuotaGuest = ExtensionQuotaGuest> {
  guest: Guest | null | undefined;
  readCredential: (providerId: string) => Promise<NativeResolvedCredential>;
  request: (params: ExtensionQuotaRequestParams) => Promise<ExtensionQuotaResponse>;
}

const toUsageWindowInput = (window: UsageReadWindow): UsageWindowInput<number | null, number | null> => {
  const input: UsageWindowInput<number | null, number | null> = {
    usedPercent: window.usedPercent,
  };
  if (window.windowSeconds !== undefined) input.windowSeconds = window.windowSeconds;
  if (window.resetAt !== undefined) input.resetAt = window.resetAt;
  if (window.valueLabel !== undefined) input.valueLabel = window.valueLabel;
  if (window.value !== undefined) input.value = window.value;
  if (window.creditsUsed !== undefined) input.creditsUsed = window.creditsUsed;
  return input;
};

const usageResult = ({
  providerId,
  providerName,
  data,
}: {
  providerId: string;
  providerName: string;
  data: UsageReadData;
}): QuotaResult<string, string, ProviderUsage> => {
  if (!data.ok) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: data.configured,
      error: data.error,
      planLabel: data.planLabel,
    });
  }
  const windows = data.usage?.windows ?? {};
  const mapped: Record<string, UsageWindow> = Object.fromEntries(
    Object.entries(windows).map(([name, window]) => [name, toUsageWindow(toUsageWindowInput(window))]),
  );
  const models: Record<string, ProviderUsage> | undefined = data.usage?.models
    ? Object.fromEntries(Object.entries(data.usage.models).map(([model, entry]) => [model, {
      windows: Object.fromEntries(Object.entries(entry.windows).map(([name, window]) => [name, toUsageWindow(toUsageWindowInput(window))])),
    }]))
    : undefined;
  const usage: ProviderUsage = { windows: mapped };
  if (models) usage.models = models;
  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage,
    planLabel: data.planLabel,
  });
};

export const readExtensionQuotaProvider = async <Guest extends ExtensionQuotaGuest = ExtensionQuotaGuest>({
  guest,
  readCredential,
  request,
}: ReadExtensionQuotaProviderInput<Guest>): Promise<QuotaResult<string, string, ProviderUsage>> => {
  const rawGuestId = guest?.id ?? '';
  const providerId = extensionProviderId(rawGuestId);
  const providerName = String(guest?.name ?? guest?.id ?? '');
  if (!providerId || !guest) {
    return buildResult({ providerId: String(rawGuestId), providerName, ok: false, configured: false, error: 'Unsupported provider' });
  }

  const credentials: Record<string, NonNullable<NativeResolvedCredential>> = {};
  for (const nativeProviderId of guest.quota?.providers ?? []) {
    try {
      const credential = await readCredential(nativeProviderId);
      if (credential) credentials[nativeProviderId] = credential;
    } catch {
      void 0;
    }
  }

  const wire = {
    v: QUOTA_PROVIDER_WIRE_VERSION,
    requestId: `quota-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    method: 'usage.read',
    provider: providerId,
    input: { credentials },
  };

  let answered: ExtensionQuotaResponse;
  try {
    answered = await request({
      method: 'POST',
      path: QUOTA_PROVIDER_PATH,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wire),
      responseMax: QUOTA_PROVIDER_RESPONSE_MAX,
      timeoutMs: QUOTA_PROVIDER_TIMEOUT_MS,
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'The extension service did not answer';
    return buildResult({ providerId, providerName, ok: false, configured: true, error: message });
  }

  if (answered.status === 400) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service does not speak this usage protocol' });
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(answered.body);
  } catch {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service answered malformed JSON' });
  }
  const envelopeResult = schemas.envelope.safeParse(parsedBody);
  if (!envelopeResult.success) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service answered an invalid response' });
  }
  const envelope: QuotaEnvelope = envelopeResult.data;
  if (envelope.ok === false) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: envelope.error.message });
  }
  const data = usageDataSchema.safeParse(envelope.data);
  if (!data.success) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service answered an invalid usage payload' });
  }
  return usageResult({ providerId, providerName, data: data.data });
};
