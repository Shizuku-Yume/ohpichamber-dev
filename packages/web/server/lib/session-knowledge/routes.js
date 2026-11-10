/**
 * The UI's view of project knowledge: pinned note and plan names for the panel,
 * and the pin switches. Prompt delivery belongs to the Host, so there is no
 * read-and-report round trip here.
 *
 * The body parser is attached per route: there is no global one, because the
 * generic OpenCode proxy needs an unread request stream.
 */

import express from 'express';
import { z } from 'zod';

const parseJsonBody = express.json({ limit: '1mb' });

const NonEmptyStringSchema = z.string().trim().min(1);
const SummaryQuerySchema = z.object({
  directory: NonEmptyStringSchema.optional(),
  sessionId: NonEmptyStringSchema.optional(),
});
const PinRequestSchema = z.object({
  sessionId: NonEmptyStringSchema,
  directory: NonEmptyStringSchema,
  id: NonEmptyStringSchema,
  kind: z.enum(['note', 'plan']),
  pinned: z.boolean(),
});

export const registerSessionKnowledgeRoutes = (app, dependencies) => {
  const { sessionKnowledgeRuntime } = dependencies;

  /** Counts and names for the work status panel; assembles no text. */
  app.get('/api/session-knowledge/summary', async (req, res) => {
    const query = SummaryQuerySchema.safeParse(req.query);
    if (!query.success || !query.data.directory) {
      return res.json({ notes: [], plans: [], memory: { global: 0, project: 0 } });
    }
    try {
      return res.json(query.data.sessionId
        ? await sessionKnowledgeRuntime.collectSummaryForSession(query.data.sessionId, query.data.directory)
        : await sessionKnowledgeRuntime.collectSummary(query.data.directory));
    } catch {
      // A panel that cannot read this shows nothing rather than an error.
      return res.json({ notes: [], plans: [], memory: { global: 0, project: 0 } });
    }
  });

  app.post('/api/session-knowledge/pin', parseJsonBody, async (req, res) => {
    const request = PinRequestSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Body must name a session, directory, pin kind and pinned state' });
    const { sessionId, directory, id, kind, pinned } = request.data;
    try {
      return res.json({ pins: await sessionKnowledgeRuntime.setPin(sessionId, directory, kind, id, pinned) });
    } catch (error) {
      return res.status(500).json({ error: error?.message ?? 'Unable to update pin' });
    }
  });
};
