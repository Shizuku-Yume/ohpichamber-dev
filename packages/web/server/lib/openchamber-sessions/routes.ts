import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { assertRootPromptAdmission } from '../message-queue/prompt-admission.js';
import {
  SessionCreateAckSchema,
  SessionCreateRequestSchema,
  RuntimeSessionSchema,
  SessionSchema,
  RunSchema,
  RunAbortRequestSchema,
  SessionDeleteAckSchema,
  PromptRequestSchema,
  CapturedSendOptionsSchema,
  SessionSnapshotSchema,
  HistoryPageSchema,
  SessionMetadataStateSchema,
  SessionMetadataPatchSchema,
  SessionTitleRequestSchema,
  SteerRequestSchema,
  SteerAckSchema,
  FollowUpRequestSchema,
  FollowUpAckSchema,
  ProblemDetailsSchema,
  ProblemCodeSchema,
  SessionControlRequestSchema,
  SessionControlAckSchema,
  EntityIdSchema,
  SessionBranchRequestSchema,
  SessionBranchResultSchema,
  SessionRelocateRequestSchema,
  SessionRelocateResultSchema,
  PromptReceiptResultSchema,
} from '@openchamber/agent-contract';
import type {
  FollowUpAck,
  HistoryPage,
  ProblemCode,
  PromptReceiptResult,
  PromptRequest,
  Run,
  RuntimeSession,
  Session,
  SessionBranchResult,
  SessionControlAck,
  SessionControlRequest,
  SessionCreateAck,
  SessionCreateRequest,
  SessionDeleteAck,
  SessionMetadata,
  SessionMetadataState,
  SessionRelocateResult,
  SessionSnapshot,
  SteerAck,
} from '@openchamber/agent-contract';
import {
  HostSessionRelocationPrepareSchema,
  HostSessionRelocationPreparedSchema,
  HostSessionRelocationFinalizeSchema,
  HostSessionRelocationFinalizedSchema,
  HostSessionRelocationPendingSchema,
} from '@openchamber/agent-service/private-protocol';
import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
import type { WorktreeArchiveOwner, WorktreeArchiveOwnerKey } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';
import type { Application, Query, QueryValue, Request, Response as HttpResponse, Router } from '../shared/http-contracts.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';
import type { WorktreeSetupInput } from '../projects/contracts.js';
import type { RestoreFingerprint } from '../git/service-contracts.js';
import type { ArchiveStore, createArchiveStore } from './archive-store.js';
import { buildLinkedIssuesPatch, parseLinkOperation } from './session-linked-issues.js';
import type { SessionMetadataMutationResult, createSessionMetadataStore } from './session-metadata-store.js';
import { createSessionWorktreeMover } from './worktree-move.js';
import type {
  MoveWorktreeResult,
  WorktreeMoverDependencies,
  WorktreeSetupResult,
} from './worktree-move.js';
import { createStartDirectoryResolver } from './worktree-start-directory.js';

export interface HostWorkspaceScope {
  projectId: string;
  hostProjectId?: string;
  projectDirectory?: string;
  workspaceId: string;
  cwd: string;
  agentDirectoryId: string;
  agentDirectory: string;
  name?: string;
  displayPath?: string | null;
  env?: Record<string, string>;
  hostTools?: Record<string, boolean>;
  checkoutRemoved?: boolean;
}

export interface HostSessionScope extends HostWorkspaceScope {
  sessionId: string;
  rootSessionId: string;
  parentSessionId?: string;
}

export interface AgentServiceClient {
  request: (pathname: string, init?: RequestInit) => Promise<globalThis.Response>;
}

export interface SessionRelocationIntent {
  rootSessionId: string;
  transactionId: string;
  sourceWorkspaceId: string;
  destinationWorkspaceId: string;
}

export interface WorktreeArchiveSessionBinding {
  sessionId: string;
  rootSessionId: string;
  workspaceId: string;
  agentDirectoryId: string;
  originalArchiveRevision: string | null;
  originalArchivedAt: number | null;
  expectedArchiveRevision: string | null;
  targetWorkspaceId: string | null;
  progress: string;
  deleteOperationId: string | null;
}

export interface WorktreeArchiveBinding {
  hostProjectId: string;
  archiveId: string;
  archiveRef: string;
  snapshotCommit: string;
  projectId: string;
  anchorWorkspaceId: string;
  anchorDirectory?: string;
  phase: string;
  revision: number;
  claimId: string | null;
  claimGeneration: string | null;
  targetWorkspaceId: string | null;
  preapplyHead?: string | null;
  preapplyFingerprint?: string | null;
  expectedFingerprint?: string | null;
  applyAttempted?: number;
  branchName?: string;
  branchOid?: string | null;
  deleteBranchRequested?: number;
  deleteCasCompleted?: number;
  restoreCasStarted?: number;
  restoreCasCompleted?: number;
  sessions: WorktreeArchiveSessionBinding[];
}

export interface WorktreeArchiveDeleteOwner {
  key: WorktreeArchiveOwnerKey;
  binding: WorktreeArchiveBinding;
  recoveringRemoval: boolean;
}

export interface ClaimedWorktreeArchiveDeleteOwner extends WorktreeArchiveDeleteOwner {
  claimId: string;
}

export interface WorktreeArchiveRestoreOwner {
  key: WorktreeArchiveOwnerKey;
  claimId: string;
  binding: WorktreeArchiveBinding;
  targetWorkspaceId: string;
  recovering: boolean;
  recoveringRemoval: boolean;
  previousTargetDirectory: string | undefined;
}

export interface WorktreeArchiveRestoreFingerprints {
  preapplyHead: string;
  preapplyFingerprint: RestoreFingerprint;
  expectedFingerprint: RestoreFingerprint;
}

export interface AgentScopeStore {
  getWorkspace: (workspaceId: string) => Promise<HostWorkspaceScope | null>;
  getSession: (sessionId: string) => Promise<HostSessionScope | null>;
  listSessionFamily: (rootSessionId: string) => Promise<HostSessionScope[]>;
  rebindSessionRoot: (sessionId: string, rootSessionId: string) => Promise<HostSessionScope | null>;
  removeSessionFamily: (rootSessionId: string) => Promise<number>;
  getRelocation: (rootSessionId: string) => Promise<SessionRelocationIntent | null>;
  createRelocation: (intent: SessionRelocationIntent, claimId?: string) => Promise<SessionRelocationIntent>;
  rebindSessionFamily: (intent: SessionRelocationIntent, claimId?: string) => Promise<HostSessionScope[]>;
  rollbackSessionFamily: (intent: SessionRelocationIntent, claimId?: string) => Promise<HostSessionScope[]>;
  clearRelocation: (intent: SessionRelocationIntent) => Promise<void>;
  checkWorktreeScope: (directory: string, claimId?: string) => Promise<void>;
  listPriorSessionAdmissions: (workspaceId: string) => Promise<{ id: string; workspaceId: string; rootSessionId: string }[]>;
  reserveSessionAdmission: (
    workspaceId: string,
    operation: 'create' | 'fork' | 'reopen' | 'discovery',
    rootSessionId: string,
  ) => Promise<string>;
  releaseSessionAdmission: (admissionId: string) => Promise<void>;
  markSessionAdmissionUncertain: (admissionId: string, answered?: boolean) => void;
  reserveSessionDelete: (sessionId: string) => Promise<string>;
  releaseSessionDelete: (rootSessionId: string) => void;
  createWorktreeArchive: (input: {
    hostProjectId: string;
    archiveId: string;
    archiveRef: string;
    snapshotCommit: string;
    anchorWorkspaceId: string;
    claimId: string;
    claimGeneration: string;
    branchName: string;
    branchOid: string | null;
  }) => Promise<WorktreeArchiveBinding | null>;
  getWorktreeArchive: (key: WorktreeArchiveOwnerKey) => Promise<WorktreeArchiveBinding | null>;
  claimWorktreeArchive: (
    key: WorktreeArchiveOwnerKey,
    input: { claimId: string; claimGeneration: string; revision: number; phase: 'restoring' | 'deleting' },
  ) => Promise<WorktreeArchiveBinding | null>;
  pinWorktreeRestore: (
    key: WorktreeArchiveOwnerKey,
    input: {
      claimId: string;
      revision: number;
      targetWorkspaceId: string;
      preapplyHead: string;
      preapplyFingerprint: RestoreFingerprint;
      expectedFingerprint: RestoreFingerprint;
      recovery?: boolean;
    },
  ) => Promise<WorktreeArchiveBinding | null>;
  markWorktreeRestoreAttempted: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    revision: number,
  ) => Promise<WorktreeArchiveBinding | null>;
  releaseWorktreeArchiveClaim: (key: WorktreeArchiveOwnerKey, claimId: string) => Promise<WorktreeArchiveBinding | null>;
  markWorktreeRestoreMove: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    rootSessionId: string,
  ) => Promise<WorktreeArchiveBinding | null>;
  completeWorktreeRestoreFamily: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    rootSessionId: string,
  ) => Promise<WorktreeArchiveBinding | null>;
  reserveWorktreeArchiveDeleteFamily: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    rootSessionId: string,
  ) => Promise<{ action: 'delete' | 'done' | 'skip'; binding: WorktreeArchiveBinding | null; operationId?: string | null }>;
  completeWorktreeArchiveDeleteFamily: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    rootSessionId: string,
    deletedIds: string[],
  ) => Promise<WorktreeArchiveBinding | null>;
  recheckWorktreeArchive: (key: WorktreeArchiveOwnerKey, claimId: string) => Promise<WorktreeArchiveBinding>;
  setWorktreeArchivePhase: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    revision: number,
    phase: string,
  ) => Promise<WorktreeArchiveBinding | null>;
  archiveWorktreeSessions: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    archivedAt: number,
  ) => Promise<WorktreeArchiveBinding | null>;
  rollbackWorktreeSessions: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    partial: boolean,
  ) => Promise<WorktreeArchiveBinding | null>;
  finishWorktreeArchive: (key: WorktreeArchiveOwnerKey, claimId: string) => Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveDeleteFinalizing: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    revision: number,
    deleteBranch: boolean,
  ) => Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveDeleteCasCompleted: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    revision: number,
  ) => Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveRestoreCasStarted: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    revision: number,
  ) => Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveRestoreCasCompleted: (
    key: WorktreeArchiveOwnerKey,
    claimId: string,
    revision: number,
  ) => Promise<WorktreeArchiveBinding | null>;
  discardWorktreeArchive: (key: WorktreeArchiveOwnerKey) => Promise<void>;
}

export type DirectCommandAcknowledgment = { run: Run } | SteerAck | FollowUpAck;

export type DirectCommandClaim =
  | { state: 'claimed'; claimId: string }
  | { state: 'accepted'; acknowledgment: DirectCommandAcknowledgment };

export interface DirectCommandAdmissionStore {
  claim: (
    scope: HostSessionScope,
    commandId: string,
    operation: 'send' | 'steer' | 'followUp',
    request: PromptRequest,
  ) => Promise<DirectCommandClaim>;
  accept: (
    scope: HostSessionScope,
    commandId: string,
    claimId: string,
    acknowledgment: DirectCommandAcknowledgment,
  ) => Promise<DirectCommandAcknowledgment>;
  release: (scope: HostSessionScope, commandId: string) => Promise<void>;
}

export interface ResolvedPromptAttachment {
  attachmentId: string;
  path: string;
}

export interface DeliveryIdentity {
  deliveryRunId: string;
  runId?: string;
  commandId?: string;
}

export interface PromptDeliveryCapture extends DeliveryIdentity {
  request: PromptRequest;
}

export type PromptAcceptanceReceipt =
  | { runId: string; deliveryRunId: string; run: Run }
  | { runId: string; deliveryRunId: string; ack: SteerAck }
  | { deliveryRunId: string; followUpId: string; ack: FollowUpAck };

export interface PromptAcceptanceCapture extends PromptDeliveryCapture {
  attachments: ResolvedPromptAttachment[];
  receipt: PromptAcceptanceReceipt;
}

export interface SessionUiEvent {
  type: string;
  properties: JsonObject;
}

export interface SessionMetadataBroadcastDependencies {
  directory?: string;
}

export type SessionArchiveResult = Awaited<ReturnType<ArchiveStore['archive']>>;
export type SessionUnarchiveResult = Awaited<ReturnType<ArchiveStore['unarchive']>>;

export type SessionArchiveStorePort = Pick<
  ReturnType<typeof createArchiveStore>,
  'getState' | 'getStates' | 'archive' | 'unarchive'
> & Partial<Pick<ReturnType<typeof createArchiveStore>, 'listAll'>>;
export type SessionMetadataStorePort = Pick<
  ReturnType<typeof createSessionMetadataStore>,
  'getState' | 'getStates' | 'setSessionMetadata' | 'updateSessionMetadata'
>;

export interface OpenChamberSessionServiceDependencies {
  service: AgentServiceClient;
  agentScopeStore?: AgentScopeStore;
  resolveWorkspaceScope: (workspaceId: string, archiveClaimId?: string) => Promise<HostWorkspaceScope | null>;
  resolveWorkspaceDirectory?: (
    directory: string,
  ) => Promise<{ projectId: string; workspaceId: string; hostProjectId?: string; projectDirectory?: string } | null>;
  resolveHostWorkspaceScope?: (workspaceId: string) => Promise<HostWorkspaceScope | null>;
  resolveSessionScope: (sessionId: string) => Promise<HostSessionScope | null>;
  resolveHostSessionScope: (sessionId: string) => Promise<HostSessionScope | null>;
  resolveHostRelocationScope?: (sessionId: string) => Promise<HostSessionScope | null>;
  listWorkspaceScopes?: () => Promise<{ items: { workspaceId: string }[]; errors: Record<string, string> }>;
  registerSessionScope: (session: RuntimeSession) => Promise<boolean>;
  resolveAttachments: (scope: HostSessionScope, attachments: PromptRequest['input']['attachments']) => Promise<ResolvedPromptAttachment[]>;
  capturePrompt: (scope: HostSessionScope, request: PromptRequest) => Promise<PromptRequest>;
  beforeDispatch: (scope: HostSessionScope, capture: PromptDeliveryCapture) => Promise<JsonValue | object | void>;
  onPromptAccepted: (
    scope: HostSessionScope,
    capture: PromptAcceptanceCapture,
    receipt: PromptAcceptanceReceipt,
  ) => Promise<JsonValue | object | void>;
  directCommandAdmissionStore: DirectCommandAdmissionStore;
  publishSessionEvent?: (event: SessionUiEvent) => void;
  archiveStore: SessionArchiveStorePort;
  sessionMetadataStore: SessionMetadataStorePort;
  persistSessionMetadata?: (
    sessionId: string,
    patch: JsonObject,
    options?: SessionMetadataBroadcastDependencies,
  ) => Promise<SessionMetadataMutationResult>;
  updateSessionMetadata?: (
    sessionId: string,
    decide: (current: JsonObject, revision: string) => JsonObject | null,
    options?: SessionMetadataBroadcastDependencies,
  ) => Promise<SessionMetadataMutationResult>;
  broadcastGlobalUiEvent?: (event: SessionUiEvent) => void;
  onArchiveDeleted?: (scope: HostSessionScope, ack: SessionDeleteAck) => Promise<void> | void;
  resolveHostTools?: () => Promise<Record<string, boolean> | undefined>;
  readSettings?: () => Promise<z.infer<typeof SettingsToolsSchema> | null>;
  worktreeMove?: { [Key in keyof Omit<WorktreeMoverDependencies, 'resolveStartDirectory' | 'moveSession' | 'resolveWorktreeSetup'>]?: WorktreeMoverDependencies[Key] | undefined };
  createSessionWorktreeMover?: typeof createSessionWorktreeMover;
  resolveWorktreeTopLevel?: (directory: string) => Promise<{ prefix?: string }>;
  validateWorktreeDirectory?: (
    directory: string,
    worktreeRoot: string,
  ) => Promise<{ valid: boolean; insideWorktreeRoot: boolean }>;
  readWorktreeSetup?: (projectId: string) => Promise<WorktreeSetupInput | null>;
  resolveProjectDirectory?: (directory: string) => Promise<{ projectId: string; projectDirectory?: string } | null>;
  worktreeSetupOf?: (setup: WorktreeSetupInput, directory: string) => WorktreeSetupResult;
}

const SessionForkAckSchema = z.strictObject({
  sessionId: z.string().min(1),
  rootSessionId: z.string().min(1),
  sessionFile: z.string().min(1),
  sourceSessionId: z.string().min(1),
  entryId: z.string().min(1).nullable(),
  mode: z.enum(['selected', 'full']),
});

const SessionForkRequestSchema = z.strictObject({
  messageId: EntityIdSchema.optional(),
  mode: z.enum(['selected', 'full']),
}).refine(
  (input) => (input.mode === 'selected' ? input.messageId !== undefined : input.messageId === undefined),
  { message: 'Selected forks require a public message ID; full forks do not accept one' },
);

const SessionReopenScopeSchema = z.strictObject({
  rootSessionId: z.string().min(1),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  cwd: z.string().min(1),
  agentDirectory: z.string().min(1),
  agentDirectoryId: z.string().min(1),
  displayPath: z.string().min(1),
  env: z.record(z.string(), z.string()).optional(),
  hostTools: z.record(z.string(), z.boolean()).optional(),
});

const NativeSessionListSchema = z.strictObject({
  items: z.array(RuntimeSessionSchema),
  errors: z.array(z.strictObject({ sessionId: z.string().min(1), code: ProblemCodeSchema })),
});

const ErrorBodySchema = z.object({
  detail: z.string().optional(),
  error: z.string().optional(),
  code: ProblemCodeSchema.optional(),
});

const ErrorMetaSchema = z.object({
  code: ProblemCodeSchema.optional(),
  retryable: z.boolean().optional(),
});

const StatusCodeSchema = z.number().int().min(400).max(599);

const SettingsToolsSchema = z.object({
  agentControlToolEnabled: z.boolean().optional(),
  agentWebToolEnabled: z.boolean().optional(),
  agentKnowledgeToolEnabled: z.boolean().optional(),
  agentNotifyToolEnabled: z.boolean().optional(),
  agentRenderToolEnabled: z.boolean().optional(),
  agentWorkflowToolEnabled: z.boolean().optional(),
});

const WorkspaceDisplaySchema = z.looseObject({
  displayPath: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const PreparePayloadSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
});

const DiscardPreparedPayloadSchema = z.object({
  workspaceId: z.string().min(1).optional(),
});

const ResolveDirectoryPayloadSchema = z.object({
  workspaceId: z.string().min(1),
});

const SendResponseSchema = z.object({
  run: RunSchema,
  runCreatedAt: z.number().optional(),
});

const AbortResponseSchema = z.object({
  run: RunSchema,
});

const NativeEntryResponseSchema = z.object({
  entryId: z.string().optional(),
});

const DeliverWrapperSchema = z.looseObject({
  sessionId: z.string().optional(),
  request: z.unknown().optional(),
});

const ScopeTagSchema = z.object({
  projectId: z.string().optional(),
});
const AttachmentErrorSchema = z.object({
  code: z.enum(['PAYLOAD_TOO_LARGE', 'INVALID_REQUEST']),
  message: z.string(),
  statusCode: z.number().int().min(400).max(599).optional(),
});

const ArchivedWorktreeQuerySchema = z.object({
  projectDirectory: z.string(),
  archiveId: z.string(),
});

const MoveToWorktreeEnvelopeSchema = z.object({
  worktree: z.object({
    name: z.unknown().optional(),
    existingBranch: z.unknown().optional(),
    branchName: z.unknown().optional(),
    startRef: z.unknown().optional(),
  }).optional(),
  carry: z.unknown().optional(),
});

const RecoverySchema = z.strictObject({
  mode: z.literal('new_checkout'),
  revision: z.number().int().positive(),
});

const ArchiveDeleteAckSchema = z.strictObject({
  operationId: EntityIdSchema,
  sessionId: EntityIdSchema,
  deletedSessionIds: z.array(EntityIdSchema),
});

const COLD_REFUSAL_CODES = new Set<string>(['SESSION_NOT_FOUND', 'SERVICE_UNAVAILABLE', 'SESSION_RESTORE_FAILED']);

const isVerifiedColdRefusal = (cause: unknown): boolean =>
  cause instanceof OpenChamberControlError
  && cause.refusalVerified === true
  && COLD_REFUSAL_CODES.has(String(cause.code ?? ''))
  && cause.details?.reason !== 'worker_capacity';

const parseCommand = <T>(schema: z.ZodType<T>, payload: JsonValue | undefined): T => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new OpenChamberControlError('Session command is invalid', 400);
  return parsed.data;
};

const MAX_ARCHIVE_BATCH = 500;

const BatchIdsInputSchema = z.object({
  ids: z.array(z.unknown()),
  archivedAt: z.unknown().optional(),
});

type IdBatchParseResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

type ArchiveParseResult =
  | { ok: true; ids: string[]; archivedAt: number }
  | { ok: false; error: string };

const parseIdBatch = (payload: JsonValue | undefined): IdBatchParseResult => {
  const container = BatchIdsInputSchema.safeParse(payload);
  if (!container.success || container.data.ids.length === 0) {
    return { ok: false, error: 'ids must be a non-empty array of session ids' };
  }
  const rawIds = container.data.ids;
  if (rawIds.length > MAX_ARCHIVE_BATCH) {
    return { ok: false, error: `ids must contain at most ${MAX_ARCHIVE_BATCH} session ids` };
  }

  const ids: string[] = [];
  for (const value of rawIds) {
    const parsed = EntityIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: 'ids must contain valid session ids' };
    ids.push(parsed.data);
  }
  return { ok: true, ids };
};

const parseArchiveRequest = (payload: JsonValue | undefined): ArchiveParseResult => {
  const parsed = parseIdBatch(payload);
  if (!parsed.ok) return parsed;

  const container = BatchIdsInputSchema.safeParse(payload);
  const rawArchivedAt = container.success ? container.data.archivedAt : undefined;
  if (rawArchivedAt === undefined) {
    return { ok: true, ids: parsed.ids, archivedAt: Date.now() };
  }
  const archivedAtParsed = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).safeParse(rawArchivedAt);
  if (!archivedAtParsed.success) {
    return { ok: false, error: 'archivedAt must be a positive integer timestamp' };
  }

  return { ok: true, ids: parsed.ids, archivedAt: archivedAtParsed.data };
};

const serializeQuery = (query: Query): string => {
  const params = new URLSearchParams();
  const appendValue = (key: string, value: QueryValue | undefined): void => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      for (const entry of value) appendValue(key, entry);
      return;
    }
    const parsedString = z.string().safeParse(value);
    if (parsedString.success) {
      params.append(key, parsedString.data);
    }
  };
  for (const [key, value] of Object.entries(query)) {
    appendValue(key, value);
  }
  return params.toString();
};

interface SpeculativeSessionEntry {
  promise: Promise<RuntimeSession>;
  timer: ReturnType<typeof setTimeout>;
  sessionId: string | null;
}

interface SpeculativeEntryRef {
  current?: SpeculativeSessionEntry;
}

interface SessionBootstrapPayload {
  rootSessionId: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
  agentDirectory: string;
  agentDirectoryId: string;
  displayPath: string;
  options: ReturnType<typeof CapturedSendOptionsSchema.parse>;
  deferred: boolean;
  hostTools?: Record<string, boolean>;
  parentSessionId?: string;
  env?: Record<string, string>;
}

interface DestinationRelocationScope {
  rootSessionId: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
  agentDirectory: string;
  agentDirectoryId: string;
  displayPath: string;
  env?: Record<string, string>;
}

interface DispatchRequestBody {
  type?: 'prompt';
  runId?: string;
  request: PromptRequest;
  attachments: ResolvedPromptAttachment[];
  correlationId?: string;
}

export interface MoveToWorktreeOptions {
  contextSessionId?: string | null | undefined;
}

export interface ArchivedWorktreeSessionsQuery {
  projectDirectory: string;
  archiveId: string;
}

export interface ArchivedWorktreeSessionSummary {
  sessionId: string;
  rootSessionId: string;
  workspaceId: string;
  metadata: SessionMetadata | null;
  archivedAt: number | null;
  progress: string;
}

const createCanonicalSessionService = (dependencies: OpenChamberSessionServiceDependencies) => {
  const {
    service,
    resolveWorkspaceScope,
    resolveSessionScope,
    resolveHostSessionScope,
    listWorkspaceScopes,
    registerSessionScope,
    resolveAttachments,
    capturePrompt,
    beforeDispatch,
    onPromptAccepted,
    directCommandAdmissionStore,
    publishSessionEvent,
    archiveStore,
    sessionMetadataStore,
    persistSessionMetadata,
    updateSessionMetadata,
    broadcastGlobalUiEvent,
    onArchiveDeleted,
    agentScopeStore,
    resolveHostRelocationScope,
  } = dependencies;

  const relocationControls = new Set<string>();
  const worktreeArchiveGeneration = `host_${process.pid}_${randomUUID()}`;
  let worktreeMover: ReturnType<typeof createSessionWorktreeMover> | undefined;

  const requiredFunctions = [
    service?.request,
    resolveWorkspaceScope,
    resolveSessionScope,
    resolveHostSessionScope,
    registerSessionScope,
    resolveAttachments,
    capturePrompt,
    beforeDispatch,
    onPromptAccepted,
    directCommandAdmissionStore?.claim,
    directCommandAdmissionStore?.accept,
  ];
  if (!service || requiredFunctions.some((candidate) => !z.function().safeParse(candidate).success)) {
    throw new Error(
      'session routes require the Agent service, Host scope resolvers, registration, attachment, delivery and direct command admission owners',
    );
  }

  const resolveHostTools = dependencies.resolveHostTools
    ? dependencies.resolveHostTools
    : async (): Promise<Record<string, boolean> | undefined> => {
      const rawSettings = dependencies.readSettings
        ? await dependencies.readSettings().catch(() => null)
        : null;
      const parsedSettings = SettingsToolsSchema.safeParse(rawSettings);
      if (!parsedSettings.success) return undefined;
      const settings = parsedSettings.data;
      return {
        openchamber: settings.agentControlToolEnabled !== false,
        web: settings.agentWebToolEnabled !== false,
        openchamber_knowledge: settings.agentKnowledgeToolEnabled !== false,
        notify: settings.agentNotifyToolEnabled === true,
        openchamber_render: settings.agentRenderToolEnabled !== false,
        openchamber_workflow: settings.agentWorkflowToolEnabled !== false,
      };
    };

  const request = async (pathname: string, init: RequestInit = {}): Promise<JsonValue | null> => {
    const response = await service.request(pathname, {
      ...init,
      headers: { accept: 'application/json', ...(init.headers ?? {}) },
    });
    const body = z.json().nullable().catch(null).parse(await response.json().catch(() => null));
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(body);
      const parsedBody = ErrorBodySchema.safeParse(body);
      const fallbackMessage = parsedBody.success
        ? (parsedBody.data.detail || parsedBody.data.error || 'Agent service request failed')
        : 'Agent service request failed';
      const error = new OpenChamberControlError(
        problem.success ? problem.data.detail : fallbackMessage,
        response.status,
      );
      error.code = problem.success ? problem.data.code : (parsedBody.success ? parsedBody.data.code : undefined);
      error.refusalVerified = problem.success;
      error.retryable = problem.success ? problem.data.retryable : false;
      if (problem.success && problem.data.details) error.details = problem.data.details;
      throw error;
    }
    return body;
  };

  const scopeFor = async (sessionId: string, adopt = true): Promise<HostSessionScope> => {
    const owner = resolveHostRelocationScope ? await resolveHostRelocationScope(sessionId) : null;
    if (owner && agentScopeStore && await agentScopeStore.getRelocation(owner.rootSessionId)) {
      if (relocationControls.has(owner.rootSessionId)) {
        throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
      }
      relocationControls.add(owner.rootSessionId);
      try {
        await recoverRelocation(owner.rootSessionId);
      } finally {
        relocationControls.delete(owner.rootSessionId);
      }
    }
    const resolved = await resolveSessionScope(sessionId);
    if (!resolved || resolved.sessionId !== sessionId) {
      throw new OpenChamberControlError('Session scope was not found', 404);
    }
    if (adopt) adoptPrepared(resolved);
    const parentId = subagentSessions.get(sessionId);
    const scope: HostSessionScope = parentId !== undefined && resolved.parentSessionId === undefined
      ? { ...resolved, parentSessionId: parentId }
      : resolved;
    return scope;
  };

  const hostScopeFor = async (sessionId: string): Promise<HostSessionScope> => {
    const scope = await resolveHostSessionScope(sessionId);
    if (!scope || scope.sessionId !== sessionId) {
      throw new OpenChamberControlError('Session scope was not found', 404);
    }
    adoptPrepared(scope);
    return scope;
  };

  const assertWritableScope = (scope: HostWorkspaceScope): void => {
    if (scope.workspaceId.startsWith('archive_')) {
      throw new OpenChamberControlError('Deleted-space sessions are permanently read-only', 409, {
        code: 'SESSION_READ_ONLY',
        retryable: false,
      });
    }
  };

  const emit = (event: SessionUiEvent): void => {
    try { publishSessionEvent?.(event); } catch { void 0; }
    try { broadcastGlobalUiEvent?.(event); } catch { void 0; }
  };

  const liveRootSessions = new Set<string>();
  const rememberLive = (rootSessionId: string): void => { liveRootSessions.add(rootSessionId); };
  const forgetLive = (rootSessionId: string): void => { liveRootSessions.delete(rootSessionId); };
  const subagentSessions = new Map<string, string>();

  const metadata = {
    getState: (id: string) => sessionMetadataStore.getState(id),
    set: async (id: string, patch: JsonObject, directory = ''): Promise<SessionMetadataMutationResult> => {
      if (persistSessionMetadata) return persistSessionMetadata(id, patch, { directory });
      const result = await sessionMetadataStore.setSessionMetadata(id, patch);
      if (result.changed) {
        try {
          broadcastGlobalUiEvent?.({
            type: 'openchamber:session-metadata',
            properties: { sessionId: id, sessionID: id, metadata: result.metadata, revision: result.revision },
          });
        } catch { void 0; }
      }
      return result;
    },
    update: async (
      id: string,
      decide: (current: JsonObject, revision: string) => JsonObject | null,
      directory = '',
    ): Promise<SessionMetadataMutationResult> => {
      if (updateSessionMetadata) return updateSessionMetadata(id, decide, { directory });
      const result = await sessionMetadataStore.updateSessionMetadata(id, decide);
      if (result.changed) {
        try {
          broadcastGlobalUiEvent?.({
            type: 'openchamber:session-metadata',
            properties: { sessionId: id, sessionID: id, metadata: result.metadata, revision: result.revision },
          });
        } catch { void 0; }
      }
      return result;
    },
  };

  const admissionRecoveries = new Map<string, Promise<void>>();
  const recoverPriorSessionAdmissions = (scope: HostWorkspaceScope): Promise<void> => {
    const running = admissionRecoveries.get(scope.workspaceId);
    if (running) return running;
    const recovery = (async () => {
      if (!agentScopeStore) return;
      for (const admission of await agentScopeStore.listPriorSessionAdmissions(scope.workspaceId)) {
        const owner = await resolveWorkspaceScope(admission.workspaceId);
        if (!owner) continue;
        const listed = NativeSessionListSchema.safeParse(
          await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(owner.workspaceId)}`).catch(() => null),
        );
        if (!listed.success || listed.data.errors.length) continue;
        const roots = listed.data.items.filter((session) => session.rootSessionId === admission.rootSessionId);
        if (roots.some((session) => session.projectId !== owner.projectId || session.workspaceId !== owner.workspaceId)) continue;
        if (!(await Promise.all(roots.map(registerSessionScope))).every(Boolean)) continue;
        await agentScopeStore.releaseSessionAdmission(admission.id);
      }
    })().catch(() => { }).finally(() => { admissionRecoveries.delete(scope.workspaceId); });
    admissionRecoveries.set(scope.workspaceId, recovery);
    return recovery;
  };

  const withSessionAdmission = async <T>(
    scope: HostWorkspaceScope,
    operation: 'create' | 'fork' | 'reopen' | 'discovery',
    rootSessionId: string,
    work: (settled: () => void) => Promise<T>,
    readOnly = false,
  ): Promise<T> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host session admission authority is unavailable', 503);
    if (scope.checkoutRemoved && !readOnly) {
      throw new OpenChamberControlError("This chat's worktree was deleted, so it is read-only", 409, { code: 'SESSION_READ_ONLY' });
    }
    await recoverPriorSessionAdmissions(scope);
    const admission = await agentScopeStore.reserveSessionAdmission(scope.workspaceId, operation, rootSessionId);
    let complete = false;
    let answered = false;
    try {
      const result = await work(() => { complete = true; });
      complete = true;
      return result;
    } catch (error) {
      answered = error instanceof OpenChamberControlError && error.refusalVerified === true;
      const status = error instanceof OpenChamberControlError ? Number(error.statusCode) : NaN;
      if ((Number.isFinite(status) && status >= 400 && status < 500) || (answered && operation === 'reopen')) {
        complete = true;
      }
      if (!complete && !readOnly) {
        throw new OpenChamberControlError(
          'Native session admission outcome is uncertain; the worktree archive remains blocked until the admission is reconciled',
          409,
          { code: 'COMMAND_IN_FLIGHT', retryable: false, cause: error },
        );
      }
      throw error;
    } finally {
      if (complete || readOnly) await agentScopeStore.releaseSessionAdmission(admission);
      else agentScopeStore.markSessionAdmissionUncertain(admission, answered);
    }
  };

  const speculativeSessions = new Map<string, SpeculativeSessionEntry>();
  const discardingPrepared = new Set<string>();

  const takePrepared = (workspaceId: string, entry: SpeculativeSessionEntry): boolean => {
    if (speculativeSessions.get(workspaceId) !== entry) return false;
    speculativeSessions.delete(workspaceId);
    clearTimeout(entry.timer);
    return true;
  };

  const adoptPrepared = (scope: HostSessionScope): void => {
    if (discardingPrepared.has(scope.rootSessionId)) {
      throw new OpenChamberControlError('Prepared session cleanup is in progress', 409, {
        code: 'COMMAND_IN_FLIGHT',
        retryable: true,
      });
    }
    const entry = speculativeSessions.get(scope.workspaceId);
    if (entry?.sessionId === scope.rootSessionId) takePrepared(scope.workspaceId, entry);
  };

  const discardPrepared = async (
    payload: JsonValue | undefined = {},
    expected?: SpeculativeSessionEntry,
  ): Promise<{ ok: boolean }> => {
    const parsed = DiscardPreparedPayloadSchema.safeParse(payload ?? {});
    const workspaceId = parsed.success ? parsed.data.workspaceId : undefined;
    if (!workspaceId) return { ok: false };
    const existing = speculativeSessions.get(workspaceId);
    const target = expected === undefined ? existing : expected;
    if (!existing || existing !== target) return { ok: true };
    try {
      const session = await existing.promise;
      if (!takePrepared(workspaceId, existing)) return { ok: true };
      discardingPrepared.add(session.sessionId);
      try {
        await remove(session.sessionId, false);
      } finally {
        discardingPrepared.delete(session.sessionId);
      }
    } catch { void 0; }
    return { ok: true };
  };

  const prepare = async (payload: JsonValue | undefined = {}): Promise<{ ok: true; sessionId: string }> => {
    const parsed = PreparePayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) throw new OpenChamberControlError('Project and workspace identity required', 400);
    const { projectId, workspaceId } = parsed.data;
    const existing = speculativeSessions.get(workspaceId);
    if (existing) {
      const session = await existing.promise;
      return { ok: true, sessionId: session.sessionId };
    }
    const entryRef: SpeculativeEntryRef = {};
    const timer = setTimeout(() => { void discardPrepared({ workspaceId }, entryRef.current); }, 5 * 60 * 1000);
    timer.unref?.();
    const preparePromise = (async (): Promise<RuntimeSession> => {
      const workspace = await resolveWorkspaceScope(workspaceId);
      if (!workspace || workspace.projectId !== projectId) {
        throw new OpenChamberControlError('Workspace does not belong to project', 404);
      }
      assertWritableScope(workspace);
      const rootSessionId = randomUUID();
      if (entryRef.current) entryRef.current.sessionId = rootSessionId;
      const workspaceDisplay = WorkspaceDisplaySchema.parse(workspace);
      const displayPath = workspaceDisplay.displayPath
        && !workspaceDisplay.displayPath.startsWith('/')
        && !workspaceDisplay.displayPath.startsWith('\\')
        && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath)
        ? workspaceDisplay.displayPath
        : 'workspace';
      const hostTools = await resolveHostTools();
      const defaultOptions = CapturedSendOptionsSchema.parse({
        providerId: null,
        modelId: null,
        agentId: null,
        variant: null,
        reasoningEffort: null,
      });
      const sessionBootstrap: SessionBootstrapPayload = {
        rootSessionId,
        projectId,
        workspaceId,
        cwd: workspace.cwd,
        agentDirectory: workspace.agentDirectory,
        agentDirectoryId: workspace.agentDirectoryId,
        displayPath,
        options: defaultOptions,
        deferred: false,
      };
      if (hostTools) sessionBootstrap.hostTools = hostTools;
      if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
      return await withSessionAdmission(workspace, 'create', rootSessionId, async (settled) => {
        const body = await request('/internal/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(sessionBootstrap),
        });
        const runtime = RuntimeSessionSchema.parse(body);
        if (runtime.projectId !== projectId || runtime.workspaceId !== workspaceId || runtime.rootSessionId !== rootSessionId) {
          throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
        }
        if (!await registerSessionScope(runtime)) {
          throw new OpenChamberControlError('Session scope registration failed', 500);
        }
        settled();
        rememberLive(runtime.sessionId);
        return runtime;
      });
    })();
    const entry: SpeculativeSessionEntry = { promise: preparePromise, timer, sessionId: null };
    entryRef.current = entry;
    speculativeSessions.set(workspaceId, entry);
    try {
      const session = await preparePromise;
      return { ok: true, sessionId: session.sessionId };
    } catch (err) {
      if (speculativeSessions.get(workspaceId)?.promise === preparePromise) {
        speculativeSessions.delete(workspaceId);
        clearTimeout(timer);
      }
      throw err;
    }
  };

  const create = async (payload: JsonValue | SessionCreateRequest | undefined = {}): Promise<SessionCreateAck> => {
    const parsed = SessionCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session create request is invalid', 400);
    const { projectId, workspaceId, metadata: requestedMetadata, parentSessionId } = parsed.data;
    const options = CapturedSendOptionsSchema.parse(parsed.data.options);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.projectId !== projectId) {
      throw new OpenChamberControlError('Workspace does not belong to project', 404);
    }
    assertWritableScope(workspace);
    if (parentSessionId !== undefined) {
      const parentScope = await resolveSessionScope(parentSessionId);
      if (!parentScope) throw new OpenChamberControlError('Parent session was not found', 404);
      if (parentScope.workspaceId !== workspaceId || parentScope.projectId !== projectId) {
        throw new OpenChamberControlError('Parent session is outside the authorized workspace and project', 403);
      }
      assertWritableScope(parentScope);
    }
    const speculative = parentSessionId === undefined ? speculativeSessions.get(workspaceId) : undefined;
    let session: RuntimeSession | null = null;
    if (speculative) {
      takePrepared(workspaceId, speculative);
      try {
        session = await speculative.promise;
      } catch {
        session = null;
      }
    }
    if (session) {
      rememberLive(session.sessionId);
      if (parsed.data.title) {
        const renamed = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(session.sessionId)}/title`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(SessionTitleRequestSchema.parse({ workspaceId, title: parsed.data.title })),
        }));
        if (renamed.sessionId !== session.sessionId || renamed.workspaceId !== workspaceId) {
          throw new OpenChamberControlError('Session title response was out of scope', 502);
        }
        Object.assign(session, renamed);
      }
    } else {
      const rootSessionId = randomUUID();
      const workspaceDisplay = WorkspaceDisplaySchema.parse(workspace);
      const displayPath = workspaceDisplay.displayPath
        && !workspaceDisplay.displayPath.startsWith('/')
        && !workspaceDisplay.displayPath.startsWith('\\')
        && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath)
        ? workspaceDisplay.displayPath
        : 'workspace';
      const hostTools = await resolveHostTools();
      const sessionBootstrap: SessionBootstrapPayload = {
        rootSessionId,
        projectId,
        workspaceId,
        cwd: workspace.cwd,
        agentDirectory: workspace.agentDirectory,
        agentDirectoryId: workspace.agentDirectoryId,
        displayPath,
        options,
        deferred: true,
      };
      if (hostTools) sessionBootstrap.hostTools = hostTools;
      if (parentSessionId !== undefined) sessionBootstrap.parentSessionId = parentSessionId;
      if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
      session = await withSessionAdmission(workspace, 'create', rootSessionId, async (settled) => {
        const body = await request('/internal/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(sessionBootstrap),
        });
        const runtime = RuntimeSessionSchema.parse(body);
        if (runtime.projectId !== projectId || runtime.workspaceId !== workspaceId || runtime.rootSessionId !== rootSessionId) {
          throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
        }
        if (parentSessionId !== undefined && runtime.parentSessionId !== parentSessionId) {
          throw new OpenChamberControlError('Agent service returned an out-of-scope parent linkage', 502);
        }
        if (!await registerSessionScope(runtime)) {
          throw new OpenChamberControlError('Session scope registration failed', 500);
        }
        if (parentSessionId !== undefined) subagentSessions.set(runtime.sessionId, parentSessionId);
        if (parsed.data.title) {
          const renamed = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(runtime.sessionId)}/title`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(SessionTitleRequestSchema.parse({ workspaceId, title: parsed.data.title })),
          }));
          if (renamed.sessionId !== runtime.sessionId || renamed.workspaceId !== workspaceId) {
            throw new OpenChamberControlError('Session title response was out of scope', 502);
          }
          Object.assign(runtime, renamed);
        }
        settled();
        rememberLive(runtime.sessionId);
        return runtime;
      });
    }
    if (requestedMetadata) await metadata.set(session.sessionId, requestedMetadata, workspace.cwd);
    const stored = await sessionMetadataStore.getState(session.sessionId);
    const result = SessionCreateAckSchema.parse({
      session: SessionSchema.parse({
        ...session,
        metadata: stored?.metadata ?? null,
        metadataRevision: stored?.revision ?? '0',
        archiveRevision: '0',
      }),
    });
    emit({
      type: 'openchamber:session-created',
      properties: { sessionId: session.sessionId, projectId, workspaceId, directory: workspace.cwd },
    });
    return result;
  };

  const prepareDelivery = async (
    scope: HostSessionScope,
    requestBody: PromptRequest,
    identity: DeliveryIdentity,
    capturedRequest: PromptRequest | null = null,
  ): Promise<PromptDeliveryCapture & { attachments: ResolvedPromptAttachment[] }> => {
    const isRoot = scope.parentSessionId === undefined;
    const captured = capturedRequest ?? await capturePrompt(scope, requestBody);
    const admitted = isRoot ? assertRootPromptAdmission(captured) : captured;
    const capture: PromptDeliveryCapture = { ...identity, request: admitted };
    await beforeDispatch(scope, capture);
    try {
      const attachments = await resolveAttachments(scope, admitted.input.attachments);
      return { ...capture, attachments };
    } catch (error) {
      const parsedError = AttachmentErrorSchema.safeParse(error);
      if (parsedError.success) {
        throw new OpenChamberControlError(
          parsedError.data.message,
          parsedError.data.statusCode ?? (parsedError.data.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400),
          { code: parsedError.data.code, retryable: false },
        );
      }
      throw error;
    }
  };

  async function deliver(operation: 'send', sessionId: string, payload?: JsonValue | PromptRequest, commandId?: string): Promise<{ run: Run }>;
  async function deliver(operation: 'steer', sessionId: string, payload?: JsonValue, commandId?: string): Promise<SteerAck>;
  async function deliver(operation: 'followUp', sessionId: string, payload?: JsonValue, commandId?: string): Promise<FollowUpAck>;
  async function deliver(
    operation: 'send' | 'steer' | 'followUp',
    sessionId: string,
    payload?: JsonValue | PromptRequest,
    commandId?: string,
  ): Promise<DirectCommandAcknowledgment> {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    if (scope.checkoutRemoved) {
      throw new OpenChamberControlError("This chat's worktree was deleted, so it is read-only", 409, {
        code: 'SESSION_READ_ONLY',
        retryable: false,
      });
    }
    const wrapped = DeliverWrapperSchema.safeParse(payload);
    const wrappedSessionId = wrapped.success ? wrapped.data.sessionId : undefined;
    const rawPrompt = operation === 'send'
      ? payload
      : (wrapped.success && wrapped.data.request !== undefined ? wrapped.data.request : payload);
    const parsed = PromptRequestSchema.safeParse(rawPrompt);
    if (!parsed.success || (operation !== 'send' && wrappedSessionId !== undefined && wrappedSessionId !== sessionId)) {
      throw new OpenChamberControlError('Prompt request is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const requestBody = operation === 'steer'
      ? SteerRequestSchema.parse({ sessionId, request: parsed.data }).request
      : operation === 'followUp'
        ? FollowUpRequestSchema.parse({ sessionId, request: parsed.data }).request
        : parsed.data;
    const isRoot = scope.parentSessionId === undefined;
    if (isRoot) assertRootPromptAdmission(requestBody);
    if (commandId !== undefined && !EntityIdSchema.safeParse(commandId).success) {
      throw new OpenChamberControlError('Command key is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const claim = commandId === undefined
      ? null
      : await directCommandAdmissionStore.claim(scope, commandId, operation, requestBody);
    if (claim?.state === 'accepted') return claim.acknowledgment;
    const captured = await capturePrompt(scope, requestBody);
    const capturedRequest = isRoot ? assertRootPromptAdmission(captured) : captured;
    const deliveryRunId = randomUUID();
    const deliveryIdentity: DeliveryIdentity = { deliveryRunId };
    if (operation === 'send') deliveryIdentity.runId = deliveryRunId;
    if (commandId !== undefined) deliveryIdentity.commandId = commandId;
    const capture = await prepareDelivery(scope, requestBody, deliveryIdentity, capturedRequest);
    if (operation === 'send' && !liveRootSessions.has(scope.rootSessionId)) await reopen(scope);
    let acknowledgment: DirectCommandAcknowledgment;
    let receipt: PromptAcceptanceReceipt;
    try {
      const pathname = operation === 'send' ? 'runs' : operation === 'steer' ? 'steer' : 'follow-up';
      const body: DispatchRequestBody = operation === 'send'
        ? { type: 'prompt', runId: deliveryRunId, request: capture.request, attachments: capture.attachments }
        : { request: capture.request, attachments: capture.attachments };
      if (commandId !== undefined) body.correlationId = commandId;
      const dispatch = () => request(`/internal/sessions/${encodeURIComponent(sessionId)}/${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      let response: JsonValue | null;
      try {
        response = await dispatch();
      } catch (error) {
        if (operation !== 'send' || !isVerifiedColdRefusal(error)) throw error;
        await reopen(scope);
        response = await dispatch();
      }
      if (operation === 'send') {
        const parsedResponse = SendResponseSchema.parse(response);
        const run = parsedResponse.run;
        const admissionStamp = parsedResponse.runCreatedAt;
        const replayed = run.runId !== deliveryRunId
          && commandId !== undefined
          && admissionStamp !== undefined
          && run.createdAt < admissionStamp;
        if (run.sessionId !== sessionId || (run.runId !== deliveryRunId && !replayed)) {
          throw new Error('Native run acknowledgement does not match the admitted command');
        }
        acknowledgment = { run };
        receipt = { runId: run.runId, deliveryRunId, run };
        rememberLive(scope.rootSessionId);
      } else if (operation === 'steer') {
        const steerAck = SteerAckSchema.parse(response);
        if (steerAck.sessionId !== sessionId) throw new Error('Native acknowledgement does not match the admitted session');
        acknowledgment = steerAck;
        receipt = { runId: steerAck.runId, deliveryRunId, ack: steerAck };
      } else {
        const followUpAck = FollowUpAckSchema.parse(response);
        if (followUpAck.sessionId !== sessionId) throw new Error('Native acknowledgement does not match the admitted session');
        acknowledgment = followUpAck;
        receipt = { deliveryRunId, followUpId: followUpAck.followUpId, ack: followUpAck };
      }
    } catch (error) {
      if (operation === 'send') forgetLive(scope.rootSessionId);
      if (claim && !(error instanceof OpenChamberControlError && error.refusalVerified === true)) {
        throw new OpenChamberControlError('Command acceptance is uncertain; it will not be dispatched again', 409, {
          code: 'COMMAND_IN_FLIGHT',
          retryable: false,
        });
      }
      if (claim && commandId !== undefined) await directCommandAdmissionStore.release(scope, commandId);
      throw error;
    }
    try {
      const acceptedCapture: PromptAcceptanceCapture = { ...capture, receipt };
      if ('runId' in receipt && receipt.runId) acceptedCapture.runId = receipt.runId;
      await onPromptAccepted(scope, acceptedCapture, receipt);
    } catch (error) {
      if (claim) {
        throw new OpenChamberControlError('Command was accepted but its delivery receipt is incomplete', 409, {
          code: 'COMMAND_IN_FLIGHT',
          retryable: false,
        });
      }
      throw error;
    }
    if (claim && commandId !== undefined) {
      await directCommandAdmissionStore.accept(scope, commandId, claim.claimId, acknowledgment);
    }
    return acknowledgment;
  }

  const send = (sessionId: string, payload: JsonValue | PromptRequest | undefined = {}, commandId?: string): Promise<{ run: Run }> =>
    deliver('send', sessionId, payload, commandId);

  const steer = (sessionId: string, payload: JsonValue | undefined = {}, commandId?: string): Promise<SteerAck> =>
    deliver('steer', sessionId, payload, commandId);

  const followUp = (
    sessionId: string,
    payload: JsonValue | undefined = {},
    commandId?: string,
  ): Promise<FollowUpAck> => deliver('followUp', sessionId, payload, commandId);

  const fork = async (sessionId: string, payload: JsonValue | { messageId?: string; mode?: 'selected' | 'full' } | undefined = {}): Promise<SessionCreateAck> => {
    const source = await scopeFor(sessionId);
    assertWritableScope(source);
    const input = parseCommand(SessionForkRequestSchema, payload);
    const child = await withSessionAdmission(source, 'fork', source.rootSessionId, async (settled) => {
      await reopenNative(source);
      let entryId: string | null = null;
      if (input.mode === 'selected') {
        const messageId = input.messageId;
        if (messageId === undefined) {
          settled();
          throw new OpenChamberControlError('Selected message is unavailable', 409);
        }
        const nativeEntry = NativeEntryResponseSchema.safeParse(
          await request(`/internal/sessions/${encodeURIComponent(sessionId)}/native-entry/${encodeURIComponent(messageId)}`),
        );
        entryId = nativeEntry.success ? asNonEmptyString(nativeEntry.data.entryId) : null;
        if (!entryId) {
          settled();
          throw new OpenChamberControlError('Selected message is unavailable', 409);
        }
      }
      const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceSessionId: sessionId, entryId, mode: input.mode }),
      });
      const ack = SessionForkAckSchema.parse(body);
      if (ack.sourceSessionId !== sessionId || ack.entryId !== entryId || ack.mode !== input.mode) {
        throw new OpenChamberControlError('Fork acknowledgement does not match the requested source', 502);
      }
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(ack.sessionId)}`));
      if (runtime.sessionId !== ack.sessionId
        || runtime.rootSessionId !== ack.rootSessionId
        || runtime.projectId !== source.projectId
        || runtime.workspaceId !== source.workspaceId) {
        throw new OpenChamberControlError('Fork acknowledgement is outside the source scope', 502);
      }
      if (!await registerSessionScope(runtime)) {
        throw new OpenChamberControlError('Forked session scope registration failed', 500);
      }
      settled();
      return runtime;
    });
    const stored = await sessionMetadataStore.getState(child.sessionId);
    const archiveState = await archiveStore.getState(child.sessionId);
    const projectedInput: z.input<typeof SessionSchema> = {
      ...child,
      metadata: stored?.metadata ?? null,
      metadataRevision: stored?.revision ?? '0',
      archiveRevision: archiveState?.revision ?? '0',
    };
    if (archiveState?.archivedAt != null) projectedInput.archivedAt = archiveState.archivedAt;
    const projected: Session = SessionSchema.parse(projectedInput);
    return SessionCreateAckSchema.parse({ session: projected });
  };

  const reopenNative = async (scope: HostSessionScope): Promise<void> => {
    const hostTools = scope.hostTools ?? (resolveHostTools ? await resolveHostTools().catch(() => null) : null);
    const privateScope: z.input<typeof SessionReopenScopeSchema> = {
      rootSessionId: scope.rootSessionId,
      projectId: scope.projectId,
      workspaceId: scope.workspaceId,
      cwd: scope.cwd,
      agentDirectory: scope.agentDirectory,
      agentDirectoryId: scope.agentDirectoryId,
      displayPath: scope.displayPath ?? 'workspace',
    };
    if (hostTools) privateScope.hostTools = hostTools;
    if (scope.env) privateScope.env = scope.env;
    const bootstrap = SessionReopenScopeSchema.parse(privateScope);
    const runtime = RuntimeSessionSchema.parse(
      await request(`/internal/sessions/${encodeURIComponent(bootstrap.rootSessionId)}/reopen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bootstrap),
      }),
    );
    if (runtime.sessionId !== bootstrap.rootSessionId
      || runtime.rootSessionId !== bootstrap.rootSessionId
      || runtime.projectId !== bootstrap.projectId
      || runtime.workspaceId !== bootstrap.workspaceId) {
      throw new OpenChamberControlError('Session restore acknowledgement is outside the authorized scope', 502);
    }
  };

  const reopen = async (scope: HostSessionScope): Promise<void> => {
    try {
      await withSessionAdmission(scope, 'reopen', scope.rootSessionId, () => reopenNative(scope));
      rememberLive(scope.rootSessionId);
    } catch (error) {
      forgetLive(scope.rootSessionId);
      throw error;
    }
  };

  const open = async (id: string, { signal }: { signal?: AbortSignal } = {}): Promise<SessionSnapshot> => {
    const scope = await scopeFor(id);
    const init: RequestInit = {};
    if (signal !== undefined) init.signal = signal;
    const snapshot = SessionSnapshotSchema.parse(
      await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`, init),
    );
    if (snapshot.session.sessionId !== id
      || snapshot.session.projectId !== scope.projectId
      || snapshot.session.workspaceId !== scope.workspaceId) {
      throw new OpenChamberControlError('Session snapshot is outside the authorized scope', 502);
    }
    return snapshot;
  };

  const history = async (id: string, query = ''): Promise<HistoryPage> => {
    const scope = await scopeFor(id);
    const page = HistoryPageSchema.parse(
      await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`),
    );
    if (page.sessionId !== id
      || page.turns.some((turn) => {
        const parsedProjectId = ScopeTagSchema.safeParse(turn);
        return parsedProjectId.success && parsedProjectId.data.projectId !== undefined && parsedProjectId.data.projectId !== scope.projectId;
      })
      || page.messages.some((message) => {
        const parsedProjectId = ScopeTagSchema.safeParse(message);
        return parsedProjectId.success && parsedProjectId.data.projectId !== undefined && parsedProjectId.data.projectId !== scope.projectId;
      })) {
      throw new OpenChamberControlError('Session history is outside the authorized scope', 502);
    }
    return page;
  };

  const promptReceipt = async (id: string, correlationId: string): Promise<PromptReceiptResult> => {
    await scopeFor(id);
    if (!EntityIdSchema.safeParse(correlationId).success) {
      throw new OpenChamberControlError('Prompt receipt correlation id is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const result = PromptReceiptResultSchema.parse(
      await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/prompt-receipts/${encodeURIComponent(correlationId)}`),
    );
    const echoed = result.status === 'unknown' ? result : result.receipt;
    if (echoed.sessionId !== id || echoed.correlationId !== correlationId) {
      throw new OpenChamberControlError('Prompt receipt is outside the authorized scope', 502);
    }
    return result;
  };

  const list = async (
    workspaceId?: string,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<{ items: Session[]; errors: Record<string, ProblemCode> }> => {
    const scopePage = workspaceId
      ? { items: [{ workspaceId }], errors: {} }
      : await (listWorkspaceScopes
        ? listWorkspaceScopes()
        : Promise.reject(new OpenChamberControlError('Workspace enumeration is unavailable', 503)));
    const parsedScopes = z.strictObject({
      items: z.array(z.strictObject({ workspaceId: z.string().min(1) })),
      errors: z.record(z.string(), ProblemCodeSchema),
    }).parse(scopePage);

    const pages = await Promise.all(parsedScopes.items.map(async ({ workspaceId: id }) => {
      try {
        const workspace = await resolveWorkspaceScope(id);
        if (!workspace) {
          throw new OpenChamberControlError(
            'Workspace scope is unavailable during global session listing',
            workspaceId ? 404 : 503,
            { code: workspaceId ? 'SESSION_NOT_FOUND' : 'SERVICE_UNAVAILABLE' },
          );
        }
        return await withSessionAdmission(workspace, 'discovery', id, async () => {
          const init: RequestInit = {};
          if (signal !== undefined) init.signal = signal;
          const raw = NativeSessionListSchema.parse(
            await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(id)}`, init),
          );
          const ids = raw.items.map((session) => session.sessionId);
          const metadataPage = await sessionMetadataStore.getStates(ids);
          const archivePage = await archiveStore.getStates(ids);
          const missing = new Error('Host metadata store omitted a requested session');
          type SessionEntryResult =
            | { item: Session; error?: never }
            | { error: { sessionId: string; code: ProblemCode }; item?: never };
          const sessionResults: SessionEntryResult[] = await Promise.all(raw.items.map(async (session): Promise<SessionEntryResult> => {
            try {
              if (session.projectId !== workspace.projectId || session.workspaceId !== id) {
                throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502, { code: 'INTERNAL_ERROR' });
              }
              if (!metadataPage.entries.has(session.sessionId) && !metadataPage.errors.has(session.sessionId)) throw missing;
              if (!archivePage.entries.has(session.sessionId) && !archivePage.errors.has(session.sessionId)) throw missing;
              if (metadataPage.errors.has(session.sessionId)) {
                throw new OpenChamberControlError('Session metadata is corrupt', 503, { code: metadataPage.errors.get(session.sessionId) });
              }
              if (archivePage.errors.has(session.sessionId)) {
                throw new OpenChamberControlError('Session archive state is corrupt', 503, { code: archivePage.errors.get(session.sessionId) });
              }
              const metadataState = metadataPage.entries.get(session.sessionId) ?? null;
              const archiveState = archivePage.entries.get(session.sessionId) ?? null;
              if (!await registerSessionScope(session)) {
                throw new OpenChamberControlError('Session scope registration failed', 500, { code: 'INTERNAL_ERROR' });
              }
              const projectedInput: z.input<typeof SessionSchema> = {
                ...session,
                metadata: metadataState?.metadata ?? null,
                metadataRevision: metadataState?.revision ?? '0',
                archiveRevision: archiveState?.revision ?? '0',
              };
              if (archiveState?.archivedAt != null) projectedInput.archivedAt = archiveState.archivedAt;
              return { item: SessionSchema.parse(projectedInput) };
            } catch (error) {
              const parsedError = error instanceof OpenChamberControlError ? ProblemCodeSchema.safeParse(error.code) : null;
              return { error: { sessionId: session.sessionId, code: parsedError?.success ? parsedError.data : 'SERVICE_UNAVAILABLE' } };
            }
          }));
          const unadopted = new Set([...speculativeSessions.values()].map((entry) => entry.sessionId));
          const items = sessionResults.flatMap((result) => (result.item && !unadopted.has(result.item.sessionId) ? [result.item] : []));
          const sessionErrors = sessionResults.flatMap((result) => (result.error ? [result.error] : []));
          return {
            items,
            errors: Object.fromEntries([...raw.errors, ...sessionErrors].map((error) => [error.sessionId, error.code])),
          };
        }, true);
      } catch (error) {
        const parsedError = error instanceof OpenChamberControlError ? ProblemCodeSchema.safeParse(error.code) : null;
        return { items: [], errors: { [id]: parsedError?.success ? parsedError.data : 'SERVICE_UNAVAILABLE' } };
      }
    }));

    return z.strictObject({
      items: z.array(SessionSchema),
      errors: z.record(z.string(), ProblemCodeSchema),
    }).parse({
      items: pages.flatMap((page) => page.items),
      errors: Object.assign({}, parsedScopes.errors, ...pages.map((page) => page.errors)),
    });
  };

  const captureWorktreeArchive = async ({
    projectDirectory,
    worktreeDirectory,
    archiveId,
    archiveRef,
    snapshotCommit,
    claimId,
    branchName,
    branchOid,
    archivedAt,
  }: {
    projectDirectory: string;
    worktreeDirectory: string;
    archiveId: string;
    archiveRef: string;
    snapshotCommit: string;
    claimId: string;
    branchName: string;
    branchOid: string | null;
    archivedAt: number;
  }): Promise<{ key: WorktreeArchiveOwnerKey; claimId: string; revision: number }> => {
    if (!agentScopeStore || !dependencies.resolveWorkspaceDirectory || !archiveStore.listAll) {
      throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    }
    const [project, workspace] = await Promise.all([
      dependencies.resolveWorkspaceDirectory(projectDirectory),
      dependencies.resolveWorkspaceDirectory(worktreeDirectory),
    ]);
    if (!project || !workspace || project.projectId !== workspace.projectId) {
      throw new OpenChamberControlError('Worktree does not belong to the Host project', 403);
    }
    const scope = await (dependencies.resolveHostWorkspaceScope ?? resolveWorkspaceScope)(workspace.workspaceId);
    if (!scope || !scope.hostProjectId || scope.projectId !== project.projectId) {
      throw new OpenChamberControlError('Worktree Host scope is unavailable', 503);
    }
    const archiveState = await archiveStore.listAll();
    if (archiveState.conversion?.code || Object.keys(archiveState.errors).length > 0) {
      throw new OpenChamberControlError('Host archive state is unavailable', 503);
    }
    const key: WorktreeArchiveOwnerKey = { hostProjectId: scope.hostProjectId, archiveId };
    let binding = await agentScopeStore.createWorktreeArchive({
      ...key,
      archiveRef,
      snapshotCommit,
      anchorWorkspaceId: scope.workspaceId,
      claimId,
      claimGeneration: worktreeArchiveGeneration,
      branchName,
      branchOid,
    });
    try {
      binding = await agentScopeStore.archiveWorktreeSessions(key, claimId, archivedAt);
      if (!binding) throw new OpenChamberControlError('Worktree archive binding is unavailable', 503);
      return { key, claimId, revision: binding.revision };
    } catch (error) {
      await agentScopeStore.rollbackWorktreeSessions(key, claimId, false);
      const controlError = asControlError(error, 'Failed to archive worktree sessions');
      controlError.worktreeArchiveOwner = { key, claimId };
      throw controlError;
    }
  };

  const prepareWorktreeArchiveRemoval = async (owner: WorktreeArchiveOwner): Promise<WorktreeArchiveBinding | null> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const binding = await agentScopeStore.recheckWorktreeArchive(owner.key, owner.claimId);
    return agentScopeStore.setWorktreeArchivePhase(owner.key, owner.claimId, binding.revision, 'removal_pending');
  };

  const finishWorktreeArchive = async (owner: WorktreeArchiveOwner): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const binding = await agentScopeStore.finishWorktreeArchive(owner.key, owner.claimId);
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    return binding;
  };

  const rollbackWorktreeArchive = (owner: WorktreeArchiveOwner, partial: boolean): Promise<WorktreeArchiveBinding | null> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    return agentScopeStore.rollbackWorktreeSessions(owner.key, owner.claimId, partial);
  };

  const discardWorktreeArchive = (owner: WorktreeArchiveOwner): Promise<void> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    return agentScopeStore.discardWorktreeArchive(owner.key);
  };

  const archive = async (payload: JsonValue | undefined = {}): Promise<SessionArchiveResult> => {
    const parsed = parseArchiveRequest(payload);
    if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400);
    const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id)));
    scopes.forEach(assertWritableScope);
    return archiveStore.archive(parsed.ids, parsed.archivedAt);
  };

  const unarchive = async (payload: JsonValue | undefined = {}): Promise<SessionUnarchiveResult> => {
    const parsed = parseIdBatch(payload);
    if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400);
    const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id)));
    scopes.forEach(assertWritableScope);
    return archiveStore.unarchive(parsed.ids);
  };

  const getMetadata = async (id: string): Promise<SessionMetadataState> => {
    await hostScopeFor(id);
    const state = await sessionMetadataStore.getState(id);
    return SessionMetadataStateSchema.parse({
      sessionId: id,
      revision: state?.revision ?? '0',
      metadata: state?.metadata ?? null,
    });
  };

  const setMetadata = async (id: string, payload: JsonValue | undefined = {}): Promise<SessionMetadataState> => {
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    const parsed = SessionMetadataPatchSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session metadata patch is invalid', 400, { code: 'INVALID_REQUEST' });
    let conflict = false;
    const result = parsed.data.expectedRevision === undefined
      ? await metadata.set(id, parsed.data.changes, scope.cwd)
      : await metadata.update(id, (_current, revision) => {
        if (revision !== parsed.data.expectedRevision) {
          conflict = true;
          return null;
        }
        return parsed.data.changes;
      }, scope.cwd);
    if (conflict) {
      throw new OpenChamberControlError('Session metadata changed before the update', 409, { code: 'METADATA_CONFLICT' });
    }
    return SessionMetadataStateSchema.parse({ sessionId: id, revision: result.revision, metadata: result.metadata });
  };

  const rename = async (id: string, payload: JsonValue | undefined = {}): Promise<Session> => {
    const input = SessionTitleRequestSchema.parse(payload);
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    if (scope.workspaceId !== input.workspaceId) {
      throw new OpenChamberControlError('Session title request is outside its Host scope', 403);
    }
    const runtime = RuntimeSessionSchema.parse(
      await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/title`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    if (runtime.sessionId !== id
      || runtime.rootSessionId !== scope.rootSessionId
      || runtime.workspaceId !== scope.workspaceId
      || runtime.projectId !== scope.projectId) {
      throw new OpenChamberControlError('Session title response was outside its Host scope', 502);
    }
    const [stored, archiveState] = await Promise.all([sessionMetadataStore.getState(id), archiveStore.getState(id)]);
    const projectedInput: z.input<typeof SessionSchema> = {
      ...runtime,
      metadata: stored?.metadata ?? null,
      metadataRevision: stored?.revision ?? '0',
      archiveRevision: archiveState?.revision ?? '0',
    };
    if (archiveState?.archivedAt != null) projectedInput.archivedAt = archiveState.archivedAt;
    return SessionSchema.parse(projectedInput);
  };

  const updateMetadata = async (
    sessionID: string,
    decide: (current: JsonObject, revision: string) => JsonObject | null,
    directory = '',
  ): Promise<SessionMetadataMutationResult> => {
    if (updateSessionMetadata) {
      return updateSessionMetadata(sessionID, decide, { directory });
    }
    const result = await sessionMetadataStore.updateSessionMetadata(sessionID, decide);
    if (result.changed) {
      broadcastGlobalUiEvent?.({
        type: 'openchamber:session-metadata',
        properties: { sessionID, metadata: result.metadata, revision: result.revision },
      });
    }
    return result;
  };

  const setSessionLinks = async (
    sessionID: string,
    payload: JsonValue | undefined = {},
  ): Promise<{ metadata: SessionMetadata }> => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    const parsed = parseLinkOperation(z.json().optional().catch(undefined).parse(payload));
    if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400);
    const { metadata: nextMetadata } = await updateMetadata(
      id,
      (current) => buildLinkedIssuesPatch(current, parsed.entries, parsed.linked),
      scope.cwd,
    );
    return { metadata: nextMetadata };
  };

  const selectBranch = async (
    sessionId: string,
    payload: JsonValue | undefined = {},
  ): Promise<SessionBranchResult> => {
    const input = parseCommand(SessionBranchRequestSchema, payload);
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    await reopen(scope);
    const result = SessionBranchResultSchema.parse(
      await request(`/internal/sessions/${encodeURIComponent(sessionId)}/branch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    if (result.sessionId !== sessionId
      || result.branch.branchId !== input.branchId
      || BigInt(result.branch.branchVersion) <= BigInt(input.branchVersion)
      || (input.action === 'revert' ? result.branch.revert?.messageId !== input.messageId : result.branch.revert !== undefined)) {
      throw new OpenChamberControlError('Branch acknowledgement does not match its requested owner and selection', 502);
    }
    return result;
  };

  const pendingRelocation = async (
    rootSessionId: string,
  ): Promise<Omit<SessionRelocationIntent, 'rootSessionId'> | null> =>
    HostSessionRelocationPendingSchema.parse(
      await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation`),
    ).relocation;

  const sameIntent = (
    intent: SessionRelocationIntent,
    pending: Omit<SessionRelocationIntent, 'rootSessionId'> | null,
  ): boolean =>
    Boolean(
      pending
      && pending.transactionId === intent.transactionId
      && pending.sourceWorkspaceId === intent.sourceWorkspaceId
      && pending.destinationWorkspaceId === intent.destinationWorkspaceId,
    );

  const familyOwner = async (intent: SessionRelocationIntent): Promise<'source' | 'destination'> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    const family = await agentScopeStore.listSessionFamily(intent.rootSessionId);
    if (!family.some((member) => member.sessionId === intent.rootSessionId)) {
      throw new OpenChamberControlError('Relocation family is unavailable', 503);
    }
    if (family.every((member) => member.workspaceId === intent.sourceWorkspaceId)) return 'source';
    if (family.every((member) => member.workspaceId === intent.destinationWorkspaceId)) return 'destination';
    throw new OpenChamberControlError('Relocation Host ownership has changed', 503);
  };

  const assertRelocationRuntime = async (
    intent: SessionRelocationIntent,
    runtime: RuntimeSession,
    workspaceId: string,
  ): Promise<void> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    const scope = await agentScopeStore.getWorkspace(workspaceId);
    if (!scope
      || runtime.sessionId !== intent.rootSessionId
      || runtime.rootSessionId !== intent.rootSessionId
      || runtime.workspaceId !== workspaceId
      || runtime.projectId !== scope.projectId
      || (workspaceId === intent.destinationWorkspaceId && runtime.activeRunId !== null)) {
      throw new OpenChamberControlError('Relocation acknowledgement is outside its captured Host owner', 502);
    }
  };

  const finalizeRelocation = async (intent: SessionRelocationIntent, action: 'commit' | 'rollback'): Promise<RuntimeSession> => {
    const result = HostSessionRelocationFinalizedSchema.parse(
      await request(`/internal/sessions/${encodeURIComponent(intent.rootSessionId)}/relocation/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(HostSessionRelocationFinalizeSchema.parse({ transactionId: intent.transactionId, action })),
      }),
    );
    await assertRelocationRuntime(
      intent,
      result.session,
      action === 'commit' ? intent.destinationWorkspaceId : intent.sourceWorkspaceId,
    );
    return result.session;
  };

  const recoverRelocation = async (rootSessionId: string): Promise<void> => {
    if (!agentScopeStore) return;
    const intent = await agentScopeStore.getRelocation(rootSessionId);
    if (!intent) return;
    const owner = await familyOwner(intent);
    const pending = await pendingRelocation(rootSessionId);
    if (pending && !sameIntent(intent, pending)) {
      throw new OpenChamberControlError('Native relocation intent does not match its Host owner', 503);
    }
    if (pending) {
      await finalizeRelocation(intent, owner === 'destination' ? 'commit' : 'rollback');
    } else {
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
      await assertRelocationRuntime(
        intent,
        runtime,
        owner === 'destination' ? intent.destinationWorkspaceId : intent.sourceWorkspaceId,
      );
    }
    await agentScopeStore.clearRelocation(intent);
  };

  const relocationResult = async (rootSessionId: string, workspaceId: string): Promise<SessionRelocateResult> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    const family = await agentScopeStore.listSessionFamily(rootSessionId);
    const sessions = await Promise.all(family.map(async (member) => {
      const runtime = RuntimeSessionSchema.parse(
        await request(`/api/agent/v1/sessions/${encodeURIComponent(member.sessionId)}`),
      );
      if (member.workspaceId !== workspaceId
        || runtime.sessionId !== member.sessionId
        || runtime.rootSessionId !== rootSessionId
        || runtime.workspaceId !== workspaceId
        || runtime.projectId !== member.projectId) {
        throw new OpenChamberControlError('Relocation family projection is outside its destination owner', 502);
      }
      const [stored, archiveState] = await Promise.all([
        sessionMetadataStore.getState(member.sessionId),
        archiveStore.getState(member.sessionId),
      ]);
      const projectedInput: z.input<typeof SessionSchema> = {
        ...runtime,
        metadata: stored?.metadata ?? null,
        metadataRevision: stored?.revision ?? '0',
        archiveRevision: archiveState?.revision ?? '0',
      };
      if (archiveState?.archivedAt != null) projectedInput.archivedAt = archiveState.archivedAt;
      return SessionSchema.parse(projectedInput);
    }));
    return SessionRelocateResultSchema.parse({ sessions });
  };

  const relocate = async (
    sessionId: string,
    payload: JsonValue | undefined = {},
    archiveClaimId?: string,
  ): Promise<SessionRelocateResult> => {
    const input = parseCommand(SessionRelocateRequestSchema, payload);
    if (!agentScopeStore || !resolveHostRelocationScope) {
      throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    }
    let source = archiveClaimId ? await agentScopeStore.getSession(sessionId) : await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    await agentScopeStore.checkWorktreeScope(source.cwd, archiveClaimId);
    const rootSessionId = source.rootSessionId;
    if (relocationControls.has(rootSessionId)) {
      throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
    }
    forgetLive(rootSessionId);
    relocationControls.add(rootSessionId);
    try {
      await recoverRelocation(rootSessionId);
      source = archiveClaimId ? await agentScopeStore.getSession(sessionId) : await resolveHostRelocationScope(sessionId);
      if (!source) throw new OpenChamberControlError('Session scope was not found', 404);
      assertWritableScope(source);
      await agentScopeStore.checkWorktreeScope(source.cwd, archiveClaimId);
      const destination = await resolveWorkspaceScope(input.workspaceId, archiveClaimId);
      if (!destination || destination.projectId !== source.projectId || destination.agentDirectoryId !== source.agentDirectoryId) {
        throw new OpenChamberControlError('Relocation destination is outside the source Host owner', 403);
      }
      assertWritableScope(destination);
      await agentScopeStore.checkWorktreeScope(destination.cwd, archiveClaimId);
      if (destination.workspaceId === source.workspaceId) {
        return relocationResult(rootSessionId, destination.workspaceId);
      }
      const intent: SessionRelocationIntent = {
        rootSessionId,
        transactionId: randomUUID(),
        sourceWorkspaceId: source.workspaceId,
        destinationWorkspaceId: destination.workspaceId,
      };
      await agentScopeStore.createRelocation(intent, archiveClaimId);
      try {
        const destinationScope: DestinationRelocationScope = {
          rootSessionId,
          projectId: destination.projectId,
          workspaceId: destination.workspaceId,
          cwd: destination.cwd,
          agentDirectory: destination.agentDirectory,
          agentDirectoryId: destination.agentDirectoryId,
          displayPath: destination.displayPath ?? 'workspace',
        };
        if (destination.env) destinationScope.env = destination.env;
        const prepared = HostSessionRelocationPreparedSchema.parse(
          await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation/prepare`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(HostSessionRelocationPrepareSchema.parse({
              transactionId: intent.transactionId,
              sourceWorkspaceId: source.workspaceId,
              destination: destinationScope,
            })),
          }),
        );
        if (prepared.transactionId !== intent.transactionId) {
          throw new OpenChamberControlError('Relocation acknowledgement identified another transaction', 502);
        }
        await assertRelocationRuntime(intent, prepared.session, destination.workspaceId);
        await agentScopeStore.rebindSessionFamily(intent, archiveClaimId);
        await finalizeRelocation(intent, 'commit');
        await agentScopeStore.clearRelocation(intent);
      } catch (error) {
        const pending = await pendingRelocation(rootSessionId);
        if (pending && !sameIntent(intent, pending)) {
          throw new OpenChamberControlError('Native relocation recovery owner has changed', 503);
        }
        const owner = await familyOwner(intent);
        if (!pending && owner === 'destination') {
          const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
          await assertRelocationRuntime(intent, runtime, destination.workspaceId);
          await agentScopeStore.clearRelocation(intent);
          return relocationResult(rootSessionId, destination.workspaceId);
        }
        if (pending) {
          if (owner === 'destination') await agentScopeStore.rollbackSessionFamily(intent, archiveClaimId);
          await finalizeRelocation(intent, 'rollback');
        } else {
          const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
          await assertRelocationRuntime(intent, runtime, source.workspaceId);
        }
        await agentScopeStore.clearRelocation(intent);
        throw error;
      }
      return relocationResult(rootSessionId, destination.workspaceId);
    } finally {
      relocationControls.delete(rootSessionId);
    }
  };

  const resolveWorktreeArchivePinnedTarget = async ({
    projectDirectory,
    archiveId,
    revision,
  }: {
    projectDirectory: string;
    archiveId: string;
    revision: number;
  }): Promise<string> => {
    if (!agentScopeStore || !dependencies.resolveWorkspaceDirectory) {
      throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    }
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    const scope = project ? await agentScopeStore.getWorkspace(project.workspaceId) : null;
    const binding = scope?.hostProjectId
      ? await agentScopeStore.getWorktreeArchive({ hostProjectId: scope.hostProjectId, archiveId })
      : null;
    if (!binding || binding.phase !== 'restoring' || binding.revision !== revision || !binding.targetWorkspaceId) {
      throw new OpenChamberControlError('Restore target is unavailable or changed', 409, {
        code: 'WORKTREE_ARCHIVE_TARGET_CHANGED',
      });
    }
    const target = await agentScopeStore.getWorkspace(binding.targetWorkspaceId);
    if (!target || target.projectId !== binding.projectId) {
      throw new OpenChamberControlError('Restore target is unavailable', 409, {
        code: 'WORKTREE_ARCHIVE_TARGET_CHANGED',
      });
    }
    return target.cwd;
  };

  const prepareWorktreeArchiveRestore = async ({
    projectDirectory,
    targetDirectory,
    archiveId,
    recovery,
    expectedRevision,
  }: {
    projectDirectory: string;
    targetDirectory: string;
    archiveId: string;
    recovery?: unknown;
    expectedRevision?: number | undefined;
  }): Promise<WorktreeArchiveRestoreOwner | null> => {
    if (!agentScopeStore || !dependencies.resolveWorkspaceDirectory) {
      throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    }
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    if (!project) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const projectScope = await agentScopeStore.getWorkspace(project.workspaceId);
    if (!projectScope || !projectScope.hostProjectId) {
      throw new OpenChamberControlError('Host project scope is unavailable', 503);
    }
    const key: WorktreeArchiveOwnerKey = { hostProjectId: projectScope.hostProjectId, archiveId };
    let binding = await agentScopeStore.getWorktreeArchive(key);
    if (!binding) return null;
    const recoveringRemoval = binding.phase === 'removal_pending';
    if (expectedRevision !== undefined && binding.revision !== expectedRevision) {
      throw new OpenChamberControlError('Restore revision changed', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    }
    const parsedRecovery = recovery === undefined ? null : RecoverySchema.safeParse(recovery);
    const recovering = parsedRecovery?.success === true;
    if (recovery !== undefined && (
      !parsedRecovery?.success
      || parsedRecovery.data.revision !== binding.revision
      || !binding.targetWorkspaceId
      || binding.sessions.some((item) => ['move_intent', 'restored'].includes(item.progress))
    )) {
      throw new OpenChamberControlError('Restore recovery intent is stale or sessions have moved', 409, {
        code: 'WORKTREE_ARCHIVE_TARGET_CHANGED',
      });
    }
    let target = !recovering && binding.targetWorkspaceId
      ? await agentScopeStore.getWorkspace(binding.targetWorkspaceId)
      : null;
    if (!target) {
      const found = await dependencies.resolveWorkspaceDirectory(targetDirectory);
      target = found ? await agentScopeStore.getWorkspace(found.workspaceId) : null;
    }
    if (recovering && target?.workspaceId === binding.targetWorkspaceId) {
      throw new OpenChamberControlError('Recovery requires a different checkout', 409, {
        code: 'WORKTREE_ARCHIVE_TARGET_CHANGED',
      });
    }
    const previousTarget = recovering && binding.targetWorkspaceId
      ? await agentScopeStore.getWorkspace(binding.targetWorkspaceId)
      : null;
    if (recovering && !previousTarget) {
      throw new OpenChamberControlError('Previous restore target is unavailable', 409, {
        code: 'WORKTREE_ARCHIVE_TARGET_CHANGED',
      });
    }
    if (!target || target.cwd !== targetDirectory || target.projectId !== binding.projectId) {
      throw new OpenChamberControlError('Restore target does not match the Host archive owner', 409, {
        code: 'WORKTREE_ARCHIVE_TARGET_CHANGED',
      });
    }
    const claimId = randomUUID();
    binding = await agentScopeStore.claimWorktreeArchive(key, {
      claimId,
      claimGeneration: worktreeArchiveGeneration,
      revision: binding.revision,
      phase: 'restoring',
    });
    if (!binding) throw new OpenChamberControlError('Restore claim could not be recorded', 503);
    return {
      key,
      claimId,
      binding,
      targetWorkspaceId: target.workspaceId,
      recovering,
      recoveringRemoval,
      previousTargetDirectory: previousTarget?.cwd,
    };
  };

  const finishWorktreeArchiveRestore = async (owner: WorktreeArchiveOwner): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    let binding = await agentScopeStore.getWorktreeArchive(owner.key);
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    for (const rootId of new Set(binding.sessions.map((item) => item.rootSessionId))) {
      const rows = binding.sessions.filter((item) => item.rootSessionId === rootId);
      if (rows.every((item) => item.progress === 'restored')) continue;
      for (const item of rows) {
        const scope = await agentScopeStore.getSession(item.sessionId);
        const state = await archiveStore.getState(item.sessionId);
        if (!scope
          || scope.projectId !== binding.projectId
          || scope.agentDirectoryId !== item.agentDirectoryId
          || (scope.workspaceId !== item.workspaceId && scope.workspaceId !== binding.targetWorkspaceId)
          || (state?.archivedAt != null && state.revision !== (item.expectedArchiveRevision ?? item.originalArchiveRevision))) {
          throw new OpenChamberControlError('Archived session scope or state changed', 409);
        }
      }
      const nextAfterMove = await agentScopeStore.markWorktreeRestoreMove(owner.key, owner.claimId, rootId);
      if (!nextAfterMove || !nextAfterMove.targetWorkspaceId) {
        throw new OpenChamberControlError('Restore target workspace is unavailable', 503);
      }
      await relocate(rootId, { workspaceId: nextAfterMove.targetWorkspaceId }, owner.claimId);
      const nextAfterComplete = await agentScopeStore.completeWorktreeRestoreFamily(owner.key, owner.claimId, rootId);
      if (!nextAfterComplete) throw new OpenChamberControlError('Restore family completion failed', 503);
      binding = nextAfterComplete;
    }
    return binding;
  };

  const pinWorktreeArchiveRestore = async (
    owner: { key: WorktreeArchiveOwnerKey; claimId: string; binding: { revision: number }; targetWorkspaceId: string; recovering?: boolean | undefined },
    fingerprints: WorktreeArchiveRestoreFingerprints,
  ): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const binding = await agentScopeStore.pinWorktreeRestore(owner.key, {
      ...fingerprints,
      claimId: owner.claimId,
      revision: owner.binding.revision,
      targetWorkspaceId: owner.targetWorkspaceId,
      recovery: Boolean(owner.recovering),
    });
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    return binding;
  };

  const markWorktreeArchiveRestoreAttempted = async (
    owner: WorktreeArchiveOwner,
    revision: number,
  ): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const binding = await agentScopeStore.markWorktreeRestoreAttempted(owner.key, owner.claimId, revision);
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    return binding;
  };

  const releaseWorktreeArchiveRestore = (owner: WorktreeArchiveOwner): Promise<WorktreeArchiveBinding | null> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    return agentScopeStore.releaseWorktreeArchiveClaim(owner.key, owner.claimId);
  };

  const finalizeWorktreeArchiveRestore = async (
    owner: WorktreeArchiveOwner,
    revision: number,
  ): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const binding = await agentScopeStore.setWorktreeArchivePhase(owner.key, owner.claimId, revision, 'finalizing');
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    return binding;
  };

  const cleanupWorktreeArchiveRestore = (owner: WorktreeArchiveOwner): Promise<void> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    return agentScopeStore.discardWorktreeArchive(owner.key);
  };

  const prepareWorktreeArchiveDelete = async ({
    projectDirectory,
    archiveId,
  }: {
    projectDirectory: string;
    archiveId: string;
  }): Promise<WorktreeArchiveDeleteOwner | null> => {
    if (!agentScopeStore || !dependencies.resolveWorkspaceDirectory) {
      throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    }
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    const scope = project ? await agentScopeStore.getWorkspace(project.workspaceId) : null;
    if (!scope || !scope.hostProjectId) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const key: WorktreeArchiveOwnerKey = { hostProjectId: scope.hostProjectId, archiveId };
    const binding = await agentScopeStore.getWorktreeArchive(key);
    if (!binding) return null;
    const recoveringRemoval = binding.phase === 'removal_pending';
    return { key, binding, recoveringRemoval };
  };

  const claimWorktreeArchiveDelete = async (owner: { key: WorktreeArchiveOwnerKey; binding: { revision: number }; recoveringRemoval: boolean }): Promise<ClaimedWorktreeArchiveDeleteOwner> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const claimId = randomUUID();
    const binding = await agentScopeStore.claimWorktreeArchive(owner.key, {
      claimId,
      claimGeneration: worktreeArchiveGeneration,
      revision: owner.binding.revision,
      phase: 'deleting',
    });
    if (!binding) throw new OpenChamberControlError('Delete claim could not be recorded', 503);
    return { key: owner.key, recoveringRemoval: owner.recoveringRemoval, claimId, binding };
  };

  const deleteWorktreeArchiveSessions = async (owner: WorktreeArchiveOwner): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    let binding = await agentScopeStore.getWorktreeArchive(owner.key);
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    for (const rootId of new Set(binding.sessions.map((item) => item.rootSessionId))) {
      const reservation = await agentScopeStore.reserveWorktreeArchiveDeleteFamily(owner.key, owner.claimId, rootId);
      if (!reservation.binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
      binding = reservation.binding;
      const rows = binding.sessions.filter((item) => item.rootSessionId === rootId);
      if (reservation.action === 'skip') continue;
      const operationId = reservation.operationId ?? rows[0]?.deleteOperationId;
      const root = rows.find((item) => item.sessionId === rootId);
      if (reservation.action === 'done' && !operationId) continue;
      if (!root || !operationId) throw new OpenChamberControlError('Archived root session is unavailable', 503);
      const nativeDelete = {
        operationId,
        projectId: binding.projectId,
        workspaceId: root.workspaceId,
        agentDirectoryId: root.agentDirectoryId,
        sessionIds: rows.map((item) => item.sessionId),
      };
      if (reservation.action === 'done') {
        await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete/retire`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nativeDelete),
        });
        continue;
      }
      const ack = ArchiveDeleteAckSchema.parse(
        await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nativeDelete),
        }),
      );
      if (ack.sessionId !== rootId || ack.operationId !== operationId) {
        throw new OpenChamberControlError('Session deletion acknowledgement identified another operation', 502);
      }
      const completed = await agentScopeStore.completeWorktreeArchiveDeleteFamily(
        owner.key,
        owner.claimId,
        rootId,
        ack.deletedSessionIds,
      );
      if (!completed) throw new OpenChamberControlError('Archive deletion completion failed', 503);
      binding = completed;
      await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete/retire`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nativeDelete),
      });
    }
    return binding;
  };

  const finalizeWorktreeArchiveDelete = async (
    owner: WorktreeArchiveOwner,
    revision: number,
    deleteBranch: boolean,
  ): Promise<WorktreeArchiveBinding> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const binding = await agentScopeStore.markWorktreeArchiveDeleteFinalizing(owner.key, owner.claimId, revision, deleteBranch);
    if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
    return binding;
  };

  const control = async (
    sessionId: string,
    operation: JsonValue | SessionControlRequest | undefined = {},
  ): Promise<{ run: Run } | SessionControlAck> => {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    const parsed = parseCommand(SessionControlRequestSchema, operation);
    if (parsed.type === 'abort') {
      const requestBody = RunAbortRequestSchema.parse({ sessionId, runId: parsed.runId });
      const body = AbortResponseSchema.parse(
        await request(
          `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(requestBody.runId)}/abort`,
          { method: 'POST' },
        ),
      );
      return { run: body.run };
    }
    await reopen(scope);
    const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const ack = SessionControlAckSchema.parse(body);
    if (ack.type === 'btw.branch' && ack.sessionId !== undefined && ack.sessionId !== sessionId) {
      if (!agentScopeStore) throw new OpenChamberControlError('Host session scope store is unavailable', 503);
      if (ack.rootSessionId !== undefined && ack.rootSessionId !== ack.sessionId) {
        throw new OpenChamberControlError('A BTW branch must stay its own root', 502);
      }
      const rebound = await agentScopeStore.rebindSessionRoot(sessionId, ack.sessionId);
      if (!rebound || rebound.sessionId !== ack.sessionId) {
        throw new OpenChamberControlError('Canonical session rekey was not persisted', 503);
      }
      forgetLive(sessionId);
      rememberLive(ack.sessionId);
    }
    return ack;
  };

  const remove = async (id: string, adopt = true): Promise<SessionDeleteAck> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host session scope store is unavailable', 503);
    const scope = await scopeFor(id, adopt);
    const reservation = await agentScopeStore.reserveSessionDelete(id);
    try {
      forgetLive(scope.rootSessionId);
      const ack = SessionDeleteAckSchema.parse(
        await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      );
      if (ack.sessionId !== id) {
        throw new OpenChamberControlError('Session deletion acknowledgement identified another session', 502);
      }
      if (scope.workspaceId.startsWith('archive_')) await onArchiveDeleted?.(scope, ack);
      else await agentScopeStore.removeSessionFamily(scope.rootSessionId);
      return ack;
    } finally {
      forgetLive(scope.rootSessionId);
      agentScopeStore.releaseSessionDelete(reservation);
    }
  };

  const listArchivedWorktreeSessions = async ({
    projectDirectory,
    archiveId,
  }: ArchivedWorktreeSessionsQuery): Promise<{ sessions: ArchivedWorktreeSessionSummary[] }> => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const resolveProject = dependencies.resolveWorkspaceDirectory;
    const project = resolveProject ? await resolveProject(projectDirectory) : null;
    if (!project || !project.hostProjectId) throw new OpenChamberControlError('Project directory is unavailable', 404);
    const binding = await agentScopeStore.getWorktreeArchive({ hostProjectId: project.hostProjectId, archiveId });
    if (!binding) return { sessions: [] };
    const sessions = await Promise.all(binding.sessions.map(async (item) => {
      const metadataState = await sessionMetadataStore.getState(item.sessionId);
      const archiveState = await archiveStore.getState(item.sessionId);
      return {
        sessionId: item.sessionId,
        rootSessionId: item.rootSessionId,
        workspaceId: item.workspaceId,
        metadata: metadataState?.metadata ?? null,
        archivedAt: archiveState?.archivedAt ?? null,
        progress: item.progress,
      };
    }));
    return { sessions };
  };

  const unloadWorker = async (id: string): Promise<void> => {
    forgetLive(id);
    try {
      await request(`/internal/workers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch { void 0; }
  };

  const resolveMoveStartDirectory = createStartDirectoryResolver({
    resolveWorktreeTopLevel: (directory) => {
      if (!dependencies.resolveWorktreeTopLevel) {
        throw new OpenChamberControlError('Worktree start directory resolution is unavailable', 503);
      }
      return dependencies.resolveWorktreeTopLevel(directory);
    },
    validateWorktreeDirectory: (directory, worktreeRoot) => {
      if (!dependencies.validateWorktreeDirectory) {
        throw new OpenChamberControlError('Worktree directory validation is unavailable', 503);
      }
      return dependencies.validateWorktreeDirectory(directory, worktreeRoot);
    },
  });

  const resolveMoveSetup = async (sourceDirectory: string): Promise<WorktreeSetupResult> => {
    if (!dependencies.readWorktreeSetup
      || !dependencies.resolveProjectDirectory
      || !dependencies.worktreeSetupOf) {
      return { startCommand: '', untrustedSkipped: [] };
    }
    const project = await dependencies.resolveProjectDirectory(sourceDirectory).catch(() => null);
    if (!project?.projectId) return { startCommand: '', untrustedSkipped: [] };
    const setup = await dependencies.readWorktreeSetup(project.projectId);
    if (!setup) return { startCommand: '', untrustedSkipped: [] };
    return dependencies.worktreeSetupOf(setup, project.projectDirectory ?? sourceDirectory);
  };

  const moveToWorktree = async (
    sessionId: string,
    payload: JsonValue | {
      worktree: { name?: string; branchName?: string; startRef?: string; existingBranch?: string };
      carry: JsonValue[];
    } | undefined = {},
    options: MoveToWorktreeOptions = {},
  ): Promise<MoveWorktreeResult> => {
    const parsedEnvelope = MoveToWorktreeEnvelopeSchema.safeParse(payload);
    const worktreeInput = parsedEnvelope.success ? parsedEnvelope.data.worktree : undefined;
    const name = asNonEmptyString(worktreeInput?.name);
    if (!name) throw new OpenChamberControlError('worktree.name is required', 400);
    const hasControlChars = Array.from(name).some((ch) => ch.charCodeAt(0) < 0x20);
    if (name.length > 200 || name === '.' || name === '..' || /[\\/]/.test(name) || hasControlChars || /[<>:"|?*]/.test(name)) {
      throw new OpenChamberControlError('worktree.name must be one folder name, relative to the worktree root', 400);
    }
    const existingBranch = asNonEmptyString(worktreeInput?.existingBranch);
    const branchName = asNonEmptyString(worktreeInput?.branchName);
    const startRef = asNonEmptyString(worktreeInput?.startRef);
    if (existingBranch && (branchName || startRef)) {
      throw new OpenChamberControlError(
        'existingBranch checks out that branch as it is; do not combine it with branchName or startRef',
        400,
      );
    }
    const rawCarry = parsedEnvelope.success ? parsedEnvelope.data.carry : undefined;
    const carryListSchema = z.array(z.string().trim().min(1));
    const parsedCarry = carryListSchema.safeParse(rawCarry ?? []);
    if (!parsedCarry.success) {
      throw new OpenChamberControlError('carry is a list of file paths', 400);
    }

    if (!resolveHostRelocationScope) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    const source = await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    if (agentScopeStore) await agentScopeStore.checkWorktreeScope(source.cwd);
    const caller = asNonEmptyString(options.contextSessionId);
    if (caller && caller !== source.rootSessionId) {
      throw new OpenChamberControlError('Only the session itself may move into a worktree', 403);
    }

    const carry = [...new Set(parsedCarry.data)];
    for (const entry of carry) {
      if (path.isAbsolute(entry) || entry.startsWith('..')) {
        throw new OpenChamberControlError('carry entries are workspace-relative file paths', 400);
      }
      const resolved = path.resolve(source.cwd, entry);
      if (!resolved.startsWith(path.resolve(source.cwd) + path.sep)) {
        throw new OpenChamberControlError('carry entries stay inside the session workspace', 400);
      }
    }

    const setup = await resolveMoveSetup(source.cwd);
    const moveSession = async (
      _sessionId: string,
      _startDirectory: string,
      { worktreeRoot }: { worktreeRoot: string },
    ): Promise<{ workspaceId: string; sessions: Session[] }> => {
      if (!dependencies.resolveWorkspaceDirectory) {
        throw new OpenChamberControlError('Host workspace discovery is unavailable', 503);
      }
      const destination = await dependencies.resolveWorkspaceDirectory(worktreeRoot);
      if (!destination) throw new OpenChamberControlError('The new worktree was not admitted as a Host workspace', 503);
      if (destination.projectId !== source.projectId) {
        throw new OpenChamberControlError('The new worktree belongs to another Host project', 403);
      }
      const destinationScope = await (dependencies.resolveHostWorkspaceScope ?? resolveWorkspaceScope)(destination.workspaceId);
      if (!destinationScope
        || destinationScope.projectId !== source.projectId
        || path.resolve(destinationScope.cwd) !== path.resolve(worktreeRoot)) {
        throw new OpenChamberControlError('The new worktree Host scope is unavailable', 503);
      }
      const relocated = await relocate(sessionId, { workspaceId: destination.workspaceId });
      return { workspaceId: destination.workspaceId, sessions: relocated.sessions };
    };

    if (!worktreeMover) {
      const moveDependencies = dependencies.worktreeMove;
      if (!moveDependencies
        || !moveDependencies.createWorktree
        || !moveDependencies.removeWorktree
        || !moveDependencies.waitForWorktreeReady
        || !moveDependencies.hydrateCheckout
        || !moveDependencies.bootstrapStore
        || !moveDependencies.stashPush
        || !moveDependencies.getPathsWithoutChanges
        || !moveDependencies.stashApply
        || !moveDependencies.stashDrop
        || !moveDependencies.listStashes
        || !moveDependencies.getBranches
        || !moveDependencies.resolvePrimaryWorktreeRoot) {
        throw new OpenChamberControlError('Worktree creation is not available on this server', 503);
      }
      const resolvedMoveDependencies: WorktreeMoverDependencies = {
        createWorktree: moveDependencies.createWorktree,
        removeWorktree: moveDependencies.removeWorktree,
        waitForWorktreeReady: moveDependencies.waitForWorktreeReady,
        hydrateCheckout: moveDependencies.hydrateCheckout,
        bootstrapStore: moveDependencies.bootstrapStore,
        stashPush: moveDependencies.stashPush,
        getPathsWithoutChanges: moveDependencies.getPathsWithoutChanges,
        stashApply: moveDependencies.stashApply,
        stashDrop: moveDependencies.stashDrop,
        listStashes: moveDependencies.listStashes,
        getBranches: moveDependencies.getBranches,
        resolvePrimaryWorktreeRoot: moveDependencies.resolvePrimaryWorktreeRoot,
      };
      if (moveDependencies.warn) resolvedMoveDependencies.warn = moveDependencies.warn;
      worktreeMover = dependencies.createSessionWorktreeMover
        ? dependencies.createSessionWorktreeMover(resolvedMoveDependencies)
        : createSessionWorktreeMover(resolvedMoveDependencies);
    }

    const moveInput: Parameters<typeof worktreeMover.move>[0] = {
      sessionId,
      directory: source.cwd,
      name,
      carry,
      startDirectory: ({ worktreeRoot }) => resolveMoveStartDirectory({ projectPath: source.cwd, worktreeRoot }),
      setup,
      moveSession,
    };
    if (branchName) moveInput.branchName = branchName;
    if (startRef) moveInput.startRef = startRef;
    if (existingBranch) moveInput.existingBranch = existingBranch;

    return await worktreeMover.move(moveInput);
  };

  const close = async (): Promise<void> => {
    for (const [workspaceId, entry] of speculativeSessions.entries()) {
      await discardPrepared({ workspaceId }, entry);
    }
  };

  const resolveDirectory = async (payload: JsonValue | { workspaceId?: string; projectId?: string } | undefined = {}): Promise<string> => {
    const parsed = ResolveDirectoryPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Workspace was not found', 404);
    const scope = await resolveWorkspaceScope(parsed.data.workspaceId);
    if (!scope) throw new OpenChamberControlError('Workspace was not found', 404);
    return scope.cwd;
  };

  return {
    create,
    prepare,
    discardPrepared,
    close,
    send,
    steer,
    followUp,
    fork,
    selectBranch,
    relocate,
    moveToWorktree,
    delete: remove,
    open,
    history,
    promptReceipt,
    list,
    listArchivedWorktreeSessions,
    control,
    rename,
    resolveDirectory,
    archive,
    unarchive,
    getMetadata,
    setMetadata,
    setSessionLinks,
    sessionMetadataStore,
    archiveStore,
    unloadWorker,
    captureWorktreeArchive,
    prepareWorktreeArchiveRemoval,
    finishWorktreeArchive,
    rollbackWorktreeArchive,
    discardWorktreeArchive,
    resolveWorktreeArchivePinnedTarget,
    prepareWorktreeArchiveRestore,
    pinWorktreeArchiveRestore,
    markWorktreeArchiveRestoreAttempted,
    finishWorktreeArchiveRestore,
    finalizeWorktreeArchiveRestore,
    releaseWorktreeArchiveRestore,
    cleanupWorktreeArchiveRestore,
    prepareWorktreeArchiveDelete,
    claimWorktreeArchiveDelete,
    deleteWorktreeArchiveSessions,
    finalizeWorktreeArchiveDelete,
    resolveAdmissionRecovery: (owner: { recoveringRemoval: boolean }): boolean => owner.recoveringRemoval,
    markWorktreeArchiveDeleteCasCompleted: (owner: WorktreeArchiveOwner, revision: number) => {
      if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
      return agentScopeStore.markWorktreeArchiveDeleteCasCompleted(owner.key, owner.claimId, revision);
    },
    markWorktreeArchiveRestoreCasStarted: async (owner: WorktreeArchiveOwner, revision: number): Promise<WorktreeArchiveBinding> => {
      if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
      const binding = await agentScopeStore.markWorktreeArchiveRestoreCasStarted(owner.key, owner.claimId, revision);
      if (!binding) throw new OpenChamberControlError('Archive binding is unavailable', 503);
      return binding;
    },
    markWorktreeArchiveRestoreCasCompleted: (owner: WorktreeArchiveOwner, revision: number) => {
      if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
      return agentScopeStore.markWorktreeArchiveRestoreCasCompleted(owner.key, owner.claimId, revision);
    },
  };
};

export type OpenChamberSessionService = ReturnType<typeof createCanonicalSessionService>;

export const createOpenChamberSessionService = (
  dependencies: OpenChamberSessionServiceDependencies,
): OpenChamberSessionService => createCanonicalSessionService(dependencies);

const sendServiceError = (res: HttpResponse, cause: unknown, fallback: string): HttpResponse => {
  const controlError = asControlError(cause, fallback);
  const parsedStatus = StatusCodeSchema.safeParse(controlError.statusCode);
  const status = parsedStatus.success ? parsedStatus.data : 500;
  const meta = ErrorMetaSchema.safeParse(cause);
  const code = meta.success && meta.data.code
    ? meta.data.code
    : status === 404
      ? 'SESSION_NOT_FOUND'
      : status === 400
        ? 'INVALID_REQUEST'
        : status === 401 || status === 403
          ? 'UNAUTHORIZED'
          : status === 503
            ? 'SERVICE_UNAVAILABLE'
            : 'INTERNAL_ERROR';
  const problem = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`,
    title: fallback,
    status,
    detail: controlError.message || fallback,
    code,
    retryable: meta.success && meta.data.retryable !== undefined ? meta.data.retryable : status >= 500,
  });
  return res.status(status).type('application/problem+json').json(problem);
};

export type OpenChamberSessionRoutesDependencies =
  | {
    isRequestOriginAllowed: (req: Request) => boolean | Promise<boolean>;
    sessionService: OpenChamberSessionService;
  }
  | (OpenChamberSessionServiceDependencies & {
    isRequestOriginAllowed: (req: Request) => boolean | Promise<boolean>;
    sessionService?: undefined;
  });

const asBodyPayload = (body: JsonValue | undefined): JsonValue | undefined => body ?? {};

export const registerOpenChamberSessionRoutes = (
  app: Application,
  dependencies: OpenChamberSessionRoutesDependencies,
): void => {
  if (!dependencies.isRequestOriginAllowed) throw new Error('Session routes require isRequestOriginAllowed');
  const service = dependencies.sessionService ?? createOpenChamberSessionService(dependencies);

  app.post<JsonValue>('/api/openchamber/sessions', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.create(asBodyPayload(req.body)));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to create session:', error);
      return sendServiceError(res, error, 'Failed to create session');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/archive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.archive(asBodyPayload(req.body)));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to archive sessions:', error);
      return sendServiceError(res, error, 'Failed to archive sessions');
    }
  });

  app.get('/api/openchamber/sessions/:sessionId/metadata', async (req, res) => {
    try {
      return res.json(await service.getMetadata(req.params.sessionId ?? ''));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to read session metadata:', error);
      return sendServiceError(res, error, 'Failed to read session metadata');
    }
  });

  app.patch<JsonValue>('/api/openchamber/sessions/:sessionId/metadata', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.setMetadata(req.params.sessionId ?? '', asBodyPayload(req.body)));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to store session metadata:', error);
      return sendServiceError(res, error, 'Failed to store session metadata');
    }
  });

  app.patch<JsonValue>('/api/openchamber/sessions/:sessionId/title', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      return res.json(await service.rename(req.params.sessionId ?? '', asBodyPayload(req.body)));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to rename session');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/:sessionId/links', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.setSessionLinks(req.params.sessionId ?? '', asBodyPayload(req.body)));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to update session links:', error);
      return sendServiceError(res, error, 'Failed to update session links');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/unarchive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.unarchive(asBodyPayload(req.body)));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to unarchive sessions:', error);
      return sendServiceError(res, error, 'Failed to unarchive sessions');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/:sessionId/send', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const idempotencyKey = req.get('Idempotency-Key');
      return res.json(await service.send(
        req.params.sessionId ?? '',
        req.body,
        Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey,
      ));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to send session:', error);
      return sendServiceError(res, error, 'Failed to send session');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/:sessionId/steer', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const idempotencyKey = req.get('Idempotency-Key');
      return res.json(await service.steer(
        req.params.sessionId ?? '',
        req.body || {},
        Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey,
      ));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to steer session');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/:sessionId/follow-up', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const idempotencyKey = req.get('Idempotency-Key');
      return res.json(await service.followUp(
        req.params.sessionId ?? '',
        req.body || {},
        Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey,
      ));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to submit session follow-up');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/:sessionId/fork', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.fork(req.params.sessionId ?? '', req.body));
    } catch (error) {
      console.error('[OhPiChamberSessions] failed to fork session:', error);
      return sendServiceError(res, error, 'Failed to fork session');
    }
  });

  app.get('/api/openchamber/sessions/:sessionId', async (req, res) => {
    try {
      return res.json(await service.open(req.params.sessionId ?? ''));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to open session');
    }
  });

  app.get('/api/openchamber/sessions/:sessionId/history', async (req, res) => {
    try {
      return res.json(await service.history(req.params.sessionId ?? '', serializeQuery(req.query)));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to read session history');
    }
  });

  app.post<JsonValue>('/api/openchamber/sessions/:sessionId/control', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.control(req.params.sessionId ?? '', req.body || {}));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to control session');
    }
  });

  app.get('/api/openchamber/worktrees/archives/sessions', async (req, res) => {
    try {
      const parsed = ArchivedWorktreeQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'projectDirectory and archiveId are required' });
      }
      return res.json(await service.listArchivedWorktreeSessions(parsed.data));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to list archived worktree sessions');
    }
  });
};

export const registerCanonicalSessionRoutes = (router: Router, service: OpenChamberSessionService): void => {
  const call = async (res: HttpResponse, operation: () => Promise<JsonValue | object>, fallback: string): Promise<void> => {
    try {
      res.json(await operation());
    } catch (error) {
      sendServiceError(res, error, fallback);
    }
  };

  router.post<JsonValue>('/', express.json({ limit: '1mb' }), (req, res) =>
    call(res, () => service.create(req.body || {}), 'Failed to create session'));
  router.post<JsonValue>('/prepare', express.json({ limit: '1mb' }), (req, res) =>
    call(res, () => service.prepare(req.body || {}), 'Failed to prepare session'));
  router.delete<JsonValue>('/prepare', express.json({ limit: '1mb' }), (req, res) =>
    call(res, () => service.discardPrepared(req.body || {}), 'Failed to discard prepared session'));
  router.get('/', (req, res) => call(res, () => {
    const workspace = EntityIdSchema.safeParse(req.query.workspaceId);
    return service.list(workspace.success ? workspace.data : undefined);
  }, 'Failed to list sessions'));
  router.get('/:sessionId/snapshot', (req, res) =>
    call(res, () => service.open(req.params.sessionId ?? ''), 'Failed to open session snapshot'));
  router.get('/:sessionId', (req, res) =>
    call(res, () => service.open(req.params.sessionId ?? ''), 'Failed to open session'));
  router.get('/:sessionId/history', (req, res) =>
    call(res, () => service.history(req.params.sessionId ?? '', serializeQuery(req.query)), 'Failed to read session history'));
  router.get('/:sessionId/prompt-receipts/:correlationId', (req, res) =>
    call(res, () => service.promptReceipt(req.params.sessionId ?? '', req.params.correlationId ?? ''), 'Failed to read prompt receipt'));
  router.post<JsonValue>('/:sessionId/runs', express.json({ limit: '1mb' }), (req, res) => {
    const idempotencyKey = req.get('Idempotency-Key');
    return call(
      res,
      () => service.send(req.params.sessionId ?? '', req.body || {}, Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey),
      'Failed to submit session run',
    );
  });
  router.post<JsonValue>('/:sessionId/steer', express.json({ limit: '1mb' }), (req, res) => {
    const idempotencyKey = req.get('Idempotency-Key');
    return call(
      res,
      () => service.steer(req.params.sessionId ?? '', req.body || {}, Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey),
      'Failed to steer session',
    );
  });
  router.post<JsonValue>('/:sessionId/follow-up', express.json({ limit: '1mb' }), (req, res) => {
    const idempotencyKey = req.get('Idempotency-Key');
    return call(
      res,
      () => service.followUp(req.params.sessionId ?? '', req.body || {}, Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey),
      'Failed to submit session follow-up',
    );
  });
  router.post<JsonValue>('/:sessionId/fork', express.json({ limit: '1mb' }), (req, res) =>
    call(res, () => service.fork(req.params.sessionId ?? '', req.body || {}), 'Failed to fork session'));
  router.post<JsonValue>('/:sessionId/control', express.json({ limit: '1mb' }), (req, res) =>
    call(res, () => service.control(req.params.sessionId ?? '', req.body || {}), 'Failed to control session'));
  router.delete('/:sessionId', (req, res) =>
    call(res, () => service.delete(req.params.sessionId ?? ''), 'Failed to delete session'));
  router.get('/:sessionId/metadata', (req, res) =>
    call(res, () => service.getMetadata(req.params.sessionId ?? ''), 'Failed to read session metadata'));
  router.patch<JsonValue>('/:sessionId/metadata', express.json({ limit: '1mb' }), (req, res) =>
    call(res, () => service.setMetadata(req.params.sessionId ?? '', req.body || {}), 'Failed to write session metadata'));
  router.patch<JsonValue>('/:sessionId/title', express.json({ limit: '64kb' }), (req, res) =>
    call(res, () => service.rename(req.params.sessionId ?? '', req.body || {}), 'Failed to rename session'));
  router.post<JsonValue>('/:sessionId/branch', express.json({ limit: '256kb' }), (req, res) =>
    call(res, () => service.selectBranch(req.params.sessionId ?? '', req.body || {}), 'Failed to select session branch'));
  router.post<JsonValue>('/:sessionId/relocate', express.json({ limit: '256kb' }), (req, res) =>
    call(res, () => service.relocate(req.params.sessionId ?? '', req.body || {}), 'Failed to relocate session'));
  router.post<JsonValue>('/:sessionId/move-to-worktree', express.json({ limit: '256kb' }), (req, res) =>
    call(res, () => service.moveToWorktree(req.params.sessionId ?? '', req.body || {}), 'Failed to move session into a worktree'));
};
