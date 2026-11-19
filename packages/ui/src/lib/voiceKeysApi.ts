import { z } from 'zod';
import { runtimeFetch } from '@/lib/runtime-fetch';

<<<<<<< HEAD
/**
 * Custom transcription keys live on the server (`/api/voice/keys`, mode 0600
 * there); the UI only learns whether one is set. Speech credentials remain
 * SDK-owned and are not part of this store.
 */
||||||| bc50ba56aa
/**
 * Voice API keys live on the server (`/api/voice/keys`, mode 0600 there);
 * the UI only learns whether each is set. Speech and transcription requests
 * carry no key: the server fills it in.
 */
=======
>>>>>>> upstream/main
const voiceApiKeyStateSchema = z.object({
  stt: z.boolean(),
});

export type VoiceApiKeyState = z.infer<typeof voiceApiKeyStateSchema>;
export type VoiceApiKeyKind = keyof VoiceApiKeyState;

export const EMPTY_VOICE_API_KEYS = { stt: false } satisfies VoiceApiKeyState;

const LEGACY_STORAGE_KEYS = {
  stt: 'sttApiKey',
} as const satisfies Record<VoiceApiKeyKind, string>;

const VOICE_API_KEY_KINDS = ['stt'] as const satisfies readonly VoiceApiKeyKind[];

export const fetchVoiceApiKeys = async (): Promise<VoiceApiKeyState> => {
  const response = await runtimeFetch('/api/voice/keys', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Failed to read voice keys: ${response.status}`);
  return voiceApiKeyStateSchema.parse(await response.json());
};

export const updateVoiceApiKeys = async (
  patch: Partial<Record<VoiceApiKeyKind, string | null>>,
): Promise<VoiceApiKeyState> => {
  const response = await runtimeFetch('/api/voice/keys', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to save voice keys: ${response.status}`);
  return voiceApiKeyStateSchema.parse(await response.json());
};

export const migrateLegacyVoiceApiKeys = async (): Promise<VoiceApiKeyState | null> => {
  const patch: Partial<Record<VoiceApiKeyKind, string>> = {};
  let legacyPresent = false;
  for (const kind of VOICE_API_KEY_KINDS) {
    const stored = window.localStorage.getItem(LEGACY_STORAGE_KEYS[kind]);
    if (stored === null) continue;
    legacyPresent = true;
    if (stored.trim()) patch[kind] = stored.trim();
  }
  if (!legacyPresent) return null;
  const state = Object.keys(patch).length > 0 ? await updateVoiceApiKeys(patch) : null;
  for (const kind of VOICE_API_KEY_KINDS) {
    window.localStorage.removeItem(LEGACY_STORAGE_KEYS[kind]);
  }
  return state;
};
