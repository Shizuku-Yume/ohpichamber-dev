export const PRODUCTION_UPDATER_FEED = Object.freeze({
  provider: 'github',
  owner: 'Shizuku-Yume',
  repo: 'ohpichamber',
});

const isLoopbackHostname = (hostname) => {
  if (hostname === '::1' || hostname === '[::1]') return true;
  const octets = hostname.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return false;
  const values = octets.map(Number);
  return values[0] === 127 && values.every((value) => value <= 255);
};

export const parseLoopbackUpdaterUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:')
      || !isLoopbackHostname(url.hostname)
      || url.username
      || url.password
      || url.search
      || url.hash) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

/**
 * The feed the updater reads: the fork's GitHub Releases. A build carrying the
 * compile-time E2E marker and run with the E2E environment reads a loopback
 * feed instead, so a real update can be exercised without publishing.
 */
export const resolveUpdaterFeed = ({
  environment = process.env,
  testBuild = false,
} = {}) => {
  if (environment.OPENCHAMBER_E2E !== '1'
    || testBuild !== true) {
    return PRODUCTION_UPDATER_FEED;
  }

  const url = parseLoopbackUpdaterUrl(environment.OPENCHAMBER_UPDATER_E2E_URL);
  if (!url) return PRODUCTION_UPDATER_FEED;
  return { provider: 'generic', url };
};
