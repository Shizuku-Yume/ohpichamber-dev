import express from 'express';
import { z } from 'zod';
import type { Application, Response } from '../shared/http-contracts.js';
import type { RoutingRuntime } from './runtime.js';

const routeErrorSchema = z.object({
  status: z.number().int().optional(),
  message: z.string().optional(),
});

const configBodySchema = z.object({ config: z.json().optional() }).catch({});
const tokenBodySchema = z.object({ token: z.json().optional() }).catch({});
const sourceBodySchema = z.object({ source: z.json().optional() }).catch({});
const keyBodySchema = z.object({ key: z.json().optional() }).catch({});
const customEndpointFieldsSchema = z.object({
  url: z.json().optional(),
  model: z.json().optional(),
  key: z.json().optional(),
});
const customEndpointBodySchema = customEndpointFieldsSchema.catch({});
const testBodySchema = z.object({
  custom: customEndpointFieldsSchema.nullable().optional(),
}).catch({});

const sendError = (res: Response, cause: unknown) => {
  const parsed = routeErrorSchema.safeParse(cause);
  const status = parsed.success && parsed.data.status !== undefined ? parsed.data.status : 500;
  const message = parsed.success && parsed.data.message !== undefined ? parsed.data.message : 'Routing request failed';
  res.status(status).json({ error: message });
};


export function registerRoutingRoutes(app: Application, runtime: RoutingRuntime) {
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
      const body = configBodySchema.parse(req.body);
      res.json(await runtime.updateConfig(body.config));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing/token', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const body = tokenBodySchema.parse(req.body);
      res.json(await runtime.setToken(body.token));
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
      const body = sourceBodySchema.parse(req.body);
      res.json(await runtime.setClassifierSource(body.source));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing/classifier/gemini', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const body = keyBodySchema.parse(req.body);
      res.json(await runtime.setGeminiKey(body.key));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/routing/classifier/gemini', async (_req, res) => {
    try {
      res.json(await runtime.clearGeminiKey());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/routing/classifier/custom', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const body = customEndpointBodySchema.parse(req.body);
      res.json(await runtime.setCustomEndpoint({ url: body.url, model: body.model, key: body.key }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/routing/classifier/test', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const body = testBodySchema.parse(req.body);
      const workspaceId = req.query.workspaceId;
      const custom = body.custom;
      res.json(await runtime.testClassifier(
        custom === undefined || custom === null
          ? undefined
          : { url: custom.url, model: custom.model, key: custom.key },
        workspaceId,
      ));
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
