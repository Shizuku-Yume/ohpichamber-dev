// Retained legacy provider/login configuration. Native archive transport is owned separately.
import { SpaceError } from './errors.js';
import { tail } from './exec-http.js';
import { IMAGE_ONLY_PATH, IMAGE_SH, SPACE_OPENCODE_CONFIG_DIRECTORY, SPACE_OPENCODE_CONFIG_PATH, spaceWindowUrl } from './layout.js';

// OpenCode takes a key from this option and its auth plugins stay out of the way; the window
// throws it away and puts the real one in its place. It is not a secret and never was one.
export const WINDOW_PLACEHOLDER_KEY = 'space-window';

// Through a temporary name, so OpenCode never reads half a file. The configuration is JSON on
// stdin: nothing of it is an argument.
const WRITE_CONFIG_SCRIPT = [
  IMAGE_ONLY_PATH,
  `mkdir -p ${SPACE_OPENCODE_CONFIG_DIRECTORY}`,
  `&& cat > ${SPACE_OPENCODE_CONFIG_PATH}.new && mv ${SPACE_OPENCODE_CONFIG_PATH}.new ${SPACE_OPENCODE_CONFIG_PATH}`,
].join(' ');

/**
 * OpenCode's global configuration for a space with these model grants: each provider, under the
 * id the host's catalog gives it, with its base URL at the window and a placeholder key. The
 * composer offers the host's catalog, and the same provider id inside is what makes that choice
 * work in the space unchanged. Decided with the maintainer on 2026-09-26.
 */
export function buildProviderConfig(grants) {
  const provider = {};
  for (const grant of grants) {
    if (grant.kind === 'model') provider[grant.provider] = { options: { baseURL: spaceWindowUrl(grant.id), apiKey: WINDOW_PLACEHOLDER_KEY } };
    // A login takes its token from the row below, so no placeholder key; `http`, because the
    // window carries no WebSocket, which OpenCode's legacy ChatGPT mode opens by default.
    if (grant.kind === 'login') provider[grant.provider] = { options: { baseURL: spaceWindowUrl(grant.id), transport: 'http' } };
  }
  return { $schema: 'https://opencode.ai/config.json', provider };
}

// Where OpenCode sends a provider's requests for each browser login method, measured on OpenCode
// 2.0.25: the window forwards there with the real token. The space's row names the same method,
// so OpenCode inside sends the headers that upstream wants, with the row's placeholder token in
// `Authorization`, which the window replaces. A method not named here is refused: the host
// cannot know where its requests go. `auth.openai.com`, where every method refreshes, is on no
// list: the gatekeeper refuses it, and the host is the only refresher (decision 13).
const LOGIN_UPSTREAM_BY_METHOD = new Map([
  ['openai/chatgpt-token-sharing', 'https://api.openai.com/v1'],
  ['openai/chatgpt-browser', 'https://chatgpt.com/backend-api/codex'],
  ['openai/chatgpt-headless', 'https://chatgpt.com/backend-api/codex'],
]);
/** The id of the one login row the host writes inside a space, so a replace finds it again. */
export const SPACE_LOGIN_CREDENTIAL_ID = 'cred_openchamber_space';
// OpenCode refreshes a login five minutes before `expires`. The row inside must never refresh,
// because it holds no refresh token and the issuer is refused, so its token ends in 2100.
const NEVER_EXPIRES = Date.UTC(2100, 0, 1);

/**
 * The window grant a host login makes: the upstream of its method, with the token as a bearer.
 * Null for a method this module does not know.
 */
export function loginGrantOf(provider, login) {
  const upstream = LOGIN_UPSTREAM_BY_METHOD.get(`${provider}/${login.methodID}`);
  return upstream ? { upstream, header: 'authorization', secret: login.access } : null;
}

// What the row inside needs of a login's metadata: the account id the legacy Codex mode sends as
// a header, and the client id and scopes the ChatGPT login reads at load. Nothing else travels,
// so a key the host's plugin stores there one day, a cached model list among them today, stays
// on the host.
const LOGIN_METADATA_KEYS = ['accountID', 'clientID', 'scopes'];

/**
 * The login row for OpenCode inside: the host login's method and the metadata named above,
 * which name the account and never a secret, with placeholder tokens that never expire.
 */
export function buildLoginRow(provider, login) {
  const metadata = {};
  for (const key of LOGIN_METADATA_KEYS) if (login.metadata[key] !== undefined) metadata[key] = login.metadata[key];
  const value = { type: 'oauth', methodID: login.methodID, access: WINDOW_PLACEHOLDER_KEY, refresh: WINDOW_PLACEHOLDER_KEY, expires: NEVER_EXPIRES };
  if (Object.keys(metadata).length > 0) value.metadata = metadata;
  return { id: SPACE_LOGIN_CREDENTIAL_ID, integrationID: provider, label: 'OpenChamber space', value };
}

// A login row is two small requests to OpenCode inside, which answers them in milliseconds.
const ROW_TIMEOUT_MS = 30_000;

/** Writes the retained provider/login configuration through the existing space channel. */
export function createSpaceOpenCode({ exec, requestInside }) {
  /** Writes the whole global configuration from the model grants the record holds. */
  const writeProviderConfig = async (spaceId, grants) => {
    const text = `${JSON.stringify(buildProviderConfig(grants), null, 2)}\n`;
    const result = await exec(spaceId, [IMAGE_SH, '-c', WRITE_CONFIG_SCRIPT], { stdin: text });
    if (result.code !== 0) {
      throw new SpaceError('space_setup_failed', `Could not write the provider configuration inside the space: ${tail(result.stderr) || `exit code ${result.code}`}`);
    }
  };

  /** One request of the host's to OpenCode inside, answered with its status; the body is drained. */
  const askInside = async (spaceId, request) => {
    const headers = { accept: 'application/json' };
    if (request.body) headers['content-type'] = 'application/json';
    const response = await requestInside(spaceId, { ...request, headers, timeoutMs: ROW_TIMEOUT_MS });
    response.resume();
    await new Promise((resolve) => { response.on('end', resolve); response.on('error', resolve); response.on('close', resolve); });
    return response.statusCode;
  };

  /** Takes the host's login row out of OpenCode inside; a row that is not there is nothing to do. */
  const removeLogin = async (spaceId) => {
    const status = await askInside(spaceId, { method: 'DELETE', path: `/api/credential/${SPACE_LOGIN_CREDENTIAL_ID}` });
    if (status !== 204 && status !== 200 && status !== 404) throw new SpaceError('space_setup_failed', `Could not remove the login row inside the space: OpenCode answered ${status}`);
  };

  /**
   * Writes the login row for a host login into OpenCode inside, replacing the one before: OpenCode
   * takes the new row as the provider's login at once and switches its ChatGPT mode on, measured
   * on 2.0.25. A row the agent made under the host's id is replaced like the host's own.
   */
  const writeLogin = async (spaceId, provider, login) => {
    await removeLogin(spaceId);
    const status = await askInside(spaceId, { method: 'POST', path: '/api/credential', body: JSON.stringify(buildLoginRow(provider, login)) });
    if (status !== 200) throw new SpaceError('space_setup_failed', `Could not write the login row inside the space: OpenCode answered ${status}`);
  };

  return { writeProviderConfig, writeLogin, removeLogin };
}
