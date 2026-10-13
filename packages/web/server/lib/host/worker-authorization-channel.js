import { isDeepStrictEqual } from 'node:util';
import { CapturedHostBootstrapScopeSchema, HostAuthorizationScopeSchema, HostWorkerAuthorizationCancelSchema, HostWorkerAuthorizationRequestSchema, HostWorkerAuthorizationReplySchema, WorkerPolicyResultSchema } from '@openchamber/agent-service/private-protocol';

const unavailable = { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 };
const unauthorized = { allowed: false, code: 'UNAUTHORIZED', status: 403 };

/** Pending capabilities belong to one service child and expire without a retry. */
export const createHostWorkerAuthorizationChannel = ({ isCurrentChild, capturedScope, readLiveScope, authorizeWorkerOperation }) => {
  const pending = new Map();
  const send = (child, requestId, result) => {
    if (!isCurrentChild(child) || !child.connected) return;
    const reply = HostWorkerAuthorizationReplySchema.safeParse({ type: 'worker.authorization.result', requestId, result });
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
    if (raw?.type === 'worker.authorization.cancel') {
      const message = HostWorkerAuthorizationCancelSchema.safeParse(raw);
      if (!message.success) return;
      const handle = pending.get(message.data.requestId);
      if (handle?.child === child) remove(message.data.requestId, handle);
      return;
    }
    if (raw?.type !== 'worker.authorization.request') return;
    const parsed = HostWorkerAuthorizationRequestSchema.safeParse(raw);
    if (!parsed.success) { send(child, raw?.requestId, unauthorized); return; }
    const message = parsed.data; const requestId = message.requestId;
    if (!isCurrentChild(child) || pending.has(requestId)) { send(child, requestId, unauthorized); return; }
    const captured = capturedScope(message.scope.rootSessionId);
    const requested = CapturedHostBootstrapScopeSchema.parse({
      rootSessionId: message.scope.rootSessionId, projectId: message.scope.projectId,
      workspaceId: message.scope.workspaceId, cwd: message.scope.cwd,
      agentDirectory: message.scope.agentDirectory, ...(message.scope.agentDirectoryId === undefined ? {} : { agentDirectoryId: message.scope.agentDirectoryId }),
    });
    if (!captured || !isDeepStrictEqual(captured, requested)) { send(child, requestId, unauthorized); return; }
    if (typeof authorizeWorkerOperation !== 'function') { send(child, requestId, unavailable); return; }
    const handle = { child, controller: new AbortController(), timer: null };
    handle.timer = setTimeout(() => { if (remove(requestId, handle)) send(child, requestId, unavailable); }, 5_000);
    pending.set(requestId, handle);
    const active = () => pending.get(requestId) === handle && isCurrentChild(child) && child.connected && capturedScope(message.scope.rootSessionId) === captured;
    const live = async () => {
      if (!active()) return false;
      const scope = HostAuthorizationScopeSchema.safeParse(await readLiveScope(child, message.scope.rootSessionId, handle.controller.signal));
      return active() && scope.success && isDeepStrictEqual(scope.data, message.scope);
    };
    void (async () => {
      let result = unauthorized;
      try {
        if (await live()) {
          const decision = WorkerPolicyResultSchema.safeParse(await authorizeWorkerOperation(Object.freeze({ ...captured, workerGeneration: message.scope.workerGeneration }), message.request));
          result = decision.success && await live() ? decision.data : unavailable;
        }
      } catch { result = unavailable; }
      if (active() && remove(requestId, handle)) send(child, requestId, result);
    })();
  };
  return { handleMessage, closeChild, close: () => { for (const [requestId, handle] of pending) remove(requestId, handle); } };
};
