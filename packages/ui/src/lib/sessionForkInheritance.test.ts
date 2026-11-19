import { describe, expect, test } from 'bun:test';
<<<<<<< HEAD
import type { SessionMetadata } from '@openchamber/agent-contract';
import { withoutSourceOwnedLinks } from './sessionForkInheritance';
||||||| bc50ba56aa
import type { Metadata, Session } from '@/lib/opencode/model';
import { applyForkInheritance, withoutSourceOwnedLinks, type ForkInheritanceDeps } from './sessionForkInheritance';

const goal = (objectiveFile: boolean) => ({
  id: 'goal_1',
  objective: objectiveFile ? '' : 'Ship it',
  objectiveFile,
  status: 'paused',
  tokensUsed: 10,
  turnsUsed: 2,
});

const forkWith = (metadata: Metadata): Session => ({
  id: 'ses_fork',
  projectID: 'proj_1',
  directory: '/repo',
  title: 'Forked',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
  metadata,
});

const harness = (fork: Session, overrides: Partial<ForkInheritanceDeps> = {}) => {
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  const patches: Metadata[] = [];
  const deps: ForkInheritanceDeps = {
    readGoalId: async () => 'goal_1',
    readObjective: async (sessionId) => {
      reads.push(sessionId);
      return 'Objective from file';
    },
    writeObjective: async (sessionId, content) => {
      writes.push([sessionId, content]);
      return true;
    },
    patchMetadata: async (_sessionId, updater) => {
      patches.push(updater(fork.metadata ?? {}));
    },
    ...overrides,
  };
  return { deps, reads, writes, patches };
};
=======
import type { Metadata, Session } from '@/lib/opencode/model';
import { applyForkInheritance, withoutSourceOwnedLinks, type ForkInheritanceDeps } from './sessionForkInheritance';

const goal = (objectiveFile: boolean) => ({
  id: 'goal_1',
  objective: objectiveFile ? '' : 'Ship it',
  objectiveFile,
  status: 'paused',
  tokensUsed: 10,
  turnsUsed: 2,
});

const forkWith = (metadata: Metadata): Session => ({
  id: 'ses_fork',
  projectID: 'proj_1',
  directory: '/repo',
  title: 'Forked',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
  metadata,
});

const harness = (fork: Session, overrides: Partial<ForkInheritanceDeps> = {}) => {
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  const patches: Metadata[] = [];
  const permissions: Array<[string, Session['permissions']]> = [];
  const deps: ForkInheritanceDeps = {
    readGoalId: async () => 'goal_1',
    readObjective: async (sessionId) => {
      reads.push(sessionId);
      return 'Objective from file';
    },
    writeObjective: async (sessionId, content) => {
      writes.push([sessionId, content]);
      return true;
    },
    patchMetadata: async (_sessionId, updater) => {
      patches.push(updater(fork.metadata ?? {}));
    },
    setPermissions: async (sessionId, rules) => {
      permissions.push([sessionId, rules]);
    },
    ...overrides,
  };
  return { deps, reads, writes, patches, permissions };
};
>>>>>>> upstream/main

describe('a fork of an agent\'s worker session', () => {
  test('is the user\'s own session: no link to the agent and the question tool back', async () => {
    const fork = { ...forkWith({ openchamber: { kind: 'operator-child', parentID: 'ses_operator' } }), permissions: [{ action: 'question', resource: '*', effect: 'deny' as const }] };
    const { deps, patches, permissions } = harness(fork);
    await applyForkInheritance('ses_worker', fork, deps);
    expect(permissions).toEqual([['ses_fork', []]]);
    expect(patches).toEqual([{}]);
  });
});

describe('withoutSourceOwnedLinks', () => {
  test('drops retired goal state and source review links from fork metadata', () => {
    const metadata: SessionMetadata = { openchamber: { goal: { id: 'goal_1' }, reviewSessionID: 'ses_review', kind: 'review' } };
    expect(withoutSourceOwnedLinks(metadata)).toEqual({ openchamber: { kind: 'review' } });
  });


  test('drops the scheduled-run marker, so the fork can go into In work', () => {
    expect(withoutSourceOwnedLinks({ other: 1, openchamber: { kind: 'scheduled' } as unknown as SessionMetadata['openchamber'] } as unknown as SessionMetadata)).toEqual({ other: 1 });
  });

  test('preserves unrelated metadata and returns the same object when unchanged', () => {
    const metadata: SessionMetadata = { notes: 'keep', openchamber: { kind: 'review' } };
    expect(withoutSourceOwnedLinks(metadata)).toBe(metadata);
  });
});
