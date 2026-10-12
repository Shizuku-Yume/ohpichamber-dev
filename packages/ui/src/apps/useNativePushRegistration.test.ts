import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getPushKey, PUSH_KEY_PATTERN } from './useNativePushRegistration';

describe('useNativePushRegistration push key contract', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Reset window mock
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __OPENCHAMBER_PUSH_KEY__: undefined,
        Capacitor: {
          getPlatform: () => 'ios',
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  describe('PUSH_KEY_PATTERN validation', () => {
    test('accepts valid 32-byte base64 strings', () => {
      // 32 bytes in base64 is 44 characters ending with a single '='
      const validKey1 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
      const validKey2 = 'wN2kP6X7V8yY1b+Z9A0cDeFgHiJkLmNoPqRsTuVwXyZ=';
      expect(PUSH_KEY_PATTERN.test(validKey1)).toBe(true);
      expect(PUSH_KEY_PATTERN.test(validKey2)).toBe(true);
    });

    test('rejects 16-byte base64 strings (too short)', () => {
      // 16 bytes in base64 is 24 characters ending with '=='
      const shortKey = 'AAAAAAAAAAAAAAAAAAAAAA==';
      expect(PUSH_KEY_PATTERN.test(shortKey)).toBe(false);
    });

    test('rejects 64-byte base64 strings (too long)', () => {
      const longKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      expect(PUSH_KEY_PATTERN.test(longKey)).toBe(false);
    });

    test('rejects invalid characters and malformed padding', () => {
      expect(PUSH_KEY_PATTERN.test('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!')).toBe(false);
      expect(PUSH_KEY_PATTERN.test('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==')).toBe(false);
      expect(PUSH_KEY_PATTERN.test('not-a-valid-base64-key-at-all')).toBe(false);
      expect(PUSH_KEY_PATTERN.test('')).toBe(false);
    });
  });

  describe('getPushKey acquisition', () => {
    test('obtains valid key injected on iOS window.__OPENCHAMBER_PUSH_KEY__', async () => {
      const iosKey = 'b3BlbmNoYW1iZXItcHVzaC1zZWFsLWtleS0zMi1ieXRlcw=='.slice(0, 43) + '=';
      window.__OPENCHAMBER_PUSH_KEY__ = iosKey;

      const result = await getPushKey();
      expect(result).toBe(iosKey);
    });

    test('ignores invalid key injected on iOS window and falls back safely', async () => {
      window.__OPENCHAMBER_PUSH_KEY__ = 'invalid-short-key';

      // Plugin rejection or missing on iOS defaults to undefined
      const result = await getPushKey();
      expect(result).toBeUndefined();
    });

    test('returns undefined when neither iOS injection nor Android plugin provides a key', async () => {
      window.__OPENCHAMBER_PUSH_KEY__ = undefined;

      const result = await getPushKey();
      expect(result).toBeUndefined();
    });
  });
});
