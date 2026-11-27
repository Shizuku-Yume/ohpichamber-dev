import path from 'node:path';

export interface PwaWorkspaceScope {
  workspaceId: string;
  cwd: string;
}

export interface PwaSessionsPage<SessionItem> {
  items: SessionItem[];
  errors: Record<string, string>;
}

export interface ListPwaSessionsOptions<SessionItem> {
  directory: string | null | undefined;
  listWorkspaces: () => Promise<{ items: PwaWorkspaceScope[]; errors: Record<string, string> }>;
  listSessions: (workspaceId?: string) => Promise<PwaSessionsPage<SessionItem>>;
}

const isWithin = (parent: string, candidate: string): boolean => {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

export const listPwaSessions = async <SessionItem>({
  directory,
  listWorkspaces,
  listSessions,
}: ListPwaSessionsOptions<SessionItem>): Promise<PwaSessionsPage<SessionItem>> => {
  if (!directory) return listSessions();
  const scopes = await listWorkspaces();
  const workspaceIds = scopes.items
    .filter((scope) => isWithin(directory, scope.cwd))
    .map((scope) => scope.workspaceId);
  if (workspaceIds.length === 0) return { items: [], errors: scopes.errors };
  const pages = await Promise.all(workspaceIds.map(async (workspaceId) => {
    try {
      return await listSessions(workspaceId);
    } catch {
      return { items: [], errors: { [workspaceId]: 'SERVICE_UNAVAILABLE' } };
    }
  }));
  return {
    items: pages.flatMap((page) => page.items),
    errors: Object.assign({}, scopes.errors, ...pages.map((page) => page.errors)),
  };
};
