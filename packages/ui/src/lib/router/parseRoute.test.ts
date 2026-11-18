import { describe, expect, test } from 'bun:test';

import { parseRoute } from './parseRoute';

describe('parseRoute session', () => {
  test('reads a session id including OpenCode underscores', () => {
    const route = parseRoute(new URLSearchParams('session=ses_abc123'));
    expect(route.sessionId).toBe('ses_abc123');
  });

  test('decodes a percent-encoded session id', () => {
    const route = parseRoute(new URLSearchParams('session=ses%5Fabc123'));
    expect(route.sessionId).toBe('ses_abc123');
  });

  test('ignores a blank session param', () => {
    const route = parseRoute(new URLSearchParams('session='));
    expect(route.sessionId).toBeNull();
  });
});

describe('parseRoute message', () => {
  test('reads a linked message next to its session', () => {
    const route = parseRoute(new URLSearchParams('session=ses_abc&message=msg_123'));
    expect(route.messageId).toBe('msg_123');
  });

  test('ignores a message without a session', () => {
    expect(parseRoute(new URLSearchParams('message=msg_123')).messageId).toBeNull();
  });

  test('rejects a message id outside the identifier alphabet', () => {
    expect(parseRoute(new URLSearchParams('session=ses_abc&message=msg"]')).messageId).toBeNull();
  });
});

describe('parseRoute settings', () => {
  test('keeps the General page distinct from the settings root', () => {
    // Folding general into home stranded mobile deep links on the nav list;
    // desktop then redirected home back to general, hiding it.
    expect(parseRoute(new URLSearchParams('settings=general')).settingsPath).toBe('general');
    expect(parseRoute(new URLSearchParams('settings=general&surface=mobile')).settingsPath).toBe('general');
  });

  test('keeps every settings page slug as a page, not the root', () => {
    for (const slug of ['projects', 'remote-instances', 'tunnel', 'tools', 'memory', 'behavior', 'shortcuts']) {
      expect(parseRoute(new URLSearchParams(`settings=${slug}`)).settingsPath).toBe(slug);
    }
  });

  test('still folds the settings root aliases', () => {
    expect(parseRoute(new URLSearchParams('settings=openchamber')).settingsPath).toBe('home');
    expect(parseRoute(new URLSearchParams('settings=preferences')).settingsPath).toBe('home');
  });
});
