import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPackagedUiDocumentUrl, isPackagedUiRuntimeRequest } from './packaged-ui-routing.mjs';

describe('packaged UI runtime routing', () => {
  it('recognizes runtime paths without treating packaged assets as runtime requests', () => {
    for (const path of ['/api', '/api/session/ses_1', '//api/session/ses_1', '/%61pi/session/ses_1', '/auth', '/auth/session', '/health']) {
      assert.equal(isPackagedUiRuntimeRequest(`openchamber-ui://app${path}`), true);
    }
    for (const path of ['/assets/main.js', '/index.html', '/healthy']) {
      assert.equal(isPackagedUiRuntimeRequest(`openchamber-ui://app${path}`), false);
    }
  });
});

describe('packaged UI document identity', () => {
  it('recognizes application-shell documents by scheme and host, not by origin', () => {
    // WHATWG URL reports an opaque origin ("null") for a custom scheme, so an
    // origin comparison could never match the packaged shell.
    assert.equal(new URL('openchamber-ui://app/index.html').origin, 'null');
    for (const url of [
      'openchamber-ui://app',
      'openchamber-ui://app/',
      'openchamber-ui://app/index.html',
      'openchamber-ui://app/mini-chat.html?mode=draft',
      'openchamber-ui://app/__splash',
    ]) {
      assert.equal(isPackagedUiDocumentUrl(url), true, url);
    }
  });

  it('refuses remote pages, another packaged host, and non-URL navigation targets', () => {
    for (const url of [
      'http://127.0.0.1:57123/index.html',
      'https://remote.example/index.html',
      'openchamber-ui://evil/index.html',
      'openchamber-ui://app.evil/index.html',
      'openchamber-ui://user@app.example/index.html',
      'file:///opt/OpenChamber/resources/web-dist/index.html',
      'data:text/html,<p>splash</p>',
      'about:blank',
      'not a url',
      '',
    ]) {
      assert.equal(isPackagedUiDocumentUrl(url), false, url);
    }
  });
});
