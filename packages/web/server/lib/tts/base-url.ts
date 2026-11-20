import { isEnterpriseMode } from '../enterprise-mode.js';

const OFFICIAL_OPENAI_BASE_URL = 'https://api.openai.com/v1';

const LOCAL_BASE_URL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

const isEnvFlagEnabled = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

const normalizeHostname = (hostname: string) => {
  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const isAllowedLocalHost = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  return LOCAL_BASE_URL_HOSTS.has(normalized);
};

const normalizeOpenAIBaseURL = (value, selected) => {
  if (typeof value !== 'string' || !value.trim()) {
    return { value: undefined };
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
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

  // Speech and transcription carry conversation content, so enterprise mode
  // keeps them on this machine whatever else allows a remote host.
  if (isEnterpriseMode() && !isAllowedLocalHost(parsed.hostname)) {
    return { error: 'In enterprise mode a custom speech server has to run on this machine.' };
  }

  // Only the Host-selected standard OpenAI endpoint uses the official speech
  // path. Browser custom URLs never receive this policy exemption.
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

export const normalizeCustomOpenAIBaseURL = (value) => normalizeOpenAIBaseURL(value, false);
export const normalizeSelectedOpenAIBaseURL = (value) => normalizeOpenAIBaseURL(value, true);
