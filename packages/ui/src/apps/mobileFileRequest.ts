import type { Session } from '@openchamber/agent-contract';

export type SessionNode = Pick<Session, 'sessionId' | 'parentSessionId'>;

/**
 * A session and the ones above it: walks from a subagent up to its root session
 * using the canonical `parentSessionId`. Stops when a parent cannot be read or
 * when a cycle is detected.
 */
export const sessionLineage = async <T extends SessionNode>(
 sessionId: string,
 readSession: (sessionId: string) => Promise<T | null | undefined>,
): Promise<T[]> => {
 const lineage: T[] = [];
 const visited = new Set<string>();
 let current: string | undefined = sessionId;
 while (current && !visited.has(current)) {
  visited.add(current);
  const session = await readSession(current);
  if (!session) break;
  lineage.push(session);
  current = session.parentSessionId;
 }
 return lineage;
};

export const fileNameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
