// Host settings HTTP contract.
//
// `GET` and `PUT /api/config/settings` expose the scoped settings document the
// Host owns; they are not an agent runtime endpoint. Registration lives here so
// Web, PWA, Electron, hosted mobile and Capacitor share one Host-owned route
// while `settings-runtime.js` keeps persistence and `settings-helpers.js` keeps
// validation. Callers inject the composed owner functions; this module only
// translates requests and failures into the established HTTP responses.
import { settingsSurfaceOf } from './settings-files.js';

export const registerSettingsRoutes = (app, dependencies) => {
  const {
    readSettingsFromDiskMigrated,
    formatSettingsResponse,
    persistSettings,
  } = dependencies;

  app.get('/api/config/settings', async (req, res) => {
    try {
      const settings = await readSettingsFromDiskMigrated({ surface: settingsSurfaceOf(req) });
      res.json(formatSettingsResponse(settings));
    } catch (error) {
      console.error('Failed to read settings:', error);
      res.status(500).json({ error: 'Failed to read settings' });
    }
  });

  app.put('/api/config/settings', async (req, res) => {
    try {
      const updated = await persistSettings(req.body ?? {}, { surface: settingsSurfaceOf(req) });
      res.json(updated);
    } catch (error) {
      console.error('Failed to save settings:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });
};
