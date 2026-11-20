import { describe, expect, test } from 'bun:test';
import type { SessionMetadata } from '@openchamber/agent-contract';
import { withoutSourceOwnedLinks } from './sessionForkInheritance';

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
