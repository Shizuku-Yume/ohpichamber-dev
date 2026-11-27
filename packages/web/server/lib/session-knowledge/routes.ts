import express from 'express';
import { z } from 'zod';
import { controlErrorFields } from '../openchamber-control/error.js';
import type { Application } from '../shared/http-contracts.js';
import type { KnowledgePinKind, SessionKnowledgeRuntime } from './runtime.js';
import type { KnowledgeSummary, SessionPins } from './contracts.js';

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

export interface SessionKnowledgeRouteRuntime {
  collectSummary: (directory: string) => Promise<KnowledgeSummary>;
  collectSummaryForSession: (sessionId: string, directory: string) => Promise<KnowledgeSummary>;
  setPin: (sessionId: string, directory: string, kind: KnowledgePinKind, id: string, pinned: boolean) => Promise<SessionPins>;
}

export interface SessionKnowledgeRouteDependencies {
  sessionKnowledgeRuntime: SessionKnowledgeRouteRuntime | SessionKnowledgeRuntime;
}

export const registerSessionKnowledgeRoutes = (
  app: Application,
  dependencies: SessionKnowledgeRouteDependencies,
): void => {
  const { sessionKnowledgeRuntime } = dependencies;

  app.get('/api/session-knowledge/summary', async (req, res) => {
    const query = SummaryQuerySchema.safeParse(req.query);
    if (!query.success || !query.data.directory) {
      return res.json({ notes: [], plans: [] });
    }
    try {
      return res.json(query.data.sessionId
        ? await sessionKnowledgeRuntime.collectSummaryForSession(query.data.sessionId, query.data.directory)
        : await sessionKnowledgeRuntime.collectSummary(query.data.directory));
    } catch {
      return res.json({ notes: [], plans: [] });
    }
  });

  app.post('/api/session-knowledge/pin', parseJsonBody, async (req, res) => {
    const request = PinRequestSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Body must name a session, directory, pin kind and pinned state' });
    const { sessionId, directory, id, kind, pinned } = request.data;
    try {
      return res.json({ pins: await sessionKnowledgeRuntime.setPin(sessionId, directory, kind, id, pinned) });
    } catch (error) {
      return res.status(500).json({ error: controlErrorFields(error)?.message ?? 'Unable to update pin' });
    }
  });
};
