/**
 * OpenChamber-owned session routes: archive, unarchive, metadata.
 *
 * Archiving the sessions linked to a worktree one request at a time is what
 * made removing a worktree with many sessions take tens of seconds: every
 * session cost its own round trip and its own store reconciliation. This asks
 * the Host server to archive the whole batch, so the
 * browser spends one request and reconciles once.
 *
 * OpenCode 2.x has no HTTP route that sets `time.archived` or rewrites a
 * session's metadata after creation. Host SQLite owns both independently of
 * the execution runtime. Every retained runtime serves these OpenChamber
 * routes through its Host; failed or malformed responses leave the caller's
 * sessions unchanged.
 */

import type { Metadata } from "@/lib/opencode/model"
import { sessionMetadataStateSchema } from "@/lib/opencode/json"
import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

/**
 * The route answers with the archive stamps it stored, `{ id, archivedAt }`,
 * not session records: the caller applies each stamp to the session it
 * already holds.
 */
const archiveResponseSchema = z.object({
  archived: z.array(z.object({ id: z.string().min(1), archivedAt: z.number() })),
  failedIds: z.array(z.string().min(1)),
});

export type SessionArchiveStamp = { id: string; archivedAt: number };

export type SessionArchiveBatchResult =
  | { outcome: 'archived'; archived: SessionArchiveStamp[]; failedIds: string[] }
  | { outcome: 'unavailable'; reason: string };

export async function requestSessionArchiveBatch(
  directory: string,
  ids: string[],
  archivedAt: number,
): Promise<SessionArchiveBatchResult> {
  let response: Response;
  try {
    response = await runtimeFetch('/api/openchamber/sessions/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directory, ids, archivedAt }),
      directory,
    });
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'archive request failed' };
  }

  if (!response.ok) {
    return { outcome: 'unavailable', reason: `archive request failed with ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'archive response was not JSON' };
  }

  const parsed = archiveResponseSchema.safeParse(body);
  if (!parsed.success) {
    // A body this layer cannot read is reported as unavailable rather than as
    // an empty success, so a caller never mistakes "the response made no
    // sense" for "nothing needed archiving" and drops the sessions.
    return { outcome: 'unavailable', reason: `malformed archive response: ${parsed.error.issues[0]?.message ?? 'unknown shape'}` };
  }

  return {
    outcome: 'archived',
    archived: parsed.data.archived,
    failedIds: parsed.data.failedIds,
  };
}

const unarchiveResponseSchema = z.object({
  restored: z.array(z.object({ id: z.string().min(1), archivedAt: z.null() })),
  failedIds: z.array(z.string().min(1)),
});

export type SessionUnarchiveBatchResult =
  | { outcome: 'restored'; restored: string[]; failedIds: string[] }
  | { outcome: 'unavailable'; reason: string };

/** Clears `time.archived` for a batch of sessions. Mirrors the archive route. */
export async function requestSessionUnarchiveBatch(ids: string[], directory?: string | null): Promise<SessionUnarchiveBatchResult> {
  let response: Response;
  try {
    response = await runtimeFetch('/api/openchamber/sessions/unarchive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
      directory,
    });
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'unarchive request failed' };
  }

  if (!response.ok) {
    return { outcome: 'unavailable', reason: `unarchive request failed with ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'unarchive response was not JSON' };
  }

  const parsed = unarchiveResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { outcome: 'unavailable', reason: `malformed unarchive response: ${parsed.error.issues[0]?.message ?? 'unknown shape'}` };
  }

  return {
    outcome: 'restored',
    restored: parsed.data.restored.map((entry) => entry.id),
    failedIds: parsed.data.failedIds,
  };
}


export type SessionMetadataUpdateResult =
  | { outcome: 'updated'; metadata: Metadata; revision: string }
  | { outcome: 'unavailable'; reason: string };

/**
 * Applies a JSON Merge Patch (RFC 7386) to a session's metadata: nested
 * objects merge key by key and `null` deletes. OpenCode only accepts metadata
 * at creation time, so the merged record lives with the OpenChamber server,
 * which folds it into every session record it serves. Resolves with the
 * session's full metadata after the patch.
 */
export async function requestSessionMetadataUpdate(
  sessionID: string,
  patch: Metadata,
  directory?: string | null,
): Promise<SessionMetadataUpdateResult> {
  let response: Response;
  try {
    response = await runtimeFetch(`/api/openchamber/sessions/${encodeURIComponent(sessionID)}/metadata`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patch }),
      directory,
    });
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'metadata request failed' };
  }

  if (!response.ok) {
    return { outcome: 'unavailable', reason: `metadata request failed with ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'metadata response was not JSON' };
  }

  const parsed = sessionMetadataStateSchema.safeParse(body);
  if (!parsed.success) {
    return { outcome: 'unavailable', reason: `malformed metadata response: ${parsed.error.issues[0]?.message ?? 'unknown shape'}` };
  }

  return { outcome: 'updated', metadata: parsed.data.metadata, revision: parsed.data.revision };
}
