import { fileURLToPath } from 'node:url';
import { ProblemDetailsSchema, RuntimeSessionSchema } from '@openchamber/agent-contract';
import { HostNativePolicySnapshotSchema, HostWorkspacePolicySchema, HostWorkspaceRegisteredSchema } from '@openchamber/agent-service/private-protocol';
import { createAgentServiceSupervisor } from './agent-service-supervisor.js';
import { createWorkerOperationAuthorizer } from './worker-operation-authorizer.js';
import { openApprovalPolicyStore } from './approval-policy-store.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { createSkillFileOwner } from './skill-file-owner.js';

const unavailable = (code = 'SERVICE_UNAVAILABLE', status = 503) => Object.assign(
  new Error('The authorized Agent workspace is unavailable'), { code, status },
);
const readResponse = async (response, schema) => {
  let body;
  try { body = await response.json(); } catch { throw unavailable(); }
  if (!response.ok) {
    const parsed = ProblemDetailsSchema.safeParse(body);
    throw parsed.success ? unavailable(parsed.data.code, parsed.data.status) : unavailable();
  }
  const result = schema.safeParse(body);
  if (!result.success) throw unavailable();
  return result.data;
};
const sameScope = (left, right) => left.projectId === right.projectId
  && left.workspaceId === right.workspaceId && left.agentDirectoryId === right.agentDirectoryId
  && left.cwd === right.cwd && left.agentDirectory === right.agentDirectory;

/** Node admission and machine policy around the separate, SDK-owning Bun service. */
export function createHostAgentRuntime({
  dataDir, scopeRuntime, validateDirectoryPath, getEnvironmentForDirectory,
  invokeHostAction, enterprisePolicyOptions, bunPath,
  entrypoint = fileURLToPath(new URL('../index.js', import.meta.resolve('@openchamber/agent-service/private-protocol'))),
}) {
  const approvalPolicyStore = openApprovalPolicyStore({ dataDir });
  let service;
  let skillFileOwner;
  let closePromise;
  const resolvePolicy = async (captured) => {
    const authorized = await scopeRuntime.resolveWorkspaceScope(captured.workspaceId);
    if (!authorized || !sameScope(captured, authorized)) return null;
    const native = await readResponse(await service.request(
      `/internal/workspaces/${encodeURIComponent(authorized.workspaceId)}/authorization-policy?${new URLSearchParams({ agentDirectoryId: authorized.agentDirectoryId, rootSessionId: captured.rootSessionId })}`,
    ), HostNativePolicySnapshotSchema);
    if (!sameScope(native, authorized)) return null;
    return HostWorkspacePolicySchema.parse({
      ...native,
      // These are contained Host capabilities, not an SDK grant or a bypass of native approval.
      fileTools: ['read', 'write'], shellCommands: [], toolRequests: [],
      providerEntry: !isEnterpriseMode(enterprisePolicyOptions),
    });
  };
  const authorizeWorkerOperation = createWorkerOperationAuthorizer({
    resolvePolicy, validateDirectoryPath, enterprisePolicyOptions, approvalPolicyStore,
  });
  service = createAgentServiceSupervisor({
    bunPath, entrypoint, dataDir, approvalPolicyStore, authorizeWorkerOperation,
    invokeHostAction, handleSkillSource: (operation, capturedScope) => skillFileOwner.handle(operation, capturedScope),
  });
  skillFileOwner = createSkillFileOwner({ service });
  const admitWorkspace = async (scope) => {
    const env = isEnterpriseMode(enterprisePolicyOptions)
      ? {} : await getEnvironmentForDirectory(scope.cwd);
    const registration = await readResponse(await service.request(
      `/internal/workspaces/${encodeURIComponent(scope.workspaceId)}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: scope.projectId, cwd: scope.cwd, agentDirectory: scope.agentDirectory,
          agentDirectoryId: scope.agentDirectoryId, env,
        }),
      },
    ), HostWorkspaceRegisteredSchema);
    if (registration.workspaceId !== scope.workspaceId || registration.projectId !== scope.projectId
      || registration.agentDirectoryId !== scope.agentDirectoryId) throw unavailable();
    return { ...scope, env };
  };
  const resolveWorkspaceScope = async (workspaceId) => {
    const scope = await scopeRuntime.resolveWorkspaceScope(workspaceId);
    return scope === null ? null : admitWorkspace(scope);
  };
  const resolveHostSessionScope = async (sessionId) => {
    const known = await scopeRuntime.resolveSessionScope(sessionId);
    if (known !== null || service.getState().phase !== 'ready') return known;
    const response = await service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`);
    if (response.status === 404) return null;
    const native = await readResponse(response, RuntimeSessionSchema);
    if (native.sessionId !== sessionId) throw unavailable();
    // SDK children inherit only an already-admitted Host root; this cannot admit a new root from a caller ID.
    if (native.rootSessionId === sessionId) return null;
    const root = await scopeRuntime.resolveSessionScope(native.rootSessionId);
    if (!root || root.rootSessionId !== root.sessionId || root.projectId !== native.projectId
      || root.workspaceId !== native.workspaceId) return null;
    await scopeRuntime.registerSessionScope(native);
    return scopeRuntime.resolveSessionScope(sessionId);
  };
  const resolveSessionScope = async (sessionId) => {
    const scope = await resolveHostSessionScope(sessionId);
    return scope === null ? null : admitWorkspace(scope);
  };
  const close = () => {
    closePromise ??= (async () => {
      await service.stop();
      approvalPolicyStore.close();
    })();
    return closePromise;
  };
  return {
    start: () => {
      if (closePromise) throw new Error('The Host Agent runtime is closed');
      return service.start();
    },
    stop: () => service.stop(),
    close,
    service, skillFileOwner, resolveWorkspaceScope, resolveWorkspaceDirectory: scopeRuntime.resolveWorkspaceDirectory, resolveSessionScope, resolveHostSessionScope,
    resolveHostRelocationScope: scopeRuntime.resolveRelocationSourceScope,
  };
}
