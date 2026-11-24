import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { SubagentSchema } from '@openchamber/agent-contract';
import type { Subagent } from '@openchamber/agent-contract';
import type { SessionJournal } from '../projection/journal.ts';
import type { SessionReferences } from './references.ts';
import type { Entry } from './registry.ts';

export type SubagentLifecycleInput = { subagentId: string; toolCallId?: string; status: 'started' | 'completed' | 'failed' | 'aborted'; role: string; description?: string; solutionSpace?: string; sessionFile?: string };
export type ChildRecord = Subagent & { childSessionId: string; rootSessionId: string; workspaceId: string; projectId: string; sessionFile: string };
export type Opened = { generation: string; sessionFile: string; journal: SessionJournal };
const SessionFileIdentitySchema = z.object({ type: z.literal('session'), id: z.string().min(1), parentSession: z.string().min(1).optional() });

/**
 * Registry-owned subagent state the lifecycle writers mutate. The maps are the
 * registry's live indexes; `tails` serializes every child write so an exit
 * settle cannot race a lifecycle frame still in flight.
 */
export interface SubagentLifecycleDeps {
  entries: Map<string, Entry>;
  subagents: Map<string, ChildRecord>;
  tails: Map<string, Promise<void>>;
  references: Pick<SessionReferences, 'putSubagent'>;
  isClosing(): boolean;
}

/**
 * A `subagentId` is only unique inside its root session — the worker's child
 * id is model/tool chosen (`task` ids repeat across roots and respawns), so
 * every live and persisted child index keys records under the owning root.
 */
export function subagentKey(rootSessionId: string, subagentId: string): string {
  return `${rootSessionId}\u0000${subagentId}`;
}

/**
 * A `running` record is live detached work (`task` `tasks[]` children keep
 * working after the spawning turn's `agent_end`), so it blocks idle eviction.
 * Terminal and parked records are file state and never do.
 */
export function hasRunningSubagent(subagents: ReadonlyMap<string, ChildRecord>, rootSessionId: string): boolean {
  for (const record of subagents.values()) {
    if (record.rootSessionId === rootSessionId && record.status === 'running') return true;
  }
  return false;
}

/**
 * The live entry and generation that may write child indexes. An exited
 * worker's generation is retired the moment its runtime is reported
 * unavailable, so a lifecycle frame still queued behind the tail cannot
 * resurrect `running` records the exit settle already terminated.
 */
function isCurrentSubagentOwner(deps: SubagentLifecycleDeps, rootSessionId: string, generation: string): boolean {
  const entry = deps.entries.get(rootSessionId);
  return !deps.isClosing() && entry?.state === 'live' && entry.opened.generation === generation
    && entry.opened.journal.runtime().runtimeStatus !== 'unavailable';
}

export async function readSubagentIdentity(sessionFile: string): Promise<{ childSessionId: string; parentSessionFile?: string } | undefined> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const content = await readFile(sessionFile, 'utf8');
      for (const line of content.split('\n')) {
        if (!line) continue;
        try {
          const parsed = SessionFileIdentitySchema.safeParse(JSON.parse(line));
          if (parsed.success) {
            return parsed.data.parentSession
              ? { childSessionId: parsed.data.id, parentSessionFile: parsed.data.parentSession }
              : { childSessionId: parsed.data.id };
          }
        } catch { /* an unreadable parent-session line names no parent; keep scanning */ }
      }
    } catch { /* the session file is still being written; retry below */ }
    if (attempt < 9) await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
  return undefined;
}

/**
 * Child lifecycle frames serialize on the root's tail: a start can still be
 * resolving the child identity file when a settle lands, and writes must apply
 * in order.
 */
export async function queueSubagentLifecycle(deps: SubagentLifecycleDeps, rootSessionId: string, generation: string, input: SubagentLifecycleInput): Promise<void> {
  if (!isCurrentSubagentOwner(deps, rootSessionId, generation)) return;
  const previous = deps.tails.get(rootSessionId) ?? Promise.resolve();
  const operation = previous.then(() => persistSubagent(deps, rootSessionId, generation, input));
  const settled = operation.catch(() => { });
  deps.tails.set(rootSessionId, settled);
  try { await operation; }
  finally { if (deps.tails.get(rootSessionId) === settled) deps.tails.delete(rootSessionId); }
}

async function persistSubagent(deps: SubagentLifecycleDeps, rootSessionId: string, generation: string, input: SubagentLifecycleInput): Promise<void> {
  const entry = deps.entries.get(rootSessionId);
  if (!isCurrentSubagentOwner(deps, rootSessionId, generation) || !entry || entry.state !== 'live' || !input.sessionFile) return;
  const identity = await readSubagentIdentity(input.sessionFile);
  if (!identity || !isCurrentSubagentOwner(deps, rootSessionId, generation) || deps.entries.get(rootSessionId) !== entry) return;
  const existing = deps.subagents.get(subagentKey(rootSessionId, input.subagentId));
  let parentSessionId = existing?.parentSessionId;
  if (!parentSessionId) {
    if (!identity.parentSessionFile) return;
    if (identity.parentSessionFile === entry.opened.sessionFile) parentSessionId = rootSessionId;
    else {
      const parent = [...deps.subagents.values()].find(record => record.rootSessionId === rootSessionId && record.sessionFile === identity.parentSessionFile);
      if (!parent) return;
      parentSessionId = parent.childSessionId;
    }
  }
  const status: Subagent['status'] = input.status === 'started' ? 'running' : input.status === 'aborted' ? 'cancelled' : input.status;
  const record: ChildRecord = { subagentId: input.subagentId, parentSessionId, childSessionId: identity.childSessionId, name: input.subagentId, role: input.role, status, rootSessionId, workspaceId: entry.input.workspaceId, projectId: entry.input.projectId, sessionFile: input.sessionFile };
  const toolCallId = input.toolCallId ?? existing?.toolCallId;
  if (toolCallId) record.toolCallId = toolCallId;
  const description = input.description ?? existing?.description;
  if (description) record.description = description;
  const solutionSpace = input.solutionSpace ?? existing?.solutionSpace;
  if (solutionSpace) record.solutionSpace = solutionSpace;
  await deps.references.putSubagent(record);
  if (isCurrentSubagentOwner(deps, rootSessionId, generation) && deps.entries.get(rootSessionId) === entry) {
    deps.subagents.set(subagentKey(rootSessionId, input.subagentId), record);
    // The live worker frame cannot know the child's session id — that UUID
    // only exists once this file's header resolves. Reconcile the row the UI
    // already renders so it never keys a native name as a session id.
    const { rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...subagent } = record;
    // A closed journal (relocation, service shutdown) rejects append; the
    // durable record above already carries the state.
    try { entry.opened.journal.append([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: SubagentSchema.parse(subagent) } }]); }
    catch { /* the journal is already closed */ }
  }
}

/**
 * A worker that stops or crashes with detached `tasks[]` children still
 * running would leave their canonical records at `running` forever. Settle
 * every `running` record to `cancelled`: the in-memory record and the live
 * journal frame move synchronously so subscribers see the settlement, and the
 * persisted child index follows on the lifecycle tail. Parked records are
 * resumable transcripts and keep their status.
 */
export function settleSubagentsForExit(deps: SubagentLifecycleDeps, rootSessionId: string, opened: Opened): void {
  const orphans = [...deps.subagents.values()].filter(record => record.rootSessionId === rootSessionId && record.status === 'running');
  if (orphans.length === 0) return;
  for (const orphan of orphans) {
    const record: ChildRecord = { ...orphan, status: 'cancelled' };
    deps.subagents.set(subagentKey(rootSessionId, record.subagentId), record);
    const { rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...subagent } = record;
    // A closed journal (relocation, service shutdown) rejects append; the
    // durable record still settles below.
    try { opened.journal.append([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: SubagentSchema.parse(subagent) } }]); }
    catch { /* the journal is already closed */ }
  }
  const previous = deps.tails.get(rootSessionId) ?? Promise.resolve();
  const settled = previous.then(async () => {
    for (const orphan of orphans) await deps.references.putSubagent({ ...orphan, status: 'cancelled' });
  }).catch(() => { });
  deps.tails.set(rootSessionId, settled);
  void settled.finally(() => { if (deps.tails.get(rootSessionId) === settled) deps.tails.delete(rootSessionId); });
}
