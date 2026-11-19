// Re-register only an enabled login item (refreshing its path and args after updates or moves).
// Writing a disabled one is a no-op that macOS can reject with "Operation not permitted".
export const shouldRefreshLoginItemSettings = (currentSettings) => currentSettings?.openAtLogin === true;
