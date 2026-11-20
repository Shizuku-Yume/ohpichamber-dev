import { beforeEach, describe, expect, test } from 'bun:test';
import { beginAgentStartupWait, useAgentStartupStore } from './agent-startup-wait';

describe('native prompt startup waits', () => {
  beforeEach(() => useAgentStartupStore.setState({ pending: new Map() }));

  test('starts with no pending prompt', () => {
    expect(useAgentStartupStore.getState().pending.size).toBe(0);
  });

  test('each completing prompt removes only its own wait', () => {
    const first = beginAgentStartupWait(1);
    const second = beginAgentStartupWait(1);
    first();
    expect([...useAgentStartupStore.getState().pending.values()]).toEqual([1]);
    second();
    expect(useAgentStartupStore.getState().pending.size).toBe(0);
  });

  test('a runtime change keeps the earlier completion from clearing a newer wait', () => {
    const first = beginAgentStartupWait(1);
    const second = beginAgentStartupWait(2);
    first();
    expect([...useAgentStartupStore.getState().pending.values()]).toEqual([2]);
    second();
  });
});
