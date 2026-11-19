import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerMarkdownImageGrantRoutes } from './routes.js';
import { history, message, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
const fixture = async ({ sources = ['image.png'], markdown } = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canonical-image-grants-')); roots.push(root);
  const directory = path.join(root, 'workspace'); const approvedTempRoot = path.join(root, 'agent-images');
  await fs.mkdir(directory); await fs.mkdir(approvedTempRoot); await fs.writeFile(path.join(directory, 'image.png'), PNG);
  let text = markdown ?? sources.map((source) => `![image](${source})`).join('\n');
  let currentScope = { projectId: 'project', workspaceId: 'workspace', cwd: directory, agentDirectoryId: 'agent', agentDirectory: root, rootSessionId: 'session' };
  const sessionService = { open: vi.fn(async () => snapshot([message({ parts: [{ type: 'text', partId: 't', content: text }] })], [turn()])),
    history: vi.fn(async () => history([], [])) };
  let at = 1; let fullReads = 0;
  const app = express();
  registerMarkdownImageGrantRoutes(app, { fsPromises: { ...fs, readFile: async (...args) => { fullReads += 1; return fs.readFile(...args); } },
    path, crypto, approvedTempRoot, sessionService, resolveSessionScope: async () => currentScope, now: () => at });
  return { app, root, directory, approvedTempRoot, sessionService, fullReads: () => fullReads,
    setText(value) { text = value; }, setScope(value) { currentScope = value; }, expire() { at += 600001; },
    prepare: (input = sources, extra = {}) => request(app).post('/api/openchamber/sessions/session/markdown-image-grants').send({ messageId: 'assistant', sources: input, ...extra }) };
};

describe('canonical markdown image grants', () => {
  it('authorizes exact assistant Markdown once and returns opaque authenticated asset paths, never Host paths', async () => {
    const f = await fixture();
    const temporaryPath = path.join(f.approvedTempRoot, 'omp-image-123.png'); await fs.writeFile(temporaryPath, PNG);
    const source = new URL(`file://${temporaryPath}`).toString(); f.setText(`![workspace](image.png)\n![temporary](${source})`);
    const response = await f.prepare(['image.png', source], { directory: '/untrusted/other-workspace' }).expect(200);
    expect(f.sessionService.open).toHaveBeenCalledTimes(1); expect(f.fullReads()).toBe(0);
    expect(response.body.results.map((entry) => entry.sourceIndex)).toEqual([0, 1]);
    expect(JSON.stringify(response.body)).not.toContain(f.root); expect(JSON.stringify(response.body)).not.toContain('file://');
    for (const result of response.body.results) {
      expect(result.status).toBe('ready');
      const raw = await request(f.app).get(result.assetPath).expect(200);
      expect(raw.headers['content-type']).toContain('image/png'); expect(raw.body).toEqual(PNG);
    }
  });

  it('keeps valid results when siblings are missing, unreferenced, or invalid images', async () => {
    const f = await fixture({ sources: ['image.png', 'missing.png', 'text.png'] }); await fs.writeFile(path.join(f.directory, 'text.png'), 'not an image');
    const response = await f.prepare(['image.png', 'missing.png', 'text.png', 'unreferenced.png']).expect(200);
    expect(response.body.results.map((entry) => entry.status)).toEqual(['ready', 'missing', 'error', 'error']);
  });

  it.each([
    ['reference.png', '![screenshot][result]\n\n[result]: reference.png'],
    ['screen(1).png', '![screenshot](screen(1).png)'],
    ['screen%20shot.png?version=1#preview', '![screenshot](screen%20shot.png?version=1#preview)'],
    ['image.png', '![screenshot](image.png "preview")'],
  ])('preserves Markdown destination authorization for %s', async (source, markdown) => {
    const f = await fixture({ sources: [source], markdown });
    const name = decodeURIComponent(source.split(/[?#]/, 1)[0]); await fs.writeFile(path.join(f.directory, name), PNG);
    expect((await f.prepare().expect(200)).body.results[0].status).toBe('ready');
  });

  it.each(['```md\n![code](image.png)\n```', '`![code](image.png)`', '![malformed](image.png "unclosed"'])('does not grant image syntax excluded by retained Markdown parser', async (markdown) => {
    const f = await fixture({ markdown });
    expect((await f.prepare().expect(200)).body.results).toEqual([{ sourceIndex: 0, status: 'error' }]);
  });

  it('rejects workspace symlink escapes and temporary files outside the Host-approved image root', async () => {
    const f = await fixture(); const outside = path.join(f.root, 'secret.png'); await fs.writeFile(outside, PNG);
    await fs.symlink(outside, path.join(f.directory, 'escape.png'));
    f.setText(`![escape](escape.png)\n![outside](${outside})`);
    expect((await f.prepare(['escape.png', outside]).expect(200)).body.results.map((entry) => entry.status)).toEqual(['error', 'error']);
  });

  it('limits the shared temporary root to native image namespaces and rejects renamed scopes', async () => {
    const f = await fixture();
    const unrelated = path.join(f.approvedTempRoot, 'secret.png'); await fs.writeFile(unrelated, PNG);
    const nested = path.join(f.approvedTempRoot, 'nested', 'omp-image-123.png');
    await fs.mkdir(path.dirname(nested)); await fs.writeFile(nested, PNG);
    const alias = path.join(f.approvedTempRoot, 'omp-image-456.png'); await fs.symlink(unrelated, alias);
    f.setText(`![unrelated](${unrelated})\n![nested](${nested})\n![alias](${alias})\n![workspace](image.png)`);
    const prepared = (await f.prepare([unrelated, nested, alias, 'image.png']).expect(200)).body.results;
    expect(prepared.map((entry) => entry.status)).toEqual(['error', 'error', 'error', 'ready']);
    f.setScope({ workspaceId: 'another-workspace', rootSessionId: 'session', cwd: f.directory });
    await request(f.app).get(prepared[3].assetPath).expect(403);
  });

  it('binds use to session scope and expiry and rechecks replaced symlinks at use time', async () => {
    const f = await fixture(); const ready = (await f.prepare().expect(200)).body.results[0];
    await request(f.app).get(ready.assetPath.replace('/session/', '/another/')).expect(404);
    await fs.unlink(path.join(f.directory, 'image.png'));
    const outside = path.join(f.root, 'outside.png'); await fs.writeFile(outside, PNG);
    await fs.symlink(outside, path.join(f.directory, 'image.png'));
    await request(f.app).get(ready.assetPath).expect(404);
    f.expire(); await request(f.app).get(ready.assetPath).expect(404);
  });

  it('returns an unavailable error rather than an authoritative missing message after failed history', async () => {
    const f = await fixture(); f.sessionService.open.mockResolvedValue(snapshot());
    f.sessionService.history.mockRejectedValue(new Error('private /path credential=secret'));
    const response = await f.prepare().expect(503);
    expect(response.body).toEqual({ error: 'Failed to prepare session images' });
  });

<<<<<<< HEAD
  it('requires a settled assistant message and never authorizes live, user or system text', async () => {
    const f = await fixture();
    for (const role of ['user', 'system']) {
      f.sessionService.open.mockResolvedValue(snapshot([message({ role })], [turn()]));
      await f.prepare().expect(404);
||||||| bc50ba56aa
  it('authorizes the files a finished openchamber_image call saved, and no others', async () => {
    const fixture = await createFixture({ sources: [] });
    const madePath = path.join(fixture.directory, 'made.png');
    const failedPath = path.join(fixture.directory, 'failed.png');
    await Promise.all([madePath, failedPath].map((file) => fs.writeFile(file, PNG)));
    const envelope = (ok, file) => JSON.stringify({ schemaVersion: 1, ok, action: 'image.generate', data: { images: [{ path: file }] } });
    fixture.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'msg_1',
      type: 'assistant',
      content: [
        { type: 'tool', name: 'openchamber_image', id: 'call_1', state: { status: 'completed', input: {}, content: [{ type: 'text', text: envelope(true, madePath) }] } },
        { type: 'tool', name: 'openchamber_image', id: 'call_2', state: { status: 'completed', input: {}, content: [{ type: 'text', text: envelope(false, failedPath) }] } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await prepare(fixture.app, fixture.directory, [madePath, failedPath]);
    expect(response.body.results).toEqual([
      { source: madePath, status: 'ready', path: madePath },
      { source: failedPath, status: 'error' },
    ]);
  });

  it('authorizes the screenshot a browser.capture call saved, behind Code Mode too, and no others', async () => {
    const fixture = await createFixture({ sources: [] });
    const shots = ['direct', 'script', 'quoted', 'failed', 'other'].map((name) => `.openchamber/screenshots/${name}.png`);
    await fs.mkdir(path.join(fixture.directory, '.openchamber', 'screenshots'), { recursive: true });
    await Promise.all(shots.map((file) => fs.writeFile(path.join(fixture.directory, file), PNG)));
    const envelope = (ok, file, action = 'browser.capture') => JSON.stringify({ schemaVersion: 1, ok, action, data: { path: file } });
    const tool = (name, id, text) => ({ type: 'tool', name, id, state: { status: 'completed', input: {}, content: [{ type: 'text', text }] } });
    fixture.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'msg_1',
      type: 'assistant',
      content: [
        tool('openchamber_web', 'call_1', envelope(true, shots[0])),
        tool('execute', 'call_2', envelope(true, shots[1])),
        tool('execute', 'call_3', JSON.stringify(envelope(true, shots[2]))),
        tool('execute', 'call_4', envelope(false, shots[3])),
        tool('execute', 'call_5', envelope(true, shots[4], 'browser.snapshot')),
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await prepare(fixture.app, fixture.directory, shots);
    expect(response.body.results.map((result) => result.status)).toEqual(['ready', 'ready', 'ready', 'error', 'error']);
  });

  it('matches a generated file with spaces or other letters however Markdown encoded it', async () => {
    const fixture = await createFixture({ sources: [] });
    const folder = path.join(fixture.directory, 'my images');
    await fs.mkdir(folder, { recursive: true });
    const madePath = path.join(folder, 'маяк.png');
    await fs.writeFile(madePath, PNG);
    const text = JSON.stringify({ schemaVersion: 1, ok: true, action: 'image.generate', data: { images: [{ path: madePath }] } });
    fixture.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'msg_1',
      type: 'assistant',
      content: [{ type: 'tool', name: 'openchamber_image', id: 'call_1', state: { status: 'completed', input: {}, content: [{ type: 'text', text }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const encoded = encodeURI(madePath);
    const response = await prepare(fixture.app, fixture.directory, [encoded]);
    expect(response.body.results).toEqual([expect.objectContaining({ source: encoded, status: 'ready' })]);
  });

  it('prepares every image a page or a text names in one request, past twelve', async () => {
    const fixture = await createFixture({ sources: [] });
    const files = Array.from({ length: 19 }, (_, index) => path.join(fixture.directory, `poster-${index + 1}.png`));
    await Promise.all(files.map((file) => fs.writeFile(file, PNG)));
    const html = files.map((file) => `<img src="${file}">`).join('');
    const message = {
      id: 'msg_1',
      type: 'assistant',
      content: [
        { type: 'text', text: files.map((file) => `![poster](${file})`).join('\n') },
        { type: 'tool', name: 'openchamber_render', id: 'call_1', state: { status: 'completed', input: { html, title: 'Posters' } } },
      ],
    };
    fixture.fetchMock.mockImplementation(async () => new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } }));

    const page = await preparePage(fixture.app, fixture.directory, 'call_1', files);
    const text = await prepare(fixture.app, fixture.directory, files);

    for (const response of [page, text]) {
      expect(response.body.results).toEqual(files.map((file) => ({ source: file, status: 'ready', path: file })));
=======
  it('reads the page of a call a harness spilled into the action text, as the plugin revives it', async () => {
    const fixture = await createFixture({ sources: [] });
    const [onPage, sibling, unreferenced] = ['on-page.png', 'sibling.png', 'unreferenced.png']
      .map((name) => path.join(fixture.directory, name));
    await Promise.all([onPage, sibling, unreferenced].map((file) => fs.writeFile(file, PNG)));
    const spilled = (fields) => ({ action: JSON.stringify({ awaitAnswer: true, ...fields }) });
    const message = {
      id: 'msg_1',
      type: 'assistant',
      content: [
        { type: 'tool', name: 'openchamber_render', id: 'call_1', state: { status: 'running', input: spilled({ html: `<img src="${onPage}">`, parameters: null }) } },
        // The spilled object's own parameters win over its siblings.
        { type: 'tool', name: 'openchamber_render', id: 'call_2', state: { status: 'running', input: spilled({ html: `<img src="${sibling}">`, parameters: { html: `<img src="${onPage}">` } }) } },
      ],
    };
    fixture.fetchMock.mockImplementation(async () => new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } }));

    const first = await preparePage(fixture.app, fixture.directory, 'call_1', [onPage, unreferenced]);
    expect(first.body.results).toEqual([
      { source: onPage, status: 'ready', path: onPage },
      { source: unreferenced, status: 'error' },
    ]);
    const second = await preparePage(fixture.app, fixture.directory, 'call_2', [onPage, sibling]);
    expect(second.body.results).toEqual([
      { source: onPage, status: 'ready', path: onPage },
      { source: sibling, status: 'error' },
    ]);
  });

  it('authorizes the files a finished openchamber_image call saved, and no others', async () => {
    const fixture = await createFixture({ sources: [] });
    const madePath = path.join(fixture.directory, 'made.png');
    const failedPath = path.join(fixture.directory, 'failed.png');
    await Promise.all([madePath, failedPath].map((file) => fs.writeFile(file, PNG)));
    const envelope = (ok, file) => JSON.stringify({ schemaVersion: 1, ok, action: 'image.generate', data: { images: [{ path: file }] } });
    fixture.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'msg_1',
      type: 'assistant',
      content: [
        { type: 'tool', name: 'openchamber_image', id: 'call_1', state: { status: 'completed', input: {}, content: [{ type: 'text', text: envelope(true, madePath) }] } },
        { type: 'tool', name: 'openchamber_image', id: 'call_2', state: { status: 'completed', input: {}, content: [{ type: 'text', text: envelope(false, failedPath) }] } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await prepare(fixture.app, fixture.directory, [madePath, failedPath]);
    expect(response.body.results).toEqual([
      { source: madePath, status: 'ready', path: madePath },
      { source: failedPath, status: 'error' },
    ]);
  });

  it('authorizes the screenshot a browser.capture call saved, behind Code Mode too, and no others', async () => {
    const fixture = await createFixture({ sources: [] });
    const shots = ['direct', 'script', 'quoted', 'failed', 'other'].map((name) => `.openchamber/screenshots/${name}.png`);
    await fs.mkdir(path.join(fixture.directory, '.openchamber', 'screenshots'), { recursive: true });
    await Promise.all(shots.map((file) => fs.writeFile(path.join(fixture.directory, file), PNG)));
    const envelope = (ok, file, action = 'browser.capture') => JSON.stringify({ schemaVersion: 1, ok, action, data: { path: file } });
    const tool = (name, id, text) => ({ type: 'tool', name, id, state: { status: 'completed', input: {}, content: [{ type: 'text', text }] } });
    fixture.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'msg_1',
      type: 'assistant',
      content: [
        tool('openchamber_web', 'call_1', envelope(true, shots[0])),
        tool('execute', 'call_2', envelope(true, shots[1])),
        tool('execute', 'call_3', JSON.stringify(envelope(true, shots[2]))),
        tool('execute', 'call_4', envelope(false, shots[3])),
        tool('execute', 'call_5', envelope(true, shots[4], 'browser.snapshot')),
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await prepare(fixture.app, fixture.directory, shots);
    expect(response.body.results.map((result) => result.status)).toEqual(['ready', 'ready', 'ready', 'error', 'error']);
  });

  it('matches a generated file with spaces or other letters however Markdown encoded it', async () => {
    const fixture = await createFixture({ sources: [] });
    const folder = path.join(fixture.directory, 'my images');
    await fs.mkdir(folder, { recursive: true });
    const madePath = path.join(folder, 'маяк.png');
    await fs.writeFile(madePath, PNG);
    const text = JSON.stringify({ schemaVersion: 1, ok: true, action: 'image.generate', data: { images: [{ path: madePath }] } });
    fixture.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'msg_1',
      type: 'assistant',
      content: [{ type: 'tool', name: 'openchamber_image', id: 'call_1', state: { status: 'completed', input: {}, content: [{ type: 'text', text }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const encoded = encodeURI(madePath);
    const response = await prepare(fixture.app, fixture.directory, [encoded]);
    expect(response.body.results).toEqual([expect.objectContaining({ source: encoded, status: 'ready' })]);
  });

  it('prepares every image a page or a text names in one request, past twelve', async () => {
    const fixture = await createFixture({ sources: [] });
    const files = Array.from({ length: 19 }, (_, index) => path.join(fixture.directory, `poster-${index + 1}.png`));
    await Promise.all(files.map((file) => fs.writeFile(file, PNG)));
    const html = files.map((file) => `<img src="${file}">`).join('');
    const message = {
      id: 'msg_1',
      type: 'assistant',
      content: [
        { type: 'text', text: files.map((file) => `![poster](${file})`).join('\n') },
        { type: 'tool', name: 'openchamber_render', id: 'call_1', state: { status: 'completed', input: { html, title: 'Posters' } } },
      ],
    };
    fixture.fetchMock.mockImplementation(async () => new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } }));

    const page = await preparePage(fixture.app, fixture.directory, 'call_1', files);
    const text = await prepare(fixture.app, fixture.directory, files);

    for (const response of [page, text]) {
      expect(response.body.results).toEqual(files.map((file) => ({ source: file, status: 'ready', path: file })));
>>>>>>> upstream/main
    }
    f.sessionService.open.mockResolvedValue(snapshot([message()], [turn({ status: 'running', finishedAt: undefined })]));
    await f.prepare().expect(404);
  });
});
