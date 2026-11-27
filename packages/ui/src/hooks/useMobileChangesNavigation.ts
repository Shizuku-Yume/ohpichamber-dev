export type MobileChangesInitialDiff = {
  path: string;
  staged: boolean;
  scope?: 'turn';
  turnId?: string;
  sessionId?: string | null;
  directory?: string | null;
};

export const LIST_ROUTE = { type: 'list' } as const;
