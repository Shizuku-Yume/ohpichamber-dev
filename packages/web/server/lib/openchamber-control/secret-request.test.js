import { describe, expect, it, vi } from 'vitest';

import { createSecretRequests } from './secret-request.js';

describe('memory-only secret requests', () => {
  it('refuses file mode without waiting or touching a file owner', async () => {
    const onWaitChange = vi.fn();
    const requests = createSecretRequests({ isEnabled: async () => true, onWaitChange });
    await expect(requests.request({ label: 'Token', reason: 'Sign in' })).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('secrets must not be saved to disk'),
    });
    expect(onWaitChange).not.toHaveBeenCalled();
  });

  it('refuses missing identities and stale answers without echoing values', async () => {
    const requests = createSecretRequests({ isEnabled: async () => true });
    await expect(requests.answer({ values: { TOKEN: 'private-value' } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(requests.answer({ sessionId: 's', callId: 'c', values: { TOKEN: 'private-value' } })).rejects.toMatchObject({
      statusCode: 404, message: 'This request is no longer waiting for a secret',
    });
    expect(() => requests.fields({ sessionId: 's', callId: 'c' })).toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('does not give another session or call access to a waiting card', async () => {
    const waiting = Promise.withResolvers();
    const requests = createSecretRequests({
      isEnabled: async () => true,
      onWaitChange: change => { if (change.type === 'waiting') waiting.resolve(); },
    });
    const pending = requests.run({
      program: process.execPath, args: ['-e', 'process.exit(0)'],
      reason: 'Sign in', inputs: [{ env: 'TOKEN', label: 'Token' }],
    }, { sessionId: 's', callId: 'c', directory: process.cwd() });
    await waiting.promise;
    await expect(requests.run({
      program: process.execPath, reason: 'Duplicate', inputs: [{ env: 'TOKEN', label: 'Token' }],
    }, { sessionId: 's', callId: 'c', directory: process.cwd() })).rejects.toMatchObject({ statusCode: 409 });
    for (const identity of [{ sessionId: 'other', callId: 'c' }, { sessionId: 's', callId: 'other' }]) {
      expect(() => requests.fields(identity)).toThrow(expect.objectContaining({ statusCode: 404 }));
      await expect(requests.answer({ ...identity, values: { TOKEN: 'private-value' } })).rejects.toMatchObject({ statusCode: 404 });
      await expect(requests.answer({ ...identity, declined: true })).rejects.toMatchObject({ statusCode: 404 });
    }
    await expect(requests.answer({ sessionId: 's', callId: 'c', declined: true })).resolves.toEqual({ status: 'declined' });
    await expect(pending).resolves.toMatchObject({ answer: { status: 'declined' } });
  });

  it('redacts runner failures and never sends values through wait events', async () => {
    const waiting = Promise.withResolvers();
    const changes = [];
    const run = vi.fn(async () => { throw new Error('failed with private-value'); });
    const requests = createSecretRequests({
      isEnabled: async () => true, run,
      onWaitChange: change => { changes.push(change); if (change.type === 'waiting') waiting.resolve(); },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const pending = requests.run({
        program: 'example', reason: 'Sign in', inputs: [{ env: 'TOKEN', label: 'Token' }],
      }, { sessionId: 's', callId: 'c', directory: process.cwd() });
      await waiting.promise;
      await requests.answer({ sessionId: 's', callId: 'c', values: { TOKEN: 'private-value' } });
      const result = await pending;
      expect(result.error).toBe('failed with [secret:TOKEN]');
      expect(JSON.stringify([result, changes, warn.mock.calls, log.mock.calls])).not.toContain('private-value');
      expect(run.mock.calls[0][2]).toMatchObject({ killTree: true, env: { TOKEN: 'private-value' } });
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });
});
