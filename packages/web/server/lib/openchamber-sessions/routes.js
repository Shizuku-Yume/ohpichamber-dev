import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { assertRootPromptAdmission } from '../message-queue/prompt-admission.js';
import { SessionCreateAckSchema, SessionCreateRequestSchema, RuntimeSessionSchema, SessionSchema, RunSchema, RunAbortRequestSchema, SessionDeleteAckSchema, PromptRequestSchema, CapturedSendOptionsSchema, SessionSnapshotSchema, HistoryPageSchema, SessionMetadataStateSchema, SessionMetadataPatchSchema, SessionTitleRequestSchema, SteerRequestSchema, SteerAckSchema, FollowUpRequestSchema, FollowUpAckSchema, ProblemDetailsSchema, ProblemCodeSchema, SessionControlRequestSchema, SessionControlAckSchema, EntityIdSchema } from '@openchamber/agent-contract';
import { SessionBranchRequestSchema, SessionBranchResultSchema, SessionRelocateRequestSchema, SessionRelocateResultSchema } from '@openchamber/agent-contract';
import { HostSessionRelocationPrepareSchema, HostSessionRelocationPreparedSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationFinalizedSchema, HostSessionRelocationPendingSchema } from '@openchamber/agent-service/private-protocol';
import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';
import { buildLinkedIssuesPatch, parseLinkOperation } from './session-linked-issues.js';
import { createSessionWorktreeMover } from './worktree-move.js';
import { createStartDirectoryResolver } from './worktree-start-directory.js';
const SessionForkAckSchema = z.strictObject({ sessionId: z.string().min(1), rootSessionId: z.string().min(1), sessionFile: z.string().min(1), sourceSessionId: z.string().min(1), entryId: z.string().min(1).nullable(), mode: z.enum(['selected', 'full']) });
const SessionForkRequestSchema = z.strictObject({ messageId: EntityIdSchema.optional(), mode: z.enum(['selected', 'full']) }).refine(
  (input) => input.mode === 'selected' ? input.messageId !== undefined : input.messageId === undefined,
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
const COLD_REFUSAL_CODES = new Set(['SESSION_NOT_FOUND', 'SERVICE_UNAVAILABLE', 'SESSION_RESTORE_FAILED']);
/**
 * A verified refusal that means the addressed root has no live worker, so a
 * reopen may fix it. Capacity exhaustion and in-flight runs name a service
 * that is up; retrying them would only repeat the same refusal.
 */
const isVerifiedColdRefusal = (error) => error?.refusalVerified === true
  && COLD_REFUSAL_CODES.has(error?.code)
  && !(error?.details && error.details.reason === 'worker_capacity');

const parseCommand = (schema, payload) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new OpenChamberControlError('Session command is invalid', 400);
  return parsed.data;
};




/**
 * Upper bound on one archive batch.
 *
 * The batch is a bounded amount of work on one request, and callers with more
 * sessions than this send several batches and keep their own partial results.
 */
const MAX_ARCHIVE_BATCH = 500;

const parseIdBatch = (payload) => {
  const rawIds = payload?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, error: 'ids must be a non-empty array of session ids' };
  }
  if (rawIds.length > MAX_ARCHIVE_BATCH) {
    return { ok: false, error: `ids must contain at most ${MAX_ARCHIVE_BATCH} session ids` };
  }

  const ids = [];
  for (const value of rawIds) {
    const parsed = EntityIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: 'ids must contain valid session ids' };
    ids.push(parsed.data);
  }
  return { ok: true, ids };
};

const parseArchiveRequest = (payload) => {
  const parsed = parseIdBatch(payload);
  if (!parsed.ok) return parsed;

  const archivedAt = payload?.archivedAt;
  if (archivedAt !== undefined && (!Number.isSafeInteger(archivedAt) || archivedAt <= 0)) {
    return { ok: false, error: 'archivedAt must be a positive integer timestamp' };
  }

  return { ok: true, ids: parsed.ids, archivedAt: archivedAt ?? Date.now() };
};


const createCanonicalSessionService = (dependencies) => {
  const { service, resolveWorkspaceScope, resolveSessionScope, resolveHostSessionScope, listWorkspaceScopes, registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted, directCommandAdmissionStore, publishSessionEvent, archiveStore, sessionMetadataStore, persistSessionMetadata, updateSessionMetadata, broadcastGlobalUiEvent, onArchiveDeleted } = dependencies;
  const { agentScopeStore, resolveHostRelocationScope } = dependencies;
  const relocationControls = new Set();
  const worktreeArchiveGeneration = `host_${process.pid}_${randomUUID()}`;
  // The retained session-worktree move: same creation pipeline as the New
  // worktree dialog, one stash for the carried files, and `relocate` for the
  // move itself. Every dependency is injected so the decision stays testable
  // and the Host owns the Git and bootstrap authority.
  const worktreeMover = typeof dependencies.createSessionWorktreeMover === 'function'
    ? dependencies.createSessionWorktreeMover(dependencies.worktreeMove ?? {})
    : createSessionWorktreeMover(dependencies.worktreeMove ?? {});
  const requiredFunctions = [service?.request, resolveWorkspaceScope, resolveSessionScope, resolveHostSessionScope,
    registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted,
  directCommandAdmissionStore?.claim, directCommandAdmissionStore?.accept];
  if (!service || requiredFunctions.some((candidate) => !z.function().safeParse(candidate).success))
    throw new Error('session routes require the Agent service, Host scope resolvers, registration, attachment, delivery and direct command admission owners');
  const resolveHostTools = dependencies.resolveHostTools
    ? dependencies.resolveHostTools
    : async () => {
      const settings = typeof dependencies.readSettings === 'function'
        ? await dependencies.readSettings().catch(() => null)
        : null;
      if (!settings) return undefined;
      return {
        openchamber: settings.agentControlToolEnabled !== false,
        web: settings.agentWebToolEnabled !== false,
        openchamber_knowledge: settings.agentKnowledgeToolEnabled !== false,
        notify: settings.agentNotifyToolEnabled === true,
        openchamber_render: settings.agentRenderToolEnabled !== false,
        openchamber_workflow: settings.agentWorkflowToolEnabled !== false,
      };
    };
  const request = async (pathname, init = {}) => {
    const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(body);
      const error = new OpenChamberControlError(problem.success ? problem.data.detail : body?.detail || body?.error || 'Agent service request failed', response.status);
      error.code = problem.success ? problem.data.code : body?.code;
      // A well-formed problem proves the Agent Service refused the command, so
      // a caller may distinguish a cold worker from an uncertain transport loss.
      error.refusalVerified = problem.success;
      error.retryable = problem.success ? problem.data.retryable : false;
      if (problem.success && problem.data.details) error.details = problem.data.details;
      throw error;
    }
    return body;
  };
  const scopeFor = async (sessionId) => {
    const owner = resolveHostRelocationScope ? await resolveHostRelocationScope(sessionId) : null;
    if (owner && agentScopeStore && await agentScopeStore.getRelocation(owner.rootSessionId)) {
      if (relocationControls.has(owner.rootSessionId)) throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
      relocationControls.add(owner.rootSessionId);
      try { await recoverRelocation(owner.rootSessionId); } finally { relocationControls.delete(owner.rootSessionId); }
    }
    const resolved = (owner && liveRootSessions.has(owner.rootSessionId)) ? await resolveHostSessionScope(sessionId) : await resolveSessionScope(sessionId);
    if (!resolved || resolved.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    const scope = subagentSessions.has(sessionId) && resolved.parentSessionId === undefined
      ? { ...resolved, parentSessionId: subagentSessions.get(sessionId) }
      : resolved;
    return scope;
  };
  const hostScopeFor = async (sessionId) => { const scope = await resolveHostSessionScope(sessionId); if (!scope || scope.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404); return scope; };
  const assertWritableScope = (scope) => {
    if (scope.workspaceId.startsWith('archive_')) throw new OpenChamberControlError('Deleted-space sessions are permanently read-only', 409, { code: 'SESSION_READ_ONLY', retryable: false });
  };
  const emit = (event) => { try { publishSessionEvent?.(event); } catch { } try { broadcastGlobalUiEvent?.(event); } catch { } };
  // Roots this process confirmed live through a successful reopen or run
  // acknowledgement. A warm send then dispatches without another reopen;
  // delete, relocation, unload and a failed reopen forget the confirmation.
  const liveRootSessions = new Set();
  const rememberLive = (rootSessionId) => { liveRootSessions.add(rootSessionId); };
  const forgetLive = (rootSessionId) => { liveRootSessions.delete(rootSessionId); };
  const subagentSessions = new Map();
  const metadata = {
    getState: (id) => sessionMetadataStore.getState(id), set: async (id, patch, directory = '') => {
      if (persistSessionMetadata) return persistSessionMetadata(id, patch, { directory });
      // The fallback owns the store for module tests and compositions without an
      // injected writer, so it announces the committed merge like that writer.
      const result = await sessionMetadataStore.setSessionMetadata(id, patch);
      if (result.changed) {
        try { broadcastGlobalUiEvent?.({ type: 'openchamber:session-metadata', properties: { sessionId: id, sessionID: id, metadata: result.metadata, revision: result.revision } }); } catch { }
      }
      return result;
    }
  };
  const withSessionAdmission = async (scope, operation, rootSessionId, work, readOnly = false) => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host session admission authority is unavailable', 503);
    const admission = await agentScopeStore.reserveSessionAdmission(scope.workspaceId, operation, rootSessionId);
    let complete = false;
    try {
      const result = await work(() => { complete = true; });
      complete = true;
      return result;
    } catch (error) {
      // A validated supervisor refusal is authoritative: no native admission
      // was accepted, so it must not strand the Host scope fence.
      if (error instanceof OpenChamberControlError && error.statusCode >= 400 && error.statusCode < 500) complete = true;
      if (!complete && !readOnly) throw new OpenChamberControlError('Native session admission outcome is uncertain; the worktree archive remains blocked until the admission is reconciled', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false, cause: error });
      throw error;
    } finally {
      if (complete || readOnly) await agentScopeStore.releaseSessionAdmission(admission);
      else agentScopeStore.markSessionAdmissionUncertain(admission);
    }
  };
  const speculativeSessions = new Map();

  const discardPrepared = async (payload = {}) => {
    const workspaceId = payload?.workspaceId;
    if (!workspaceId) return { ok: false };
    const existing = speculativeSessions.get(workspaceId);
    if (!existing) return { ok: true };
    speculativeSessions.delete(workspaceId);
    clearTimeout(existing.timer);
    try {
      const session = await existing.promise;
      await remove(session.sessionId);
    } catch { }
    return { ok: true };
  };

  const prepare = async (payload = {}) => {
    const { projectId, workspaceId } = payload ?? {};
    if (!projectId || !workspaceId) throw new OpenChamberControlError('Project and workspace identity required', 400);
    const existing = speculativeSessions.get(workspaceId);
    if (existing) {
      const session = await existing.promise;
      return { ok: true, sessionId: session.sessionId };
    }
    const timer = setTimeout(() => { void discardPrepared({ workspaceId }); }, 5 * 60 * 1000);
    timer.unref?.();
    const preparePromise = (async () => {
      const workspace = await resolveWorkspaceScope(workspaceId);
      if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
      assertWritableScope(workspace);
      const rootSessionId = randomUUID();
      const workspaceDisplay = z.object({ displayPath: z.string().nullable().optional(), env: z.record(z.string(), z.string()).optional() }).passthrough().parse(workspace);
      const displayPath = workspaceDisplay.displayPath && !workspaceDisplay.displayPath.startsWith('/') && !workspaceDisplay.displayPath.startsWith('\\') && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath) ? workspaceDisplay.displayPath : 'workspace';
      const hostTools = await resolveHostTools();
      const defaultOptions = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
      const sessionBootstrap = {
        rootSessionId, projectId, workspaceId,
        cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId,
        displayPath, options: defaultOptions, deferred: false,
        ...(hostTools ? { hostTools } : {}),
      };
      if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
      return await withSessionAdmission(workspace, 'create', rootSessionId, async (settled) => {
        const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sessionBootstrap) });
        const runtime = RuntimeSessionSchema.parse(body);
        if (runtime.projectId !== projectId || runtime.workspaceId !== workspaceId || runtime.rootSessionId !== rootSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
        if (!await registerSessionScope(runtime)) throw new OpenChamberControlError('Session scope registration failed', 500);
        settled();
        rememberLive(runtime.sessionId);
        return runtime;
      });
    })();
    speculativeSessions.set(workspaceId, { promise: preparePromise, timer });
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

  const create = async (payload = {}) => {
    const parsed = SessionCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session create request is invalid', 400);
    const { projectId, workspaceId, metadata: requestedMetadata, parentSessionId } = parsed.data;
    const options = CapturedSendOptionsSchema.parse(parsed.data.options);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
    assertWritableScope(workspace);
    if (parentSessionId !== undefined) {
      const parentScope = await resolveSessionScope(parentSessionId);
      if (!parentScope) throw new OpenChamberControlError('Parent session was not found', 404);
      if (parentScope.workspaceId !== workspaceId || parentScope.projectId !== projectId) {
        throw new OpenChamberControlError('Parent session is outside the authorized workspace and project', 403);
      }
      assertWritableScope(parentScope);
    }
    const speculative = (parentSessionId === undefined) ? speculativeSessions.get(workspaceId) : undefined;
    let session;
    if (speculative) {
      speculativeSessions.delete(workspaceId);
      clearTimeout(speculative.timer);
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
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(SessionTitleRequestSchema.parse({ workspaceId, title: parsed.data.title })),
        }));
        if (renamed.sessionId !== session.sessionId || renamed.workspaceId !== workspaceId) throw new OpenChamberControlError('Session title response was out of scope', 502);
        Object.assign(session, renamed);
      }
    } else {
      const rootSessionId = randomUUID();
      const workspaceDisplay = z.object({ displayPath: z.string().nullable().optional(), env: z.record(z.string(), z.string()).optional() }).passthrough().parse(workspace);
      const displayPath = workspaceDisplay.displayPath && !workspaceDisplay.displayPath.startsWith('/') && !workspaceDisplay.displayPath.startsWith('\\') && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath) ? workspaceDisplay.displayPath : 'workspace';
      const hostTools = await resolveHostTools();
      const sessionBootstrap = {
        rootSessionId, projectId, workspaceId,
        cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId,
        displayPath, options, deferred: true,
        ...(hostTools ? { hostTools } : {}),
      };
      if (parentSessionId !== undefined) sessionBootstrap.parentSessionId = parentSessionId;
      if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
      session = await withSessionAdmission(workspace, 'create', rootSessionId, async (settled) => {
        const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sessionBootstrap) });
        const runtime = RuntimeSessionSchema.parse(body);
        if (runtime.projectId !== projectId || runtime.workspaceId !== workspaceId || runtime.rootSessionId !== rootSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
        if (parentSessionId !== undefined && runtime.parentSessionId !== parentSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope parent linkage', 502);
        if (!await registerSessionScope(runtime)) throw new OpenChamberControlError('Session scope registration failed', 500);
        if (parentSessionId !== undefined) subagentSessions.set(runtime.sessionId, parentSessionId);
        if (parsed.data.title) {
          const renamed = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(runtime.sessionId)}/title`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(SessionTitleRequestSchema.parse({ workspaceId, title: parsed.data.title })),
          }));
          if (renamed.sessionId !== runtime.sessionId || renamed.workspaceId !== workspaceId) throw new OpenChamberControlError('Session title response was out of scope', 502);
          Object.assign(runtime, renamed);
        }
        settled();
        rememberLive(runtime.sessionId);
        return runtime;
      });
    }
    if (requestedMetadata) await metadata.set(session.sessionId, requestedMetadata, workspace.cwd);
    const stored = await sessionMetadataStore.getState(session.sessionId);
    const result = SessionCreateAckSchema.parse({ session: SessionSchema.parse({ ...session, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: '0' }) });
    emit({ type: 'openchamber:session-created', properties: { sessionId: session.sessionId, projectId, workspaceId } });
    return result;
  };
  const prepareDelivery = async (scope, requestBody, identity = {}, capturedRequest = null) => {
    const isRoot = scope.parentSessionId === undefined;
    const captured = capturedRequest ?? await capturePrompt(scope, requestBody);
    const admitted = isRoot ? assertRootPromptAdmission(captured) : captured;
    const capture = { ...identity, request: admitted };
    await beforeDispatch(scope, capture);
    try {
      const attachments = await resolveAttachments(scope, admitted.input.attachments);
      return { ...capture, attachments };
    } catch (error) {
      if (error?.code === 'PAYLOAD_TOO_LARGE' || error?.code === 'INVALID_REQUEST') {
        throw new OpenChamberControlError(error.message, error.statusCode ?? (error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400), { code: error.code, retryable: false });
      }
      throw error;
    }
  };
  const deliver = async (operation, sessionId, payload, commandId) => {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    const parsed = PromptRequestSchema.safeParse(operation === 'send' ? payload : payload?.request ?? payload);
    if (!parsed.success || (operation !== 'send' && payload?.sessionId !== undefined && payload.sessionId !== sessionId)) {
      throw new OpenChamberControlError('Prompt request is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const requestBody = operation === 'steer' ? SteerRequestSchema.parse({ sessionId, request: parsed.data }).request
      : operation === 'followUp' ? FollowUpRequestSchema.parse({ sessionId, request: parsed.data }).request : parsed.data;
    const isRoot = scope.parentSessionId === undefined;
    if (isRoot) assertRootPromptAdmission(requestBody);
    if (commandId !== undefined && !EntityIdSchema.safeParse(commandId).success) {
      throw new OpenChamberControlError('Command key is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const claim = commandId === undefined ? null : await directCommandAdmissionStore.claim(scope, commandId, operation, requestBody);
    if (claim?.state === 'accepted') return claim.acknowledgment;
    const captured = await capturePrompt(scope, requestBody);
    const capturedRequest = isRoot ? assertRootPromptAdmission(captured) : captured;
    const deliveryRunId = randomUUID();
    const deliveryIdentity = { deliveryRunId };
    if (operation === 'send') deliveryIdentity.runId = deliveryRunId;
    if (commandId !== undefined) deliveryIdentity.commandId = commandId;
    const capture = await prepareDelivery(scope, requestBody, deliveryIdentity, capturedRequest);
    // The Host owns the mutation boundary: a cold send must reopen its root
    // before Agent Service prompt admission sees an unavailable runtime. Capture
    // and validation stay ahead of this so an invalid prompt starts no worker.
    // Steer and follow-up need an already-live run, so they never reopen.
    // A root already confirmed live dispatches directly; only a verified cold
    // refusal reopens and retries that same dispatch once.
    if (operation === 'send' && !liveRootSessions.has(scope.rootSessionId)) await reopen(scope);
    let acknowledgment;
    let receipt;
    try {
      const pathname = operation === 'send' ? 'runs' : operation === 'steer' ? 'steer' : 'follow-up';
      const body = operation === 'send' ? { type: 'prompt', runId: deliveryRunId, request: capture.request, attachments: capture.attachments }
        : { request: capture.request, attachments: capture.attachments };
      const dispatch = () => request(`/internal/sessions/${encodeURIComponent(sessionId)}/${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      let response;
      try {
        response = await dispatch();
      } catch (error) {
        // Only a verified cold refusal retries: it proves native admission never
        // accepted this command, so resending cannot duplicate an admitted run.
        if (operation !== 'send' || !isVerifiedColdRefusal(error)) throw error;
        await reopen(scope);
        response = await dispatch();
      }
      if (operation === 'send') {
        const run = RunSchema.parse(response?.run);
        if (run.sessionId !== sessionId || run.runId !== deliveryRunId) throw new Error('Native run acknowledgement does not match the admitted command');
        acknowledgment = { run };
        receipt = { runId: run.runId, deliveryRunId, run };
        rememberLive(scope.rootSessionId);
      } else {
        acknowledgment = (operation === 'steer' ? SteerAckSchema : FollowUpAckSchema).parse(response);
        if (acknowledgment.sessionId !== sessionId) throw new Error('Native acknowledgement does not match the admitted session');
        receipt = operation === 'steer' ? { runId: acknowledgment.runId, deliveryRunId, ack: acknowledgment }
          : { deliveryRunId, followUpId: acknowledgment.followUpId, ack: acknowledgment };
      }
    } catch (error) {
      // Any failed send path voids the live confirmation — a failed dispatch, a
      // failed cold retry, or an acknowledgement that does not name this run.
      // A later prompt then verifies the worker again instead of trusting memory.
      if (operation === 'send') forgetLive(scope.rootSessionId);
      // A failed transport or malformed acknowledgement cannot prove that native execution did not accept the command.
      if (claim && !(error instanceof OpenChamberControlError && error.refusalVerified === true)) {
        throw new OpenChamberControlError('Command acceptance is uncertain; it will not be dispatched again', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false });
      }
      throw error;
    }
    try {
      const acceptedCapture = { ...capture, receipt };
      if (receipt.runId) acceptedCapture.runId = receipt.runId;
      await onPromptAccepted(scope, acceptedCapture, receipt);
    } catch (error) {
      if (claim) throw new OpenChamberControlError('Command was accepted but its delivery receipt is incomplete', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false });
      throw error;
    }
    // Keep the claim pending if this durable write fails, rather than authorizing an unsafe resend.
    if (claim) await directCommandAdmissionStore.accept(scope, commandId, claim.claimId, acknowledgment);
    return acknowledgment;
  };
  const send = (sessionId, payload = {}, commandId) => deliver('send', sessionId, payload, commandId);
  const steer = (sessionId, payload = {}, commandId) => deliver('steer', sessionId, payload, commandId);
  const followUp = (sessionId, payload = {}, commandId) => deliver('followUp', sessionId, payload, commandId);
  const fork = async (sessionId, payload = {}) => {
    const source = await scopeFor(sessionId);
    assertWritableScope(source);
    const input = parseCommand(SessionForkRequestSchema, payload);
    const child = await withSessionAdmission(source, 'fork', source.rootSessionId, async (settled) => {
      await reopenNative(source);
      const entryId = input.mode === 'selected' ? asNonEmptyString((await request(`/internal/sessions/${encodeURIComponent(sessionId)}/native-entry/${encodeURIComponent(input.messageId)}`)).entryId) : null;
      if (input.mode === 'selected' && !entryId) { settled(); throw new OpenChamberControlError('Selected message is unavailable', 409); }
      const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceSessionId: sessionId, entryId, mode: input.mode }) });
      const ack = SessionForkAckSchema.parse(body);
      if (ack.sourceSessionId !== sessionId || ack.entryId !== entryId || ack.mode !== input.mode) throw new OpenChamberControlError('Fork acknowledgement does not match the requested source', 502);
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(ack.sessionId)}`));
      if (runtime.sessionId !== ack.sessionId || runtime.rootSessionId !== ack.rootSessionId || runtime.projectId !== source.projectId || runtime.workspaceId !== source.workspaceId) throw new OpenChamberControlError('Fork acknowledgement is outside the source scope', 502);
      if (!await registerSessionScope(runtime)) throw new OpenChamberControlError('Forked session scope registration failed', 500);
      settled();
      return runtime;
    });
    const stored = await sessionMetadataStore.getState(child.sessionId);
    const archive = await archiveStore.getState(child.sessionId);
    const projected = { ...child, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
    if (archive?.archivedAt != null) projected.archivedAt = archive.archivedAt;
    return SessionCreateAckSchema.parse({ session: SessionSchema.parse(projected) });
  };
  const reopenNative = async (scope) => {
    const hostTools = scope.hostTools ?? (typeof resolveHostTools === 'function' ? await resolveHostTools().catch(() => null) : null);
    const privateScope = {
      rootSessionId: scope.rootSessionId,
      projectId: scope.projectId,
      workspaceId: scope.workspaceId,
      cwd: scope.cwd,
      agentDirectory: scope.agentDirectory,
      agentDirectoryId: scope.agentDirectoryId,
      displayPath: scope.displayPath ?? 'workspace',
      ...(hostTools ? { hostTools } : {}),
    };
    if (scope.env) privateScope.env = scope.env;
    const bootstrap = SessionReopenScopeSchema.parse(privateScope);
    const runtime = RuntimeSessionSchema.parse(await request(`/internal/sessions/${encodeURIComponent(bootstrap.rootSessionId)}/reopen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bootstrap) }));
    if (runtime.sessionId !== bootstrap.rootSessionId || runtime.rootSessionId !== bootstrap.rootSessionId || runtime.projectId !== bootstrap.projectId || runtime.workspaceId !== bootstrap.workspaceId) throw new OpenChamberControlError('Session restore acknowledgement is outside the authorized scope', 502);
  };
  const reopen = async (scope) => {
    try {
      await withSessionAdmission(scope, 'reopen', scope.rootSessionId, () => reopenNative(scope));
      rememberLive(scope.rootSessionId);
    } catch (error) {
      forgetLive(scope.rootSessionId);
      throw error;
    }
  };
  const open = async (id) => { const scope = await scopeFor(id); const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`)); if (snapshot.session.sessionId !== id || snapshot.session.projectId !== scope.projectId || snapshot.session.workspaceId !== scope.workspaceId) throw new OpenChamberControlError('Session snapshot is outside the authorized scope', 502); return snapshot; };
  const history = async (id, query = '') => { const scope = await scopeFor(id); const page = HistoryPageSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`)); if (page.sessionId !== id || page.turns.some(turn => turn.projectId !== undefined && turn.projectId !== scope.projectId) || page.messages.some(message => message.projectId !== undefined && message.projectId !== scope.projectId)) throw new OpenChamberControlError('Session history is outside the authorized scope', 502); return page; };
  const list = async (workspaceId) => {
    const scopePage = workspaceId ? { items: [{ workspaceId }], errors: {} } : await (listWorkspaceScopes instanceof Function ? listWorkspaceScopes() : Promise.reject(new OpenChamberControlError('Workspace enumeration is unavailable', 503)));
    const parsedScopes = z.strictObject({ items: z.array(z.strictObject({ workspaceId: z.string().min(1) })), errors: z.record(z.string(), ProblemCodeSchema) }).parse(scopePage);
    const pages = await Promise.all(parsedScopes.items.map(async ({ workspaceId: id }) => {
      try {
        const workspace = await resolveWorkspaceScope(id);
        if (!workspace) throw new OpenChamberControlError('Workspace scope is unavailable during global session listing', workspaceId ? 404 : 503, { code: workspaceId ? 'SESSION_NOT_FOUND' : 'SERVICE_UNAVAILABLE' });
        return await withSessionAdmission(workspace, 'discovery', id, async () => {
          const raw = z.strictObject({ items: z.array(RuntimeSessionSchema), errors: z.array(z.strictObject({ sessionId: z.string().min(1), code: ProblemCodeSchema })) }).parse(await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(id)}`));
          const sessionResults = await Promise.all(raw.items.map(async session => {
            try {
              if (session.projectId !== workspace.projectId || session.workspaceId !== id) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502, { code: 'INTERNAL_ERROR' });
              const metadataState = await sessionMetadataStore.getState(session.sessionId);
              const archiveState = await archiveStore.getState(session.sessionId);
              if (!await registerSessionScope(session)) throw new OpenChamberControlError('Session scope registration failed', 500, { code: 'INTERNAL_ERROR' });
              const projected = { ...session, metadata: metadataState?.metadata ?? null, metadataRevision: metadataState?.revision ?? '0', archiveRevision: archiveState?.revision ?? '0' };
              if (archiveState?.archivedAt != null) projected.archivedAt = archiveState.archivedAt;
              return { item: SessionSchema.parse(projected) };
            } catch (error) {
              const code = ProblemCodeSchema.safeParse(error?.code);
              return { error: { sessionId: session.sessionId, code: code.success ? code.data : 'SERVICE_UNAVAILABLE' } };
            }
          }));
          const items = sessionResults.flatMap(result => result.item ? [result.item] : []);
          const sessionErrors = sessionResults.flatMap(result => result.error ? [result.error] : []);
          return { items, errors: Object.fromEntries([...raw.errors, ...sessionErrors].map(error => [error.sessionId, error.code])) };
        }, true);
      } catch (error) {
        const code = ProblemCodeSchema.safeParse(error?.code);
        return { items: [], errors: { [id]: code.success ? code.data : 'SERVICE_UNAVAILABLE' } };
      }
    }));
    return z.strictObject({ items: z.array(SessionSchema), errors: z.record(z.string(), ProblemCodeSchema) }).parse({ items: pages.flatMap(page => page.items), errors: Object.assign({}, parsedScopes.errors, ...pages.map(page => page.errors)) });
  };
  const captureWorktreeArchive = async ({ projectDirectory, worktreeDirectory, archiveId, archiveRef, snapshotCommit, claimId, branchName, branchOid, archivedAt }) => {
    if (!agentScopeStore || typeof dependencies.resolveWorkspaceDirectory !== 'function')
      throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const [project, workspace] = await Promise.all([
      dependencies.resolveWorkspaceDirectory(projectDirectory),
      dependencies.resolveWorkspaceDirectory(worktreeDirectory),
    ]);
    if (!project || !workspace || project.projectId !== workspace.projectId)
      throw new OpenChamberControlError('Worktree does not belong to the Host project', 403);
    const scope = await (dependencies.resolveHostWorkspaceScope ?? resolveWorkspaceScope)(workspace.workspaceId);
    if (!scope || scope.projectId !== project.projectId)
      throw new OpenChamberControlError('Worktree Host scope is unavailable', 503);
    const archiveState = await archiveStore.listAll();
    if (archiveState.conversion?.code || Object.keys(archiveState.errors).length > 0)
      throw new OpenChamberControlError('Host archive state is unavailable', 503);
    const key = { hostProjectId: scope.hostProjectId, archiveId };
    let binding = await agentScopeStore.createWorktreeArchive({
      ...key, archiveRef, snapshotCommit,
      anchorWorkspaceId: scope.workspaceId, claimId, claimGeneration: worktreeArchiveGeneration,
      branchName, branchOid
    });
    try {
      binding = await agentScopeStore.archiveWorktreeSessions(key, claimId, archivedAt);
      return { key, claimId, revision: binding.revision };
    } catch (error) {
      await agentScopeStore.rollbackWorktreeSessions(key, claimId, false);
      error.worktreeArchiveOwner = { key, claimId };
      throw error;
    }
  };
  const prepareWorktreeArchiveRemoval = async (owner) => {
    const binding = await agentScopeStore.recheckWorktreeArchive(owner.key, owner.claimId);
    return agentScopeStore.setWorktreeArchivePhase(owner.key, owner.claimId, binding.revision, 'removal_pending');
  };
  const finishWorktreeArchive = (owner) => agentScopeStore.finishWorktreeArchive(owner.key, owner.claimId);
  const rollbackWorktreeArchive = (owner, partial) => agentScopeStore.rollbackWorktreeSessions(owner.key, owner.claimId, partial);
  const discardWorktreeArchive = (owner) => agentScopeStore.discardWorktreeArchive(owner.key);
  const archive = async (payload = {}) => { const parsed = parseArchiveRequest(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id))); scopes.forEach(assertWritableScope); return archiveStore.archive(parsed.ids, parsed.archivedAt); };
  const unarchive = async (payload = {}) => { const parsed = parseIdBatch(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id))); scopes.forEach(assertWritableScope); return archiveStore.unarchive(parsed.ids); };
  const getMetadata = async (id) => { await hostScopeFor(id); const state = await sessionMetadataStore.getState(id); return SessionMetadataStateSchema.parse({ sessionId: id, revision: state?.revision ?? '0', metadata: state?.metadata ?? null }); };
  const setMetadata = async (id, payload = {}) => {
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    // A client-supplied shape is invalid input, not a server failure.
    const parsed = SessionMetadataPatchSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session metadata patch is invalid', 400, { code: 'INVALID_REQUEST' });
    const result = await metadata.set(id, parsed.data.changes, scope.cwd);
    return SessionMetadataStateSchema.parse({ sessionId: id, revision: result.revision, metadata: result.metadata });
  };
  const rename = async (id, payload = {}) => {
    const input = SessionTitleRequestSchema.parse(payload);
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    if (scope.workspaceId !== input.workspaceId) throw new OpenChamberControlError('Session title request is outside its Host scope', 403);
    const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/title`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }));
    if (runtime.sessionId !== id || runtime.rootSessionId !== scope.rootSessionId
      || runtime.workspaceId !== scope.workspaceId || runtime.projectId !== scope.projectId)
      throw new OpenChamberControlError('Session title response was outside its Host scope', 502);
    const [stored, archive] = await Promise.all([sessionMetadataStore.getState(id), archiveStore.getState(id)]);
    const projected = { ...runtime, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
    if (archive?.archivedAt != null) projected.archivedAt = archive.archivedAt;
    return SessionSchema.parse(projected);
  };
  /**
   * A metadata change decided from the record as it is when this session's
   * write turn comes. Like `metadata.set`, the injected writer owns the store
   * and the broadcast; the fallback is what module tests use.
   */
  const updateMetadata = async (sessionID, decide, directory = '') => {
    if (typeof updateSessionMetadata === 'function') {
      return updateSessionMetadata(sessionID, decide, { directory });
    }
    const result = await sessionMetadataStore.updateSessionMetadata(sessionID, decide, { directory });
    if (result.changed) {
      broadcastGlobalUiEvent?.({
        type: 'openchamber:session-metadata',
        properties: { sessionID, metadata: result.metadata, revision: result.revision },
      });
    }
    return result;
  };
  /**
   * Link or unlink items on a session the way the UI does (`setLinkedIssue`
   * and `addLinkedIssues`): the list transform runs against the record as it
   * is when this session's write turn comes, so a link an agent made while
   * the request was in flight is read by the decide step instead of being
   * overwritten by a stale client snapshot. The whole `linked_issues` array
   * is never accepted from a client.
   */
  const setSessionLinks = async (sessionID, payload = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    // The schema decides what a link operation is; a body of any other shape
    // is a 400, not something to pre-narrow here.
    const parsed = parseLinkOperation(payload);
    if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400);
    const { metadata } = await updateMetadata(
      id,
      (current) => buildLinkedIssuesPatch(current, parsed.entries, parsed.linked),
      scope.cwd,
    );
    return { metadata };
  };
  const selectBranch = async (sessionId, payload = {}) => {
    const input = parseCommand(SessionBranchRequestSchema, payload);
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    await reopen(scope);
    const result = SessionBranchResultSchema.parse(await request(`/internal/sessions/${encodeURIComponent(sessionId)}/branch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }));
    if (result.sessionId !== sessionId || result.branch.branchId !== input.branchId || BigInt(result.branch.branchVersion) <= BigInt(input.branchVersion)
      || (input.action === 'revert' ? result.branch.revert?.messageId !== input.messageId : result.branch.revert !== undefined))
      throw new OpenChamberControlError('Branch acknowledgement does not match its requested owner and selection', 502);
    return result;
  };
  const pendingRelocation = async (rootSessionId) => HostSessionRelocationPendingSchema.parse(await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation`)).relocation;
  const sameIntent = (intent, pending) => pending && pending.transactionId === intent.transactionId
    && pending.sourceWorkspaceId === intent.sourceWorkspaceId && pending.destinationWorkspaceId === intent.destinationWorkspaceId;
  const familyOwner = async (intent) => {
    const family = await agentScopeStore.listSessionFamily(intent.rootSessionId);
    if (!family.some((member) => member.sessionId === intent.rootSessionId)) throw new OpenChamberControlError('Relocation family is unavailable', 503);
    if (family.every((member) => member.workspaceId === intent.sourceWorkspaceId)) return 'source';
    if (family.every((member) => member.workspaceId === intent.destinationWorkspaceId)) return 'destination';
    throw new OpenChamberControlError('Relocation Host ownership has changed', 503);
  };
  const assertRelocationRuntime = async (intent, runtime, workspaceId) => {
    const scope = await agentScopeStore.getWorkspace(workspaceId);
    if (!scope || runtime.sessionId !== intent.rootSessionId || runtime.rootSessionId !== intent.rootSessionId
      || runtime.workspaceId !== workspaceId || runtime.projectId !== scope.projectId || (workspaceId === intent.destinationWorkspaceId && runtime.activeRunId !== null))
      throw new OpenChamberControlError('Relocation acknowledgement is outside its captured Host owner', 502);
  };
  const finalizeRelocation = async (intent, action) => {
    const result = HostSessionRelocationFinalizedSchema.parse(await request(`/internal/sessions/${encodeURIComponent(intent.rootSessionId)}/relocation/finalize`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(HostSessionRelocationFinalizeSchema.parse({ transactionId: intent.transactionId, action })),
    }));
    await assertRelocationRuntime(intent, result.session, action === 'commit' ? intent.destinationWorkspaceId : intent.sourceWorkspaceId);
    return result.session;
  };
  const recoverRelocation = async (rootSessionId) => {
    const intent = await agentScopeStore.getRelocation(rootSessionId);
    if (!intent) return;
    const owner = await familyOwner(intent);
    const pending = await pendingRelocation(rootSessionId);
    if (pending && !sameIntent(intent, pending)) throw new OpenChamberControlError('Native relocation intent does not match its Host owner', 503);
    if (pending) await finalizeRelocation(intent, owner === 'destination' ? 'commit' : 'rollback');
    else {
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
      await assertRelocationRuntime(intent, runtime, owner === 'destination' ? intent.destinationWorkspaceId : intent.sourceWorkspaceId);
    }
    await agentScopeStore.clearRelocation(intent);
  };
  const relocationResult = async (rootSessionId, workspaceId) => {
    const family = await agentScopeStore.listSessionFamily(rootSessionId);
    const sessions = await Promise.all(family.map(async (member) => {
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(member.sessionId)}`));
      if (member.workspaceId !== workspaceId || runtime.sessionId !== member.sessionId || runtime.rootSessionId !== rootSessionId || runtime.workspaceId !== workspaceId || runtime.projectId !== member.projectId)
        throw new OpenChamberControlError('Relocation family projection is outside its destination owner', 502);
      const [stored, archive] = await Promise.all([sessionMetadataStore.getState(member.sessionId), archiveStore.getState(member.sessionId)]);
      const session = { ...runtime, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
      if (archive?.archivedAt != null) session.archivedAt = archive.archivedAt;
      return SessionSchema.parse(session);
    }));
    return SessionRelocateResultSchema.parse({ sessions });
  };
  const relocate = async (sessionId, payload = {}, archiveClaimId) => {
    const input = parseCommand(SessionRelocateRequestSchema, payload);
    if (!agentScopeStore || !resolveHostRelocationScope) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    let source = archiveClaimId ? await agentScopeStore.getSession(sessionId) : await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    await agentScopeStore.checkWorktreeScope(source.cwd, archiveClaimId);
    const rootSessionId = source.rootSessionId;
    if (relocationControls.has(rootSessionId)) throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
    // Relocation retires the source worker, so a later prompt must reopen it.
    forgetLive(rootSessionId);
    relocationControls.add(rootSessionId);
    try {
      await recoverRelocation(rootSessionId);
      source = archiveClaimId ? await agentScopeStore.getSession(sessionId) : await resolveHostRelocationScope(sessionId);
      if (!source) throw new OpenChamberControlError('Session scope was not found', 404);
      assertWritableScope(source);
      await agentScopeStore.checkWorktreeScope(source.cwd, archiveClaimId);
      const destination = await resolveWorkspaceScope(input.workspaceId, archiveClaimId);
      if (!destination || destination.projectId !== source.projectId || destination.agentDirectoryId !== source.agentDirectoryId)
        throw new OpenChamberControlError('Relocation destination is outside the source Host owner', 403);
      assertWritableScope(destination);
      await agentScopeStore.checkWorktreeScope(destination.cwd, archiveClaimId);
      if (destination.workspaceId === source.workspaceId) return relocationResult(rootSessionId, destination.workspaceId);
      const intent = { rootSessionId, transactionId: randomUUID(), sourceWorkspaceId: source.workspaceId, destinationWorkspaceId: destination.workspaceId };
      await agentScopeStore.createRelocation(intent, archiveClaimId);
      try {
        const destinationScope = {
          rootSessionId, projectId: destination.projectId, workspaceId: destination.workspaceId, cwd: destination.cwd, agentDirectory: destination.agentDirectory,
          agentDirectoryId: destination.agentDirectoryId, displayPath: destination.displayPath ?? 'workspace'
        };
        if (destination.env) destinationScope.env = destination.env;
        const prepared = HostSessionRelocationPreparedSchema.parse(await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation/prepare`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(HostSessionRelocationPrepareSchema.parse({
            transactionId: intent.transactionId, sourceWorkspaceId: source.workspaceId,
            destination: destinationScope,
          })),
        }));
        if (prepared.transactionId !== intent.transactionId) throw new OpenChamberControlError('Relocation acknowledgement identified another transaction', 502);
        await assertRelocationRuntime(intent, prepared.session, destination.workspaceId);
        await agentScopeStore.rebindSessionFamily(intent, archiveClaimId);
        await finalizeRelocation(intent, 'commit');
        await agentScopeStore.clearRelocation(intent);
      } catch (error) {
        // An unreadable response is not proof of failure. Only a matching durable
        // native intent permits rollback; a completed destination is reconciled.
        const pending = await pendingRelocation(rootSessionId);
        if (pending && !sameIntent(intent, pending)) throw new OpenChamberControlError('Native relocation recovery owner has changed', 503);
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
    } finally { relocationControls.delete(rootSessionId); }
  };
  const resolveWorktreeArchivePinnedTarget = async ({ projectDirectory, archiveId, revision }) => {
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    const scope = project && await agentScopeStore.getWorkspace(project.workspaceId);
    const binding = scope && await agentScopeStore.getWorktreeArchive({ hostProjectId: scope.hostProjectId, archiveId });
    if (!binding || binding.phase !== 'restoring' || binding.revision !== revision || !binding.targetWorkspaceId)
      throw new OpenChamberControlError('Restore target is unavailable or changed', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const target = await agentScopeStore.getWorkspace(binding.targetWorkspaceId);
    if (!target || target.projectId !== binding.projectId) throw new OpenChamberControlError('Restore target is unavailable', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    return target.cwd;
  };
  const prepareWorktreeArchiveRestore = async ({ projectDirectory, targetDirectory, archiveId, recovery, expectedRevision }) => {
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    if (!project) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const projectScope = await agentScopeStore.getWorkspace(project.workspaceId);
    if (!projectScope) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const key = { hostProjectId: projectScope.hostProjectId, archiveId };
    let binding = await agentScopeStore.getWorktreeArchive(key);
    if (!binding) return null;
    const recoveringRemoval = binding.phase === 'removal_pending';
    if (expectedRevision !== undefined && binding.revision !== expectedRevision)
      throw new OpenChamberControlError('Restore revision changed', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const parsedRecovery = recovery === undefined ? null : z.strictObject({ mode: z.literal('new_checkout'), revision: z.number().int().positive() }).safeParse(recovery);
    const recovering = parsedRecovery?.success === true;
    if (recovery !== undefined && (!recovering || parsedRecovery.data.revision !== binding.revision
      || !binding.targetWorkspaceId || binding.sessions.some((item) => ['move_intent', 'restored'].includes(item.progress))))
      throw new OpenChamberControlError('Restore recovery intent is stale or sessions have moved', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    let target = !recovering && binding.targetWorkspaceId ? await agentScopeStore.getWorkspace(binding.targetWorkspaceId) : null;
    if (!target) {
      const found = await dependencies.resolveWorkspaceDirectory(targetDirectory);
      target = found && await agentScopeStore.getWorkspace(found.workspaceId);
    }
    if (recovering && target?.workspaceId === binding.targetWorkspaceId)
      throw new OpenChamberControlError('Recovery requires a different checkout', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const previousTarget = recovering ? await agentScopeStore.getWorkspace(binding.targetWorkspaceId) : null;
    if (recovering && !previousTarget) throw new OpenChamberControlError('Previous restore target is unavailable', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    if (!target || target.cwd !== targetDirectory || target.projectId !== binding.projectId)
      throw new OpenChamberControlError('Restore target does not match the Host archive owner', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const claimId = randomUUID();
    binding = await agentScopeStore.claimWorktreeArchive(key, { claimId, claimGeneration: worktreeArchiveGeneration, revision: binding.revision, phase: 'restoring' });
    return { key, claimId, binding, targetWorkspaceId: target.workspaceId, recovering, recoveringRemoval, previousTargetDirectory: previousTarget?.cwd };
  };
  const finishWorktreeArchiveRestore = async (owner) => {
    let binding = await agentScopeStore.getWorktreeArchive(owner.key);
    for (const rootId of new Set(binding.sessions.map((item) => item.rootSessionId))) {
      const rows = binding.sessions.filter((item) => item.rootSessionId === rootId);
      if (rows.every((item) => item.progress === 'restored')) continue;
      for (const item of rows) {
        const scope = await agentScopeStore.getSession(item.sessionId);
        const state = await archiveStore.getState(item.sessionId);
        if (!scope || scope.projectId !== binding.projectId || scope.agentDirectoryId !== item.agentDirectoryId
          || ![item.workspaceId, binding.targetWorkspaceId].includes(scope.workspaceId)
          || state?.archivedAt == null || state.revision !== (item.expectedArchiveRevision ?? item.originalArchiveRevision))
          throw new OpenChamberControlError('Archived session scope or state changed', 409);
      }
      binding = await agentScopeStore.markWorktreeRestoreMove(owner.key, owner.claimId, rootId);
      await relocate(rootId, { workspaceId: binding.targetWorkspaceId }, owner.claimId);
      binding = await agentScopeStore.completeWorktreeRestoreFamily(owner.key, owner.claimId, rootId);
    }
    return binding;
  };
  const pinWorktreeArchiveRestore = (owner, fingerprints) => agentScopeStore.pinWorktreeRestore(owner.key, { ...fingerprints, claimId: owner.claimId, revision: owner.binding.revision, targetWorkspaceId: owner.targetWorkspaceId, recovery: owner.recovering });
  const markWorktreeArchiveRestoreAttempted = (owner, revision) => agentScopeStore.markWorktreeRestoreAttempted(owner.key, owner.claimId, revision);
  const releaseWorktreeArchiveRestore = (owner) => agentScopeStore.releaseWorktreeArchiveClaim(owner.key, owner.claimId);
  const finalizeWorktreeArchiveRestore = (owner, revision) => agentScopeStore.setWorktreeArchivePhase(owner.key, owner.claimId, revision, 'finalizing');
  const cleanupWorktreeArchiveRestore = (owner) => agentScopeStore.discardWorktreeArchive(owner.key);
  const prepareWorktreeArchiveDelete = async ({ projectDirectory, archiveId }) => {
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    const scope = project && await agentScopeStore.getWorkspace(project.workspaceId);
    if (!scope) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const key = { hostProjectId: scope.hostProjectId, archiveId };
    let binding = await agentScopeStore.getWorktreeArchive(key);
    if (!binding) return null;
    const recoveringRemoval = binding.phase === 'removal_pending';
    return { key, binding, recoveringRemoval };
  };
  const claimWorktreeArchiveDelete = async (owner) => {
    const claimId = randomUUID();
    const binding = await agentScopeStore.claimWorktreeArchive(owner.key, { claimId, claimGeneration: worktreeArchiveGeneration, revision: owner.binding.revision, phase: 'deleting' });
    return { ...owner, claimId, binding };
  };
  const deleteWorktreeArchiveSessions = async (owner) => {
    let binding = await agentScopeStore.getWorktreeArchive(owner.key);
    for (const rootId of new Set(binding.sessions.map((item) => item.rootSessionId))) {
      const reservation = await agentScopeStore.reserveWorktreeArchiveDeleteFamily(owner.key, owner.claimId, rootId);
      binding = reservation.binding;
      const rows = binding.sessions.filter((item) => item.rootSessionId === rootId);
      if (reservation.action === 'skip') continue;
      const operationId = reservation.operationId ?? rows[0]?.deleteOperationId;
      const root = rows.find((item) => item.sessionId === rootId);
      if (reservation.action === 'done' && !operationId) continue;
      if (!root || !operationId) throw new OpenChamberControlError('Archived root session is unavailable', 503);
      const nativeDelete = {
        operationId, projectId: binding.projectId, workspaceId: root.workspaceId,
        agentDirectoryId: root.agentDirectoryId, sessionIds: rows.map((item) => item.sessionId)
      };
      if (reservation.action === 'done') {
        await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete/retire`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nativeDelete),
        });
        continue;
      }
      const ack = z.strictObject({ operationId: EntityIdSchema, sessionId: EntityIdSchema, deletedSessionIds: z.array(EntityIdSchema) }).parse(await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nativeDelete),
      }));
      if (ack.sessionId !== rootId || ack.operationId !== operationId) throw new OpenChamberControlError('Session deletion acknowledgement identified another operation', 502);
      binding = await agentScopeStore.completeWorktreeArchiveDeleteFamily(owner.key, owner.claimId, rootId, ack.deletedSessionIds);
      await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete/retire`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nativeDelete),
      });
    }
    return binding;
  };
  const finalizeWorktreeArchiveDelete = (owner, revision, deleteBranch) => agentScopeStore.markWorktreeArchiveDeleteFinalizing(owner.key, owner.claimId, revision, deleteBranch);
  const control = async (sessionId, operation = {}) => {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    const parsed = parseCommand(SessionControlRequestSchema, operation);
    if (parsed.type === 'abort') {
      const requestBody = RunAbortRequestSchema.parse({ sessionId, runId: parsed.runId });
      const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(requestBody.runId)}/abort`, { method: 'POST' });
      return { run: RunSchema.parse(body?.run) };
    }
    // Mode, compact, goal, command and btw need a worker. Abort above does not:
    // a cold root has no active run, so reopening would only waste a slot.
    await reopen(scope);
    const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed) });
    const ack = SessionControlAckSchema.parse(body);
    // A completed /btw branch rekeys the Agent Service session to the id the
    // native branch minted. The Host binding the caller addressed is now that
    // old id, so it must follow the rekey here; otherwise every later
    // root-addressed read answers "Session scope was not found" for a live
    // session and the composer loses its chat.
    if (ack.type === 'btw.branch' && ack.sessionId !== undefined && ack.sessionId !== sessionId) {
      // The registry rekeys to a self-rooted identity: the minted id is its own
      // root, and the retired id names no session. Only the branch's session
      // file records the pre-branch file as its native lineage.
      if (ack.rootSessionId !== undefined && ack.rootSessionId !== ack.sessionId) throw new OpenChamberControlError('A BTW branch must stay its own root', 502);
      const rebound = await agentScopeStore.rebindSessionRoot(sessionId, ack.sessionId);
      if (!rebound || rebound.sessionId !== ack.sessionId) throw new OpenChamberControlError('Canonical session rekey was not persisted', 503);
      forgetLive(sessionId);
      rememberLive(ack.sessionId);
    }
    return ack;
  };
  const remove = async (id) => {
    const scope = await scopeFor(id);
    const reservation = await agentScopeStore.reserveSessionDelete(id);
    try {
      // Deleting retires the worker, so no send may treat this root as live. The
      // reopen below is a one-off restore for the DELETE itself, and the finally
      // clears the confirmation it publishes.
      forgetLive(scope.rootSessionId);
      if (!scope.workspaceId.startsWith('archive_')) await reopen(scope);
      const ack = SessionDeleteAckSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }));
      if (ack.sessionId !== id) throw new OpenChamberControlError('Session deletion acknowledgement identified another session', 502);
      if (scope.workspaceId.startsWith('archive_')) await onArchiveDeleted?.(scope, ack);
      else await agentScopeStore.removeSessionFamily(scope.rootSessionId);
      return ack;
    } finally {
      // Deleting retires the worker whether or not the delete was acknowledged.
      forgetLive(scope.rootSessionId);
      agentScopeStore.releaseSessionDelete(reservation);
    }
  };
  const listArchivedWorktreeSessions = async ({ projectDirectory, archiveId }) => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const resolveProject = dependencies.resolveWorkspaceDirectory;
    const project = resolveProject ? await resolveProject(projectDirectory) : null;
    if (!project) throw new OpenChamberControlError('Project directory is unavailable', 404);
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
  const unloadWorker = async (id) => { forgetLive(id); try { await request(`/internal/workers/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch { } };
  /**
   * A session's own folder name inside its checkout, or the worktree root:
   * the same rule the New worktree dialog applies (worktree-start-directory).
   */
  const resolveMoveStartDirectory = createStartDirectoryResolver({
    resolveWorktreeTopLevel: dependencies.resolveWorktreeTopLevel,
    validateWorktreeDirectory: dependencies.validateWorktreeDirectory,
  });

  // The setup commands a server-made worktree runs, with no client to show the
  // trust prompt; the dialog resolves the same list and sends it as startCommand.
  const resolveMoveSetup = async (sourceDirectory) => {
    if (typeof dependencies.readWorktreeSetup !== 'function' || typeof dependencies.resolveProjectDirectory !== 'function') {
      return { startCommand: '', untrustedSkipped: [] };
    }
    const project = await dependencies.resolveProjectDirectory(sourceDirectory).catch(() => null);
    if (!project?.projectId) return { startCommand: '', untrustedSkipped: [] };
    const setup = await dependencies.readWorktreeSetup(project.projectId);
    return dependencies.worktreeSetupOf(setup, project.projectDirectory ?? sourceDirectory);
  };

  /**
   * Move a session into a new worktree of its repository, carrying the files
   * the agent names (`./worktree-move.js`). Authorization is decided here, on
   * the authenticated scope, before anything is created:
   * `agentScopeStore.checkWorktreeScope` refuses while an archive owns the
   * scope, and the destination workspace must exist and belong to the same
   * Host project before `relocate` is asked to move into it.
   */
  const moveToWorktree = async (sessionId, payload = {}, options = {}) => {
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const worktree = input.worktree && typeof input.worktree === 'object' && !Array.isArray(input.worktree) ? input.worktree : {};
    const name = asNonEmptyString(worktree.name);
    if (!name) throw new OpenChamberControlError('worktree.name is required', 400);
    // One relative folder name: no absolute path, traversal, or separator.
    if (name.length > 200 || name === '.' || name === '..' || /[\\/]/.test(name) || /[\x00-\x1f<>:"|?*]/.test(name)) {
      throw new OpenChamberControlError('worktree.name must be one folder name, relative to the worktree root', 400);
    }
    const existingBranch = asNonEmptyString(worktree.existingBranch);
    const branchName = asNonEmptyString(worktree.branchName);
    const startRef = asNonEmptyString(worktree.startRef);
    if (existingBranch && (branchName || startRef)) {
      throw new OpenChamberControlError('existingBranch checks out that branch as it is; do not combine it with branchName or startRef', 400);
    }
    const carryInput = input.carry ?? [];
    if (!Array.isArray(carryInput) || carryInput.some((entry) => !asNonEmptyString(entry))) {
      throw new OpenChamberControlError('carry is a list of file paths', 400);
    }

    // Authorization first: the source scope, its archive claim, and the
    // caller's relation to it. The agent tool may only move its own session.
    const source = await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    if (agentScopeStore) await agentScopeStore.checkWorktreeScope(source.cwd);
    const caller = asNonEmptyString(options.contextSessionId);
    if (caller && caller !== source.rootSessionId) {
      throw new OpenChamberControlError('Only the session itself may move into a worktree', 403);
    }

    const carry = [...new Set(carryInput.map((entry) => entry.trim()))];
    // Carry paths name files in the session's own workspace: a relative path
    // that stays inside it, never an absolute path or a directory.
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
    // The destination workspace does not exist yet: the checkout is made first,
    // then admitted through the same Host scope owner every other route uses,
    // and only then is the session relocated. The mover keeps the ordering (and
    // the rollback) around this callback.
    const moveSession = async (_sessionId, _startDirectory, { worktreeRoot }) => {
      if (typeof dependencies.resolveWorkspaceDirectory !== 'function') throw new OpenChamberControlError('Host workspace discovery is unavailable', 503);
      const destination = await dependencies.resolveWorkspaceDirectory(worktreeRoot);
      if (!destination) throw new OpenChamberControlError('The new worktree was not admitted as a Host workspace', 503);
      if (destination.projectId !== source.projectId) throw new OpenChamberControlError('The new worktree belongs to another Host project', 403);
      const destinationScope = await (dependencies.resolveHostWorkspaceScope ?? resolveWorkspaceScope)(destination.workspaceId);
      // Discovery may answer a workspace for another directory; the scope's
      // cwd is what the relocation actually moves the session into.
      if (!destinationScope || destinationScope.projectId !== source.projectId
        || path.resolve(destinationScope.cwd) !== path.resolve(worktreeRoot)) {
        throw new OpenChamberControlError('The new worktree Host scope is unavailable', 503);
      }
      const relocated = await relocate(sessionId, { workspaceId: destination.workspaceId });
      return { workspaceId: destination.workspaceId, sessions: relocated.sessions };
    };

    const moved = await worktreeMover.move({
      sessionId,
      directory: source.cwd,
      name,
      ...(branchName ? { branchName } : {}),
      ...(startRef ? { startRef } : {}),
      ...(existingBranch ? { existingBranch } : {}),
      carry,
      startDirectory: async ({ worktreeRoot }) => {
        const start = await resolveMoveStartDirectory({ projectPath: source.cwd, worktreeRoot });
        return start;
      },
      setup,
      moveSession,
    });
    return moved;
  };

  const close = async () => {
    for (const [workspaceId, entry] of speculativeSessions.entries()) {
      clearTimeout(entry.timer);
      try {
        const session = await entry.promise;
        await remove(session.sessionId);
      } catch { }
    }
    speculativeSessions.clear();
  };

  return { create, prepare, discardPrepared, close, send, steer, followUp, fork, selectBranch, relocate, moveToWorktree, delete: remove, open, history, list, listArchivedWorktreeSessions, control, rename, resolveDirectory: async (payload = {}) => { const scope = await resolveWorkspaceScope(payload.workspaceId); if (!scope) throw new OpenChamberControlError('Workspace was not found', 404); return scope.cwd; }, archive, unarchive, getMetadata, setMetadata, setSessionLinks, sessionMetadataStore, archiveStore, unloadWorker, captureWorktreeArchive, prepareWorktreeArchiveRemoval, finishWorktreeArchive, rollbackWorktreeArchive, discardWorktreeArchive, resolveWorktreeArchivePinnedTarget, prepareWorktreeArchiveRestore, pinWorktreeArchiveRestore, markWorktreeArchiveRestoreAttempted, finishWorktreeArchiveRestore, finalizeWorktreeArchiveRestore, releaseWorktreeArchiveRestore, cleanupWorktreeArchiveRestore, prepareWorktreeArchiveDelete, claimWorktreeArchiveDelete, deleteWorktreeArchiveSessions, finalizeWorktreeArchiveDelete, resolveAdmissionRecovery: (owner) => owner.recoveringRemoval, markWorktreeArchiveDeleteCasCompleted: (owner, revision) => agentScopeStore.markWorktreeArchiveDeleteCasCompleted(owner.key, owner.claimId, revision), markWorktreeArchiveRestoreCasStarted: (owner, revision) => agentScopeStore.markWorktreeArchiveRestoreCasStarted(owner.key, owner.claimId, revision), markWorktreeArchiveRestoreCasCompleted: (owner, revision) => agentScopeStore.markWorktreeArchiveRestoreCasCompleted(owner.key, owner.claimId, revision) };
};



export const createOpenChamberSessionService = (dependencies) => createCanonicalSessionService(dependencies);
const sendServiceError = (res, error, fallback) => {
  const controlError = asControlError(error, fallback);
  const status = controlError.statusCode >= 400 && controlError.statusCode <= 599 ? controlError.statusCode : 500;
  const codeResult = ProblemCodeSchema.safeParse(error?.code);
  const code = codeResult.success ? codeResult.data : status === 404 ? 'SESSION_NOT_FOUND' : status === 400 ? 'INVALID_REQUEST' : status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
  // Each caller names the operation it attempted; that sentence is the cause a
  // reader acts on, and it is the only fallback when the error carried none.
  const problem = ProblemDetailsSchema.parse({ type: `urn:ohpichamber:problem:${code}`, title: fallback, status, detail: controlError.message || fallback, code, retryable: error?.retryable ?? status >= 500 });
  return res.status(status).type('application/problem+json').json(problem);
};

export const registerOpenChamberSessionRoutes = (app, dependencies) => {
  if (!dependencies.isRequestOriginAllowed) throw new Error('Session routes require isRequestOriginAllowed');
  const service = dependencies.sessionService || createOpenChamberSessionService(dependencies);


  app.post('/api/openchamber/sessions', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.create(req.body ?? {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to create session:', error);
      return sendServiceError(res, error, 'Failed to create session');
    }
  });

  app.post('/api/openchamber/sessions/archive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.archive(req.body ?? {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to archive sessions:', error);
      return sendServiceError(res, error, 'Failed to archive sessions');
    }
  });

  app.get('/api/openchamber/sessions/:sessionId/metadata', async (req, res) => {
    try {
      return res.json(await service.getMetadata(req.params.sessionId));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to read session metadata:', error);
      return sendServiceError(res, error, 'Failed to read session metadata');
    }
  });

  app.patch('/api/openchamber/sessions/:sessionId/metadata', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.setMetadata(
        req.params.sessionId,
        req.body ?? {},
      ));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to store session metadata:', error);
      return sendServiceError(res, error, 'Failed to store session metadata');
    }
  });

  app.patch('/api/openchamber/sessions/:sessionId/title', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      return res.json(await service.rename(req.params.sessionId, req.body ?? {}));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to rename session');
    }
  });
  app.post('/api/openchamber/sessions/:sessionId/links', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.setSessionLinks(req.params.sessionId, req.body ?? {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to update session links:', error);
      return sendServiceError(res, error, 'Failed to update session links');
    }
  });

  app.post('/api/openchamber/sessions/unarchive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.unarchive(req.body ?? {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to unarchive sessions:', error);
      return sendServiceError(res, error, 'Failed to unarchive sessions');
    }
  });

  app.post(
    '/api/openchamber/sessions/:sessionId/send',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      try {
        return res.json(await service.send(req.params.sessionId, req.body, req.get('Idempotency-Key')));
      } catch (error) {
        console.error('[OpenChamberSessions] failed to send session:', error);
        return sendServiceError(res, error, 'Failed to send session');
      }
    },
  );
  app.post('/api/openchamber/sessions/:sessionId/steer', express.json({ limit: '1mb' }), async (req, res) => { try { return res.json(await service.steer(req.params.sessionId, req.body || {}, req.get('Idempotency-Key'))); } catch (error) { return sendServiceError(res, error, 'Failed to steer session'); } });
  app.post('/api/openchamber/sessions/:sessionId/follow-up', express.json({ limit: '1mb' }), async (req, res) => { try { return res.json(await service.followUp(req.params.sessionId, req.body || {}, req.get('Idempotency-Key'))); } catch (error) { return sendServiceError(res, error, 'Failed to submit session follow-up'); } });
  app.post(
    '/api/openchamber/sessions/:sessionId/fork',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      try {
        return res.json(await service.fork(req.params.sessionId, req.body));
      } catch (error) {
        console.error('[OpenChamberSessions] failed to fork session:', error);
        return sendServiceError(res, error, 'Failed to fork session');
      }
    },
  );
  app.get('/api/openchamber/sessions/:sessionId', async (req, res) => {
    try { return res.json(await service.open(req.params.sessionId)); }
    catch (error) { return sendServiceError(res, error, 'Failed to open session'); }
  });
  app.get('/api/openchamber/sessions/:sessionId/history', async (req, res) => {
    try { return res.json(await service.history(req.params.sessionId, new URLSearchParams(req.query).toString())); }
    catch (error) { return sendServiceError(res, error, 'Failed to read session history'); }
  });
  app.post('/api/openchamber/sessions/:sessionId/control', express.json({ limit: '1mb' }), async (req, res) => {
    try { return res.json(await service.control(req.params.sessionId, req.body || {})); }
    catch (error) { return sendServiceError(res, error, 'Failed to control session'); }
  });
  app.get('/api/openchamber/worktrees/archives/sessions', async (req, res) => {
    try {
      const projectDirectory = req.query.projectDirectory;
      const archiveId = req.query.archiveId;
      if (typeof projectDirectory !== 'string' || typeof archiveId !== 'string') {
        return res.status(400).json({ error: 'projectDirectory and archiveId are required' });
      }
      return res.json(await service.listArchivedWorktreeSessions({ projectDirectory, archiveId }));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to list archived worktree sessions');
    }
  });
};
export const registerCanonicalSessionRoutes = (router, service) => {
  const call = async (res, operation, fallback) => { try { res.json(await operation()); } catch (error) { sendServiceError(res, error, fallback); } };
  router.post('/', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.create(req.body || {}), 'Failed to create session'));
  router.post('/prepare', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.prepare(req.body || {}), 'Failed to prepare session'));
  router.delete('/prepare', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.discardPrepared(req.body || {}), 'Failed to discard prepared session'));
  router.get('/', (req, res) => call(res, () => {
    const workspace = EntityIdSchema.safeParse(req.query.workspaceId);
    return service.list(workspace.success ? workspace.data : undefined);
  }, 'Failed to list sessions'));
  router.get('/:sessionId/snapshot', (req, res) => call(res, () => service.open(req.params.sessionId), 'Failed to open session snapshot'));
  router.get('/:sessionId', (req, res) => call(res, () => service.open(req.params.sessionId), 'Failed to open session'));
  router.get('/:sessionId/history', (req, res) => call(res, () => service.history(req.params.sessionId, new URLSearchParams(req.query).toString()), 'Failed to read session history'));
  router.post('/:sessionId/runs', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.send(req.params.sessionId, req.body || {}, req.get('Idempotency-Key')), 'Failed to submit session run'));
  router.post('/:sessionId/steer', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.steer(req.params.sessionId, req.body || {}, req.get('Idempotency-Key')), 'Failed to steer session'));
  router.post('/:sessionId/follow-up', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.followUp(req.params.sessionId, req.body || {}, req.get('Idempotency-Key')), 'Failed to submit session follow-up'));
  router.post('/:sessionId/fork', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.fork(req.params.sessionId, req.body || {}), 'Failed to fork session'));
  router.post('/:sessionId/control', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.control(req.params.sessionId, req.body || {}), 'Failed to control session'));
  router.delete('/:sessionId', (req, res) => call(res, () => service.delete(req.params.sessionId), 'Failed to delete session'));
  router.get('/:sessionId/metadata', (req, res) => call(res, () => service.getMetadata(req.params.sessionId), 'Failed to read session metadata'));
  router.patch('/:sessionId/metadata', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.setMetadata(req.params.sessionId, req.body || {}), 'Failed to write session metadata'));
  router.patch('/:sessionId/title', express.json({ limit: '64kb' }), (req, res) => call(res, () => service.rename(req.params.sessionId, req.body || {}), 'Failed to rename session'));
  router.post('/:sessionId/branch', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.selectBranch(req.params.sessionId, req.body || {}), 'Failed to select session branch'));
  router.post('/:sessionId/relocate', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.relocate(req.params.sessionId, req.body || {}), 'Failed to relocate session'));
  // A session's own move into a new worktree: create the checkout, carry the
  // named files, then relocate. The session id names the source scope, so no
  // client-supplied directory is trusted.
  router.post('/:sessionId/move-to-worktree', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.moveToWorktree(req.params.sessionId, req.body || {}), 'Failed to move session into a worktree'));
};
