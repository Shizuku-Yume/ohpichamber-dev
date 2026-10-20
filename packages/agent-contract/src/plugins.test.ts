import { describe, expect, test } from 'bun:test';
import {
  InstalledPluginEntrySchema, LocalExtensionEntrySchema, LocalExtensionWriteRequestSchema,
  PluginConfigureRequestSchema, PluginInstallRequestSchema, PluginMutationResultSchema,
  PluginCatalogStateSchema, type InstalledPluginEntry,
} from './plugins.ts';

const plugin: InstalledPluginEntry = {
  id: 'package:example', target: { kind: 'package', name: 'example' }, name: 'example', version: '1.0.0',
  description: '', scope: 'global', enabled: true, enabledFeatures: null,
  settingsScope: 'global', globalSettings: { greeting: 'saved-global' },
  settings: { greeting: 'effective-project' }, settingDefinitions: [
    { key: 'greeting', description: '', type: 'string', secret: false, configured: true, globalConfigured: true, overridden: true },
    { key: 'token', description: '', type: 'string', secret: true, configured: true, globalConfigured: true, overridden: false },
  ],
};
const catalog = { workspaceId: 'workspace', revision: '1', plugins: [plugin], marketplace: [], localExtensions: [], workers: [] };

describe('native plugin contracts', () => {
  test('package installation has no fictitious workspace scope; marketplace scope is native', () => {
    expect(PluginInstallRequestSchema.parse({ expectedRevision: '0', source: { kind: 'package', spec: '@example/plugin@1' } }).source.kind).toBe('package');
    expect(PluginInstallRequestSchema.safeParse({ expectedRevision: '0', source: { kind: 'package', spec: 'example', scope: 'workspace' } }).success).toBe(false);
    expect(PluginInstallRequestSchema.parse({ expectedRevision: '0', source: { kind: 'marketplace', name: 'example', marketplace: 'team', scope: 'project' } }).source.kind).toBe('marketplace');
  });

  test('revisions are canonical uint64 decimal strings', () => {
    for (const revision of ['-1', '01', '1.0', '18446744073709551616']) {
      expect(PluginInstallRequestSchema.safeParse({ expectedRevision: revision, source: { kind: 'package', spec: 'example' } }).success).toBe(false);
    }
    expect(PluginInstallRequestSchema.safeParse({ expectedRevision: '18446744073709551615', source: { kind: 'package', spec: 'example' } }).success).toBe(true);
  });

  test('public plugin settings never serialize declared secrets', () => {
    expect(InstalledPluginEntrySchema.parse(plugin).settingDefinitions[1]?.configured).toBe(true);
    expect(InstalledPluginEntrySchema.safeParse({ ...plugin, settings: { ...plugin.settings, token: 'private' } }).success).toBe(false);
    expect(InstalledPluginEntrySchema.safeParse({ ...plugin, globalSettings: { token: 'private' } }).success).toBe(false);
    expect(InstalledPluginEntrySchema.safeParse({ ...plugin, settings: { ...plugin.settings, undeclaredToken: 'private' } }).success).toBe(false);
    expect(InstalledPluginEntrySchema.safeParse({ ...plugin, scope: 'workspace' }).success).toBe(false);
  });

  test('local source identifiers cannot escape or misidentify their extension', () => {
    for (const extensionId of ['../outside.ts', '/outside.ts', 'nested/example.ts', '.hidden.ts', 'bad.ts/../other.ts']) {
      expect(LocalExtensionWriteRequestSchema.safeParse({ expectedRevision: '0', extensionId, content: 'export default () => {}' }).success).toBe(false);
    }
    expect(LocalExtensionEntrySchema.safeParse({ extensionId: 'example.ts', relativePath: '.omp/extensions/../outside.ts' }).success).toBe(false);
    expect(LocalExtensionEntrySchema.parse({ extensionId: 'example.ts', relativePath: '.omp/extensions/example.ts' }).extensionId).toBe('example.ts');
  });

  test('configuration distinguishes empty settings from absent changes and rejects non-JSON writes', () => {
    expect(PluginConfigureRequestSchema.safeParse({ expectedRevision: '1', target: plugin.target }).success).toBe(false);
    expect(PluginConfigureRequestSchema.safeParse({ expectedRevision: '1', target: plugin.target, settings: {} }).success).toBe(false);
    expect(PluginConfigureRequestSchema.safeParse({ expectedRevision: '1', target: plugin.target, settingsScope: 'global', settings: {} }).success).toBe(true);
    expect(PluginConfigureRequestSchema.safeParse({ expectedRevision: '1', target: plugin.target, settingsScope: 'global', settings: { greeting: undefined } }).success).toBe(false);
  });

  test('saved global settings stay distinct from native effective project overrides', () => {
    const state = InstalledPluginEntrySchema.parse(plugin);
    expect(state.settingsScope).toBe('global');
    expect(state.globalSettings.greeting).toBe('saved-global');
    expect(state.settings.greeting).toBe('effective-project');
    expect(state.settingDefinitions[0]?.overridden).toBe(true);
  });

  test('committed configuration is distinct from active runtime application', () => {
    const result = { workspaceId: 'workspace', revision: '1', persistence: 'committed', catalog, status: 'no-active-workers', workers: [] };
    expect(PluginMutationResultSchema.safeParse(result).success).toBe(true);
    expect(PluginMutationResultSchema.safeParse({ ...result, status: 'applied' }).success).toBe(false);
    expect(PluginMutationResultSchema.safeParse({ ...result, revision: '2' }).success).toBe(false);
  });

  test('runtime application outcomes cannot claim stale or duplicate worker publications', () => {
    const worker = { rootSessionId: 'session', workspaceId: 'workspace', workerGeneration: 'generation' };
    const applied = { worker, outcome: 'applied', appliedRevision: '1' };
    const result = { workspaceId: 'workspace', revision: '1', persistence: 'committed', catalog, status: 'applied', workers: [applied] };
    expect(PluginMutationResultSchema.safeParse(result).success).toBe(true);
    expect(PluginMutationResultSchema.safeParse({ ...result, workers: [{ ...applied, appliedRevision: '0' }] }).success).toBe(false);
    expect(PluginMutationResultSchema.safeParse({ ...result, workers: [applied, applied] }).success).toBe(false);
    expect(PluginCatalogStateSchema.safeParse({ ...catalog, workers: [{ worker, status: 'ready', appliedRevision: null, error: null }] }).success).toBe(false);
    const siblingWorker = { ...worker, rootSessionId: 'sibling-session', workspaceId: 'sibling-workspace' };
    expect(PluginMutationResultSchema.safeParse({ ...result, workers: [applied, { ...applied, worker: siblingWorker }] }).success).toBe(true);
    expect(PluginCatalogStateSchema.safeParse({ ...catalog, workers: [{ worker: siblingWorker, status: 'ready', appliedRevision: '1', error: null }] }).success).toBe(false);
  });

  test('catalogs reject duplicate native plugin identities', () => {
    expect(PluginCatalogStateSchema.safeParse({ ...catalog, plugins: [plugin, plugin] }).success).toBe(false);
  });
});
