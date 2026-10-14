import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { z } from 'zod';
import { ApprovalReplySchema, QuestionReplySchema, RuntimeSessionSchema, SessionBranchRequestSchema } from '@openchamber/agent-contract';
import type { ApprovalReply, HistoryPageRequest, ProblemCode, QuestionReply, RuntimeSession, SessionBranchRequest } from '@openchamber/agent-contract';
import { WorkerBootstrapSchema } from '../protocol.ts';
import type { WorkerBootstrap, WorkerInteraction, WorkerOperation, WorkerPolicyRequest } from '../protocol.ts';
import { HostSessionBootstrapSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationPrepareSchema, type HostSessionRelocationPrepare } from '../supervisor/host-authorization-protocol.ts';
import { nativePrivateRootContext, rememberPrivateRoots } from '../worker/projection.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError, SessionJournal } from '../projection/journal.ts';
import { InteractionManager, type ApprovalPolicyCommit, type ApprovalPolicyLoad } from '../interaction/manager.ts';
import { WorkerOperationError, WorkerRegistry } from '../supervisor/workers.ts';
import { SessionReferenceError, SessionReferences } from './references.ts';
import type { SessionReference, SessionRelocationIntent } from './references.ts';
import type { NativeApprovalGrant } from '../native-policy-protocol.ts';
import { resolveCanonicalMessage } from '../worker/projection.ts';
type RelocationAdmission = (input: WorkerBootstrap, launch: (bootstrap: WorkerBootstrap) => Promise<RuntimeSession>) => Promise<RuntimeSession>;
type SessionBootstrap = z.infer<typeof HostSessionBootstrapSchema>;
export interface SessionList { items: RuntimeSession[]; errors: { sessionId: string; code: ProblemCode }[]; }
type PromptOperation = Extract<WorkerOperation, { type: 'prompt' }>;
type Opened = { generation: string; sessionFile: string; journal: SessionJournal };
export interface SessionForkResult { sessionId: string; rootSessionId: string; sessionFile: string; sourceSessionId: string; entryId: string | null; mode: 'selected' | 'full' }
export interface NativeEntryResult { entryId: string }
type Entry =
  | { state: 'unloaded'; reference: SessionReference; runtime: RuntimeSession }
  | { state: 'opening'; input: SessionBootstrap; opened?: Opened }
  | { state: 'live'; input: SessionBootstrap; opened: Opened };

export class SessionRegistry {
  private readonly references: SessionReferences;
  private readonly interactions: InteractionManager;
  private readonly entries = new Map<string, Entry>();
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
        projectId: reference.projectId, workspaceId: reference.workspaceId, displayPath: reference.displayPath,
        createdAt: reference.createdAt, updatedAt: reference.updatedAt,
        epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null,
      }) });
    }
  }

  async open(input: SessionBootstrap, replace = false): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
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
    if (!this.references.get(parsed.rootSessionId)) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
    return this.open(parsed);
  }
  async restart(input: z.infer<typeof WorkerBootstrapSchema>): Promise<boolean> {
    const pending = this.openings.get(input.rootSessionId);
    if (pending) await pending;
    const entry = this.entries.get(input.rootSessionId);
    if (!entry) return false;
    const displayPath = entry.state === 'unloaded' ? entry.reference.displayPath : entry.input.displayPath;
    await this.open({ ...input, displayPath }, true);
    return true;
  }
  consumeApprovalGrant(sessionId: string, generation: string, request: Extract<WorkerPolicyRequest, { type: 'tool' }>): NativeApprovalGrant | undefined {
    if (!request.approvalId || !request.toolCallId) return undefined;
    return this.interactions.consumeApprovalGrant(sessionId, generation, request.approvalId, request.toolCallId, request.toolName, request.input);
  }


  runtime(sessionId: string): RuntimeSession {
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
  async fork(sessionId: string, entryId: string | null, mode: 'selected' | 'full'): Promise<SessionForkResult> {
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
      await manager.moveTo(destination.cwd, sessionsDirectory);
      if (manager.getSessionFile() !== intent.destination.sessionFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
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
    this.ensureOpen();
    const request = HostSessionRelocationFinalizeSchema.parse(input);
    if (this.controls.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    const intent = this.references.relocation(sessionId);
    if (!intent || intent.transactionId !== request.transactionId) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT');
    this.controls.add(sessionId);
    try {
      if (request.action === 'rollback') return { session: await this.rollbackRelocation(intent) };
      const entry = this.entries.get(sessionId);
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
      await manager.rollbackMove({ ...snapshot, cwd: intent.source.cwd, sessionDir: dirname(intent.source.sessionFile), sessionFile: intent.source.sessionFile,
        header: { ...snapshot.header, cwd: intent.sourceHeader.cwd, additionalDirectories: intent.sourceHeader.additionalDirectories,
          previousSessionFiles: intent.sourceHeader.previousSessionFiles } });
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

  private setUnloaded(reference: SessionReference): RuntimeSession {
    this.entries.set(reference.rootSessionId, { state: 'unloaded', reference, runtime: RuntimeSessionSchema.parse({
      sessionId: reference.rootSessionId, rootSessionId: reference.rootSessionId, projectId: reference.projectId,
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
    if (this.runtime(sessionId).activeRunId !== runId) throw new WorkerOperationError(404, 'RUN_NOT_FOUND');
    this.interactions.invalidate(sessionId);
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
  approvals(sessionId: string) { this.get(sessionId); return this.interactions.approvals(sessionId); }

  questions(sessionId: string) { this.get(sessionId); return this.interactions.questions(sessionId); }

  async resolveApproval(sessionId: string, approvalId: string, input: ApprovalReply) {
    this.get(sessionId);
    return this.interactions.resolveApproval(sessionId, approvalId, ApprovalReplySchema.parse(input));
  }

  async resolveQuestion(sessionId: string, questionId: string, input: QuestionReply) {
    this.get(sessionId);
    return this.interactions.resolveQuestion(sessionId, questionId, QuestionReplySchema.parse(input));
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
    await this.references.close();
  }

  private async openResolved(input: SessionBootstrap, replace: boolean, reference = this.references.get(input.rootSessionId), persistReference = true): Promise<RuntimeSession> {
    const previous = this.entries.get(input.rootSessionId);
    if (!replace && previous?.state === 'live' && previous.opened.journal.runtime().runtimeStatus !== 'unavailable') return previous.opened.journal.runtime();
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
      await this.workers.start(bootstrap, replace || previous?.state === 'live', policies);
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
