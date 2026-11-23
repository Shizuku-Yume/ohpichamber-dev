import { describe, expect, test } from 'bun:test';
import type { SessionMetadata } from '@openchamber/agent-contract';
import { withoutSourceOwnedLinks } from './sessionForkInheritance';

describe('withoutSourceOwnedLinks', () => {
  test('preserves project pins while dropping source-bound goal and review ownership', () => {
    const pins = { notes: ['note'], plans: [] };
    expect(withoutSourceOwnedLinks({ openchamber: { goal: { id: 'goal_1' }, reviewSessionID: 'ses_review', kind: 'review', originalSessionID: 'source', project_context_pins: pins } })).toEqual({ openchamber: { project_context_pins: pins } });
  });
  test('removes an empty namespace after its source-owned links are dropped', () => {
    expect(withoutSourceOwnedLinks({ openchamber: { kind: 'review', originalSessionID: 'source' } })).toEqual({});
  });
  test('preserves unrelated metadata and returns the same object when unchanged', () => {
    const metadata: SessionMetadata = { notes: 'keep', openchamber: { project_context_pins: { notes: [], plans: [] } } };
    expect(withoutSourceOwnedLinks(metadata)).toBe(metadata);
  });
});
