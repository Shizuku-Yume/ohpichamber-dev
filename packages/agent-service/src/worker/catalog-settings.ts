import {
  JsonValueSchema,
  OMP_SETTING_IDS,
  OmpSettingIdSchema,
  OmpSettingSchema,
  OmpSettingsStateSchema,
  type OmpSetting,
  type OmpSettingsState,
  type OmpSettingsUpdateRequest,
} from '@openchamber/agent-contract';
import { orderedSettings } from '@oh-my-pi/pi-coding-agent/config/all-settings';
import type { AnySetting } from '@oh-my-pi/pi-coding-agent/config/registry';
import { ProjectionError } from '../projection/journal.ts';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';

/**
 * Contract-driven allowlist of OMP settings exposed through the API.
 * All setting definitions come from the pinned @oh-my-pi/pi-coding-agent package
 * and are constrained by OMP_SETTING_IDS in @openchamber/agent-contract.
 */
const OMP_CATALOG_SETTING_IDS = OMP_SETTING_IDS;
const allowlist = new Set<string>(OMP_CATALOG_SETTING_IDS);
const byId = new Map<string, AnySetting>();

/**
 * The settings route is a narrow view over OMP's own registry. It never
 * declares a second schema: ids, types, defaults, enum values and UI metadata
 * come from the pinned package, and only the ids in `OMP_SETTING_IDS` are
 * readable or writable.
 */
function handle(id: string): AnySetting {
  if (!allowlist.has(id)) throw new ProjectionError(400, 'INVALID_REQUEST', `OMP setting ${id} is not exposed`);
  let setting = byId.get(id);
  if (setting === undefined) {
    setting = orderedSettings().find(candidate => candidate.id === id);
    if (setting === undefined) throw new ProjectionError(503, 'INTERNAL_ERROR', `OMP setting ${id} is unavailable`);
    if (setting.isCredential) throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', `OMP setting ${id} is credential-backed`);
    byId.set(id, setting);
  }
  return setting;
}

function descriptor(setting: AnySetting, settings: Settings): OmpSetting {
  const ui = setting.ui;
  const options = ui?.options;
  const list = Array.isArray(options)
    ? options.map(option => ({ value: option.value, label: option.label, description: option.description }))
    : undefined;
  const rawValue = setting.layered(settings);
  const rawDefault = setting.definition.default;
  const descriptor: OmpSetting = {
    id: OmpSettingIdSchema.parse(setting.id),
    type: setting.definition.type,
    value: rawValue === undefined ? null : JsonValueSchema.parse(rawValue),
    default: rawDefault === undefined ? null : JsonValueSchema.parse(rawDefault),
    configured: setting.isConfigured(settings),
  };
  if (setting.enumValues !== undefined) descriptor.enumValues = [...setting.enumValues];
  if (list !== undefined) descriptor.options = list;
  if (ui?.label !== undefined) descriptor.label = ui.label;
  if (ui?.description !== undefined) descriptor.description = ui.description;
  if (ui?.group !== undefined) descriptor.group = ui.group;
  if (ui?.tab !== undefined) descriptor.tab = ui.tab;
  return OmpSettingSchema.parse(descriptor);
}

export class NativeSettings {
  constructor(private readonly settings: Settings) {}

  async read(workspaceId: string, revision: string): Promise<OmpSettingsState> {
    await this.settings.reloadFromDisk();
    return OmpSettingsStateSchema.parse({
      workspaceId, revision, settings: OMP_SETTING_IDS.map(id => descriptor(handle(id), this.settings)),
    });
  }

  async write(workspaceId: string, revision: string, request: OmpSettingsUpdateRequest): Promise<OmpSettingsState> {
    await this.settings.reloadFromDisk();
    // Validate every value against the pinned definition before changing any
    // layer. `assertWritable` runs OMP's own validate/normalize checks, so the
    // route cannot invent a looser schema for numbers, enums, records or arrays.
    for (const change of request.changes) {
      const setting = handle(change.id);
      if (change.value === null) continue;
      try { setting.assertWritable(change.value); }
      catch (error) {
        throw new ProjectionError(400, 'INVALID_REQUEST', error instanceof Error ? error.message : `Invalid value for ${change.id}`);
      }
    }
    try {
      for (const change of request.changes) {
        const setting = handle(change.id);
        if (change.value === null) setting.unset(this.settings);
        else setting.set(this.settings, change.value);
      }
    } catch (error) {
      // `set`/`unset` can still fail after validation if a definition normalizes
      // or stages later. Reload so a partial staged write is retried/read from
      // disk instead of staying invisible to this instance.
      await this.settings.reloadFromDisk().catch(() => undefined);
      if (error instanceof ProjectionError) throw error;
      throw new ProjectionError(400, 'INVALID_REQUEST', error instanceof Error ? error.message : 'OMP settings could not be written');
    }
    try { await this.settings.flush(); }
    catch {
      // OMP keeps failed writes pending and retries them on the next flush;
      // reloading here retries that flush. Report the failure instead of
      // claiming success; the next read reflects whichever state persisted.
      await this.settings.reloadFromDisk().catch(() => undefined);
      throw new ProjectionError(503, 'INTERNAL_ERROR', 'OMP settings could not be persisted');
    }
    await this.settings.reloadFromDisk();
    return OmpSettingsStateSchema.parse({
      workspaceId, revision, settings: OMP_SETTING_IDS.map(id => descriptor(handle(id), this.settings)),
    });
  }
}
