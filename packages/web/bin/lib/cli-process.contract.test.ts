import { describe, expect, test } from 'vitest';
import { hasInstanceFields, hasOpenchamberRuntimeInfo, SERVER_SHUTDOWN_GRACE_MS } from './cli-process.js';

describe('CLI instance field boundaries', () => {
  test('accepts instance records, including an empty record', () => {
    expect(hasInstanceFields({ port: 3000, runtime: 'web' })).toBe(true);
    expect(hasInstanceFields({})).toBe(true);
    expect(SERVER_SHUTDOWN_GRACE_MS).toBe(30_000);
  });

  test('rejects absent values, arrays and primitive JSON', () => {
    for (const value of [undefined, null, [], 'invalid', 123, false]) {
      expect(hasInstanceFields(value)).toBe(false);
    }
  });

  test('runtime detection requires a nonempty runtime string', () => {
    expect(hasOpenchamberRuntimeInfo({ runtime: 'web' })).toBe(true);
    expect(hasOpenchamberRuntimeInfo({ runtime: 'desktop' })).toBe(true);
    for (const value of [undefined, null, {}, '', { runtime: '' }, { runtime: 123 }]) {
      expect(hasOpenchamberRuntimeInfo(value)).toBe(false);
    }
  });
});
