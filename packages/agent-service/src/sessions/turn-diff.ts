import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { TurnDiffSchema } from '@openchamber/agent-contract';
import type { TurnDiff, TurnDiffFile } from '@openchamber/agent-contract';
import { computeTurnDiff, sanitizeErrorMessage } from './turn-diff-core.ts';
import type { TurnDiffCoreFile, TurnDiffCoreResult } from './turn-diff-core.ts';

const JOURNAL_FILE = 'changes.jsonl';
const BLOB_DIR = 'blobs';

const ErrnoSchema = z.object({ code: z.string() });

const JOURNALED_MUTATION_TOOLS = new Set(['edit', 'write', 'ast_edit', 'bash', 'eval', 'task', 'apply_patch']);

interface LoadedJournal {
  readonly text: string | null;
  readonly loadBlob: (key: string) => Promise<Uint8Array | undefined>;
  readonly readError?: unknown;
}

async function loadJournal(artifactsDir: string): Promise<LoadedJournal> {
  let text: string | null;
  try {
    text = await readFile(join(artifactsDir, JOURNAL_FILE), 'utf8');
  } catch (error) {
    if (ErrnoSchema.safeParse(error).data?.code === 'ENOENT') text = null;
    else return { text: null, loadBlob: async () => undefined, readError: error };
  }
  const loadBlob = async (key: string): Promise<Uint8Array | undefined> => {
    if (key.includes('/') || key.includes('\\') || key.includes('\0')) return undefined;
    try {
      return await readFile(join(artifactsDir, BLOB_DIR, key));
    } catch (error) {
      if (ErrnoSchema.safeParse(error).data?.code === 'ENOENT') return undefined;
      throw error;
    }
  };
  return { text, loadBlob };
}

function contractRow(row: TurnDiffCoreFile): TurnDiffFile {
  const file: TurnDiffFile = {
    path: row.path,
    status: row.status,
    additions: row.additions,
    deletions: row.deletions,
    provenance: row.provenance.map(entry => {
      const provenance: TurnDiffFile['provenance'][number] = { tool: entry.tool, agent: entry.agent, at: entry.at };
      if (entry.subagentId !== undefined) provenance.subagentId = entry.subagentId;
      return provenance;
    }),
    truncated: row.truncated,
    incomplete: row.incomplete,
  };
  if (row.previousPath !== undefined) file.previousPath = row.previousPath;
  if (row.before !== undefined) file.before = row.before;
  if (row.after !== undefined) file.after = row.after;
  if (row.patch !== undefined) file.patch = row.patch;
  return file;
}

function contractResult(sessionId: string, turnId: string, result: TurnDiffCoreResult): TurnDiff {
  const diff: TurnDiff = {
    sessionId, turnId, state: result.state, files: result.files.map(contractRow),
  };
  if (result.error !== undefined) diff.error = result.error;
  return TurnDiffSchema.parse(diff);
}

export function failedTurnDiff(sessionId: string, turnId: string, cause: unknown): TurnDiff {
  const message = cause instanceof Error ? cause.message : String(cause);
  return contractResult(sessionId, turnId, { state: 'failed', files: [], error: sanitizeErrorMessage(message) });
}

export interface TurnDiffReadInput {
  readonly sessionId: string;
  readonly turnId: string;
  readonly turns: readonly { readonly turnId: string; readonly startedAt: number; readonly finishedAt?: number }[];
  readonly artifactsDir: string | null;
  readonly ownsRecord: (record: { agent: string; parent?: string }) => boolean;
  readonly workspaceCwd: string;
  readonly turnHasMutationEvidence: boolean;
}

export class TurnDiffNotFoundError extends Error {
  constructor(turnId: string) { super(`The turn ${turnId} is not part of the session's branch`); }
}

export async function readTurnDiffArtifacts(input: TurnDiffReadInput): Promise<TurnDiff> {
  const turn = input.turns.find(candidate => candidate.turnId === input.turnId);
  if (!turn) throw new TurnDiffNotFoundError(input.turnId);
  let journalText: string | null = null;
  let loadBlob: (key: string) => Promise<Uint8Array | undefined> = async () => undefined;
  if (input.artifactsDir !== null) {
    const journal = await loadJournal(input.artifactsDir);
    if (journal.readError !== undefined) return failedTurnDiff(input.sessionId, input.turnId, journal.readError);
    journalText = journal.text;
    loadBlob = journal.loadBlob;
  }
  const result = await computeTurnDiff({
    journalText,
    loadBlob,
    window: { turnId: turn.turnId, startedAt: turn.startedAt, finishedAt: turn.finishedAt },
    ownsRecord: input.ownsRecord,
    workspaceCwd: input.workspaceCwd,
    turnHasMutationEvidence: input.turnHasMutationEvidence,
  });
  return contractResult(input.sessionId, input.turnId, result);
}

export function mutationEvidenceInMessages(messages: readonly { readonly turnId: string; readonly parts: readonly { readonly type: string; readonly toolName?: string; readonly isError?: boolean }[] }[], turnId: string): boolean {
  for (const message of messages) {
    if (message.turnId !== turnId) continue;
    for (const part of message.parts) {
      if (part.type !== 'tool_result') continue;
      if (part.isError === true) continue;
      if (part.toolName !== undefined && JOURNALED_MUTATION_TOOLS.has(part.toolName)) return true;
    }
  }
  return false;
}

