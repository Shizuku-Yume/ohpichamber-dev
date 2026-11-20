import { describe, expect, test } from 'bun:test';
import express from 'express';
import request from 'supertest';

import { createUploadStore, registerUploadRoute } from './uploads.js';

describe('upload store', () => {
  test('answers the files of a live upload by index, and nothing after two minutes', () => {
    let clock = 0;
    const store = createUploadStore({ now: () => clock });
    const file = { name: 'a.png', path: '/p/a.png', size: 3, bytes: Buffer.from('png') };
    const { token, files } = store.put([file]);

    expect(files).toEqual([{ name: 'a.png', size: 3 }]);
    expect(store.get(token, 0)).toBe(file);
    expect(store.get(token, 1)).toBeNull();
    expect(store.get('other', 0)).toBeNull();

    clock = 2 * 60 * 1000;
    expect(store.get(token, 0)).toBeNull();
  });
});

describe('upload download route', () => {
  test('serves uncached bytes, including empty files, and refuses invalid or expired tickets', async () => {
    let clock = 0;
    const store = createUploadStore({ now: () => clock });
    const ticket = store.put([
      { name: 'a.txt', path: '/session/a.txt', size: 5, bytes: Buffer.from('hello') },
      { name: 'empty', path: '/session/empty', size: 0, bytes: Buffer.alloc(0) },
    ]);
    const app = express();
    registerUploadRoute(app, { store });
    const response = await request(app).get(`/api/browser-control/uploads/${ticket.token}/0`).expect(200);
    expect(response.body.toString()).toBe('hello');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toBe('application/octet-stream');
    const empty = await request(app).get(`/api/browser-control/uploads/${ticket.token}/1`).expect(200);
    expect(empty.body.length).toBe(0);
    for (const suffix of ['other/0', `${ticket.token}/-1`, `${ticket.token}/1.5`, `${ticket.token}/2`]) {
      await request(app).get(`/api/browser-control/uploads/${suffix}`).expect(404);
    }
    clock = 2 * 60 * 1000;
    await request(app).get(`/api/browser-control/uploads/${ticket.token}/0`).expect(404);
  });
});
