import { z } from 'zod';
import { JsonObjectSchema, PromptRequestSchema, type PromptContext, type PromptRequest } from '@openchamber/agent-contract';
import { routingRequestTextOf, type RoutingRuntime } from '../routing/runtime.js';
import type { SessionKnowledgeRuntime } from '../session-knowledge/runtime.js';
import type { JsonValue } from '../shared/json-values.js';

const KnowledgeMetadataSchema = z.object({ signature: z.string() });
export interface HostSessionScope {
  sessionId: string;
  rootSessionId?: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
  agentDirectory?: string;
  agentDirectoryId?: string;
  hostProjectId?: string;
  projectDirectory?: string;
  displayPath?: string | null | undefined;
}

export interface PromptDeliveryScheduledTasksPort {
  beforeScheduledTaskSend?: (
    scope: HostSessionScope,
    capture: { request: PromptRequest; scheduledTask?: JsonValue },
  ) => Promise<void> | void;
}

export interface PromptDeliverySessionRuntimePort {
  markUserMessageSent: (sessionId: string) => void;
}

export interface HostPromptDeliveryDependencies {
  resolveSessionScope: (sessionId: string) => Promise<HostSessionScope | null>;
  routingRuntime: Pick<RoutingRuntime, 'resolveAutoSelection'>;
  sessionKnowledgeRuntime: Pick<SessionKnowledgeRuntime, 'resolvePendingForSession' | 'recordDelivered'>;
  scheduledTasksRuntime?: PromptDeliveryScheduledTasksPort | undefined;
  sessionRuntime: PromptDeliverySessionRuntimePort;
  behaviorPromptSource?: (() => PromptContext[] | Promise<PromptContext[]>) | undefined;
}

export interface PromptAcceptanceReceipt {
  deliveryRunId?: string;
  runId?: string;
  followUpId?: string;
}

export interface PromptAcceptanceResult {
  duplicate: boolean;
  identity: string;
}

export interface HostPromptDeliveryRuntime {
  capturePrompt: (scope: HostSessionScope | null | undefined, request: PromptRequest) => Promise<PromptRequest>;
  beforeDispatch: (scope: HostSessionScope | null | undefined, capture: PromptRequest) => Promise<HostSessionScope>;
  onPromptAccepted: (
    scope: HostSessionScope | null | undefined,
    capture: PromptRequest,
    receipt?: PromptAcceptanceReceipt,
  ) => Promise<PromptAcceptanceResult>;
}

const asError = (message: string, status = 400, code = 'INVALID_REQUEST'): Error & { status: number; code: string } =>
  Object.assign(new Error(message), { status, code });

const validScope = (scope: HostSessionScope | null | undefined, sessionId: string | undefined): scope is HostSessionScope =>
  Boolean(scope && sessionId && scope.sessionId === sessionId && scope.projectId && scope.workspaceId && scope.cwd);

export function createHostPromptDeliveryRuntime({
  resolveSessionScope,
  routingRuntime,
  sessionKnowledgeRuntime,
  scheduledTasksRuntime,
  sessionRuntime,
  behaviorPromptSource,
}: HostPromptDeliveryDependencies): HostPromptDeliveryRuntime {
  if (!resolveSessionScope) throw new TypeError('prompt delivery requires resolveSessionScope');
  if (!routingRuntime?.resolveAutoSelection) throw new TypeError('prompt delivery requires routing runtime');
  if (!sessionKnowledgeRuntime?.resolvePendingForSession) throw new TypeError('prompt delivery requires session knowledge runtime');
  if (!sessionRuntime?.markUserMessageSent) throw new TypeError('prompt delivery requires session runtime activity');
  const accepted = new Map<string, Promise<PromptAcceptanceResult>>();
  const completed = new Set<string>();

  const requireScope = async (
    scope: HostSessionScope | null | undefined,
    identity: { sessionId?: string } = {},
  ): Promise<HostSessionScope> => {
    const sessionId = scope?.sessionId || identity.sessionId;
    const fresh = sessionId ? await resolveSessionScope(sessionId) : null;
    if (!validScope(fresh, sessionId)) throw asError('Session scope is unavailable', 404, 'SESSION_NOT_FOUND');
    if (scope && (scope.projectId !== fresh.projectId || scope.workspaceId !== fresh.workspaceId)) {
      throw asError('Prompt scope does not match the authorized session', 403, 'UNAUTHORIZED');
    }
    return fresh;
  };

  const capturePrompt = async (
    scope: HostSessionScope | null | undefined,
    request: PromptRequest,
  ): Promise<PromptRequest> => {
    const fresh = await requireScope(scope);
    const parsed = PromptRequestSchema.parse(request);
    const options = parsed.options;
    const routing = await routingRuntime.resolveAutoSelection({
      sessionId: fresh.sessionId,
      directory: fresh.cwd,
      workspaceId: fresh.workspaceId,
      model: options.modelId && options.providerId ? { providerId: options.providerId, modelId: options.modelId } : null,
      agent: null,
      requestText: routingRequestTextOf(parsed.input),
    });
    if (routing) {
      options.providerId = routing.model.providerId;
      options.modelId = routing.model.modelId;
      options.agentId = null;
      options.reasoningEffort = routing.model.reasoningEffort ?? null;
      options.variant = null;
    }
    const knowledge = await sessionKnowledgeRuntime.resolvePendingForSession(fresh.sessionId, fresh.cwd);
    const context: PromptContext[] = [...(parsed.input.context ?? [])];
    const scheduledEntry = context.find(
      (entry): entry is Extract<PromptContext, { kind: 'context' }> => entry.kind === 'context' && Boolean(entry.metadata.scheduledTask),
    );
    const scheduledTask = scheduledEntry?.metadata.scheduledTask;
    const deliveryReceiptId = scheduledEntry?.deliveryReceiptId;
    const metadata: z.infer<typeof JsonObjectSchema> = {};
    if (knowledge.text) metadata.knowledge = { signature: knowledge.signature };
    if (scheduledTask !== undefined) metadata.scheduledTask = scheduledTask;
    if (deliveryReceiptId) metadata.deliveryReceiptId = deliveryReceiptId;
    if (Object.keys(metadata).length > 0) context.push({ kind: 'context', text: knowledge.text || '', metadata });
    const behaviorContext = await behaviorPromptSource?.();
    if (behaviorContext?.length) context.push(...behaviorContext);
    return PromptRequestSchema.parse({ input: { ...parsed.input, context }, options });
  };

  const beforeDispatch = async (
    scope: HostSessionScope | null | undefined,
    capture: PromptRequest,
  ): Promise<HostSessionScope> => {
    const fresh = await requireScope(scope);
    const request = PromptRequestSchema.parse(capture);
    const scheduled = request.input.context.find(
      (entry): entry is Extract<PromptContext, { kind: 'context' }> => entry.kind === 'context' && Boolean(entry.metadata.scheduledTask),
    )?.metadata.scheduledTask;
    if (scheduled !== undefined && scheduledTasksRuntime?.beforeScheduledTaskSend) {
      await scheduledTasksRuntime.beforeScheduledTaskSend(fresh, { request, scheduledTask: scheduled });
    }
    return fresh;
  };

  const onPromptAccepted = async (
    scope: HostSessionScope | null | undefined,
    capture: PromptRequest,
    receipt: PromptAcceptanceReceipt = {},
  ): Promise<PromptAcceptanceResult> => {
    const fresh = await requireScope(scope);
    const request = PromptRequestSchema.parse(capture);
    const contexts = request.input.context;
    const identity = receipt.deliveryRunId || receipt.runId || receipt.followUpId || contexts.find(
      (entry): entry is Extract<PromptContext, { kind: 'context' }> => entry.kind === 'context' && Boolean(entry.deliveryReceiptId),
    )?.deliveryReceiptId;
    if (!identity) throw asError('Prompt acceptance receipt has no stable identity', 502, 'INTERNAL_ERROR');
    const key = `${fresh.sessionId}:${identity}`;
    if (completed.has(key)) return { duplicate: true, identity };
    const previous = accepted.get(key);
    if (previous) return previous;
    const operation = (async (): Promise<PromptAcceptanceResult> => {
      const knowledge = contexts.find(
        (entry): entry is Extract<PromptContext, { kind: 'context' }> => entry.kind === 'context' && Boolean(entry.metadata.knowledge),
      );
      const signature = KnowledgeMetadataSchema.safeParse(knowledge?.metadata.knowledge);
      if (signature.success) {
        await sessionKnowledgeRuntime.recordDelivered(fresh.sessionId, fresh.cwd, signature.data.signature);
      }
      sessionRuntime.markUserMessageSent(fresh.sessionId);
      return { duplicate: false, identity };
    })();
    accepted.set(key, operation);
    try {
      const result = await operation;
      accepted.delete(key);
      completed.add(key);
      if (completed.size > 1024) {
        const oldest = completed.values().next();
        if (!oldest.done) completed.delete(oldest.value);
      }
      return result;
    } catch (error) {
      accepted.delete(key);
      throw error;
    }
  };

  return { capturePrompt, beforeDispatch, onPromptAccepted };
}
