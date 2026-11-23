import {
  JsonObjectSchema,
  JsonValueSchema,
  OMP_POWER_CONDITIONS,
  OmpSettingIdSchema,
  OmpSettingSchema,
  OmpSettingsStateSchema,
  type OmpSetting,
  type OmpSettingsState,
  type OmpSettingsUpdateRequest,
} from '@openchamber/agent-contract';
import { orderedSettings } from '@oh-my-pi/pi-coding-agent/config/all-settings';
import { lookup, type AnySetting } from '@oh-my-pi/pi-coding-agent/config/registry';
import { isKindRole } from '@oh-my-pi/pi-coding-agent/config/model-roles';
import { parseRetryFallbackSelector } from '@oh-my-pi/pi-coding-agent/session/retry-fallback-chains';
import { cfgRetryFallbackChains } from '@oh-my-pi/pi-coding-agent/session/settings';
import './suggestion.ts';
import { ProjectionError } from '../projection/journal.ts';
import { OMP_SETTING_EXPOSED_IDS, OMP_SETTING_PLACEMENTS, presentOmpSetting } from './settings-ui.ts';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';

const byId = new Map<string, AnySetting>();

function linuxPowerBusAvailable(): boolean {
  if (process.env.DBUS_SYSTEM_BUS_ADDRESS) return true;
  try { return statSync('/var/run/dbus/system_bus_socket').isSocket(); }
  catch { return false; }
}

const RESET_POLICY_OVERRIDE = 'resetPolicyUsesSharedConfig';
const RETRY_CHAINS_OVERRIDE = 'retryChainsUseSharedConfig';
const DISCOVERY_OVERRIDE = 'discoveryUsesSharedConfig';
const COMPACTION_OVERRIDE = 'compactionThresholdsUseSharedConfig';

function recordEntries(value: unknown): [string, unknown][] {
  const record = JsonObjectSchema.safeParse(value);
  return record.success ? Object.entries(record.data) : [];
}

function retryChainUpdates(current: unknown, next: unknown): Map<string, string[] | undefined> {
  const before = new Map(recordEntries(current));
  const after = new Map(recordEntries(next));
  const updates = new Map<string, string[] | undefined>();
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const value = after.get(key);
    const previous = before.get(key);
    if (isDeepStrictEqual(previous, value)) continue;
    if (key === 'web') {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Web search owns its fallback chain');
    }
    if (value !== undefined && (!Array.isArray(value) || value.some((selector) => typeof selector !== 'string'))) {
      throw new ProjectionError(400, 'INVALID_REQUEST', 'A retry fallback chain must be an array of selectors');
    }
    if (Array.isArray(value) && !isKindRole(key) && value.some((selector) =>
      !(Array.isArray(previous) && previous.includes(selector)) && !parseRetryFallbackSelector(selector)
    )) {
      throw new ProjectionError(400, 'INVALID_REQUEST', 'Chat fallback entries require a provider/model selector or a provider wildcard');
    }
    updates.set(key, value as string[] | undefined);
  }
  return updates;
}

function inactiveWriteCondition(setting: AnySetting, settings: Settings) {
  if (hasCompactionOverride(setting, settings)) return COMPACTION_OVERRIDE;
  if (setting.id === 'retry.fallbackChains') {
    const provenance = settings.getProvenance(setting);
    const retry = settings.getProjectSettings().retry;
    if (
      (provenance !== 'default' && provenance !== 'global') ||
      (retry && typeof retry === 'object' && Object.hasOwn(retry, 'fallbackChains'))
    ) return RETRY_CHAINS_OVERRIDE;
  }
  const isPower = setting.id === 'power.sleepPrevention';
  const placement = OMP_SETTING_PLACEMENTS[setting.id];
  const isResetPolicy = placement?.type === 'page' && placement.page === 'usage' && placement.section === 'resets';
  const isDiscovery = placement?.type === 'page' && (placement.page === 'commands' || placement.page === 'skills');
  if (!isPower && !isResetPolicy && !isDiscovery) return undefined;
  const provenance = settings.getProvenance(setting);
  if (provenance !== 'global' && provenance !== 'default') {
    if (isPower) return OMP_POWER_CONDITIONS.usesSharedConfig;
    return isResetPolicy ? RESET_POLICY_OVERRIDE : DISCOVERY_OVERRIDE;
  }
  if (isPower && process.platform === 'linux' && !linuxPowerBusAvailable()) return OMP_POWER_CONDITIONS.backendAvailable;
  return undefined;
}

function hasCompactionOverride(setting: AnySetting, settings: Settings): boolean {
  if (setting.id !== 'compaction.modelThresholds' && setting.id !== 'compaction.modelThresholdsEnabled') return false;
  const provenance = settings.getProvenance(setting);
  if (provenance !== 'default') return provenance !== 'global';
  // OMP reports "default" for explicit project resets as well as absent keys.
  const project = settings.getProjectSettings().compaction;
  const key = setting.id === 'compaction.modelThresholds' ? 'modelThresholds' : 'modelThresholdsEnabled';
  return project === null || (typeof project === 'object' && Object.hasOwn(project, key));
}

/**
 * The settings route is a view over OMP's own registry. It never
 * declares a second schema: ids, types, defaults, enum values and UI metadata
 * come from the pinned package.
 */
function handle(id: string): AnySetting {
  let setting = byId.get(id);
  if (setting === undefined) {
    setting = lookup(id) ?? orderedSettings().find(candidate => candidate.id === id);
    if (setting === undefined) throw new ProjectionError(400, 'INVALID_REQUEST', `Unknown OMP setting ${id}`);
    if (setting.isCredential) throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', `OMP setting ${id} is credential-backed`);
    byId.set(id, setting);
  }
  return setting;
}

function descriptor(setting: AnySetting, settings: Settings): OmpSetting {
  const ui = setting.ui;
  const options = ui?.options;
  const list = Array.isArray(options)
    ? options.map(option => ({ value: String(option.value), label: option.label, description: option.description }))
    : undefined;
  const rawValue = setting.layered(settings);
  const rawDefault = setting.definition.default;
  const id = OmpSettingIdSchema.parse(setting.id);
  const presentation = presentOmpSetting(id, ui?.condition, settings);
  const descriptor: OmpSetting = {
    id,
    type: setting.definition.type,
    value: rawValue === undefined ? null : JsonValueSchema.parse(rawValue),
    default: rawDefault === undefined ? null : JsonValueSchema.parse(rawDefault),
    configured: setting.isConfigured(settings),
    placement: presentation.placement,
  };
  if (presentation.condition !== undefined) {
    descriptor.condition = presentation.condition;
    descriptor.conditionActive = presentation.conditionActive ?? true;
  }
  if (setting.enumValues !== undefined) descriptor.enumValues = setting.enumValues.filter(value => id !== 'edit.mode' || value !== 'magic');
  if (id === 'edit.mode' && descriptor.value === 'magic') descriptor.value = 'none';
  if (list !== undefined) descriptor.options = list;
  if (ui?.label !== undefined) descriptor.label = ui.label;
  if (ui?.description !== undefined) descriptor.description = ui.description;
  if (ui?.group !== undefined) descriptor.group = ui.group;
  if (ui?.tab !== undefined) descriptor.tab = ui.tab;
  const inactiveCondition = inactiveWriteCondition(setting, settings);
  if (inactiveCondition !== undefined) {
    descriptor.condition = inactiveCondition;
    descriptor.conditionActive = false;
  } else if (setting.id === 'retry.fallbackChains') {
    descriptor.condition = RETRY_CHAINS_OVERRIDE;
    descriptor.conditionActive = true;
  }
  return OmpSettingSchema.parse(descriptor);
}

/** The config file the settings write, shown so the page can offer it. OMP reads it inside the agent directory. */
const OMP_CONFIG_FILENAME = 'config.yml';

export class NativeSettings {
  private readonly configFilePath: string | undefined;

  constructor(private readonly settings: Settings, agentDirectory?: string) {
    this.configFilePath = agentDirectory === undefined ? undefined : join(agentDirectory, OMP_CONFIG_FILENAME);
  }

  private state(workspaceId: string, revision: string): OmpSettingsState {
    const all = orderedSettings();
    const exposed = all.filter(s => !s.isCredential && OMP_SETTING_EXPOSED_IDS.has(s.id));
    const data: OmpSettingsState = {
      workspaceId,
      revision,
      totalCount: all.length,
      settings: exposed.map(s => descriptor(s, this.settings)),
    };
    if (this.configFilePath !== undefined) {
      data.configPath = this.configFilePath;
    }
    return OmpSettingsStateSchema.parse(data);
  }

  async read(workspaceId: string, revision: string): Promise<OmpSettingsState> {
    await this.settings.reloadFromDisk();
    return this.state(workspaceId, revision);
  }

  async write(workspaceId: string, revision: string, request: OmpSettingsUpdateRequest): Promise<OmpSettingsState> {
    await this.settings.reloadFromDisk();
    // Only the settings a GUI owner draws or writes are exposed: any other id is
    // refused here, so the route cannot reach a setting no surface owns.
    for (const change of request.changes) {
      if (!OMP_SETTING_EXPOSED_IDS.has(change.id)) {
        throw new ProjectionError(400, 'INVALID_REQUEST', `OMP setting ${change.id} is not exposed`);
      }
    }
    // Validate every value against the pinned definition before changing any
    // layer. `assertWritable` runs OMP's own validate/normalize checks, so the
    // route cannot invent a looser schema for numbers, enums, records or arrays.
    let retryUpdates: Map<string, string[] | undefined> | undefined;
    for (const change of request.changes) {
      const setting = handle(change.id);
      const current = JsonValueSchema.parse(setting.layered(this.settings) ?? null);
      const isRetryChains = setting.id === cfgRetryFallbackChains.id;
      // OMP uses insertion order to break ties between matching model keys.
      if (change.expectedValue !== undefined && (!isDeepStrictEqual(current, change.expectedValue) ||
          (isRetryChains && !isDeepStrictEqual(recordEntries(current), recordEntries(change.expectedValue))))) {
        throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Native OMP setting changed on disk');
      }
      const inactiveCondition = inactiveWriteCondition(setting, this.settings);
      if (inactiveCondition === OMP_POWER_CONDITIONS.backendAvailable) {
        throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Host sleep prevention is unavailable');
      }
      if (inactiveCondition !== undefined) {
        throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Native configuration overrides the shared setting');
      }
      if (change.value !== null) {
        if (change.id === 'edit.mode' && change.value === 'magic') {
          throw new ProjectionError(400, 'INVALID_REQUEST', 'Magic edit mode is not supported');
        }
        try { setting.assertWritable(change.value); }
        catch (error) {
          throw new ProjectionError(400, 'INVALID_REQUEST', error instanceof Error ? error.message : `Invalid value for ${change.id}`);
        }
      }
      if (isRetryChains) retryUpdates = retryChainUpdates(current, change.value);
    }
    try {
      for (const change of request.changes) {
        const setting = handle(change.id);
        if (setting.id === cfgRetryFallbackChains.id && retryUpdates) {
          for (const [key, value] of retryUpdates) cfgRetryFallbackChains.setEntry(this.settings, key, value);
        } else if (change.value === null) setting.unset(this.settings);
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
    return this.state(workspaceId, revision);
  }
}
