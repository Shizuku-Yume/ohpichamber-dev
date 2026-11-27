import type { Serializable } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  hostActionTimeoutMs,
  CapturedHostBootstrapScopeSchema,
  HostAuthorizationScopeSchema,
  HostWorkerAuthorizationCancelSchema,
  HostWorkerAuthorizationRequestSchema,
  HostWorkerAuthorizationReplySchema,
  HostWorkerActionRequestSchema,
  HostWorkerActionReplySchema,
  HostWorkerActionCancelSchema,
  HostActionResultSchema,
  WorkerPolicyResultSchema,
  type CapturedHostBootstrapScope,
  type HostActionRequest,
  type HostActionResult,
  type HostAuthorizationScope,
  type NativeOperationDescriptor,
  type WorkerPolicyRequest,
  type WorkerPolicyResult,
} from '@openchamber/agent-service/private-protocol';
import type { JsonValue } from '../shared/json-values.js';

const unavailable: WorkerPolicyResult = {
  allowed: false,
  code: 'SERVICE_UNAVAILABLE',
  status: 503,
  detail: 'The Host authorization channel is unavailable',
};
const unauthorized: WorkerPolicyResult = {
  allowed: false,
  code: 'UNAUTHORIZED',
  status: 403,
  detail: 'The worker authorization request is not valid for this Host child',
};
const actionUnavailable: HostActionResult = { ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 };
const actionUnauthorized: HostActionResult = { ok: false, code: 'UNAUTHORIZED', status: 403 };

const RawMessageHeaderSchema = z.object({
  type: z.string().optional(),
  requestId: z.string().optional(),
});

const ActionHttpErrorSchema = z.object({
  status: z.number().int().min(400).max(599),
  code: z.string().optional(),
  message: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export interface WorkerAuthorizationChild {
  readonly connected: boolean;
  send(
    message: z.infer<typeof HostWorkerAuthorizationReplySchema> | z.infer<typeof HostWorkerActionReplySchema>,
    callback?: (error: Error | null) => void,
  ): boolean | void;
}

export interface HostWorkerAuthorizationChannelOptions {
  isCurrentChild: (child: WorkerAuthorizationChild) => boolean;
  capturedScope: (rootSessionId: string) => CapturedHostBootstrapScope | undefined;
  readLiveScope: (
    child: WorkerAuthorizationChild,
    rootSessionId: string,
    signal: AbortSignal,
  ) => Promise<HostAuthorizationScope | JsonValue | undefined>;
  authorizeWorkerOperation?: ((
    scope: HostAuthorizationScope,
    request: WorkerPolicyRequest,
    descriptor?: NativeOperationDescriptor,
  ) => Promise<WorkerPolicyResult>) | undefined;
  invokeHostAction?: ((
    scope: HostAuthorizationScope,
    request: HostActionRequest,
    signal: AbortSignal,
  ) => Promise<HostActionResult>) | undefined;
}
interface ActionFailurePayload {
  ok: false;
  code: string;
  status: number;
  detail?: string;
}

interface PendingChannelHandle {
  child: WorkerAuthorizationChild;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
}

export const createHostWorkerAuthorizationChannel = ({
  isCurrentChild,
  capturedScope,
  readLiveScope,
  authorizeWorkerOperation,
  invokeHostAction,
}: HostWorkerAuthorizationChannelOptions) => {
  const pending = new Map<string, PendingChannelHandle>();

  const send = (
    child: WorkerAuthorizationChild,
    requestId: string,
    result: WorkerPolicyResult | HostActionResult,
    action: boolean,
  ) => {
    if (!isCurrentChild(child) || !child.connected) return;
    if (action) {
      const reply = HostWorkerActionReplySchema.safeParse({ type: 'worker.action.result', requestId, result });
      if (reply.success) child.send(reply.data, () => { });
      return;
    }
    const reply = HostWorkerAuthorizationReplySchema.safeParse({ type: 'worker.authorization.result', requestId, result });
    if (reply.success) child.send(reply.data, () => { });
  };

  const remove = (requestId: string, handle: PendingChannelHandle): boolean => {
    if (pending.get(requestId) !== handle) return false;
    pending.delete(requestId);
    if (handle.timer !== null) clearTimeout(handle.timer);
    handle.controller.abort();
    return true;
  };

  const closeChild = (child: WorkerAuthorizationChild) => {
    for (const [requestId, handle] of pending) {
      if (handle.child === child) remove(requestId, handle);
    }
  };

  const handleMessage = (child: WorkerAuthorizationChild, raw: Serializable | undefined) => {
    const header = RawMessageHeaderSchema.safeParse(raw);
    const messageType = header.success ? header.data.type : undefined;
    const rawRequestId = header.success ? header.data.requestId : undefined;

    if (messageType === 'worker.authorization.cancel' || messageType === 'worker.action.cancel') {
      const schema = messageType === 'worker.action.cancel'
        ? HostWorkerActionCancelSchema
        : HostWorkerAuthorizationCancelSchema;
      const message = schema.safeParse(raw);
      if (!message.success) return;
      const handle = pending.get(message.data.requestId);
      if (handle?.child === child) remove(message.data.requestId, handle);
      return;
    }

    const action = messageType === 'worker.action.request';
    if (!action && messageType !== 'worker.authorization.request') return;

    const parsed = action
      ? HostWorkerActionRequestSchema.safeParse(raw)
      : HostWorkerAuthorizationRequestSchema.safeParse(raw);
    if (!parsed.success) {
      if (rawRequestId !== undefined) send(child, rawRequestId, action ? actionUnauthorized : unauthorized, action);
      return;
    }

    const message = parsed.data;
    const requestId = message.requestId;
    if (!isCurrentChild(child) || pending.has(requestId)) {
      send(child, requestId, action ? actionUnauthorized : unauthorized, action);
      return;
    }

    const captured = capturedScope(message.scope.rootSessionId);
    const requestedInput: z.input<typeof CapturedHostBootstrapScopeSchema> = {
      rootSessionId: message.scope.rootSessionId,
      projectId: message.scope.projectId,
      workspaceId: message.scope.workspaceId,
      cwd: message.scope.cwd,
      agentDirectory: message.scope.agentDirectory,
    };
    if (message.scope.agentDirectoryId !== undefined) requestedInput.agentDirectoryId = message.scope.agentDirectoryId;
    const requested = CapturedHostBootstrapScopeSchema.parse(requestedInput);

    if (
      !captured
      || !isDeepStrictEqual(captured, requested)
      || (message.type === 'worker.action.request' && message.request.sessionId !== captured.rootSessionId)
    ) {
      send(child, requestId, action ? actionUnauthorized : unauthorized, action);
      return;
    }

    if ((action && !invokeHostAction) || (!action && !authorizeWorkerOperation)) {
      send(child, requestId, action ? actionUnavailable : unavailable, action);
      return;
    }

    const handle: PendingChannelHandle = { child, controller: new AbortController(), timer: null };
    const timeoutMs = message.type === 'worker.action.request' ? hostActionTimeoutMs(message.request) : 5_000;
    if (timeoutMs !== undefined) {
      handle.timer = setTimeout(() => {
        if (remove(requestId, handle)) send(child, requestId, action ? actionUnavailable : unavailable, action);
      }, timeoutMs);
    }
    pending.set(requestId, handle);

    const active = () => (
      pending.get(requestId) === handle
      && isCurrentChild(child)
      && child.connected
      && capturedScope(message.scope.rootSessionId) === captured
    );

    const live = async () => {
      if (!active()) return false;
      const scope = HostAuthorizationScopeSchema.safeParse(await readLiveScope(child, message.scope.rootSessionId, handle.controller.signal));
      return active() && scope.success && isDeepStrictEqual(scope.data, message.scope);
    };

    void (async () => {
      let result: WorkerPolicyResult | HostActionResult = action ? actionUnauthorized : unauthorized;
      try {
        if (await live()) {
          const trustedScope: HostAuthorizationScope = Object.freeze({
            ...captured,
            workerGeneration: message.scope.workerGeneration,
          });
          if (message.type === 'worker.action.request' && invokeHostAction) {
            const decision = HostActionResultSchema.safeParse(
              await invokeHostAction(trustedScope, message.request, handle.controller.signal),
            );
            result = decision.success && await live() ? decision.data : actionUnavailable;
          } else if (message.type === 'worker.authorization.request' && authorizeWorkerOperation) {
            const decision = WorkerPolicyResultSchema.safeParse(
              await authorizeWorkerOperation(trustedScope, message.request, message.descriptor),
            );
            result = decision.success && await live() ? decision.data : unavailable;
          }
        }
      } catch (error) {
        let failurePayload: ReturnType<typeof HostActionResultSchema.safeParse> | null = null;
        const parsedError = action ? ActionHttpErrorSchema.safeParse(error) : null;
        if (parsedError?.success) {
          const payload: ActionFailurePayload = {
            ok: false,
            code: parsedError.data.code ?? 'INTERNAL_ERROR',
            status: parsedError.data.status,
          };
          if (parsedError.data.message !== undefined && parsedError.data.message !== '') {
            payload.detail = String(parsedError.data.message);
          }
          failurePayload = HostActionResultSchema.safeParse(payload);
        }
        result = failurePayload?.success ? failurePayload.data : action ? actionUnavailable : unavailable;
      }
      if (active() && remove(requestId, handle)) send(child, requestId, result, action);
    })();
  };

  return {
    handleMessage,
    closeChild,
    close: () => {
      for (const [requestId, handle] of pending) remove(requestId, handle);
    },
  };
};
