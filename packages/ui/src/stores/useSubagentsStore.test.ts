import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Subagent } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { useSubagentsStore } from './useSubagentsStore';

const makeSubagent = (overrides: Partial<Subagent> = {}): Subagent => ({
  subagentId: 'sub-1',
  parentSessionId: 'parent-1',
  childSessionId: 'child-1',
  toolCallId: 'call-1',
  name: 'ScoutAuth',
  role: 'scout',
  status: 'completed',
  ...overrides,
});

describe('useSubagentsStore.hydrateParent', () => {
  afterEach(() => {
    useSubagentsStore.getState().resetForRuntimeSwitch();
  });

  test('chains a forced refresh after an in-flight non-forced hydration settles', async () => {
    const initialFetch = Promise.withResolvers<Subagent[]>();
    const settledFetch = Promise.withResolvers<Subagent[]>();
    let calls = 0;
    const spy = spyOn(canonicalClient, 'listSubagents').mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? initialFetch.promise : settledFetch.promise;
    });

    try {
      const store = useSubagentsStore.getState();
      const first = store.hydrateParent('parent-1', false);
      const forced = store.hydrateParent('parent-1', true);
      const duplicateForced = store.hydrateParent('parent-1', true);

      expect(calls).toBe(1);

      initialFetch.resolve([]);
      await first;
      // The forced fetch runs right after the early empty non-forced fetch completes.
      expect(calls).toBe(2);

      const settledChild = makeSubagent();
      settledFetch.resolve([settledChild]);
      await Promise.all([forced, duplicateForced]);

      expect(calls).toBe(2);
      expect(useSubagentsStore.getState().byParent['parent-1']).toEqual([settledChild]);
      expect(useSubagentsStore.getState().hydratedByParent['parent-1']).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  test('records failedByParent on error without erasing prior subagents and clears on recovery', async () => {
    let calls = 0;
    const known = makeSubagent();
    const spy = spyOn(canonicalClient, 'listSubagents').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return [known];
      if (calls === 2) throw new Error('Service unavailable');
      return [known];
    });

    try {
      const store = useSubagentsStore.getState();
      await store.hydrateParent('parent-1', false);
      expect(useSubagentsStore.getState().byParent['parent-1']).toEqual([known]);
      expect(useSubagentsStore.getState().failedByParent['parent-1']).toBeUndefined();

      await store.hydrateParent('parent-1', true);
      expect(useSubagentsStore.getState().byParent['parent-1']).toEqual([known]);
      expect(useSubagentsStore.getState().hydratedByParent['parent-1']).toBeUndefined();
      expect(useSubagentsStore.getState().failedByParent['parent-1']).toBeDefined();

      // Because failure cleared hydratedByParent, a subsequent non-forced hydration retries.
      await store.hydrateParent('parent-1', false);
      expect(calls).toBe(3);
      expect(useSubagentsStore.getState().failedByParent['parent-1']).toBeUndefined();
      expect(useSubagentsStore.getState().hydratedByParent['parent-1']).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });
});
