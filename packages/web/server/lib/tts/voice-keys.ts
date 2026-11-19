import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

<<<<<<< HEAD:packages/web/server/lib/tts/voice-keys.js
/** Custom transcription keys only. Speech credentials remain SDK-owned. */
const VOICE_KEY_KINDS = ['stt'];
||||||| bc50ba56aa:packages/web/server/lib/tts/voice-keys.js
/**
 * API keys for voice services the user typed in Settings: OpenAI read-aloud,
 * a custom OpenAI-compatible speech server, and a custom transcription
 * server. They live here, mode 0600, like every other credential the server
 * keeps; browsers hold only whether each one is set. Routes fill a request's
 * key from here, so a key never travels with a request from the UI.
 */
const VOICE_KEY_KINDS = ['openai', 'openaiCompatible', 'stt'];
=======
type VoiceKeyKind = 'openai' | 'openaiCompatible' | 'stt';

const VOICE_KEY_KINDS: VoiceKeyKind[] = ['openai', 'openaiCompatible', 'stt'];
>>>>>>> upstream/main:packages/web/server/lib/tts/voice-keys.ts

const storedKey = z.string().trim().min(1).max(1024);
const storedKeysSchema = z.object({
  stt: storedKey.optional().catch(undefined),
});
const patchValue = z.union([z.literal(''), z.null(), storedKey]);
<<<<<<< HEAD:packages/web/server/lib/tts/voice-keys.js
const patchSchema = z.object({
||||||| bc50ba56aa:packages/web/server/lib/tts/voice-keys.js
const patchSchema = z.object({
  openai: patchValue.optional(),
  openaiCompatible: patchValue.optional(),
=======
export const voiceKeysPatchSchema = z.object({
  openai: patchValue.optional(),
  openaiCompatible: patchValue.optional(),
>>>>>>> upstream/main:packages/web/server/lib/tts/voice-keys.ts
  stt: patchValue.optional(),
}).strict();

export type VoiceKeysPatch = z.input<typeof voiceKeysPatchSchema>;

const resolveDataDir = () => (process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'ohpichamber'));

const voiceKeysPath = () => path.join(resolveDataDir(), 'voice-keys.json');

const errorDetails = z.object({ code: z.unknown().optional(), message: z.unknown().optional() });

const readStoredKeys = (): z.infer<typeof storedKeysSchema> => {
  let raw;
  try {
    raw = fs.readFileSync(voiceKeysPath(), 'utf8');
  } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/tts/voice-keys.js
    if (error?.code !== 'ENOENT') {
      console.warn('[voice] transcription key file is unreadable');
||||||| bc50ba56aa:packages/web/server/lib/tts/voice-keys.js
    if (error?.code !== 'ENOENT') {
      console.warn('[voice] voice-keys.json is unreadable:', error?.message ?? error);
=======
    const details = errorDetails.safeParse(error).data;
    if (details?.code !== 'ENOENT') {
      console.warn('[voice] voice-keys.json is unreadable:', details?.message ?? error);
>>>>>>> upstream/main:packages/web/server/lib/tts/voice-keys.ts
    }
    return {};
  }
  try {
    return storedKeysSchema.parse(JSON.parse(raw));
  } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/tts/voice-keys.js
    console.warn('[voice] transcription key file is malformed');
||||||| bc50ba56aa:packages/web/server/lib/tts/voice-keys.js
    console.warn('[voice] voice-keys.json is malformed:', error?.message ?? error);
=======
    console.warn('[voice] voice-keys.json is malformed:', errorDetails.safeParse(error).data?.message ?? error);
>>>>>>> upstream/main:packages/web/server/lib/tts/voice-keys.ts
    return {};
  }
};

export const readVoiceKey = (kind: VoiceKeyKind) => readStoredKeys()[kind];

export const describeVoiceKeys = () => {
  const keys = readStoredKeys();
  return Object.fromEntries(VOICE_KEY_KINDS.map((kind) => [kind, Boolean(keys[kind])]));
};

export const updateVoiceKeys = (body: VoiceKeysPatch) => {
  const patch = voiceKeysPatchSchema.parse(body);
  const next = { ...readStoredKeys() };
  for (const kind of VOICE_KEY_KINDS) {
    if (!(kind in patch)) continue;
    const value = patch[kind];
    if (value) next[kind] = value;
    else delete next[kind];
  }
  const filePath = voiceKeysPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  return describeVoiceKeys();
};
