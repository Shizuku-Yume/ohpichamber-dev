import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { canonicalClient } from '@/api/canonicalClient';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { requestSessionArchiveBatch, requestSessionMetadataUpdate, requestSessionUnarchiveBatch } from './session-archive-batch';

afterEach(() => { mock.restore(); });

describe('native session archive and metadata helpers', () => {
  test('forwards the native metadata changes wrapper to CanonicalClient', async () => {
    const patch = { changes: { title: 'Renamed', openchamber: { work: { state: 'open' as const } } } };
    const write = spyOn(canonicalClient, 'patchSessionMetadata').mockResolvedValue({
      sessionId: 'session', revision: '7', metadata: { title: 'Renamed', openchamber: { work: { state: 'open' } } },
    });
    const result = await requestSessionMetadataUpdate('session', patch);
    expect(write).toHaveBeenCalledWith('session', patch);
    expect(result).toEqual({ outcome: 'updated', revision: '7', metadata: { title: 'Renamed', openchamber: { work: { state: 'open' } } } });
  });
  test('preserves canonical metadata failure as unavailable', async () => {
    spyOn(canonicalClient, 'patchSessionMetadata').mockRejectedValue(new Error('metadata unavailable'));
    expect(await requestSessionMetadataUpdate('session', { changes: { title: null } })).toEqual({ outcome: 'unavailable', reason: 'metadata unavailable' });
  });
  test('keeps Host batch partial failures distinct from successful stamps', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://archive.test', runtimeKey: 'archive-test' });
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      archived: [{ id: 'saved', archivedAt: 123 }], failedIds: ['failed'],
    }));
    expect(await requestSessionArchiveBatch('/repo', ['saved', 'failed'], 123)).toEqual({
      outcome: 'archived', archived: [{ id: 'saved', archivedAt: 123 }], failedIds: ['failed'],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('refuses malformed archive response rather than granting empty success', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://archive.test', runtimeKey: 'archive-test' });
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ archived: [], failedIds: [null] }));
    expect((await requestSessionArchiveBatch('/repo', ['session'], 123)).outcome).toBe('unavailable');
  });
  test('unarchive reads native Host tombstones and rejects HTTP failure', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://archive.test', runtimeKey: 'archive-test' });
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ restored: [{ id: 'session', archivedAt: null }], failedIds: [] }));
    expect(await requestSessionUnarchiveBatch(['session'], '/repo')).toEqual({ outcome: 'restored', restored: ['session'], failedIds: [] });
    fetch.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await requestSessionUnarchiveBatch(['session'], '/repo')).outcome).toBe('unavailable');
  });
});
