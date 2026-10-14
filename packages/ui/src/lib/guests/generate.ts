import { z } from 'zod';

import {
  GUEST_GENERATE_TEXT_MAX,
  resolveHostRequestErrorCode,
  type GenerateRequest,
  type GenerateResult,
  type HostRequestErrorCode,
} from '@openchamber/sdk';

import { runtimeFetch } from '@/lib/runtime-fetch';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';

export type GuestGenerateProxyResult =
  | { ok: true; result: GenerateResult }
  | { ok: false; code: HostRequestErrorCode; message: string };

const successSchema = z.object({
  ok: z.literal(true),
  result: z.object({ text: z.string().max(GUEST_GENERATE_TEXT_MAX) }),
});

const failureSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1).optional(),
});

const failed = (code: HostRequestErrorCode, message: string): GuestGenerateProxyResult => ({ ok: false, code, message });

const FAILED_MESSAGE = 'Text generation failed.';

const parseGuestGenerateResponse = async (response: Response): Promise<GuestGenerateProxyResult> => {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = failureSchema.safeParse(body);
    if (!parsed.success) {
      return failed('HOST_REJECTED', FAILED_MESSAGE);
    }
    return failed(resolveHostRequestErrorCode(parsed.data.error), parsed.data.message ?? parsed.data.error);
  }
  const parsed = successSchema.safeParse(body);
  if (!parsed.success) {
    return failed('HOST_REJECTED', FAILED_MESSAGE);
  }
  return { ok: true, result: parsed.data.result };
};

/**
 * One-off generation through the Guest grant owner. The Host authorizes the
 * canonical workspace and calls its canonical completion domain service.
 * Provider preferences come from the Host UI, never from guest content.
 */
export const guestGenerate = async (
  guestId: string,
  request: GenerateRequest,
  directory: string | null,
  composer: { providerID: string | null; modelID: string | null },
): Promise<GuestGenerateProxyResult> => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (composer.providerID) {
    headers.set('x-openchamber-provider', composer.providerID);
    if (composer.modelID) headers.set('x-openchamber-model', composer.modelID);
  }
  let changed = false;
  const unsubscribe = subscribeRuntimeEndpointWillChange(() => { changed = true; });
  try {
    if (!directory) return failed('HOST_REJECTED', FAILED_MESSAGE);
    const runtimeKey = getRuntimeKey();
    const workspace = await canonicalClient.resolveWorkspace(directory);
    if (changed || getRuntimeKey() !== runtimeKey) return failed('HOST_REJECTED', FAILED_MESSAGE);
    const response = await runtimeFetch(`/api/guests/${guestId}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, workspaceId: workspace.workspaceId }),
    });
    if (changed || getRuntimeKey() !== runtimeKey) return failed('HOST_REJECTED', FAILED_MESSAGE);
    const result = await parseGuestGenerateResponse(response);
    return changed || getRuntimeKey() !== runtimeKey ? failed('HOST_REJECTED', FAILED_MESSAGE) : result;
  } catch {
    return failed('HOST_REJECTED', FAILED_MESSAGE);
  } finally {
    unsubscribe();
  }
};
