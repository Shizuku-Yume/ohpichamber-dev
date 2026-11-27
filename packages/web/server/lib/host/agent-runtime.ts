import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ProblemDetailsSchema,
  RuntimeSessionSchema,
  type Workspace,
} from '@openchamber/agent-contract';
import {
  HostNativePolicySnapshotSchema,
  HostWorkspacePolicySchema,
  HostWorkspaceRegisteredSchema,
  type HostAuthorizationScope,
  type HostWorkspacePolicy,
} from '@openchamber/agent-service/private-protocol';
import {
  createAgentServiceSupervisor,
  type AgentServiceSupervisor,
  type AgentServiceSupervisorOptions,
  type AgentServiceSupervisorState,
} from './agent-service-supervisor.js';
import { createWorkerOperationAuthorizer } from './worker-operation-authorizer.js';
import { openApprovalPolicyStore } from './approval-policy-store.js';
import { isEnterpriseMode, type EnterprisePolicyOptions } from '../enterprise-mode.js';
import { createSkillFileOwner, type SkillFileOwner } from './skill-file-owner.js';
import type { HostAgentScopeRuntime, HostAgentScopeRuntimeScope, HostDirectoryValidationResult } from './agent-scope-runtime.js';
import type { HostSessionScopeRecord } from './agent-scope-store.js';
import { isString } from '../shared/guards.js';
import { ensureAgentRuntimeSymlinks, resolveWebAgentRuntime } from '../../../scripts/standalone-loader.mjs';
import { detectSystemOmpRuntime } from './system-omp-runtime.js';

export {
  ensureAgentRuntimeSymlinks,
  resolveWebAgentRuntime,
};

interface HostTaggedError extends Error {
  code: string;
  status: number;
}

export interface HostAdmittedWorkspaceScope extends HostAgentScopeRuntimeScope {
  env: Record<string, string>;
}

export interface HostAdmittedSessionScope extends HostSessionScopeRecord {
  displayPath: string;
  checkoutRemoved?: boolean;
  env: Record<string, string>;
}

export interface HostAgentRuntimeOptions {
  dataDir: string;
  scopeRuntime: Pick<
    HostAgentScopeRuntime,
    | 'resolveWorkspaceScope'
    | 'resolveSessionScope'
    | 'registerSessionScope'
    | 'resolveWorkspaceDirectory'
    | 'resolveRepositoryWorkspace'
    | 'resolveRelocationSourceScope'
  >;
  validateDirectoryPath: (directory: string) => Promise<HostDirectoryValidationResult>;
  getEnvironmentForDirectory: (directory: string) => Promise<Record<string, string>>;
  invokeHostAction: AgentServiceSupervisorOptions['invokeHostAction'];
  enterprisePolicyOptions?: EnterprisePolicyOptions | undefined;
  bunPath?: string | undefined;
  entrypoint?: string | undefined;
  resolveHostTools: () => Promise<Record<string, boolean>>;
}

export interface HostAgentRuntime {
  start(): Promise<AgentServiceSupervisorState>;
  stop(): Promise<void>;
  close(): Promise<void>;
  service: AgentServiceSupervisor;
  skillFileOwner: SkillFileOwner;
  resolveWorkspaceScope(workspaceId: string, claimId?: string): Promise<HostAdmittedWorkspaceScope | null>;
  resolveWorkspaceDirectory(dir: string): Promise<Workspace | null>;
  resolveSessionScope(sessionId: string): Promise<HostAdmittedSessionScope | null>;
  resolveHostSessionScope(sessionId: string): Promise<(HostSessionScopeRecord & { displayPath: string; checkoutRemoved?: boolean }) | null>;
  resolveRepositoryWorkspace(directory: string): Promise<Workspace | null>;
  resolveHostRelocationScope(sessionId: string): Promise<(HostSessionScopeRecord & { displayPath: string }) | null>;
}

const failure = (message: string, code = 'SERVICE_UNAVAILABLE', status = 503): HostTaggedError =>
  Object.assign(new Error(message), { code, status });

const readResponse = async <Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.infer<Schema>> => {
  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch {
    throw failure(`The Agent Service answered HTTP ${response.status} with a body that is not JSON`);
  }
  const body = z.json().safeParse(rawBody);
  if (!body.success) {
    throw failure(`The Agent Service answered HTTP ${response.status} with a body that is not JSON`);
  }
  if (!response.ok) {
    const parsed = ProblemDetailsSchema.safeParse(body.data);
    if (parsed.success) throw failure(parsed.data.detail, parsed.data.code, parsed.data.status);
    throw failure(`The Agent Service answered HTTP ${response.status} without a problem document`);
  }
  const result = schema.safeParse(body.data);
  if (!result.success) throw failure(`The Agent Service reply did not match the expected response schema (HTTP ${response.status})`);
  return result.data;
};

interface ScopeComparable {
  projectId: string;
  workspaceId: string;
  agentDirectoryId?: string | undefined;
  cwd: string;
  agentDirectory: string;
}

const sameScope = (left: ScopeComparable, right: ScopeComparable): boolean => left.projectId === right.projectId
  && left.workspaceId === right.workspaceId && left.agentDirectoryId === right.agentDirectoryId
  && left.cwd === right.cwd && left.agentDirectory === right.agentDirectory;

export function createHostAgentRuntime({
  dataDir,
  scopeRuntime,
  validateDirectoryPath,
  getEnvironmentForDirectory,
  invokeHostAction,
  enterprisePolicyOptions = undefined,
  bunPath,
  entrypoint,
  resolveHostTools,
}: HostAgentRuntimeOptions): HostAgentRuntime {
  const bundledRuntime = resolveWebAgentRuntime();
  const detected = detectSystemOmpRuntime({
    bundledRuntime,
    env: process.env,
    candidatePaths: bunPath && entrypoint ? [] : undefined,
  });
  let resolvedBunPath = bunPath
    ?? (detected.source === 'operator' || detected.source === 'system' ? detected.bunPath : null)
    ?? process.env.OHPICHAMBER_BUN
    ?? bundledRuntime?.bunPath;
  let resolvedEntrypoint = entrypoint
    ?? process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT
    ?? bundledRuntime?.entrypoint;
  if (!resolvedBunPath || !resolvedEntrypoint) {
    resolvedBunPath ??= 'bun';
    resolvedEntrypoint ??= fileURLToPath(new URL('../index.js', import.meta.resolve('@openchamber/agent-service/private-protocol')));
  }
  if ('env' in detected && detected.env?.BUN_BE_BUN === '1') {
    process.env.BUN_BE_BUN = '1';
  } else {
    delete process.env.BUN_BE_BUN;
  }
  process.env.OHPICHAMBER_BUN ??= resolvedBunPath;
  process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT ??= resolvedEntrypoint;
  const approvalPolicyStore = openApprovalPolicyStore({ dataDir });
  let closePromise: Promise<void> | undefined;
  const resolvePolicy = async (captured: HostAuthorizationScope): Promise<HostWorkspacePolicy | null> => {
    const authorized = await scopeRuntime.resolveWorkspaceScope(captured.workspaceId);
    if (!authorized || !sameScope(captured, authorized)) return null;
    const native = await readResponse(await service.request(
      `/internal/workspaces/${encodeURIComponent(authorized.workspaceId)}/authorization-policy?${new URLSearchParams({
        agentDirectoryId: authorized.agentDirectoryId,
        rootSessionId: captured.rootSessionId,
      })}`,
    ), HostNativePolicySnapshotSchema);
    if (!sameScope(native, authorized)) return null;
    return HostWorkspacePolicySchema.parse({
      ...native,
      fileTools: ['read', 'write'],
      shellCommands: [],
      providerEntry: !isEnterpriseMode(enterprisePolicyOptions),
    });
  };
  const authorizeWorkerOperation = createWorkerOperationAuthorizer({
    resolvePolicy,
    validateDirectoryPath,
    enterprisePolicyOptions,
    approvalPolicyStore,
  });
  const skillFileOwner = createSkillFileOwner({
    service: {
      request: (endpoint, init) => service.request(endpoint, init),
    },
  });
  const service = createAgentServiceSupervisor({
    bunPath: resolvedBunPath,
    entrypoint: resolvedEntrypoint,
    dataDir,
    approvalPolicyStore,
    authorizeWorkerOperation,
    invokeHostAction,
    handleSkillSource: (operation, capturedScope) => skillFileOwner.handle(operation, capturedScope),
  });
  const admitWorkspace = async <Scope extends {
    projectId: string;
    workspaceId: string;
    cwd: string;
    agentDirectory: string;
    agentDirectoryId: string;
    checkoutRemoved?: boolean;
  }>(scope: Scope): Promise<Scope & { env: Record<string, string> }> => {
    if (scope.checkoutRemoved) return { ...scope, env: {} };
    const env = isEnterpriseMode(enterprisePolicyOptions)
      ? {}
      : await getEnvironmentForDirectory(scope.cwd);
    const hostTools = await resolveHostTools();
    const registration = await readResponse(await service.request(
      `/internal/workspaces/${encodeURIComponent(scope.workspaceId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: scope.projectId,
          cwd: scope.cwd,
          agentDirectory: scope.agentDirectory,
          agentDirectoryId: scope.agentDirectoryId,
          env,
          hostTools,
        }),
      },
    ), HostWorkspaceRegisteredSchema);
    if (registration.workspaceId !== scope.workspaceId || registration.projectId !== scope.projectId
      || registration.agentDirectoryId !== scope.agentDirectoryId) {
      throw failure('The Agent Service registered a different workspace than the one admitted');
    }
    return { ...scope, env };
  };
  const resolveWorkspaceScope = async (workspaceId: string, claimId?: string): Promise<HostAdmittedWorkspaceScope | null> => {
    const scope = await scopeRuntime.resolveWorkspaceScope(workspaceId, claimId);
    return scope === null ? null : admitWorkspace(scope);
  };
  const resolveHostSessionScope = async (sessionId: string) => {
    const known = await scopeRuntime.resolveSessionScope(sessionId);
    if (known !== null || service.getState().phase !== 'ready') return known;
    const response = await service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`);
    if (response.status === 404) return null;
    const native = await readResponse(response, RuntimeSessionSchema);
    if (native.sessionId !== sessionId) throw failure('The Agent Service resolved a different session than the one requested');
    if (native.rootSessionId === sessionId) return null;
    const root = await scopeRuntime.resolveSessionScope(native.rootSessionId);
    if (!root || root.rootSessionId !== root.sessionId || root.projectId !== native.projectId
      || root.workspaceId !== native.workspaceId) return null;
    await scopeRuntime.registerSessionScope(native);
    return scopeRuntime.resolveSessionScope(sessionId);
  };
  const resolveSessionScope = async (sessionId: string): Promise<HostAdmittedSessionScope | null> => {
    const scope = await resolveHostSessionScope(sessionId);
    return scope === null ? null : admitWorkspace(scope);
  };
  const close = (): Promise<void> => {
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
    service,
    skillFileOwner,
    resolveWorkspaceScope,
    resolveWorkspaceDirectory: async (dir: string) => {
      let target = dir;
      if (isString(target)) {
        const trimmed = target.trim();
        if (trimmed === '~') target = os.homedir();
        else if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) target = path.join(os.homedir(), trimmed.slice(2));
      }
      return scopeRuntime.resolveWorkspaceDirectory(target);
    },
    resolveSessionScope,
    resolveHostSessionScope,
    resolveRepositoryWorkspace: scopeRuntime.resolveRepositoryWorkspace,
    resolveHostRelocationScope: scopeRuntime.resolveRelocationSourceScope,
  };
}
