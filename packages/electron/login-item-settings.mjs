export const shouldUpdateLoginItemSettings = (preferredEnabled, currentSettings) => (
  typeof preferredEnabled === 'boolean'
  && currentSettings != null
  && preferredEnabled !== (currentSettings.openAtLogin === true)
);
