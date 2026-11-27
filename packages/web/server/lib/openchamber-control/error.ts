import type { JsonObject, JsonValue } from '../shared/json-values.js';

export interface WorktreeArchiveOwnerKey {
  hostProjectId: string;
  archiveId: string;
}

export interface WorktreeArchiveOwner {
  key: WorktreeArchiveOwnerKey;
  claimId: string;
}

export interface ControlErrorStash {
  ref: string;
  hash: string;
  message: string;
}

export interface ControlErrorDetails {
  partial?: unknown;
  partialAction?: JsonValue;
  sessionId?: JsonValue;
  directory?: JsonValue;
  goalConfigured?: unknown;
  code?: unknown;
  task?: unknown;
  busy?: 'queued' | 'running';
  stash?: ControlErrorStash;
  refusalVerified?: boolean;
  retryable?: boolean;
  details?: JsonObject;
  cause?: unknown;
  worktreeArchiveOwner?: WorktreeArchiveOwner;
}

export interface ControlErrorFields extends ControlErrorDetails {
  statusCode?: unknown;
  status?: unknown;
  message?: unknown;
  _tag?: unknown;
}

export const controlErrorFields = (cause: unknown): ControlErrorFields | undefined => cause == null ? undefined : Object(cause);

export class OpenChamberControlError extends Error {
  statusCode: ControlErrorFields['statusCode'];
  declare partial?: unknown;
  declare partialAction?: JsonValue;
  declare sessionId?: JsonValue;
  declare directory?: JsonValue;
  declare goalConfigured?: unknown;
  declare code?: unknown;
  declare task?: unknown;
  declare busy?: 'queued' | 'running';
  declare stash?: ControlErrorStash;
  declare refusalVerified?: boolean;
  declare retryable?: boolean;
  declare details?: JsonObject;
  declare worktreeArchiveOwner?: WorktreeArchiveOwner;

  constructor(message: string, statusCode: ControlErrorFields['statusCode'] = 500, details: ControlErrorDetails = {}) {
    super(message);
    this.name = 'OpenChamberControlError';
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

export const asControlError = (cause: unknown, fallbackMessage: string, fallbackStatus = 500) => {
  if (cause instanceof OpenChamberControlError) return cause;
  const message = cause instanceof Error ? cause.message : fallbackMessage;
  const fields = controlErrorFields(cause);
  const status = Number(fields?.statusCode) || Number(fields?.status) || fallbackStatus;
  const details: ControlErrorDetails = {};
  if (fields?.goalConfigured === true) details.goalConfigured = true;
  return new OpenChamberControlError(message || fallbackMessage, status, details);
};
