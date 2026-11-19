import { describe, expect, test } from 'bun:test';
import { MOBILE_SETTINGS_PAGES } from './mobileSettingsNavigation';
import { getSettingsPageMeta, SETTINGS_PAGE_METADATA } from '@/lib/settings/metadata';

describe('mobile Settings page list', () => {
  test('names only real settings pages, without the nav stage or keyboard-only Shortcuts', () => {
    for (const slug of MOBILE_SETTINGS_PAGES) {
      expect(getSettingsPageMeta(slug)).not.toBeNull();
      expect(slug).not.toBe('home');
      expect(slug).not.toBe('shortcuts');
      expect(slug).not.toBe('extensions');
    }
    expect(new Set(MOBILE_SETTINGS_PAGES).size).toBe(MOBILE_SETTINGS_PAGES.length);
  });

  test('covers every page the walk exposed as a dead deep link', () => {
    for (const slug of ['general', 'projects', 'remote-instances', 'tunnel', 'tools', 'memory', 'behavior'] as const) {
      expect(MOBILE_SETTINGS_PAGES).toContain(slug);
    }
  });

  test('covers every page available on mobile except the keyboard-only Shortcuts', () => {
    const ctx = {
      isWeb: false,
      isDesktop: false,
      isMobile: true,
      routingAvailable: true,
      enterpriseMode: false,
      jevBlockedByEnterprise: false,
    };
    const expected = SETTINGS_PAGE_METADATA
      .filter((page) => page.slug !== 'home' && page.slug !== 'shortcuts')
      .filter((page) => page.isAvailable ? page.isAvailable(ctx) : true)
      .map((page) => page.slug);
    for (const slug of expected) expect(MOBILE_SETTINGS_PAGES).toContain(slug);
  });
});
