import { isDeepStrictEqual } from 'node:util';
import { CapturedHostBootstrapScopeSchema, HostAuthorizationScopeSchema, HostWorkerAuthorizationCancelSchema, HostWorkerAuthorizationRequestSchema, HostWorkerAuthorizationReplySchema, HostWorkerActionRequestSchema, HostWorkerActionReplySchema, HostWorkerActionCancelSchema, HostActionResultSchema, WorkerPolicyResultSchema } from '@openchamber/agent-service/private-protocol';

const unavailable = { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 };
const unauthorized = { allowed: false, code: 'UNAUTHORIZED', status: 403 };
const actionUnavailable = { ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 };
const actionUnauthorized = { ok: false, code: 'UNAUTHORIZED', status: 403 };

/** Pending capabilities belong to one service child and expire without a retry. */
export const createHostWorkerAuthorizationChannel = ({ isCurrentChild, capturedScope, readLiveScope, authorizeWorkerOperation, invokeHostAction }) => {
  const pending = new Map();
  const send = (child, requestId, result, action) => {
    if (!isCurrentChild(child) || !child.connected) return;
    const schema = action ? HostWorkerActionReplySchema : HostWorkerAuthorizationReplySchema;
    const reply = schema.safeParse({ type: action ? 'worker.action.result' : 'worker.authorization.result', requestId, result });
    if (reply.success) child.send(reply.data, () => {});
  };
  const remove = (requestId, handle) => {
    if (pending.get(requestId) !== handle) return false;
    pending.delete(requestId); clearTimeout(handle.timer); handle.controller.abort(); return true;
  };
  const closeChild = child => {
    for (const [requestId, handle] of pending) if (handle.child === child) remove(requestId, handle);
  };
  const handleMessage = (child, raw) => {
    if (raw?.type === 'worker.authorization.cancel' || raw?.type === 'worker.action.cancel') {
      const schema = raw.type === 'worker.action.cancel' ? HostWorkerActionCancelSchema : HostWorkerAuthorizationCancelSchema;
      const message = schema.safeParse(raw);
      if (!message.success) return;
      const handle = pending.get(message.data.requestId);
      if (handle?.child === child) remove(message.data.requestId, handle);
      return;
    }
    const action = raw?.type === 'worker.action.request';
    if (!action && raw?.type !== 'worker.authorization.request') return;
    const parsed = (action ? HostWorkerActionRequestSchema : HostWorkerAuthorizationRequestSchema).safeParse(raw);
    if (!parsed.success) { send(child, raw?.requestId, action ? actionUnauthorized : unauthorized, action); return; }
    const message = parsed.data; const requestId = message.requestId;
    if (!isCurrentChild(child) || pending.has(requestId)) { send(child, requestId, action ? actionUnauthorized : unauthorized, action); return; }
    const captured = capturedScope(message.scope.rootSessionId);
    const requested = CapturedHostBootstrapScopeSchema.parse({
      rootSessionId: message.scope.rootSessionId, projectId: message.scope.projectId,
      workspaceId: message.scope.workspaceId, cwd: message.scope.cwd,
      agentDirectory: message.scope.agentDirectory, ...(message.scope.agentDirectoryId === undefined ? {} : { agentDirectoryId: message.scope.agentDirectoryId }),
    });
    if (!captured || !isDeepStrictEqual(captured, requested) || (action && message.request.sessionId !== captured.rootSessionId)) { send(child, requestId, action ? actionUnauthorized : unauthorized, action); return; }
    const operation = action ? invokeHostAction : authorizeWorkerOperation;
    if (typeof operation !== 'function') { send(child, requestId, action ? actionUnavailable : unavailable, action); return; }
    const handle = { child, controller: new AbortController(), timer: null };
    handle.timer = setTimeout(() => { if (remove(requestId, handle)) send(child, requestId, action ? actionUnavailable : unavailable, action); }, action ? 120_000 : 5_000);
    pending.set(requestId, handle);
    const active = () => pending.get(requestId) === handle && isCurrentChild(child) && child.connected && capturedScope(message.scope.rootSessionId) === captured;
    const live = async () => {
      if (!active()) return false;
      const scope = HostAuthorizationScopeSchema.safeParse(await readLiveScope(child, message.scope.rootSessionId, handle.controller.signal));
      return active() && scope.success && isDeepStrictEqual(scope.data, message.scope);
    };
    void (async () => {
      let result = action ? actionUnauthorized : unauthorized;
      try {
        if (await live()) {
          const trustedScope = Object.freeze({ ...captured, workerGeneration: message.scope.workerGeneration });
          // The required Node capability owner authorizes the action before its side effect.
          const decision = (action ? HostActionResultSchema : WorkerPolicyResultSchema).safeParse(action
            ? await invokeHostAction(trustedScope, message.request, handle.controller.signal)
            : await authorizeWorkerOperation(trustedScope, message.request, message.descriptor));
          result = decision.success && await live() ? decision.data : action ? actionUnavailable : unavailable;
        }
      } catch (error) {
        const failure = action && Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
          ? HostActionResultSchema.safeParse({ ok: false, code: error.code ?? 'INTERNAL_ERROR', status: error.status }) : null;
        result = failure?.success ? failure.data : action ? actionUnavailable : unavailable;
      }
      if (active() && remove(requestId, handle)) send(child, requestId, result, action);
    })();
  };
  return { handleMessage, closeChild, close: () => { for (const [requestId, handle] of pending) remove(requestId, handle); } };
};
