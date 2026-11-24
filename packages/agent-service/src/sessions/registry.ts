import { randomUUID } from 'node:crypto';
import { access, lstat, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { isEmptySession, listSessionsReadOnly } from '@oh-my-pi/pi-coding-agent/session/session-listing';
import type { SessionInfo } from '@oh-my-pi/pi-coding-agent/session/session-listing';
import { FileSessionStorage } from '@oh-my-pi/pi-coding-agent/session/session-storage';
import { z } from 'zod';
import { ApprovalReplySchema, QuestionReplySchema, RuntimeSessionSchema, SessionBranchRequestSchema, SubagentSchema } from '@openchamber/agent-contract';
import type { ApprovalReply, HistoryPageRequest, ProblemCode, QuestionReply, RuntimeSession, SessionBranchRequest, SessionRecapEntry, SessionSnapshot, SessionToolsCatalog, Subagent, SubagentTranscriptResponse, SubagentTreeCostResponse, UsageQueryResult } from '@openchamber/agent-contract';
import { listSessionRecaps } from '@oh-my-pi/pi-coding-agent/session/session-index';
import { WorkerBootstrapSchema } from '../protocol.ts';
import type { UsageSessionReference, WorkerBootstrap, WorkerInteraction, WorkerOperation, WorkerPolicyRequest } from '../protocol.ts';
import { HostSessionBootstrapSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationPrepareSchema, type HostSessionRelocationPrepare } from '../supervisor/host-authorization-protocol.ts';
import { nativePrivateRootContext, rememberPrivateRoots, resolveCanonicalMessage, WorkerProjection } from '../worker/projection.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError, SessionJournal } from '../projection/journal.ts';
import { InteractionManager, type ApprovalPolicyCommit, type ApprovalPolicyLoad, type ApprovalPolicyLoadRequest, type ApprovalPolicyRecord, type PermissionAuthority } from '../interaction/manager.ts';
import { WorkerOperationError, WorkerRegistry } from '../supervisor/workers.ts';
import { assertArchiveActive, exportNativeArchive, importNativeArchive, type ArchiveImportRequest } from './archive.ts';
import { SessionReferenceError, SessionReferences } from './references.ts';
import type { SessionReference, SessionRelocationIntent } from './references.ts';
import type { NativeApprovalGrant } from '../native-policy-protocol.ts';
import { hasRunningSubagent, queueSubagentLifecycle, readSubagentIdentity, settleSubagentsForExit, subagentKey, type ChildRecord, type Opened, type SubagentLifecycleInput } from './subagent-lifecycle.ts';
type RelocationAdmission = (input: WorkerBootstrap, launch: (bootstrap: WorkerBootstrap) => Promise<RuntimeSession>) => Promise<RuntimeSession>;
type SessionBootstrap = z.infer<typeof HostSessionBootstrapSchema>;
type ColdRoot = { reference: SessionReference; child?: ChildRecord };
type NativeCold = { workspace: SessionWorkspaceScope; info: SessionInfo; identity: NativeSessionIdentity };
type ArchiveChat = NativeArchiveInventory['chats'][number];
export interface SessionList { items: RuntimeSession[]; errors: { sessionId: string; code: ProblemCode }[]; }
export type SessionWorkspaceScope = Readonly<{ workspaceId: string; projectId: string; cwd: string; agentDirectory: string; agentDirectoryId?: string }>;
export type SessionWarmingScope = Readonly<{ rootSessionId: string; workspaceId: string }>;
type PromptOperation = Extract<WorkerOperation, { type: 'prompt' }>;
export interface SessionForkResult { sessionId: string; rootSessionId: string; sessionFile: string; sourceSessionId: string; entryId: string | null; mode: 'selected' | 'full' }
export interface NativeEntryResult { entryId: string }
export interface NativeArchiveInventory { chats: { id: string; title?: string; parentSessionId?: string }[]; complete: true }
export interface NativeArchiveImported { sessionId: string; session: RuntimeSession; children: Subagent[]; imported: true }
export interface IdleSessionRestartTarget { rootSessionId: string; workerGeneration: string }
export type IdleSessionRestartOutcome =
  | { rootSessionId: string; previousGeneration: string; outcome: 'restarted'; workerGeneration: string }
  | { rootSessionId: string; previousGeneration: string; outcome: 'failed'; error: { status: number; code: ProblemCode } };
export type Entry =
  | { state: 'unloaded'; reference: SessionReference; runtime: RuntimeSession }
  | { state: 'opening'; input: SessionBootstrap; opened?: Opened }
  | { state: 'live'; input: SessionBootstrap; opened: Opened };

type NativeSessionIdentity = { rootSessionId: string; parentSessionId?: string };
const nativeTitle = (info: SessionInfo): string | undefined => {
  const title = info.title?.trim();
  return title ? title : undefined;
};
const nativeTime = (value: Date, fallback: number): number => {
  const time = value.getTime();
  return Number.isFinite(time) && time >= 0 ? Math.trunc(time) : fallback;
};
const sameScope = (scope: Pick<SessionReference, 'workspaceId' | 'projectId' | 'cwd' | 'agentDirectory'>, workspace: SessionWorkspaceScope): boolean =>
  scope.workspaceId === workspace.workspaceId && scope.projectId === workspace.projectId
  && resolve(scope.cwd) === resolve(workspace.cwd) && resolve(scope.agentDirectory) === resolve(workspace.agentDirectory);

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
  // Deleted-space sessions are never opened, so the journal that produced their
  // snapshot has to outlive that request for the stream that follows it.
  private readonly coldJournals = new Map<string, SessionJournal>();
  private readonly nativeCold = new Map<string, NativeCold>();
  private readonly coldSnapshotOpenings = new Map<string, Promise<SessionSnapshot>>();
  private closing = false;

  constructor(
    stateDirectory: string,
    private readonly workers: WorkerRegistry,
    policyCommit?: ApprovalPolicyCommit,
    private readonly policyLoad?: ApprovalPolicyLoad,
    permission?: PermissionAuthority,
    private readonly onSessionDeleted?: (sessionIds: readonly string[]) => Promise<void> | void,
    /** Move the owners that live outside the registry (catalog, warming) after a native session rekey. */
    private readonly onSessionRekeyed?: (previousSessionId: string, sessionId: string) => Promise<void> | void,
  ) {
    this.references = new SessionReferences(stateDirectory);
    this.interactions = new InteractionManager(undefined, policyCommit, permission);
  }


  async initialize(): Promise<void> {
    await this.references.initialize();
    for (const reference of this.references.list().items) {
      const runtime = RuntimeSessionSchema.parse({
        sessionId: reference.rootSessionId, rootSessionId: reference.rootSessionId,
        projectId: reference.projectId, workspaceId: reference.workspaceId, displayPath: reference.displayPath,
        createdAt: reference.createdAt, updatedAt: reference.updatedAt,
        epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null, mode: { kind: 'main' },
      });
      if (reference.parentSessionId) runtime.parentSessionId = reference.parentSessionId;
      this.entries.set(reference.rootSessionId, { state: 'unloaded', reference, runtime });
      const children = this.references.listSubagents(reference.rootSessionId);
      let settledAny = false;
      const now = Date.now();
      const settledChildren = children.map(child => {
        if (child.status !== 'running' && child.status !== 'idle') return child;
        settledAny = true;
        const createdAt = child.createdAt ?? now;
        const updatedAt = Math.max(createdAt, now);
        const durationMs = child.durationMs ?? Math.max(0, updatedAt - createdAt);
        return { ...child, status: 'cancelled' as const, createdAt, updatedAt, durationMs };
      });
      if (settledAny && !reference.deletedSpace) {
        await this.references.replaceSubagents(reference.rootSessionId, settledChildren);
      }
      for (const child of settledChildren) this.subagents.set(subagentKey(child.rootSessionId, child.subagentId), child);
    }
  }

  async open(input: SessionBootstrap, replace = false, forkOf?: string, forkTicketId?: string): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    this.assertBootstrapWritable(parsed);
    this.assertControlAvailable(parsed.rootSessionId);
    if (this.deleting.has(parsed.rootSessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is being deleted');
    const existing = this.entries.get(parsed.rootSessionId);
    const scope = existing?.state === 'unloaded' ? existing.reference : existing?.input;
    if (scope && (scope.projectId !== parsed.projectId || scope.workspaceId !== parsed.workspaceId || scope.cwd !== parsed.cwd || scope.agentDirectory !== parsed.agentDirectory || (scope.agentDirectoryId !== undefined && scope.agentDirectoryId !== parsed.agentDirectoryId) || (scope.mcpConfigPath !== undefined && parsed.mcpConfigPath !== undefined && scope.mcpConfigPath !== parsed.mcpConfigPath))) {
      throw new SessionReferenceError(409, 'INVALID_REQUEST', 'Session scope cannot be changed');
    }
    const pending = this.openings.get(parsed.rootSessionId);
    if (pending) return pending;
    const operation = this.openResolved(parsed, replace, undefined, true, undefined, forkOf, forkTicketId);
    this.openings.set(parsed.rootSessionId, operation);
    void operation.finally(() => { this.openings.delete(parsed.rootSessionId); }).catch(() => { });
    return operation;
  }
  openingPromise(rootSessionId: string): Promise<RuntimeSession> | undefined {
    return this.openings.get(rootSessionId);
  }
  async createInitialSession(input: SessionBootstrap, openPromise: () => Promise<RuntimeSession>): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    this.assertBootstrapWritable(parsed);
    this.assertControlAvailable(parsed.rootSessionId);
    if (this.deleting.has(parsed.rootSessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is being deleted');

    const sessionsDir = parsed.sessionsDirectory ?? SessionManager.getDefaultSessionDir(parsed.cwd, parsed.agentDirectory);
    let sessionFile = parsed.sessionFile;
    if (!sessionFile) {
      const diskManager = SessionManager.create(parsed.cwd, sessionsDir);
      await diskManager.ensureOnDisk();
      sessionFile = diskManager.getSessionFile() ?? join(sessionsDir, `${parsed.rootSessionId}.jsonl`);
      await diskManager.close();
    }
    const now = Date.now();
    const seed: ProjectionSeed = {
      createdAt: now,
      updatedAt: now,
      branch: { branchId: 'main', branchVersion: '1', leafMessageId: null },
      turns: [],
      messages: [],
      mode: { kind: 'main' },
    };
    const journal = new SessionJournal({
      sessionId: parsed.rootSessionId, rootSessionId: parsed.rootSessionId, projectId: parsed.projectId,
      workspaceId: parsed.workspaceId, displayPath: parsed.displayPath,
      parentSessionId: parsed.parentSessionId,
    }, seed);
    const opened: Opened = {
      generation: '',
      sessionFile,
      journal,
    };
    const entry: Extract<Entry, { state: 'opening' }> = {
      state: 'opening',
      input: parsed,
      opened,
    };
    this.entries.set(parsed.rootSessionId, entry);
    await this.references.put({
      rootSessionId: parsed.rootSessionId, projectId: parsed.projectId, workspaceId: parsed.workspaceId,
      cwd: parsed.cwd, agentDirectory: parsed.agentDirectory,
      agentDirectoryId: parsed.agentDirectoryId, mcpConfigPath: parsed.mcpConfigPath,
      sessionsDirectory: sessionsDir, options: parsed.options,
      sessionFile, displayPath: parsed.displayPath,
      createdAt: journal.runtime().createdAt, updatedAt: journal.runtime().updatedAt,
      parentSessionId: parsed.parentSessionId,
    });

    const operation = openPromise();
    this.openings.set(parsed.rootSessionId, operation);
    void operation.finally(() => { this.openings.delete(parsed.rootSessionId); }).catch(() => { });

    return journal.runtime();
  }
  async openWorker(input: SessionBootstrap): Promise<RuntimeSession> {
    const parsed = HostSessionBootstrapSchema.parse(input);
    return this.openResolved(parsed, false, undefined, true);
  }
  async reopen(input: SessionBootstrap): Promise<RuntimeSession> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    await this.assertReopenable(parsed.rootSessionId);
    await this.ensureNativeReference(parsed.rootSessionId, parsed);
    return this.open(parsed);
  }
  /** Returns the live runtime for an already-open healthy root; callers keep admission for anything else. */
  async liveReopenRuntime(input: SessionBootstrap): Promise<RuntimeSession | undefined> {
    this.ensureOpen();
    const parsed = HostSessionBootstrapSchema.parse(input);
    await this.assertReopenable(parsed.rootSessionId);
    // Native-only sessions have no entry until promotion; a live check must not
    // turn that expected cold state into SESSION_NOT_FOUND before admission.
    const entry = this.entries.get(parsed.rootSessionId);
    if (entry?.state !== 'live' || !this.liveRuntime(entry)) return undefined;
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
  private async assertReopenable(sessionId: string): Promise<void> {
    this.assertWritable(sessionId);
    if (!this.references.get(sessionId) && !this.nativeCold.has(sessionId)) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session reference is not registered');
  }

  /** Promote a listed native session into a persisted reference before its first worker starts. */
  private async ensureNativeReference(sessionId: string, requested: SessionBootstrap): Promise<void> {
    if (this.references.get(sessionId)) return;
    const native = this.nativeCold.get(sessionId);
    if (!native) return;
    // A child's list identity points at its root; promoting the child under its
    // own id would write an ancestor reference to the child file. The Host
    // reopens a child through its root, so refuse this shape rather than guess.
    if (native.identity.rootSessionId !== sessionId || native.info.parentSessionPath !== undefined)
      throw new WorkerOperationError(409, 'INVALID_REQUEST', 'Native child sessions must reopen through their root');
    if (!sameScope(native.workspace, requested)
      || (requested.agentDirectoryId !== undefined && native.workspace.agentDirectoryId !== undefined
        && requested.agentDirectoryId !== native.workspace.agentDirectoryId))
      throw new WorkerOperationError(403, 'UNAUTHORIZED', 'Native session scope does not match its listed workspace');
    const createdAt = nativeTime(native.info.created, nativeTime(native.info.modified, 0));
    const reference = {
      rootSessionId: native.identity.rootSessionId, projectId: native.workspace.projectId, workspaceId: native.workspace.workspaceId,
      cwd: native.workspace.cwd, agentDirectory: native.workspace.agentDirectory, agentDirectoryId: native.workspace.agentDirectoryId,
      displayPath: 'workspace', sessionFile: native.info.path, sessionsDirectory: dirname(native.info.path), createdAt,
      updatedAt: Math.max(createdAt, nativeTime(native.info.modified, createdAt)),
    } satisfies SessionReference;
    await this.references.put(native.identity.parentSessionId === undefined ? reference : { ...reference, parentSessionId: native.identity.parentSessionId });
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
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'A session open or subagent lifecycle update is already in flight');
        if (entry.state !== 'live' || entry.opened.generation !== target.workerGeneration)
          throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The live worker generation no longer matches the requested one');
        const runtime = entry.opened.journal.runtime();
        if (runtime.activeRunId !== null || this.pendingRuns.has(target.rootSessionId))
          throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session already has an active run');
        if (runtime.runtimeStatus !== 'idle') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The session runtime is not idle');
        if (this.interactions.approvals(target.rootSessionId).length > 0 || this.interactions.questions(target.rootSessionId).length > 0)
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'A pending approval or question blocks this operation');
        const bootstrap = this.workers.bootstrap(target.rootSessionId);
        if (!bootstrap || !this.references.get(target.rootSessionId)) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session references were not captured for this target');
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
          const { displayPath: _displayPath, ...admissionInput } = input;
          await admit(admissionInput, bootstrap => this.openResolved({ ...input, ...bootstrap }, true, undefined, true, target.workerGeneration));
          const current = this.workers.info(target.rootSessionId);
          if (!current || current.state !== 'ready' || current.workerGeneration === target.workerGeneration)
            throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The replacement worker generation is not ready');
          outcomes.push({
            rootSessionId: target.rootSessionId, previousGeneration: target.workerGeneration,
            outcome: 'restarted', workerGeneration: current.workerGeneration
          });
        } catch (error) {
          outcomes.push({
            rootSessionId: target.rootSessionId, previousGeneration: target.workerGeneration,
            outcome: 'failed', error: error instanceof WorkerOperationError || error instanceof SessionReferenceError
              ? { status: error.status, code: error.code } : { status: 503, code: 'SESSION_RESTORE_FAILED' }
          });
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
      this.get(child.rootSessionId);
      const cold = this.coldJournals.get(sessionId);
      if (cold) return cold.runtime();
      const root = this.runtime(child.rootSessionId);
      const runtimeStatus = root.runtimeStatus === 'unavailable' ? 'unavailable'
        : child.status === 'running' && root.activeRunId !== null ? root.runtimeStatus : 'idle';
      const activeRunId = runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : root.activeRunId;
      return RuntimeSessionSchema.parse({ ...root, sessionId: child.childSessionId, rootSessionId: child.rootSessionId, parentSessionId: child.parentSessionId, runtimeStatus, activeRunId });
    }
    const entry = this.get(sessionId);
    const cold = this.coldJournals.get(sessionId);
    if (cold) return cold.runtime();
    if (entry.state === 'unloaded') return structuredClone(entry.runtime);
    if (!entry.opened) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The live session has no opened projection');
    return entry.opened.journal.runtime();
  }
  async list(workspace: SessionWorkspaceScope): Promise<SessionList> {
    const inventory = this.references.list();
    const errors = inventory.errors;
    const items = new Map<string, RuntimeSession>();
    for (const [id, entry] of this.entries) {
      const scope = entry.state === 'unloaded' ? entry.reference : entry.input;
      if (scope.workspaceId !== workspace.workspaceId || entry.state === 'opening') continue;
      if (this.controls.has(id) || this.references.relocation(id)) { errors.push({ sessionId: id, code: 'COMMAND_IN_FLIGHT' }); continue; }
      items.set(id, this.runtime(id));
      if (entry.state === 'unloaded' && entry.reference.deletedSpace) {
        for (const child of this.subagents.values()) if (child.rootSessionId === id) items.set(child.childSessionId, this.runtime(child.childSessionId));
      }
    }
    const native = await this.readNativeSessions(workspace);
    const nativeByPath = new Map(native.map(info => [resolve(info.path), info]));
    const ownerByFile = new Map<string, { id: string; child: boolean }>();
    for (const reference of inventory.items) ownerByFile.set(resolve(reference.sessionFile), { id: reference.rootSessionId, child: false });
    for (const child of this.subagents.values()) ownerByFile.set(resolve(child.sessionFile), { id: child.rootSessionId, child: true });
    for (const info of native) {
      const owner = ownerByFile.get(resolve(info.path));
      if (owner?.child) continue;
      if (owner) {
        const current = items.get(owner.id);
        if (current) items.set(owner.id, this.withNativeFacts(current, info));
        continue;
      }
      if (items.has(info.id)) continue;
      const identity = this.nativeIdentity(info, nativeByPath, ownerByFile);
      this.nativeCold.set(info.id, { workspace, info, identity });
      items.set(info.id, this.nativeRuntime(workspace, info, identity));
    }
    const values = [...items.values()];
    return { items: [...values.filter(session => !session.parentSessionId), ...values.filter(session => session.parentSessionId)], errors };
  }

  async rename(sessionId: string, workspace: SessionWorkspaceScope, title: string): Promise<RuntimeSession> {
    this.ensureOpen();
    const opening = this.openings.get(sessionId);
    if (opening) await opening;
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'opening' || this.controls.has(sessionId) || this.references.relocation(sessionId))
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is opening, controlled, or relocating');
    const scope = entry?.state === 'unloaded' ? entry.reference : entry?.input;
    if (scope && !sameScope(scope, workspace)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The entry scope does not match the listed workspace');
    const reference = this.references.get(sessionId);
    if (reference) this.assertWritable(sessionId);
    if (entry?.state === 'live') {
      const result = await this.workers.request(sessionId, { type: 'session.rename', title });
      if (result.type !== 'session.rename') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested session.rename operation.');
      return RuntimeSessionSchema.parse({ ...entry.opened.journal.runtime(), title: result.title });
    }
    if (reference) {
      const applied = await this.writeNativeTitle(reference.sessionFile, reference.sessionsDirectory, reference.cwd, title);
      const base = entry?.state === 'unloaded' ? structuredClone(entry.runtime) : this.runtime(sessionId);
      return RuntimeSessionSchema.parse({ ...base, title: applied });
    }
    const native = await this.readNativeSessions(workspace);
    const info = native.find(candidate => candidate.id === sessionId);
    if (!info) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND', 'The native session is not listed in its workspace');
    const nativeByPath = new Map(native.map(candidate => [resolve(candidate.path), candidate]));
    const ownerByFile = new Map<string, { id: string; child: boolean }>();
    for (const candidate of this.references.list().items) ownerByFile.set(resolve(candidate.sessionFile), { id: candidate.rootSessionId, child: false });
    for (const child of this.subagents.values()) ownerByFile.set(resolve(child.sessionFile), { id: child.rootSessionId, child: true });
    const applied = await this.writeNativeTitle(info.path, dirname(info.path), info.cwd || workspace.cwd, title);
    return this.nativeRuntime(workspace, info, this.nativeIdentity(info, nativeByPath, ownerByFile), applied);
  }

  private async readNativeSessions(workspace: SessionWorkspaceScope): Promise<SessionInfo[]> {
    const directory = SessionManager.getDefaultSessionDir(workspace.cwd, workspace.agentDirectory);
    try {
      await access(directory);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'OMP session storage is unavailable');
    }
    try {
      return (await listSessionsReadOnly(directory, new FileSessionStorage())).filter(info => !isEmptySession(info));
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'OMP session storage is unavailable');
    }
  }

  private withNativeFacts(current: RuntimeSession, info: SessionInfo): RuntimeSession {
    const createdAt = nativeTime(info.created, current.createdAt);
    const runtime: RuntimeSession = {
      ...current, createdAt,
      updatedAt: Math.max(createdAt, nativeTime(info.modified, current.updatedAt)),
    };
    const title = nativeTitle(info);
    if (title !== undefined) runtime.title = title;
    return RuntimeSessionSchema.parse(runtime);
  }

  private nativeRuntime(workspace: SessionWorkspaceScope, info: SessionInfo, identity: NativeSessionIdentity, title = nativeTitle(info)): RuntimeSession {
    const createdAt = nativeTime(info.created, nativeTime(info.modified, 0));
    const runtime: RuntimeSession = {
      sessionId: info.id, rootSessionId: identity.rootSessionId, projectId: workspace.projectId, workspaceId: workspace.workspaceId,
      displayPath: 'workspace', createdAt, updatedAt: Math.max(createdAt, nativeTime(info.modified, createdAt)),
      epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null, mode: { kind: 'main' },
    };
    if (identity.parentSessionId !== undefined) runtime.parentSessionId = identity.parentSessionId;
    if (title !== undefined) runtime.title = title;
    return RuntimeSessionSchema.parse(runtime);
  }

  private nativeIdentity(info: SessionInfo, nativeByPath: ReadonlyMap<string, SessionInfo>, ownerByFile: ReadonlyMap<string, { id: string; child: boolean }>, seen = new Set<string>()): NativeSessionIdentity {
    if (seen.has(info.id)) return { rootSessionId: info.id };
    seen.add(info.id);
    const parentPath = info.parentSessionPath === undefined ? undefined : resolve(info.parentSessionPath);
    if (parentPath === undefined) return { rootSessionId: info.id };
    const owner = ownerByFile.get(parentPath);
    if (owner && !owner.child) {
      const root = this.entries.get(owner.id);
      const rootSessionId = root?.state === 'unloaded' ? root.runtime.rootSessionId
        : root?.state === 'live' ? root.opened.journal.runtime().rootSessionId : owner.id;
      return { rootSessionId, parentSessionId: owner.id };
    }
    const parent = nativeByPath.get(parentPath);
    if (!parent || parent.id === info.id) return { rootSessionId: info.id };
    const ancestry = this.nativeIdentity(parent, nativeByPath, ownerByFile, seen);
    return { rootSessionId: ancestry.rootSessionId, parentSessionId: parent.id };
  }

  private async writeNativeTitle(sessionFile: string, sessionsDirectory: string | undefined, cwd: string, title: string): Promise<string> {
    const manager = await SessionManager.open(sessionFile, sessionsDirectory, undefined,
      { initialCwd: cwd, throwIfMissing: true, suppressBreadcrumb: true });
    try {
      if (!await manager.setSessionName(title, 'user')) throw new WorkerOperationError(400, 'INVALID_REQUEST', 'Session title is empty');
      await manager.flush();
      const applied = manager.getSessionName();
      if (!applied) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'Session title was not persisted');
      return applied;
    } finally { await manager.close(); }
  }

  /**
   * Transcripts of the Host-authorized roots and their subagents in a workspace or project scope.
   *
   * The scope is an exact file set, not the folders those files sit in: a sessions folder can hold
   * transcripts of workspaces the caller was not authorized for, and a directory prefix would sweep
   * them in. Unlike `usageReferences` this never refuses an active root — a running session must not
   * hide the usage scope it belongs to — and it never refuses a relocating root for the same reason.
   */
  usageSessionFiles(authorized: readonly { workspaceId: string; projectId: string }[], query: UsageQueryResult): { file: string; sessionId: string; role: 'root' | 'subagent' }[] {
    this.ensureOpen();
    const scopes = new Map(authorized.map(scope => [scope.workspaceId, scope.projectId]));
    const files = new Map<string, { sessionId: string; role: 'root' | 'subagent' }>();
    const inventory = this.references.list();
    if (inventory.errors.length) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session inventory reported restore errors');
    for (const root of inventory.items) {
      if (scopes.get(root.workspaceId) !== root.projectId
        || (query.workspaceId !== undefined && query.workspaceId !== root.workspaceId)
        || (query.projectId !== undefined && query.projectId !== root.projectId)) continue;
      files.set(root.sessionFile, { sessionId: root.rootSessionId, role: 'root' });
      for (const child of this.references.listSubagents(root.rootSessionId)) {
        if (child.rootSessionId !== root.rootSessionId || child.workspaceId !== root.workspaceId || child.projectId !== root.projectId)
          throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The subagent reference does not belong to this root session');
        // A fork's child transcript can share a file with its root; the root role wins.
        if (files.get(child.sessionFile)?.role !== 'root') files.set(child.sessionFile, { sessionId: child.childSessionId, role: 'subagent' });
      }
    }
    return [...files].map(([file, entry]) => ({ file, sessionId: entry.sessionId, role: entry.role }));
  }

  usageReferences(authorized: readonly { workspaceId: string; projectId: string }[], query: UsageQueryResult): UsageSessionReference[] {
    this.ensureOpen();
    const scopes = new Map(authorized.map(scope => [scope.workspaceId, scope.projectId]));
    const result: UsageSessionReference[] = [];
    const inventory = this.references.list();
    if (inventory.errors.length) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session inventory reported restore errors');
    for (const root of inventory.items) {
      if (scopes.get(root.workspaceId) !== root.projectId
        || (query.workspaceId !== undefined && query.workspaceId !== root.workspaceId)
        || (query.projectId !== undefined && query.projectId !== root.projectId)) continue;
      if (this.controls.has(root.rootSessionId) || this.references.relocation(root.rootSessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The root session is controlled or relocating');
      const common = {
        rootSessionId: root.rootSessionId, workspaceId: root.workspaceId, projectId: root.projectId,
        cwd: root.cwd, agentDirectory: root.agentDirectory, sessionsDirectory: root.sessionsDirectory
      };
      result.push({ ...common, sessionId: root.rootSessionId, sessionFile: root.sessionFile, parentSessionId: root.parentSessionId });
      for (const child of this.references.listSubagents(root.rootSessionId)) {
        if (child.rootSessionId !== root.rootSessionId || child.workspaceId !== root.workspaceId || child.projectId !== root.projectId)
          throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The subagent reference does not belong to this root session');
        result.push({ ...common, sessionId: child.childSessionId, sessionFile: child.sessionFile, parentSessionId: child.parentSessionId });
      }
    }
    return result;
  }

  async onSubagent(rootSessionId: string, generation: string, input: SubagentLifecycleInput): Promise<void> {
    if (this.deleting.has(rootSessionId) || this.controls.has(rootSessionId)) return;
    return queueSubagentLifecycle(this.subagentDeps(), rootSessionId, generation, input);
  }

  private subagentDeps() {
    return {
      entries: this.entries, subagents: this.subagents, tails: this.subagentLifecycleTails,
      references: this.references, isClosing: () => this.closing,
    };
  }


  listSubagents(sessionId: string): Subagent[] {
    const root = this.entries.has(sessionId) ? sessionId : [...this.subagents.values()].find(record => record.childSessionId === sessionId)?.rootSessionId;
    // A listed native session has no live worker and no persisted child index yet.
    if (!root && this.nativeCold.has(sessionId)) return [];
    if (!root) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND', 'The session has no listed root');
    this.get(root);
    return [...this.subagents.values()].filter(record => record.rootSessionId === root && record.parentSessionId === sessionId).map(({ rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...publicRecord }) => SubagentSchema.parse(publicRecord));
  }

  journal(sessionId: string): SessionJournal {
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const entry = this.get(child?.rootSessionId ?? sessionId);
    const cold = this.coldJournals.get(sessionId);
    if (cold) return cold;
    if (entry.state === 'unloaded' || !entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session is unloaded and has no opened projection');
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

  private coldRoot(sessionId: string): ColdRoot {
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const rootId = child?.rootSessionId ?? sessionId;
    const entry = this.entries.get(rootId);
    if (entry?.state === 'unloaded') return { reference: entry.reference, child };
    const native = this.nativeCold.get(sessionId);
    if (native) {
      const reference = {
        rootSessionId: native.identity.rootSessionId, projectId: native.workspace.projectId, workspaceId: native.workspace.workspaceId,
        cwd: native.workspace.cwd, agentDirectory: native.workspace.agentDirectory, displayPath: 'workspace',
        sessionFile: native.info.path, sessionsDirectory: dirname(native.info.path),
        createdAt: nativeTime(native.info.created, nativeTime(native.info.modified, 0)),
        updatedAt: Math.max(nativeTime(native.info.created, 0), nativeTime(native.info.modified, 0)),
      } satisfies SessionReference;
      return { reference: native.identity.parentSessionId === undefined ? reference : { ...reference, parentSessionId: native.identity.parentSessionId } };
    }
    throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The native session record is missing');
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
        const chat: ArchiveChat = { id: reference.rootSessionId };
        if (title) chat.title = title;
        if (parentSessionId) chat.parentSessionId = parentSessionId;
        pending.set(reference.rootSessionId, chat);
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
    if (!reference) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND', 'The session reference is not registered');
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
      const exportReference = Object.assign({ ...reference }, parentSessionId ? { parentSessionId } : {});
      return await exportNativeArchive(exportReference, this.references.listSubagents(sessionId), transfer);
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
      for (const child of imported.children) this.subagents.set(subagentKey(child.rootSessionId, child.subagentId), child);
      return { sessionId: input.sessionId, session, children: imported.children.map(({ rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...publicRecord }) => SubagentSchema.parse(publicRecord)), imported: true };
    } finally { this.controls.delete(input.sessionId); }
  }

  private async coldHistory(request: HistoryPageRequest) {
    const { projection, manager } = await this.coldProjection(request.sessionId);
    try { return projection.history(request); } finally { await manager.close(); }
  }

  async snapshot(sessionId: string) {
    this.ensureOpen();
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const rootSessionId = child?.rootSessionId ?? sessionId;
    const entry = this.entries.get(rootSessionId);
    if (!entry && this.nativeCold.has(sessionId)) return this.openNativeColdSnapshot(sessionId, rootSessionId, child);
    if (entry?.state !== 'unloaded') return this.journal(sessionId).snapshot();
    // Deleted-space journals outlive this request because the stream that follows must replay from the same epoch.
    if (entry.reference.deletedSpace) {
      const existing = this.coldJournals.get(sessionId);
      if (existing) return existing.snapshot();
      const opening = this.coldSnapshotOpenings.get(sessionId);
      if (opening) return opening;
      const operation = this.openColdSnapshot(sessionId, rootSessionId, entry, child);
      this.coldSnapshotOpenings.set(sessionId, operation);
      void operation.finally(() => { this.coldSnapshotOpenings.delete(sessionId); }).catch(() => { });
      return operation;
    }
    return this.openColdReadSnapshot(sessionId, rootSessionId, entry, child);
  }

  /** Snapshot an unloaded session from its JSONL without starting a worker or retaining a journal. */
  private async openColdReadSnapshot(sessionId: string, rootSessionId: string, entry: Extract<Entry, { state: 'unloaded' }>, child: ChildRecord | undefined) {
    const { projection, manager } = await this.coldProjection(sessionId);
    try {
      if (this.closing || this.deleting.has(rootSessionId) || this.entries.get(rootSessionId) !== entry) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session entry left service while its snapshot was restored');
      const journal = new SessionJournal({
        sessionId, rootSessionId: entry.reference.rootSessionId,
        parentSessionId: child?.parentSessionId ?? entry.reference.parentSessionId, projectId: entry.reference.projectId, workspaceId: entry.reference.workspaceId, displayPath: entry.reference.displayPath
      }, projection.seed());
      journal.unavailable();
      return journal.snapshot();
    } finally { await manager.close(); }
  }

  private async openNativeColdSnapshot(sessionId: string, rootSessionId: string, child: ChildRecord | undefined) {
    const native = this.nativeCold.get(sessionId);
    if (!native) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The native cold session record is missing');
    const { projection, manager } = await this.coldProjection(sessionId);
    try {
      if (this.closing || this.deleting.has(rootSessionId) || this.nativeCold.get(sessionId) !== native) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session entry left service while its native snapshot was restored');
      const journal = new SessionJournal({
        sessionId, rootSessionId: native.identity.rootSessionId,
        parentSessionId: child?.parentSessionId ?? native.identity.parentSessionId, projectId: native.workspace.projectId,
        workspaceId: native.workspace.workspaceId, displayPath: 'workspace'
      }, projection.seed());
      journal.unavailable();
      return journal.snapshot();
    } finally { await manager.close(); }
  }

  private async openColdSnapshot(sessionId: string, rootSessionId: string, entry: Extract<Entry, { state: 'unloaded' }>, child: ChildRecord | undefined) {
    const { projection, manager } = await this.coldProjection(sessionId);
    try {
      // The journal is cached rather than closed here: the stream that follows
      // this snapshot must replay from the same epoch the cursor names.
      if (this.closing || this.deleting.has(rootSessionId) || this.entries.get(rootSessionId) !== entry) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session entry left service while its cold snapshot was restored');
      const journal = new SessionJournal({
        sessionId, rootSessionId: entry.reference.rootSessionId,
        parentSessionId: child?.parentSessionId ?? entry.reference.parentSessionId, projectId: entry.reference.projectId, workspaceId: entry.reference.workspaceId, displayPath: entry.reference.displayPath
      }, projection.seed());
      journal.unavailable();
      this.coldJournals.set(sessionId, journal);
      return journal.snapshot();
    } finally { await manager.close(); }
  }

  private releaseColdJournals(rootSessionId: string, children: ChildRecord[]): void {
    const ids = new Set([rootSessionId, ...children.map(child => child.childSessionId)]);
    for (const id of ids) {
      const journal = this.coldJournals.get(id);
      if (!journal) continue;
      journal.close();
      this.coldJournals.delete(id);
    }
  }

  private async coldDelete(sessionId: string) {
    const { reference } = this.coldRoot(sessionId);
    if (!reference.deletedSpace || sessionId !== reference.rootSessionId) throw new WorkerOperationError(409, 'SESSION_READ_ONLY', 'Only the root of a deleted space may be removed');
    const children = this.references.listSubagents(reference.rootSessionId);
    this.deleting.add(sessionId);
    try {
      await rm(reference.deletedSpace.directory, { recursive: true, force: true });
      await this.references.removeArchive(reference.rootSessionId);
      this.releaseColdJournals(reference.rootSessionId, children);
      this.entries.delete(reference.rootSessionId);
      for (const child of children) this.subagents.delete(subagentKey(child.rootSessionId, child.subagentId));
      const deletedSessionIds = [reference.rootSessionId, ...children.map(child => child.childSessionId)];
      await this.onSessionDeleted?.(deletedSessionIds);
      return { sessionId, deletedSessionIds };
    } finally { this.deleting.delete(sessionId); }
  }
  async deleteWorktreeArchiveFamily(sessionId: string, expected: { operationId: string; projectId: string; workspaceId: string; agentDirectoryId: string; sessionIds: string[] }) {
    this.ensureOpen();
    if (this.deleting.has(sessionId) || this.controls.has(sessionId) || this.openings.has(sessionId) || this.pendingRuns.has(sessionId)
      || this.subagentLifecycleTails.has(sessionId) || this.workers.info(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session has a control, opening, run, subagent lifecycle, or worker in flight');
    const saved = this.references.worktreeDelete(sessionId);
    const reference = saved?.reference ?? this.references.get(sessionId);
    if (!reference) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND', 'The session reference is not registered');
    const children = saved?.children ?? this.references.listSubagents(sessionId);
    const ids = [sessionId, ...children.map(child => child.childSessionId)].sort();
    if ((saved && saved.operationId !== expected.operationId) || reference.deletedSpace || this.references.relocation(sessionId)
      || reference.projectId !== expected.projectId || reference.workspaceId !== expected.workspaceId
      || reference.agentDirectoryId !== expected.agentDirectoryId || new Set(ids).size !== ids.length
      || JSON.stringify(ids) !== JSON.stringify([...expected.sessionIds].sort())
      || children.some(child => child.rootSessionId !== sessionId || child.projectId !== reference.projectId || child.workspaceId !== reference.workspaceId))
      throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The worktree delete request does not match the recorded reference');
    if (saved?.state === 'completed') {
      await this.onSessionDeleted?.(ids);
      return { operationId: expected.operationId, sessionId, deletedSessionIds: ids };
    }
    this.deleting.add(sessionId);
    try {
      return await this.workers.withStoppedRoot(sessionId, async () => {
        try { await access(reference.cwd); throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The workspace directory is still reachable, so the delete is refused'); }
        catch (error) {
          if (error instanceof WorkerOperationError) throw error;
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session directory could not be inspected');
        }
        const entry = this.entries.get(sessionId);
        if (entry?.state !== 'unloaded' && entry?.opened?.journal.runtime().activeRunId !== null && entry?.opened) throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session has an active run');
        const rootFile = reference.sessionFile;
        if (!isAbsolute(rootFile) || !rootFile.endsWith('.jsonl')) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The session file is not an absolute .jsonl path');
        const storage = reference.sessionsDirectory ?? SessionManager.getDefaultSessionDir(reference.cwd, reference.agentDirectory);
        const storagePath = await realpath(storage);
        const storageRelative = relative(storagePath, rootFile);
        if (!storageRelative || storageRelative === '..' || storageRelative.startsWith(`..${sep}`) || isAbsolute(storageRelative))
          throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The session file is outside the session storage directory');
        let rootExists = true;
        try { await access(rootFile); } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session file could not be inspected');
          rootExists = false;
        }
        if (!rootExists && !saved) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The root session file and its record are both gone');
        if (rootExists) {
          if (await realpath(rootFile) !== rootFile) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The session file path is not canonical');
          const rootIdentity = await readSubagentIdentity(rootFile);
          if (!rootIdentity || (saved && rootIdentity.childSessionId !== saved.nativeSessionId)
            || this.references.list().items.some(other => other.rootSessionId !== sessionId && other.sessionFile === rootFile))
            throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The root session identity does not match its recorded reference');
          const paths = new Map<string, string>([[sessionId, rootFile], ...children.map(child => [child.childSessionId, child.sessionFile] as const)]);
          const artifacts = rootFile.slice(0, -6);
          for (const child of children) {
            const childRelative = relative(artifacts, child.sessionFile);
            if (!childRelative || childRelative === '..' || childRelative.startsWith(`..${sep}`) || isAbsolute(childRelative)
              || await realpath(child.sessionFile) !== child.sessionFile) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The subagent session file is outside the artifact directory or not canonical');
            const identity = await readSubagentIdentity(child.sessionFile);
            if (!identity || identity.childSessionId !== child.childSessionId || identity.parentSessionFile !== paths.get(child.parentSessionId))
              throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The subagent identity does not match its recorded reference');
          }
          if (!saved) {
            let artifactIdentity = null;
            try {
              const stat = await lstat(artifacts, { bigint: true });
              if (!stat.isDirectory() || await realpath(artifacts) !== artifacts) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The artifact directory is not canonical');
              artifactIdentity = { device: stat.dev.toString(), inode: stat.ino.toString() };
            } catch (error) {
              if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
            }
            await this.references.beginWorktreeDelete({ operationId: expected.operationId, nativeSessionId: rootIdentity.childSessionId, reference, children, artifacts: artifactIdentity, state: 'pending' });
          }
          const manager = SessionManager.create(reference.cwd, reference.sessionsDirectory);
          try { await manager.dropSession(rootFile); } finally { await manager.close(); }
        }
        // The SDK unlinks the transcript before removing its sibling artifact tree.
        // Resume that cleanup only for the exact directory captured before deletion.
        try {
          const artifactPath = rootFile.slice(0, -6);
          const stat = await lstat(artifactPath, { bigint: true });
          const identity = (saved ?? this.references.worktreeDelete(sessionId))?.artifacts;
          if (!identity || !stat.isDirectory() || stat.dev.toString() !== identity.device || stat.ino.toString() !== identity.inode
            || await realpath(artifactPath) !== artifactPath) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The artifact path does not match its recorded identity');
          await rm(artifactPath, { recursive: true });
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        await this.references.completeWorktreeDelete(sessionId, expected.operationId);
        this.releaseColdJournals(sessionId, children);
        if (entry?.state !== 'unloaded') entry?.opened?.journal.close();
        this.interactions.closeSession(sessionId);
        this.entries.delete(sessionId);
        for (const child of children) this.subagents.delete(subagentKey(child.rootSessionId, child.subagentId));
        await this.onSessionDeleted?.(ids);
        return { operationId: expected.operationId, sessionId, deletedSessionIds: ids };
      });
    } finally { this.deleting.delete(sessionId); }
  }

  async retireWorktreeArchiveDelete(sessionId: string, expected: { operationId: string; projectId: string; workspaceId: string; agentDirectoryId: string; sessionIds: string[] }): Promise<void> {
    const intent = this.references.worktreeDelete(sessionId);
    if (intent && (intent.state !== 'completed' || intent.operationId !== expected.operationId || intent.reference.projectId !== expected.projectId
      || intent.reference.workspaceId !== expected.workspaceId || intent.reference.agentDirectoryId !== expected.agentDirectoryId
      || JSON.stringify([sessionId, ...intent.children.map(child => child.childSessionId)].sort()) !== JSON.stringify([...expected.sessionIds].sort())))
      throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The recorded relocation intent does not match this request');
    await this.references.retireWorktreeDelete(sessionId, expected.operationId);
    await this.onSessionDeleted?.([sessionId, ...expected.sessionIds]);
  }
  async prompt(sessionId: string, operation: PromptOperation) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    // Reserve admission before any runtime check or await. The idle predicate
    // reads this set, so a prompt that starts between an eviction probe and its
    // root-locked recheck is still observable as busy. Once the worker admits
    // the run it emits run.started before the prompt reply, so releasing this
    // reservation exposes the active run to the same predicate.
    if (this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The same session already has a prompt in flight');
    this.pendingRuns.add(sessionId);
    try {
      const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
      const rootSessionId = child?.rootSessionId ?? sessionId;
      const pendingOpening = this.openings.get(rootSessionId);
      if (pendingOpening) await pendingOpening;
      const runtime = this.runtime(sessionId);
      if (runtime.runtimeStatus === 'unavailable') {
        const reason = this.journal(sessionId).reasonUnavailable();
        throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', reason ? `The session runtime is unavailable: ${reason}` : 'The session runtime is unavailable');
      }
      if (runtime.activeRunId !== null || runtime.continuationPending === true) throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session already has an active or continuation run');
      const result = await this.workers.request(sessionId, operation);
      if (result.type !== 'prompt') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested prompt operation.');
      return result.run;
    } finally { this.pendingRuns.delete(sessionId); }
  }
  async fork(sessionId: string, entryId: string | null, mode: 'selected' | 'full', forkTicketId?: string): Promise<SessionForkResult> {
    this.assertWritable(sessionId);
    this.ensureOpen();
    const entry = this.get(sessionId);
    const source = entry.state === 'unloaded' ? entry.reference : entry.input;
    const sourceFile = entry.state === 'live' ? entry.opened.sessionFile : source.sessionFile;
    if (!sourceFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session has no source file to branch');
    if (mode === 'selected' && !entryId) throw new WorkerOperationError(400, 'INVALID_REQUEST', 'A selected branch requires an entry id');
    this.controls.add(sessionId);
    let manager: SessionManager | undefined;
    try {
      if (mode === 'selected') {
        manager = await SessionManager.open(sourceFile, source.sessionsDirectory, undefined, { initialCwd: source.cwd, throwIfMissing: true });
        const privateRoots = nativePrivateRootContext(manager);
        const childFile = manager.createBranchedSession(entryId!, { copyArtifacts: true });
        if (!childFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The branch did not produce a child session file');
        await rememberPrivateRoots(manager, source, privateRoots);
      } else {
        manager = await SessionManager.forkFrom(sourceFile, source.cwd, source.sessionsDirectory, undefined, { copyArtifacts: true });
      }
      const childFile = manager.getSessionFile();
      const childSessionId = manager.getSessionId();
      if (!childFile || !childSessionId) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The branch child session has no file or id');
      const childInput: SessionBootstrap = {
        rootSessionId: childSessionId, projectId: source.projectId, workspaceId: source.workspaceId,
        cwd: source.cwd, agentDirectory: source.agentDirectory, displayPath: source.displayPath,
        sessionFile: childFile,
      };
      if (source.sessionsDirectory) childInput.sessionsDirectory = source.sessionsDirectory;
      if (source.agentDirectoryId) childInput.agentDirectoryId = source.agentDirectoryId;
      if (source.mcpConfigPath) childInput.mcpConfigPath = source.mcpConfigPath;
      if (source.options) childInput.options = source.options;
      if (source.hostTools) childInput.hostTools = source.hostTools;
      const runtime = await this.open(childInput, false, sessionId, forkTicketId);
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
    if (!sourceFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session has no source file to relocate');
    this.controls.add(sessionId);
    let manager: SessionManager | undefined;
    try {
      manager = await SessionManager.open(sourceFile, source.sessionsDirectory, undefined, { initialCwd: source.cwd, throwIfMissing: true });
      const entryId = resolveCanonicalMessage(manager, sessionId, messageId);
      if (entryId) return { entryId };
    } finally { try { await manager?.close(); } finally { this.controls.delete(sessionId); } }
    throw new WorkerOperationError(404, 'RUN_NOT_FOUND', 'The message is not part of the session');
  }
  async streamingPrompt(sessionId: string, operation: Extract<WorkerOperation, { type: 'steer' | 'follow-up' }>) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    const runtime = this.runtime(sessionId);
    if (runtime.runtimeStatus === 'unavailable') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The session runtime is unavailable');
    if (runtime.activeRunId === null) throw new WorkerOperationError(404, 'RUN_NOT_FOUND', 'The session has no active run');
    const result = await this.workers.request(sessionId, operation);
    if (result.type !== 'steer' && result.type !== 'follow-up') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested steer or follow-up operation');
    if (result.type !== operation.type || result.ack.sessionId !== sessionId) throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested operation');
    if (result.type === 'steer' && result.ack.runId !== runtime.activeRunId) throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The steer reply named a different run');
    return result.ack;
  }
  async setMode(sessionId: string, mode: 'main' | 'plan' | 'vibe') {
    this.ensureOpen();
    this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const rootSessionId = child?.rootSessionId ?? sessionId;
    const pendingOpening = this.openings.get(rootSessionId);
    if (pendingOpening) await pendingOpening;
    const runtime = this.runtime(sessionId);
    const isDeferredPlan = mode === 'plan' && runtime.activeRunId !== null;
    const isDisarming = mode === 'main' && runtime.mode?.kind === 'plan' && runtime.mode.status === 'armed';
    if (!isDeferredPlan && !isDisarming && (runtime.activeRunId !== null || runtime.continuationPending === true || this.pendingRuns.has(sessionId))) {
      throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session has an active run');
    }
    this.controls.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, { type: 'mode.set', mode });
      if (result.type !== 'mode.set') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mode.set operation.');
      return result.mode;
    } finally { this.controls.delete(sessionId); }
  }
  async goal(sessionId: string, operation: Extract<WorkerOperation, { type: 'goal' }>) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const rootSessionId = child?.rootSessionId ?? sessionId;
    const pendingOpening = this.openings.get(rootSessionId);
    if (pendingOpening) await pendingOpening;
    const runtime = this.runtime(sessionId);
    if ((operation.op === 'create' || operation.op === 'resume') && (runtime.activeRunId !== null || runtime.continuationPending === true || this.pendingRuns.has(sessionId))) {
      throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The goal needs an idle session');
    }
    this.controls.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, operation);
      if (result.type !== 'goal') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested goal operation.');
      return result;
    } finally { this.controls.delete(sessionId); }
  }
  async branch(sessionId: string, input: SessionBranchRequest) {
    this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    const request = SessionBranchRequestSchema.parse(input);
    const entry = this.get(sessionId);
    if (entry.state === 'unloaded' || !entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session is unloaded and has no opened projection');
    const opened = entry.opened;
    const journal = opened.journal;
    if (journal.runtime().activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session already has an active or pending run');
    if (this.openings.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'A session opening is already in flight');
    this.controls.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, { type: 'branch', request });
      if (result.type !== 'branch' || result.result.sessionId !== sessionId) throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The branch reply did not match the requested branch');
      this.interactions.invalidate(sessionId);
      journal.replace(result.seed);
      this.openInteractions(sessionId, opened, entry.input.workspaceId);
      return result.result;
    } finally { this.controls.delete(sessionId); }
  }

  relocation(sessionId: string) {
    this.ensureOpen();
    if (!this.entries.has(sessionId)) throw new WorkerOperationError(404, 'SESSION_NOT_FOUND', 'The session is not listed');
    const intent = this.references.relocation(sessionId);
    return {
      relocation: intent ? {
        transactionId: intent.transactionId, sourceWorkspaceId: intent.source.workspaceId,
        destinationWorkspaceId: intent.destination.workspaceId
      } : null
    };
  }

  async prepareRelocation(sessionId: string, input: HostSessionRelocationPrepare, admit: RelocationAdmission) {
    this.assertWritable(sessionId);
    const request = HostSessionRelocationPrepareSchema.parse(input);
    const entry = this.get(sessionId);
    const source = this.references.get(sessionId);
    if (!source) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The relocation source reference is missing');
    const destination = request.destination;
    if (destination.rootSessionId !== sessionId || destination.projectId !== source.projectId
      || destination.agentDirectory !== source.agentDirectory || destination.agentDirectoryId !== source.agentDirectoryId
      || request.sourceWorkspaceId !== source.workspaceId) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The relocation destination does not match the captured session scope');
    if (destination.workspaceId === source.workspaceId || destination.cwd === source.cwd) throw new WorkerOperationError(400, 'INVALID_REQUEST', 'The destination workspace and directory must differ from the source');
    if (this.openings.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'A session opening is already in flight');
    if (this.pendingRuns.has(sessionId) || (entry.state !== 'unloaded' && entry.opened && entry.opened.journal.runtime().activeRunId !== null)) {
      throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session has an active run');
    }
    this.workers.assertWorktreeLeaseAllows(destination.cwd);
    this.workers.assertWorktreeLeaseAllows(source.cwd);
    this.controls.add(sessionId);
    let manager: SessionManager | undefined;
    let intent: SessionRelocationIntent | undefined;
    let relocationFence: { release: () => Promise<void> } | undefined;
    try {
      this.interactions.closeSession(sessionId);
      if (entry.state !== 'unloaded') entry.opened?.journal.close();
      await this.workers.stop(sessionId);
      await this.subagentLifecycleTails.get(sessionId);
      relocationFence = await this.workers.acquireRelocationFence(sessionId, source.cwd, destination.cwd);
      manager = await SessionManager.open(source.sessionFile, source.sessionsDirectory, undefined, { initialCwd: source.cwd, throwIfMissing: true });
      await manager.flush();
      await rememberPrivateRoots(manager, source);
      const header = manager.getHeader();
      if (!header) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session header is missing');
      const sessionsDirectory = SessionManager.getDefaultSessionDir(destination.cwd, destination.agentDirectory);
      intent = {
        transactionId: request.transactionId, source,
        destination: {
          ...source, workspaceId: destination.workspaceId, cwd: destination.cwd,
          displayPath: destination.displayPath, sessionsDirectory, sessionFile: join(sessionsDirectory, basename(source.sessionFile)),
          mcpConfigPath: join(destination.cwd, '.omp', 'mcp.json'), updatedAt: Date.now()
        },
        sourceHeader: { id: header.id, cwd: header.cwd, additionalDirectories: header.additionalDirectories, previousSessionFiles: header.previousSessionFiles },
        ...(destination.env ? { environment: destination.env } : undefined),
      };
      await this.references.beginRelocation(intent);
      const sourceArtifacts = manager.getArtifactsDir();
      await manager.moveTo(destination.cwd, sessionsDirectory);
      if (manager.getSessionFile() !== intent.destination.sessionFile) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The moved session file does not match the destination');
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
        catch { throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session relocation could not be completed'); }
      } else this.setUnloaded(source);
      throw error;
    } finally {
      await manager?.close();
      await relocationFence?.release();
      this.controls.delete(sessionId);
    }
  }

  async finalizeRelocation(sessionId: string, input: z.infer<typeof HostSessionRelocationFinalizeSchema>, admit: RelocationAdmission) {
    this.assertWritable(sessionId);
    this.ensureOpen();
    const request = HostSessionRelocationFinalizeSchema.parse(input);
    if (this.controls.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is controlled');
    const intent = this.references.relocation(sessionId);
    if (!intent || intent.transactionId !== request.transactionId) throw new WorkerOperationError(409, 'SESSION_RELOCATION_CONFLICT', 'The relocation intent does not match its transaction');
    this.controls.add(sessionId);
    let relocationFence: { release: () => Promise<void> } | undefined;
    try {
      relocationFence = await this.workers.acquireRelocationFence(sessionId, intent.source.cwd, intent.destination.cwd);
      if (request.action === 'rollback') return { session: await this.rollbackRelocation(intent) };
      const entry = this.entries.get(sessionId);
      if (entry?.state !== 'live' || entry.input.workspaceId !== intent.destination.workspaceId || entry.opened.journal.runtime().runtimeStatus !== 'idle') {
        await this.relocateSubagentFiles(sessionId, intent.source.sessionFile.slice(0, -'.jsonl'.length), intent.destination.sessionFile.slice(0, -'.jsonl'.length), intent.destination.workspaceId, intent.destination.projectId);
      }
      const runtime = entry?.state === 'live' && entry.input.workspaceId === intent.destination.workspaceId
        && entry.opened.journal.runtime().runtimeStatus === 'idle' ? entry.opened.journal.runtime() : await this.launchRelocation(intent, admit);
      await this.references.finishRelocation(sessionId, request.transactionId, { ...intent.destination, updatedAt: runtime.updatedAt });
      return { session: runtime };
    } finally {
      await relocationFence?.release();
      this.controls.delete(sessionId);
    }
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
      if (manager.getHeader()?.id !== intent.sourceHeader.id) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The moved session header does not match the source');
      const snapshot = manager.captureState();
      const currentArtifacts = manager.getArtifactsDir();
      await manager.rollbackMove({
        ...snapshot, cwd: intent.source.cwd, sessionDir: dirname(intent.source.sessionFile), sessionFile: intent.source.sessionFile,
        header: {
          ...snapshot.header, cwd: intent.sourceHeader.cwd, additionalDirectories: intent.sourceHeader.additionalDirectories,
          previousSessionFiles: intent.sourceHeader.previousSessionFiles
        }
      });
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
    for (const record of relocated) this.subagents.set(subagentKey(record.rootSessionId, record.subagentId), record);
  }

  private setUnloaded(reference: SessionReference): RuntimeSession {
    const runtime = RuntimeSessionSchema.parse({
      sessionId: reference.rootSessionId, rootSessionId: reference.rootSessionId, projectId: reference.projectId,
      workspaceId: reference.workspaceId, displayPath: reference.displayPath, createdAt: reference.createdAt, updatedAt: reference.updatedAt,
      epoch: randomUUID(), headSequence: '0', runtimeStatus: 'unavailable', activeRunId: null, mode: { kind: 'main' },
    });
    if (reference.parentSessionId) runtime.parentSessionId = reference.parentSessionId;
    this.entries.set(reference.rootSessionId, { state: 'unloaded', reference, runtime });
    const entry = this.entries.get(reference.rootSessionId);
    if (entry?.state !== 'unloaded') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The session must be unloaded before it can be detached');
    return structuredClone(entry.runtime);
  }

  private assertControlAvailable(sessionId: string): void {
    if (this.controls.has(sessionId) || this.references.relocation(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is controlled or relocating');
  }


  async abort(sessionId: string, runId: string) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    if (this.runtime(sessionId).activeRunId !== runId) throw new WorkerOperationError(404, 'RUN_NOT_FOUND', 'The run is not the active run');
    this.interactions.invalidate(sessionId);
    const result = await this.workers.request(sessionId, { type: 'abort', runId });
    if (result.type !== 'abort') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested abort operation.');
    return result.run;
  }
  async compact(sessionId: string, instructions?: string) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    const runtime = this.runtime(sessionId);
    if (runtime.activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session already has an active or pending run');
    this.controls.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, instructions === undefined ? { type: 'compact' } : { type: 'compact', instructions });
      if (result.type !== 'compact') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested compact operation.');
      return result;
    } finally { this.controls.delete(sessionId); }
  }
  async abortCompaction(sessionId: string) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    const result = await this.workers.request(sessionId, { type: 'compact.abort' });
    if (result.type !== 'compact.abort') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match compaction cancellation.');
    return result;
  }
  async command(sessionId: string, text: string) {
    this.ensureOpen();
    this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    this.controls.add(sessionId);
    try {
      const result = await this.workers.request(sessionId, { type: 'command', text });
      if (result.type !== 'command') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested command operation.');
      return result;
    } finally { this.controls.delete(sessionId); }
  }

  async btwAsk(sessionId: string, question: string, recordId?: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    const result = await this.workers.request(sessionId, recordId === undefined ? { type: 'btw.ask', question } : { type: 'btw.ask', question, recordId });
    if (result.type !== 'btw.ask') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested btw.ask operation.');
    return result;
  }
  async btwCancel(sessionId: string, recordId?: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    const result = await this.workers.request(sessionId, recordId === undefined ? { type: 'btw.cancel' } : { type: 'btw.cancel', recordId });
    if (result.type !== 'btw.cancel') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested btw.cancel operation.');
    return result;
  }
  async btwBranch(sessionId: string, recordId: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    this.assertControlAvailable(sessionId);
    this.controls.add(sessionId);
    let targetSessionId = sessionId;
    try {
      const result = await this.workers.request(sessionId, { type: 'btw.branch', recordId });
      if (result.type !== 'btw.branch') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested btw.branch operation.');
      targetSessionId = result.sessionId ?? sessionId;
      const entry = this.entries.get(sessionId);
      if (entry?.state === 'live' && result.sessionFile) {
        entry.opened.sessionFile = result.sessionFile;
        // The branch seed re-mints the journal epoch, so it has to land before
        // the owners below re-register: a request minted against the retired
        // epoch cannot be published by a snapshot taken under the new one, and
        // `GET /snapshot` answered 503 on the pending-request contract for every
        // poll between a Promote to Branch and the next request's resolution.
        if (result.seed) entry.opened.journal.replace(result.seed);
        if (targetSessionId !== sessionId) {
          // The native branch rekeys the session in place. Every owner keyed by
          // the root id has to move with it: the worker registration, the live
          // entry and its interaction callbacks, the journal, the durable
          // reference and its subagent index, any cold state, and the parent id
          // the branch records. A stale id made the stateful owners answer
          // "Session scope was not found" while the Host still bound the old
          // identity, so the composer lost its chat after a Promote to Branch.
          const previousReference = this.references.get(sessionId);
          this.rekeyKeyedState(sessionId, targetSessionId, entry);
          this.workers.rekey(sessionId, targetSessionId);
          if (previousReference) {
            // The branch is its own root: the identity moves to the minted
            // native session, so the retired id names no session left to be a
            // parent. `?? sessionId` recorded it anyway, and every parent-chain
            // reader (the archive manifest, the roster's root/child split, the
            // runtime a restart restores) then addressed an id the same write
            // retired. A root has no parent; a pre-branch parent that still
            // exists stays, because the branch continues that lineage.
            await this.references.rekey(sessionId, {
              ...previousReference,
              rootSessionId: targetSessionId,
              sessionFile: result.sessionFile,
            });
          }
          await this.onSessionRekeyed?.(sessionId, targetSessionId);
        }
        if (result.seed && targetSessionId === sessionId) {
          // A branch seed re-mints the journal epoch, so the interaction owner
          // must follow it exactly as a branch selection does. Without this the
          // manager kept the retired epoch and every request minted after the
          // branch (a plan review, a question) was published under an epoch the
          // snapshot does not carry; `GET /snapshot` then answered 503 on the
          // pending-request contract until that request was resolved.
          this.openInteractions(targetSessionId, entry.opened, entry.input.workspaceId);
        }
      }
      // The projection seed is already applied to the journal above; the public
      // control ack is strict and carries no seed, so returning it turned a
      // completed branch into a 503 the client could not act on.
      const { seed: _seed, ...ack } = result;
      return ack;
    } finally {
      this.controls.delete(sessionId);
      this.controls.delete(targetSessionId);
    }
  }
  async steerSubagent(sessionId: string, subagentId: string, message: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    const subagent = [...this.subagents.values()].find(record => record.subagentId === subagentId && (record.rootSessionId === sessionId || record.parentSessionId === sessionId || record.childSessionId === sessionId));
    if (subagent && subagent.rootSessionId !== sessionId && subagent.parentSessionId !== sessionId) {
      throw new WorkerOperationError(404, 'SESSION_NOT_FOUND', 'The subagent belongs to a different session');
    }
    const result = await this.workers.request(sessionId, { type: 'subagent.steer', subagentId, message });
    if (result.type !== 'subagent.steer') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested subagent.steer operation.');
    return result;
  }
  async cancelSubagent(sessionId: string, subagentId: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    const subagent = [...this.subagents.values()].find(record => record.subagentId === subagentId && (record.rootSessionId === sessionId || record.parentSessionId === sessionId || record.childSessionId === sessionId));
    if (subagent && subagent.rootSessionId !== sessionId && subagent.parentSessionId !== sessionId) {
      return { type: 'subagent.cancel' as const, subagentId, cancelled: false };
    }
    const result = await this.workers.request(sessionId, { type: 'subagent.cancel', subagentId });
    if (result.type !== 'subagent.cancel') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested subagent.cancel operation.');
    return result;
  }
  /**
   * Agent Hub reads. All four go through the owning session's worker, so the
   * answer is scoped to that worker's artifact tree rather than the
   * process-global agent registry.
   */
  private persistedHubSubagents(sessionId: string): Subagent[] {
    const root = this.entries.has(sessionId) ? sessionId : [...this.subagents.values()].find(record => record.childSessionId === sessionId)?.rootSessionId;
    return [...this.subagents.values()]
      .filter(record => record.rootSessionId === root && record.parentSessionId === sessionId)
      .map(({ rootSessionId: _root, workspaceId: _workspace, projectId: _project, sessionFile: _file, ...publicRecord }) => {
        if (publicRecord.status !== 'running' && publicRecord.status !== 'idle') {
          return SubagentSchema.parse(publicRecord);
        }
        const now = Date.now();
        const createdAt = publicRecord.createdAt ?? now;
        const updatedAt = publicRecord.updatedAt !== undefined ? Math.max(createdAt, publicRecord.updatedAt) : now;
        const durationMs = publicRecord.durationMs ?? Math.max(0, updatedAt - createdAt);
        return SubagentSchema.parse({ ...publicRecord, status: 'cancelled' as const, createdAt, updatedAt, durationMs });
      });
  }
  async listHubSubagents(sessionId: string): Promise<Subagent[]> {
    this.ensureOpen(); this.get(sessionId);
    const persisted = this.persistedHubSubagents(sessionId);
    try {
      const result = await this.workers.request(sessionId, { type: 'subagents.list' }, undefined, 10_000);
      if (result.type !== 'subagents.list') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested subagents.list operation.');
      // Re-attached workers start with an empty AgentRegistry; merge the
      // persisted roster underneath disk-revived entries (`live.persisted === true`)
      // so pre-restart settled rows stay visible and keep their metadata, while
      // fresh live runs never inherit stale metrics or childSessionId.
      const merged = new Map<string, Subagent>(persisted.map(item => [item.subagentId, item]));
      for (const live of result.subagents) {
        const prior = merged.get(live.subagentId);
        if (prior !== undefined && live.persisted === true) {
          const keepPriorStatus = prior.status === 'completed' || prior.status === 'failed' || prior.status === 'cancelled';
          merged.set(live.subagentId, SubagentSchema.parse({
            ...prior,
            ...live,
            status: keepPriorStatus ? prior.status : live.status,
            childSessionId: live.childSessionId ?? prior.childSessionId,
            name: live.name ?? prior.name,
            role: prior.role || live.role,
            solutionSpace: live.solutionSpace ?? prior.solutionSpace,
            description: live.description ?? prior.description,
            toolCallId: live.toolCallId ?? prior.toolCallId,
            activeToolCallId: live.activeToolCallId ?? prior.activeToolCallId,
          }));
        } else {
          merged.set(live.subagentId, live);
        }
      }
      return [...merged.values()];
    } catch (error) {
      if (!(error instanceof WorkerOperationError) || (error.status !== 503 && error.status !== 409)) throw error;
      return persisted;
    }
  }
  async subagentTranscript(sessionId: string, subagentId: string): Promise<SubagentTranscriptResponse> {
    this.ensureOpen(); this.get(sessionId);
    const result = await this.workers.request(sessionId, { type: 'subagents.transcript', subagentId });
    if (result.type !== 'subagents.transcript') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested subagents.transcript operation.');
    return result.transcript;
  }
  async subagentTreeCost(sessionId: string): Promise<SubagentTreeCostResponse> {
    this.ensureOpen(); this.get(sessionId);
    const result = await this.workers.request(sessionId, { type: 'subagents.tree-cost' });
    if (result.type !== 'subagents.tree-cost') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested subagents.tree-cost operation.');
    return result.cost;
  }
  async tools(sessionId: string): Promise<SessionToolsCatalog> {
    this.ensureOpen();
    this.get(sessionId);
    const result = await this.workers.request(sessionId, { type: 'tools.catalog' });
    if (result.type !== 'tools.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested tools.catalog operation.');
    return result.catalog;
  }
  async reviveSubagent(sessionId: string, subagentId: string, message?: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    const result = await this.workers.request(sessionId, message === undefined
      ? { type: 'subagent.revive', subagentId }
      : { type: 'subagent.revive', subagentId, message });
    if (result.type !== 'subagent.revive') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested subagent.revive operation.');
    return result;
  }
  /** Journaled idle recaps for one session, newest first, in epoch milliseconds. */
  async listRecaps(sessionId: string): Promise<SessionRecapEntry[]> {
    this.warmingScope(sessionId);
    const native = this.nativeCold.get(sessionId);
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const reference = this.references.get(child?.rootSessionId ?? sessionId);
    const sessionFile = child?.sessionFile ?? reference?.sessionFile ?? native?.info.path;
    const cwd = reference?.cwd ?? native?.workspace.cwd;
    const sessionIds = [sessionId];
    if (sessionFile) {
      const match = /_([a-zA-Z0-9_-]+)\.jsonl$/.exec(sessionFile);
      if (match && match[1] && !sessionIds.includes(match[1])) sessionIds.push(match[1]);
    }
    const rows = listSessionRecaps({ sessionIds, ...(cwd ? { cwd } : {}), limit: 100 });
    return rows.map(row => ({ sessionId, cwd: row.cwd, recap: row.recap, createdAt: row.createdAt * 1000 }));
  }
  async stopLoop(sessionId: string) {
    this.ensureOpen(); this.assertWritable(sessionId);
    const result = await this.workers.request(sessionId, { type: 'loop.stop' });
    if (result.type !== 'loop.stop') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested loop.stop operation.');
    return result;
  }
  async history(request: HistoryPageRequest) {
    this.ensureOpen();
    const child = [...this.subagents.values()].find(record => record.childSessionId === request.sessionId);
    const rootEntry = this.entries.get(child?.rootSessionId ?? request.sessionId);
    if (rootEntry?.state === 'unloaded' || (!rootEntry && this.nativeCold.has(request.sessionId))) return this.coldHistory(request);
    if (child) {
      const rootEntry = this.get(child.rootSessionId);
      const manager = await SessionManager.open(child.sessionFile, undefined, undefined, { initialCwd: rootEntry.state === 'unloaded' ? rootEntry.reference.cwd : rootEntry.input.cwd, throwIfMissing: true });
      try { return new WorkerProjection(manager, child.childSessionId).history(request); }
      finally { await manager.close(); }
    }
    this.get(request.sessionId);
    const result = await this.workers.request(request.sessionId, { type: 'history', request });
    if (result.type !== 'history') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested history operation.');
    return result.history;
  }
  /**
   * True when stopping this root's worker loses no turn, pending request,
   * subagent write or in-flight session operation. The WorkerRegistry owns the
   * process-level checks; this half owns session state.
   */
  isIdleForEviction(sessionId: string): boolean {
    if (this.closing || this.deleting.has(sessionId) || this.openings.has(sessionId)
      || this.controls.has(sessionId) || this.pendingRuns.has(sessionId)
      || this.subagentLifecycleTails.has(sessionId)
      || hasRunningSubagent(this.subagents, sessionId)) return false;
    const entry = this.entries.get(sessionId);
    if (!entry || entry.state === 'unloaded') return true;
    if (entry.state === 'opening') return false;
    const runtime = entry.opened.journal.runtime();
    if (runtime.runtimeStatus !== 'idle' || runtime.activeRunId !== null) return false;
    return this.interactions.approvals(sessionId).length === 0 && this.interactions.questions(sessionId).length === 0;
  }

  warmingScope(sessionId: string): SessionWarmingScope {
    this.ensureOpen();
    const child = [...this.subagents.values()].find(record => record.childSessionId === sessionId);
    const rootSessionId = child?.rootSessionId ?? sessionId;
    if (this.deleting.has(sessionId) || this.deleting.has(rootSessionId)) {
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is being deleted');
    }
    this.assertControlAvailable(sessionId);
    if (rootSessionId !== sessionId) this.assertControlAvailable(rootSessionId);
    const entry = this.entries.get(rootSessionId);
    if (entry) {
      this.references.get(rootSessionId);
      const workspaceId = entry.state === 'unloaded' ? entry.reference.workspaceId : entry.input.workspaceId;
      return { rootSessionId, workspaceId };
    }
    const native = this.nativeCold.get(sessionId);
    if (native) {
      return { rootSessionId: native.identity.rootSessionId, workspaceId: native.workspace.workspaceId };
    }
    throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  approvals(sessionId: string) { this.get(sessionId); return this.interactions.approvals(sessionId); }

  questions(sessionId: string) { this.get(sessionId); return this.interactions.questions(sessionId); }

  /** The Host says this session's mode changed; pending execution approvals are reconsidered. */
  reconsiderPermissions(sessionId: string): void {
    this.interactions.reconsiderPending(sessionId);
  }

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
    this.assertControlAvailable(sessionId);
    const reference = this.references.get(sessionId);
    const journal = this.journal(sessionId);
    if (journal.runtime().activeRunId !== null || this.pendingRuns.has(sessionId)) throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session already has an active or pending run');
    this.controls.add(sessionId);
    this.deleting.add(sessionId);
    try {
      await this.subagentLifecycleTails.get(sessionId);
      if (!reference) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The session reference is not registered');
      const result = await this.workers.request(sessionId, { type: 'delete.prepare' });
      if (result.type !== 'delete.prepare' || result.sessionFile !== reference.sessionFile) throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested session deletion.');
      await this.workers.stop(sessionId);
      // Native disposal can write exit diagnostics to the transcript.
      await this.workers.withStoppedRoot(sessionId, async () => {
        const manager = SessionManager.create(reference.cwd, reference.sessionsDirectory);
        try { await manager.dropSession(reference.sessionFile); } finally { await manager.close(); }
      });
      this.entries.delete(sessionId);
      for (const [key, record] of this.subagents) if (record.rootSessionId === sessionId || record.childSessionId === sessionId) this.subagents.delete(key);
      await this.references.removeSubagents(sessionId);
      this.interactions.closeSession(sessionId);
      journal.close();
      await this.references.remove(sessionId);
      // A listed native record must not outlive its deleted transcript and
      // resurrect a reference on the next reopen.
      this.nativeCold.delete(sessionId);
      const deletedSessionIds = [sessionId];
      await this.onSessionDeleted?.(deletedSessionIds);
      return { sessionId, deletedSessionIds };
    } finally {
      this.deleting.delete(sessionId);
      this.controls.delete(sessionId);
    }
  }

  onOpened(sessionId: string, generation: string, sessionFile: string, seed: ProjectionSeed): void {
    const entry = this.entries.get(sessionId);
    if (entry?.state !== 'opening') return;
    const journal = entry.opened?.journal;
    if (entry.opened) this.interactions.invalidate(sessionId, entry.opened.generation);
    if (journal) {
      if (entry.opened?.generation === '') journal.replaceInitialSeed(seed);
      else journal.replace(seed);
    }
    const opened = {
      generation, sessionFile, journal: journal ?? new SessionJournal({
        sessionId, rootSessionId: sessionId, projectId: entry.input.projectId,
        workspaceId: entry.input.workspaceId, displayPath: entry.input.displayPath,
        parentSessionId: entry.input.parentSessionId,
      }, seed)
    };
    entry.opened = opened;
    this.openInteractions(sessionId, opened, entry.input.workspaceId);
  }

  /**
   * Move every registry index keyed by a root session id when a completed
   * `/btw` branch rekeys that session in place. The entry, its subagent
   * records, the cold-read state, in-flight control reservations and the
   * interaction callbacks all name the root, so none may keep the retired id:
   * a later root-addressed read would answer 404 for a session the Host binds.
   */
  private rekeyKeyedState(previousSessionId: string, sessionId: string, entry: Extract<Entry, { state: 'live' }>): void {
    this.entries.delete(previousSessionId);
    entry.input.rootSessionId = sessionId;
    entry.opened.journal.rekey(sessionId);
    for (const [id, value] of this.openings) if (id === previousSessionId) { this.openings.delete(id); this.openings.set(sessionId, value); }
    if (this.pendingRuns.delete(previousSessionId)) this.pendingRuns.add(sessionId);
    if (this.controls.delete(previousSessionId)) this.controls.add(sessionId);
    this.entries.set(sessionId, entry);
    for (const [key, record] of this.subagents) {
      if (record.rootSessionId === previousSessionId) {
        this.subagents.delete(key);
        const next = { ...record, rootSessionId: sessionId, parentSessionId: record.parentSessionId === previousSessionId ? sessionId : record.parentSessionId };
        this.subagents.set(subagentKey(sessionId, next.subagentId), next);
      }
    }
    const coldJournal = this.coldJournals.get(previousSessionId);
    if (coldJournal) { this.coldJournals.delete(previousSessionId); coldJournal.rekey(sessionId); this.coldJournals.set(sessionId, coldJournal); }
    const nativeCold = this.nativeCold.get(previousSessionId);
    if (nativeCold) { this.nativeCold.delete(previousSessionId); this.nativeCold.set(sessionId, { ...nativeCold, identity: { ...nativeCold.identity, rootSessionId: sessionId } }); }
    const opening = this.coldSnapshotOpenings.get(previousSessionId);
    if (opening) { this.coldSnapshotOpenings.delete(previousSessionId); this.coldSnapshotOpenings.set(sessionId, opening); }
    this.interactions.rekey(previousSessionId, sessionId);
    this.openInteractions(sessionId, entry.opened, entry.input.workspaceId);
  }

  private openInteractions(sessionId: string, opened: Opened, workspaceId: string): void {
    this.interactions.openSession(sessionId, opened.journal.runtime().epoch, opened.generation, workspaceId,
      async operation => {
        const result = await this.workers.request(sessionId, operation);
        if (operation.type === 'approval.resolve' && result.type !== 'approval.resolve') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested approval.resolve operation.');
        if (operation.type === 'question.resolve' && result.type !== 'question.resolve') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested question.resolve operation.');
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
      void this.workers.stop(sessionId).catch(() => { });
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
      void this.workers.stop(sessionId).catch(() => { });
    }
  }

  onExit(sessionId: string, generation: string): void {
    if (this.closing) return;
    this.interactions.invalidate(sessionId, generation);
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    settleSubagentsForExit(this.subagentDeps(), sessionId, entry.opened);
    entry.opened.journal.unavailable();
  }
  /** A catalog registration that failed after admission ends the runtime with its cause, so the active run reports it. */
  registrationFailed(sessionId: string, generation: string, cause: string): void {
    if (this.closing) return;
    const entry = this.entries.get(sessionId);
    if (entry?.state === 'unloaded' || entry?.opened?.generation !== generation) return;
    entry.opened.journal.unavailable(cause);
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled(this.coldSnapshotOpenings.values());
    for (const entry of this.entries.values()) if (entry.state !== 'unloaded') {
      this.interactions.closeSession(entry.input.rootSessionId);
      entry.opened?.journal.close();
    }
    for (const journal of this.coldJournals.values()) journal.close();
    this.coldJournals.clear();
    await Promise.allSettled(this.openings.values());
    await this.workers.close();
    await this.references.close();
  }

  private async openResolved(input: SessionBootstrap, replace: boolean, reference = this.references.get(input.rootSessionId), persistReference = true, restartGeneration?: string, forkOf?: string, forkTicketId?: string): Promise<RuntimeSession> {
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
      if (resolved.parentSessionId === undefined && reference.parentSessionId !== undefined) resolved.parentSessionId = reference.parentSessionId;
    }
    const entry: Extract<Entry, { state: 'opening' }> = { state: 'opening', input: resolved };
    if (previous?.state === 'live' || previous?.state === 'opening') entry.opened = previous.opened;
    this.entries.set(input.rootSessionId, entry);
    let workerStarted = false;
    try {
      const { displayPath, ...bootstrap } = resolved;
      let policies: ApprovalPolicyRecord[] = [];
      if (this.policyLoad) {
        const policyRequest: ApprovalPolicyLoadRequest = { sessionId: input.rootSessionId, workspaceId: input.workspaceId };
        if (forkOf !== undefined) policyRequest.forkOf = forkOf;
        if (forkTicketId !== undefined) policyRequest.forkTicketId = forkTicketId;
        policies = await this.policyLoad(policyRequest);
      }
      this.interactions.loadPolicies(input.rootSessionId, input.workspaceId, policies);
      await this.workers.start(bootstrap, replace || previous?.state === 'live', policies, restartGeneration);
      workerStarted = true;
      if (!entry.opened) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The live session has no opened projection');
      const runtime = entry.opened.journal.runtime();
      if (persistReference) await this.references.put({
        rootSessionId: bootstrap.rootSessionId, projectId: bootstrap.projectId, workspaceId: bootstrap.workspaceId,
        cwd: bootstrap.cwd, agentDirectory: bootstrap.agentDirectory,
        agentDirectoryId: bootstrap.agentDirectoryId, mcpConfigPath: bootstrap.mcpConfigPath,
        sessionsDirectory: bootstrap.sessionsDirectory, options: bootstrap.options,
        sessionFile: entry.opened.sessionFile, displayPath,
        createdAt: runtime.createdAt, updatedAt: runtime.updatedAt,
        parentSessionId: bootstrap.parentSessionId ?? reference?.parentSessionId,
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
    if (this.deleting.has(sessionId)) throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is being deleted');
    this.assertControlAvailable(sessionId);
    this.references.get(sessionId);
    const entry = this.entries.get(sessionId);
    if (!entry) throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
    return entry;
  }

  private ensureOpen(): void {
    if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The session registry is closed');
  }
}
