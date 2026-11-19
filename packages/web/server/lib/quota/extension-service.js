import {
 QUOTA_PROVIDER_PATH,
 QUOTA_PROVIDER_RESPONSE_MAX,
 QUOTA_PROVIDER_TIMEOUT_MS,
 QUOTA_PROVIDER_WIRE_VERSION,
} from 'ohpichamber-sdk';
import { quotaProviderSchemasV1 as schemas } from 'ohpichamber-sdk/schemas';

import { extensionProviderId } from '../source-control/provider-id.js';
import { buildResult, toUsageWindow } from './utils/formatters.js';

/**
 * An installed extension's usage provider: the host half of the SDK's quota
 * role (`packages/sdk/src/service-providers.ts`). The manifest lists the
 * native provider ids whose credentials the service receives, the user
 * approved that list, and every read carries the credentials OMP stores for
 * exactly those ids, resolved through the Host's selected-credential
 * resolver — nothing else of the credential store.
 *
 * Answers are checked with the SDK's `quotaProviderSchemasV1`; one that does
 * not parse is a failed read, never an empty result.
 */

// `quotaProviderSchemasV1.usage` is the `usage.read` data itself: the SDK
// asserts both sides of that type, so the host does not restate it.
const usageDataSchema = schemas.data['usage.read'];

const readEnvelope = (body) => {
 const envelope = schemas.envelope.safeParse(body);
 if (!envelope.success) return null;
 return envelope.data;
};

const usageResult = ({ providerId, providerName, data }) => {
 if (!data.ok) {
  return buildResult({
   providerId,
   providerName,
   ok: false,
   configured: data.configured,
   ...(data.error ? { error: data.error } : {}),
   ...(data.planLabel ? { planLabel: data.planLabel } : {}),
  });
 }
 const windows = data.usage?.windows ?? {};
 const mapped = Object.fromEntries(Object.entries(windows).map(([name, window]) => [name, toUsageWindow(window)]));
 const models = data.usage?.models
  ? Object.fromEntries(Object.entries(data.usage.models).map(([model, entry]) => [model, {
   windows: Object.fromEntries(Object.entries(entry.windows).map(([name, window]) => [name, toUsageWindow(window)])),
  }]))
  : undefined;
 return buildResult({
  providerId,
  providerName,
  ok: true,
  configured: true,
  usage: { windows: mapped, ...(models ? { models } : {}) },
  ...(data.planLabel ? { planLabel: data.planLabel } : {}),
 });
};

/**
 * Reads one installed extension's usage: the credentials its approved
 * `contributes.quota.providers` names, then one `usage.read` on the service's
 * loopback, checked against the role's wire 1.
 *
 * @param {object} input
 * @param {object} input.guest the catalog row (enabled, granted, `quota`)
 * @param {(providerId: string) => Promise<object | null>} input.readCredential
 *   Resolves the stored credential for one native provider id, or null.
 * @param {(params: object) => Promise<{ status: number, body: string }>} input.request
 *   The guest service proxy (`proxyGuestServiceRequest`), scoped to this guest.
 */
export const readExtensionQuotaProvider = async ({ guest, readCredential, request }) => {
 const providerId = extensionProviderId(guest?.id);
 const providerName = String(guest?.name ?? guest?.id ?? '');
 if (!providerId) {
  return buildResult({ providerId: String(guest?.id ?? ''), providerName, ok: false, configured: false, error: 'Unsupported provider' });
 }

 const credentials = {};
 for (const nativeProviderId of guest.quota?.providers ?? []) {
  try {
   const credential = await readCredential(nativeProviderId);
   if (credential) credentials[nativeProviderId] = credential;
  } catch {
   // A provider without a resolvable credential keeps its own key in the
   // extension; the read still carries the ones that do resolve.
  }
 }

 const wire = {
  v: QUOTA_PROVIDER_WIRE_VERSION,
  requestId: `quota-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  method: 'usage.read',
  provider: providerId,
  input: { credentials },
 };

 let answered;
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
  return buildResult({ providerId, providerName, ok: false, configured: true, error: error?.message || 'The extension service did not answer' });
 }

 if (answered.status === 400) {
  return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service does not speak this usage protocol' });
 }
 let parsedBody;
 try {
  parsedBody = JSON.parse(answered.body);
 } catch {
  return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service answered malformed JSON' });
 }
 const envelope = readEnvelope(parsedBody);
 if (!envelope) {
  return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service answered an invalid response' });
 }
 if (envelope.ok === false) {
  return buildResult({ providerId, providerName, ok: false, configured: true, error: envelope.error.message });
 }
 const data = usageDataSchema.safeParse(envelope.data);
 if (!data.success) {
  return buildResult({ providerId, providerName, ok: false, configured: true, error: 'The extension service answered an invalid usage payload' });
 }
 return usageResult({ providerId, providerName, data: data.data });
};
