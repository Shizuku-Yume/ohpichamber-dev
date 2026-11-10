import { describe, expect, test } from 'bun:test';
import type { I18nKey } from '@/lib/i18n/store';
import { buildSettingsSearchResults } from './search';

const t = (key: I18nKey): string => key;

const runtimeCtx = {
  isWeb: true,
  isDesktop: false,
  isMobile: false,
  isDesktopLocalOrigin: false,
  isMac: false,
  isWindows: false,
  isLinux: false,
  routingAvailable: false,
  enterpriseMode: false,
  jevBlockedByEnterprise: false,
};

describe('settings search', () => {
  test('finds double-paste on every shared Settings surface', () => {
    for (const query of ['double paste', 'ctrl v', 'cmd v']) {
      for (const context of [runtimeCtx, { ...runtimeCtx, isDesktop: true }, { ...runtimeCtx, isMobile: true }]) {
        const results = buildSettingsSearchResults({ query, runtimeCtx: context, t, getPageTitle: (page) => page });
        expect(results.find((result) => result.id === 'chat.large-text-paste')?.page).toBe('chat');
      }
    }
  });
  test('finds the Claude Code integration by name and package on retained surfaces', () => {
    for (const query of ['claude', '@openchamber/opencode-claude']) {
      for (const context of [runtimeCtx, { ...runtimeCtx, isDesktop: true }, { ...runtimeCtx, isMobile: true }]) {
        const results = buildSettingsSearchResults({
          query,
          runtimeCtx: context,
          t,
          getPageTitle: (page) => page,
        });

        expect(results.some((result) => result.id === 'integrations.third-party.opencode-claude')).toBe(true);
      }
    }
  });

  test('Enter-to-send is searchable only outside mobile', () => {
    for (const isMobile of [false, true]) {
      const results = buildSettingsSearchResults({
        query: 'shift enter',
        runtimeCtx: { ...runtimeCtx, isMobile },
        t,
        getPageTitle: (page) => page,
      });

      expect(results.some((result) => result.id === 'chat.enter-to-send')).toBe(!isMobile);
    }
  });
  test('restored mobile workspace tabs and return key sends are searchable only on mobile', () => {
    for (const isMobile of [false, true]) {
      const mobileTabsResults = buildSettingsSearchResults({
        query: 'mobile',
        runtimeCtx: { ...runtimeCtx, isMobile },
        t,
        getPageTitle: (page) => page,
      });
      expect(mobileTabsResults.some((result) => result.id === 'layout.mobile-workspace-tabs')).toBe(isMobile);
      expect(mobileTabsResults.some((result) => result.id === 'chat.mobile-return-key-sends')).toBe(isMobile);
    }
  });

  test('restored live browser tabs stepper is searchable on desktop only', () => {
    const desktopResults = buildSettingsSearchResults({
      query: 'browser tabs',
      runtimeCtx: { ...runtimeCtx, isDesktop: true, isMobile: false },
      t,
      getPageTitle: (page) => page,
    });
    expect(desktopResults.some((result) => result.id === 'appearance.live-browser-tabs')).toBe(true);

    const mobileResults = buildSettingsSearchResults({
      query: 'browser tabs',
      runtimeCtx: { ...runtimeCtx, isDesktop: false, isMobile: true },
      t,
      getPageTitle: (page) => page,
    });
    expect(mobileResults.some((result) => result.id === 'appearance.live-browser-tabs')).toBe(false);
  });

  test('restored default session mode and worktree archive on done are indexed under sessions', () => {
    const results = buildSettingsSearchResults({
      query: 'session mode',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });
    expect(results.find((result) => result.id === 'sessions.default-mode')?.page).toBe('sessions');

    const archiveResults = buildSettingsSearchResults({
      query: 'worktree',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });
    expect(archiveResults.find((result) => result.id === 'sessions.worktree-archive-on-done')?.page).toBe('sessions');
  });


  test('finds the scrollbar preference on every retained surface', () => {
    for (const context of [runtimeCtx, { ...runtimeCtx, isDesktop: true }, { ...runtimeCtx, isMobile: true }]) {
      const results = buildSettingsSearchResults({
        query: 'scrollbar',
        runtimeCtx: context,
        t,
        getPageTitle: (page) => page,
      });
      expect(results.find((result) => result.id === 'appearance.scrollbars')?.page).toBe('appearance');
    }
  });
  test('finds Linear connect on the integrations page', () => {
    const results = buildSettingsSearchResults({
      query: 'linear',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'integrations.linear')).toBe(true);
    expect(results.some((result) => result.id === 'integrations.linear.add-workspace')).toBe(true);
    expect(results.some((result) => result.id === 'integrations.linear.mapping')).toBe(true);
  });

  test('finds the chat input history scope setting', () => {
    const results = buildSettingsSearchResults({
      query: 'input history scope',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'chat.input-history-scope')).toBe(true);
  });

  test('finds the chat input history limit setting by recall keywords', () => {
    const results = buildSettingsSearchResults({
      query: 'remember prompts',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'chat.input-history-limit')).toBe(true);
  });


  test('keeps repository controls out of Settings search and indexes account connection controls', () => {
    const results = buildSettingsSearchResults({
      query: 'source control account',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'git.source-control-account')).toBe(false);
    expect(results.some((result) => result.id.includes('github.com#'))).toBe(false);

    const connectResults = buildSettingsSearchResults({
      query: 'connect account',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });
    expect(connectResults.some((result) => result.id === 'git.github-connect')).toBe(true);
    expect(connectResults.some((result) => result.id === 'git.gitlab-connect')).toBe(true);
  });


  test('finds guest extension panels on the integrations page', () => {
    const results = buildSettingsSearchResults({
      query: 'gitlab',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });
    expect(results.some((result) => result.id === 'integrations.guests')).toBe(true);
  });

});
