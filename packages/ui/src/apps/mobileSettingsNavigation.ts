import type { SettingsPageSlug } from '@/lib/settings/metadata';
import { resolveSettingsSlug } from '@/lib/settings/metadata';
import { useUIStore } from '@/stores/useUIStore';

export type MobileSettingsStage = 'nav' | 'page-content';

/**
 * Pages the phone's Settings surface can show. `home` is the nav stage, so a
 * deep link to `home` (or to any page listed here, which is the same list the
 * nav renders) opens the list rather than a page. `shortcuts` is keyboard-only
 * and the phone filters it out of the nav; guest `extensions` and `routing`
 * are availability-gated at render time; `routing` shows when the server offers it.
 */
export const MOBILE_SETTINGS_PAGES: readonly SettingsPageSlug[] = [
  'general',
  'appearance',
  'chat',
  'notifications',
  'sessions',
  'routing',
  'projects',
  'remote-instances',
  'tunnel',
  'git',
  'magic-prompts',
  'snippets',
  'agents',
  'model-roles',
  'commands',
  'mcp',
  'plugins',
  'skills.installed',
  'skills.catalog',
  'providers',
  'web-search',
  'tools',
  'memory',
  'omp',
  'behavior',
  'usage',
  'voice',
  'integrations',
  'about',
];

/**
 * The phone shows Settings as a fullscreen surface and never renders the
 * Settings dialog. Shared entry points still ask for the dialog, so a request
 * opens the surface: on the requested page when the phone shows it, otherwise
 * on the page list.
 */
export const connectMobileSettingsNavigation = (
  visiblePages: readonly string[],
  openSettings: (stage: MobileSettingsStage) => void,
): (() => void) => {
  const openRequestedSettings = (): void => {
    const ui = useUIStore.getState();
    if (!ui.isSettingsDialogOpen) return;
    ui.setSettingsDialogOpen(false);
    openSettings(visiblePages.includes(resolveSettingsSlug(ui.settingsPage)) ? 'page-content' : 'nav');
  };
  const unsubscribe = useUIStore.subscribe((state, previous) => {
    if (state.isSettingsDialogOpen && !previous.isSettingsDialogOpen) openRequestedSettings();
  });
  openRequestedSettings();
  return unsubscribe;
};
