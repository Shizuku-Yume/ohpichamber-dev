import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProblemDetailsSchema, RuntimeSessionSchema } from '@openchamber/agent-contract';
import { HostNativePolicySnapshotSchema, HostWorkspacePolicySchema, HostWorkspaceRegisteredSchema } from '@openchamber/agent-service/private-protocol';
import { createAgentServiceSupervisor } from './agent-service-supervisor.js';
import { createWorkerOperationAuthorizer } from './worker-operation-authorizer.js';
import { openApprovalPolicyStore } from './approval-policy-store.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { createSkillFileOwner } from './skill-file-owner.js';

const failure = (message, code = 'SERVICE_UNAVAILABLE', status = 503) => Object.assign(new Error(message), { code, status });
// The Agent Service problem document is the authority: its detail travels unchanged
// so the UI can name the refusing check instead of a Host-invented sentence.
const readResponse = async (response, schema) => {
  let body;
  try { body = await response.json(); }
  catch { throw failure(`The Agent Service answered HTTP ${response.status} with a body that is not JSON`); }
  if (!response.ok) {
    const parsed = ProblemDetailsSchema.safeParse(body);
    if (parsed.success) throw failure(parsed.data.detail, parsed.data.code, parsed.data.status);
    throw failure(`The Agent Service answered HTTP ${response.status} without a problem document`);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw failure(`The Agent Service reply did not match the expected response schema (HTTP ${response.status})`);
  return result.data;
};
const sameScope = (left, right) => left.projectId === right.projectId
  && left.workspaceId === right.workspaceId && left.agentDirectoryId === right.agentDirectoryId
  && left.cwd === right.cwd && left.agentDirectory === right.agentDirectory;

import {
  ensureAgentRuntimeSymlinks,
  resolveWebAgentRuntime,
} from '../../../scripts/standalone-loader.mjs';
import { detectSystemOmpRuntime } from './system-omp-runtime.js';

export {
  ensureAgentRuntimeSymlinks,
  resolveWebAgentRuntime,
};

/** Node admission and machine policy around the separate, SDK-owning Bun service. */
export function createHostAgentRuntime({
  dataDir, scopeRuntime, validateDirectoryPath, getEnvironmentForDirectory,
  invokeHostAction, enterprisePolicyOptions, bunPath, entrypoint,
  resolveHostTools,
}) {
  const bundledRuntime = resolveWebAgentRuntime();
  const detected = detectSystemOmpRuntime({
    bundledRuntime,
    env: process.env,
    candidatePaths: bunPath && entrypoint ? [] : undefined,
  });
  let resolvedBunPath = bunPath ?? (detected.source === 'operator' || detected.source === 'system' ? detected.bunPath : null) ?? process.env.OHPICHAMBER_BUN ?? bundledRuntime?.bunPath;
  let resolvedEntrypoint = entrypoint ?? process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT ?? bundledRuntime?.entrypoint;
  if (!resolvedBunPath || !resolvedEntrypoint) {
    resolvedBunPath ??= 'bun';
    resolvedEntrypoint ??= fileURLToPath(new URL('../index.js', import.meta.resolve('@openchamber/agent-service/private-protocol')));
  }
  if (detected.env?.BUN_BE_BUN === '1') {
    process.env.BUN_BE_BUN = '1';
  } else {
    delete process.env.BUN_BE_BUN;
  }
  process.env.OHPICHAMBER_BUN ??= resolvedBunPath;
  process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT ??= resolvedEntrypoint;
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
      fileTools: ['read', 'write'], shellCommands: [],
      providerEntry: !isEnterpriseMode(enterprisePolicyOptions),
    });
  };
  const authorizeWorkerOperation = createWorkerOperationAuthorizer({
    resolvePolicy, validateDirectoryPath, enterprisePolicyOptions, approvalPolicyStore,
  });
  service = createAgentServiceSupervisor({
    bunPath: resolvedBunPath, entrypoint: resolvedEntrypoint, dataDir, approvalPolicyStore, authorizeWorkerOperation,
    invokeHostAction, handleSkillSource: (operation, capturedScope) => skillFileOwner.handle(operation, capturedScope),
  });
  skillFileOwner = createSkillFileOwner({ service });
  const admitWorkspace = async (scope) => {
    const env = isEnterpriseMode(enterprisePolicyOptions)
      ? {} : await getEnvironmentForDirectory(scope.cwd);
    // The workspace catalog answers from this admission, so the Host's current
    // tool enablement travels with it rather than a worker-side default.
    const hostTools = await resolveHostTools();
    const registration = await readResponse(await service.request(
      `/internal/workspaces/${encodeURIComponent(scope.workspaceId)}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: scope.projectId, cwd: scope.cwd, agentDirectory: scope.agentDirectory,
          agentDirectoryId: scope.agentDirectoryId, env, hostTools,
        }),
      },
    ), HostWorkspaceRegisteredSchema);
    if (registration.workspaceId !== scope.workspaceId || registration.projectId !== scope.projectId
      || registration.agentDirectoryId !== scope.agentDirectoryId) throw failure('The Agent Service registered a different workspace than the one admitted');
    return { ...scope, env };
  };
  const resolveWorkspaceScope = async (workspaceId, claimId) => {
    const scope = await scopeRuntime.resolveWorkspaceScope(workspaceId, claimId);
    return scope === null ? null : admitWorkspace(scope);
  };
  const resolveHostSessionScope = async (sessionId) => {
    const known = await scopeRuntime.resolveSessionScope(sessionId);
    if (known !== null || service.getState().phase !== 'ready') return known;
    const response = await service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`);
    if (response.status === 404) return null;
    const native = await readResponse(response, RuntimeSessionSchema);
    if (native.sessionId !== sessionId) throw failure('The Agent Service resolved a different session than the one requested');
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
    service, skillFileOwner, resolveWorkspaceScope,
    resolveWorkspaceDirectory: async (dir) => {
      let target = dir;
      if (typeof target === 'string') {
        const trimmed = target.trim();
        if (trimmed === '~') target = os.homedir();
        else if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) target = path.join(os.homedir(), trimmed.slice(2));
      }
      return scopeRuntime.resolveWorkspaceDirectory(target);
    },
    resolveSessionScope, resolveHostSessionScope,
    resolveRepositoryWorkspace: scopeRuntime.resolveRepositoryWorkspace,
    resolveHostRelocationScope: scopeRuntime.resolveRelocationSourceScope,
  };
}
