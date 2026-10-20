import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureDesktopLocalClientToken, shouldBootstrapPackagedLocalAuth } from './desktop-local-auth.mjs';

const token = `oc_client_${'a'.repeat(43)}`;

const response = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

describe('packaged local auth applicability', () => {
  it('bootstraps only the packaged shell served for this machine\'s Host', () => {
    const local = { uiUrl: 'openchamber-ui://app/index.html', packagedUi: true, isLocalRuntime: true };
    assert.equal(shouldBootstrapPackagedLocalAuth(local), true);
    assert.equal(shouldBootstrapPackagedLocalAuth({ ...local, uiUrl: 'openchamber-ui://app/mini-chat.html?mode=draft' }), true);
  });

  it('excludes remote hosts, remote pages, and non-packaged surfaces', () => {
    const local = { uiUrl: 'openchamber-ui://app/index.html', packagedUi: true, isLocalRuntime: true };
    assert.equal(shouldBootstrapPackagedLocalAuth({ ...local, isLocalRuntime: false }), false);
    assert.equal(shouldBootstrapPackagedLocalAuth({ ...local, packagedUi: false }), false);
    assert.equal(shouldBootstrapPackagedLocalAuth({ ...local, uiUrl: 'https://remote.example/index.html' }), false);
    assert.equal(shouldBootstrapPackagedLocalAuth({ ...local, uiUrl: 'http://127.0.0.1:57123/index.html' }), false);
    assert.equal(shouldBootstrapPackagedLocalAuth({ ...local, uiUrl: undefined }), false);
  });
});

describe('packaged local desktop authentication', () => {
  it('issues and persists a local desktop credential for the packaged local UI', async () => {
    const requests = [];
    const persisted = [];
    const result = await ensureDesktopLocalClientToken({
      apiBaseUrl: 'http://127.0.0.1:57123/openchamber?ignored=1',
      fetchImpl: async (url, init) => {
        requests.push({ url: url.toString(), init });
        return response(201, { token });
      },
      persistToken: async (value) => persisted.push(value),
    });

    assert.deepEqual(result, { status: 'created', token });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://127.0.0.1:57123/openchamber/api/client-auth/clients');
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.credentials, 'omit');
    assert.equal(requests[0].init.redirect, 'error');
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      label: 'OpenChamber Desktop',
      clientKind: 'desktop-local',
      dedupeKey: 'desktop-local',
    });
    assert.deepEqual(persisted, [token]);
  });

  it('reuses a stored credential without rotating the Host client', async () => {
    let requests = 0;
    const result = await ensureDesktopLocalClientToken({
      apiBaseUrl: 'http://127.0.0.1:57123',
      existingToken: token,
      fetchImpl: async () => {
        requests += 1;
        return response(201, { token });
      },
      persistToken: async () => assert.fail('existing token must not be rewritten'),
    });

    assert.deepEqual(result, { status: 'existing', token });
    assert.equal(requests, 0);
  });

  it('leaves Hosts that require a session or client auth unauthenticated when creation is refused', async () => {
    let persisted = false;
    const result = await ensureDesktopLocalClientToken({
      apiBaseUrl: 'http://127.0.0.1:57123',
      fetchImpl: async (_url, init) => {
        assert.equal(init.credentials, 'omit');
        return response(401, { error: 'UI authentication required', locked: true });
      },
      persistToken: async () => { persisted = true; },
    });

    assert.deepEqual(result, { status: 'unavailable', reason: 'http-rejected', httpStatus: 401 });
    assert.equal(persisted, false);
  });

  it('reports transport failure without inventing a credential', async () => {
    let persisted = false;
    const result = await ensureDesktopLocalClientToken({
      apiBaseUrl: 'http://127.0.0.1:57123',
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED');
      },
      persistToken: async () => { persisted = true; },
    });

    assert.deepEqual(result, { status: 'unavailable', reason: 'request-failed' });
    assert.equal(persisted, false);
  });

  it('coalesces concurrent local issuance to one token and one persistence write', async () => {
    let finishRequest;
    let requests = 0;
    let persists = 0;
    const responseGate = new Promise((resolve) => { finishRequest = resolve; });
    const options = {
      apiBaseUrl: 'http://127.0.0.1:57123',
      fetchImpl: async () => {
        requests += 1;
        return responseGate;
      },
      persistToken: async (value) => {
        assert.equal(value, token);
        persists += 1;
      },
    };

    const first = ensureDesktopLocalClientToken(options);
    const second = ensureDesktopLocalClientToken(options);
    finishRequest(response(201, { token }));
    const results = await Promise.all([first, second]);

    assert.deepEqual(results, [{ status: 'created', token }, { status: 'created', token }]);
    assert.equal(requests, 1);
    assert.equal(persists, 1);
  });

  it('rejects malformed Host token responses without persisting them', async () => {
    let persisted = false;
    const result = await ensureDesktopLocalClientToken({
      apiBaseUrl: 'http://127.0.0.1:57123',
      fetchImpl: async () => response(201, { token: 'not-a-client-token' }),
      persistToken: async () => { persisted = true; },
    });

    assert.deepEqual(result, { status: 'unavailable', reason: 'invalid-response' });
    assert.equal(persisted, false);
  });

  it('reports an unparseable Host base URL instead of relying on a default origin', async () => {
    let fetched = false;
    const result = await ensureDesktopLocalClientToken({
      apiBaseUrl: '',
      fetchImpl: async () => {
        fetched = true;
        return response(201, { token });
      },
      persistToken: async () => { assert.fail('nothing to persist'); },
    });

    assert.deepEqual(result, { status: 'unavailable', reason: 'invalid-api-url' });
    assert.equal(fetched, false);
  });
});
