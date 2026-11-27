import type { JsonValue } from '../shared/json-values.js';
import type { RoutingPermission } from '../routing/jev.js';
import type { PermissionMode } from './modes.js';

export interface PermissionPolicy {
  sessions: Partial<Record<string, PermissionMode>>;
  revision: number;
}

export interface PermissionPolicySnapshot {
  sessions: Record<string, boolean>;
  modes: PermissionPolicy['sessions'];
  revision: number;
}

export interface PermissionSettings {
  permissionAutoAccept?: JsonValue;
  permissionDefaultMode?: JsonValue;
}

export type PermissionDirectory = JsonValue | undefined;
export type PermissionOutcome = 'ignored' | 'held' | 'replied' | 'failed';

export type PermissionUiEvent =
  | { type: 'openchamber:permission-auto-accept.updated'; properties: PermissionPolicySnapshot }
  | {
    type: 'openchamber:permission-auto-accept.left-for-user';
    properties: { permissionId: JsonValue; sessionId: JsonValue | undefined; directory: JsonValue };
  };

export interface PermissionAutoAcceptOptions {
  readSettingsFromDiskMigrated: () => Promise<PermissionSettings | null | undefined>;
  persistSettings: (changes: { permissionAutoAccept: PermissionPolicy }) => Promise<PermissionSettings | void>;
  broadcastGlobalUiEvent?: ((event: PermissionUiEvent) => void) | undefined;
  evaluatePermission?: ((permission: RoutingPermission, directory: PermissionDirectory) => Promise<{ action: string } | null | undefined>) | null | undefined;
  onSessionPolicyChanged?: ((sessionId: string, mode: PermissionMode, directory: PermissionDirectory) => Promise<void> | void) | null | undefined;
  resolveSessionParent?: ((sessionId: string, directory?: PermissionDirectory) => Promise<string | null | undefined> | string | null | undefined) | undefined;
  resolveLegacyEnabledMode?: (() => Promise<PermissionMode>) | undefined;
}

export interface PermissionApprovalInput extends RoutingPermission {
  approvalId?: string;
}

export interface PermissionEvaluationResult {
  mode: PermissionMode;
  action: 'accept' | 'hold';
}
