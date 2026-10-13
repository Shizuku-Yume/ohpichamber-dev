
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
  && scope.projectId
  && scope.workspaceId
  && scope.cwd);

/**
 * Single delivery owner for direct and durable Host prompts. Capture is done
 * before queue persistence/admission; acceptance is the only point at which
 * delivery cursors and user activity advance.
 */
export function createHostPromptDeliveryRuntime({
  resolveSessionScope,
  routingRuntime,
  sessionKnowledgeRuntime,

  scheduledTasksRuntime,
  sessionRuntime,
}) {
  if (!resolveSessionScope) throw new TypeError('prompt delivery requires resolveSessionScope');
  if (!routingRuntime?.resolveAutoSelection) throw new TypeError('prompt delivery requires routing runtime');
  if (!sessionKnowledgeRuntime?.resolvePendingForSession) throw new TypeError('prompt delivery requires session knowledge runtime');
  if (!sessionRuntime?.markUserMessageSent) throw new TypeError('prompt delivery requires session runtime activity');
  const accepted = new Map();
  const completed = new Set();

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
    const options = parsed.options;
    const routing = await routingRuntime.resolveAutoSelection({ sessionId: fresh.sessionId, directory: fresh.cwd, workspaceId: fresh.workspaceId, model: options.modelId ? { providerId: options.providerId, modelId: options.modelId } : null, agent: options.agentId, requestText: parsed.input.text });
    if (routing) {
      options.providerId = routing.model.providerId;
      options.modelId = routing.model.modelId;
      options.agentId = routing.agent ?? options.agentId;
      options.variant = routing.model.variant ?? options.variant;
    }
    const knowledge = await sessionKnowledgeRuntime.resolvePendingForSession(fresh.sessionId, fresh.cwd);
    const context = [...(parsed.input.context ?? [])];
    const scheduledEntry = context.find((entry) => entry?.kind === 'context' && entry?.metadata?.scheduledTask);
    const scheduledTask = scheduledEntry?.metadata?.scheduledTask;
    const deliveryReceiptId = scheduledEntry?.deliveryReceiptId;
    const metadata = {};
    if (knowledge.text) metadata.knowledge = { signature: knowledge.signature };
    if (scheduledTask) metadata.scheduledTask = scheduledTask;
    if (deliveryReceiptId) metadata.deliveryReceiptId = deliveryReceiptId;
    if (Object.keys(metadata).length > 0) context.push({ kind: 'context', text: knowledge.text || '', metadata });
    return PromptRequestSchema.parse({ input: { ...parsed.input, context }, options });
  };

  const beforeDispatch = async (scope, capture) => {
    const fresh = await requireScope(scope);
    const request = PromptRequestSchema.parse(capture);
    const scheduled = request.input.context?.find((entry) => entry?.kind === 'context' && entry?.metadata?.scheduledTask)?.metadata?.scheduledTask;
    if (scheduled && scheduledTasksRuntime?.beforeScheduledTaskSend) await scheduledTasksRuntime.beforeScheduledTaskSend(fresh, { request, scheduledTask: scheduled });
    return fresh;
  };

  const onPromptAccepted = async (scope, capture, receipt = {}) => {
    const fresh = await requireScope(scope);
    const request = PromptRequestSchema.parse(capture);
    const contexts = request.input.context ?? [];
    const identity = receipt.deliveryRunId || receipt.runId || receipt.followUpId || contexts.find((entry) => entry?.deliveryReceiptId)?.deliveryReceiptId;
    if (!identity) throw asError('Prompt acceptance receipt has no stable identity', 502, 'INTERNAL_ERROR');
    const key = `${fresh.sessionId}:${identity}`;
    if (completed.has(key)) return { duplicate: true, identity };
    const previous = accepted.get(key);
    if (previous) return previous;
    const operation = (async () => {
      const knowledge = contexts.find((entry) => entry?.kind === 'context' && entry?.metadata?.knowledge);
      if (knowledge?.metadata?.knowledge?.signature) await sessionKnowledgeRuntime.recordDelivered(fresh.sessionId, fresh.cwd, knowledge.metadata.knowledge.signature);
      sessionRuntime.markUserMessageSent(fresh.sessionId);
      return { duplicate: false, identity };
    })();
    accepted.set(key, operation);
    try { const result = await operation; accepted.delete(key); completed.add(key); if (completed.size > 1024) completed.delete(completed.values().next().value); return result; } catch (error) { accepted.delete(key); throw error; }
  };

  return { capturePrompt, beforeDispatch, onPromptAccepted };
}
