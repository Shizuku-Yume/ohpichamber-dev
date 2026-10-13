import type { ChildProcess, SpawnOptions } from 'node:child_process';
import type { registerManagedProcess, unregisterManagedProcess } from './managed-process-registry.js';
import type { HostAuthorizationScope, WorkerPolicyRequest, WorkerPolicyResult } from '@openchamber/agent-service/private-protocol';

export interface AgentServiceSupervisorState {
  phase: 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed';
  pid: number | null;
  port: number | null;
}
export interface AgentServiceRegistry {
  registerManagedProcess: typeof registerManagedProcess;
  unregisterManagedProcess: typeof unregisterManagedProcess;
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
  authorizeWorkerOperation?: (scope: HostAuthorizationScope, request: WorkerPolicyRequest) => Promise<WorkerPolicyResult>;
}
export interface AgentServiceSupervisor {
  start(): Promise<AgentServiceSupervisorState>;
  stop(): Promise<void>;
  restart(): Promise<AgentServiceSupervisorState>;
  request(path: string, init?: RequestInit): Promise<Response>;
  getState(): AgentServiceSupervisorState;
}
export function createAgentServiceSupervisor(options: AgentServiceSupervisorOptions): AgentServiceSupervisor;
