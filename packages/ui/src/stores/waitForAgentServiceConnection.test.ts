import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';

let checkReadyImpl: () => Promise<boolean> = async () => true;
const checkReadyCallTimes: number[] = [];

mock.module('@/api/canonicalClient', () => ({
  canonicalClient: {
    checkReady: () => {
      checkReadyCallTimes.push(Date.now());
      return checkReadyImpl();
    },
  },
}));

const { waitForAgentServiceConnection } = await import('./waitForAgentServiceConnection');

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

type Outcome =
  | { status: 'fulfilled' }
  | { status: 'rejected'; error: unknown };

/** Advances the faked clock in steps, flushing the promise chain, until the wait settles. */
const driveToSettlement = async (promise: Promise<void>, stepMs = 100, maxSteps = 400): Promise<Outcome> => {
  let outcome: Outcome | null = null;
  void promise.then(
    () => { outcome = { status: 'fulfilled' }; },
    (error) => { outcome = { status: 'rejected', error }; },
  );
  await flushMicrotasks();
  for (let step = 0; step < maxSteps && outcome === null; step += 1) {
    jest.advanceTimersByTime(stepMs);
    await flushMicrotasks();
  }
  if (outcome === null) {
    throw new Error('waitForAgentServiceConnection did not settle within the drive budget');
  }
  return outcome;
};

const callOffsets = (): number[] => checkReadyCallTimes.map((at) => at - checkReadyCallTimes[0]);

describe('waitForAgentServiceConnection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    checkReadyImpl = async () => true;
    checkReadyCallTimes.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a ready probe ends the wait on the first attempt', async () => {
    await waitForAgentServiceConnection();

    expect(checkReadyCallTimes).toHaveLength(1);
  });

  test('an initial delay is capped at one fast poll interval before the first probe', async () => {
    const promise = waitForAgentServiceConnection(5000);
    await flushMicrotasks();

    expect(checkReadyCallTimes).toHaveLength(0);
    jest.advanceTimersByTime(299);
    await flushMicrotasks();
    expect(checkReadyCallTimes).toHaveLength(0);

    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(checkReadyCallTimes).toHaveLength(1);
    await promise;
  });

  test('unready probes keep polling fast, then back off, until a probe is ready', async () => {
    let calls = 0;
    checkReadyImpl = async () => {
      calls += 1;
      return calls >= 8;
    };

    const outcome = await driveToSettlement(waitForAgentServiceConnection());

    expect(outcome.status).toBe('fulfilled');
    expect(callOffsets()).toEqual([0, 300, 600, 900, 1200, 2200, 3400, 4800]);
  });

  test('an always-unready probe gives up after the bounded maximum', async () => {
    checkReadyImpl = async () => false;

    const outcome = await driveToSettlement(waitForAgentServiceConnection());

    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') throw new Error('expected a rejection');
    if (!(outcome.error instanceof Error)) throw new Error('expected an Error rejection');
    expect(outcome.error.message).toBe('Agent Service readiness probe reported not ready');
    expect(checkReadyCallTimes).toHaveLength(15);
    expect(checkReadyCallTimes[14] - checkReadyCallTimes[0]).toBe(18200);
  });

  test('a probe transport error is retried and rethrown as the last error at timeout', async () => {
    const probeFailure = new Error('readiness transport down');
    checkReadyImpl = async () => {
      throw probeFailure;
    };

    const outcome = await driveToSettlement(waitForAgentServiceConnection());

    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') throw new Error('expected a rejection');
    expect(outcome.error).toBe(probeFailure);
    expect(checkReadyCallTimes).toHaveLength(15);
  });

  test('a non-Error rejection reason is rethrown unchanged', async () => {
    const probeFailure = 'readiness transport down';
    checkReadyImpl = async () => {
      throw probeFailure;
    };

    const outcome = await driveToSettlement(waitForAgentServiceConnection());

    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') throw new Error('expected a rejection');
    expect(outcome.error).toBe(probeFailure);
  });
});
