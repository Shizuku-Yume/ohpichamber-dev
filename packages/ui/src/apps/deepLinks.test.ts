import { describe, expect, test } from 'bun:test';
import { parseDeepLink } from './deepLinks';

test('retains rejected pairing intents without treating them as navigation', () => {
  const payload = {
    v: 2,
    pairingId: 'pair_expired',
    secret: 'synthetic-expired',
    expiresAt: '2000-01-01T00:00:00.000Z',
    candidates: [{ type: 'lan', url: 'http://127.0.0.1:3901', priority: 10 }],
  };
  const expired = `ohpichamber://connect?v=2&p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  expect(parseDeepLink(expired)).toEqual({ type: 'pairing', payload: null });
  expect(parseDeepLink('ohpichamber://connect?v=2&p=malformed')).toEqual({ type: 'pairing', payload: null });
  expect(parseDeepLink('')).toBeNull();
  expect(parseDeepLink('https://example.com')).toBeNull();
});

describe('Usage provider deep-links for Android home widgets', () => {
  test('opens a built-in quota provider', () => {
    expect(parseDeepLink('ohpichamber://settings/usage?provider=cursor')).toEqual({
      type: 'settings', section: 'usage', providerId: 'cursor',
    });
  });

  test('opens extension-supplied quota providers without the SDK guest', () => {
    expect(parseDeepLink('ohpichamber://settings/usage?provider=ext-antigravity-usage')).toEqual({
      type: 'settings', section: 'usage', providerId: 'ext-antigravity-usage',
    });
  });

  test('keeps the ordinary Usage destination without a provider', () => {
    expect(parseDeepLink('ohpichamber://settings/usage')).toEqual({
      type: 'settings', section: 'usage',
    });
  });

  test('ignores provider selection outside Usage and malformed provider ids', () => {
    expect(parseDeepLink('ohpichamber://settings/appearance?provider=cursor')).toEqual({
      type: 'settings', section: 'appearance',
    });
    expect(parseDeepLink('ohpichamber://settings/usage?provider=..%2Fsecrets')).toEqual({
      type: 'settings', section: 'usage',
    });
  });
});
