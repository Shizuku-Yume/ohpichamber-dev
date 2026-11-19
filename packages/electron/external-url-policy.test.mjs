import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExternalUrl, tryParseExternalUrl } from './external-url-policy.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('the native external URL command opens a confirmed application link', async () => {
  const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
  const start = main.indexOf('const handleInvoke = async ');
  const end = main.indexOf('\n};', start);
  const opened = [];
  const invoke = vm.runInNewContext(`${main.slice(start, end + 3)}\nhandleInvoke;`, {
    tryParseExternalUrl,
    findConfiguredHostForUrl: () => null,
    shell: { openExternal: async (url) => { opened.push(url); } },
  });
  const url = 'vscode://file/tmp/project/index.ts:10';
  await invoke(null, 'desktop_open_external_url', { url });
  assert.deepEqual(opened, [url]);
  await assert.rejects(invoke(null, 'desktop_open_external_url', { url: 'file:///tmp/project/index.ts' }), /scheme/);
  assert.deepEqual(opened, [url]);
});

test('preserves editor file paths, lines and columns for the OS handler', () => {
  for (const url of [
    'vscode://file/Users/person/Project/package.json:7',
    'vscode://file/C:/Project/src/PlayerData.luau:42:3',
    'cursor://file/C:/Project/src/a%20b.ts:12',
    'obsidian://open?vault=Notebook&file=a%20b',
    'https://example.test/path',
    'http://localhost:3901/',
  ]) {
    assert.equal(parseExternalUrl(url).toString(), url);
  }
  assert.equal(parseExternalUrl('VSCODE://file/C:/Project/a.ts:1').protocol, 'vscode:');
});

test('rejects dangerous, internal and non-app protocols at the native boundary', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,test', 'vbscript:msgbox(1)',
    'blob:https://example.test/id', 'filesystem:https://example.test/file', 'about:blank',
    'chrome://settings', 'chrome-extension://id/page', 'devtools://page',
    'moz-extension://id/page', 'ms-browser-extension://id/page', 'file:///etc/passwd',
    'ws://localhost', 'wss://example.test', 'ftp://example.test', 'ftps://example.test',
    'intent://scan/', 'ms-msdt:/id%20PCWDiagnostic', 'search-ms:query=report', 'shell:AppsFolder',
    'ohpichamber://connect?host=x', 'openchamber-ui://app/index.html', 'capacitor://localhost',
    'mailto:user@example.test', 'tel:+123', 'sms:+123', 'callto:+123', 'cid:id',
    'xmpp:user@example.test', 'irc://example.test', 'news:group', 'nntp://example.test',
    'feed:https://example.test', 'webcal://example.test/calendar', '', 'not a url', 'a://file',
  ]) {
    assert.throws(() => parseExternalUrl(url), undefined, url);
  }
});

test('tryParseExternalUrl validates URLs or returns null', () => {
  assert.equal(tryParseExternalUrl('https://google.com')?.toString(), 'https://google.com/');
  assert.equal(tryParseExternalUrl('file:///etc/passwd'), null);
  assert.equal(tryParseExternalUrl('ms-msdt:id=helper'), null);
  assert.equal(tryParseExternalUrl('search-ms:query=test'), null);
  assert.equal(tryParseExternalUrl('javascript:alert(1)'), null);
  assert.equal(tryParseExternalUrl('not a url'), null);
});
