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
]);

export const isRemoteSafeCommand = (command) => REMOTE_SAFE_COMMANDS.has(command);

// Splash colours are written into the splash page's <style>, and that page
// runs on the trusted openchamber-ui://app origin. Only a plain colour value
// is accepted: anything that could close the declaration is not.
const SPLASH_COLOR_PATTERN = /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([\d.,%\s/+-]*\))$/i;

export const isSplashColor = (value) => SPLASH_COLOR_PATTERN.test(String(value));

// A remote page may list the saved hosts (its host switcher), but the
// credentials of every host stay with local pages: one server must not read
// the tokens or auth headers the user saved for another.
export const redactHostsConfigForRemote = (config) => ({
  ...config,
  hosts: config.hosts.map(({ clientToken: _clientToken, requestHeaders: _requestHeaders, ...host }) => host),
});
