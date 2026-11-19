/**
 * `/api/routing` — configuration, the Jev key, the classification provider
 * pick (`/api/routing/classifier`) and the custom endpoint
 * (`/api/routing/classifier/custom`). Normal authenticated
 * OpenChamber routes: do not add them to browser URL-token allowlists.
 *
 */
import express from 'express';

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
