import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonValueSchema, RuntimeSessionSchema, TimestampSchema } from '@openchamber/agent-contract';
import type { JsonValue, ProblemCode } from '@openchamber/agent-contract';
import { z } from 'zod';
import { WorkerBootstrapSchema } from '../protocol.ts';

const SessionReferenceSchema = WorkerBootstrapSchema.omit({ env: true, observationEpoch: true, catalogRevision: true, mcpConfiguration: true, skillSources: true }).required({ sessionFile: true })
  .merge(z.strictObject({}).merge(RuntimeSessionSchema).pick({ displayPath: true }))
  .extend({ createdAt: TimestampSchema, updatedAt: TimestampSchema });
export type SessionReference = Readonly<z.infer<typeof SessionReferenceSchema>>;
const PersistedSchema = z.strictObject({ references: z.record(z.string(), JsonValueSchema) });
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
  return value;
}

export class SessionReferences {
  private readonly file: string;
  private values: References = {};
  private readonly records = new Map<string, SessionReference>();
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
    return this.records.get(sessionId) ?? null;
  }

  list(workspaceId?: string) {
    this.ensureReady();
    const items = [...this.records.values()].filter(reference => workspaceId === undefined || reference.workspaceId === workspaceId);
    const errors: { sessionId: string; code: ProblemCode }[] = [];
    for (const sessionId of this.malformed) errors.push({ sessionId, code: 'SESSION_RESTORE_FAILED' });
    return { items, errors };
  }

  put(reference: SessionReference): Promise<void> {
    this.ensureReady();
    const parsed = SessionReferenceSchema.parse(reference);
    return this.enqueue(async () => {
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
    this.tail = result.catch(() => {});
    return result;
  }

  private async persist(references: References): Promise<void> {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ references }), 'utf8'); }
      finally { await handle.close(); }
      await rename(temporary, this.file);
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
