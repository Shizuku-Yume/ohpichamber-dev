import { describe, expect, test } from 'bun:test';
import type { I18nKey } from '@/lib/i18n/store';
import { dict as en } from '@/lib/i18n/messages/en';
import { dict as zhCnDict } from '@/lib/i18n/messages/zh-CN';
import { SETTINGS_SEARCH_ITEMS, buildSettingsSearchResults } from './search';
import { ompSettingsTabForSearchTarget } from '@/components/sections/openchamber/ompSettingsLayout';

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
  test('terminal reading is searchable on every surface, while browser profile sharing is desktop-only', () => {
    for (const isDesktop of [false, true]) {
      const context = { ...runtimeCtx, isDesktop };
      const find = (query: string) => buildSettingsSearchResults({ query, runtimeCtx: context, t, getPageTitle: (page) => page });
      expect(find('terminal').some((item) => item.id === 'sessions.agent-terminal-tool')).toBe(true);
      expect(find('logins').some((item) => item.id === 'sessions.agent-browser-logins')).toBe(isDesktop);
    }
  });
  test('indexes worktree creation and keeps the mobile Return-key control mobile-only', () => {
    const create = SETTINGS_SEARCH_ITEMS.find((item) => item.id === 'projects.worktree.create');
    expect(create?.page).toBe('projects');
    expect(create?.titleKey).toBe('settings.openchamber.worktrees.create.title');
    const query = 'return send';
    const results = (isMobile: boolean) => buildSettingsSearchResults({ query, runtimeCtx: { ...runtimeCtx, isMobile }, t, getPageTitle: (page) => page });
    expect(results(true).some((item) => item.id === 'chat.mobile-return-key-sends')).toBe(true);
    expect(results(false).some((item) => item.id === 'chat.mobile-return-key-sends')).toBe(false);
  });
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


  test('every search entry resolves to copy in the English dictionary', () => {
    // A `titleKey` or `descriptionKey` with no copy renders the raw key, so the
    // result row shows `settings.…` instead of a name. An entry with no copy is
    // deleted rather than left in the index for the guard to filter at runtime.
    const unresolved = SETTINGS_SEARCH_ITEMS.flatMap((item) => {
      const missing = [item.titleKey, item.descriptionKey]
        .filter((key): key is I18nKey => key !== undefined)
        .filter((key) => en[key] === undefined);
      return missing.length > 0 ? [`${item.id}: ${missing.join(', ')}`] : [];
    });
    expect(unresolved).toEqual([]);
  });

  test('OMP engine rows are searchable by their translated copy and open the tab that draws them', () => {
    // The Chinese word for "timeout" appears only in the locale, so matching it
    // proves search reads the translated label/description rather than the id.
    const results = buildSettingsSearchResults({
      query: '超时',
      runtimeCtx,
      t: (key: I18nKey) => zhCnDict[key] ?? t(key),
      getPageTitle: (page) => page,
    });
    const found = results.filter((result) => result.page === 'omp');
    const ids = found.map((result) => result.id);
    for (const anchor of ['omp.ask.timeout', 'omp.lsp.requestTimeout', 'omp.images.questionTimeoutMs']) {
      expect(ids).toContain(anchor);
      expect(ompSettingsTabForSearchTarget(anchor)).not.toBeNull();
    }
    for (const result of found) {
      expect({ id: result.id, tab: ompSettingsTabForSearchTarget(result.id) }).not.toEqual({ id: result.id, tab: null });
    }
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
