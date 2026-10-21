import type { GuestShellOutputResult, GuestShellStopResult, HostMessage } from '@openchamber/sdk';
import { HostRequestError } from '@openchamber/sdk';
import { canonicalClient } from '@/api/canonicalClient';
import { useBackgroundShellsStore } from '@/sync/background-shells';
import { readGuestShellOutput } from './shells';

/**
 * The Host answers shell work inside this bound, leaving room below the Guest's
 * own 20 s request timer for the reply to cross the frame.
 */
export const GUEST_SHELL_REQUEST_DEADLINE_MS = 15_000;

type GuestShellRequests = {
  readOutput: (request: { shellId: string; cursor?: number; tailBytes?: number }) => Promise<GuestShellOutputResult>;
  stop: (request: { shellId: string }) => Promise<GuestShellStopResult>;
  abortAll: () => void;
};

/**
 * One pane's outstanding shell work. Every request settles by the deadline or
 * an explicit abort, so a stalled canonical call cannot consume the Guest timer.
 */
export const createGuestShellRequests = ({ deadlineMs = GUEST_SHELL_REQUEST_DEADLINE_MS } = {}): GuestShellRequests => {
  const inFlight = new Set<AbortController>();
  const run = <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    inFlight.add(controller);
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      inFlight.delete(controller);
      outcome();
    };
    const onAbort = () => finish(() => reject(new HostRequestError('HOST_TIMEOUT', 'Host did not answer in time.')));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve().then(() => work(controller.signal)).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(controller.signal.aborted
        ? new HostRequestError('HOST_TIMEOUT', 'Host did not answer in time.')
        : error)),
    );
  });

  return {
    readOutput: (request) => run((signal) => readGuestShellOutput(request.shellId, request.cursor, request.tailBytes, signal)),
    stop: (request) => run(async (signal) => {
      const shell = [...useBackgroundShellsStore.getState().byId.values()].find((entry) => entry.jobId === request.shellId);
      if (!shell) throw new HostRequestError('NOT_FOUND', 'That shell is not running.');
      await canonicalClient.stopShell(shell.sessionId, {
        job: {
          sessionId: shell.sessionId,
          jobId: shell.jobId,
          epoch: shell.epoch,
          workerGeneration: shell.workerGeneration,
        },
      }, signal);
      return { stopped: true as const };
    }),
    abortAll: () => {
      for (const controller of inFlight) controller.abort();
    },
  };
};

type GuestShellReplyTarget = {
  port: Pick<MessagePort, 'postMessage'> | null;
  expectedPort: Pick<MessagePort, 'postMessage'>;
  runtimeKey: string;
  currentRuntimeKey: string;
  disposed: boolean;
};

/**
 * A completed shell reply belongs to the frame that asked, not to the pane's
 * transient visibility: only a replaced port, an endpoint switch or a disposed
 * frame may suppress it.
 */
export const postGuestShellReply = (reply: HostMessage | null, target: GuestShellReplyTarget): boolean => {
  if (!reply || target.disposed || target.currentRuntimeKey !== target.runtimeKey || target.port !== target.expectedPort) return false;
  target.port.postMessage(reply);
  return true;
};
