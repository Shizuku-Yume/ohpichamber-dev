<<<<<<< HEAD
/**
 * Project knowledge for the UI: what the session carries for display, and the
 * pin switches. Prompt delivery belongs to the Host, which attaches the user's
 * pins itself, so the client never assembles or reports prompt text.
 */
||||||| bc50ba56aa
/**
 * Project knowledge for a session, as decided by the server.
 *
 * The client neither assembles project knowledge nor tracks what the session was told.
 * Before a send it asks the server to write the knowledge into the session's
 * OpenCode instruction entries; OpenCode tells the agent what changed and keeps
 * it through compaction, revert and fork.
 * VS Code writes the response-style entry through the SDK because it connects
 * directly to OpenCode and has no OpenChamber knowledge route.
 *
 * Nothing here throws. A message must go out even when its background cannot
 * be written: sending without it costs the agent some context, failing the
 * send costs the user their message.
 */
=======
>>>>>>> upstream/main

import { runtimeFetch } from './runtime-fetch';
import { z } from 'zod';

<<<<<<< HEAD
||||||| bc50ba56aa
interface SessionKnowledgeSyncBody {
  directory: string;
  sessionId: string;
  responseStyleInstruction?: string | null;
}

/**
 * Awaited before the prompt request, so the agent reads the knowledge with the
 * message. Goes to the server that owns the session, which for a session in an
 * isolated space is the one inside the space.
 */
export const syncSessionKnowledge = async (
  directory: string | null | undefined,
  sessionId: string | null | undefined,
  responseStyleInstruction?: string | null,
  expectedRuntimeKey = getRuntimeKey(),
): Promise<void> => {
  if (!directory || !sessionId) return;
  if (expectedRuntimeKey !== getRuntimeKey()) return;
  invalidateSummary(directory, sessionId);
  try {
    if (isVSCodeRuntime()) {
      if (responseStyleInstruction !== undefined) {
        await opencodeClient.setResponseStyleInstruction(directory, sessionId, responseStyleInstruction);
      }
      return;
    }
    const body: SessionKnowledgeSyncBody = { directory, sessionId };
    if (responseStyleInstruction !== undefined) body.responseStyleInstruction = responseStyleInstruction;
    await runtimeFetch('/api/session-knowledge/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      directory,
    });
  } catch {
    // Only means this message goes without its background.
  }
};
=======
interface SessionKnowledgeSyncBody {
  directory: string;
  sessionId: string;
  responseStyleInstruction?: string | null;
}

export const syncSessionKnowledge = async (
  directory: string | null | undefined,
  sessionId: string | null | undefined,
  responseStyleInstruction?: string | null,
  expectedRuntimeKey = getRuntimeKey(),
): Promise<void> => {
  if (!directory || !sessionId) return;
  if (expectedRuntimeKey !== getRuntimeKey()) return;
  invalidateSummary(directory, sessionId);
  try {
    if (isVSCodeRuntime()) {
      if (responseStyleInstruction !== undefined) {
        await opencodeClient.setResponseStyleInstruction(directory, sessionId, responseStyleInstruction);
      }
      return;
    }
    const body: SessionKnowledgeSyncBody = { directory, sessionId };
    if (responseStyleInstruction !== undefined) body.responseStyleInstruction = responseStyleInstruction;
    await runtimeFetch('/api/session-knowledge/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      directory,
    });
  } catch {
    // Only means this message goes without its background.
  }
};
>>>>>>> upstream/main

export interface SessionKnowledgeSummary {
  notes: Array<{ id: string; body: string }>;
  plans: Array<{ id: string; title: string }>;
}

const EMPTY_SUMMARY: SessionKnowledgeSummary = { notes: [], plans: [] };

const SUMMARY_FRESH_MS = 5_000;
const summaryCache = new Map<string, { at: number; request: Promise<SessionKnowledgeSummary> }>();
const summaryCacheKey = (directory: string, sessionId: string | null | undefined): string => (
  `${directory}\u0000${sessionId ?? ''}`
);

const invalidateSummary = (directory: string, sessionId: string | null | undefined): void => {
  summaryCache.delete(summaryCacheKey(directory, sessionId));
};

export const fetchSessionKnowledgeSummary = (
  directory: string | null,
  sessionId?: string | null,
): Promise<SessionKnowledgeSummary> => {
  if (!directory) {
    return Promise.resolve(EMPTY_SUMMARY);
  }
  const key = summaryCacheKey(directory, sessionId);
  const cached = summaryCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < SUMMARY_FRESH_MS) {
    return cached.request;
  }
  const request = requestSessionKnowledgeSummary(directory, sessionId);
  summaryCache.set(key, { at: now, request });
  return request;
};

const requestSessionKnowledgeSummary = async (
  directory: string,
  sessionId?: string | null,
): Promise<SessionKnowledgeSummary> => {
  try {
    const params = new URLSearchParams({ directory });
    if (sessionId) params.set('sessionId', sessionId);
    const response = await runtimeFetch(
      `/api/session-knowledge/summary?${params.toString()}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return EMPTY_SUMMARY;
    }
    const payload = await response.json() as Partial<SessionKnowledgeSummary> | null;
    return {
      notes: Array.isArray(payload?.notes) ? payload.notes : [],
      plans: Array.isArray(payload?.plans) ? payload.plans : [],
    };
  } catch {
    return EMPTY_SUMMARY;
  }
};

export type SessionProjectContextPins = { notes: string[]; plans: string[] };

const sessionProjectContextPinsResponseSchema = z.object({
  pins: z.object({ notes: z.array(z.string()), plans: z.array(z.string()) }),
});

export const setSessionProjectContextPin = async (
  directory: string,
  sessionId: string,
  kind: 'note' | 'plan',
  id: string,
  pinned: boolean,
): Promise<SessionProjectContextPins | null> => {
  invalidateSummary(directory, sessionId);
  try {
    const response = await runtimeFetch('/api/session-knowledge/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory, sessionId, kind, id, pinned }),
      directory,
    });
    if (!response.ok) return null;
    return sessionProjectContextPinsResponseSchema.parse(await response.json()).pins;
  } catch {
    return null;
  } finally {
    invalidateSummary(directory, sessionId);
  }
};
