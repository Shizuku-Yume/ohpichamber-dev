import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { buildChildrenIndex, computeSubtreeCost, formatCost } from './subagentCost';

function makeSession(sessionId: string, parentSessionId?: string): Session {
  const session: Session = {
    sessionId,
    projectId: 'project',
    workspaceId: 'workspace',
    displayPath: sessionId,
    rootSessionId: parentSessionId ?? sessionId,
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

describe('buildChildrenIndex', () =>
  test('groups sessions by parentSessionId', () => {
    const root = makeSession('root');
    const childA = makeSession('a', 'root');
    const childB = makeSession('b', 'root');
    const index = buildChildrenIndex([root, childA, childB]);
    expect(index.get('root')).toEqual([childA, childB]);
  }));

describe('formatCost', () =>
  test('prefixes with $ and trims trailing zeros', () => {
    expect(formatCost(1.5)).toBe('$1.5');
    expect(formatCost(0.0001)).toBe('$0.0001');
    expect(formatCost(2)).toBe('$2');
  }));

describe('computeSubtreeCost', () =>
  test('returns null because canonical sessions do not expose spend', () => {
    const root = makeSession('root');
    const sessionsById = new Map([[root.sessionId, root]]);
    const childrenByParent = buildChildrenIndex([root]);
    expect(computeSubtreeCost('root', sessionsById, childrenByParent)).toBeNull();
  }));

describe('computeSubtreeCost unknown session', () =>
  test('returns null for an unknown id', () => {
    const sessionsById = new Map<string, Session>();
    const childrenByParent = new Map<string, Session[]>();
    expect(computeSubtreeCost('missing', sessionsById, childrenByParent)).toBeNull();
  }));



