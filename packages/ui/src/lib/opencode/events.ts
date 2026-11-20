




type PermissionAutoAcceptSyncEvent = {
  type: 'openchamber.permission-auto-accept';
  properties: {
    modes?: Record<string, 'ask' | 'safety' | 'auto'>;
    revision?: number;
    spaceId?: string;
    sessions?: Record<string, boolean>;
  };
};

type PermissionLeftForUserSyncEvent = {
  type: 'openchamber.permission-left-for-user';
  properties: {
    permissionId: string;
    sessionId: string;
    directory: string | null;
    spaceId?: string;
  };
};

export type SyncEvent =
  | PermissionAutoAcceptSyncEvent
  | PermissionLeftForUserSyncEvent
  | { type: string; properties?: unknown };
