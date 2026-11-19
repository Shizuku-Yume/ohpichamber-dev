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

  it('requires a settled assistant message and never authorizes live, user or system text', async () => {
    const f = await fixture();
    for (const role of ['user', 'system']) {
      f.sessionService.open.mockResolvedValue(snapshot([message({ role })], [turn()]));
      await f.prepare().expect(404);
    }
    f.sessionService.open.mockResolvedValue(snapshot([message()], [turn({ status: 'running', finishedAt: undefined })]));
    await f.prepare().expect(404);
  });
});
