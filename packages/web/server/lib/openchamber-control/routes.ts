import express from 'express';
import { asControlError } from './error.js';
import type { JsonValue } from '../shared/json-values.js';
import { parseJsonObject } from '../shared/json-values.js';
import { isString } from '../shared/object-guards.js';
import type { Application } from '../shared/http-contracts.js';
import type { ControlInput, ControlOptions } from './contracts.js';
import type { createLaterPages } from './later-pages.js';
import type { PageAnswerInput } from './render-page.js';
import type { SecretAnswerInput } from './secret-request.js';

export interface ControlErrorPayload {
  error: string;
  partial?: true;
  partialAction?: JsonValue;
  sessionId?: JsonValue;
  directory?: JsonValue;
}

export interface ControlRouteService {
  execute: (
    action: string,
    input: ControlInput,
    contextDirectory?: ControlInput['directory'],
    options?: ControlOptions,
  ) => Promise<JsonValue | object | undefined>;
  answerPage: (input: PageAnswerInput) => Promise<{ answered: boolean }>;
  secretFields: (input: Pick<SecretAnswerInput, 'sessionId' | 'callId'>) => {
    fields: string[];
    reused: string[];
  };
  answerSecret: (input: SecretAnswerInput) => Promise<{ status: string }>;
}
export interface OpenChamberControlRoutesDependencies {
  controlService: ControlRouteService;
  laterPages?: Pick<ReturnType<typeof createLaterPages>, 'load' | 'snapshot'> | null;
}
export const registerOpenChamberControlRoutes = (
  app: Application,
  { controlService, laterPages = null }: OpenChamberControlRoutesDependencies,
): void => {
  app.post('/api/openchamber/control', express.json({ limit: '1mb' }), async (req, res) => {
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', abortOnDisconnect);
    res.once('close', abortOnDisconnect);
    try {
      const body = parseJsonObject(req.body) ?? {};
      const action = isString(body.action) ? body.action : '';
      const input: ControlInput = parseJsonObject(body.input) ?? {};
      const data = await controlService.execute(action, input, body.contextDirectory, { signal: controller.signal });
      return res.json(data);
    } catch (error) {
      const controlError = asControlError(error, 'OhPiChamber control action failed');
      const payload: ControlErrorPayload = { error: controlError.message };
      if (controlError.partial === true) {
        payload.partial = true;
        if (controlError.partialAction !== undefined) payload.partialAction = controlError.partialAction;
        if (controlError.sessionId !== undefined) payload.sessionId = controlError.sessionId;
        if (controlError.directory !== undefined) payload.directory = controlError.directory;
      }
      return res.status(Number(controlError.statusCode) || 500).json(payload);
    } finally {
      req.off('aborted', abortOnDisconnect);
      res.off('close', abortOnDisconnect);
    }
  });

  app.post('/api/openchamber/render/answer', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      return res.json(await controlService.answerPage(parseJsonObject(req.body ?? {}) ?? {}));
    } catch (error) {
      const controlError = asControlError(error, 'Could not deliver the answer');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.get('/api/openchamber/render/later', async (_req, res) => {
    if (!laterPages) return res.status(503).json({ error: 'This server cannot keep pages open for a later answer' });
    try {
      await laterPages.load();
      return res.json(laterPages.snapshot());
    } catch (error) {
      const controlError = asControlError(error, 'Could not read the pages');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.get('/api/openchamber/secret/fields', (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      return res.json(controlService.secretFields(parseJsonObject(req.query ?? {}) ?? {}));
    } catch (error) {
      const controlError = asControlError(error, 'Could not read the secret card');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  const parseSecretAnswer = express.json({ limit: '512kb' });
  app.post('/api/openchamber/secret/answer', (req, res, next) => {
    parseSecretAnswer(req, res, (error) => {
      if (error) return res.status(400).json({ error: 'The secret answer must be valid JSON within 512kb' });
      return next();
    });
  }, async (req, res) => {
    try {
      return res.json(await controlService.answerSecret(parseJsonObject(req.body ?? {}) ?? {}));
    } catch (error) {
      const controlError = asControlError(error, 'Could not save the secret');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });
};
