import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DisplayPathSchema, EntityIdSchema, JsonValueSchema, SubagentSchema, TimestampSchema } from '@openchamber/agent-contract';
import type { JsonValue, ProblemCode } from '@openchamber/agent-contract';
import { z } from 'zod';
import { WorkerBootstrapSchema } from '../protocol.ts';

const SessionReferenceSchema = WorkerBootstrapSchema.omit({ env: true, observationEpoch: true, catalogRevision: true, mcpConfiguration: true, skillSources: true, sessionWarmingMode: true }).required({ sessionFile: true })
  .extend({
    displayPath: DisplayPathSchema, parentSessionId: EntityIdSchema.optional(), createdAt: TimestampSchema, updatedAt: TimestampSchema,
    deletedSpace: z.strictObject({
      spaceId: EntityIdSchema, archivedAt: TimestampSchema, directory: z.string().min(1),
      privateRoots: z.array(z.strictObject({ root: z.string().min(1), label: z.enum(['workspace', 'agent-directory', 'session-storage']) })).default([])
    }).optional()
  });
export type SessionReference = Readonly<z.infer<typeof SessionReferenceSchema>>;
const SessionRelocationIntentSchema = z.strictObject({
  transactionId: EntityIdSchema, source: SessionReferenceSchema, destination: SessionReferenceSchema,
  sourceHeader: z.strictObject({ id: z.string().min(1), cwd: z.string().min(1), additionalDirectories: z.array(z.string()).optional(), previousSessionFiles: z.array(z.string()).optional() }),
  environment: z.record(z.string(), z.string()).optional(),
}).refine(intent => intent.source.rootSessionId === intent.destination.rootSessionId
  && intent.source.projectId === intent.destination.projectId && intent.source.agentDirectory === intent.destination.agentDirectory
  && intent.source.agentDirectoryId === intent.destination.agentDirectoryId, 'Relocation must retain its session and Host owner');
export type SessionRelocationIntent = z.infer<typeof SessionRelocationIntentSchema>;
const ChildReferenceSchema = SubagentSchema.extend({ rootSessionId: EntityIdSchema, workspaceId: EntityIdSchema, projectId: EntityIdSchema, sessionFile: z.string().min(1) });
export type ChildReference = Readonly<z.infer<typeof ChildReferenceSchema>>;
const WorktreeDeleteSchema = z.strictObject({
  operationId: EntityIdSchema, nativeSessionId: z.string().min(1), reference: SessionReferenceSchema, children: z.array(ChildReferenceSchema),
  artifacts: z.strictObject({ device: z.string(), inode: z.string() }).nullable(), state: z.enum(['pending', 'completed']),
});
export type WorktreeDeleteIntent = z.infer<typeof WorktreeDeleteSchema>;
const PersistedSchema = z.strictObject({ references: z.record(z.string(), JsonValueSchema), subagents: z.record(z.string(), z.array(ChildReferenceSchema)).default({}), relocations: z.record(z.string(), SessionRelocationIntentSchema).default({}), worktreeDeletes: z.record(z.string(), WorktreeDeleteSchema).default({}) })
  .refine(state => Object.entries(state.relocations).every(([id, intent]) => id === intent.source.rootSessionId), 'Relocation index must retain its root owner')
  .refine(state => Object.entries(state.worktreeDeletes).every(([id, intent]) => id === intent.reference.rootSessionId), 'Delete intent must retain its root owner');
type References = z.infer<typeof PersistedSchema>['references'];
const FileErrorSchema = z.object({ code: z.string() });

export class SessionReferenceError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string) { super(message); }
}

function referenceJson(reference: SessionReference): JsonValue {
  const value: JsonValue = {
    rootSessionId: reference.rootSessionId, projectId: reference.projectId, workspaceId: reference.workspaceId,
    cwd: reference.cwd, agentDirectory: reference.agentDirectory, sessionFile: reference.sessionFile,
    displayPath: reference.displayPath, createdAt: reference.createdAt, updatedAt: reference.updatedAt,
  };
  if (reference.sessionsDirectory !== undefined) value.sessionsDirectory = reference.sessionsDirectory;
  if (reference.agentDirectoryId !== undefined) value.agentDirectoryId = reference.agentDirectoryId;
  if (reference.mcpConfigPath !== undefined) value.mcpConfigPath = reference.mcpConfigPath;
  if (reference.options !== undefined) value.options = reference.options;
  if (reference.parentSessionId !== undefined) value.parentSessionId = reference.parentSessionId;
  if (reference.deletedSpace !== undefined) value.deletedSpace = reference.deletedSpace;
  return value;
}

export class SessionReferences {
  private readonly file: string;
  private values: References = {};
  private subagentValues: Record<string, ChildReference[]> = {};
  private relocations: Record<string, SessionRelocationIntent> = {};
  private worktreeDeletes: Record<string, WorktreeDeleteIntent> = {};
  private readonly records = new Map<string, SessionReference>();
  private readonly childRecords = new Map<string, ChildReference>();
  private readonly malformed = new Set<string>();
  private initialized = false;
  private closed = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly stateDirectory: string) { this.file = join(stateDirectory, 'session-references.json'); }

  async initialize(): Promise<void> {
    this.ensureOpen();
    if (this.initialized) return;
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      const parsed = FileErrorSchema.safeParse(error);
      if (parsed.success && parsed.data.code === 'ENOENT') { this.initialized = true; return; }
      throw new SessionReferenceError(500, 'SESSION_RESTORE_FAILED', 'Unable to read session references');
    }
    let state: z.infer<typeof PersistedSchema>;
    try { state = PersistedSchema.parse(JSON.parse(raw)); }
    catch { throw new SessionReferenceError(500, 'SESSION_RESTORE_FAILED', 'Session reference index is corrupt'); }
    await chmod(this.file, 0o600);
    this.values = state.references;
    this.subagentValues = state.subagents;
    this.relocations = state.relocations;
    this.worktreeDeletes = state.worktreeDeletes;
    for (const rows of Object.values(this.subagentValues)) for (const row of rows) {
      const parsed = ChildReferenceSchema.safeParse(row);
      if (parsed.success) this.childRecords.set(parsed.data.subagentId, parsed.data);
    }
    for (const [id, value] of Object.entries(this.values)) {
      const parsed = SessionReferenceSchema.safeParse(value);
      if (parsed.success && parsed.data.rootSessionId === id) this.records.set(id, parsed.data);
      else this.malformed.add(id);
    }
    this.initialized = true;
  }

  get(sessionId: string): SessionReference | null {
    this.ensureReady();
    if (this.malformed.has(sessionId)) throw new SessionReferenceError(500, 'SESSION_RESTORE_FAILED', 'Session reference is corrupt');
    const reference = this.records.get(sessionId);
    return reference ? structuredClone(reference) : null;
  }
  /**
   * Re-address one root reference after the Agent Service rekeys a live session
   * (a completed `/btw` branch mints a new native session id). The durable
   * reference and its subagent index move in one write, so the retired id can
   * never outlive the transcript it no longer names and a crash cannot leave
   * both ids listed.
   */
  rekey(previousSessionId: string, reference: SessionReference): Promise<void> {
    this.ensureReady();
    const parsed = SessionReferenceSchema.parse(reference);
    if (parsed.rootSessionId === previousSessionId) throw new SessionReferenceError(400, 'INVALID_REQUEST', 'A session rekey must name a new identity');
    return this.enqueue(async () => {
      this.assertWritable(previousSessionId);
      this.assertWritable(parsed.rootSessionId);
      const previous = this.records.get(previousSessionId);
      if (!previous) throw new SessionReferenceError(404, 'SESSION_NOT_FOUND', 'The addressed session reference is not registered');
      if (this.records.has(parsed.rootSessionId)) throw new SessionReferenceError(409, 'INVALID_REQUEST', 'The new session identity is already registered');
      const references = { ...this.values };
      delete references[previousSessionId];
      references[parsed.rootSessionId] = referenceJson(parsed);
      const subagents = { ...this.subagentValues };
      const moved = (subagents[previousSessionId] ?? []).map(row => ChildReferenceSchema.parse({ ...row, rootSessionId: parsed.rootSessionId }));
      delete subagents[previousSessionId];
      if (moved.length > 0) subagents[parsed.rootSessionId] = moved;
      await this.persist(references, this.relocations, subagents);
      this.values = references;
      this.subagentValues = subagents;
      this.records.delete(previousSessionId);
      this.malformed.delete(previousSessionId);
      this.records.set(parsed.rootSessionId, parsed);
      for (const row of moved) this.childRecords.set(row.subagentId, row);
    });
  }

  list(workspaceId?: string) {
    this.ensureReady();
    const items = [...this.records.values()].filter(reference => workspaceId === undefined || reference.workspaceId === workspaceId);
    const errors: { sessionId: string; code: ProblemCode }[] = [];
    for (const sessionId of this.malformed) errors.push({ sessionId, code: 'SESSION_RESTORE_FAILED' });
    return { items: structuredClone(items), errors };
  }
  relocation(sessionId: string): SessionRelocationIntent | null {
    this.ensureReady();
    return this.relocations[sessionId] ?? null;
  }

  beginRelocation(intent: SessionRelocationIntent): Promise<void> {
    this.ensureReady();
    const parsed = SessionRelocationIntentSchema.parse(intent);
    return this.enqueue(async () => {
      this.assertWritable(parsed.source.rootSessionId);
      const id = parsed.source.rootSessionId;
      if (this.relocations[id]) throw new SessionReferenceError(409, 'COMMAND_IN_FLIGHT', 'A session relocation is pending');
      const relocations = { ...this.relocations, [id]: parsed };
      await this.persist(this.values, relocations);
      this.relocations = relocations;
    });
  }

  finishRelocation(sessionId: string, transactionId: string, reference: SessionReference): Promise<void> {
    this.ensureReady();
    const parsed = SessionReferenceSchema.parse(reference);
    return this.enqueue(async () => {
      this.assertWritable(sessionId);
      if (parsed.rootSessionId !== sessionId || this.relocations[sessionId]?.transactionId !== transactionId) {
        throw new SessionReferenceError(409, 'SESSION_RELOCATION_CONFLICT', 'Session relocation ownership has changed');
      }
      const relocations = { ...this.relocations };
      delete relocations[sessionId];
      const references = { ...this.values, [sessionId]: referenceJson(parsed) };
      await this.persist(references, relocations);
      this.values = references;
      this.relocations = relocations;
      this.records.set(sessionId, parsed);
    });
  }
  listSubagents(rootSessionId: string): ChildReference[] {
    this.ensureReady();
    return (this.subagentValues[rootSessionId] ?? []).map(value => ChildReferenceSchema.parse(value));
  }
  putSubagent(value: ChildReference): Promise<void> {
    this.ensureReady();
    const parsed = ChildReferenceSchema.parse(value);
    return this.enqueue(async () => {
      this.assertWritable(parsed.rootSessionId);
      this.assertWritable(parsed.childSessionId);
      this.assertWritable(parsed.subagentId);
      const collision = this.childRecords.get(parsed.subagentId);
      if ((collision && (collision.rootSessionId !== parsed.rootSessionId || collision.childSessionId !== parsed.childSessionId))
        || this.records.has(parsed.childSessionId) || [...this.childRecords.values()].some(row => row.childSessionId === parsed.childSessionId && row.subagentId !== parsed.subagentId)) {
        throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Child identity already belongs to another session');
      }
      const subagents = { ...this.subagentValues, [parsed.rootSessionId]: [...(this.subagentValues[parsed.rootSessionId] ?? []).filter(row => row.subagentId !== parsed.subagentId), parsed] };
      await this.persist(this.values, this.relocations, subagents);
      this.subagentValues = subagents;
      this.childRecords.set(parsed.subagentId, parsed);
    });
  }
  replaceSubagents(rootSessionId: string, values: readonly ChildReference[]): Promise<void> {
    this.ensureReady();
    const parsed = values.map(value => ChildReferenceSchema.parse(value));
    if (parsed.some(value => value.rootSessionId !== rootSessionId)) throw new SessionReferenceError(400, 'INVALID_REQUEST', 'Child references must retain their root owner');
    return this.enqueue(async () => {
      this.assertWritable(rootSessionId);
      for (const child of parsed) { this.assertWritable(child.childSessionId); this.assertWritable(child.subagentId); }
      const ids = new Set<string>();
      const subagentIds = new Set<string>();
      for (const child of parsed) {
        const existing = this.childRecords.get(child.subagentId);
        if (ids.has(child.childSessionId) || subagentIds.has(child.subagentId) || this.records.has(child.childSessionId)
          || (existing && (existing.rootSessionId !== rootSessionId || existing.childSessionId !== child.childSessionId))
          || [...this.childRecords.values()].some(row => row.childSessionId === child.childSessionId && row.subagentId !== child.subagentId)) {
          throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Child identity collides with another session');
        }
        ids.add(child.childSessionId); subagentIds.add(child.subagentId);
      }
      const subagents = { ...this.subagentValues, [rootSessionId]: parsed };
      await this.persist(this.values, this.relocations, subagents);
      for (const previous of this.subagentValues[rootSessionId] ?? []) if (!parsed.some(value => value.subagentId === previous.subagentId)) this.childRecords.delete(previous.subagentId);
      this.subagentValues = subagents;
      for (const value of parsed) this.childRecords.set(value.subagentId, value);
    });
  }
  removeSubagents(rootSessionId: string): Promise<void> {
    this.ensureReady();
    return this.enqueue(async () => {
      this.assertWritable(rootSessionId);
      const subagents = { ...this.subagentValues };
      const removed = subagents[rootSessionId] ?? [];
      delete subagents[rootSessionId];
      await this.persist(this.values, this.relocations, subagents);
      for (const row of removed) this.childRecords.delete(row.subagentId);
      this.subagentValues = subagents;
    });
  }
  child(sessionId: string): ChildReference | null { this.ensureReady(); return this.childRecords.get(sessionId) ?? null; }

  assertWritable(sessionId: string): void {
    if (this.worktreeDeletes[sessionId] || Object.values(this.worktreeDeletes).some(intent => intent.children.some(child => child.childSessionId === sessionId || child.subagentId === sessionId)))
      throw new SessionReferenceError(409, 'COMMAND_IN_FLIGHT', 'A worktree archive delete is pending');
    if (this.malformed.has(sessionId)) throw new SessionReferenceError(500, 'SESSION_RESTORE_FAILED', 'Session reference is corrupt');
    const root = this.records.get(sessionId) ?? this.records.get([...this.childRecords.values()].find(child => child.childSessionId === sessionId || child.subagentId === sessionId)?.rootSessionId ?? '');
    if (root?.deletedSpace) throw new SessionReferenceError(409, 'SESSION_READ_ONLY', 'Deleted-space sessions are permanently read-only');
  }

  installArchive(reference: SessionReference, children: readonly ChildReference[], signal?: AbortSignal): Promise<void> {
    this.ensureReady();
    const parsed = SessionReferenceSchema.parse(reference);
    const rows = children.map(child => ChildReferenceSchema.parse(child));
    if (!parsed.deletedSpace || rows.some(child => child.rootSessionId !== parsed.rootSessionId)) throw new SessionReferenceError(400, 'INVALID_REQUEST', 'Invalid archive ownership');
    if (parsed.parentSessionId === parsed.rootSessionId) throw new SessionReferenceError(400, 'INVALID_REQUEST', 'Archive cannot parent itself');
    return this.enqueue(async () => {
      if (signal?.aborted) throw new SessionReferenceError(503, 'SESSION_RESTORE_FAILED', 'Archive import was cancelled before publication');
      if (parsed.parentSessionId) {
        const parent = this.records.get(parsed.parentSessionId);
        if (!parent?.deletedSpace || parent.deletedSpace.spaceId !== parsed.deletedSpace!.spaceId || parent.workspaceId !== parsed.workspaceId) {
          throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Archive parent is not an imported session from this space');
        }
      }
      const ids = [parsed.rootSessionId, ...rows.map(child => child.childSessionId)];
      for (const id of ids) this.assertWritable(id);
      for (const child of rows) this.assertWritable(child.subagentId);
      if (new Set(ids).size !== ids.length || new Set(rows.map(child => child.subagentId)).size !== rows.length
        || ids.some(id => Object.hasOwn(this.values, id) || [...this.childRecords.values()].some(child => child.childSessionId === id))
        || rows.some(child => this.childRecords.has(child.subagentId))) throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Archive identity collides with an existing session');
      const references = { ...this.values, [parsed.rootSessionId]: referenceJson(parsed) };
      const subagents = { ...this.subagentValues, [parsed.rootSessionId]: rows };
      await this.persist(references, this.relocations, subagents, signal);
      this.values = references; this.subagentValues = subagents;
      this.records.set(parsed.rootSessionId, parsed);
      for (const child of rows) this.childRecords.set(child.subagentId, child);
    });
  }

  removeArchive(sessionId: string): Promise<void> {
    this.ensureReady();
    return this.enqueue(async () => {
      if (!this.records.get(sessionId)?.deletedSpace) throw new SessionReferenceError(400, 'INVALID_REQUEST', 'Not a deleted-space archive');
      const references = { ...this.values }; delete references[sessionId];
      const subagents = { ...this.subagentValues }; delete subagents[sessionId];
      await this.persist(references, this.relocations, subagents);
      for (const child of this.subagentValues[sessionId] ?? []) this.childRecords.delete(child.subagentId);
      this.values = references; this.subagentValues = subagents; this.records.delete(sessionId);
    });
  }
  worktreeDelete(sessionId: string): WorktreeDeleteIntent | null {
    this.ensureReady();
    const intent = this.worktreeDeletes[sessionId];
    return intent ? structuredClone(intent) : null;
  }

  beginWorktreeDelete(intent: WorktreeDeleteIntent): Promise<void> {
    this.ensureReady();
    const parsed = WorktreeDeleteSchema.parse(intent);
    return this.enqueue(async () => {
      const id = parsed.reference.rootSessionId;
      this.assertWritable(id);
      if (parsed.state !== 'pending' || this.relocations[id] || JSON.stringify(this.get(id)) !== JSON.stringify(parsed.reference)
        || JSON.stringify(this.listSubagents(id)) !== JSON.stringify(parsed.children))
        throw new SessionReferenceError(409, 'SESSION_RELOCATION_CONFLICT', 'Native session family changed before delete');
      const intents = { ...this.worktreeDeletes, [id]: parsed };
      await this.persist(this.values, this.relocations, this.subagentValues, undefined, intents);
      this.worktreeDeletes = intents;
    });
  }

  completeWorktreeDelete(sessionId: string, operationId: string): Promise<void> {
    this.ensureReady();
    return this.enqueue(async () => {
      const intent = this.worktreeDeletes[sessionId];
      if (!intent || intent.operationId !== operationId) throw new SessionReferenceError(409, 'SESSION_RELOCATION_CONFLICT', 'Delete intent changed');
      if (intent.state === 'completed') return;
      const references = { ...this.values }; delete references[sessionId];
      const subagents = { ...this.subagentValues }; delete subagents[sessionId];
      const intents = { ...this.worktreeDeletes, [sessionId]: { ...intent, state: 'completed' as const } };
      await this.persist(references, this.relocations, subagents, undefined, intents);
      for (const child of intent.children) this.childRecords.delete(child.subagentId);
      this.values = references; this.subagentValues = subagents; this.records.delete(sessionId); this.worktreeDeletes = intents;
    });
  }

  retireWorktreeDelete(sessionId: string, operationId: string): Promise<void> {
    this.ensureReady();
    return this.enqueue(async () => {
      const intent = this.worktreeDeletes[sessionId];
      if (!intent) return;
      if (intent.operationId !== operationId || intent.state !== 'completed') throw new SessionReferenceError(409, 'SESSION_RELOCATION_CONFLICT', 'Delete intent is not complete');
      const intents = { ...this.worktreeDeletes }; delete intents[sessionId];
      await this.persist(this.values, this.relocations, this.subagentValues, undefined, intents);
      this.worktreeDeletes = intents;
    });
  }


  put(reference: SessionReference): Promise<void> {
    this.ensureReady();
    const parsed = SessionReferenceSchema.parse(reference);
    return this.enqueue(async () => {
      this.assertWritable(parsed.rootSessionId);
      if ([...this.childRecords.values()].some(child => child.childSessionId === parsed.rootSessionId)) throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Session identity belongs to a child');
      const draft = { ...this.values, [parsed.rootSessionId]: referenceJson(parsed) };
      await this.persist(draft);
      this.values = draft;
      this.records.set(parsed.rootSessionId, parsed);
      this.malformed.delete(parsed.rootSessionId);
    });
  }

  remove(sessionId: string): Promise<void> {
    this.ensureReady();
    return this.enqueue(async () => {
      this.assertWritable(sessionId);
      const draft = { ...this.values };
      delete draft[sessionId];
      await this.persist(draft);
      this.values = draft;
      this.records.delete(sessionId);
      this.malformed.delete(sessionId);
    });
  }

  async close(): Promise<void> { this.closed = true; await this.tail; }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => { });
    return result;
  }

  private async persist(references: References, relocations = this.relocations, subagents = this.subagentValues, signal?: AbortSignal, worktreeDeletes = this.worktreeDeletes): Promise<void> {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ references, relocations, subagents, worktreeDeletes }), 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      if (signal?.aborted) throw new SessionReferenceError(503, 'SESSION_RESTORE_FAILED', 'Archive import was cancelled before publication');
      await rename(temporary, this.file);
      if (process.platform !== 'win32') {
        try {
          const directory = await open(this.stateDirectory, 'r');
          try { await directory.sync(); } finally { await directory.close(); }
        } catch (error) {
          // The rename may already be visible; never continue with stale in-memory state.
          this.closed = true;
          throw error;
        }
      }
    } catch {
      try { await unlink(temporary); } catch { /* no committed state changed */ }
      throw new SessionReferenceError(500, 'SESSION_RESTORE_FAILED', 'Unable to persist session references');
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new SessionReferenceError(503, 'SERVICE_UNAVAILABLE', 'Session references are closed');
  }
  private ensureReady(): void {
    this.ensureOpen();
    if (!this.initialized) throw new SessionReferenceError(503, 'SERVICE_UNAVAILABLE', 'Session references are not initialized');
  }
}
