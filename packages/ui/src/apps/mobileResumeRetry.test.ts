import { expect, mock, spyOn, test } from 'bun:test';
import { retryNativeResumeConnection } from './mobileResumeRetry';

test('native resume reports unreachable only after both probes fail', async () => {
  const timers: Array<() => void> = [];
  const schedule = spyOn(globalThis, 'setTimeout').mockImplementation(((run: () => void) => {
    timers.push(run);
  }) as typeof setTimeout);
  const reprobe = mock(async () => 'unreachable' as const);
  const disconnect = mock();
  const refreshInPlace = mock();

  try {
    const result = retryNativeResumeConnection({ reprobe, isCurrent: () => true, refreshInPlace, disconnect });
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 4000);
    expect(disconnect).not.toHaveBeenCalled();
    timers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(reprobe).toHaveBeenCalledTimes(1);
    expect(reprobe).toHaveBeenNthCalledWith(1, { fast: true });
    expect(disconnect).not.toHaveBeenCalled();

    expect(schedule).toHaveBeenNthCalledWith(2, expect.any(Function), 10000);
    timers.shift()?.();
    await result;
    expect(reprobe).toHaveBeenNthCalledWith(2, { fast: false });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledWith('retry-unreachable', 'unreachable');
    expect(refreshInPlace).not.toHaveBeenCalled();
    expect(timers).toHaveLength(0);
  } finally {
    schedule.mockRestore();
  }
});
