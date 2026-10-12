import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RuntimeSessionSchema } from '@openchamber/agent-contract';
import type { HistoryPageRequest, RuntimeSession } from '@openchamber/agent-contract';
import { WorkerBootstrapSchema } from '../protocol.ts';
import type { WorkerOperation } from '../protocol.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError, SessionJournal } from '../projection/journal.ts';
import { WorkerOperationError, WorkerRegistry } from '../supervisor/workers.ts';
import { SessionReferenceError, SessionReferences } from './references.ts';
import type { SessionReference } from './references.ts';

export const PrivateSessionBootstrapSchema = WorkerBootstrapSchema.merge(z.strictObject({}).merge(RuntimeSessionSchema).pick({ displayPath: true }));
export type PrivateSessionBootstrap = z.infer<typeof PrivateSessionBootstrapSchema>;
type PromptOperation = Extract<WorkerOperation, { type: 'prompt' }>;
type Opened = { generation: string; sessionFile: string; journal: SessionJournal };
type Entry =
  | { state: 'unloaded'; reference: SessionReference; runtime: RuntimeSession }
  | { state: 'opening'; input: PrivateSessionBootstrap; opened?: Opened }
  | { state: 'live'; input: PrivateSessionBootstrap; opened: Opened };

export class SessionRegistry {
  private readonly references: SessionReferences;
  private readonly entries = new Map<string, Entry>();
  private readonly openings = new Map<string, Promise<RuntimeSession>>();
  private readonly pendingRuns = new Set<string>();
  private readonly deleting = new Set<string>();
  private closing = false;

  constructor(stateDirectory: string, private readonly workers: WorkerRegistry) {
    this.references = new SessionReferences(stateDirectory);
  }

  async initialize(): Promise<void> {
    await this.references.initialize();
    for (const reference of this.references.list().items) {
      this.entries.set(reference.rootSessionId, { state: 'unloaded', reference, runtime: RuntimeSessionSchema.parse({
        sessionId: reference.rootSessionId, rootSessionId: reference.rootSessionId,
        projectId: reference.projectId, workspaceId: reference.workspaceId, displayPath: reference.displayPath,
        createdAt: reference.createdAt, updatedAt: reference.updatedAt,
        epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null,
      }) });
    }
  }

  open(input: PrivateSessionBootstrap): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = PrivateSessionBootstrapSchema.parse(input);
    if (this.deleting.has(parsed.rootSessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    const existing = this.entries.get(parsed.rootSessionId);
    const scope = existing?.state === 'unloaded' ? existing.reference : existing?.input;
    if (scope && (scope.projectId !== parsed.projectId || scope.workspaceId !== parsed.workspaceId)) {
      throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Session scope cannot be changed');
    }
    const pending = this.openings.get(parsed.rootSessionId);
    if (pending) return pending;
    const operation = this.openResolved(parsed);
    this.openings.set(parsed.rootSessionId, operation);
    void operation.finally(() => { this.openings.delete(parsed.rootSessionId); }).catch(() => {});
    return operation;
  }

  runtime(sessionId: string): RuntimeSession {
    const entry = this.get(sessionId);
    if (entry.state === 'unloaded') return structuredClone(entry.runtime);
    if (!entry.opened) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return entry.opened.journal.runtime();
  }

  list(workspaceId: string) {
    const references = this.references.list(workspaceId);
    const items: RuntimeSession[] = [];
    for (const [id, entry] of this.entries) {
      const scope = entry.state === 'unloaded' ? entry.reference : entry.input;
      if (scope.workspaceId !== workspaceId || entry.state === 'opening') continue;
      items.push(this.runtime(id));
    }
    return { items, errors: references.errors };
  }

  journal(sessionId: string): SessionJournal {
    const entry = this.get(sessionId);
    if (entry.state === 'unloaded' || !entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    return entry.opened.journal;
  }

  async prompt(sessionId: string, operation: PromptOperation) {
    this.ensureOpen();
    const runtime = this.runtime(sessionId);
    if (runtime.runtimeStatus === 'unavailable') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    if (runtime.activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE');
    this.pendingRuns.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, operation);
      if (result.type !== 'prompt') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      return result.run;
    } finally { this.pendingRuns.delete(sessionId); }
  }

  async abort(sessionId: string, runId: string) {
    this.ensureOpen();
    if (this.runtime(sessionId).activeRunId !== runId) throw new WorkerOperationError(404, 'RUN_NOT_FOUND');
    const result = await this.workers.request(sessionId, { type: 'abort', runId });
    if (result.type !== 'abort') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return result.run;
  }

  async history(request: HistoryPageRequest) {
    this.ensureOpen();
    this.get(request.sessionId);
    const result = await this.workers.request(request.sessionId, { type: 'history', request });
    if (result.type !== 'history') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return result.history;
  }

  async delete(sessionId: string) {
    this.ensureOpen();
    const opening = this.openings.get(sessionId);
    if (opening) await opening;
    const journal = this.journal(sessionId);
    if (journal.runtime().activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE');
    this.deleting.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, { type: 'delete' });
      if (result.type !== 'delete') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      // The SDK deletion is authoritative even if reference cleanup later fails.
      for (const id of result.deletedSessionIds) this.entries.delete(id);
      journal.close();
      await this.workers.stop(sessionId);
      for (const id of result.deletedSessionIds) await this.references.remove(id);
      return { sessionId, deletedSessionIds: result.deletedSessionIds };
    } finally { this.deleting.delete(sessionId); }
  }

  onOpened(sessionId: string, generation: string, sessionFile: string, seed: ProjectionSeed): void {
    const entry = this.entries.get(sessionId);
    if (entry?.state !== 'opening') return;
    const journal = entry.opened?.journal;
    if (journal) journal.replace(seed);
    entry.opened = { generation, sessionFile, journal: journal ?? new SessionJournal({
      sessionId, rootSessionId: sessionId, projectId: entry.input.projectId,
      workspaceId: entry.input.workspaceId, displayPath: entry.input.displayPath,
    }, seed) };
  }

  onEvents(sessionId: string, generation: string, inputs: ProjectionInput[]): void {
    if (this.closing) return;
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    try { entry.opened.journal.append(inputs); }
    catch {
      entry.opened.journal.unavailable();
      void this.workers.stop(sessionId).catch(() => {});
    }
  }

  onExit(sessionId: string, generation: string): void {
    if (this.closing) return;
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    entry.opened.journal.unavailable();
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const entry of this.entries.values()) if (entry.state !== 'unloaded') entry.opened?.journal.close();
    await Promise.allSettled(this.openings.values());
    await this.references.close();
  }

  private async openResolved(input: PrivateSessionBootstrap): Promise<RuntimeSession> {
    const previous = this.entries.get(input.rootSessionId);
    const reference = this.references.get(input.rootSessionId);
    if (previous?.state === 'live' && previous.opened.journal.runtime().runtimeStatus !== 'unavailable') return previous.opened.journal.runtime();
    const resolved = reference ? { ...input, sessionFile: reference.sessionFile } : input;
    const entry: Extract<Entry, { state: 'opening' }> = { state: 'opening', input: resolved };
    if (previous?.state === 'live') entry.opened = previous.opened;
    this.entries.set(input.rootSessionId, entry);
    try {
      const { displayPath, ...bootstrap } = resolved;
      await this.workers.start(bootstrap, previous?.state === 'live');
      if (!entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
      const runtime = entry.opened.journal.runtime();
      await this.references.put({
        rootSessionId: bootstrap.rootSessionId, projectId: bootstrap.projectId, workspaceId: bootstrap.workspaceId,
        cwd: bootstrap.cwd, agentDirectory: bootstrap.agentDirectory,
        sessionsDirectory: bootstrap.sessionsDirectory, options: bootstrap.options,
        sessionFile: entry.opened.sessionFile, displayPath,
        createdAt: runtime.createdAt, updatedAt: runtime.updatedAt,
      });
      this.entries.set(input.rootSessionId, { state: 'live', input: resolved, opened: entry.opened });
      return runtime;
    } catch (error) {
      await this.workers.stop(input.rootSessionId);
      if (previous) this.entries.set(input.rootSessionId, previous);
      else this.entries.delete(input.rootSessionId);
      throw error;
    }
  }

  private get(sessionId: string): Entry {
    this.ensureOpen();
    if (this.deleting.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    this.references.get(sessionId);
    const entry = this.entries.get(sessionId);
    if (!entry) throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
    return entry;
  }

  private ensureOpen(): void {
    if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
  }
}
