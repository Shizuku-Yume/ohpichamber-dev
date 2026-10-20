/**
 * Waits for the Agent Service to answer its readiness probe after a config-driven restart.
 *
 * Configuration refreshes can run while the Host is still settling. This polls
 * the canonical readiness route and gives up after a bounded maximum so a
 * refresh cannot hang forever.
 */

import { canonicalClient } from "@/api/canonicalClient";

const MAX_HEALTH_WAIT_MS = 20000;
const FAST_HEALTH_POLL_INTERVAL_MS = 300;
const FAST_HEALTH_POLL_ATTEMPTS = 4;
const FAST_HEALTH_POLL_WINDOW_MS = 1200;
const SLOW_HEALTH_POLL_BASE_MS = 800;
const SLOW_HEALTH_POLL_INCREMENT_MS = 200;
const SLOW_HEALTH_POLL_MAX_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForAgentServiceConnection(delayMs?: number): Promise<void> {
  const initialPause = delayMs !== undefined && delayMs > 0
    ? Math.min(delayMs, FAST_HEALTH_POLL_INTERVAL_MS)
    : 0;

  if (initialPause > 0) {
    await sleep(initialPause);
  }

  const start = Date.now();
  let attempt = 0;
  let lastError: Error | string | null = null;

  while (Date.now() - start < MAX_HEALTH_WAIT_MS) {
    attempt += 1;

    try {
      if (await canonicalClient.checkReady()) return;
      lastError = new Error("Agent Service readiness probe reported not ready");
    } catch (error) {
      lastError = error instanceof Error ? error : String(error);
    }

    const elapsed = Date.now() - start;
    const waitMs = attempt <= FAST_HEALTH_POLL_ATTEMPTS && elapsed < FAST_HEALTH_POLL_WINDOW_MS
      ? FAST_HEALTH_POLL_INTERVAL_MS
      : Math.min(
          SLOW_HEALTH_POLL_BASE_MS + Math.max(0, attempt - FAST_HEALTH_POLL_ATTEMPTS) * SLOW_HEALTH_POLL_INCREMENT_MS,
          SLOW_HEALTH_POLL_MAX_MS,
        );

    await sleep(waitMs);
  }

  throw lastError || new Error("Agent Service did not become ready in time");
}

