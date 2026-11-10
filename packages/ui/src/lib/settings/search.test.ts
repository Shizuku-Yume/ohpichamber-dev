import { describe, expect, test } from 'bun:test';
<<<<<<< HEAD
import type { I18nKey } from '@/lib/i18n/store';
import { buildSettingsSearchResults } from './search';
=======
import type { I18nKey, I18nParams } from '@/lib/i18n/store';
import { acmeTrackerDescriptor, linearLikeTrackerDescriptor } from '@/lib/trackers/descriptor.fixture';
import { acmeDescriptor, githubLikeDescriptor, gitlabLikeDescriptor } from '@/lib/source-control/providers/descriptor.fixture';
import { buildSettingsSearchResults, SETTINGS_ANCHOR_PAGES } from './search';
import { useConfigStore } from '@/stores/useConfigStore';
import { dict as ukDict } from '@/lib/i18n/messages/uk';
>>>>>>> bc50ba56a

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
  test('uses the subscribed voice settings snapshot when one is supplied', () => {
    const voiceSettings = {
      showMessageTTSButtons: true,
      autoReadAloudEnabled: false,
      voiceProvider: 'openai-compatible' as const,
      dictationEnabled: true,
      sttProvider: 'openai-compatible' as const,
    };
    const endpointIds = (enabled: boolean) => buildSettingsSearchResults({
      query: 'endpoint path',
      runtimeCtx: { ...runtimeCtx, voiceSettings: {
        ...voiceSettings, showMessageTTSButtons: enabled, dictationEnabled: enabled,
      } },
      t,
      getPageTitle: (page) => page,
    }).map((result) => result.id);
    expect(endpointIds(true)).toContain('voice.tts-endpoint-path');
    expect(endpointIds(true)).toContain('voice.stt-endpoint-path');
    expect(endpointIds(false)).not.toContain('voice.tts-endpoint-path');
    expect(endpointIds(false)).not.toContain('voice.stt-endpoint-path');
  });

  test('indexes the retention target under its current label and existing anchor', () => {
    const results = buildSettingsSearchResults({ query: 'retention', runtimeCtx, t, getPageTitle: (page) => page });
    const target = results.find((result) => result.id === 'sessions.retention-only-archived');
    expect(target?.page).toBe('sessions');
    expect(target?.title).toBe('settings.layout.sessions.retention.target');
    expect(target?.description).toBeNull();
  });

  test('finds localized endpoint fields only while their controls are visible', () => {
    const initial = useConfigStore.getState();
    try {
      for (const context of [runtimeCtx, { ...runtimeCtx, isDesktop: true }, { ...runtimeCtx, isMobile: true }, { ...runtimeCtx, isVSCode: true }]) {
        for (const enabled of [false, true]) {
          for (const custom of [false, true]) {
            useConfigStore.setState({
              voiceProvider: custom ? 'openai-compatible' : 'local',
              sttProvider: custom ? 'openai-compatible' : 'local',
              showMessageTTSButtons: enabled,
              autoReadAloudEnabled: false,
              dictationEnabled: enabled,
            });
            for (const query of ['endpoint path', 'custom endpoint', 'resource path', ukDict['settings.voice.page.field.endpointPath']]) {
              const results = buildSettingsSearchResults({ query, runtimeCtx: context, t: (key) => ukDict[key], getPageTitle: (page) => page });
              const ids = results.map((result) => result.id);
              expect(ids.includes('voice.tts-endpoint-path')).toBe(enabled && custom && !context.isVSCode);
              expect(ids.includes('voice.stt-endpoint-path')).toBe(enabled && custom && !context.isVSCode);
            }
          }
        }
      }
      useConfigStore.setState({ voiceProvider: 'openai-compatible', showMessageTTSButtons: false, autoReadAloudEnabled: true });
      expect(buildSettingsSearchResults({ query: 'endpoint path', runtimeCtx, t, getPageTitle: (page) => page })
        .some((result) => result.id === 'voice.tts-endpoint-path')).toBe(true);
    } finally {
      useConfigStore.setState(initial);
    }
  });
  test('finds double-paste on every shared Settings surface', () => {
    for (const query of ['double paste', 'ctrl v', 'cmd v']) {
      for (const context of [runtimeCtx, { ...runtimeCtx, isDesktop: true }, { ...runtimeCtx, isMobile: true }]) {
        const results = buildSettingsSearchResults({ query, runtimeCtx: context, t, getPageTitle: (page) => page });
        expect(results.find((result) => result.id === 'chat.large-text-paste')?.page).toBe('chat');
      }
    }
  });
<<<<<<< HEAD
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

=======
>>>>>>> bc50ba56a
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
      // General's Panels section holds it; VS Code has no such section and keeps it on Appearance.
      const expected = context.isVSCode
        ? { id: 'appearance.scrollbars-vscode', page: 'appearance' }
        : { id: 'appearance.scrollbars', page: 'general' };
      expect(results.find((result) => result.id === expected.id)?.page).toBe(expected.page);
    }
  });
<<<<<<< HEAD
  test('finds Linear connect on the integrations page', () => {
=======

  test('finds the provider logo wherever it can be uploaded', () => {
    for (const context of [runtimeCtx, { ...runtimeCtx, isDesktop: true }, { ...runtimeCtx, isMobile: true }, { ...runtimeCtx, isVSCode: true }]) {
      const results = buildSettingsSearchResults({
        query: 'logo',
        runtimeCtx: context,
        t,
        getPageTitle: (page) => page,
      });
      expect(results.find((result) => result.id === 'providers.logo')?.page).toBe(context.isVSCode ? undefined : 'providers');
    }
  });

  test('finds Linear connect on the integrations page when the server serves Linear', () => {
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
=======
  test('builds a card and a connect entry for every served source-control provider, named by its label', () => {
    const results = buildSettingsSearchResults({
      query: 'acme',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
      sourceControlProviders: [...sourceControlProviders, acmeDescriptor()],
    });
    expect(results.map((result) => result.id)).toEqual([
      'integrations.source-control.acme',
      'integrations.source-control.acme.connect',
    ]);
    expect(results[0]?.title).toBe('Acme Forge');
    expect(results[0]?.description).toContain('"provider":"Acme Forge"');
    expect(results[1]?.title).toContain('"provider":"Acme Forge"');

    const byNoun = buildSettingsSearchResults({ query: 'merge request', runtimeCtx, t, getPageTitle: (page) => page, sourceControlProviders });
    expect(byNoun.some((result) => result.id === 'integrations.source-control.gitlab')).toBe(true);
    expect(byNoun.some((result) => result.id === 'integrations.source-control.github')).toBe(false);

    const unserved = buildSettingsSearchResults({ query: 'gitlab', runtimeCtx, t, getPageTitle: (page) => page });
    expect(unserved.some((result) => result.id.startsWith('integrations.source-control.'))).toBe(false);
  });

  test('server-served integration entries never enter the new-badge anchor map', () => {
    const providerResults = buildSettingsSearchResults({
      query: 'acme',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
      sourceControlProviders: [...sourceControlProviders, acmeDescriptor()],
    });
    const providerIds = providerResults.map((result) => result.id);
    expect(providerIds).toEqual([
      'integrations.source-control.acme',
      'integrations.source-control.acme.connect',
    ]);

    const trackerResults = buildSettingsSearchResults({
      query: 'linear',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
      trackers,
    });
    const trackerIds = trackerResults.map((result) => result.id)
      .filter((id) => id.startsWith('integrations.linear'));
    expect(trackerIds.length).toBeGreaterThan(0);

    for (const id of [...providerIds, ...trackerIds]) {
      expect(SETTINGS_ANCHOR_PAGES.has(id)).toBe(false);
    }
  });

  test('keeps repository transport and provider controls out of VS Code Settings search', () => {
    const vscodeCtx = { ...runtimeCtx, isVSCode: true, isWeb: false };
    const transportResults = buildSettingsSearchResults({
      query: 'transport',
      runtimeCtx: vscodeCtx,
      t,
      getPageTitle: (page) => page,
    });
    const accountResults = buildSettingsSearchResults({
      query: 'account',
      runtimeCtx: vscodeCtx,
      t,
      getPageTitle: (page) => page,
      sourceControlProviders,
    });

    expect(transportResults.some((result) => result.id === 'git.repository-transport')).toBe(false);
    expect(accountResults.some((result) => result.id.startsWith('integrations.source-control.'))).toBe(false);
  });
>>>>>>> bc50ba56a

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
