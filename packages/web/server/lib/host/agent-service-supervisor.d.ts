import type { ChildProcess, SpawnOptions } from 'node:child_process';
import type { reapOrphanedProcesses, registerManagedProcess, unregisterManagedProcess } from './managed-process-registry.js';
import type { HostAuthorizationScope, WorkerPolicyRequest, WorkerPolicyResult, NativeOperationDescriptor, HostActionRequest, HostActionResult, HostSkillSourceOperation, HostSkillSourceResult } from '@openchamber/agent-service/private-protocol';

export interface AgentServiceSupervisorState {
  phase: 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed';
  pid: number | null;
  port: number | null;
}
export interface AgentServiceRegistry {
  registerManagedProcess: typeof registerManagedProcess;
  unregisterManagedProcess: typeof unregisterManagedProcess;
  reapOrphanedProcesses: typeof reapOrphanedProcesses;
  terminateManagedProcess: (pid: number, signal?: 'SIGTERM' | 'SIGKILL') => Promise<boolean>;
}
export interface AgentServiceSupervisorOptions {
  bunPath?: string;
  entrypoint: string;
  dataDir?: string;
  env?: Record<string, string>;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  spawn?: (file: string, args?: readonly string[], options?: SpawnOptions) => ChildProcess;
  fetchImpl?: typeof fetch;
  registry?: AgentServiceRegistry;
  randomBytes?: (size: number) => Uint8Array;
  authorizeWorkerOperation?: (scope: HostAuthorizationScope, request: WorkerPolicyRequest, descriptor?: NativeOperationDescriptor) => Promise<WorkerPolicyResult>;
  invokeHostAction: (scope: HostAuthorizationScope, request: HostActionRequest, signal: AbortSignal) => Promise<HostActionResult>;
  handleSkillSource?: (operation: HostSkillSourceOperation, scope: Readonly<{
    projectId: string; workspaceId: string; agentDirectoryId: string; cwd: string; agentDirectory: string;
  }>) => Promise<HostSkillSourceResult>;
}
export interface AgentServiceSupervisor {
  start(): Promise<AgentServiceSupervisorState>;
  stop(): Promise<void>;
  restart(): Promise<AgentServiceSupervisorState>;
  request(path: string, init?: RequestInit): Promise<Response>;
  getState(): AgentServiceSupervisorState;
}
export function createAgentServiceSupervisor(options: AgentServiceSupervisorOptions): AgentServiceSupervisor;
