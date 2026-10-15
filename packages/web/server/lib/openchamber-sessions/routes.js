import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { SessionCreateAckSchema, SessionCreateRequestSchema, RuntimeSessionSchema, SessionSchema, RunSchema, RunAbortRequestSchema, SessionDeleteAckSchema, PromptRequestSchema, CapturedSendOptionsSchema, SessionSnapshotSchema, HistoryPageSchema, SessionMetadataStateSchema, SessionMetadataPatchSchema, SteerRequestSchema, SteerAckSchema, FollowUpRequestSchema, FollowUpAckSchema, ProblemDetailsSchema, ProblemCodeSchema } from '@openchamber/agent-contract';
import { EntityIdSchema } from '@openchamber/agent-contract';
import { SessionBranchRequestSchema, SessionBranchResultSchema, SessionRelocateRequestSchema, SessionRelocateResultSchema } from '@openchamber/agent-contract';
import { HostSessionRelocationPrepareSchema, HostSessionRelocationPreparedSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationFinalizedSchema, HostSessionRelocationPendingSchema } from '@openchamber/agent-service/private-protocol';

import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';
const SessionForkAckSchema = z.strictObject({ sessionId: z.string().min(1), rootSessionId: z.string().min(1), sessionFile: z.string().min(1), sourceSessionId: z.string().min(1), entryId: z.string().min(1).nullable(), mode: z.enum(['selected', 'full']) });
const SessionForkRequestSchema = z.strictObject({ messageId: EntityIdSchema.optional(), mode: z.enum(['selected', 'full']) }).refine(
  (input) => input.mode === 'selected' ? input.messageId !== undefined : input.messageId === undefined,
  { message: 'Selected forks require a public message ID; full forks do not accept one' },
);
const SessionReopenScopeSchema = z.strictObject({ rootSessionId: z.string().min(1), projectId: z.string().min(1), workspaceId: z.string().min(1), cwd: z.string().min(1), agentDirectory: z.string().min(1), agentDirectoryId: z.string().min(1), displayPath: z.string().min(1), env: z.record(z.string(), z.string()).optional() });
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
  const { service, resolveWorkspaceScope, resolveSessionScope, resolveHostSessionScope, listWorkspaceScopes, registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted, directCommandAdmissionStore, publishSessionEvent, archiveStore, sessionMetadataStore, persistSessionMetadata, broadcastGlobalUiEvent, onArchiveDeleted } = dependencies;
  const { agentScopeStore, resolveHostRelocationScope } = dependencies;
  const relocationControls = new Set();
  const requiredFunctions = [service?.request, resolveWorkspaceScope, resolveSessionScope, resolveHostSessionScope,
    registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted,
    directCommandAdmissionStore?.claim, directCommandAdmissionStore?.accept];
  if (!service || requiredFunctions.some((candidate) => !z.function().safeParse(candidate).success))
    throw new Error('session routes require the Agent service, Host scope resolvers, registration, attachment, delivery and direct command admission owners');
  const request = async (pathname, init = {}) => {
    const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) { const problem = ProblemDetailsSchema.safeParse(body); const error = new OpenChamberControlError(problem.success ? problem.data.detail : body?.detail || body?.error || 'Agent service request failed', response.status); error.code = problem.success ? problem.data.code : body?.code; throw error; }
    return body;
  };
  const scopeFor = async (sessionId) => {
    const owner = resolveHostRelocationScope ? await resolveHostRelocationScope(sessionId) : null;
    if (owner && agentScopeStore && await agentScopeStore.getRelocation(owner.rootSessionId)) {
      if (relocationControls.has(owner.rootSessionId)) throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
      relocationControls.add(owner.rootSessionId);
      try { await recoverRelocation(owner.rootSessionId); } finally { relocationControls.delete(owner.rootSessionId); }
    }
    const scope = await resolveSessionScope(sessionId);
    if (!scope || scope.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    return scope;
  };
  const hostScopeFor = async (sessionId) => { const scope = await resolveHostSessionScope(sessionId); if (!scope || scope.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404); return scope; };
  const assertWritableScope = (scope) => {
    if (scope.workspaceId.startsWith('archive_')) throw new OpenChamberControlError('Deleted-space sessions are permanently read-only', 409, { code: 'SESSION_READ_ONLY', retryable: false });
  };
  const emit = (event) => { try { publishSessionEvent?.(event); } catch {} try { broadcastGlobalUiEvent?.(event); } catch {} };
  const metadata = { getState: (id) => sessionMetadataStore.getState(id), set: async (id, patch, directory = '') => persistSessionMetadata ? persistSessionMetadata(id, patch, { directory }) : sessionMetadataStore.setSessionMetadata(id, patch) };
  const create = async (payload = {}) => {
    const parsed = SessionCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session create request is invalid', 400);
    const { projectId, workspaceId, metadata: requestedMetadata } = parsed.data;
    const options = CapturedSendOptionsSchema.parse(parsed.data.options);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
    assertWritableScope(workspace);
    const rootSessionId = randomUUID();
    const workspaceDisplay = z.object({ displayPath: z.string().optional(), env: z.record(z.string(), z.string()).optional() }).passthrough().parse(workspace);
    const displayPath = workspaceDisplay.displayPath && !workspaceDisplay.displayPath.startsWith('/') && !workspaceDisplay.displayPath.startsWith('\\') && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath) ? workspaceDisplay.displayPath : 'workspace';
    const sessionBootstrap = { rootSessionId, projectId, workspaceId, cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId, displayPath, options };
    if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
    const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sessionBootstrap) });
    const session = RuntimeSessionSchema.parse(body);
    if (session.projectId !== projectId || session.workspaceId !== workspaceId || session.rootSessionId !== rootSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
    if (!await registerSessionScope(session)) throw new OpenChamberControlError('Session scope registration failed', 500);
    if (requestedMetadata) await metadata.set(session.sessionId, requestedMetadata, workspace.cwd);
    const stored = await sessionMetadataStore.getState(session.sessionId);
    const result = SessionCreateAckSchema.parse({ session: SessionSchema.parse({ ...session, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: '0' }) });
    emit({ type: 'openchamber:session-created', properties: { sessionId: session.sessionId, projectId, workspaceId } });
    return result;
  };
  const prepareDelivery = async (scope, requestBody, identity = {}) => { const capturedRequest = PromptRequestSchema.parse(await capturePrompt(scope, requestBody)); const capture = { ...identity, request: capturedRequest }; await beforeDispatch(scope, capture); const attachments = await resolveAttachments(scope, capturedRequest.input.attachments); return { ...capture, attachments }; };
  const deliver = async (operation, sessionId, payload, commandId) => {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    const parsed = PromptRequestSchema.safeParse(operation === 'send' ? payload : payload?.request ?? payload);
    if (!parsed.success || (operation !== 'send' && payload?.sessionId !== undefined && payload.sessionId !== sessionId)) {
      throw new OpenChamberControlError('Prompt request is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const requestBody = operation === 'steer' ? SteerRequestSchema.parse({ sessionId, request: parsed.data }).request
      : operation === 'followUp' ? FollowUpRequestSchema.parse({ sessionId, request: parsed.data }).request : parsed.data;
    if (commandId !== undefined && !EntityIdSchema.safeParse(commandId).success) {
      throw new OpenChamberControlError('Command key is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const claim = commandId === undefined ? null : await directCommandAdmissionStore.claim(scope, commandId, operation, requestBody);
    if (claim?.state === 'accepted') return claim.acknowledgment;
    const deliveryRunId = randomUUID();
    const deliveryIdentity = { deliveryRunId };
    if (operation === 'send') deliveryIdentity.runId = deliveryRunId;
    if (commandId !== undefined) deliveryIdentity.commandId = commandId;
    const capture = await prepareDelivery(scope, requestBody, deliveryIdentity);
    let acknowledgment;
    let receipt;
    try {
      const pathname = operation === 'send' ? 'runs' : operation === 'steer' ? 'steer' : 'follow-up';
      const body = operation === 'send' ? { type: 'prompt', runId: deliveryRunId, request: capture.request, attachments: capture.attachments }
        : { request: capture.request, attachments: capture.attachments };
      const response = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (operation === 'send') {
        const run = RunSchema.parse(response?.run);
        if (run.sessionId !== sessionId || run.runId !== deliveryRunId) throw new Error('Native run acknowledgement does not match the admitted command');
        acknowledgment = { run };
        receipt = { runId: run.runId, deliveryRunId, run };
      } else {
        acknowledgment = (operation === 'steer' ? SteerAckSchema : FollowUpAckSchema).parse(response);
        if (acknowledgment.sessionId !== sessionId) throw new Error('Native acknowledgement does not match the admitted session');
        receipt = operation === 'steer' ? { runId: acknowledgment.runId, deliveryRunId, ack: acknowledgment }
          : { deliveryRunId, followUpId: acknowledgment.followUpId, ack: acknowledgment };
      }
    } catch (error) {
      // A failed transport or malformed acknowledgement cannot prove that native execution did not accept the command.
      if (claim && !(error instanceof OpenChamberControlError && error.statusCode < 500)) {
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
    await reopen(source);
    const entryId = input.mode === 'selected' ? asNonEmptyString((await request(`/internal/sessions/${encodeURIComponent(sessionId)}/native-entry/${encodeURIComponent(input.messageId)}`)).entryId) : null;
    if (input.mode === 'selected' && !entryId) throw new OpenChamberControlError('Selected message is unavailable', 409);
    const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceSessionId: sessionId, entryId, mode: input.mode }) });
    const ack = SessionForkAckSchema.parse(body);
    if (ack.sourceSessionId !== sessionId || ack.entryId !== entryId || ack.mode !== input.mode) throw new OpenChamberControlError('Fork acknowledgement does not match the requested source', 502);
    const child = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(ack.sessionId)}`));
    if (child.sessionId !== ack.sessionId || child.rootSessionId !== ack.rootSessionId || child.projectId !== source.projectId || child.workspaceId !== source.workspaceId) throw new OpenChamberControlError('Fork acknowledgement is outside the source scope', 502);
    if (!await registerSessionScope(child)) throw new OpenChamberControlError('Forked session scope registration failed', 500);
    const stored = await sessionMetadataStore.getState(child.sessionId);
    const archive = await archiveStore.getState(child.sessionId);
    const projected = { ...child, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
    if (archive?.archivedAt != null) projected.archivedAt = archive.archivedAt;
    return SessionCreateAckSchema.parse({ session: SessionSchema.parse(projected) });
  };
  const reopen = async (scope) => {
    const privateScope = { rootSessionId: scope.rootSessionId, projectId: scope.projectId, workspaceId: scope.workspaceId, cwd: scope.cwd, agentDirectory: scope.agentDirectory, agentDirectoryId: scope.agentDirectoryId, displayPath: scope.displayPath ?? 'workspace' };
    if (scope.env) privateScope.env = scope.env;
    const bootstrap = SessionReopenScopeSchema.parse(privateScope);
    const runtime = RuntimeSessionSchema.parse(await request(`/internal/sessions/${encodeURIComponent(bootstrap.rootSessionId)}/reopen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bootstrap) }));
    if (runtime.sessionId !== bootstrap.rootSessionId || runtime.rootSessionId !== bootstrap.rootSessionId || runtime.projectId !== bootstrap.projectId || runtime.workspaceId !== bootstrap.workspaceId) throw new OpenChamberControlError('Session restore acknowledgement is outside the authorized scope', 502);
  };
  const open = async (id) => { const scope = await scopeFor(id); await reopen(scope); const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`)); if (snapshot.session.sessionId !== id || snapshot.session.projectId !== scope.projectId || snapshot.session.workspaceId !== scope.workspaceId) throw new OpenChamberControlError('Session snapshot is outside the authorized scope', 502); return snapshot; };
  const history = async (id, query = '') => { const scope = await scopeFor(id); await reopen(scope); const page = HistoryPageSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`)); if (page.sessionId !== id || page.turns.some(turn => turn.projectId !== undefined && turn.projectId !== scope.projectId) || page.messages.some(message => message.projectId !== undefined && message.projectId !== scope.projectId)) throw new OpenChamberControlError('Session history is outside the authorized scope', 502); return page; };
  const list = async (workspaceId) => {
    const scopePage = workspaceId ? { items: [{ workspaceId }], errors: {} } : await (listWorkspaceScopes instanceof Function ? listWorkspaceScopes() : Promise.reject(new OpenChamberControlError('Workspace enumeration is unavailable', 503)));
    const parsedScopes = z.strictObject({ items: z.array(z.strictObject({ workspaceId: z.string().min(1) })), errors: z.record(z.string(), ProblemCodeSchema) }).parse(scopePage);
    const pages = await Promise.all(parsedScopes.items.map(async ({ workspaceId: id }) => {
      try {
        const workspace = await resolveWorkspaceScope(id);
        if (!workspace) throw new OpenChamberControlError('Workspace scope is unavailable during global session listing', workspaceId ? 404 : 503, { code: workspaceId ? 'SESSION_NOT_FOUND' : 'SERVICE_UNAVAILABLE' });
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
      } catch (error) {
        const code = ProblemCodeSchema.safeParse(error?.code);
        return { items: [], errors: { [id]: code.success ? code.data : 'SERVICE_UNAVAILABLE' } };
      }
    }));
    return z.strictObject({ items: z.array(SessionSchema), errors: z.record(z.string(), ProblemCodeSchema) }).parse({ items: pages.flatMap(page => page.items), errors: Object.assign({}, parsedScopes.errors, ...pages.map(page => page.errors)) });
  };
  const archive = async (payload = {}) => { const parsed = parseArchiveRequest(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id))); scopes.forEach(assertWritableScope); return archiveStore.archive(parsed.ids, parsed.archivedAt); };
  const unarchive = async (payload = {}) => { const parsed = parseIdBatch(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id))); scopes.forEach(assertWritableScope); return archiveStore.unarchive(parsed.ids); };
  const getMetadata = async (id) => { await hostScopeFor(id); const state = await sessionMetadataStore.getState(id); return SessionMetadataStateSchema.parse({ sessionId: id, revision: state?.revision ?? '0', metadata: state?.metadata ?? null }); };
  const setMetadata = async (id, payload = {}) => { const scope = await hostScopeFor(id); assertWritableScope(scope); const patch = SessionMetadataPatchSchema.parse(payload); const result = await metadata.set(id, patch.changes, scope.cwd); return SessionMetadataStateSchema.parse({ sessionId: id, revision: result.revision, metadata: result.metadata }); };
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
  const relocate = async (sessionId, payload = {}) => {
    const input = parseCommand(SessionRelocateRequestSchema, payload);
    if (!agentScopeStore || !resolveHostRelocationScope) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    let source = await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    const rootSessionId = source.rootSessionId;
    if (relocationControls.has(rootSessionId)) throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
    relocationControls.add(rootSessionId);
    try {
      await recoverRelocation(rootSessionId);
      source = await resolveHostRelocationScope(sessionId);
      if (!source) throw new OpenChamberControlError('Session scope was not found', 404);
      assertWritableScope(source);
      const destination = await resolveWorkspaceScope(input.workspaceId);
      if (!destination || destination.projectId !== source.projectId || destination.agentDirectoryId !== source.agentDirectoryId)
        throw new OpenChamberControlError('Relocation destination is outside the source Host owner', 403);
      assertWritableScope(destination);
      if (destination.workspaceId === source.workspaceId) return relocationResult(rootSessionId, destination.workspaceId);
      const intent = { rootSessionId, transactionId: randomUUID(), sourceWorkspaceId: source.workspaceId, destinationWorkspaceId: destination.workspaceId };
      await agentScopeStore.createRelocation(intent);
      try {
        const destinationScope = { rootSessionId, projectId: destination.projectId, workspaceId: destination.workspaceId, cwd: destination.cwd, agentDirectory: destination.agentDirectory,
          agentDirectoryId: destination.agentDirectoryId, displayPath: destination.displayPath ?? 'workspace' };
        if (destination.env) destinationScope.env = destination.env;
        const prepared = HostSessionRelocationPreparedSchema.parse(await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation/prepare`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(HostSessionRelocationPrepareSchema.parse({
            transactionId: intent.transactionId, sourceWorkspaceId: source.workspaceId,
            destination: destinationScope,
          })),
        }));
        if (prepared.transactionId !== intent.transactionId) throw new OpenChamberControlError('Relocation acknowledgement identified another transaction', 502);
        await assertRelocationRuntime(intent, prepared.session, destination.workspaceId);
        await agentScopeStore.rebindSessionFamily(intent);
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
          if (owner === 'destination') await agentScopeStore.rollbackSessionFamily(intent);
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
  const control = async (sessionId, operation = {}) => { const scope = await scopeFor(sessionId); assertWritableScope(scope); if (operation?.type !== 'abort') throw new OpenChamberControlError('Unsupported session control operation', 400); const parsed = RunAbortRequestSchema.parse({ sessionId, runId: operation.runId }); const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(parsed.sessionId)}/runs/${encodeURIComponent(parsed.runId)}/abort`, { method: 'POST' }); return { run: RunSchema.parse(body?.run) }; };
  const remove = async (id) => { const scope = await scopeFor(id); const ack = SessionDeleteAckSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })); if (ack.sessionId !== id) throw new OpenChamberControlError('Session deletion acknowledgement identified another session', 502); if (scope.workspaceId.startsWith('archive_')) await onArchiveDeleted?.(scope, ack); return ack; };
  return { create, send, steer, followUp, fork, selectBranch, relocate, delete: remove, open, history, list, control, resolveDirectory: async (payload = {}) => { const scope = await resolveWorkspaceScope(payload.workspaceId); if (!scope) throw new OpenChamberControlError('Workspace was not found', 404); return scope.cwd; }, archive, unarchive, getMetadata, setMetadata, sessionMetadataStore, archiveStore };
};



export const createOpenChamberSessionService = (dependencies) => createCanonicalSessionService(dependencies);
const sendServiceError = (res, error, fallback) => {
  const controlError = asControlError(error, fallback);
  const status = controlError.statusCode >= 400 && controlError.statusCode <= 599 ? controlError.statusCode : 500;
  const codeResult = ProblemCodeSchema.safeParse(error?.code);
  const code = codeResult.success ? codeResult.data : status === 404 ? 'SESSION_NOT_FOUND' : status === 400 ? 'INVALID_REQUEST' : status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
  const problem = ProblemDetailsSchema.parse({ type: `urn:ohpichamber:problem:${code}`, title: 'Session operation failed', status, detail: controlError.message || fallback || 'Session operation failed', code, retryable: error?.retryable ?? status >= 500 });
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
};
export const registerCanonicalSessionRoutes = (router, service) => {
  const call = async (res, operation, fallback) => { try { res.json(await operation()); } catch (error) { sendServiceError(res, error, fallback); } };
  router.post('/', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.create(req.body || {}), 'Failed to create session'));
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
  router.post('/:sessionId/branch', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.selectBranch(req.params.sessionId, req.body || {}), 'Failed to select session branch'));
  router.post('/:sessionId/relocate', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.relocate(req.params.sessionId, req.body || {}), 'Failed to relocate session'));
};
