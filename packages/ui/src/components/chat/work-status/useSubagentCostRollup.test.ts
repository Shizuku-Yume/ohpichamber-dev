import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { computeRollup } from './useSubagentCostRollup';

function makeSession(sessionId: string, parentSessionId?: string): Session {
  const session: Session = {
    sessionId,
    projectId: 'project',
    workspaceId: 'workspace',
    displayPath: sessionId,
    rootSessionId: parentSessionId ? 'root' : sessionId,
    createdAt: 0,
    updatedAt: 0,
    epoch: '0',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    archivedAt: undefined,
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
  };
  if (parentSessionId) session.parentSessionId = parentSessionId;
  return session;
}

const sessions: Session[] = [
  makeSession('root'),
  makeSession('a', 'root'),
  makeSession('b', 'root'),
  makeSession('a1', 'a'),
];

describe('computeRollup', () => {
  test('preserves descendant count while cost is unavailable', () => {
    const result = computeRollup(sessions, 'root');
    expect(result.totalCost).toBeNull();
    expect(result.subagentCount).toBe(3);
    expect(result.ownCost).toBe(0);
    expect(result.subagentCost).toBe(0);
    expect(result.perChildCost.size).toBe(0);
  });

  test('returns no descendants or cost for a session with no children', () => {
    const result = computeRollup(sessions, 'a1');
    expect(result.totalCost).toBeNull();
    expect(result.subagentCount).toBe(0);
  });

  test('returns null total for a null sessionId', () => {
    const result = computeRollup(sessions, null);
    expect(result.totalCost).toBeNull();
    expect(result.subagentCount).toBe(0);
  });

  test('returns null total for an unknown sessionId', () => {
    const result = computeRollup(sessions, 'missing');
    expect(result.totalCost).toBeNull();
    expect(result.subagentCount).toBe(0);
  });
});
