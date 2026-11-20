import express from 'express';
import { asControlError } from './error.js';

export const registerOpenChamberControlRoutes = (app, { controlService, laterPages = null }) => {
  app.post('/api/openchamber/control', express.json({ limit: '1mb' }), async (req, res) => {
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', abortOnDisconnect);
    res.once('close', abortOnDisconnect);
    try {
      const action = typeof req.body?.action === 'string' ? req.body.action : '';
      const requestInput = req.body?.input;
      const input = requestInput && typeof requestInput === 'object' && !Array.isArray(requestInput)
        ? requestInput
        : {};
      const data = await controlService.execute(action, input, req.body?.contextDirectory, { signal: controller.signal });
      return res.json(data);
    } catch (error) {
      const controlError = asControlError(error, 'OhPiChamber control action failed');
      return res.status(controlError.statusCode).json({
        error: controlError.message,
        ...(controlError.partial === true ? {
          partial: true,
          partialAction: controlError.partialAction,
          sessionId: controlError.sessionId,
          directory: controlError.directory,
        } : {}),
      });
    } finally {
      req.off('aborted', abortOnDisconnect);
      res.off('close', abortOnDisconnect);
    }
  });

  // The user answered a page an agent is waiting on (render.page with
  // awaitAnswer). The agent's call holds the matching request open.
  app.post('/api/openchamber/render/answer', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      return res.json(await controlService.answerPage(req.body ?? {}));
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

  // The user saved or declined a secret an agent asked for (secret.request).
  // The body carries the secret: it is never logged or echoed back.
  app.post('/api/openchamber/secret/answer', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      return res.json(await controlService.answerSecret(req.body ?? {}));
    } catch (error) {
      const controlError = asControlError(error, 'Could not save the secret');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });
};
