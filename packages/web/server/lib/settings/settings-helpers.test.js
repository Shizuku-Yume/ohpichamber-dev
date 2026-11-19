import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INPUT_HISTORY_LIMIT,
} from './input-history-scope.js';
import { createSettingsHelpers } from './settings-helpers.js';
import { createSettingsNormalizationRuntime } from './settings-normalization-runtime.js';

const testFilePath = fileURLToPath(import.meta.url);
const packagesWebDir = join(dirname(testFilePath), '..', '..', '..');

const createTestHelpers = () => createSettingsHelpers({
  normalizePathForPersistence: (value) => value,
  normalizeTunnelBootstrapTtlMs: (value) => value,
  normalizeTunnelSessionTtlMs: (value) => value,
  normalizeTunnelProvider: (value) => value,
  normalizeTunnelMode: (value) => value,
  normalizeOptionalPath: (value) => value,
  normalizeManagedRemoteTunnelHostname: (value) => value,
  normalizeManagedRemoteTunnelPresets: () => undefined,
  normalizeManagedRemoteTunnelPresetTokens: () => undefined,
  sanitizeTypographySizesPartial: () => undefined,
  normalizeStringArray: (input) => input,
  sanitizeModelRefs: () => undefined,
  sanitizeSkillCatalogs: () => undefined,
  sanitizeProjects: () => undefined,
});

const createTestHelpersWithRealSanitizers = () => {
  const runtime = createSettingsNormalizationRuntime({
    os: { homedir: () => '/home/testuser' },
    path: {
      resolve: (...args) => args[args.length - 1],
      sep: '/',
      dirname: (p) => p.split('/').slice(0, -1).join('/') || '/',
    },
    processLike: { platform: 'linux', env: {} },
    realpathSync: (p) => p,
    tunnelBootstrapTtlDefaultMs: 600000,
    tunnelBootstrapTtlMinMs: 60000,
    tunnelBootstrapTtlMaxMs: 3600000,
    tunnelSessionTtlDefaultMs: 86400000,
    tunnelSessionTtlMinMs: 3600000,
    tunnelSessionTtlMaxMs: 604800000,
  });
  return createSettingsHelpers({
    normalizePathForPersistence: (value) => value,
    normalizeTunnelBootstrapTtlMs: (value) => value,
    normalizeTunnelSessionTtlMs: (value) => value,
    normalizeTunnelProvider: (value) => value,
    normalizeTunnelMode: (value) => value,
    normalizeOptionalPath: (value) => value,
    normalizeManagedRemoteTunnelHostname: (value) => value,
    normalizeManagedRemoteTunnelPresets: () => undefined,
    normalizeManagedRemoteTunnelPresetTokens: () => undefined,
    sanitizeTypographySizesPartial: () => undefined,
    normalizeStringArray: runtime.normalizeStringArray,
    sanitizeModelRefs: runtime.sanitizeModelRefs,
    sanitizeSkillCatalogs: () => undefined,
    sanitizeProjects: () => undefined,
  });
};

describe('settings helpers', () => {
  it('sanitizes the optional GitLab OAuth client ID', () => {
    const helpers = createTestHelpers();
    expect(helpers.sanitizeSettingsUpdate({ gitlabClientId: ' client-id ' })).toEqual({ gitlabClientId: 'client-id' });
    expect(helpers.sanitizeSettingsUpdate({ gitlabClientId: '' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ gitlabClientId: 42 })).toEqual({});
  });

  it('persists only a valid tunnel HTTPS port', () => {
    const helpers = createTestHelpers();
    expect(helpers.sanitizeSettingsUpdate({ tunnelHttpsPort: 8443 })).toEqual({ tunnelHttpsPort: 8443 });
    for (const invalid of [0, 65536, -1, 8443.5, '8443', null]) {
      expect(helpers.sanitizeSettingsUpdate({ tunnelHttpsPort: invalid })).toEqual({});
    }
  });

  it('forgets the last directory when asked with an empty string', () => {
    // Removing the last project sends this. A kept last directory would be
    // turned back into a project on the next read and warmed at every start.
    const helpers = createTestHelpers();
    expect(helpers.sanitizeSettingsUpdate({ lastDirectory: '' })).toEqual({ lastDirectory: '' });
    expect(helpers.sanitizeSettingsUpdate({ lastDirectory: '/home/testuser/project' })).toEqual({ lastDirectory: '/home/testuser/project' });
    expect(helpers.sanitizeSettingsUpdate({ lastDirectory: 42 })).toEqual({});
  });

  it('round-trips section order and preserves it across unrelated writes', () => {
    const helpers = createTestHelpers();
    const changes = helpers.sanitizeSettingsUpdate({ workStatusSectionOrder: ['mcp', 'session', 'mcp', null, ''] });
    expect(changes.workStatusSectionOrder).toEqual(['mcp', 'session']);
    const saved = helpers.mergePersistedSettings({}, changes);
    const reloaded = helpers.formatSettingsResponse(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.workStatusSectionOrder).toEqual(['mcp', 'session']);
    const next = helpers.mergePersistedSettings(reloaded, helpers.sanitizeSettingsUpdate({ workStatusPanelEnabled: false }));
    expect(helpers.formatSettingsResponse(next).workStatusSectionOrder).toEqual(['mcp', 'session']);
    expect(helpers.sanitizeSettingsUpdate({ workStatusSectionOrder: 'bad' }).workStatusSectionOrder).toBeUndefined();
    expect(helpers.sanitizeSettingsUpdate({ workStatusSectionOrder: [] }).workStatusSectionOrder).toEqual([]);
  });
  it('round-trips telemetry opt-in with the hidden list and preserves it across unrelated writes', () => {
    const helpers = createTestHelpers();
    const legacy = helpers.sanitizeSettingsUpdate({ workStatusHiddenSections: [] });
    expect(legacy.workStatusHiddenSectionsExplicit).toBeUndefined();
    const changes = helpers.sanitizeSettingsUpdate({ workStatusHiddenSections: [], workStatusHiddenSectionsExplicit: true });
    const saved = helpers.mergePersistedSettings(legacy, changes);
    const reloaded = helpers.formatSettingsResponse(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.workStatusHiddenSections).toEqual([]);
    expect(reloaded.workStatusHiddenSectionsExplicit).toBe(true);
    const next = helpers.mergePersistedSettings(reloaded, helpers.sanitizeSettingsUpdate({ workStatusPanelEnabled: false }));
    expect(helpers.formatSettingsResponse(next).workStatusHiddenSectionsExplicit).toBe(true);
    expect(helpers.sanitizeSettingsUpdate({ workStatusHiddenSectionsExplicit: 'true' }).workStatusHiddenSectionsExplicit).toBeUndefined();
  });
  it('drops legacy defaultAgent on subsequent writes', () => {
    const helpers = createTestHelpers();
    const legacy = {
      defaultAgent: 'legacy-agent',
      projects: [{ id: 'proj-1', path: '/repo', defaultAgent: 'proj-agent' }],
    };
    const next = helpers.mergePersistedSettings(legacy, { themeId: 'dark' });
    expect(next.defaultAgent).toBeUndefined();
    expect(next.projects[0].defaultAgent).toBeUndefined();
  });
  it('imports from the packed ohpichamber tarball without escaping the published package', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'settings-helpers-pack-'));
    const packDir = join(tempRoot, 'pack');
    const extractDir = join(tempRoot, 'extract');

    try {
      mkdirSync(packDir);
      mkdirSync(extractDir);
      execFileSync('npm', ['pack', '--silent', '--pack-destination', packDir], {
        cwd: packagesWebDir,
        stdio: 'pipe',
      });

      const tarballName = readdirSync(packDir).find((entry) => entry.endsWith('.tgz'));
      expect(tarballName).toBeTruthy();

      execFileSync('tar', ['-xzf', join(packDir, tarballName), '-C', extractDir], {
        stdio: 'pipe',
      });
      // An install resolves the package's declared dependencies (zod and the
      // rest) from node_modules; only relative imports must stay inside it.
      // Mirror the workspace layout: package-local modules first, then the
      // hoisted root ones.
      const linkModules = (from, to) => {
        if (existsSync(from)) symlinkSync(from, to, 'dir');
      };
      linkModules(join(packagesWebDir, 'node_modules'), join(extractDir, 'package', 'node_modules'));
      linkModules(join(packagesWebDir, '..', '..', 'node_modules'), join(extractDir, 'node_modules'));

      const extractedModule = await import(
        pathToFileURL(join(extractDir, 'package', 'server', 'lib', 'host', 'settings-helpers.js')).href
      );

      const helpers = extractedModule.createSettingsHelpers({
        normalizePathForPersistence: (value) => value,
        normalizeTunnelBootstrapTtlMs: (value) => value,
        normalizeTunnelSessionTtlMs: (value) => value,
        normalizeTunnelProvider: (value) => value,
        normalizeTunnelMode: (value) => value,
        normalizeOptionalPath: (value) => value,
        normalizeManagedRemoteTunnelHostname: (value) => value,
        normalizeManagedRemoteTunnelPresets: () => undefined,
        normalizeManagedRemoteTunnelPresetTokens: () => undefined,
        sanitizeTypographySizesPartial: () => undefined,
        normalizeStringArray: (input) => input,
        sanitizeModelRefs: () => undefined,
        sanitizeSkillCatalogs: () => undefined,
        sanitizeProjects: () => undefined,
      });

      expect(helpers.sanitizeSettingsUpdate({ inputHistoryScope: 'global' })).toEqual({
        inputHistoryScope: 'global',
      });
      expect(helpers.sanitizeSettingsUpdate({ inputHistoryScope: 'session' })).toEqual({
        inputHistoryScope: 'session',
      });
      expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 40 })).toEqual({
        inputHistoryLimit: 40,
      });
      expect(helpers.formatSettingsResponse({})).toMatchObject({
        inputHistoryScope: 'session',
        inputHistoryLimit: DEFAULT_INPUT_HISTORY_LIMIT,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it('accepts only booleans for draft starter visibility', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ draftStartersVisible: true })).toEqual({ draftStartersVisible: true });
    expect(helpers.sanitizeSettingsUpdate({ draftStartersVisible: false })).toEqual({ draftStartersVisible: false });
    expect(helpers.sanitizeSettingsUpdate({ draftStartersVisible: 'false' })).toEqual({});
  });

  it('sanitizes both Enter settings independently', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ enterToSend: true })).toEqual({ enterToSend: true });
    expect(helpers.sanitizeSettingsUpdate({ enterToSendConfigured: false })).toEqual({ enterToSendConfigured: false });
    expect(helpers.sanitizeSettingsUpdate({ enterToSend: 'true', enterToSendConfigured: 1 })).toEqual({});
  });

  it('sanitizes shared sidebar display preferences', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({
      sidebarProjectDisplayMode: 'single',
      sidebarListSessionGrouping: 'time',
      sidebarGrouping: 'project',
      sidebarKeepWorkInPlace: true,
      sidebarProjectSortOrder: 'z-a',
      sidebarShowWorkSection: false,
      sidebarShowPinnedSection: true,
      sidebarDetailedZoneRows: true,
    })).toEqual({
      sidebarProjectDisplayMode: 'single',
      sidebarListSessionGrouping: 'time',
      sidebarGrouping: 'project',
      sidebarKeepWorkInPlace: true,
      sidebarProjectSortOrder: 'z-a',
      sidebarShowWorkSection: false,
      sidebarShowPinnedSection: true,
      sidebarDetailedZoneRows: true,
    });
    expect(helpers.sanitizeSettingsUpdate({
      sidebarProjectDisplayMode: 'grid',
      sidebarListSessionGrouping: 'invalid',
      sidebarGrouping: 'invalid',
      sidebarKeepWorkInPlace: 'true',
      sidebarProjectSortOrder: 'random',
      sidebarShowWorkSection: 'false',
      sidebarShowPinnedSection: 'true',
      sidebarDetailedZoneRows: 'true',
    })).toEqual({});
  });

  it('keeps every interface language and nothing else', () => {
    const helpers = createTestHelpers();
    // The server cannot import `packages/ui`, so its list is compared with the
    // interface's own here: a language added there and not on the server would
    // never be saved, and would quietly reset again after a restart.
    const source = readFileSync(fileURLToPath(new URL('../../../../ui/src/lib/i18n/runtime.ts', import.meta.url)), 'utf8');
    const match = source.match(/export const LOCALES = \[([^\]]*)\]/);
    if (!match) throw new Error('Could not find LOCALES in the UI i18n runtime');
    const interfaceLocales = match[1].split(',').map((entry) => entry.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

    expect(interfaceLocales.length).toBeGreaterThan(1);
    for (const locale of interfaceLocales) {
      expect(helpers.sanitizeSettingsUpdate({ locale })).toEqual({ locale });
    }
    expect(helpers.sanitizeSettingsUpdate({ locale: 'xx' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ locale: ['uk'] })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ locale: 1 })).toEqual({});
  });

  it('persists valid tool JSON view modes', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ toolJsonViewMode: 'summary' })).toEqual({ toolJsonViewMode: 'summary' });
    expect(helpers.sanitizeSettingsUpdate({ toolJsonViewMode: 'formatted' })).toEqual({ toolJsonViewMode: 'formatted' });
    expect(helpers.sanitizeSettingsUpdate({ toolJsonViewMode: 'raw' })).toEqual({ toolJsonViewMode: 'raw' });
    expect(helpers.sanitizeSettingsUpdate({ toolJsonViewMode: 'unknown' })).toEqual({});
  });

  it('accepts only booleans for wide chat layout', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ wideChatLayoutEnabled: true })).toEqual({ wideChatLayoutEnabled: true });
    expect(helpers.sanitizeSettingsUpdate({ wideChatLayoutEnabled: false })).toEqual({ wideChatLayoutEnabled: false });
    expect(helpers.sanitizeSettingsUpdate({ wideChatLayoutEnabled: 'true' })).toEqual({});
  });

  it('accepts only booleans for collapsible user messages', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ collapsibleUserMessages: true })).toEqual({ collapsibleUserMessages: true });
    expect(helpers.sanitizeSettingsUpdate({ collapsibleUserMessages: false })).toEqual({ collapsibleUserMessages: false });
    expect(helpers.sanitizeSettingsUpdate({ collapsibleUserMessages: 'true' })).toEqual({});
  });

  it('sanitizes and returns the persisted editor font size', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ editorFontSize: 20.6 })).toEqual({ editorFontSize: 21 });
    expect(helpers.sanitizeSettingsUpdate({ editorFontSize: 8 })).toEqual({ editorFontSize: 9 });
    expect(helpers.sanitizeSettingsUpdate({ editorFontSize: 33 })).toEqual({ editorFontSize: 32 });
    expect(helpers.sanitizeSettingsUpdate({ editorFontSize: Number.NaN })).toEqual({});
    expect(helpers.formatSettingsResponse({ editorFontSize: 20 })).toMatchObject({ editorFontSize: 20 });
  });

  it('rejects removed settings: messageStreamTransport, defaultAgent, autoApplyAgentModel, sessionWorkKeepInGroup', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ messageStreamTransport: 'ws' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ defaultAgent: 'build' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ autoApplyAgentModel: true })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ sessionWorkKeepInGroup: true })).toEqual({});
  });

  it('accepts inputHistoryScope as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ inputHistoryScope: 'global' })).toEqual({
      inputHistoryScope: 'global',
    });
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryScope: 'session' })).toEqual({
      inputHistoryScope: 'session',
    });
  });

  it('accepts valid inputHistoryLimit values as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 1 })).toEqual({
      inputHistoryLimit: 1,
    });
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 40 })).toEqual({
      inputHistoryLimit: 40,
    });
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 100 })).toEqual({
      inputHistoryLimit: 100,
    });
  });

  it('rejects invalid inputHistoryLimit values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 0 })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 101 })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: 1.5 })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: '40' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: Number.NaN })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: Number.POSITIVE_INFINITY })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ inputHistoryLimit: Number.NEGATIVE_INFINITY })).toEqual({});
  });

  it('rejects invalid inputHistoryScope values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ inputHistoryScope: 'workspace' })).toEqual({});
  });

  it('defaults inputHistoryScope to session in formatted settings responses', () => {
    const helpers = createTestHelpers();

    expect(helpers.formatSettingsResponse({ inputHistoryScope: 'global' })).toMatchObject({
      inputHistoryScope: 'global',
    });
    expect(helpers.formatSettingsResponse({})).toMatchObject({
      inputHistoryScope: 'session',
    });
  });

  it('defaults missing inputHistoryLimit to 40 in formatted settings responses and preserves valid values', () => {
    const helpers = createTestHelpers();

    expect(helpers.formatSettingsResponse({})).toMatchObject({
      inputHistoryLimit: DEFAULT_INPUT_HISTORY_LIMIT,
    });
    expect(helpers.formatSettingsResponse({ inputHistoryLimit: 1 })).toMatchObject({
      inputHistoryLimit: 1,
    });
    expect(helpers.formatSettingsResponse({ inputHistoryLimit: 100 })).toMatchObject({
      inputHistoryLimit: 100,
    });
  });

  it('sanitizes the persisted terminal shell', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ terminalShell: ' ZSH ' })).toEqual({ terminalShell: 'zsh' });
    expect(helpers.sanitizeSettingsUpdate({ terminalShell: 'auto' })).toEqual({ terminalShell: 'auto' });
    expect(helpers.sanitizeSettingsUpdate({ terminalShell: '/bin/zsh' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ terminalShell: 'zsh -c whoami' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ terminalLoginShells: [' ZSH ', 'bash', 'zsh', '/bin/fish', 42] })).toEqual({
      terminalLoginShells: ['zsh', 'bash'],
    });
    expect(helpers.sanitizeSettingsUpdate({ terminalLoginShells: [] })).toEqual({ terminalLoginShells: [] });
  });

  it('accepts desktopLanAccessEnabled as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopLanAccessEnabled: true })).toEqual({
      desktopLanAccessEnabled: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopLanAccessEnabled: false })).toEqual({
      desktopLanAccessEnabled: false,
    });
  });

  it('accepts desktopKeepAwakeEnabled as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopKeepAwakeEnabled: true })).toEqual({
      desktopKeepAwakeEnabled: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopKeepAwakeEnabled: false })).toEqual({
      desktopKeepAwakeEnabled: false,
    });
  });

  it('accepts desktopMinimizeToTrayEnabled as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopMinimizeToTrayEnabled: true })).toEqual({
      desktopMinimizeToTrayEnabled: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopMinimizeToTrayEnabled: false })).toEqual({
      desktopMinimizeToTrayEnabled: false,
    });
  });

  it('accepts desktopMacMenuBarEnabled as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopMacMenuBarEnabled: true })).toEqual({
      desktopMacMenuBarEnabled: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopMacMenuBarEnabled: false })).toEqual({
      desktopMacMenuBarEnabled: false,
    });
    expect(helpers.formatSettingsResponse({ desktopMacMenuBarEnabled: false })).toMatchObject({
      desktopMacMenuBarEnabled: false,
    });
  });

  it('normalizes desktopWindowControlsPosition and maps legacy auto to right', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsPosition: 'left' })).toEqual({
      desktopWindowControlsPosition: 'left',
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsPosition: 'right' })).toEqual({
      desktopWindowControlsPosition: 'right',
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsPosition: 'auto' })).toEqual({
      desktopWindowControlsPosition: 'right',
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsPosition: 'center' })).toEqual({});
  });

  it('sanitizes chatFontSize and clamps within [50, 200]', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ chatFontSize: 120 })).toEqual({ chatFontSize: 120 });
    expect(helpers.sanitizeSettingsUpdate({ chatFontSize: 25 })).toEqual({ chatFontSize: 50 });
    expect(helpers.sanitizeSettingsUpdate({ chatFontSize: 250 })).toEqual({ chatFontSize: 200 });
    expect(helpers.sanitizeSettingsUpdate({ chatFontSize: 110.6 })).toEqual({ chatFontSize: 111 });
    expect(helpers.sanitizeSettingsUpdate({ chatFontSize: 'large' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ chatFontSize: NaN })).toEqual({});
  });

  it('sanitizes uiFontWeight and rejects unknown values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ uiFontWeight: 'regular' })).toEqual({ uiFontWeight: 'regular' });
    expect(helpers.sanitizeSettingsUpdate({ uiFontWeight: 'balanced' })).toEqual({ uiFontWeight: 'balanced' });
    expect(helpers.sanitizeSettingsUpdate({ uiFontWeight: 'strong' })).toEqual({ uiFontWeight: 'strong' });
    expect(helpers.sanitizeSettingsUpdate({ uiFontWeight: 'bold' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ uiFontWeight: 500 })).toEqual({});
  });

  it('sanitizes desktopWindowControlsStyle and rejects unknown values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsStyle: 'classic' })).toEqual({
      desktopWindowControlsStyle: 'classic',
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsStyle: 'traffic-lights' })).toEqual({
      desktopWindowControlsStyle: 'traffic-lights',
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsStyle: 'macos' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ desktopWindowControlsStyle: 'auto' })).toEqual({});
  });


  it('accepts desktopUiPassword as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopUiPassword: ' secret ' })).toEqual({
      desktopUiPassword: 'secret',
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopUiPassword: '' })).toEqual({
      desktopUiPassword: '',
    });
  });

  it('accepts mobileKeyboardMode as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: 'native' })).toEqual({
      mobileKeyboardMode: 'native',
    });
    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: 'resize-content' })).toEqual({
      mobileKeyboardMode: 'resize-content',
    });
    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: ' resize-content ' })).toEqual({
      mobileKeyboardMode: 'resize-content',
    });
  });

  it('rejects invalid mobileKeyboardMode values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: 'fixed-layout' })).toEqual({});
  });

  it('accepts collapsibleThinkingBlocks as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ collapsibleThinkingBlocks: true })).toEqual({
      collapsibleThinkingBlocks: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ collapsibleThinkingBlocks: false })).toEqual({
      collapsibleThinkingBlocks: false,
    });
  });

  it('accepts shortcut overrides as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({
      shortcutOverrides: {
        open_settings: 'mod+comma',
        new_chat: '__unassigned__',
        invalid: 123,
        empty: '',
      },
    })).toEqual({
      shortcutOverrides: {
        open_settings: 'mod+comma',
        new_chat: '__unassigned__',
      },
    });
  });

  it('preserves empty shortcut overrides when resetting all shortcuts', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ shortcutOverrides: {} })).toEqual({
      shortcutOverrides: {},
    });
  });


  it('accepts and rejects invalid Enter-to-send preference values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ enterToSend: true, enterToSendConfigured: true })).toEqual({
      enterToSend: true,
      enterToSendConfigured: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ enterToSend: false, enterToSendConfigured: true })).toEqual({
      enterToSend: false,
      enterToSendConfigured: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ enterToSend: false, enterToSendConfigured: false })).toEqual({
      enterToSend: false,
      enterToSendConfigured: false,
    });
    expect(helpers.sanitizeSettingsUpdate({ enterToSend: 'true' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ enterToSend: 1 })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ enterToSendConfigured: 'true' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ enterToSendConfigured: 1 })).toEqual({});
  });


  it('rejects non-boolean collapsibleThinkingBlocks values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ collapsibleThinkingBlocks: 'true' })).toEqual({});
    expect(helpers.sanitizeSettingsUpdate({ collapsibleThinkingBlocks: 1 })).toEqual({});
  });

  it('includes collapsibleThinkingBlocks in formatSettingsResponse', () => {
    const helpers = createTestHelpers();

    const response = helpers.formatSettingsResponse({ collapsibleThinkingBlocks: false });
    expect(response.collapsibleThinkingBlocks).toBe(false);

    const responseTrue = helpers.formatSettingsResponse({ collapsibleThinkingBlocks: true });
    expect(responseTrue.collapsibleThinkingBlocks).toBe(true);
  });

  it('defaults collapsibleThinkingBlocks to true in formatSettingsResponse when absent', () => {
    const helpers = createTestHelpers();

    const response = helpers.formatSettingsResponse({});
    expect(response.collapsibleThinkingBlocks).toBe(true);
  });

  it('leaves an unchosen showReasoningTraces to the client default instead of answering false', () => {
    const helpers = createTestHelpers();

    // An absent key means the profile never chose. The client's own default
    // (`packages/ui/src/stores/useUIStore.ts`) shows thinking blocks, and a
    // server answer of `false` used to override it on the first sync, which
    // hid reasoning entirely on a fresh data directory.
    const response = helpers.formatSettingsResponse({});
    expect(response).not.toHaveProperty('showReasoningTraces');

    // A stored choice still round-trips, both ways.
    expect(helpers.formatSettingsResponse({ showReasoningTraces: false }).showReasoningTraces).toBe(false);
    expect(helpers.formatSettingsResponse({ showReasoningTraces: true }).showReasoningTraces).toBe(true);
  });

  it('includes transient desktop LAN access runtime status in desktop settings response', () => {
    const helpers = createTestHelpers();
    const previousRuntime = process.env.OPENCHAMBER_RUNTIME;
    const previousActive = process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_ACTIVE;
    const previousReason = process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_BLOCKED_REASON;
    try {
      process.env.OPENCHAMBER_RUNTIME = 'desktop';
      process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_ACTIVE = 'false';
      process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_BLOCKED_REASON = 'missing-password';

      const response = helpers.formatSettingsResponse({ desktopLanAccessEnabled: true });
      expect(response.desktopLanAccessActive).toBe(false);
      expect(response.desktopLanAccessBlockedReason).toBe('missing-password');
    } finally {
      if (typeof previousRuntime === 'string') process.env.OPENCHAMBER_RUNTIME = previousRuntime;
      else delete process.env.OPENCHAMBER_RUNTIME;
      if (typeof previousActive === 'string') process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_ACTIVE = previousActive;
      else delete process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_ACTIVE;
      if (typeof previousReason === 'string') process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_BLOCKED_REASON = previousReason;
      else delete process.env.OPENCHAMBER_DESKTOP_LAN_ACCESS_BLOCKED_REASON;
    }
  });

  describe('previously-dropped model selector persistence fields', () => {
    it('round-trips hiddenModels through the sanitizer', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      const input = [
        { providerID: 'anthropic', modelID: 'claude-opus-4' },
        { providerID: 'openai', modelID: 'gpt-5' },
      ];

      expect(helpers.sanitizeSettingsUpdate({ hiddenModels: input })).toEqual({
        hiddenModels: input,
      });
    });

    it('handles empty hiddenModels the same way as empty favoriteModels', () => {
      const helpers = createTestHelpersWithRealSanitizers();

      const hiddenResult = helpers.sanitizeSettingsUpdate({ hiddenModels: [] });
      const favoriteResult = helpers.sanitizeSettingsUpdate({ favoriteModels: [] });

      expect(hiddenResult.hiddenModels).toEqual([]);
      expect(favoriteResult.favoriteModels).toEqual([]);
      expect(hiddenResult.hiddenModels).toEqual(favoriteResult.favoriteModels);
    });

    it('keeps custom provider icons it knows and drops the rest entry by entry', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      expect(helpers.sanitizeSettingsUpdate({
        customProviderIcons: { 'campus-llm': 'cloud', other: 'rocket', '': 'server', local: 'ai' },
      })).toEqual({ customProviderIcons: { 'campus-llm': 'cloud', local: 'ai' } });
    });

    it('round-trips favoriteAgents as a string array', () => {
      const helpers = createTestHelpersWithRealSanitizers();

      expect(helpers.sanitizeSettingsUpdate({ favoriteAgents: ['build', 'incident'] })).toEqual({
        favoriteAgents: ['build', 'incident'],
      });
    });

    it('rejects garbage hiddenModels input the same way sanitizeModelRefs rejects bad refs', () => {
      const helpers = createTestHelpersWithRealSanitizers();

      expect(helpers.sanitizeSettingsUpdate({ hiddenModels: 'not-an-array' })).toEqual({});
      expect(helpers.sanitizeSettingsUpdate({ hiddenModels: null })).toEqual({});
      expect(helpers.sanitizeSettingsUpdate({ hiddenModels: 123 })).toEqual({});
      expect(
        helpers.sanitizeSettingsUpdate({
          hiddenModels: [
            { providerID: 'anthropic' },
            { modelID: 'gpt-5' },
            'not-an-object',
            null,
            { providerID: '  ', modelID: 'x' },
            { providerID: 'openai', modelID: '' },
          ],
        })
      ).toEqual({ hiddenModels: [] });
    });

    it('persists only boolean system prompt optimization values', () => {
      const helpers = createTestHelpersWithRealSanitizers();

    });

    it('survives a full settings.json payload containing the model selector fields (regression)', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      const payload = {
        themeId: 'default',
        hiddenModels: [
          { providerID: 'anthropic', modelID: 'claude-opus-4' },
          { providerID: 'openai', modelID: 'gpt-5' },
        ],
        favoriteModels: [{ providerID: 'anthropic', modelID: 'claude-haiku-4' }],
        recentModels: [{ providerID: 'openai', modelID: 'gpt-5' }],
      };

      const sanitized = helpers.sanitizeSettingsUpdate(payload);

      expect(sanitized.hiddenModels).toEqual(payload.hiddenModels);
      expect(sanitized.favoriteModels).toEqual(payload.favoriteModels);
      expect(sanitized.recentModels).toEqual(payload.recentModels);
    });
  });

  describe('permission policy persistence', () => {
    it('keeps the Host-owned per-session policy instead of dropping it', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      const policy = { sessions: { ses_a: 'safety', ses_b: 'ask', ses_legacy: true }, revision: 4 };
      expect(helpers.sanitizeSettingsUpdate({ permissionAutoAccept: policy })).toEqual({ permissionAutoAccept: policy });
      // The registry is the write gate: the key survives the registry filter
      // that the sanitizer applies last, so a restart reads the policy back.
      expect(helpers.sanitizeSettingsUpdate({ permissionAutoAccept: { sessions: {}, revision: 0 } }))
        .toEqual({ permissionAutoAccept: { sessions: {}, revision: 0 } });
    });

    it('normalizes the policy shape and drops entries that are neither a mode nor a boolean', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      expect(helpers.sanitizeSettingsUpdate({
        permissionAutoAccept: {
          sessions: { ses_a: 'auto', ses_b: 'always', '': 'ask', ses_c: 1 },
          revision: 2.5,
        },
      })).toEqual({ permissionAutoAccept: { sessions: { ses_a: 'auto' }, revision: 0 } });
      expect(helpers.sanitizeSettingsUpdate({ permissionAutoAccept: { sessions: {} }, permissionDefaultMode: 'auto' }))
        .toEqual({ permissionAutoAccept: { sessions: {}, revision: 0 }, permissionDefaultMode: 'auto' });
      expect(helpers.sanitizeSettingsUpdate({ permissionAutoAccept: 'on' })).toEqual({});
      expect(helpers.sanitizeSettingsUpdate({ permissionAutoAccept: ['on'] })).toEqual({});
    });
  });

  describe('commit-message control persistence', () => {
    it('round-trips each control and keeps absent distinct from false', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      // Missing generation is the default-on case the UI resolves; the server
      // must not invent a value for it.
      expect(helpers.sanitizeSettingsUpdate({ gitmojiEnabled: true })).toEqual({ gitmojiEnabled: true });
      for (const key of ['generateCommitMessages', 'commitMessageReasoning', 'commitMessageNotes', 'commitMessageChangeId']) {
        expect(helpers.sanitizeSettingsUpdate({ [key]: true })).toEqual({ [key]: true });
        expect(helpers.sanitizeSettingsUpdate({ [key]: false })).toEqual({ [key]: false });
        expect(helpers.sanitizeSettingsUpdate({ [key]: 'true' })).toEqual({});
      }
    });
  });

  describe('session retention settings persistence', () => {
    it('round-trips archived-only retention and rejects non-boolean values', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      for (const sessionRetentionOnlyArchived of [true, false]) {
        expect(helpers.sanitizeSettingsUpdate({ sessionRetentionOnlyArchived })).toEqual({ sessionRetentionOnlyArchived });
      }
      expect(helpers.sanitizeSettingsUpdate({ sessionRetentionOnlyArchived: 'true' })).toEqual({});
      expect(helpers.sanitizeSettingsUpdate({ sessionRetentionOnlyArchived: null })).toEqual({});
    });
    it('round-trips sessionRetentionAction archive and delete through the sanitizer', () => {
      const helpers = createTestHelpersWithRealSanitizers();

      expect(helpers.sanitizeSettingsUpdate({ sessionRetentionAction: 'archive' })).toEqual({
        sessionRetentionAction: 'archive',
      });
      expect(helpers.sanitizeSettingsUpdate({ sessionRetentionAction: 'delete' })).toEqual({
        sessionRetentionAction: 'delete',
      });
    });

    it('rejects invalid sessionRetentionAction values', () => {
      const helpers = createTestHelpersWithRealSanitizers();

      expect(helpers.sanitizeSettingsUpdate({ sessionRetentionAction: 'remove' })).toEqual({});
      expect(helpers.sanitizeSettingsUpdate({ sessionRetentionAction: true })).toEqual({});
    });

    it('survives a full settings payload containing sessionRetentionAction (regression)', () => {
      const helpers = createTestHelpersWithRealSanitizers();
      const payload = {
        autoDeleteEnabled: true,
        autoDeleteAfterDays: 60,
        sessionRetentionAction: 'delete',
        sessionRetentionOnlyArchived: true,
      };

      const sanitized = helpers.sanitizeSettingsUpdate(payload);

      expect(sanitized.autoDeleteEnabled).toBe(true);
      expect(sanitized.autoDeleteAfterDays).toBe(60);
      expect(sanitized.sessionRetentionAction).toBe('delete');
      expect(sanitized.sessionRetentionOnlyArchived).toBe(true);
    });
  });
});

describe('settings registry gate', () => {
  const registryPath = join(dirname(testFilePath), 'settings-registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const persistableKeys = Object.entries(registry.fields)
    .filter(([, field]) => !field.computed && !field.local && field.owner !== 'desktop-shell')
    .map(([key]) => key);

  // One valid value per persistable registry key. The test below fails when a
  // key is added to the registry without a line here, and when the sanitizer
  // stops accepting a key the registry still lists — that is the drift the
  // registry exists to end.
  const validValues = {
    themeId: 'openchamber-dark', locale: 'zh-CN', useSystemTheme: true, themeVariant: 'dark', lightThemeId: 'openchamber-light', darkThemeId: 'openchamber-dark',
    splashBgLight: '#fff', splashFgLight: '#000', splashBgDark: '#000', splashFgDark: '#fff',
    lastDirectory: '/home/testuser/project', homeDirectory: '/home/testuser',
    projects: [{ id: 'p', path: '/home/testuser/project' }], activeProjectId: 'p',
    pinnedDirectories: ['/home/testuser/project'],
    desktopLanAccessEnabled: true, desktopKeepAwakeEnabled: true, desktopMinimizeToTrayEnabled: true, desktopMacMenuBarEnabled: true, desktopLinuxNativeFrame: true, sidebarShowChatsSection: false,
    desktopUiPassword: 'secret', githubClientId: 'client', githubScopes: 'repo', gitlabClientId: 'gitlab-client', skillCatalogs: [{ id: 'c', label: 'C', source: 'https://x' }],
    defaultGitIdentityId: 'global', permissionDefaultMode: 'safety', messageSearchEnabled: true, messageSearchReasoningEnabled: true,
    // The Host-owned per-session policy: modes for current clients, booleans
    // from before the modes, and the revision the runtime increments.
    permissionAutoAccept: { sessions: { 'ses_root': 'safety', 'ses_legacy': true }, revision: 3 },
    sessionGoalChecker: 'classifier', sessionGoalMaxAutoTurns: 20,
    planModeAllowAgents: true,
    agentControlToolEnabled: true, agentWebToolEnabled: true, browserProvider: 'builtin', agentNotifyToolEnabled: true, isolatedSpacesEnabled: true, isolatedSpacesIdleStop: { enabled: true, hours: 4 },
    // Registry keys the settings-registry regeneration added; the gate fails
    // without a fixture line for each, and these are their real shapes.
    openLinksInBrowserPanel: true, liveBrowserTabLimit: 4, openTrackerLinksOnBoard: true, layoutAnimations: true,
    worktreeArchiveOnDoneEnabled: true,
    agentKnowledgeToolEnabled: true, agentRenderToolEnabled: true,
    agentWorkflowToolEnabled: true, mobileReturnKeySends: true,
    smallModelVariant: 'high',
    autoDeleteEnabled: true, autoDeleteAfterDays: 30, sessionRetentionOnlyArchived: false, sessionRetentionAction: 'archive', mergedWorktreeCleanupEnabled: true, terminalShell: 'zsh', terminalLoginShells: ['zsh'],
    openInAppId: 'vscode', dictationEnabled: true, sttProvider: 'local', sttServerUrl: 'http://localhost:8001/v1', sttModel: 'm', sttLocalModel: 'm', sttLanguage: 'en',
    tunnelProvider: 'cloudflare', tunnelMode: 'quick', tunnelHttpsPort: 8443, tunnelBootstrapTtlMs: 600000, tunnelSessionTtlMs: 86400000, managedLocalTunnelConfigPath: '/tmp/x',
    managedRemoteTunnelHostname: 'x.example', managedRemoteTunnelToken: 'token', managedRemoteTunnelPresets: [{ id: 'a', name: 'A', hostname: 'a.example' }],
    managedRemoteTunnelPresetTokens: { a: 'token' },
    sidebarProjectDisplayMode: 'all', sidebarListSessionGrouping: 'project', sidebarGrouping: 'time', sidebarKeepWorkInPlace: true, sidebarProjectSortOrder: 'manual', sidebarShowWorkSection: true, sidebarShowPinnedSection: true, sidebarDetailedZoneRows: true,
    workStatusPanelEnabled: true, workStatusHiddenSections: ['mcp'], workStatusHiddenSectionsExplicit: true, workStatusSectionOrder: ['mcp', 'session'],
    showReasoningTraces: true, streamingAutoFollowEnabled: true, collapsibleThinkingBlocks: true, expandReasoningWhileStreaming: true, showTextJustificationActivity: true,
    chatRenderMode: 'live', activityRenderMode: 'summary', mermaidRenderingMode: 'svg', userMessageRenderingMode: 'markdown', collapsibleUserMessages: true,
    stickyUserHeader: true, promptNavigatorEnabled: true, wideChatLayoutEnabled: true, showSplitAssistantMessageActions: true, showToolFileIcons: true,
    codeBlockLineWrap: true, tableCellWrap: true, copyMessagesAsPlainText: true, showTurnChangedFiles: true, toolJsonViewMode: 'raw',
    timeFormatPreference: '24h', weekStartPreference: 'monday', diffLayoutPreference: 'inline', diffWrapLines: true, diffHideWhitespace: true,
    gitChangesViewMode: 'tree', gitmojiEnabled: true, defaultFileViewerPreview: true, directoryShowHidden: true, filesViewShowGitignored: true,
    generateCommitMessages: true, commitMessageReasoning: false, commitMessageNotes: false, commitMessageChangeId: false,
    fileEditorKeymap: 'vim', fileEditorVimMappings: 'inoremap jk <Esc>', autoSaveEnabled: true, confirmFileTreeMove: false, autoCreateWorktree: true, terminalCloseOnExit: true, sessionTabsEnabled: true,
    allowPromptingSubagentSessions: true, inputSpellcheckEnabled: true, enterToSend: true, enterToSendConfigured: true, persistChatDraft: true,
    largeTextPasteBehavior: 'attach', followUpBehavior: 'steer', queueModeEnabled: true, inputHistoryScope: 'global', inputHistoryLimit: 40,
    draftStarters: [{ type: 'command', name: 'plan-feature' }], draftStartersVisible: true, draftStartersCraftGoalAdded: true, draftStartersScheduleTaskAdded: true,
    fontSize: 100, chatFontSize: 100, terminalFontSize: 14, editorFontSize: 14, uiFont: 'inter', monoFont: 'jetbrains-mono', customUiFont: 'Maple Mono NF CN', customMonoFont: 'Maple Mono', uiFontWeight: 'regular', padding: 100,
    shortcutOverrides: { 'chat.send': 'mod+enter' },
    defaultModel: 'anthropic/claude', defaultVariant: 'high', zenModel: 'zen/model',
    defaultSessionMode: 'main',
    favoriteModels: [{ providerID: 'anthropic', modelID: 'claude' }], hiddenModels: [{ providerID: 'openai', modelID: 'gpt' }],
    recentModels: [{ providerID: 'anthropic', modelID: 'claude' }], lastSelectedModel: 'anthropic/claude', favoriteAgents: ['build'], providerOrder: ['anthropic'],
    sessionRecapEnabled: true, suggestionGenerator: 'session', sessionWorkEnabled: true, sessionWorkAutoOpen: true, sessionReviewOfferEnabled: true, sessionGoalDefaultBudgetEnabled: true, sessionGoalDefaultBudget: 5,
    maxLastMessageLength: 200, showDeletionDialog: true,
    nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnSubtasks: true, notifyOnCompletion: true, notifyOnError: true, notifyOnQuestion: true, notifyOnPullRequests: true,
    notificationTemplates: { completion: { title: 't', message: 'm' } },
    usageDisplayMode: 'usage', usageDropdownProviders: ['anthropic'], usageSelectedModels: { anthropic: ['claude'] },
    usageExpandedFamilies: { anthropic: ['f'] },
    pwaAppName: 'OhPiChamber', pwaOrientation: 'portrait', mobileKeyboardMode: 'native', desktopWindowControlsPosition: 'left', desktopWindowControlsStyle: 'classic',
    inputBarOffset: 10,
    customProviderIcons: { 'campus-llm': 'cloud' },
    layoutAnimations: true, openLinksInBrowserPanel: false, liveBrowserTabLimit: 8,
    openTrackerLinksOnBoard: true, worktreeArchiveOnDoneEnabled: false,
    agentKnowledgeToolEnabled: false, agentRenderToolEnabled: false, agentWorkflowToolEnabled: false,
    mobileReturnKeySends: true,
    responseStyleInstruction: 'Keep replies short.',
    responseStyleEnabled: true, responseStylePreset: 'concise', responseStyleCustomInstructions: 'Be brief.',
    // Registry keys whose server branch is a pass-through: the registry parser
    // owns their shape, so the fixture is the client's own write shape.
    sessionRetentionIncludeInWork: true,
    dictationAutoSend: true, sttEndpointPath: '/speech_to_text', sttCorrectTranscript: true,
    sidebarSections: [{ kind: 'custom', id: 'g', name: 'Clients', grouping: 'project', links: [] }],
    sidebarPinLists: [{ id: 'pinned', name: 'Pinned' }], sidebarHiddenSections: ['work'],
    sessionTabsPerWorkspace: true, selectionApprovalText: 'Looks good.', customProviderLogos: { acme: { mime: 'image/png', updatedAt: 1 } },
    lastUsedEfforts: { 'anthropic/claude': 'high' },
  };

  it('accepts a valid value for every persistable registry key (no server-side drift)', () => {
    // The shared test helpers stub the injected list sanitizers to `undefined`
    // (they are covered by their own suites); here they must pass values through
    // so a key is judged by the sanitizer's own branch, not by a stub.
    const helpers = createSettingsHelpers({
      normalizePathForPersistence: (value) => value,
      normalizeTunnelBootstrapTtlMs: (value) => value,
      normalizeTunnelSessionTtlMs: (value) => value,
      normalizeTunnelProvider: (value) => value,
      normalizeTunnelMode: (value) => value,
      normalizeOptionalPath: (value) => value,
      normalizeManagedRemoteTunnelHostname: (value) => value,
      normalizeManagedRemoteTunnelPresets: (value) => value,
      normalizeManagedRemoteTunnelPresetTokens: (value) => value,
      normalizeStringArray: (input) => input,
      sanitizeModelRefs: (value) => value,
      sanitizeSkillCatalogs: (value) => value,
      sanitizeProjects: (value) => value,
    });
    const missingFixture = persistableKeys.filter((key) => !(key in validValues));
    expect(missingFixture).toEqual([]);

    const rejected = persistableKeys.filter((key) => {
      const result = helpers.sanitizeSettingsUpdate({ [key]: validValues[key] });
      // `queueModeEnabled` is absorbed into `followUpBehavior` on purpose.
      const landedAs = key === 'queueModeEnabled' ? 'followUpBehavior' : key;
      return result[landedAs] === undefined;
    });
    expect(rejected).toEqual([]);
  });

  it('drops keys the registry does not list, computed flags, and desktop-shell-owned keys', () => {
    const helpers = createTestHelpers();
    expect(helpers.sanitizeSettingsUpdate({
      markdownDisplayMode: 'raw',
      toolCallExpansion: 'collapsed',
      expandedEditorToolbar: true,
      typographySizes: { base: 14 },
      gitProviderId: 'anthropic',
      gitModelId: 'claude',
      memoryLimitHistorical: 200,
      desktopHosts: [],
      notARealKey: 1,
    })).toEqual({});
  });

  it('never returns secret keys from a formatted response', () => {
    const helpers = createTestHelpers();
    const secretKeys = Object.entries(registry.fields).filter(([, field]) => field.secret).map(([key]) => key);
    expect(secretKeys).toContain('managedRemoteTunnelToken');
    expect(secretKeys).toContain('desktopUiPassword');
    expect(secretKeys).toContain('managedRemoteTunnelPresetTokens');
    const response = helpers.formatSettingsResponse({
      managedRemoteTunnelToken: 'token',
      desktopUiPassword: 'pw',
      managedRemoteTunnelPresetTokens: { a: 'tok' },
      themeId: 'x',
    });
    for (const key of secretKeys) {
      expect(response).not.toHaveProperty(key);
    }
    expect(response.hasManagedRemoteTunnelToken).toBe(true);
    expect(response.hasDesktopUiPassword).toBe(true);
    expect(helpers.formatSettingsResponse({ desktopUiPassword: '' }).hasDesktopUiPassword).toBe(false);
  });

  it('accepts the newly shared profile fields', () => {
    const helpers = createTestHelpersWithRealSanitizers();
    for (const mode of ['ask', 'attach', 'inline', 'inline-double-paste']) {
      const accepted = helpers.sanitizeSettingsUpdate({ largeTextPasteBehavior: mode });
      expect(accepted).toEqual({ largeTextPasteBehavior: mode });
      expect(helpers.formatSettingsResponse(helpers.mergePersistedSettings({}, accepted))).toMatchObject({ largeTextPasteBehavior: mode });
    }
    expect(helpers.sanitizeSettingsUpdate({
      providerOrder: ['b', 'a', 'a'],
      diffWrapLines: true,
      persistChatDraft: false,
      largeTextPasteBehavior: 'inline',
      fileEditorKeymap: 'vim',
      allowPromptingSubagentSessions: true,
      codeBlockLineWrap: true,
      streamingAutoFollowEnabled: false,
      autoSaveEnabled: false,
    })).toEqual({
      providerOrder: ['b', 'a'],
      diffWrapLines: true,
      persistChatDraft: false,
      largeTextPasteBehavior: 'inline',
      fileEditorKeymap: 'vim',
      allowPromptingSubagentSessions: true,
      codeBlockLineWrap: true,
      streamingAutoFollowEnabled: false,
      autoSaveEnabled: false,
    });
    expect(helpers.sanitizeSettingsUpdate({ largeTextPasteBehavior: 'maybe', fileEditorKeymap: 'emacs' })).toEqual({});
  });
});
