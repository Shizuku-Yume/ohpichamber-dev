import { describe, expect, test } from 'bun:test';
import { fetchStartupDiagnostics, getInitRecoveryDescriptionKey } from './startupDiagnostics';

describe('startup diagnostics', () => {
  test('queries the canonical Agent Service readiness route', async () => {
    const controller = new AbortController();
    const result = await fetchStartupDiagnostics(controller.signal, async (path, options) => {
      expect(path).toBe('/api/agent/v1/ready');
      expect(options?.signal).toBe(controller.signal);
      expect(options?.cache).toBe('no-store');
      return Response.json({ ready: false });
    });

    expect(result).toEqual({ error: null, binary: null });
  });

  test('does not present a historical readiness failure after recovery', async () => {
    expect(await fetchStartupDiagnostics(new AbortController().signal, async () => Response.json({
      ready: true,
      engine: 'omp',
      version: '1.0.0',
    }))).toBeNull();
  });

  test('rejects HTTP errors rather than trusting their response body', async () => {
    await expect(fetchStartupDiagnostics(new AbortController().signal, async () => Response.json({ ready: true }, { status: 503 })))
      .rejects.toThrow('Agent Service readiness request failed (503)');
  });

  test('treats malformed readiness data as unavailable', async () => {
    expect(await fetchStartupDiagnostics(new AbortController().signal, async () => Response.json({ ready: 'true' })))
      .toEqual({ error: null, binary: null });
  });

  test('propagates transport failures and request cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchStartupDiagnostics(controller.signal, async (_path, options) => {
      options?.signal?.throwIfAborted();
      return Response.json({ ready: false });
    })).rejects.toThrow();
    await expect(fetchStartupDiagnostics(new AbortController().signal, async () => {
      throw new Error('Server unreachable');
    })).rejects.toThrow('Server unreachable');
  });

  test('asks to check the server only when it could not be reached', () => {
    expect(getInitRecoveryDescriptionKey(null, { step: 'serverUnreachable', message: null }))
      .toBe('startup.initRecovery.serverUnreachable');
    expect(getInitRecoveryDescriptionKey(null, { step: 'loadAgents', message: 'boom' }))
      .toBe('startup.initRecovery.loadAgentsFailed');
    expect(getInitRecoveryDescriptionKey(null, { step: 'agentServiceUnavailable', message: null }))
      .toBe('startup.initRecovery.agentServiceUnavailable');
    expect(getInitRecoveryDescriptionKey(null, { step: 'unexpected', message: 'boom' }))
      .toBe('startup.initRecovery.unexpected');
    expect(getInitRecoveryDescriptionKey(null, null)).toBe('startup.initRecovery.unexpected');
  });

  test('canonical diagnostics win over the client-side failure guess', () => {
    expect(getInitRecoveryDescriptionKey({ error: null, binary: null }, { step: 'serverUnreachable', message: null }))
      .toBe('startup.initRecovery.agentServiceUnavailable');
  });
});
