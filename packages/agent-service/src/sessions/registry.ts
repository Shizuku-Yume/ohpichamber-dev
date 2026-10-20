import { randomUUID } from 'node:crypto';
import { access, readFile, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { z } from 'zod';
import { ApprovalReplySchema, QuestionReplySchema, RuntimeSessionSchema, SessionBranchRequestSchema, SubagentSchema } from '@openchamber/agent-contract';
import type { ApprovalReply, HistoryPageRequest, ProblemCode, QuestionReply, RuntimeSession, SessionBranchRequest, Subagent, UsageQueryResult } from '@openchamber/agent-contract';
import { WorkerBootstrapSchema } from '../protocol.ts';
import type { UsageSessionReference, WorkerBootstrap, WorkerInteraction, WorkerOperation, WorkerPolicyRequest } from '../protocol.ts';
import { HostSessionBootstrapSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationPrepareSchema, type HostSessionRelocationPrepare } from '../supervisor/host-authorization-protocol.ts';
import { nativePrivateRootContext, rememberPrivateRoots, resolveCanonicalMessage, WorkerProjection } from '../worker/projection.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError, SessionJournal } from '../projection/journal.ts';
import { InteractionManager, type ApprovalPolicyCommit, type ApprovalPolicyLoad } from '../interaction/manager.ts';
import { WorkerOperationError, WorkerRegistry } from '../supervisor/workers.ts';
import { assertArchiveActive, exportNativeArchive, importNativeArchive, type ArchiveImportRequest } from './archive.ts';
import { SessionReferenceError, SessionReferences } from './references.ts';
import type { SessionReference, SessionRelocationIntent } from './references.ts';
import type { NativeApprovalGrant } from '../native-policy-protocol.ts';
type SubagentLifecycleInput = { subagentId: string; toolCallId?: string; status: 'started' | 'completed' | 'failed' | 'aborted'; role: string; solutionSpace?: string; sessionFile?: string };
const SessionFileIdentitySchema = z.object({ type: z.literal('session'), id: z.string().min(1), parentSession: z.string().min(1).optional() });
type ChildRecord = Subagent & { rootSessionId: string; workspaceId: string; projectId: string; sessionFile: string };
type RelocationAdmission = (input: WorkerBootstrap, launch: (bootstrap: WorkerBootstrap) => Promise<RuntimeSession>) => Promise<RuntimeSession>;
type SessionBootstrap = z.infer<typeof HostSessionBootstrapSchema>;
export interface SessionList { items: RuntimeSession[]; errors: { sessionId: string; code: ProblemCode }[]; }
type PromptOperation = Extract<WorkerOperation, { type: 'prompt' }>;
type Opened = { generation: string; sessionFile: string; journal: SessionJournal };
export interface SessionForkResult { sessionId: string; rootSessionId: string; sessionFile: string; sourceSessionId: string; entryId: string | null; mode: 'selected' | 'full' }
export interface NativeEntryResult { entryId: string }
export interface NativeArchiveInventory { chats: { id: string; title?: string; parentSessionId?: string }[]; complete: true }
export interface NativeArchiveImported { sessionId: string; session: RuntimeSession; children: Subagent[]; imported: true }
export interface IdleSessionRestartTarget { rootSessionId: string; workerGeneration: string }
export type IdleSessionRestartOutcome =
  | { rootSessionId: string; previousGeneration: string; outcome: 'restarted'; workerGeneration: string }
  | { rootSessionId: string; previousGeneration: string; outcome: 'failed'; error: { status: number; code: ProblemCode } };
type Entry =
  | { state: 'unloaded'; reference: SessionReference; runtime: RuntimeSession }
  | { state: 'opening'; input: SessionBootstrap; opened?: Opened }
  | { state: 'live'; input: SessionBootstrap; opened: Opened };

export class SessionRegistry {
  private readonly references: SessionReferences;
  private readonly interactions: InteractionManager;
  private readonly entries = new Map<string, Entry>();
  private readonly subagents = new Map<string, ChildRecord>();
  private readonly subagentLifecycleTails = new Map<string, Promise<void>>();
  private readonly openings = new Map<string, Promise<RuntimeSession>>();
  private readonly pendingRuns = new Set<string>();
  private readonly deleting = new Set<string>();
  private readonly controls = new Set<string>();
  private closing = false;

  constructor(stateDirectory: string, private readonly workers: WorkerRegistry, policyCommit?: ApprovalPolicyCommit, private readonly policyLoad?: ApprovalPolicyLoad) {
    this.references = new SessionReferences(stateDirectory);
    this.interactions = new InteractionManager(undefined, policyCommit);
  }


  async initialize(): Promise<void> {
    await this.references.initialize();
    for (const reference of this.references.list().items) {
      this.entries.set(reference.rootSessionId, { state: 'unloaded', reference, runtime: RuntimeSessionSchema.parse({
        sessionId: reference.rootSessionId, rootSessionId: reference.rootSessionId,
        ...(reference.parentSessionId ? { parentSessionId: reference.parentSessionId } : {}),
        projectId: reference.projectId, workspaceId: reference.workspaceId, displayPath: reference.displayPath,
        createdAt: reference.createdAt, updatedAt: reference.updatedAt,
        epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null,
      }) });
      for (const child of this.references.listSubagents(reference.rootSessionId)) this.subagents.set(child.subagentId, child);
    }
  }

  async open(input: SessionBootstrap, replace = false): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    this.assertBootstrapWritable(parsed);
    this.assertControlAvailable(parsed.rootSessionId);
    if (this.deleting.has(parsed.rootSessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    const existing = this.entries.get(parsed.rootSessionId);
    const scope = existing?.state === 'unloaded' ? existing.reference : existing?.input;
    if (scope && (scope.projectId !== parsed.projectId || scope.workspaceId !== parsed.workspaceId || scope.cwd !== parsed.cwd || scope.agentDirectory !== parsed.agentDirectory || (scope.agentDirectoryId !== undefined && scope.agentDirectoryId !== parsed.agentDirectoryId) || (parsed.mcpConfigPath !== undefined && scope.mcpConfigPath !== parsed.mcpConfigPath))) {
      throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Session scope cannot be changed');
    }
    const pending = this.openings.get(parsed.rootSessionId);
    if (pending) return pending;
    const operation = this.openResolved(parsed, replace);
    this.openings.set(parsed.rootSessionId, operation);
    void operation.finally(() => { this.openings.delete(parsed.rootSessionId); }).catch(() => {});
    return operation;
  }
  async reopen(input: SessionBootstrap): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    this.assertReopenable(parsed.rootSessionId);
    return this.open(parsed);
  }
  /** Returns the live runtime for an already-open healthy root; callers keep admission for anything else. */
  async liveReopenRuntime(input: SessionBootstrap): Promise<RuntimeSession | undefined> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    this.assertReopenable(parsed.rootSessionId);
    const entry = this.get(parsed.rootSessionId);
    if (entry.state !== 'live' || !this.liveRuntime(entry)) return undefined;
    // A stopping, disconnected or replaced worker still has a live entry until exit; its captured generation is gone.
    if (this.workers.authorizationScope(parsed.rootSessionId)?.workerGeneration !== entry.opened.generation) return undefined;
    // `open` keeps the existing captured-scope comparison and returns the live runtime without restarting it.
    return this.open(parsed);
  }
  private liveRuntime(entry: Entry | undefined): RuntimeSession | undefined {
    if (entry?.state !== 'live') return undefined;
    const runtime = entry.opened.journal.runtime();
    return runtime.runtimeStatus === 'unavailable' ? undefined : runtime;
  }
  private assertReopenable(sessionId: string): void {
    this.assertWritable(sessionId);
    if (!this.references.get(sessionId)) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
  }
  async restart(input: z.infer<typeof WorkerBootstrapSchema>): Promise<boolean> {
    this.assertWritable(input.rootSessionId);
    const pending = this.openings.get(input.rootSessionId);
    if (pending) await pending;
    const entry = this.entries.get(input.rootSessionId);
    if (!entry) return false;
    const displayPath = entry.state === 'unloaded' ? entry.reference.displayPath : entry.input.displayPath;
    await this.open({ ...input, displayPath }, true);
    return true;
  }
  async restartIdleSessions(targets: IdleSessionRestartTarget[], admit: RelocationAdmission): Promise<IdleSessionRestartOutcome[]> {
    this.ensureOpen();
    const reserved: { target: IdleSessionRestartTarget; input: SessionBootstrap; release: () => void; assertIdle: () => Promise<void> }[] = [];
    try {
      // Reserve the entire selection synchronously before the first admission or retirement.
      for (const target of targets) {
        this.assertWritable(target.rootSessionId);
        const entry = this.get(target.rootSessionId);
        if (this.openings.has(target.rootSessionId) || this.subagentLifecycleTails.has(target.rootSessionId))
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
        if (entry.state !== 'live' || entry.opened.generation !== target.workerGeneration)
          throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
        const runtime = entry.opened.journal.runtime();
        if (runtime.activeRunId !== null || this.pendingRuns.has(target.rootSessionId))
          throw new WorkerOperationError(409, 'RUN_ACTIVE');
        if (runtime.runtimeStatus !== 'idle') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
        if (this.interactions.approvals(target.rootSessionId).length > 0 || this.interactions.questions(target.rootSessionId).length > 0)
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
        const bootstrap = this.workers.bootstrap(target.rootSessionId);
        if (!bootstrap || !this.references.get(target.rootSessionId)) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
        const reservation = this.workers.reserveRestart(target.rootSessionId, target.workerGeneration);
        this.controls.add(target.rootSessionId);
        reserved.push({ target, input: { ...entry.input, ...bootstrap, sessionFile: entry.opened.sessionFile }, ...reservation });
      }
      // Snapshot while reservations deny new worker commands; a background Shell is busy too.
      for (const reservation of reserved) await reservation.assertIdle();
      const outcomes: IdleSessionRestartOutcome[] = [];
      for (const { target, input } of reserved) {
        try {
          // Admission builds a strict worker bootstrap; displayPath belongs to the registry/reference only.
          const { displayPath, ...admissionInput } = input;
          await admit(admissionInput, bootstrap => this.openResolved({ ...input, ...bootstrap }, true, undefined, true, target.workerGeneration));
          const current = this.workers.info(target.rootSessionId);
          if (!current || current.state !== 'ready' || current.workerGeneration === target.workerGeneration)
            throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
          outcomes.push({ rootSessionId: target.rootSessionId, previousGeneration: target.workerGeneration,
            outcome: 'restarted', workerGeneration: current.workerGeneration });
        } catch (error) {
          outcomes.push({ rootSessionId: target.rootSessionId, previousGeneration: target.workerGeneration,
            outcome: 'failed', error: error instanceof WorkerOperationError || error instanceof SessionReferenceError
              ? { status: error.status, code: error.code } : { status: 503, code: 'SESSION_RESTORE_FAILED' } });
        }
      }
      return outcomes;
    } finally {
      for (const { target, release } of reserved) {
        this.controls.delete(target.rootSessionId);
        release();
      }
    }
  }

  consumeApprovalGrant(sessionId: string, generation: string, request: Extract<WorkerPolicyRequest, { type: 'tool' }>): NativeApprovalGrant | undefined {
    if (!request.approvalId || !request.toolCallId) return undefined;
    return this.interactions.consumeApprovalGrant(sessionId, generation, request.approvalId, request.toolCallId, request.toolName, request.input);
  }


  runtime(sessionId: string): RuntimeSession {
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    if (child) {
      const root = this.runtime(child.rootSessionId);
      const runtimeStatus = root.runtimeStatus === 'unavailable' ? 'unavailable'
        : child.status === 'running' && root.activeRunId !== null ? root.runtimeStatus : 'idle';
      const activeRunId = runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : root.activeRunId;
      return RuntimeSessionSchema.parse({ ...root, sessionId: child.childSessionId, rootSessionId: child.rootSessionId, parentSessionId: child.parentSessionId, runtimeStatus, activeRunId });
    }
    const entry = this.get(sessionId);
    if (entry.state === 'unloaded') return structuredClone(entry.runtime);
    if (!entry.opened) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return entry.opened.journal.runtime();
  }

  list(workspaceId: string): SessionList {
    const references = this.references.list(workspaceId);
    const items: RuntimeSession[] = [];
    for (const [id, entry] of this.entries) {
      const scope = entry.state === 'unloaded' ? entry.reference : entry.input;
      if (scope.workspaceId !== workspaceId || entry.state === 'opening') continue;
      if (this.controls.has(id) || this.references.relocation(id)) { references.errors.push({ sessionId: id, code: 'COMMAND_IN_FLIGHT' }); continue; }
      items.push(this.runtime(id));
      if (entry.state === 'unloaded' && entry.reference.deletedSpace) {
        for (const child of this.subagents.values()) if (child.rootSessionId === id) items.push(this.runtime(child.childSessionId));
      }
    }
    return { items, errors: references.errors };
  }

  usageReferences(authorized: readonly { workspaceId: string; projectId: string }[], query: UsageQueryResult): UsageSessionReference[] {
    this.ensureOpen();
    const scopes = new Map(authorized.map(scope => [scope.workspaceId, scope.projectId]));
    const result: UsageSessionReference[] = [];
    const inventory = this.references.list();
    if (inventory.errors.length) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    for (const root of inventory.items) {
      if (scopes.get(root.workspaceId) !== root.projectId
        || (query.workspaceId !== undefined && query.workspaceId !== root.workspaceId)
        || (query.projectId !== undefined && query.projectId !== root.projectId)) continue;
      if (this.controls.has(root.rootSessionId) || this.references.relocation(root.rootSessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
      const common = { rootSessionId: root.rootSessionId, workspaceId: root.workspaceId, projectId: root.projectId,
        cwd: root.cwd, agentDirectory: root.agentDirectory, sessionsDirectory: root.sessionsDirectory };
      result.push({ ...common, sessionId: root.rootSessionId, sessionFile: root.sessionFile, parentSessionId: root.parentSessionId });
      for (const child of this.references.listSubagents(root.rootSessionId)) {
        if (child.rootSessionId !== root.rootSessionId || child.workspaceId !== root.workspaceId || child.projectId !== root.projectId)
          throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
        result.push({ ...common, sessionId: child.childSessionId, sessionFile: child.sessionFile, parentSessionId: child.parentSessionId });
      }
    }
    return result;
  }

  async onSubagent(rootSessionId: string, generation: string, input: SubagentLifecycleInput): Promise<void> {
    if (this.deleting.has(rootSessionId) || this.controls.has(rootSessionId) || !this.isCurrentSubagentOwner(rootSessionId, generation)) return;
    const previous = this.subagentLifecycleTails.get(rootSessionId) ?? Promise.resolve();
    const operation = previous.then(() => this.persistSubagent(rootSessionId, generation, input));
    const settled = operation.catch(() => {});
    this.subagentLifecycleTails.set(rootSessionId, settled);
    try { await operation; }
    finally { if (this.subagentLifecycleTails.get(rootSessionId) === settled) this.subagentLifecycleTails.delete(rootSessionId); }
  }

  private isCurrentSubagentOwner(rootSessionId: string, generation: string): boolean {
    const entry = this.entries.get(rootSessionId);
    return !this.closing && entry?.state === 'live' && entry.opened.generation === generation;
  }

  private async readSubagentIdentity(sessionFile: string): Promise<{ childSessionId: string; parentSessionFile?: string } | undefined> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const content = await readFile(sessionFile, 'utf8');
        for (const line of content.split('\n')) {
          if (!line) continue;
          try {
            const parsed = SessionFileIdentitySchema.safeParse(JSON.parse(line));
            if (parsed.success) {
              const identity: { childSessionId: string; parentSessionFile?: string } = { childSessionId: parsed.data.id };
              if (parsed.data.parentSession) identity.parentSessionFile = parsed.data.parentSession;
              return identity;
            }
          } catch {}
        }
      } catch {}
      if (attempt < 9) await new Promise<void>(resolve => setTimeout(resolve, 10));
    }
    return undefined;
  }

  private async persistSubagent(rootSessionId: string, generation: string, input: SubagentLifecycleInput): Promise<void> {
    const entry = this.entries.get(rootSessionId);
    if (!this.isCurrentSubagentOwner(rootSessionId, generation) || !entry || entry.state !== 'live' || !input.sessionFile) return;
    const identity = await this.readSubagentIdentity(input.sessionFile);
    if (!identity || !this.isCurrentSubagentOwner(rootSessionId, generation) || this.entries.get(rootSessionId) !== entry) return;
    const existing = this.subagents.get(input.subagentId);
    let parentSessionId = existing?.parentSessionId;
    if (!parentSessionId) {
      if (!identity.parentSessionFile) return;
      if (identity.parentSessionFile === entry.opened.sessionFile) parentSessionId = rootSessionId;
      else {
        const parent = [...this.subagents.values()].find(record => record.rootSessionId === rootSessionId && record.sessionFile === identity.parentSessionFile);
        if (!parent) return;
        parentSessionId = parent.childSessionId;
      }
    }
    const status: Subagent['status'] = input.status === 'started' ? 'running' : input.status === 'aborted' ? 'failed' : input.status;
    const record: ChildRecord = { subagentId: input.subagentId, parentSessionId, childSessionId: identity.childSessionId, role: input.role, status, rootSessionId, workspaceId: entry.input.workspaceId, projectId: entry.input.projectId, sessionFile: input.sessionFile };
    const toolCallId = input.toolCallId ?? existing?.toolCallId;
    if (toolCallId) record.toolCallId = toolCallId;
    if (input.solutionSpace) record.solutionSpace = input.solutionSpace;
    await this.references.putSubagent(record);
    if (this.isCurrentSubagentOwner(rootSessionId, generation) && this.entries.get(rootSessionId) === entry) this.subagents.set(input.subagentId, record);
  }


  listSubagents(sessionId: string): Subagent[] {
    const root = this.entries.has(sessionId) ? sessionId : [...this.subagents.values()].find(record => record.childSessionId === sessionId)?.rootSessionId;
    if (!root) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND');
    this.get(root);
    return [...this.subagents.values()].filter(record => record.rootSessionId === root && record.parentSessionId === sessionId).map(({ rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...publicRecord }) => SubagentSchema.parse(publicRecord));
  }

  journal(sessionId: string): SessionJournal {
    const entry = this.get(sessionId);
    if (entry.state === 'unloaded' || !entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    return entry.opened.journal;
  }

  assertWritable(sessionId: string): void {
    this.ensureOpen();
    this.references.assertWritable(sessionId);
  }

  assertBootstrapWritable(input: WorkerBootstrap): void {
    this.assertWritable(input.rootSessionId);
    for (const reference of this.references.list().items) {
      if (!reference.deletedSpace) continue;
      for (const candidate of [input.sessionFile, input.sessionsDirectory]) {
        if (!candidate) continue;
        const local = relative(reference.deletedSpace.directory, candidate);
        if (local === '' || (local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local))) {
          throw new SessionReferenceError(409, 'SESSION_READ_ONLY', 'Deleted-space storage cannot be reopened under another identity');
        }
      }
    }
  }

  private coldRoot(sessionId: string): { reference: SessionReference; child?: ChildRecord } {
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const rootId = child?.rootSessionId ?? sessionId;
    const entry = this.entries.get(rootId);
    if (!entry || entry.state !== 'unloaded') throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    return { reference: entry.reference, child };
  }

  private async coldProjection(sessionId: string): Promise<{ manager: SessionManager; projection: WorkerProjection }> {
    const { reference, child } = this.coldRoot(sessionId);
    const file = child?.sessionFile ?? reference.sessionFile;
    const manager = await SessionManager.open(file, reference.sessionsDirectory, undefined, { initialCwd: reference.cwd, throwIfMissing: true, suppressBreadcrumb: true });
    try { return { manager, projection: new WorkerProjection(manager, sessionId, reference.deletedSpace?.privateRoots) }; }
    catch (error) { await manager.close(); throw error; }
  }

  async archiveManifest(): Promise<NativeArchiveInventory> {
    this.ensureOpen();
    const inventory = this.references.list();
    if (inventory.errors.length) throw new SessionReferenceError(503, 'SESSION_RESTORE_FAILED', 'Session inventory is incomplete');
    if (inventory.items.length > 1000) throw new SessionReferenceError(413, 'PAYLOAD_TOO_LARGE', 'Space archive exceeds 1000 chats');
    const byFile = new Map(inventory.items.map(reference => [reference.sessionFile, reference.rootSessionId]));
    const pending = new Map<string, NativeArchiveInventory['chats'][number]>();
    for (const reference of inventory.items) {
      const manager = await SessionManager.open(reference.sessionFile, reference.sessionsDirectory, undefined, { initialCwd: reference.cwd, throwIfMissing: true, suppressBreadcrumb: true });
      try {
        const parentFile = manager.getHeader()?.parentSession;
        const parentSessionId = reference.parentSessionId ?? (parentFile ? byFile.get(parentFile) : undefined);
        const title = manager.getSessionName();
        pending.set(reference.rootSessionId, { id: reference.rootSessionId, ...(title ? { title } : {}), ...(parentSessionId ? { parentSessionId } : {}) });
      } finally { await manager.close(); }
    }
    const chats: NativeArchiveInventory['chats'] = [];
    const emitted = new Set<string>();
    while (pending.size) {
      const before = pending.size;
      for (const [id, chat] of pending) if (!chat.parentSessionId || emitted.has(chat.parentSessionId)) {
        chats.push(chat); emitted.add(id); pending.delete(id);
      }
      if (pending.size === before) throw new SessionReferenceError(400, 'INVALID_REQUEST', 'Archive ancestry is cyclic or incomplete');
    }
    return { chats, complete: true };
  }

  async exportArchive(sessionId: string, signal?: AbortSignal): Promise<Buffer> {
    const transfer = signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000);
    this.ensureOpen();
    const reference = this.references.get(sessionId);
    if (!reference) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND');
    this.assertControlAvailable(sessionId);
    this.controls.add(sessionId);
    try {
      const entry = this.entries.get(sessionId);
      if (entry?.state !== 'unloaded') entry?.opened?.journal.close();
      this.interactions.closeSession(sessionId);
      if (!await this.workers.stop(sessionId)) throw new SessionReferenceError(503, 'SESSION_RESTORE_FAILED', 'Native worker did not flush and stop cleanly');
      await this.subagentLifecycleTails.get(sessionId);
      assertArchiveActive(transfer);
      this.setUnloaded(reference);
      const manager = await SessionManager.open(reference.sessionFile, reference.sessionsDirectory, undefined, { initialCwd: reference.cwd, throwIfMissing: true, suppressBreadcrumb: true });
      let parentSessionId = reference.parentSessionId;
      try {
        const parentFile = manager.getHeader()?.parentSession;
        parentSessionId ??= this.references.list().items.find(value => value.sessionFile === parentFile)?.rootSessionId;
      } finally { await manager.close(); }
      return await exportNativeArchive({ ...reference, ...(parentSessionId ? { parentSessionId } : {}) }, this.references.listSubagents(sessionId), transfer);
    } finally { this.controls.delete(sessionId); }
  }

  async importArchive(input: ArchiveImportRequest, signal?: AbortSignal): Promise<NativeArchiveImported> {
    const transfer = signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000);
    this.ensureOpen();
    this.assertControlAvailable(input.sessionId);
    if (this.entries.has(input.sessionId) || this.workers.bootstrap(input.sessionId) || [...this.subagents.values()].some(child => child.childSessionId === input.sessionId)) {
      throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Archive identity already exists');
    }
    this.controls.add(input.sessionId);
    try {
      const imported = await importNativeArchive(input, transfer);
      try { assertArchiveActive(transfer); await this.references.installArchive(imported.reference, imported.children, transfer); }
      catch (error) { await rm(imported.reference.deletedSpace!.directory, { recursive: true, force: true }); throw error; }
      const session = this.setUnloaded(imported.reference);
      for (const child of imported.children) this.subagents.set(child.subagentId, child);
      return { sessionId: input.sessionId, session, children: imported.children.map(({ rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...publicRecord }) => SubagentSchema.parse(publicRecord)), imported: true };
    } finally { this.controls.delete(input.sessionId); }
  }

  private async coldHistory(request: HistoryPageRequest) {
    const { projection, manager } = await this.coldProjection(request.sessionId);
    try { return projection.history(request); } finally { await manager.close(); }
  }

  async snapshot(sessionId: string) {
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const entry = this.entries.get(child?.rootSessionId ?? sessionId);
    if (entry?.state !== 'unloaded' || !entry.reference.deletedSpace) return this.journal(sessionId).snapshot();
    const { projection, manager } = await this.coldProjection(sessionId);
    try {
      const journal = new SessionJournal({ sessionId, rootSessionId: entry.reference.rootSessionId,
        parentSessionId: child?.parentSessionId, projectId: entry.reference.projectId, workspaceId: entry.reference.workspaceId, displayPath: entry.reference.displayPath }, projection.seed());
      journal.unavailable();
      const snapshot = journal.snapshot();
      const session = this.runtime(sessionId);
      return { ...snapshot, session, cursor: `${session.epoch}:${session.headSequence}` };
    } finally { await manager.close(); }
  }

  private async coldDelete(sessionId: string) {
    const { reference } = this.coldRoot(sessionId);
    if (!reference.deletedSpace || sessionId !== reference.rootSessionId) throw new WorkerOperationError(409, 'SESSION_READ_ONLY');
    const children = this.references.listSubagents(reference.rootSessionId);
    this.deleting.add(sessionId);
    try {
      await rm(reference.deletedSpace.directory, { recursive: true, force: true });
      await this.references.removeArchive(reference.rootSessionId);
      this.entries.delete(reference.rootSessionId);
      for (const child of children) this.subagents.delete(child.subagentId);
      return { sessionId, deletedSessionIds: [reference.rootSessionId, ...children.map(child => child.childSessionId)] };
    } finally { this.deleting.delete(sessionId); }
  }
  async prompt(sessionId: string, operation: PromptOperation) {
    this.ensureOpen();
    this.assertWritable(sessionId);
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
  async fork(sessionId: string, entryId: string | null, mode: 'selected' | 'full'): Promise<SessionForkResult> {
    this.assertWritable(sessionId);
    this.ensureOpen();
    const entry = this.get(sessionId);
    const source = entry.state === 'unloaded' ? entry.reference : entry.input;
    const sourceFile = entry.state === 'live' ? entry.opened.sessionFile : source.sessionFile;
    if (!sourceFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    if (mode === 'selected' && !entryId) throw new WorkerOperationError(400, 'INVALID_REQUEST');
    this.controls.add(sessionId);
    let manager: SessionManager | undefined;
    try {
      if (mode === 'selected') {
        manager = await SessionManager.open(sourceFile, source.sessionsDirectory, undefined, { initialCwd: source.cwd, throwIfMissing: true });
        const privateRoots = nativePrivateRootContext(manager);
        const childFile = manager.createBranchedSession(entryId!, { copyArtifacts: true });
        if (!childFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
        await rememberPrivateRoots(manager, source, privateRoots);
      } else {
        manager = await SessionManager.forkFrom(sourceFile, source.cwd, source.sessionsDirectory, undefined, { copyArtifacts: true });
      }
      const childFile = manager.getSessionFile();
      const childSessionId = manager.getSessionId();
      if (!childFile || !childSessionId) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
      const childInput: SessionBootstrap = {
        rootSessionId: childSessionId, projectId: source.projectId, workspaceId: source.workspaceId,
        cwd: source.cwd, agentDirectory: source.agentDirectory, displayPath: source.displayPath,
        sessionFile: childFile, ...(source.sessionsDirectory ? { sessionsDirectory: source.sessionsDirectory } : {}),
        ...(source.agentDirectoryId ? { agentDirectoryId: source.agentDirectoryId } : {}),
        ...(source.mcpConfigPath ? { mcpConfigPath: source.mcpConfigPath } : {}),
        ...(source.options ? { options: source.options } : {}),
      };
      const runtime = await this.open(childInput);
      return { sessionId: runtime.sessionId, rootSessionId: runtime.rootSessionId, sessionFile: childFile, sourceSessionId: sessionId, entryId, mode };
    } finally {
      try { await manager?.close(); } finally { this.controls.delete(sessionId); }
    }
  }
  async resolveNativeEntry(sessionId: string, messageId: string): Promise<NativeEntryResult> {
    this.ensureOpen();
    const entry = this.get(sessionId);
    const source = entry.state === 'unloaded' ? entry.reference : entry.input;
    const sourceFile = entry.state === 'live' ? entry.opened.sessionFile : source.sessionFile;
    if (!sourceFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    this.controls.add(sessionId);
    let manager: SessionManager | undefined;
    try {
      manager = await SessionManager.open(sourceFile, source.sessionsDirectory, undefined, { initialCwd: source.cwd, throwIfMissing: true });
      const entryId = resolveCanonicalMessage(manager, sessionId, messageId);
      if (entryId) return { entryId };
    } finally { try { await manager?.close(); } finally { this.controls.delete(sessionId); } }
    throw new WorkerOperationError(404, 'RUN_NOT_FOUND');
  }
  async streamingPrompt(sessionId: string, operation: Extract<WorkerOperation, { type: 'steer' | 'follow-up' }>) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    const runtime = this.runtime(sessionId);
    if (runtime.runtimeStatus === 'unavailable') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    if (runtime.activeRunId === null) throw new WorkerOperationError(404, 'RUN_NOT_FOUND');
    const result = await this.workers.request(sessionId, operation);
    if (result.type !== 'steer' && result.type !== 'follow-up') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    if (result.type !== operation.type || result.ack.sessionId !== sessionId) throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    if (result.type === 'steer' && result.ack.runId !== runtime.activeRunId) throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return result.ack;
  }
  async branch(sessionId: string, input: SessionBranchRequest) {
    this.assertWritable(sessionId);
    const request = SessionBranchRequestSchema.parse(input);
    const entry = this.get(sessionId);
    if (entry.state === 'unloaded' || !entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    const opened = entry.opened;
    const journal = opened.journal;
    if (journal.runtime().activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE');
    if (this.openings.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    this.controls.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, { type: 'branch', request });
      if (result.type !== 'branch' || result.result.sessionId !== sessionId) throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      this.interactions.invalidate(sessionId);
      journal.replace(result.seed);
      this.openInteractions(sessionId, opened, entry.input.workspaceId);
      return result.result;
    } finally { this.controls.delete(sessionId); }
  }

  relocation(sessionId: string) {
    this.ensureOpen();
    if (!this.entries.has(sessionId)) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND');
    const intent = this.references.relocation(sessionId);
    return { relocation: intent ? { transactionId: intent.transactionId, sourceWorkspaceId: intent.source.workspaceId,
      destinationWorkspaceId: intent.destination.workspaceId } : null };
  }

  async prepareRelocation(sessionId: string, input: HostSessionRelocationPrepare, admit: RelocationAdmission) {
    this.assertWritable(sessionId);
    const request = HostSessionRelocationPrepareSchema.parse(input);
    const entry = this.get(sessionId);
    const source = this.references.get(sessionId);
    if (!source) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    const destination = request.destination;
    if (destination.rootSessionId !== sessionId || destination.projectId !== source.projectId
      || destination.agentDirectory !== source.agentDirectory || destination.agentDirectoryId !== source.agentDirectoryId
      || request.sourceWorkspaceId !== source.workspaceId) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    if (destination.workspaceId === source.workspaceId || destination.cwd === source.cwd) throw new WorkerOperationError(400, 'INVALID_REQUEST');
    if (this.openings.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    if (this.pendingRuns.has(sessionId) || (entry.state !== 'unloaded' && entry.opened && entry.opened.journal.runtime().activeRunId !== null)) {
      throw new WorkerOperationError(409, 'RUN_ACTIVE');
    }
    this.controls.add(sessionId);
    let manager: SessionManager | undefined;
    let intent: SessionRelocationIntent | undefined;
    try {
      this.interactions.closeSession(sessionId);
      if (entry.state !== 'unloaded') entry.opened?.journal.close();
      await this.workers.stop(sessionId);
      await this.subagentLifecycleTails.get(sessionId);
      manager = await SessionManager.open(source.sessionFile, source.sessionsDirectory, undefined, { initialCwd: source.cwd, throwIfMissing: true });
      await manager.flush();
      await rememberPrivateRoots(manager, source);
      const header = manager.getHeader();
      if (!header) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
      const sessionsDirectory = SessionManager.getDefaultSessionDir(destination.cwd, destination.agentDirectory);
      intent = { transactionId: request.transactionId, source,
        destination: { ...source, workspaceId: destination.workspaceId, cwd: destination.cwd,
          displayPath: destination.displayPath, sessionsDirectory, sessionFile: join(sessionsDirectory, basename(source.sessionFile)),
          mcpConfigPath: join(destination.cwd, '.omp', 'mcp.json'), updatedAt: Date.now() },
        sourceHeader: { id: header.id, cwd: header.cwd, additionalDirectories: header.additionalDirectories, previousSessionFiles: header.previousSessionFiles },
        ...(destination.env ? { environment: destination.env } : undefined),
      };
      await this.references.beginRelocation(intent);
      const sourceArtifacts = manager.getArtifactsDir();
      await manager.moveTo(destination.cwd, sessionsDirectory);
      if (manager.getSessionFile() !== intent.destination.sessionFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
      const destinationArtifacts = manager.getArtifactsDir();
      if (sourceArtifacts && destinationArtifacts) await this.relocateSubagentFiles(sessionId, sourceArtifacts, destinationArtifacts, destination.workspaceId, destination.projectId);
      await manager.close(); manager = undefined;
      this.setUnloaded(source);
      const runtime = await this.launchRelocation(intent, admit);
      return { transactionId: request.transactionId, session: runtime };
    } catch (error) {
      await manager?.close(); manager = undefined;
      if (intent && this.references.relocation(sessionId)) {
        try { await this.rollbackRelocation(intent); }
        catch { throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED'); }
      } else this.setUnloaded(source);
      throw error;
    } finally { await manager?.close(); this.controls.delete(sessionId); }
  }

  async finalizeRelocation(sessionId: string, input: z.infer<typeof HostSessionRelocationFinalizeSchema>, admit: RelocationAdmission) {
    this.assertWritable(sessionId);
    this.ensureOpen();
    const request = HostSessionRelocationFinalizeSchema.parse(input);
    if (this.controls.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    const intent = this.references.relocation(sessionId);
    if (!intent || intent.transactionId !== request.transactionId) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT');
    this.controls.add(sessionId);
    try {
      if (request.action === 'rollback') return { session: await this.rollbackRelocation(intent) };
      const entry = this.entries.get(sessionId);
      if (entry?.state !== 'live' || entry.input.workspaceId !== intent.destination.workspaceId || entry.opened.journal.runtime().runtimeStatus !== 'idle') {
        await this.relocateSubagentFiles(sessionId, intent.source.sessionFile.slice(0, -'.jsonl'.length), intent.destination.sessionFile.slice(0, -'.jsonl'.length), intent.destination.workspaceId, intent.destination.projectId);
      }
      const runtime = entry?.state === 'live' && entry.input.workspaceId === intent.destination.workspaceId
        && entry.opened.journal.runtime().runtimeStatus === 'idle' ? entry.opened.journal.runtime() : await this.launchRelocation(intent, admit);
      await this.references.finishRelocation(sessionId, request.transactionId, { ...intent.destination, updatedAt: runtime.updatedAt });
      return { session: runtime };
    } finally { this.controls.delete(sessionId); }
  }

  private async launchRelocation(intent: SessionRelocationIntent, admit: RelocationAdmission): Promise<RuntimeSession> {
    const entry = this.entries.get(intent.source.rootSessionId);
    if (entry?.state !== 'unloaded') entry?.opened?.journal.close();
    await this.workers.stop(intent.source.rootSessionId);
    this.setUnloaded(intent.destination);
    const { displayPath, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = intent.destination;
    const launchInput: WorkerBootstrap = intent.environment === undefined ? input : { ...input, env: intent.environment };
    return admit(launchInput, next => this.openResolved({ ...next, displayPath }, true, intent.destination, false));
  }

  private async rollbackRelocation(intent: SessionRelocationIntent): Promise<RuntimeSession> {
    const id = intent.source.rootSessionId;
    const entry = this.entries.get(id);
    if (entry?.state !== 'unloaded') entry?.opened?.journal.close();
    this.interactions.closeSession(id);
    await this.workers.stop(id);
    let actual = intent.source;
    let manager: SessionManager | undefined;
    try {
      let location = intent.source;
      try { await access(location.sessionFile); }
      catch (error) {
        if (!z.object({ code: z.literal('ENOENT') }).safeParse(error).success) throw error;
        location = intent.destination;
      }
      manager = await SessionManager.open(location.sessionFile, location.sessionsDirectory, undefined, { initialCwd: location.cwd, throwIfMissing: true });
      if (manager.getHeader()?.id !== intent.sourceHeader.id) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
      const snapshot = manager.captureState();
      const currentArtifacts = manager.getArtifactsDir();
      await manager.rollbackMove({ ...snapshot, cwd: intent.source.cwd, sessionDir: dirname(intent.source.sessionFile), sessionFile: intent.source.sessionFile,
        header: { ...snapshot.header, cwd: intent.sourceHeader.cwd, additionalDirectories: intent.sourceHeader.additionalDirectories,
          previousSessionFiles: intent.sourceHeader.previousSessionFiles } });
      const restoredArtifacts = manager.getArtifactsDir();
      if (currentArtifacts && restoredArtifacts) await this.relocateSubagentFiles(id, currentArtifacts, restoredArtifacts, intent.source.workspaceId, intent.source.projectId);
      actual = { ...intent.source, updatedAt: Date.now() };
      await this.references.finishRelocation(id, intent.transactionId, actual);
    } catch (error) {
      const file = manager?.getSessionFile();
      if (file) actual = { ...intent.source, sessionFile: file, sessionsDirectory: dirname(file) };
      this.setUnloaded(actual);
      throw error;
    } finally { await manager?.close(); }
    return this.setUnloaded(actual);
  }

  private async relocateSubagentFiles(rootSessionId: string, sourceArtifacts: string, destinationArtifacts: string, workspaceId: string, projectId: string): Promise<void> {
    if (sourceArtifacts === destinationArtifacts && this.references.listSubagents(rootSessionId).every(record => record.workspaceId === workspaceId && record.projectId === projectId)) return;
    const relocated = this.references.listSubagents(rootSessionId).map(record => {
      const childPath = relative(sourceArtifacts, record.sessionFile);
      if (childPath === '..' || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) return { ...record, workspaceId, projectId };
      return { ...record, workspaceId, projectId, sessionFile: join(destinationArtifacts, childPath) };
    });
    await this.references.replaceSubagents(rootSessionId, relocated);
    for (const record of relocated) this.subagents.set(record.subagentId, record);
  }

  private setUnloaded(reference: SessionReference): RuntimeSession {
    this.entries.set(reference.rootSessionId, { state: 'unloaded', reference, runtime: RuntimeSessionSchema.parse({
      sessionId: reference.rootSessionId, rootSessionId: reference.rootSessionId, projectId: reference.projectId,
      ...(reference.parentSessionId ? { parentSessionId: reference.parentSessionId } : {}),
      workspaceId: reference.workspaceId, displayPath: reference.displayPath, createdAt: reference.createdAt, updatedAt: reference.updatedAt,
      epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null,
    }) });
    const entry = this.entries.get(reference.rootSessionId);
    if (entry?.state !== 'unloaded') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return structuredClone(entry.runtime);
  }

  private assertControlAvailable(sessionId: string): void {
    if (this.controls.has(sessionId) || this.references.relocation(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
  }


  async abort(sessionId: string, runId: string) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    if (this.runtime(sessionId).activeRunId !== runId) throw new WorkerOperationError(404, 'RUN_NOT_FOUND');
    this.interactions.invalidate(sessionId);
    const result = await this.workers.request(sessionId, { type: 'abort', runId });
    if (result.type !== 'abort') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return result.run;
  }

  async history(request: HistoryPageRequest) {
    this.ensureOpen();
    const child = [...this.subagents.values()].find(record => record.childSessionId === request.sessionId);
    const rootEntry = this.entries.get(child?.rootSessionId ?? request.sessionId);
    if (rootEntry?.state === 'unloaded' && rootEntry.reference.deletedSpace) return this.coldHistory(request);
    if (child) {
      const rootEntry = this.get(child.rootSessionId);
      const manager = await SessionManager.open(child.sessionFile, undefined, undefined, { initialCwd: rootEntry.state === 'unloaded' ? rootEntry.reference.cwd : rootEntry.input.cwd, throwIfMissing: true });
      try { return new WorkerProjection(manager, child.childSessionId).history(request); }
      finally { await manager.close(); }
    }
    this.get(request.sessionId);
    const result = await this.workers.request(request.sessionId, { type: 'history', request });
    if (result.type !== 'history') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return result.history;
  }
  approvals(sessionId: string) { this.get(sessionId); return this.interactions.approvals(sessionId); }

  questions(sessionId: string) { this.get(sessionId); return this.interactions.questions(sessionId); }

  async resolveApproval(sessionId: string, approvalId: string, input: ApprovalReply) {
    this.assertWritable(sessionId);
    this.get(sessionId);
    return this.interactions.resolveApproval(sessionId, approvalId, ApprovalReplySchema.parse(input));
  }

  async resolveQuestion(sessionId: string, questionId: string, input: QuestionReply) {
    this.assertWritable(sessionId);
    this.get(sessionId);
    return this.interactions.resolveQuestion(sessionId, questionId, QuestionReplySchema.parse(input));
  }

  async delete(sessionId: string) {
    this.ensureOpen();
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' && entry.reference.deletedSpace) return this.coldDelete(sessionId);
    this.assertWritable(sessionId);
    const opening = this.openings.get(sessionId);
    if (opening) await opening;
    const journal = this.journal(sessionId);
    if (journal.runtime().activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE');
    this.deleting.add(sessionId);
    try {
      await this.subagentLifecycleTails.get(sessionId);
      const result = await this.workers.request(sessionId, { type: 'delete' });
      if (result.type !== 'delete') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      for (const id of result.deletedSessionIds) this.entries.delete(id);
      for (const [subagentId, record] of this.subagents) if (record.rootSessionId === sessionId || result.deletedSessionIds.includes(record.childSessionId)) this.subagents.delete(subagentId);
      await this.references.removeSubagents(sessionId);
      this.interactions.closeSession(sessionId);
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
    if (entry.opened) this.interactions.invalidate(sessionId, entry.opened.generation);
    if (journal) journal.replace(seed);
    const opened = { generation, sessionFile, journal: journal ?? new SessionJournal({
      sessionId, rootSessionId: sessionId, projectId: entry.input.projectId,
      workspaceId: entry.input.workspaceId, displayPath: entry.input.displayPath,
    }, seed) };
    entry.opened = opened;
    this.openInteractions(sessionId, opened, entry.input.workspaceId);
  }

  private openInteractions(sessionId: string, opened: Opened, workspaceId: string): void {
    this.interactions.openSession(sessionId, opened.journal.runtime().epoch, opened.generation, workspaceId,
      async operation => {
        const result = await this.workers.request(sessionId, operation);
        if (operation.type === 'approval.resolve' && result.type !== 'approval.resolve') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        if (operation.type === 'question.resolve' && result.type !== 'question.resolve') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      }, input => opened.journal.append([input]));
  }

  onEvents(sessionId: string, generation: string, inputs: ProjectionInput[]): void {
    if (this.closing) return;
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    try {
      if (inputs.some(input => input.event.type === 'run.failed' || input.event.type === 'run.cancelled')) this.interactions.invalidate(sessionId, generation);
      entry.opened.journal.append(inputs);
    }
    catch {
      entry.opened.journal.unavailable();
      void this.workers.stop(sessionId).catch(() => {});
    }
  }
  onInteraction(sessionId: string, generation: string, interaction: WorkerInteraction): void {
    if (this.closing) return;
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    try { this.interactions.onRequest(sessionId, generation, interaction); }
    catch {
      this.interactions.invalidate(sessionId, generation);
      entry.opened.journal.unavailable();
      void this.workers.stop(sessionId).catch(() => {});
    }
  }

  onExit(sessionId: string, generation: string): void {
    if (this.closing) return;
    this.interactions.invalidate(sessionId, generation);
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    entry.opened.journal.unavailable();
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const entry of this.entries.values()) if (entry.state !== 'unloaded') {
      this.interactions.closeSession(entry.input.rootSessionId);
      entry.opened?.journal.close();
    }
    await Promise.allSettled(this.openings.values());
    await this.workers.close();
    await this.references.close();
  }

  private async openResolved(input: SessionBootstrap, replace: boolean, reference = this.references.get(input.rootSessionId), persistReference = true, restartGeneration?: string): Promise<RuntimeSession> {
    this.assertBootstrapWritable(input);
    const previous = this.entries.get(input.rootSessionId);
    const previousRuntime = replace ? undefined : this.liveRuntime(previous);
    if (previousRuntime) return previousRuntime;
    const resolved = { ...input };
    if (reference) {
      resolved.sessionFile = reference.sessionFile;
      if (resolved.sessionsDirectory === undefined && reference.sessionsDirectory !== undefined) resolved.sessionsDirectory = reference.sessionsDirectory;
      if (resolved.mcpConfigPath === undefined && reference.mcpConfigPath !== undefined) resolved.mcpConfigPath = reference.mcpConfigPath;
      if (resolved.options === undefined && reference.options !== undefined) resolved.options = reference.options;
    }
    const entry: Extract<Entry, { state: 'opening' }> = { state: 'opening', input: resolved };
    if (previous?.state === 'live') entry.opened = previous.opened;
    this.entries.set(input.rootSessionId, entry);
    let workerStarted = false;
    try {
      const { displayPath, ...bootstrap } = resolved;
      const policies = this.policyLoad ? await this.policyLoad({ sessionId: input.rootSessionId, workspaceId: input.workspaceId }) : [];
      this.interactions.loadPolicies(input.rootSessionId, input.workspaceId, policies);
      await this.workers.start(bootstrap, replace || previous?.state === 'live', policies, restartGeneration);
      workerStarted = true;
      if (!entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
      const runtime = entry.opened.journal.runtime();
      if (persistReference) await this.references.put({
        rootSessionId: bootstrap.rootSessionId, projectId: bootstrap.projectId, workspaceId: bootstrap.workspaceId,
        cwd: bootstrap.cwd, agentDirectory: bootstrap.agentDirectory,
        agentDirectoryId: bootstrap.agentDirectoryId, mcpConfigPath: bootstrap.mcpConfigPath,
        sessionsDirectory: bootstrap.sessionsDirectory, options: bootstrap.options,
        sessionFile: entry.opened.sessionFile, displayPath,
        createdAt: runtime.createdAt, updatedAt: runtime.updatedAt,
      });
      this.entries.set(input.rootSessionId, { state: 'live', input: resolved, opened: entry.opened });
      return runtime;
    } catch (error) {
      // WorkerRegistry cleans up a rejected start; only a successful launch is ours to stop.
      if (workerStarted) await this.workers.stop(input.rootSessionId);
      if (previous?.state === 'unloaded' || (previous?.state === 'live'
        && entry.opened === previous.opened
        && previous.opened.journal.runtime().runtimeStatus !== 'unavailable')) {
        this.entries.set(input.rootSessionId, previous);
      } else if (entry.opened) {
        entry.opened.journal.unavailable();
        this.entries.set(input.rootSessionId, { state: 'live', input: resolved, opened: entry.opened });
      } else this.entries.delete(input.rootSessionId);
      throw error;
    }
  }

  private get(sessionId: string): Entry {
    this.ensureOpen();
    if (this.deleting.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    this.assertControlAvailable(sessionId);
    this.references.get(sessionId);
    const entry = this.entries.get(sessionId);
    if (!entry) throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
    return entry;
  }

  private ensureOpen(): void {
    if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
  }
}
