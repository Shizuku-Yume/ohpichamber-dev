import { requestedGuestCapabilities } from 'ohpichamber-sdk';

import { readEnterprisePolicy } from '../enterprise-mode.js';

const ENTERPRISE_GATED_CAPABILITIES = [
  'network',
  'origins',
  'service',
  'transcript',
  'sessionControl',
  'sessionAnswers',
  'instructions',
  'skills',
  'opencodePlugin',
  'opencode',
] as const;

export type EnterpriseBlockedCapability = (typeof ENTERPRISE_GATED_CAPABILITIES)[number];

const isEnterpriseGatedCapability = (capability: string): capability is EnterpriseBlockedCapability =>
  ENTERPRISE_GATED_CAPABILITIES.some((item) => item === capability);

const repositoryKey = (value: string) => {
  const trimmed = String(value).trim().replace(/#.*$/, '');
  const scp = trimmed.match(/^[^@/\s]+@([^:/\s]+):(.+)$/);
  let host: string | undefined;
  let pathname: string | undefined;
  if (scp) {
    [, host, pathname] = scp;
  } else {
    try {
      const url = new URL(trimmed);
      host = url.hostname;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }
  if (!host || !pathname) return null;
  const cleanPath = pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  return cleanPath ? `${host.toLowerCase()}/${cleanPath}` : null;
};

const isAllowedRepository = (gitUrl: string | null | undefined, allowed: readonly string[]) => {
  const key = gitUrl ? repositoryKey(gitUrl) : null;
  if (key === null) return false;
  return allowed.some((entry) => {
    const allowedKey = repositoryKey(entry);
    if (allowedKey === null) return false;
    return entry.trim().endsWith('/') ? key.startsWith(`${allowedKey}/`) : key === allowedKey;
  });
};

type EnterpriseGuestInput = Parameters<typeof requestedGuestCapabilities>[0] & {
  opencodePlugin?: string | boolean | undefined;
  service?: { provides?: readonly string[] | undefined } | undefined;
};

export const enterpriseBlockedCapabilities = (
  guest: EnterpriseGuestInput | null | undefined,
  { source, gitUrl }: { source?: string | undefined; gitUrl?: string | null | undefined } = {},
  policy = readEnterprisePolicy(),
): EnterpriseBlockedCapability[] => {
  if (!policy.enterpriseMode) return [];
  const legacy: EnterpriseBlockedCapability[] = [];
  if (guest?.opencodePlugin) legacy.push('opencodePlugin');
  if (guest?.service?.provides?.includes('opencode')) legacy.push('opencode');
  const gated: EnterpriseBlockedCapability[] = [];
  if (guest) {
    for (const capability of requestedGuestCapabilities(guest)) {
      if (isEnterpriseGatedCapability(capability)) gated.push(capability);
    }
  }
  gated.push(...legacy);
  if (gated.length === 0) return [];
  if (source === 'git' && isAllowedRepository(gitUrl, policy.allowedExtensions)) return [];
  if (source === 'path' && policy.allowLocalExtensions) return [];
  return gated;
};
