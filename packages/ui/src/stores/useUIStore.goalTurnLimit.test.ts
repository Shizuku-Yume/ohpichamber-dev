import { afterEach, expect, test } from 'bun:test';

import { useUIStore } from './useUIStore';

const originalLimit = useUIStore.getState().sessionGoalMaxAutoTurns;
afterEach(() => useUIStore.setState({ sessionGoalMaxAutoTurns: originalLimit }));

test('goal turn limits round and clamp finite values without storing non-finite input', () => {
  const { setSessionGoalMaxAutoTurns } = useUIStore.getState();
  for (const [input, expected] of [[4.9, 4], [0, 1], [1000, 200]]) {
    setSessionGoalMaxAutoTurns(input);
    expect(useUIStore.getState().sessionGoalMaxAutoTurns).toBe(expected);
  }
  for (const input of [NaN, Infinity, -Infinity]) {
    setSessionGoalMaxAutoTurns(input);
    expect(useUIStore.getState().sessionGoalMaxAutoTurns).toBe(200);
  }
});
