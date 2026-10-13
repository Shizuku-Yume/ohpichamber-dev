import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { YAML } from 'bun';
import { getBundledModel } from '@oh-my-pi/pi-catalog';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { cfgEnabledModels } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { filterAvailableModelsByEnabledPatterns } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import { cfgExtendedContext } from '@oh-my-pi/pi-coding-agent/session/context-settings';
import { NativeModels, publicModel, type NativeCatalogModel } from './catalog-models.ts';
import { openNativeRuntime } from './native-runtime.ts';

const routed = getBundledModel('openrouter', 'openrouter/auto');

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

async function openCatalogFixture() {
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const writer = await openNativeRuntime({ cwd, agentDirectory });
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const authStorage = await discoverAuthStorage(agentDirectory, { cwd, settings });
  const modelRegistry = new ModelRegistry(authStorage, writer.modelsPath, { settings });
  const models = new NativeModels({ settings, authStorage, modelRegistry, modelsPath: writer.modelsPath,
    oauthProviderIds: () => new Set<string>(), currentNativeSessionId: () => 'reader-session' });
  return { writer, reader: { settings, modelRegistry, models }, async close() {
    authStorage.close();
    writer.authStorage.close();
    settings.cancelPendingSaves();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  } };
}

const configuration = { providerId: 'm212-loopback', name: 'Loopback', endpoint: 'http://127.0.0.1:18080/v1',
  protocol: 'chat-completions' as const, credentialRef: null };
const configuredModel = { modelId: 'm212-model', provider: configuration.providerId, name: 'Loopback text', modalities: ['text' as const],
  contextWindow: 65536, maxOutputTokens: 256, reasoningEffortSupported: false, reasoningOptions: [], variants: [],
  toolsSupported: true, pricing: null };

test('a long-lived native settings reader cannot select a deleted bundled provider', async () => {
  const fixture = await openCatalogFixture();
  const selection = { providerId: routed.provider, modelId: routed.id };
  try {
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe(routed.api);
    await fixture.writer.models.deleteProvider({ expectedRevision: '0', providerId: routed.provider }, '1');
    await expect(fixture.reader.models.selection(selection)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const catalog = await fixture.reader.models.readModels('workspace_1', '1');
    expect(catalog.models.filter(model => model.provider === routed.provider).every(model => model.enabled === false)).toBe(true);
  } finally { await fixture.close(); }
});

test('provider protocol changes reach the actual native model selected by a long-lived reader', async () => {
  const fixture = await openCatalogFixture();
  const selection = { providerId: configuredModel.provider, modelId: configuredModel.modelId };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe('openai-completions');
    await fixture.writer.models.configureProvider({ expectedRevision: '2', configuration: { ...configuration, protocol: 'responses' } }, '3');
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe('openai-responses');
    await fixture.writer.models.configureModel({ expectedRevision: '3', model: { ...configuredModel, name: 'Updated' } }, '4');
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe('openai-responses');
  } finally { await fixture.close(); }
});

test('protocol mutation migrates old generated APIs while preserving distinguishable native overrides', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    const override = { ...configuredModel, modelId: 'explicit-override' };
    await fixture.writer.models.configureModel({ expectedRevision: '2', model: override }, '3');
    const persisted = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    const provider = persisted.providers[configuration.providerId];
    provider.models.find((model: { id: string }) => model.id === configuredModel.modelId).api = 'openai-completions';
    provider.models.find((model: { id: string }) => model.id === override.modelId).api = 'anthropic-messages';
    provider.models.push({ ...provider.models[0], id: 'native-owned', api: 'openai-completions' });
    await writeFile(fixture.writer.modelsPath, YAML.stringify(persisted));
    await fixture.writer.models.configureProvider({ expectedRevision: '3', configuration: { ...configuration, protocol: 'responses' } }, '4');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: configuredModel.modelId })).nativeModel.api).toBe('openai-responses');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: override.modelId })).nativeModel.api).toBe('anthropic-messages');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: 'native-owned' })).nativeModel.api).toBe('openai-completions');
    await fixture.writer.models.configureModel({ expectedRevision: '4', model: override }, '5');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: override.modelId })).nativeModel.api).toBe('anthropic-messages');
  } finally { await fixture.close(); }
});

test('disabling and deleting the last allowlisted model never enables unrelated native models', async () => {
  const fixture = await openCatalogFixture();
  const selection = { providerId: configuredModel.provider, modelId: configuredModel.modelId };
  const unrelated = { providerId: routed.provider, modelId: routed.id };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    cfgEnabledModels.set(fixture.writer.settings, [`${selection.providerId}/${selection.modelId}`]);
    await fixture.writer.settings.flush();
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(selection.modelId);
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await fixture.writer.models.configureModel({ expectedRevision: '2', model: { ...configuredModel, enabled: false } }, '3');
    await expect(fixture.reader.models.selection(selection)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(filterAvailableModelsByEnabledPatterns(fixture.reader.modelRegistry.getAll('all'),
      cfgEnabledModels.get(fixture.reader.settings), fixture.reader.settings)).toEqual([]);
    await fixture.writer.models.configureModel({ expectedRevision: '3', model: { ...configuredModel, enabled: true } }, '4');
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(selection.modelId);
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await fixture.writer.models.deleteModel({ expectedRevision: '4', selection }, '5');
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(filterAvailableModelsByEnabledPatterns(fixture.reader.modelRegistry.getAll('all'),
      cfgEnabledModels.get(fixture.reader.settings), fixture.reader.settings)).toEqual([]);
    await fixture.writer.models.configureModel({ expectedRevision: '5', model: { ...configuredModel, enabled: true } }, '6');
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(selection.modelId);
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  } finally { await fixture.close(); }
});

test('model selection reapplies a changed native context policy even when models.yml is unchanged', async () => {
  const fixture = await openCatalogFixture();
  try {
    const promotable = fixture.reader.modelRegistry.getAll('all').find(model => model.contextPromotionTarget !== undefined);
    if (!promotable) throw new Error('Pinned native catalog must contain a context promotion model');
    const selection = { providerId: promotable.provider, modelId: promotable.id };
    cfgExtendedContext.set(fixture.writer.settings, false);
    await fixture.writer.settings.flush();
    const before = (await fixture.reader.models.selection(selection)).nativeModel.contextWindow;
    cfgExtendedContext.set(fixture.writer.settings, true);
    await fixture.writer.settings.flush();
    const after = (await fixture.reader.models.selection(selection)).nativeModel.contextWindow;
    expect(after).not.toBe(before);
  } finally { await fixture.close(); }
});

test('a bundled automatic router remains selectable without publishing negative sentinel rates', () => {
  const model = publicModel(routed);
  expect(model.modelId).toBe('openrouter/auto');
  expect(model.contextWindow).toBe(routed.contextWindow);
  expect(model.pricing).toBeNull();
});

for (const pricingStatus of [undefined, 'unknown', 'included', 'variable'] as const) {
  test(`zero token rates with ${pricingStatus ?? 'absent'} pricing status do not claim a free model`, () => {
    const native: NativeCatalogModel = { ...routed, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, pricingStatus };
    expect(publicModel(native).pricing).toBeNull();
  });
}

test('explicitly free token pricing remains zero rather than unknown', () => {
  const native: NativeCatalogModel = { ...routed, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, pricingStatus: 'free' };
  expect(publicModel(native).pricing).toEqual({ inputPerMillionTokens: 0, outputPerMillionTokens: 0, cacheReadPerMillionTokens: 0, cacheWritePerMillionTokens: 0 });
});

test('fixed native pricing preserves each published token rate', () => {
  const native: NativeCatalogModel = { ...routed, cost: { input: 1, output: 2, cacheRead: 0.25, cacheWrite: 1.5 }, pricingStatus: undefined };
  expect(publicModel(native).pricing).toEqual({ inputPerMillionTokens: 1, outputPerMillionTokens: 2, cacheReadPerMillionTokens: 0.25, cacheWritePerMillionTokens: 1.5 });
});

for (const field of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
  test(`a negative ${field} sentinel makes the native rate card unknown`, () => {
    const native: NativeCatalogModel = { ...routed, cost: { input: 1, output: 2, cacheRead: 0.25, cacheWrite: 1.5, [field]: -1 }, pricingStatus: undefined };
    expect(publicModel(native).pricing).toBeNull();
  });
}
