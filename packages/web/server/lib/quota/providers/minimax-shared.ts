import { z } from 'zod';
import { miniMaxStatusError, type MiniMaxBaseResp } from './minimax-status.js';
import { credentialAccessToken } from './selected-credential.js';
import type { CredentialJson } from '../credentials/contracts.js';
import type { ProviderUsage, QuotaResult } from '../utils/contracts.js';
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
} from '../utils/index.js';
import { lowerCaseLabel } from '../utils/labels.js';

interface MiniMaxFields {
  model_name?: unknown;
  current_interval_total_count?: unknown;
  current_interval_usage_count?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  remains_time?: unknown;
  current_interval_remaining_percent?: unknown;
  current_weekly_total_count?: unknown;
  current_weekly_usage_count?: unknown;
  weekly_start_time?: unknown;
  weekly_end_time?: unknown;
  weekly_remains_time?: unknown;
  current_weekly_remaining_percent?: unknown;
  current_weekly_status?: unknown;
  model_remains?: unknown;
  base_resp?: unknown;
}

export interface MiniMaxProviderConfig {
  providerId: string;
  providerName: string;
  tokenPlanUrl: string;
  codingPlanUrl: string;
}

export interface MiniMaxFetchOptions {
  credential?: CredentialJson | undefined;
  readAuth?: (() => CredentialJson | Promise<CredentialJson>) | undefined;
  fetchImpl?: typeof fetch | undefined;
}

const fieldsOf = <Value>(value: Value) => (hasFields(value) ? value : undefined);

const positive = (value: number | null) => value !== null && value > 0;

const isNumberValue = (value: unknown): value is number => typeof value === 'number';

const isBaseResp = (value: unknown): value is MiniMaxBaseResp => value !== null && value !== undefined;

const hasFields = (value: unknown): value is MiniMaxFields => value !== null && value !== undefined;
const isAuthRecord = (value: CredentialJson | null | undefined): value is { [key: string]: CredentialJson | undefined } =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const authEntrySchema = z.object({
  key: z.string().optional(),
  token: z.string().optional(),
});
const WINDOW_STATUS_INACTIVE = 3;
const stringSchema = z.string();

const TEXT_MODELS = ['general', 'chat', 'text'];

const pickChatModel = <Remains>(modelRemains: Remains) => {
  if (!Array.isArray(modelRemains) || modelRemains.length === 0) return null;
  const models: unknown[] = modelRemains;

  const m3Candidate = models.find((m) => {
    const name = fieldsOf(m)?.model_name;
    return name && /^minimax-m/i.test(String(name)) && positive(toNumber(fieldsOf(m)?.current_interval_total_count));
  });
  if (m3Candidate) return m3Candidate;

  const textCandidate = models.find((m) => {
    const name = fieldsOf(m)?.model_name;
    return name && TEXT_MODELS.includes(lowerCaseLabel(name, 'm.model_name'));
  });
  if (textCandidate) return textCandidate;

  const percentCandidate = models.find((m) => isNumberValue(fieldsOf(m)?.current_interval_remaining_percent));
  if (percentCandidate) return percentCandidate;

  return models[0];
};

const hasModelRemains = <Payload>(payload: Payload) => {
  const rems = fieldsOf(payload)?.model_remains;
  return Array.isArray(rems) && rems.length > 0;
};

interface FetchEndpointResult {
  payload?: MiniMaxFields;
  statusError?: string;
}

const fetchEndpoint = async (url: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<FetchEndpointResult> => {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) return {};
    const payload: unknown = await response.json();
    const baseResp = fieldsOf(payload)?.base_resp;
    const statusError = miniMaxStatusError(isBaseResp(baseResp) ? baseResp : undefined);
    if (statusError) return { statusError };
    if (!hasModelRemains(payload) || !hasFields(payload)) return {};
    return { payload };
  } catch {
    return {};
  }
};

const coercePercent = <Value>(value: Value) => {
  const n = toNumber(value);
  return n !== null ? Math.max(0, Math.min(100, n)) : null;
};

const isWindowActive = <Value>(status: Value) => {
  const n = toNumber(status);
  return n === null || n !== WINDOW_STATUS_INACTIVE;
};

const calculateWindowSeconds = (startAt: number | null, resetAt: number | null, remainsTimeMs: number | null) => {
  if (startAt && resetAt && resetAt > startAt) {
    return Math.floor((resetAt - startAt) / 1000);
  }
  if (remainsTimeMs && remainsTimeMs > 0) {
    return Math.floor(remainsTimeMs / 1000);
  }
  return null;
};

const calculateUsage = (model: MiniMaxFields, isTokenPlan: boolean) => {
  const intervalTotal = toNumber(model.current_interval_total_count);
  const intervalUsageRaw = toNumber(model.current_interval_usage_count);
  const intervalStartAt = toTimestamp(model.start_time);
  const intervalResetAt = toTimestamp(model.end_time);
  const intervalRemainsTime = toNumber(model.remains_time);
  const intervalRemainingPercent = coercePercent(model.current_interval_remaining_percent);

  const weeklyTotal = toNumber(model.current_weekly_total_count);
  const weeklyUsageRaw = toNumber(model.current_weekly_usage_count);
  const weeklyStartAt = toTimestamp(model.weekly_start_time);
  const weeklyResetAt = toTimestamp(model.weekly_end_time);
  const weeklyRemainsTime = toNumber(model.weekly_remains_time);
  const weeklyRemainingPercent = coercePercent(model.current_weekly_remaining_percent);

  let intervalUsedPercent = null;
  if (intervalRemainingPercent !== null) {
    intervalUsedPercent = 100 - intervalRemainingPercent;
  } else if (intervalTotal !== null && intervalTotal > 0 && intervalUsageRaw !== null) {
    const intervalUsed = isTokenPlan
      ? Math.max(0, intervalTotal - intervalUsageRaw)
      : intervalUsageRaw;
    intervalUsedPercent = Math.max(0, Math.min(100, (intervalUsed / intervalTotal) * 100));
  }

  let weeklyUsedPercent = null;
  if (weeklyRemainingPercent !== null) {
    weeklyUsedPercent = 100 - weeklyRemainingPercent;
  } else if (weeklyTotal !== null && weeklyTotal > 0 && weeklyUsageRaw !== null) {
    const weeklyUsed = isTokenPlan
      ? Math.max(0, weeklyTotal - weeklyUsageRaw)
      : weeklyUsageRaw;
    weeklyUsedPercent = Math.max(0, Math.min(100, (weeklyUsed / weeklyTotal) * 100));
  }

  const intervalWindowSeconds = calculateWindowSeconds(intervalStartAt, intervalResetAt, intervalRemainsTime);
  const weeklyWindowSeconds = calculateWindowSeconds(weeklyStartAt, weeklyResetAt, weeklyRemainsTime);

  return {
    intervalUsedPercent,
    intervalWindowSeconds,
    intervalResetAt,
    weeklyUsedPercent,
    weeklyWindowSeconds,
    weeklyResetAt,
  };
};

export const createMiniMaxCodingPlanProvider = ({
  providerId,
  providerName,
  tokenPlanUrl,
  codingPlanUrl,
}: MiniMaxProviderConfig) => {
  const isConfigured = (credential?: CredentialJson): boolean => Boolean(credentialAccessToken(credential));

  const fetchQuota = async ({ credential, readAuth, fetchImpl = fetch }: MiniMaxFetchOptions = {}): Promise<QuotaResult<string, string, ProviderUsage>> => {
    let apiKey: string | null = credentialAccessToken(credential);
    if (!apiKey && readAuth && z.function().safeParse(readAuth).success) {
      const auth = await Promise.resolve(readAuth()).catch(() => null);
      const authRecord = isAuthRecord(auth) ? auth : null;
      const entry = authRecord?.[providerId] ?? authRecord?.minimax ?? (authRecord ? Object.values(authRecord)[0] : null);
      const parsedEntry = authEntrySchema.safeParse(entry);
      const parsedString = stringSchema.safeParse(entry);
      apiKey = (parsedEntry.success ? parsedEntry.data.key || parsedEntry.data.token : undefined)
        || (parsedString.success ? parsedString.data : null)
        || null;
    }
    if (!apiKey) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: false,
        error: 'Not configured',
      });
    }

    try {
      let { payload, statusError } = await fetchEndpoint(tokenPlanUrl, apiKey, fetchImpl);
      let isTokenPlan = true;

      if (!payload) {
        const next = await fetchEndpoint(codingPlanUrl, apiKey, fetchImpl);
        payload = next.payload;
        if (next.statusError) {
          statusError = next.statusError;
        }
        isTokenPlan = false;
      }

      if (!payload) {
        return buildResult({
          providerId,
          providerName,
          ok: false,
          configured: true,
          error: statusError || "API returned no usable quota data",
        });
      }

      const model = fieldsOf(pickChatModel(payload.model_remains));
      if (!model) {
        return buildResult({
          providerId,
          providerName,
          ok: false,
          configured: true,
          error: 'No model quota data available',
        });
      }

      const {
        intervalUsedPercent,
        intervalWindowSeconds,
        intervalResetAt,
        weeklyUsedPercent,
        weeklyWindowSeconds,
        weeklyResetAt,
      } = calculateUsage(model, isTokenPlan);

      const windows: ProviderUsage['windows'] = {
        '5h': toUsageWindow({
          usedPercent: intervalUsedPercent,
          windowSeconds: intervalWindowSeconds,
          resetAt: intervalResetAt,
        }),
      };

      const weeklyActive = isWindowActive(model.current_weekly_status);
      const hasWeeklyData =
        weeklyActive &&
        (coercePercent(model.current_weekly_remaining_percent) !== null ||
          positive(toNumber(model.current_weekly_total_count)));

      if (hasWeeklyData) {
        windows.weekly = toUsageWindow({
          usedPercent: weeklyUsedPercent,
          windowSeconds: weeklyWindowSeconds,
          resetAt: weeklyResetAt,
        });
      }

      return buildResult({
        providerId,
        providerName,
        ok: true,
        configured: true,
        usage: { windows },
      });
    } catch (error) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : 'Request failed',
      });
    }
  };

  return {
    providerId,
    providerName,
    isConfigured,
    fetchQuota,
  };
};
