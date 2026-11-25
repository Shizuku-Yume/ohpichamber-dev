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

  test('shares one in-flight read between forced and non-forced hydration of the same parent', async () => {
    const initialFetch = Promise.withResolvers<Subagent[]>();
    let calls = 0;
    const spy = spyOn(canonicalClient, 'listSubagents').mockImplementation(async () => {
      calls += 1;
      return initialFetch.promise;
    });

    try {
      const store = useSubagentsStore.getState();
      const first = store.hydrateParent('parent-1', false);
      const forced = store.hydrateParent('parent-1', true);
      const duplicateForced = store.hydrateParent('parent-1', true);
      const duplicatePlain = store.hydrateParent('parent-1', false);

      expect(calls).toBe(1);

      const child = makeSubagent();
      initialFetch.resolve([child]);
      await Promise.all([first, forced, duplicateForced, duplicatePlain]);

      expect(calls).toBe(1);
      expect(useSubagentsStore.getState().byParent['parent-1']).toEqual([child]);
      expect(useSubagentsStore.getState().hydratedByParent['parent-1']).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  test('a shared forced hydration failure is not empty and stays retriable', async () => {
    const inFlight = Promise.withResolvers<Subagent[]>();
    let calls = 0;
    const known = makeSubagent();
    const spy = spyOn(canonicalClient, 'listSubagents').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return [known];
      if (calls === 2) return inFlight.promise;
      return [known];
    });

    try {
      const store = useSubagentsStore.getState();
      await store.hydrateParent('parent-1', false);
      expect(useSubagentsStore.getState().byParent['parent-1']).toEqual([known]);

      const plain = store.hydrateParent('parent-1', true);
      const forced = store.hydrateParent('parent-1', true);
      expect(calls).toBe(2);
      inFlight.reject(new Error('Service unavailable'));
      await Promise.all([plain, forced]);

      // Failure is not empty: prior rows survive, the parent is unhydrated and
      // marked failed, so the next non-forced hydration retries.
      expect(useSubagentsStore.getState().byParent['parent-1']).toEqual([known]);
      expect(useSubagentsStore.getState().hydratedByParent['parent-1']).toBeUndefined();
      expect(useSubagentsStore.getState().failedByParent['parent-1']).toBeDefined();

      await store.hydrateParent('parent-1', false);
      expect(calls).toBe(3);
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
