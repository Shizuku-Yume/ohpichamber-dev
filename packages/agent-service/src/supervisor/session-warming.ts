import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CacheWarmingModeSchema,
  EntityIdSchema,
  PositiveCounterSchema,
  SessionCacheWarmingApplyResultSchema,
  SessionCacheWarmingStateSchema,
  SessionCacheWarmingUpdateRequestSchema,
  type CacheWarmingMode,
  type CacheWarmingWorkerApplyOutcome,
  type SessionCacheWarmingApplyResult,
  type SessionCacheWarmingState,
  type SessionCacheWarmingUpdateRequest,
} from '@openchamber/agent-contract';
import { WorkerOperationError, type WorkerRegistry } from './workers.ts';
import type { WorkspaceCatalogs } from './workspaces.ts';

const PersistedSessionWarmingSchema = z.strictObject({
  sessionId: EntityIdSchema,
  revision: PositiveCounterSchema,
  mode: CacheWarmingModeSchema.nullable(),
});
type PersistedSessionWarming = z.infer<typeof PersistedSessionWarmingSchema>;

const StateSchema = z.strictObject({
  sessions: z.array(PersistedSessionWarmingSchema),
});

/** Durable per-root-session prompt-cache warming overrides and CAS coordinator. */
export class SessionWarming {
  private readonly entries = new Map<string, PersistedSessionWarming>();
  private readonly tails = new Map<string, Promise<void>>();
  private stateTail: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(
    private readonly stateDirectory: string,
    private readonly workspaceCatalogs: WorkspaceCatalogs,
    private readonly workers: WorkerRegistry,
  ) {
    this.file = join(stateDirectory, 'session-cache-warming.json');
  }

  async initialize(): Promise<void> {
    try {
      const state = StateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
      for (const entry of state.sessions) {
        if (this.entries.has(entry.sessionId)) throw new Error('Duplicate session cache warming entry');
        this.entries.set(entry.sessionId, entry);
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The session cache warming state could not be inspected');
      }
    }
  }

  overrideMode(rootSessionId: string): CacheWarmingMode | null {
    return this.entries.get(rootSessionId)?.mode ?? null;
  }

  isKeptWarm(rootSessionId: string): boolean {
    const mode = this.overrideMode(rootSessionId);
    return mode === 'idle' || mode === 'streaming';
  }

  async read(rootSessionId: string, workspaceId: string): Promise<SessionCacheWarmingState> {
    const workspaceMode = (await this.workspaceCatalogs.readCacheWarming(workspaceId)).mode;
    const entry = this.entries.get(rootSessionId);
    const revision = entry?.revision ?? '0';
    const mode = entry?.mode ?? null;
    return SessionCacheWarmingStateSchema.parse({
      sessionId: rootSessionId,
      workspaceId,
      revision,
      mode,
      workspaceMode,
      effectiveMode: mode ?? workspaceMode,
    });
  }

  async update(rootSessionId: string, workspaceId: string, input: SessionCacheWarmingUpdateRequest): Promise<SessionCacheWarmingApplyResult> {
    const request = SessionCacheWarmingUpdateRequestSchema.parse(input);
    return this.serial(rootSessionId, () => this.workspaceCatalogs.withWarmingLock(workspaceId, async readWorkspaceWarming => {
      const previous = this.entries.get(rootSessionId);
      const currentRevision = previous?.revision ?? '0';
      if (request.expectedRevision !== currentRevision) {
        throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The session cache warming revision does not match the expected revision', { currentRevision });
      }
      const workspaceMode = (await readWorkspaceWarming()).mode;
      const nextRevision = PositiveCounterSchema.parse((BigInt(currentRevision) + 1n).toString());
      const nextEntry: PersistedSessionWarming = { sessionId: rootSessionId, revision: nextRevision, mode: request.mode };
      await this.stateMutation(async () => {
        this.entries.set(rootSessionId, nextEntry);
        try {
          await this.persist();
        } catch (error) {
          if (previous) this.entries.set(rootSessionId, previous);
          else this.entries.delete(rootSessionId);
          throw error;
        }
      });
      const effectiveMode = request.mode ?? workspaceMode;
      const persisted = SessionCacheWarmingStateSchema.parse({
        sessionId: rootSessionId,
        workspaceId,
        revision: nextRevision,
        mode: request.mode,
        workspaceMode,
        effectiveMode,
      });
      const activeWorker = this.workers.list().find(worker =>
        worker.kind === 'session'
        && worker.rootSessionId === rootSessionId
        && worker.workspaceId === workspaceId
        && (worker.state === 'ready' || worker.state === 'starting'),
      );
      if (!activeWorker) {
        return SessionCacheWarmingApplyResultSchema.parse({ persisted, status: 'no-active-worker', worker: null });
      }
      const identity = { workspaceId, rootSessionId, workerGeneration: activeWorker.workerGeneration };
      let workerOutcome: CacheWarmingWorkerApplyOutcome;
      try {
        const applied = await this.workers.request(rootSessionId, {
          type: 'catalog',
          revision: persisted.revision,
          operation: { type: 'catalog.warming.apply', mode: persisted.effectiveMode },
        }, activeWorker.workerGeneration);
        const current = this.workers.info(rootSessionId);
        if (
          applied.type !== 'catalog'
          || applied.result.type !== 'catalog.warming.applied'
          || applied.result.mode !== persisted.effectiveMode
          || current?.workerGeneration !== activeWorker.workerGeneration
          || current.state !== 'ready'
        ) {
          throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker did not apply the persisted cache warming mode');
        }
        workerOutcome = { worker: identity, outcome: 'applied', mode: persisted.effectiveMode };
      } catch {
        workerOutcome = {
          worker: identity,
          outcome: 'failed',
          mode: persisted.effectiveMode,
          error: { code: 'SERVICE_UNAVAILABLE', detail: 'The active worker did not confirm the configured cache-warming mode.', retryable: true },
        };
      }
      return SessionCacheWarmingApplyResultSchema.parse({
        persisted,
        status: workerOutcome.outcome,
        worker: workerOutcome,
      });
    }));
  }

  /**
   * Move a persisted per-session warming override after the session is rekeyed
   * by a completed `/btw` branch, so its keep-warm choice still names the live
   * root and the reaper does not evict the branch's worker.
   */
  async rekey(previousSessionId: string, sessionId: string): Promise<void> {
    if (previousSessionId === sessionId) return;
    const existing = this.entries.get(previousSessionId);
    if (!existing) return;
    await this.stateMutation(async () => {
      this.entries.delete(previousSessionId);
      this.entries.set(sessionId, { ...existing, sessionId });
      try {
        await this.persist();
      } catch (error) {
        this.entries.delete(sessionId);
        this.entries.set(previousSessionId, existing);
        throw error;
      }
    });
  }

  async clear(sessionIds: Iterable<string>): Promise<void> {
    const targetIds = new Set(sessionIds);
    if (targetIds.size === 0) return;
    await this.stateMutation(async () => {
      const removed: PersistedSessionWarming[] = [];
      for (const id of targetIds) {
        const existing = this.entries.get(id);
        if (!existing) continue;
        removed.push(existing);
        this.entries.delete(id);
      }
      if (removed.length === 0) return;
      try {
        await this.persist();
      } catch (error) {
        for (const entry of removed) this.entries.set(entry.sessionId, entry);
        throw error;
      }
    });
  }

  private serial<T>(rootSessionId: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(rootSessionId) ?? Promise.resolve()).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(rootSessionId, tail);
    void tail.then(() => { if (this.tails.get(rootSessionId) === tail) this.tails.delete(rootSessionId); });
    return result;
  }

  private stateMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.stateTail.then(operation);
    this.stateTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ sessions: [...this.entries.values()] }));
      } finally {
        await file.close();
      }
      await rename(temporary, this.file);
    } finally {
      try { await unlink(temporary); } catch { /* the rename already consumed the temporary file */ }
    }
  }
}
