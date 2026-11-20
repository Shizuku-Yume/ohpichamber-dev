import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPushTagsStore, createPushTagTracker } from './push-tags-store.js';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const fileStore = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'push-tags-'));
  roots.push(root);
  const file = path.join(root, 'push-tags.json');
  return { file, store: createPushTagsStore(file) };
};
const record = (tag, at = 100, sessionId = 'session') => ({ tag, nativeTag: `${tag}@native`, sessionId, at });
const memoryStore = (tags = []) => ({ read: async () => ({ version: 1, tags }), write: vi.fn(async () => {}) });

describe('Host push tags', () => {
  it('starts empty, atomically saves private metadata and restores exact native tags after restart', async () => {
    const { file, store } = await fileStore();
    expect(await store.read()).toEqual({ version: 1, tags: [] });
    const first = createPushTagTracker({ store, now: () => 100 });
    expect(await first.add('share-session', 'share-session@claim', 'session')).toBe(1);
    const second = createPushTagTracker({ store, now: () => 101 });
    expect(await second.clearSession('other')).toEqual({ tags: [], badge: 1 });
    expect(await second.clearSession('session')).toEqual({ tags: ['share-session@claim'], badge: 0 });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 1, tags: [] });
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('serializes additions, per-tag removal and badge reset', async () => {
    const store = memoryStore();
    const tracker = createPushTagTracker({ store, now: () => 100 });
    expect(await Promise.all([tracker.add('one', 'one', 'a'), tracker.add('two', 'two', 'b')])).toEqual([1, 2]);
    await tracker.remove('one');
    await tracker.clearAll();
    expect(store.write.mock.calls.map(([state]) => state.tags.length)).toEqual([1, 2, 1, 0]);
  });

  it('expires old entries, ignores invalid entries and bounds restored and new tags', async () => {
    const logger = { warn: vi.fn() };
    const store = memoryStore([record('expired', -8 * 86400000), null, ...Array.from({ length: 510 }, (_, i) => record(`tag-${i}`))]);
    const tracker = createPushTagTracker({ store, logger, now: () => 101 });
    expect(await tracker.add('new', 'new@claim', 'other')).toBe(500);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(await tracker.clearSession('session')).toMatchObject({ badge: 1 });
    const saved = store.write.mock.calls.at(-1)[0];
    expect(saved.tags).toEqual([record('new', 101, 'other')].map((item) => ({ ...item, nativeTag: 'new@claim' })));
  });

  it.each(['malformed', 'unreadable'])('does not overwrite %s restored state or block live delivery', async (failure) => {
    const store = memoryStore();
    store.read = failure === 'malformed' ? async () => null : async () => { throw new Error('EACCES'); };
    const logger = { warn: vi.fn() };
    const tracker = createPushTagTracker({ store, logger, now: () => 100 });
    expect(await tracker.add('live', 'live', 'session')).toBe(1);
    expect(store.write).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps live state and retries after a failed write', async () => {
    const store = memoryStore();
    store.write.mockRejectedValueOnce(new Error('ENOSPC'));
    const logger = { warn: vi.fn() };
    const tracker = createPushTagTracker({ store, logger, now: () => 100 });
    expect(await tracker.add('one', 'one', 'session')).toBe(1);
    expect(await tracker.add('two', 'two', 'session')).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(store.write.mock.calls.at(-1)[0].tags).toHaveLength(2);
    const { file, store: disk } = await fileStore();
    await writeFile(file, '{broken');
    await expect(disk.read()).rejects.toThrow();
  });
});
