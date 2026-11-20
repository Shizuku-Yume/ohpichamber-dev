import { isEnterpriseMode } from '../enterprise-mode.js';
import { normalizeRelayUrl, pinnedRelayUrl } from '../relay/service.js';
import { relayHttpBase } from './relay-client.js';
import type { ShareRelaySettings } from './contracts.js';
import type { Request } from '../shared/http-contracts.js';

export const PUBLIC_SHARE_ORIGIN = 'https://share.openchamber.dev';

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const LINK_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const allowedReceiveBases = (settings: ShareRelaySettings | null | undefined) => {
  if (isEnterpriseMode()) {
    const pinned = pinnedRelayUrl();
    return pinned === null ? [] : [relayHttpBase(pinned)];
  }
  const relayUrl = pinnedRelayUrl() ?? normalizeRelayUrl(settings?.privateRelay?.relayUrl);
  return relayUrl ? [...new Set([PUBLIC_SHARE_ORIGIN, relayHttpBase(relayUrl)])] : [PUBLIC_SHARE_ORIGIN];
};

export class ShareLinkError extends Error {
  code: 'invalid_link' | 'link_not_allowed';

  constructor(message: string, code: ShareLinkError['code']) {
    super(message);
    this.name = 'ShareLinkError';
    this.code = code;
  }
}

export const parseShareLink = (raw: Request['body'], allowedBases: string[]) => {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new ShareLinkError('This is not a share link', 'invalid_link');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search) {
    throw new ShareLinkError('This is not a share link', 'invalid_link');
  }
  const match = /^(.*)\/p\/([^/]+)$/.exec(url.pathname);
  const key = url.hash.slice(1);
  if (!match || match[2] === undefined || !SHARE_ID_PATTERN.test(match[2]) || !LINK_KEY_PATTERN.test(key)) {
    throw new ShareLinkError('This is not a share link', 'invalid_link');
  }
  const base = `${url.origin}${match[1]}`.replace(/\/+$/, '');
  if (!allowedBases.includes(base)) {
    throw new ShareLinkError('Links from this address are not opened here', 'link_not_allowed');
  }
  return { base, shareId: match[2], linkKey: key, host: url.host };
};
