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
<<<<<<< HEAD

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
=======

import { isRecord } from '../shared/guards.js';

const parseJsonBody = express.json({ limit: '1mb' });

const asNonEmptyString = (value) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);
const responseStyleInstructionSchema = z.string().nullable().optional();
>>>>>>> bc50ba56a

export const registerSessionKnowledgeRoutes = (app, dependencies) => {
  const { sessionKnowledgeRuntime } = dependencies;

<<<<<<< HEAD
=======
  /**
   * Writes the session's project knowledge into its instruction entries; the
   * client awaits it before the prompt goes out. Answers 200 either way: a
   * message without its background is far better than no message at all.
   */
  app.post('/api/session-knowledge/sync', parseJsonBody, async (req, res) => {
    const body = isRecord(req.body) ? req.body : {};
    const sessionId = asNonEmptyString(body.sessionId);
    const directory = asNonEmptyString(body.directory);
    if (!sessionId || !directory) {
      return res.status(400).json({ error: 'sessionId and directory are required' });
    }
    const parsedResponseStyleInstruction = responseStyleInstructionSchema.safeParse(body.responseStyleInstruction);
    const responseStyleInstruction = parsedResponseStyleInstruction.success ? parsedResponseStyleInstruction.data : undefined;
    return res.json({ synced: await sessionKnowledgeRuntime.sync(sessionId, directory, responseStyleInstruction) });
  });

>>>>>>> bc50ba56a
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
