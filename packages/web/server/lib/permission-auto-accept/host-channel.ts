import type { PermissionMode } from './modes.js';
import type { PermissionApprovalInput, PermissionEvaluationResult } from './contracts.js';

export interface HostPermissionApproval extends PermissionApprovalInput {
  sessionId?: string | undefined;
}

export interface HostPermissionEvaluationResult extends PermissionEvaluationResult {
  unavailable?: boolean;
}

export interface HostPermissionRuntime {
  resolveSessionMode: (sessionId: string) => Promise<PermissionMode>;
  evaluateSessionPermission: (
    sessionId: string,
    approval: HostPermissionApproval | null | undefined,
  ) => Promise<HostPermissionEvaluationResult>;
}

let permissionRuntime: HostPermissionRuntime | null = null;

export function registerHostPermissionRuntime(runtime: HostPermissionRuntime | null | undefined): void {
  permissionRuntime = runtime ?? null;
}

export const resolveHostPermissionMode = async (sessionId: string): Promise<PermissionMode> => {
  try {
    return (await permissionRuntime?.resolveSessionMode(sessionId)) ?? 'ask';
  } catch {
    return 'ask';
  }
};

export const evaluateHostPermission = async (
  approval: HostPermissionApproval | null | undefined,
): Promise<HostPermissionEvaluationResult | null> => {
  if (!permissionRuntime || !approval?.sessionId) return null;
  try {
    return await permissionRuntime.evaluateSessionPermission(approval.sessionId, approval);
  } catch {
    return null;
  }
};
