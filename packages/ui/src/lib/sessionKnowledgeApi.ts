
import { runtimeFetch } from './runtime-fetch';
import { z } from 'zod';


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
