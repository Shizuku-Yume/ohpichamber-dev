import { z } from 'zod';
import type { FormattedSettings, SettingsDocument } from '../settings/settings-helpers.js';
import type { Application } from '../shared/http-contracts.js';
import { settingsSurfaceOf, type SettingsSurface } from './settings-files.js';

const SettingsUpdateBodySchema = z.looseObject({});

export interface SettingsRouteDependencies {
  readSettingsFromDiskMigrated: (options?: { surface?: SettingsSurface | null }) => Promise<SettingsDocument>;
  formatSettingsResponse: (settings: SettingsDocument) => FormattedSettings | SettingsDocument;
  persistSettings: (
    changes: SettingsDocument,
    options?: { surface?: SettingsSurface | null; preserveProjectIcons?: boolean },
  ) => Promise<FormattedSettings | SettingsDocument>;
  onSettingsUpdated?: ((settings: FormattedSettings | SettingsDocument) => Promise<void> | void) | undefined;
}

export const registerSettingsRoutes = (app: Application, dependencies: SettingsRouteDependencies): void => {
  const {
    readSettingsFromDiskMigrated,
    formatSettingsResponse,
    persistSettings,
    onSettingsUpdated,
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
      const changes = req.body == null ? {} : SettingsUpdateBodySchema.parse(req.body);
      const updated = await persistSettings(changes, { surface: settingsSurfaceOf(req) });
      if (onSettingsUpdated) {
        void Promise.resolve(onSettingsUpdated(updated)).catch(() => { });
      }
      res.json(updated);
    } catch (error) {
      console.error('Failed to save settings:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });
};
