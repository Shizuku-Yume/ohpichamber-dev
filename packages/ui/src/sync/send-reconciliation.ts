import type { AcceptedPromptReceipt, PromptReceiptResult, RejectedPromptReceipt } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, getRuntimeSwitchRevision } from '@/lib/runtime-switch';
import { delay } from '@/lib/timing/delay';

const SEND_RECONCILIATION_WINDOW_MS = 10 * 60 * 1000;

const SETTLED_RETENTION_MS = 60 * 1000;

const POLL_DELAYS_MS = [1000, 2000, 4000];
const POLL_STEADY_MS = 5000;

export type SendReconciliationClock = {
  pollDelays?: readonly number[];
  steadyDelay?: number;
  windowMs?: number;
  retentionMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type SendReconciliationResolution = {
  sessionId: string;
  correlationId: string;
  outcome: 'accepted' | 'rejected' | 'expired' | 'orphaned';
  receipt?: AcceptedPromptReceipt | RejectedPromptReceipt;
};

export type ReconcileInterruptedSendInput = {
  runtimeKey: string;
  runtimeRevision: number;
  sessionId: string;
  directory?: string | null;
  correlationId: string;
  content: string;
  removePendingEcho: (() => void) | null;
  reconcileAccepted: ((runId: string | null) => void) | null;
  restoreDraft: (receipt: RejectedPromptReceipt) => void;
  notifyResolved: (resolution: SendReconciliationResolution) => void;
  queryReceipt?: (sessionId: string, correlationId: string) => Promise<PromptReceiptResult>;
};

const inFlight = new Map<string, Promise<SendReconciliationResolution>>();

let generation = 0;

const keyFor = (sessionId: string, correlationId: string): string => `${sessionId}:${correlationId}`;

const runtimeIsCurrent = (runtimeKey: string, runtimeRevision: number): boolean =>
  getRuntimeKey() === runtimeKey && getRuntimeSwitchRevision() === runtimeRevision;

export function reconcileInterruptedSend(input: ReconcileInterruptedSendInput, clock?: SendReconciliationClock): Promise<SendReconciliationResolution> {
  const effectiveClock = clock ?? testClock ?? {};
  const key = keyFor(input.sessionId, input.correlationId);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = runReconciliation(input, effectiveClock);
  inFlight.set(key, promise);
  void promise.finally(() => {
    const retention = effectiveClock.retentionMs ?? SETTLED_RETENTION_MS;
    if (retention <= 0) {
      if (inFlight.get(key) === promise) inFlight.delete(key);
      return;
    }
    const settledGeneration = generation;
    void delay(retention).then(() => {
      if (generation !== settledGeneration) return;
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  });
  return promise;
}

export function sendReconciliationOutcome(sessionId: string, correlationId: string): Promise<SendReconciliationResolution> | null {
  return inFlight.get(keyFor(sessionId, correlationId)) ?? null;
}

async function runReconciliation(input: ReconcileInterruptedSendInput, clock: SendReconciliationClock): Promise<SendReconciliationResolution> {
  const queryReceipt = input.queryReceipt ?? ((sessionId: string, correlationId: string) => canonicalClient.getPromptReceipt(sessionId, correlationId));
  const sleep = clock.sleep ?? delay;
  const now = clock.now ?? (() => Date.now());
  const windowMs = clock.windowMs ?? SEND_RECONCILIATION_WINDOW_MS;
  const pollDelays = clock.pollDelays ?? POLL_DELAYS_MS;
  const steadyDelay = clock.steadyDelay ?? POLL_STEADY_MS;

  const finish = (outcome: SendReconciliationResolution['outcome'], receipt?: AcceptedPromptReceipt | RejectedPromptReceipt): SendReconciliationResolution => {
    const resolution: SendReconciliationResolution = { sessionId: input.sessionId, correlationId: input.correlationId, outcome, receipt };
    input.notifyResolved(resolution);
    return resolution;
  };

  const deadline = now() + windowMs;
  let polls = 0;
  const loopGeneration = generation;

  while (generation === loopGeneration && runtimeIsCurrent(input.runtimeKey, input.runtimeRevision)) {
    if (now() >= deadline) {
      return finish('expired');
    }
    let result;
    try {
      result = await queryReceipt(input.sessionId, input.correlationId);
    } catch {
      result = null;
    }
    if (generation !== loopGeneration || !runtimeIsCurrent(input.runtimeKey, input.runtimeRevision)) return finish('orphaned');
    if (result?.status === 'accepted') {
      input.reconcileAccepted?.(result.receipt.runId);
      return finish('accepted', result.receipt);
    }
    if (result?.status === 'rejected') {
      input.removePendingEcho?.();
      input.restoreDraft(result.receipt);
      return finish('rejected', result.receipt);
    }
    polls += 1;
    const pollDelay = polls <= pollDelays.length ? pollDelays[polls - 1]! : steadyDelay;
    await sleep(pollDelay);
  }
  return finish('orphaned');
}

let testClock: SendReconciliationClock | null = null;

export function setSendReconciliationTestClock(clock: SendReconciliationClock | null): void {
  testClock = clock;
}

export function resetSendReconciliationForTests(): void {
  generation += 1;
  inFlight.clear();
  testClock = null;
}
