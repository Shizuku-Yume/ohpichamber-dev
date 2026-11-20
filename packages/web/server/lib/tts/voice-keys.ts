import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
/** Custom transcription keys only. Speech credentials remain SDK-owned. */
const VOICE_KEY_KINDS = ['stt'];

const storedKey = z.string().trim().min(1).max(1024);
const storedKeysSchema = z.object({
  stt: storedKey.optional().catch(undefined),
});
const patchValue = z.union([z.literal(''), z.null(), storedKey]);
const patchSchema = z.object({
  stt: patchValue.optional(),
}).strict();
export const voiceKeysPatchSchema = patchSchema;

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
    if (error?.code !== 'ENOENT') {
      console.warn('[voice] transcription key file is unreadable');
    }
    return {};
  }
  try {
    return storedKeysSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.warn('[voice] transcription key file is malformed');
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
