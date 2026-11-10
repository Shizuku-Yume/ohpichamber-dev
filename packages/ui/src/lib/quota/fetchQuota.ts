import { z } from 'zod';
import type { ProviderResult, QuotaProviderId } from '@/types';
import { runtimeFetch, type RuntimeFetchOptions } from '@/lib/runtime-fetch';

const windowSchema = z.object({
<<<<<<< HEAD
 usedPercent: z.number().nullable(),
 remainingPercent: z.number().nullable(),
 windowSeconds: z.number().nullable(),
 resetAfterSeconds: z.number().nullable(),
 resetAt: z.number().nullable(),
 resetAtFormatted: z.string().nullable(),
 resetAfterFormatted: z.string().nullable(),
 valueLabel: z.string().nullable().optional(),
 value: z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('requests'), count: z.number().finite().nonnegative() }),
  z.object({ kind: z.literal('spend'), spent: z.number().finite().nonnegative(), limit: z.number().finite().positive().nullable() }),
 ]).optional(),
 creditsUsed: z.number().finite().nonnegative().optional(),
 giftReset: z.object({ recordId: z.number(), expireAt: z.number(), grantType: z.string().optional() }).nullable().optional(),
});
const windowsSchema = z.record(z.string(), windowSchema);
const consoleBudgetsSchema = z.object({
 workspace: z.string().nullable(),
 budgets: z.array(z.object({
  id: z.string(),
  limit: z.number(),
  spent: z.number(),
  usedPercent: z.number(),
  reached: z.boolean(),
  resetsAt: z.number(),
  sharing: z.enum(['you', 'everyone', 'group']),
  perModel: z.boolean(),
  kind: z.enum(['all', 'vendors', 'price', 'models', 'each']),
  vendors: z.array(z.string()),
  models: z.array(z.string()),
  inputPriceAtLeast: z.number().nullable(),
 })),
=======
  usedPercent: z.number().nullable(),
  remainingPercent: z.number().nullable(),
  windowSeconds: z.number().nullable(),
  resetAfterSeconds: z.number().nullable(),
  resetAt: z.number().nullable(),
  resetAtFormatted: z.string().nullable(),
  resetAfterFormatted: z.string().nullable(),
  valueLabel: z.string().nullable().optional(),
  value: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('requests'), count: z.number().finite().nonnegative() }),
    z.object({ kind: z.literal('spend'), spent: z.number().finite().nonnegative(), limit: z.number().finite().positive().nullable() }),
  ]).optional(),
  creditsUsed: z.number().finite().nonnegative().optional(),
  giftReset: z.object({ recordId: z.number(), expireAt: z.number(), grantType: z.string().optional() }).nullable().optional(),
});
const windowsSchema = z.record(z.string(), windowSchema);
const consoleBudgetsSchema = z.object({
  workspace: z.string().nullable(),
  budgets: z.array(z.object({
    id: z.string(),
    limit: z.number(),
    spent: z.number(),
    usedPercent: z.number(),
    reached: z.boolean(),
    resetsAt: z.number(),
    sharing: z.enum(['you', 'everyone', 'group']),
    perModel: z.boolean(),
    kind: z.enum(['all', 'vendors', 'price', 'models', 'each']),
    vendors: z.array(z.string()),
    models: z.array(z.string()),
    inputPriceAtLeast: z.number().nullable(),
  })),
>>>>>>> bc50ba56a
});

export type QuotaGiftResetType = 'FIVE_HOUR' | 'WEEK';

const PROVIDER_LIST_TIMEOUT_MS = 10_000;

/**
 * Providers the instance has a credential for, or null when it could not say.
 * Null is not "none": the caller asks every provider, as a cold instance, a
 * restarting OpenCode or a server without this route answer here. The deadline
 * covers the body too, because every quota load waits on this read.
 */
export const fetchConfiguredQuotaProviders = async (timeoutMs = PROVIDER_LIST_TIMEOUT_MS): Promise<ReadonlySet<string> | null> => {
<<<<<<< HEAD
 const controller = new AbortController();
 const read = async () => {
  const response = await runtimeFetch('/api/quota/providers', { signal: controller.signal });
  if (!response.ok) return null;
  return new Set(z.object({ providers: z.array(z.string()) }).parse(await response.json()).providers);
 };
 let timer: ReturnType<typeof setTimeout> | undefined;
 const deadline = new Promise<null>((resolve) => {
  timer = setTimeout(() => {
   controller.abort();
   resolve(null);
  }, timeoutMs);
 });
 try {
  return await Promise.race([read().catch(() => null), deadline]);
 } finally {
  clearTimeout(timer);
 }
=======
  const controller = new AbortController();
  const read = async () => {
    const response = await runtimeFetch('/api/quota/providers', { signal: controller.signal });
    if (!response.ok) return null;
    return new Set(z.object({ providers: z.array(z.string()) }).parse(await response.json()).providers);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    return await Promise.race([read().catch(() => null), deadline]);
  } finally {
    clearTimeout(timer);
  }
>>>>>>> bc50ba56a
};

/** The deadline covers response bodies too, including transports that ignore abort. */
export const fetchQuota = async (
 providerId: QuotaProviderId,
 { signal, timeoutMs = 30_000, workspaceId }: { signal?: AbortSignal; timeoutMs?: number; workspaceId?: string } = {},
): Promise<ProviderResult> => {
<<<<<<< HEAD
 const controller = new AbortController();
 const abort = () => controller.abort(new DOMException('The operation was aborted.', 'AbortError'));
 if (signal?.aborted) abort();
 else signal?.addEventListener('abort', abort, { once: true });
 const timer = setTimeout(() => controller.abort(new DOMException('Quota request timed out', 'TimeoutError')), timeoutMs);
 let rejectAborted: () => void = () => { };
 const aborted = new Promise<never>((_resolve, reject) => {
  rejectAborted = () => reject(controller.signal.reason);
  if (controller.signal.aborted) rejectAborted();
  else controller.signal.addEventListener('abort', rejectAborted, { once: true });
 });
 const readResult = async () => {
  controller.signal.throwIfAborted();
  const options: RuntimeFetchOptions = { signal: controller.signal };
  if (workspaceId) options.query = { workspaceId };
  const response = await runtimeFetch(`/api/quota/${encodeURIComponent(providerId)}`, options);
  const payload = await response.json();
  if (!response.ok) {
   const failure = z.object({ error: z.string() }).safeParse(payload);
   throw new Error(failure.success ? failure.data.error : `Failed to fetch quota (${response.status})`);
=======
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException('The operation was aborted.', 'AbortError'));
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Quota request timed out', 'TimeoutError')), timeoutMs);
  let rejectAborted: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = () => reject(controller.signal.reason);
    if (controller.signal.aborted) rejectAborted();
    else controller.signal.addEventListener('abort', rejectAborted, { once: true });
  });
  const readResult = async () => {
    controller.signal.throwIfAborted();
    const response = await runtimeFetch(`/api/quota/${encodeURIComponent(providerId)}`, { signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(payload);
      throw new Error(failure.success ? failure.data.error : `Failed to fetch quota (${response.status})`);
    }
    return z.object({
      providerId: z.literal(providerId),
      providerName: z.string(),
      ok: z.boolean(),
      configured: z.boolean(),
      error: z.string().optional(),
      planLabel: z.string().nullable().optional(),
      accountLabel: z.string().nullable().optional(),
      usage: z.object({
        windows: windowsSchema,
        models: z.record(z.string(), z.object({ windows: windowsSchema })).optional(),
        consoleBudgets: consoleBudgetsSchema.optional(),
      }).nullable(),
      fetchedAt: z.number(),
    }).parse(payload);
  };
  try {
    return await Promise.race([readResult(), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAborted);
>>>>>>> bc50ba56a
  }
  return z.object({
   providerId: z.literal(providerId),
   providerName: z.string(),
   ok: z.boolean(),
   configured: z.boolean(),
   error: z.string().optional(),
   planLabel: z.string().nullable().optional(),
   accountLabel: z.string().nullable().optional(),
   usage: z.object({
    windows: windowsSchema,
    models: z.record(z.string(), z.object({ windows: windowsSchema })).optional(),
    consoleBudgets: consoleBudgetsSchema.optional(),
   }).nullable(),
   fetchedAt: z.number(),
  }).parse(payload);
 };
 try {
  return await Promise.race([readResult(), aborted]);
 } finally {
  clearTimeout(timer);
  signal?.removeEventListener('abort', abort);
  controller.signal.removeEventListener('abort', rejectAborted);
 }
};

/** The deadline covers response bodies too, including transports that ignore abort. */
export const activateGiftReset = async (
<<<<<<< HEAD
 providerId: QuotaProviderId,
 recordId: number,
 resetType: QuotaGiftResetType,
 grantType?: string,
 { signal, timeoutMs = 30_000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
=======
  providerId: QuotaProviderId,
  recordId: number,
  resetType: QuotaGiftResetType,
  grantType?: string,
  { signal, timeoutMs = 30_000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
>>>>>>> bc50ba56a
): Promise<void> => {
 const controller = new AbortController();
 const abort = () => controller.abort(new DOMException('The operation was aborted.', 'AbortError'));
 if (signal?.aborted) abort();
 else signal?.addEventListener('abort', abort, { once: true });
 const timer = setTimeout(() => controller.abort(new DOMException('Gift reset request timed out', 'TimeoutError')), timeoutMs);
 let rejectAborted: () => void = () => { };
 const aborted = new Promise<never>((_resolve, reject) => {
  rejectAborted = () => reject(controller.signal.reason);
  if (controller.signal.aborted) rejectAborted();
  else controller.signal.addEventListener('abort', rejectAborted, { once: true });
 });
 const readResult = async () => {
  controller.signal.throwIfAborted();
  const response = await runtimeFetch(`/api/quota/${encodeURIComponent(providerId)}/gift-reset/use`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ recordId, resetType, grantType }),
   signal: controller.signal,
  });
<<<<<<< HEAD
  const payload = await response.json();
  if (!response.ok) {
   const failure = z.object({ error: z.string() }).safeParse(payload);
   throw new Error(failure.success ? failure.data.error : `Failed to activate gift reset (${response.status})`);
=======
  const readResult = async () => {
    controller.signal.throwIfAborted();
    const response = await runtimeFetch(`/api/quota/${encodeURIComponent(providerId)}/gift-reset/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // grantType is omitted from the JSON when undefined (the record carried
      // none); the server then falls back to 'GLOBAL'.
      body: JSON.stringify({ recordId, resetType, grantType }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(payload);
      throw new Error(failure.success ? failure.data.error : `Failed to activate gift reset (${response.status})`);
    }
  };
  try {
    await Promise.race([readResult(), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAborted);
>>>>>>> bc50ba56a
  }
 };
 try {
  await Promise.race([readResult(), aborted]);
 } finally {
  clearTimeout(timer);
  signal?.removeEventListener('abort', abort);
  controller.signal.removeEventListener('abort', rejectAborted);
 }
};
