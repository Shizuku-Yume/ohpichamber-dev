<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
/**
 * The UI's view of project knowledge: pinned note and plan names for the panel,
 * and the pin switches. Prompt delivery belongs to the Host, so there is no
 * read-and-report round trip here.
 *
 * The body parser is attached per route: there is no global one, because the
 * generic OpenCode proxy needs an unread request stream.
 */

||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
/**
 * Project knowledge for the UI: writing it into a session before a send, what
 * the session carries for display, and which notes and plans it pins.
 *
 * The body parser is attached per route: there is no global one, because the
 * generic OpenCode proxy needs an unread request stream.
 */

=======
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
import express from 'express';
import { z } from 'zod';

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
import { isRecord } from '../shared/guards.js';

=======
import { isBoolean, isRecord } from '../shared/guards.js';
import type { Application } from '../shared/http-contracts.js';
import type { createSessionKnowledgeRuntime } from './runtime.js';
import { hasMessage, isNonEmptyString } from './guards.js';

>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
const parseJsonBody = express.json({ limit: '1mb' });

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
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
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
const asNonEmptyString = (value) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);
const responseStyleInstructionSchema = z.string().nullable().optional();
=======
const responseStyleInstructionSchema = z.string().nullable().optional();
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts

export interface SessionKnowledgeRouteDependencies {
  sessionKnowledgeRuntime: Pick<ReturnType<typeof createSessionKnowledgeRuntime>, 'sync' | 'collectSummaryForSession' | 'collectSummary' | 'setPin'>;
}

export const registerSessionKnowledgeRoutes = (app: Application, dependencies: SessionKnowledgeRouteDependencies) => {
  const { sessionKnowledgeRuntime } = dependencies;

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
  /** Counts and names for the work status panel; assembles no text. */
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
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

  /** Counts and names for the work status panel; assembles no text. */
=======
  app.post('/api/session-knowledge/sync', parseJsonBody, async (req, res) => {
    const body = isRecord(req.body) ? req.body : {};
    const sessionId = isNonEmptyString(body.sessionId) ? body.sessionId.trim() : '';
    const directory = isNonEmptyString(body.directory) ? body.directory.trim() : '';
    if (!sessionId || !directory) {
      return res.status(400).json({ error: 'sessionId and directory are required' });
    }
    const parsedResponseStyleInstruction = responseStyleInstructionSchema.safeParse(body.responseStyleInstruction);
    const responseStyleInstruction = parsedResponseStyleInstruction.success ? parsedResponseStyleInstruction.data : undefined;
    return res.json({ synced: await sessionKnowledgeRuntime.sync(sessionId, directory, responseStyleInstruction) });
  });

>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
  app.get('/api/session-knowledge/summary', async (req, res) => {
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
    const query = SummaryQuerySchema.safeParse(req.query);
    if (!query.success || !query.data.directory) {
      return res.json({ notes: [], plans: [] });
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
    const directory = asNonEmptyString(req.query.directory);
    if (!directory) {
      return res.json({ notes: [], plans: [], memory: { global: 0, project: 0 } });
=======
    const directory = isNonEmptyString(req.query.directory) ? req.query.directory.trim() : '';
    if (!directory) {
      return res.json({ notes: [], plans: [], memory: { global: 0, project: 0 } });
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
    }
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
    const sessionId = asNonEmptyString(req.query.sessionId);
=======
    const sessionId = isNonEmptyString(req.query.sessionId) ? req.query.sessionId.trim() : '';
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
    try {
      return res.json(query.data.sessionId
        ? await sessionKnowledgeRuntime.collectSummaryForSession(query.data.sessionId, query.data.directory)
        : await sessionKnowledgeRuntime.collectSummary(query.data.directory));
    } catch {
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
      // A panel that cannot read this shows nothing rather than an error.
      return res.json({ notes: [], plans: [] });
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
      // A panel that cannot read this shows nothing rather than an error.
      return res.json({ notes: [], plans: [], memory: { global: 0, project: 0 } });
=======
      return res.json({ notes: [], plans: [], memory: { global: 0, project: 0 } });
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
    }
  });

  app.post('/api/session-knowledge/pin', parseJsonBody, async (req, res) => {
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/routes.js
    const request = PinRequestSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Body must name a session, directory, pin kind and pinned state' });
    const { sessionId, directory, id, kind, pinned } = request.data;
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/routes.js
    const body = req.body;
    if (!isRecord(body)) return res.status(400).json({ error: 'Body must be an object' });
    const sessionId = asNonEmptyString(body.sessionId);
    const directory = asNonEmptyString(body.directory);
    const id = asNonEmptyString(body.id);
    const kind = body.kind === 'note' || body.kind === 'plan' ? body.kind : '';
    if (!sessionId || !directory || !id || !kind || typeof body.pinned !== 'boolean') {
      return res.status(400).json({ error: 'sessionId, directory, kind, id and pinned are required' });
    }
=======
    const body = req.body;
    if (!isRecord(body)) return res.status(400).json({ error: 'Body must be an object' });
    const sessionId = isNonEmptyString(body.sessionId) ? body.sessionId.trim() : '';
    const directory = isNonEmptyString(body.directory) ? body.directory.trim() : '';
    const id = isNonEmptyString(body.id) ? body.id.trim() : '';
    const kind = body.kind === 'note' || body.kind === 'plan' ? body.kind : '';
    if (!sessionId || !directory || !id || !kind || !isBoolean(body.pinned)) {
      return res.status(400).json({ error: 'sessionId, directory, kind, id and pinned are required' });
    }
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/routes.ts
    try {
      return res.json({ pins: await sessionKnowledgeRuntime.setPin(sessionId, directory, kind, id, pinned) });
    } catch (error) {
      return res.status(500).json({ error: (hasMessage(error) ? error.message : undefined) ?? 'Unable to update pin' });
    }
  });
};
