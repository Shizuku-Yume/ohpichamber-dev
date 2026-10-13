
import { PromptRequestSchema } from '@openchamber/agent-contract';
const asError = (message, status = 400, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { status, code });
const scopeIdentity = (scope) => ({
  sessionId: scope?.sessionId,
  rootSessionId: scope?.rootSessionId,
  projectId: scope?.projectId,
  workspaceId: scope?.workspaceId,
  cwd: scope?.cwd,
  agentDirectory: scope?.agentDirectory,
  agentDirectoryId: scope?.agentDirectoryId,
  hostProjectId: scope?.hostProjectId,
  projectDirectory: scope?.projectDirectory,
  displayPath: scope?.displayPath,
});
const validScope = (scope, sessionId) => Boolean(scope
  && scope.sessionId === sessionId
  && typeof scope.projectId === 'string'
  && typeof scope.workspaceId === 'string'
  && typeof scope.cwd === 'string');

/**
 * Single delivery owner for direct and durable Host prompts. Capture is done
 * before queue persistence/admission; acceptance is the only point at which
 * delivery cursors and user activity advance.
 */
export function createHostPromptDeliveryRuntime({
  resolveSessionScope,
  routingRuntime,
  sessionKnowledgeRuntime,
  contextObligatoryRuntime,
  scheduledTasksRuntime,
  sessionRuntime,
}) {
  if (typeof resolveSessionScope !== 'function') throw new TypeError('prompt delivery requires resolveSessionScope');
  if (!routingRuntime || typeof routingRuntime.resolveAutoSelection !== 'function') throw new TypeError('prompt delivery requires routing runtime');
  if (!sessionKnowledgeRuntime || typeof sessionKnowledgeRuntime.resolvePendingForSession !== 'function') throw new TypeError('prompt delivery requires session knowledge runtime');
  const accepted = new Set();

  const requireScope = async (scope, identity = {}) => {
    const sessionId = scope?.sessionId || identity.sessionId;
    const fresh = await resolveSessionScope(sessionId);
    if (!validScope(fresh, sessionId)) throw asError('Session scope is unavailable', 404, 'SESSION_NOT_FOUND');
    if (scope && (scope.projectId !== fresh.projectId || scope.workspaceId !== fresh.workspaceId)) {
      throw asError('Prompt scope does not match the authorized session', 403, 'UNAUTHORIZED');
    }
    return fresh;
  };

  const capturePrompt = async (scope, request) => {
    const fresh = await requireScope(scope);
    const parsed = PromptRequestSchema.parse(request);
    const options = { ...parsed.options };
    const routing = await routingRuntime.resolveAutoSelection({ sessionId: fresh.sessionId, directory: fresh.cwd, workspaceId: fresh.workspaceId, model: options.modelId ? { providerID: options.providerId, id: options.modelId } : null, agent: options.agentId, requestText: parsed.input.text });
    if (routing) {
      options.providerId = routing.model.providerID;
      options.modelId = routing.model.id;
      options.agentId = routing.agent ?? options.agentId;
      options.variant = routing.model.variant ?? options.variant;
    }
    const knowledge = await sessionKnowledgeRuntime.resolvePendingForSession(fresh.sessionId, fresh.cwd);
    const context = [...(parsed.input.context ?? [])];
    if (knowledge.text) context.push({ kind: 'context', text: knowledge.text, metadata: { knowledge: { signature: knowledge.signature } } });
    return { request: PromptRequestSchema.parse({ input: { ...parsed.input, context }, options }), scope: scopeIdentity(fresh), knowledgeSignature: knowledge.signature, knowledgeText: knowledge.text };
  };

  const beforeDispatch = async (scope, capture) => {
    const fresh = await requireScope(scope, capture);
    if (!capture?.request) throw asError('Prompt capture is required');
    if (capture.scheduledTask && scheduledTasksRuntime?.validateTarget) {
      await scheduledTasksRuntime.validateTarget(fresh.sessionId, fresh.cwd, capture.scheduledTask);
    }
    return fresh;
  };

  const onPromptAccepted = async (scope, capture, receipt = capture?.receipt) => {
    const fresh = await requireScope(scope, capture);
    const identity = receipt?.deliveryRunId || receipt?.runId || receipt?.followUpId
      || capture?.deliveryRunId || capture?.runId;
    if (!identity) throw asError('Prompt acceptance receipt has no stable identity', 502, 'INTERNAL_ERROR');
    const key = `${fresh.sessionId}:${identity}`;
    if (accepted.has(key)) return { duplicate: true, identity };
    accepted.add(key);
    const delivery = capture?.knowledgeText ? capture : null;
    if (delivery?.knowledgeText && delivery.knowledgeSignature) {
      await sessionKnowledgeRuntime.recordDelivered(fresh.sessionId, fresh.cwd, delivery.knowledgeSignature);
    }
    sessionRuntime?.markUserMessageSent?.(fresh.sessionId);
    if (capture?.scheduledTask && scheduledTasksRuntime?.onScheduledTaskResult) {
      await scheduledTasksRuntime.onScheduledTaskResult(capture.scheduledTask, 'accepted');
    }
    return { duplicate: false, identity };
  };

  return { capturePrompt, beforeDispatch, onPromptAccepted };
}
