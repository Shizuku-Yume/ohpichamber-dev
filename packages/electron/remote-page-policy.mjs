import { TRAY_LOCALE_DICTIONARIES } from './tray-locales.mjs';

// Payloads from remote renderers cross into the local Electron process. Keep
// this command allowlist here so IPC authorization and its tests share one policy.

const REMOTE_SAFE_COMMANDS = new Set([
  // Probes accept arbitrary URLs and credentials, so remote pages must not call them.
  'desktop_hosts_get',
  'desktop_new_window',
  'desktop_new_window_at_url',
  'desktop_new_window_for_host',
  'desktop_set_window_title',
  'desktop_set_window_theme',
  'desktop_set_close_tab_target',
  'desktop_is_window_fullscreen',
  'desktop_start_window_drag',
  'desktop_minimize_current_window',
  'desktop_toggle_current_window_maximized',
  'desktop_close_current_window',
  'desktop_get_current_window_state',
  'desktop_get_app_version',
  'desktop_get_lan_address',
  'desktop_capture_page_rect',
  'desktop_tray_update',
  'desktop_set_tray_locale',
]);

export const isRemoteSafeCommand = (command) => REMOTE_SAFE_COMMANDS.has(command);

const SPLASH_COLOR_PATTERN = /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([\d.,%\s/+-]*\))$/i;

export const isSplashColor = (value) => SPLASH_COLOR_PATTERN.test(String(value));

export const redactHostsConfigForRemote = (config) => ({
  ...config,
  hosts: config.hosts.map(({ clientToken: _clientToken, requestHeaders: _requestHeaders, ...host }) => host),
});

export const parseTrayLocale = (value) => (
  Object.keys(TRAY_LOCALE_DICTIONARIES).find((locale) => locale === value) ?? null
);
