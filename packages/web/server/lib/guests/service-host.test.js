import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SERVICE_HOST_PATH } from 'ohpichamber-sdk';
import { ApprovalReplySchema, QuestionReplySchema } from '@openchamber/agent-contract';

import { guestAuthPersistPath, patchGuestAuth } from './auth-store.js';
import { setGuestConfigurationNote, toPublicGuest } from './catalog.js';
import { hostCallbackUrl, stopHostCallbackListener } from './host-callback.js';
import { createGuestInstructions } from './instructions.js';
import { guestMarks } from './marks.js';
import { setCapabilityGrants, writeExtensionStore } from './persist.js';
import { beginGuestServiceHost, guestIdOfServiceToken, proxyGuestServiceRequest, stopAllGuestServices } from './service.js';
import { registerGuestServiceHost } from './service-host.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';

const identity = { version: '1', epoch: 'epoch_1', workerGeneration: 'worker_1' };
const approval = { ...identity, approvalId: 'permission_1', sessionId: 'session_1', status: 'pending' };
const question = {
  ...identity, questionId: 'form_1', sessionId: 'session_1', status: 'pending',
  schema: { type: 'omp.ask', form: true, questions: [
    { id: 'name', options: [] },
    { id: 'tags', options: [{ label: 'a' }, { label: 'b' }], multi: true },
  ] },
};

describe('registered Guest service Host composition', () => {
  let directory;
  let host;
  let bearer;
  let guest;
  let snapshot;
  let sessions;
  let control;
  let request;
  let broadcast;
  let logs;
  let post;

  beforeEach(async () => {
    beginGuestServiceHost();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'guest-host-'));
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
      service: { entry: 'service.mjs', runtime: 'host' }, sessionControl: { content: true, answers: true },
      instructions: true, marks: true,
      capabilityGrants: ['service', 'sessionControl', 'sessionAnswers', 'transcript', 'instructions', 'marks'],
    };
    snapshot = { session: { sessionId: 'session_1', activeRunId: 'run_1' }, approvals: [approval], questions: [question] };
    sessions = { open: vi.fn(async () => snapshot), control: vi.fn(async () => ({})) };
    control = {
      execute: vi.fn(async action => action === 'session.messages'
        ? { messages: [{ text: 'hello' }] }
        : { sessionId: 'session_1', sessionStatus: { type: 'busy' } }),
      resolveSessionDirectory: vi.fn(async () => '/repo'),
    };
    request = vi.fn(async (pathname, init) => {
      const body = JSON.parse(init.body);
      if (pathname.includes('/approvals/')) ApprovalReplySchema.parse(body);
      else QuestionReplySchema.parse(body);
      return new Response('{}', { status: 200 });
    });
    broadcast = vi.fn();
    logs = ['log', 'warn', 'error', 'info', 'debug'].map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    host = registerGuestServiceHost({ dataDir: directory, listGuests: vi.fn(async () => [guest]), control, sessions, request, broadcast });
    post = async (method, input, token = bearer, headers = {}) => {
      const response = await fetch(`${await hostCallbackUrl()}${SERVICE_HOST_PATH}`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
        body: JSON.stringify({ method, input }),
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      return { status: response.status, body: await response.json() };
    };
  });

  afterEach(async () => {
    host?.dispose();
    await stopAllGuestServices();
    await stopHostCallbackListener();
    guestMarks.clearGuest('desk');
    setGuestConfigurationNote('desk', null);
    vi.restoreAllMocks();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  test('all callbacks cross HTTP with the bearer of a real Host-spawned service', async () => {
    expect(guestIdOfServiceToken(bearer)).toBe('desk');
    expect(await post('sessions.start', { prompt: 'start', directory: '/repo' })).toMatchObject({ status: 200, body: { result: { sessionId: 'session_1', directory: '/repo' } } });
    expect(control.execute).toHaveBeenCalledWith('session.create', { prompt: 'start', directory: '/repo' });
    expect(await post('sessions.status', { sessionId: 'session_1' })).toMatchObject({ body: { result: { status: 'busy' } } });
    expect(control.execute).toHaveBeenCalledWith('session.status', { sessionId: 'session_1' }, '/repo');
    expect(await post('sessions.lastReply', { sessionId: 'session_1' })).toMatchObject({ body: { result: { reply: 'hello' } } });
    expect(control.execute).toHaveBeenCalledWith('session.messages', { sessionId: 'session_1', role: 'assistant', limit: 1 }, '/repo');
    expect(await post('sessions.retry', { sessionId: 'session_1' })).toMatchObject({ status: 200 });
    expect(control.execute).toHaveBeenCalledWith('session.send', { sessionId: 'session_1', prompt: 'hello' });
    expect(await post('sessions.send', { sessionId: 'session_1', prompt: 'next' })).toMatchObject({ status: 200 });
    expect(request).toHaveBeenLastCalledWith('/api/agent/v1/sessions/session_1/questions/form_1/respond', expect.objectContaining({ body: JSON.stringify({ ...identity, action: 'cancel' }) }));
    expect(control.execute).toHaveBeenCalledWith('session.send', { sessionId: 'session_1', prompt: 'next' });
    expect(await post('sessions.stop', { sessionId: 'session_1' })).toMatchObject({ body: { result: { stopped: true } } });
    expect(sessions.control).toHaveBeenCalledWith('session_1', { type: 'abort', runId: 'run_1' });
    for (const [decision, canonical] of [['allow', 'approve'], ['deny', 'reject']]) {
      expect(await post('sessions.answerPermission', { sessionId: 'session_1', requestId: 'permission_1', decision })).toMatchObject({ status: 200 });
      expect(request).toHaveBeenLastCalledWith('/api/agent/v1/sessions/session_1/approvals/permission_1/respond', expect.objectContaining({ body: JSON.stringify({ ...identity, decision: canonical }) }));
    }
    expect(await post('sessions.answerForm', { sessionId: 'session_1', formId: 'form_1', values: { name: 'Ada', tags: ['a'] } })).toMatchObject({ status: 200 });
    expect(JSON.parse(request.mock.lastCall[1].body)).toEqual({ ...identity, action: 'answer', response: { results: [
      { id: 'name', selectedOptions: [], customInput: 'Ada' }, { id: 'tags', selectedOptions: ['a'] },
    ] } });
    expect(await post('sessions.answerForm', { sessionId: 'session_1', formId: 'form_1', values: null })).toMatchObject({ status: 200 });
    expect(JSON.parse(request.mock.lastCall[1].body)).toEqual({ ...identity, action: 'cancel' });
    expect(await post('instructions.set', { directory: '/repo', text: 'Read this' })).toMatchObject({ status: 200 });
    expect(await createGuestInstructions({ dataDir: directory }).forDirectory('/repo', new Set(['desk']))).toEqual([{ guestId: 'desk', text: 'Read this' }]);
    expect(await post('panels.emit', { topic: 'refresh', data: { count: 1 } })).toMatchObject({ status: 200 });
    expect(broadcast).toHaveBeenCalledWith({ type: 'openchamber:guest-service-event', properties: { guestId: 'desk', topic: 'refresh', data: { count: 1 } } });
    expect(await post('settings.read', {})).toMatchObject({ body: { result: { settings: {} } } });
    await patchGuestAuth('desk', { settings: { password: 'private-setting-value' } }, guestAuthPersistPath(directory));
    expect(await post('settings.read', {})).toMatchObject({ body: { result: { settings: { password: 'private-setting-value' } } } });
    expect(await post('status.set', { needsConfiguration: 'Connect account' })).toMatchObject({ status: 200 });
    expect(toPublicGuest(guest).needsConfiguration).toBe('Connect account');
    expect(await post('status.set', { needsConfiguration: null })).toMatchObject({ status: 200 });
    expect(toPublicGuest(guest).needsConfiguration).toBeUndefined();
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: { icon: 'alert', tone: 'warning', text: 'Waiting' } })).toMatchObject({ status: 200 });
    expect(guestMarks.list('desk')).toHaveLength(1);
    expect(await post('marks.set', { target: { sessionId: 'session_1' }, mark: null })).toMatchObject({ status: 200 });
    expect(guestMarks.list('desk')).toEqual([]);
    expect(broadcast).toHaveBeenCalledWith({ type: 'openchamber:guests-changed', properties: {} });
    expect(JSON.stringify(broadcast.mock.calls)).not.toContain('private-setting-value');
    expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain(bearer);
    expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain('private-setting-value');
  });

  test('empty, stale, refused and failing operations stay explicit and never log private values', async () => {
    expect(await post('settings.read', {}, 'wrong-bearer')).toMatchObject({ status: 401 });
    expect(await post('settings.read', {}, bearer, { origin: 'https://browser.test' })).toMatchObject({ status: 403 });
    guest.enabled = false;
    expect(await post('settings.read', {})).toMatchObject({ status: 403 });
    guest.enabled = true;
    snapshot.session.activeRunId = null;
    snapshot.approvals = [];
    snapshot.questions = [];
    expect(await post('sessions.stop', { sessionId: 'session_1' })).toMatchObject({ body: { result: { stopped: false } } });
    expect(sessions.control).not.toHaveBeenCalled();
    expect(await post('sessions.answerPermission', { sessionId: 'session_1', requestId: 'missing', decision: 'allow' })).toMatchObject({ status: 404 });
    expect(await post('sessions.answerForm', { sessionId: 'session_1', formId: 'missing', values: {} })).toMatchObject({ status: 404 });
    expect(await post('sessions.send', { sessionId: 'session_1', prompt: 'no forms' })).toMatchObject({ status: 200 });
    expect(request).not.toHaveBeenCalled();
    control.execute.mockResolvedValueOnce({ messages: [] });
    expect(await post('sessions.retry', { sessionId: 'session_1' })).toMatchObject({ status: 409 });
    sessions.open.mockRejectedValueOnce(new OpenChamberControlError('Session not found', 404));
    expect(await post('sessions.stop', { sessionId: 'missing' })).toMatchObject({ status: 404 });
    snapshot.approvals = [approval];
    request.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    expect(await post('sessions.answerPermission', { sessionId: 'session_1', requestId: 'permission_1', decision: 'allow' })).toMatchObject({ status: 409 });
    snapshot.questions = [question];
    request.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const sendsBefore = control.execute.mock.calls.length;
    expect(await post('sessions.send', { sessionId: 'session_1', prompt: 'must not send' })).toMatchObject({ status: 409 });
    expect(control.execute).toHaveBeenCalledTimes(sendsBefore);
    expect(await post('sessions.answerForm', { sessionId: 'session_1', formId: 'form_1', values: { unknown: true } })).toMatchObject({ status: 400 });
    snapshot.questions = [{ ...question, version: '3', schema: { type: 'omp.ask', form: true, questions: [] } }];
    expect(await post('sessions.answerForm', { sessionId: 'session_1', formId: 'form_1', values: {} })).toMatchObject({ status: 200 });
    expect(JSON.parse(request.mock.lastCall[1].body)).toEqual({ ...identity, version: '3', action: 'answer', response: { results: [] } });
    snapshot.questions = [{ ...question, schema: undefined }];
    expect(await post('sessions.answerForm', { sessionId: 'session_1', formId: 'form_1', values: { answer: true } })).toMatchObject({ status: 200 });
    expect(JSON.parse(request.mock.lastCall[1].body)).toEqual({ ...identity, action: 'answer', response: { answer: true } });
    sessions.open.mockRejectedValueOnce(new Error(`private-setting-value ${bearer}`));
    const failed = await post('sessions.stop', { sessionId: 'session_1' });
    expect(failed).toMatchObject({ status: 500 });
    expect(JSON.stringify(failed)).not.toContain('private-setting-value');
    expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain('private-setting-value');
    expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain(bearer);
    await stopAllGuestServices();
    expect(await post('settings.read', {})).toMatchObject({ status: 401 });
    host.dispose();
    expect(await post('settings.read', {})).toMatchObject({ status: 404 });
  });
});
