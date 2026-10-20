import { z } from 'zod';
import { isPackagedUiDocumentUrl } from './packaged-ui-routing.mjs';

const CLIENT_TOKEN_PATTERN = /^oc_client_[A-Za-z0-9_-]{43}$/;
const createdClientResponse = z.object({ token: z.string().regex(CLIENT_TOKEN_PATTERN) });
const issuanceOwners = z.object({
  fetchImpl: z.function(),
  persistToken: z.function(),
});
const pendingIssuance = new Map();

// A packaged window is trusted with the embedded Host's credential only when
// all three hold: the window renders the packaged application shell, that
// shell was built for packaged UI, and the runtime base is this machine's own
// Host. Remote pages and remote runtime switches keep their own credentials.
export const shouldBootstrapPackagedLocalAuth = ({
  uiUrl,
  packagedUi,
  isLocalRuntime,
}) => packagedUi === true && isLocalRuntime === true && isPackagedUiDocumentUrl(uiUrl);

const buildClientCreationUrl = (apiBaseUrl) => {
  try {
    const url = new URL(apiBaseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/client-auth/clients`;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
};

const readCreatedClientToken = (payload) => createdClientResponse.safeParse(payload).data?.token ?? null;

const createLocalDesktopClient = async ({ url, fetchImpl, persistToken }) => {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'OpenChamber Desktop',
        clientKind: 'desktop-local',
        dedupeKey: 'desktop-local',
      }),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { status: 'unavailable', reason: 'request-failed' };
  }

  if (!response.ok) {
    return { status: 'unavailable', reason: 'http-rejected', httpStatus: response.status };
  }

  const token = readCreatedClientToken(await response.json().catch(() => null));
  if (!token) return { status: 'unavailable', reason: 'invalid-response' };

  try {
    await persistToken(token);
  } catch {
    return { status: 'unavailable', reason: 'persistence-failed' };
  }
  return { status: 'created', token };
};

/**
 * Reuses the desktop's stored `desktop-local` Host credential, or asks the
 * (passwordless) local Host to mint one with cookies omitted. The caller owns
 * the applicability decision and persists before exposing the token to a
 * renderer. Concurrent windows share one in-flight request per Host.
 */
export const ensureDesktopLocalClientToken = async ({
  apiBaseUrl,
  existingToken = '',
  fetchImpl,
  persistToken,
}) => {
  const token = z.string().trim().parse(existingToken);
  if (token) return { status: 'existing', token };
  const owners = issuanceOwners.parse({ fetchImpl, persistToken });

  const url = buildClientCreationUrl(apiBaseUrl);
  if (!url) return { status: 'unavailable', reason: 'invalid-api-url' };

  const key = url.href;
  const current = pendingIssuance.get(key);
  if (current) return current;

  const pending = createLocalDesktopClient({ url, ...owners });
  pendingIssuance.set(key, pending);
  try {
    return await pending;
  } finally {
    if (pendingIssuance.get(key) === pending) pendingIssuance.delete(key);
  }
};
