import { describe, expect, test } from 'bun:test';
import { scheduleUnansweredRechecks } from './sessionErrorNoticeState';


describe('scheduleUnansweredRechecks', () => {
  const fakeScheduler = () => {
    const timers = new Map<number, { callback: () => void; ms: number }>();
    let next = 1;
    return {
      timers,
      setTimeout: (callback: () => void, ms: number) => {
        const handle = next++;
        timers.set(handle, { callback, ms });
        return handle;
      },
      clearTimeout: (handle: number) => {
        timers.delete(handle);
      },
      fire: () => {
        for (const { callback } of [...timers.values()].sort((a, b) => a.ms - b.ms)) callback();
      },
    };
  };

  test('re-reads the session once per offset so a missed reply replaces the notice', () => {
    const scheduler = fakeScheduler();
    let reads = 0;
    scheduleUnansweredRechecks(async () => { reads += 1; }, scheduler, undefined, [0, 10, 30]);
    expect([...scheduler.timers.values()].map((timer) => timer.ms)).toEqual([0, 10, 30]);
    scheduler.fire();
    expect(reads).toBe(3);
  });

  test('stops reading once the notice is gone', () => {
    const scheduler = fakeScheduler();
    let reads = 0;
    const cancel = scheduleUnansweredRechecks(async () => { reads += 1; }, scheduler, undefined, [0, 10]);
    const pending = [...scheduler.timers.values()];
    cancel();
    expect(scheduler.timers.size).toBe(0);
    for (const { callback } of pending) callback();
    expect(reads).toBe(0);
  });

  test('reports each read as settled, whether it found anything or failed', async () => {
    const scheduler = fakeScheduler();
    let settled = 0;
    let call = 0;
    scheduleUnansweredRechecks(
      () => (call++ === 0 ? Promise.resolve() : Promise.reject(new Error('offline'))),
      scheduler,
      () => { settled += 1; },
      [0, 10],
    );
    expect(settled).toBe(0);
    scheduler.fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(2);
  });

  test('a read that settles after cancellation reports nothing', async () => {
    const scheduler = fakeScheduler();
    let settled = 0;
    let resolveRead: () => void = () => undefined;
    const cancel = scheduleUnansweredRechecks(
      () => new Promise<void>((resolve) => { resolveRead = resolve; }),
      scheduler,
      () => { settled += 1; },
      [0],
    );
    scheduler.fire();
    cancel();
    resolveRead();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(0);
  });
});
