/**
 * `/api/routing` — configuration, the Jev key, the classification provider
 * pick (`/api/routing/classifier`) and the custom endpoint
 * (`/api/routing/classifier/custom`). Normal authenticated
 * OpenChamber routes: do not add them to browser URL-token allowlists.
 *
<<<<<<< HEAD
 */
import express from 'express';
=======
 * The send-path rewrite, registered ahead of the generic OpenCode proxy. In
 * OpenCode 2.x a prompt body carries no model: the client switches the session
 * first (`POST /session/:id/model`) and sends afterwards. So the rewrite is in
 * two halves:
 *
 * - `POST /session/:id/model` with `openchamber/auto` never reaches OpenCode,
 *   which has no such provider. It marks the session as routed and answers as
 *   a switch would.
 * - `POST /session/:id/{prompt,command}` in a routed session asks Jev on the
 *   request text and switches the session onto the chosen model and agent
 *   before the prompt is forwarded. A form reply resumes a turn the same way,
 *   so `POST /session/:id/form/:formId/reply` is routed on the answer, and a
 *   failure leaves the form pending because the answer was never forwarded.
 *
 * Both parse the JSON body only for JSON requests, so a streamed or non-JSON
 * upload reaches the proxy untouched.
 */
import express from 'express';
import { isAutoModel } from './defaults.js';

const CREATE_PATH = '/api/session';
const MODEL_PATH = '/api/session/:sessionId/model';
const SEND_PATHS = [
  '/api/session/:sessionId/prompt',
  '/api/session/:sessionId/command',
  '/api/session/:sessionId/form/:formId/reply',
];
>>>>>>> bc50ba56a

const sendError = (res, error) => {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({ error: error?.message ?? 'Routing request failed' });
};

export function registerRoutingRoutes(app, runtime) {
  app.get('/api/routing', async (req, res) => {
    try {
      const state = await runtime.describe(req.query.workspaceId);
      res.json({ ...state, heldPermissions: runtime.heldPermissions() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing', express.json({ limit: '256kb' }), async (req, res) => {
    try {
      res.json(await runtime.updateConfig(req.body?.config));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing/token', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      res.json(await runtime.setToken(req.body?.token));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/routing/token', async (_req, res) => {
    try {
      res.json(await runtime.clearToken());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing/classifier', express.json({ limit: '4kb' }), async (req, res) => {
    try {
      res.json(await runtime.setClassifierSource(req.body?.source));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing/classifier/custom', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      res.json(await runtime.setCustomEndpoint({ url: req.body?.url, model: req.body?.model, key: req.body?.key }));
    } catch (error) {
      sendError(res, error);
    }
  });

  // `custom` present: test those endpoint fields as typed, before saving.
  app.post('/api/routing/classifier/test', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const custom = req.body?.custom;
      res.json(await runtime.testClassifier(custom === undefined || custom === null
        ? undefined
        : { url: custom.url, model: custom.model, key: custom.key }, req.query.workspaceId));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/routing/classifier/custom', async (_req, res) => {
    try {
      res.json(await runtime.clearCustomEndpoint());
    } catch (error) {
      sendError(res, error);
    }
  });
}

