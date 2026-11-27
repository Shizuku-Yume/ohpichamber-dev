import { z } from 'zod';
import { isEnterpriseMode } from '../enterprise-mode.js';

const OFFICIAL_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const baseUrlInput = z.string();

export interface NormalizedBaseUrlResult {
  value?: string | undefined;
  official?: boolean | undefined;
  error?: string | undefined;
}

const LOCAL_BASE_URL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

const isEnvFlagEnabled = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

const normalizeHostname = (hostname: string): string => {
  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const isAllowedLocalHost = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  return LOCAL_BASE_URL_HOSTS.has(normalized);
};

const normalizeOpenAIBaseURL = (
  value: Parameters<typeof baseUrlInput.safeParse>[0],
  selected: boolean,
): NormalizedBaseUrlResult => {
  const parsedInput = baseUrlInput.safeParse(value);
  if (!parsedInput.success || !parsedInput.data.trim()) {
    return { value: undefined };
  }

  let parsed: URL;
  try {
    parsed = new URL(parsedInput.data.trim());
  } catch {
    return { error: 'Custom server URL is invalid' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Custom server URL must use http or https' };
  }

  if (parsed.username || parsed.password) {
    return { error: 'Custom server URL must not include credentials' };
  }

  parsed.hash = '';
  parsed.search = '';
  const pathname = parsed.pathname.replace(/\/+$/, '');
  const normalizedPath = pathname.length > 0 ? pathname : '';
  const normalized = `${parsed.protocol}//${parsed.host}${normalizedPath}`;

  if (isEnterpriseMode() && !isAllowedLocalHost(parsed.hostname)) {
    return { error: 'In enterprise mode a custom speech server has to run on this machine.' };
  }

  if (selected && normalized === OFFICIAL_OPENAI_BASE_URL) {
    return { value: normalized, official: true };
  }

  const isDesktop = (process.env.OPENCHAMBER_RUNTIME || '').trim().toLowerCase() === 'desktop';
  const envFlagRaw = process.env.OPENCHAMBER_ALLOW_REMOTE_OPENAI_COMPAT_URLS;
  const hasExplicitFlag = envFlagRaw !== undefined && envFlagRaw.trim().length > 0;
  const allowRemote = hasExplicitFlag ? isEnvFlagEnabled(envFlagRaw) : isDesktop;
  if (!allowRemote && !isAllowedLocalHost(parsed.hostname)) {
    return {
      error: 'Remote custom server URLs are disabled. Set OPENCHAMBER_ALLOW_REMOTE_OPENAI_COMPAT_URLS=true to allow this host.',
    };
  }

  return { value: normalized };
};

export const normalizeCustomOpenAIBaseURL = (value: Parameters<typeof baseUrlInput.safeParse>[0]): NormalizedBaseUrlResult =>
  normalizeOpenAIBaseURL(value, false);
export const normalizeSelectedOpenAIBaseURL = (value: Parameters<typeof baseUrlInput.safeParse>[0]): NormalizedBaseUrlResult =>
  normalizeOpenAIBaseURL(value, true);
