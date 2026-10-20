export const UI_PROTOCOL = 'openchamber-ui';

const RUNTIME_PATH = /^\/(?:api(?:\/|$)|auth(?:\/|$)|health$)/;

export const isPackagedUiRuntimeRequest = (requestUrl) => {
  let pathname = new URL(requestUrl).pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // A malformed escape cannot name one of the reserved runtime paths.
  }
  const normalized = `/${pathname.split('/').filter(Boolean).join('/')}`;
  return RUNTIME_PATH.test(normalized);
};

// Whether a navigation target is the packaged application shell. Chromium's
// WHATWG URL gives a custom scheme an opaque origin, so `new URL(url).origin`
// is "null" here; the scheme and host are the identifying pair.
export const isPackagedUiDocumentUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    return url.protocol === `${UI_PROTOCOL}:` && url.hostname === 'app';
  } catch {
    return false;
  }
};
