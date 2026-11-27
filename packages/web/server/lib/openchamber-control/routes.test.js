import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { BrowserControlError } from '../browser-control/broker.js';
import { OpenChamberControlError } from './error.js';
import { registerOpenChamberControlRoutes } from './routes.js';

const createApp = (execute, answerPage = vi.fn()) => {
  const app = express();
  registerOpenChamberControlRoutes(app, { controlService: { execute, answerPage } });
  return app;
};

describe('OhPiChamber control route', () => {
  it('is a thin adapter over the control service', async () => {
    const execute = vi.fn(async () => ({ projects: [] }));
    const response = await request(createApp(execute))
      .post('/api/openchamber/control')
      .send({ action: 'projects.list', input: {}, contextDirectory: '/repo' })
      .expect(200);
    expect(response.body).toEqual({ projects: [] });
    expect(execute).toHaveBeenCalledWith('projects.list', {}, '/repo', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('preserves service status and partial-result details', async () => {
    const execute = vi.fn(async () => {
      throw new OpenChamberControlError('dispatch failed', 500, {
        partial: true,
        partialAction: 'fork-created',
        sessionId: 'ses_fork',
        directory: '/repo',
      });
    });
    const response = await request(createApp(execute))
      .post('/api/openchamber/control')
      .send({ action: 'session.fork', input: {} })
      .expect(500);
    expect(response.body).toEqual({
      error: 'dispatch failed',
      partial: true,
      partialAction: 'fork-created',
      sessionId: 'ses_fork',
      directory: '/repo',
    });
  });

  it('keeps a valid action when a sibling body field is mistyped', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    // input as a string is malformed, but the action must survive: the service
    // still receives 'projects.list' instead of the wiped-out empty string.
    const response = await request(createApp(execute))
      .post('/api/openchamber/control')
      .send({ action: 'projects.list', input: 'not-an-object' })
      .expect(200);
    expect(response.body).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith('projects.list', {}, undefined, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('forwards a valid input object when the action is mistyped', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const input = { projectId: 'prj_1' };
    await request(createApp(execute))
      .post('/api/openchamber/control')
      .send({ action: 42, input })
      .expect(200);
    expect(execute).toHaveBeenCalledWith('', input, undefined, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('passes the page answer body through with every field intact', async () => {
    const answerPage = vi.fn(() => ({ answered: true }));
    const body = { sessionId: 'ses_1', callId: 'call_1', notDrawn: ['a layout crashed'], extra: 'kept' };
    await request(createApp(vi.fn(), answerPage))
      .post('/api/openchamber/render/answer')
      .send(body)
      .expect(200);
    expect(answerPage).toHaveBeenCalledWith(body);
  });

  it('keeps the status of a browser refusal instead of reporting 500', async () => {
    const execute = vi.fn(async () => {
      throw new BrowserControlError('The user is interacting with this page in the panel right now.', 409);
    });
    const response = await request(createApp(execute))
      .post('/api/openchamber/control')
      .send({ action: 'browser.click', input: {} })
      .expect(409);
    expect(response.body).toEqual({ error: 'The user is interacting with this page in the panel right now.' });
  });
});

describe('page answer route', () => {
  it('hands the answer to the waiting call', async () => {
    const answerPage = vi.fn(() => ({ answered: true }));
    const body = { sessionId: 'ses_1', callId: 'call_1', summary: 'Layout B', data: { layout: 'b' } };
    const response = await request(createApp(vi.fn(), answerPage))
      .post('/api/openchamber/render/answer')
      .send(body)
      .expect(200);
    expect(response.body).toEqual({ answered: true });
    expect(answerPage).toHaveBeenCalledWith(body);
  });

  it('reports a page that no longer waits as an error, never as success', async () => {
    const answerPage = vi.fn(() => {
      throw new OpenChamberControlError('This page is no longer waiting for an answer', 404);
    });
    const response = await request(createApp(vi.fn(), answerPage))
      .post('/api/openchamber/render/answer')
      .send({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })
      .expect(404);
    expect(response.body).toEqual({ error: 'This page is no longer waiting for an answer' });
  });
});

describe('later pages route', () => {
  it('serves the later pages snapshot once loaded', async () => {
    const app = express();
    const laterPages = { load: vi.fn(async () => undefined), snapshot: vi.fn(() => ({ revision: 2, pages: [{ sessionID: 'ses_1', callID: 'call_1', status: 'open' }] })) };
    registerOpenChamberControlRoutes(app, { controlService: { execute: vi.fn(), answerPage: vi.fn() }, laterPages });
    const response = await request(app).get('/api/openchamber/render/later').expect(200);
    expect(response.body).toEqual({ revision: 2, pages: [{ sessionID: 'ses_1', callID: 'call_1', status: 'open' }] });
    expect(laterPages.load).toHaveBeenCalledBefore(laterPages.snapshot);
  });

  it('answers 503 where the server keeps no later pages', async () => {
    const app = express();
    registerOpenChamberControlRoutes(app, { controlService: { execute: vi.fn(), answerPage: vi.fn() } });
    await request(app).get('/api/openchamber/render/later').expect(503);
  });
});
