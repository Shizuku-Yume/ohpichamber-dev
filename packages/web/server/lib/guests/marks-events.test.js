import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SERVICE_HOST_PATH } from 'ohpichamber-sdk';

import { hostCallbackUrl, stopHostCallbackListener } from './host-callback.js';
import { guestMarks } from './marks.js';
import { setCapabilityGrants, writeExtensionStore } from './persist.js';
import { beginGuestServiceHost, proxyGuestServiceRequest, stopAllGuestServices } from './service.js';
import { registerGuestServiceHost } from './service-host.js';
import { guestMarksChangedPropertiesSchema as uiGuestMarksChangedPropertiesSchema } from '../../../../ui/src/lib/guests/marks.ts';
import { guestMarksChangedPropertiesSchema } from './marks.js';

describe('guest marks change events', () => {
  let directory;
  let host;
  let bearer;
  let guest;
  let broadcast;
  let post;

  beforeEach(async () => {
    beginGuestServiceHost();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'guest-marks-events-'));
    const packageRoot = path.join(directory, 'desk');
    await fs.mkdir(packageRoot);
    await fs.writeFile(path.join(packageRoot, 'service.mjs'), `
import http from 'node:http';
const token = process.env.OPENCHAMBER_SERVICE_TOKEN;
http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); res.end(); return; }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(req.url === '/token' ? { token } : { ok: true }));
}).listen(Number(process.env.OPENCHAMBER_SERVICE_PORT), '127.0.0.1');
`);
    const persistPath = path.join(directory, 'extensions.json');
    await writeExtensionStore(persistPath, { paths: [packageRoot], sources: {}, capabilityGrants: {} });
    await setCapabilityGrants('desk', persistPath, ['service']);
    const answer = await proxyGuestServiceRequest({
      guestId: 'desk', packageRoot, service: { entry: 'service.mjs' }, granted: ['service'],
      persistPath, method: 'GET', path: '/token',
    });
    bearer = JSON.parse(answer.body).token;
    guest = {
      id: 'desk', name: 'Desk', icon: 'box', packageRoot, enabled: true,
      service: { entry: 'service.mjs', runtime: 'host' }, marks: true,
      capabilityGrants: ['service', 'marks'],
    };
    broadcast = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    host = registerGuestServiceHost({
      dataDir: directory,
      listGuests: vi.fn(async () => [guest]),
      control: { execute: vi.fn(async () => ({})), resolveSessionDirectory: vi.fn(async () => '/repo') },
      sessions: { open: vi.fn(async () => ({ session: { sessionId: 'session_1' }, approvals: [], questions: [] })), control: vi.fn(async () => ({})) },
      request: vi.fn(async () => new Response('{}', { status: 200 })),
      broadcast,
    });
    post = async (method, input, token = bearer) => {
      const response = await fetch(`${await hostCallbackUrl()}${SERVICE_HOST_PATH}`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ method, input }),
      });
      return { status: response.status, body: await response.json() };
    };
  });

  afterEach(async () => {
    host?.dispose();
    await stopAllGuestServices();
    await stopHostCallbackListener();
    guestMarks.clearGuest('desk');
    vi.restoreAllMocks();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  const marksEvents = () => broadcast.mock.calls.map(([event]) => event).filter((event) => event.type === 'openchamber:guest-marks-changed');

  test('a committed mark write announces the scoped target, validated for the UI consumer', async () => {
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: { icon: 'alert', tone: 'warning', text: 'Waiting' } })).toMatchObject({ status: 200 });
    expect(await post('marks.set', { target: { directory: '/repo', branch: 'main' }, mark: { icon: 'check', tone: 'success', text: 'Passed' } })).toMatchObject({ status: 200 });
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: null })).toMatchObject({ status: 200 });

    const events = marksEvents();
    expect(events).toEqual([
      { type: 'openchamber:guest-marks-changed', properties: { guestId: 'desk', target: { sessionId: 'session_1' } } },
      { type: 'openchamber:guest-marks-changed', properties: { guestId: 'desk', target: { directory: '/repo', branch: 'main' } } },
      { type: 'openchamber:guest-marks-changed', properties: { guestId: 'desk', target: { sessionId: 'session_1' } } },
    ]);
    // Every emitted payload parses under the consumer's copy of the schema.
    for (const event of events) {
      expect(uiGuestMarksChangedPropertiesSchema.safeParse(event.properties).success).toBe(true);
    }
    // The scoped payload carries no mark content and no token material.
    const wire = JSON.stringify(events);
    expect(wire).not.toContain('Waiting');
    expect(wire).not.toContain('Passed');
    expect(wire).not.toContain(bearer);
    // The catalog-wide announcement is never the answer to a mark change.
    expect(broadcast.mock.calls.map(([event]) => event.type)).not.toContain('openchamber:guests-changed');
  });

  test('unchanged, rejected and failed writes announce nothing', async () => {
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: { icon: 'alert', tone: 'warning', text: 'Waiting' } })).toMatchObject({ status: 200 });
    expect(marksEvents()).toHaveLength(1);

    // Rewriting the same mark is an accepted no-op: the write commits nothing.
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: { icon: 'alert', tone: 'warning', text: 'Waiting' } })).toMatchObject({ status: 200 });
    expect(marksEvents()).toHaveLength(1);

    // Removing a mark that is not there is an accepted no-op as well.
    expect(await post('marks.set', { target: { sessionId: 'other' }, mark: null })).toMatchObject({ status: 200 });
    expect(marksEvents()).toHaveLength(1);

    // A guest without the marks capability is refused before any write.
    guest.capabilityGrants = ['service'];
    expect(await post('marks.set', { target: { sessionId: 'session_2' }, mark: { icon: 'alert', tone: 'warning', text: 'Nope' } })).toMatchObject({ status: 403 });
    guest.capabilityGrants = ['service', 'marks'];

    // A paused extension is refused before any write.
    guest.enabled = false;
    expect(await post('marks.set', { target: { sessionId: 'session_2' }, mark: { icon: 'alert', tone: 'warning', text: 'Nope' } })).toMatchObject({ status: 403 });
    guest.enabled = true;

    // A malformed call never reaches the store.
    const malformed = await fetch(`${await hostCallbackUrl()}${SERVICE_HOST_PATH}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ method: 'marks.set', input: { target: {}, mark: null } }),
    });
    expect(malformed.status).toBe(400);

    // The ended service's writes fail outright.
    await stopAllGuestServices();
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: null }, 'stale-token')).toMatchObject({ status: 401 });

    expect(marksEvents()).toHaveLength(1);
  });

  test('server and UI consumer schemas accept and reject the same payloads', () => {
    const accepted = [
      { guestId: 'desk', target: { sessionId: 'ses_1' } },
      { guestId: 'desk', target: { directory: '/repo' } },
      { guestId: 'desk', target: { directory: '/repo', branch: 'main' } },
    ];
    const rejected = [
      {},
      { guestId: 'desk' },
      { guestId: '', target: { sessionId: 'ses_1' } },
      { guestId: 'desk', target: {} },
      { guestId: 'desk', target: { sessionId: '' } },
      { guestId: 'desk', target: { directory: '' } },
      { guestId: 'desk', target: { directory: '/repo', branch: '' } },
      { guestId: 'desk', target: { sessionId: 'ses_1', directory: '/repo' } },
      { guestId: 'desk', target: { sessionId: 'ses_1' }, extra: true },
    ];
    for (const payload of accepted) {
      expect(guestMarksChangedPropertiesSchema.safeParse(payload).success).toBe(true);
      expect(uiGuestMarksChangedPropertiesSchema.safeParse(payload).success).toBe(true);
    }
    for (const payload of rejected) {
      expect(guestMarksChangedPropertiesSchema.safeParse(payload).success).toBe(false);
      expect(uiGuestMarksChangedPropertiesSchema.safeParse(payload).success).toBe(false);
    }
  });
});
