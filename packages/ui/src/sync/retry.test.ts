import { describe, expect, test } from 'bun:test';

import { retry, isRetryableBootstrapError, BootstrapFailureError } from './retry';
import { CanonicalApiError } from '@/api/canonicalClient';

describe('bootstrap retryability policy', () => {
  test('permanent canonical 4xx failures are not requeued', () => {
    const denied = new CanonicalApiError({ type: 'urn:test:denied', title: 'Denied', status: 403, detail: 'Forbidden', code: 'UNAUTHORIZED', retryable: false });
    expect(isRetryableBootstrapError(denied)).toBe(false);
    expect(isRetryableBootstrapError({ status: 404 })).toBe(false);
  });

  test('canonical 5xx and rate-limit statuses are requeued', () => {
    const warmup = new CanonicalApiError({ type: 'urn:test:warmup', title: 'Warmup', status: 503, detail: 'Starting', code: 'SERVICE_UNAVAILABLE', retryable: true });
    expect(isRetryableBootstrapError(warmup)).toBe(true);
    expect(isRetryableBootstrapError({ status: 500 })).toBe(true);
    expect(isRetryableBootstrapError({ status: 429 })).toBe(true);
    expect(isRetryableBootstrapError({ status: 408 })).toBe(true);
  });

  test('network and unclassified failures get one recovery attempt', () => {
    expect(isRetryableBootstrapError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableBootstrapError(new Error('environment unavailable'))).toBe(true);
  });

  test('environment-phase failures carry their own classification', () => {
    expect(isRetryableBootstrapError(new BootstrapFailureError('environment failed', false))).toBe(false);
    expect(isRetryableBootstrapError(new BootstrapFailureError('environment failed', true))).toBe(true);
  });
});

describe('retry transient classification (#2470)', () => {
  test("'terminated' (undici half-open socket teardown) is retried", async () => {
    let attempts = 0;
    await expect(
      retry(async () => {
        attempts += 1;
        throw new TypeError('terminated');
      }),
    ).rejects.toThrow('terminated');
    expect(attempts).toBe(3);
  });

  test("normalized 'request timed out' (SDK read timeout) is retried", async () => {
    let attempts = 0;
    await expect(
      retry(async () => {
        attempts += 1;
        throw new Error('OpenCode request timed out after 30000ms');
      }),
    ).rejects.toThrow('request timed out');
    expect(attempts).toBe(3);
  });

  test('caller-initiated abort (AbortError) is NOT retried', async () => {
    let attempts = 0;
    await expect(
      retry(async () => {
        attempts += 1;
        throw new DOMException('Aborted', 'AbortError');
      }),
    ).rejects.toThrow('Aborted');
    expect(attempts).toBe(1);
  });
});
