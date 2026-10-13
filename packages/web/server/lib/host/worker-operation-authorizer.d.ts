import type { HostAuthorizationScope, HostWorkspacePolicy, WorkerPolicyRequest, WorkerPolicyResult, NativeOperationDescriptor } from '@openchamber/agent-service/private-protocol';

export interface HostDirectoryValidation {
  ok: boolean;
  directory?: string;
  requestedDirectory?: string;
  error?: string;
}
export interface HostApprovalPolicy {
  scope: 'session' | 'workspace';
  decision: 'allow' | 'deny';
  target: { toolName: string; pattern: string };
}
export interface WorkerOperationAuthorizerOptions {
  resolvePolicy(scope: HostAuthorizationScope): HostWorkspacePolicy | null | Promise<HostWorkspacePolicy | null>;
  validateDirectoryPath(candidate: string): Promise<HostDirectoryValidation>;
  enterprisePolicyOptions?: object;
  approvalPolicyStore?: { list(scope: { sessionId: string; projectId: string; workspaceId: string }): HostApprovalPolicy[] };
}
export function createWorkerOperationAuthorizer(options: WorkerOperationAuthorizerOptions): (scope: HostAuthorizationScope, request: WorkerPolicyRequest, descriptor?: NativeOperationDescriptor) => Promise<WorkerPolicyResult>;
