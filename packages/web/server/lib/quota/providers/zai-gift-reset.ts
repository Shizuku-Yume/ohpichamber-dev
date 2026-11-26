import { z } from 'zod';
import { credentialAccessToken } from './selected-credential.js';
import { envelopeError } from './zhipuai-coding-plan.js';
import { hasPayloadFields } from './zhipuai-coding-plan.js';

export const giftResetTypes = ['FIVE_HOUR', 'WEEK'];

const ZAI_GIFT_RESET_USE_URL = 'https://api.z.ai/api/biz/customer-package-reset/use';
const ZAI_GIFT_RESET_LIST_URL = 'https://api.z.ai/api/biz/customer-package-reset/list?targetType=PERSONAL';

export interface ZaiGiftReset {
  recordId: number;
  expireAt: number;
}

export interface ZaiGiftResetList {
  fiveHour: ZaiGiftReset | null;
  weekly: ZaiGiftReset | null;
}

const ZAI_RESET_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const ZaiGiftRecordSchema = z.object({
  available: z.literal(true),
  recordId: z.number().int().positive(),
  expireTime: z.string().regex(ZAI_RESET_TIME_PATTERN),
}).loose();

const ZaiGiftListPayloadSchema = z.object({
  data: z.object({
    fiveHourResets: z.array(z.unknown()).optional(),
    weekResets: z.array(z.unknown()).optional(),
  }).loose(),
}).loose();

const parseZaiResetExpire = (expireTime: string): number | null => {
  const timestamp = Date.parse(`${expireTime.replace(' ', 'T')}+08:00`);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const pickZaiGiftReset = (records: readonly unknown[] | undefined): ZaiGiftReset | null => {
  if (records === undefined) return null;
  const now = Date.now();
  let best: ZaiGiftReset | null = null;
  for (const record of records) {
    const parsed = ZaiGiftRecordSchema.safeParse(record);
    if (!parsed.success) continue;
    const expireAt = parseZaiResetExpire(parsed.data.expireTime);
    if (expireAt === null || expireAt <= now) continue;
    if (best === null || expireAt < best.expireAt) {
      best = { recordId: parsed.data.recordId, expireAt };
    }
  }
  return best;
};

export const listZaiGiftResets = async ({ credential }: { credential: unknown }): Promise<ZaiGiftResetList | null> => {
  const apiKey = credentialAccessToken(credential);
  if (!apiKey) return null;
  try {
    const response = await fetch(ZAI_GIFT_RESET_LIST_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) return null;
    const parsed = ZaiGiftListPayloadSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return {
      fiveHour: pickZaiGiftReset(parsed.data.data.fiveHourResets),
      weekly: pickZaiGiftReset(parsed.data.data.weekResets),
    };
  } catch {
    return null;
  }
};

const ZAI_FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60;
const ZAI_WEEK_WINDOW_SECONDS = 7 * 24 * 60 * 60;

interface ZaiWindowBucket {
  windowSeconds: number | null;
  valueLabel?: string | null;
  giftReset?: ZaiGiftReset | null;
}

const zaiWindowRank = (key: string, window: ZaiWindowBucket): number => {
  if (window.valueLabel?.endsWith('tokens')) return key.includes('-') ? 1 : 0;
  return key.includes('-') ? 3 : 2;
};

const attachOne = (windows: Record<string, ZaiWindowBucket>, seconds: number, gift: ZaiGiftReset): boolean => {
  const candidates = Object.entries(windows)
    .filter(([, window]) => window.windowSeconds === seconds)
    .sort(([leftKey, left], [rightKey, right]) => zaiWindowRank(leftKey, left) - zaiWindowRank(rightKey, right) || leftKey.localeCompare(rightKey));
  const target = candidates[0];
  if (target === undefined) return false;
  target[1].giftReset = gift;
  return true;
};

export const attachZaiGiftResets = (windows: Record<string, ZaiWindowBucket>, list: ZaiGiftResetList): void => {
  if (list.fiveHour !== null) attachOne(windows, ZAI_FIVE_HOUR_WINDOW_SECONDS, list.fiveHour);
  if (list.weekly !== null) attachOne(windows, ZAI_WEEK_WINDOW_SECONDS, list.weekly);
};

export const useZaiGiftReset = async ({ recordId, resetType, credential }: { recordId: number; resetType: string; credential: unknown }) => {
  const apiKey = credentialAccessToken(credential);

  if (!apiKey) {
    throw new Error('Not configured');
  }
  if (!Number.isInteger(recordId) || recordId <= 0 || !giftResetTypes.includes(resetType)) {
    throw new Error('Invalid gift reset request');
  }

  const response = await fetch(ZAI_GIFT_RESET_USE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targetType: 'PERSONAL',
      resetType,
      recordId,
      requestId: crypto.randomUUID()
    })
  });

  const rawPayload: unknown = await response.json().catch(() => null);
  const payload = hasPayloadFields(rawPayload) ? rawPayload : null;
  if (!response.ok || payload?.success !== true) {
    throw new Error(envelopeError(payload) ?? `API error: ${response.status}`);
  }
  return true;
};
