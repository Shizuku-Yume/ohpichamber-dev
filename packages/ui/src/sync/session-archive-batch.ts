<<<<<<< HEAD
/**
 * OpenChamber-owned session routes: archive, unarchive, metadata, links.
 *
 * Archiving a batch is a Host capability, not a canonical runtime mutation.
 * The route returns only stamps; callers reconcile those against native Session
 * records already in their stores.
 */
||||||| bc50ba56aa
/**
 * OpenChamber-owned session routes: archive, unarchive, metadata, links.
 *
 * Archiving the sessions linked to a worktree one request at a time is what
 * made removing a worktree with many sessions take tens of seconds: every
 * session cost its own round trip and its own store reconciliation. This asks
 * the OpenChamber server to archive the whole batch next to OpenCode, so the
 * browser spends one request and reconciles once.
 *
 * The server sets archive state on OpenCode's record and keeps it in its own
 * archive file for sessions OpenCode cannot change (their directory is gone);
 * metadata is merge-patched onto OpenCode's record. The batch, the fallback and
 * the merge are OpenChamber's, so these are OpenChamber routes. Runtimes that do
 * not serve them answer with a stable unsupported status, and callers fall back
 * to a per-session path or report failure.
 */
=======
>>>>>>> upstream/main

import { SessionMetadataSchema, type SessionMetadata, type SessionMetadataPatch } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { z } from 'zod';
import { toStoredLinkedIssue, type LinkedIssue } from '@/lib/linkedIssues';
import { runtimeFetch } from '@/lib/runtime-fetch';

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
  sessionIds: string[],
  archivedAt: number,
): Promise<SessionArchiveBatchResult> {
  let response: Response;
  try {
    response = await runtimeFetch('/api/openchamber/sessions/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directory, ids: sessionIds, archivedAt }),
      directory,
    });
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'archive request failed' };
  }
  if (!response.ok) return { outcome: 'unavailable', reason: `archive request failed with ${response.status}` };

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'archive response was not JSON' };
  }
  const parsed = archiveResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { outcome: 'unavailable', reason: `malformed archive response: ${parsed.error.issues[0]?.message ?? 'unknown shape'}` };
  }
  return { outcome: 'archived', archived: parsed.data.archived, failedIds: parsed.data.failedIds };
}

const unarchiveResponseSchema = z.object({
  restored: z.array(z.object({ id: z.string().min(1), archivedAt: z.null() })),
  failedIds: z.array(z.string().min(1)),
});

export type SessionUnarchiveBatchResult =
  | { outcome: 'restored'; restored: string[]; failedIds: string[] }
  | { outcome: 'unavailable'; reason: string };

<<<<<<< HEAD
export async function requestSessionUnarchiveBatch(
  sessionIds: string[],
  directory?: string | null,
): Promise<SessionUnarchiveBatchResult> {
||||||| bc50ba56aa
/** Clears `time.archived` for a batch of sessions. Mirrors the archive route. */
export async function requestSessionUnarchiveBatch(ids: string[], directory?: string | null): Promise<SessionUnarchiveBatchResult> {
=======
export async function requestSessionUnarchiveBatch(ids: string[], directory?: string | null): Promise<SessionUnarchiveBatchResult> {
>>>>>>> upstream/main
  let response: Response;
  try {
    response = await runtimeFetch('/api/openchamber/sessions/unarchive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: sessionIds }),
      directory,
    });
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'unarchive request failed' };
  }
  if (!response.ok) return { outcome: 'unavailable', reason: `unarchive request failed with ${response.status}` };

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
  return { outcome: 'restored', restored: parsed.data.restored.map((entry) => entry.id), failedIds: parsed.data.failedIds };
}

export type SessionMetadataUpdateResult =
  | { outcome: 'updated'; metadata: SessionMetadata | null; revision: string }
  | { outcome: 'unavailable'; reason: string };

<<<<<<< HEAD
/** Applies a native SessionMetadataPatch through the OpenChamber Host route. */
||||||| bc50ba56aa
/**
 * Applies a JSON Merge Patch (RFC 7386) to a session's metadata: nested
 * objects merge key by key and `null` deletes. OpenCode only accepts metadata
 * at creation time, so the merged record lives with the OpenChamber server,
 * which folds it into every session record it serves. Resolves with the
 * session's full metadata after the patch.
 */
=======
// external: https://www.rfc-editor.org/rfc/rfc7386 The host merges metadata objects recursively and deletes keys assigned null.
>>>>>>> upstream/main
export async function requestSessionMetadataUpdate(
  sessionId: string,
  patch: SessionMetadataPatch,
): Promise<SessionMetadataUpdateResult> {
  try {
    const state = await canonicalClient.patchSessionMetadata(sessionId, patch);
    return { outcome: 'updated', metadata: state.metadata, revision: state.revision };
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'metadata request failed' };
  }
}

export type SessionLinksUpdateResult =
  | { outcome: 'updated'; metadata: SessionMetadata }
  | { outcome: 'unavailable'; reason: string };

<<<<<<< HEAD
const linksResponseSchema = z.object({ metadata: SessionMetadataSchema });

/**
 * Links or unlinks items on a session through OpenChamber's own route. The
 * server decides the new `linked_issues` list from its own fresh read inside
 * the session's write queue, so this sends only the operation — never a whole
 * list that a stale client snapshot could overwrite concurrent links with.
 * Resolves with the session's full metadata after the operation.
 */
||||||| bc50ba56aa
/**
 * Links or unlinks items on a session through OpenChamber's own route. The
 * server decides the new `linked_issues` list from its own fresh read inside
 * the session's write queue, so this sends only the operation — never a whole
 * list that a stale client snapshot could overwrite concurrent links with.
 * Resolves with the session's full metadata after the operation.
 */
=======
>>>>>>> upstream/main
export async function requestSessionLinksUpdate(
  sessionID: string,
  entries: readonly LinkedIssue[],
  linked: boolean,
  directory?: string | null,
): Promise<SessionLinksUpdateResult> {
  let response: Response;
  try {
    response = await runtimeFetch(`/api/openchamber/sessions/${encodeURIComponent(sessionID)}/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: entries.map(toStoredLinkedIssue), linked }),
      directory,
    });
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'links request failed' };
  }

  if (!response.ok) {
    return { outcome: 'unavailable', reason: `links request failed with ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { outcome: 'unavailable', reason: error instanceof Error ? error.message : 'links response was not JSON' };
  }

  const parsed = linksResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { outcome: 'unavailable', reason: `malformed links response: ${parsed.error.issues[0]?.message ?? 'unknown shape'}` };
  }

  return { outcome: 'updated', metadata: parsed.data.metadata };
}
