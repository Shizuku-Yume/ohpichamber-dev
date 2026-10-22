import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
import { NativeModels, credentialReference, publicModel, type NativeCatalogModel } from './catalog-models.ts';
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
test('model catalog publishes only executable providers while the provider directory stays complete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-native-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const modelsPath = join(agentDirectory, 'models.yml');
  const nativeConfig = {
    providers: {
      'native-custom': {
        baseUrl: 'http://127.0.0.1:18080/v1', apiKey: 'native-test-key', api: 'openai-completions',
        models: [{ id: 'native-custom-model', name: 'Native custom', contextWindow: 65536, maxTokens: 256 }],
      },
      'native-keyless': {
        baseUrl: 'http://127.0.0.1:18081/v1', auth: 'none', api: 'openai-completions',
        models: [{ id: 'native-keyless-model', name: 'Native keyless', contextWindow: 65536, maxTokens: 256 }],
      },
    },
  };
  const authored = YAML.stringify(nativeConfig);
  await writeFile(modelsPath, authored);
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const catalog = await runtime.models.readModels('workspace_1', '1');
    const catalogProviders = new Set(catalog.models.map(model => model.provider));
    expect(catalog.models.filter(model => model.provider === 'native-custom').map(model => model.modelId))
      .toEqual(['native-custom-model']);
    expect(catalog.models.filter(model => model.provider === 'native-keyless').map(model => model.modelId))
      .toEqual(['native-keyless-model']);

    // The bundled registry still knows providers nobody configured. They must
    // not reach the executable model catalog.
    const unconfigured = [...new Set(runtime.modelRegistry.getAll('all').map(model => model.provider))]
      .find(provider => runtime.authStorage.keys.source(provider) === undefined && !runtime.authStorage.keys.keyless(provider));
    expect(unconfigured).toBeDefined();
    expect(catalogProviders.has(unconfigured!)).toBe(false);

    const directory = await runtime.models.readProviders('workspace_1', '1');
    expect(directory.providers.some(provider => provider.providerId === unconfigured)).toBe(true);
    expect(await readFile(modelsPath, 'utf8')).toBe(authored);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

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
    // Promotion targets route to another model; a published long-context tier
    // exercises this model's settings-dependent window without missing token limits.
    const published = getBundledModel('openai', 'gpt-5.6');
    const selection = { providerId: published.provider, modelId: published.id };
    cfgExtendedContext.set(fixture.writer.settings, false);
    await fixture.writer.settings.flush();
    const before = (await fixture.reader.models.selection(selection)).nativeModel.contextWindow;
    cfgExtendedContext.set(fixture.writer.settings, true);
    await fixture.writer.settings.flush();
    const after = (await fixture.reader.models.selection(selection)).nativeModel.contextWindow;
    expect(before).toBe(published.cost.longContext?.inputThreshold);
    expect(after).toBe(published.contextWindow);
    expect(after).toBeGreaterThan(before);
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

test('custom endpoint, literal private headers and canonical models save and reopen together', async () => {
  const requests: { path: string; authorization: string | null; custom: string | null }[] = [];
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    requests.push({ path: new URL(request.url).pathname, authorization: request.headers.get('authorization'), custom: request.headers.get('x-private') });
    return Response.json({ data: [{ id: configuredModel.modelId, name: 'Discovered' }] });
  } });
  const fixture = await openCatalogFixture();
  const saved = { ...configuration, endpoint: `http://127.0.0.1:${server.port}/v1` };
  try {
    const result = await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration: saved,
      headers: { Authorization: 'Bearer private-value', 'X-Private': '!literal-not-a-command' }, models: [configuredModel] }, '1');
    expect(JSON.stringify(result)).not.toContain('private-value');
    const reopened = await fixture.reader.models.readProviderConfiguration(saved.providerId, '1');
    expect(reopened.configuration).toEqual(saved);
    expect(reopened.headerNames.sort()).toEqual(['Authorization', 'X-Private']);
    expect(reopened.models).toEqual([configuredModel]);
    expect(JSON.stringify(reopened)).not.toContain('private-value');
    expect(JSON.stringify(await fixture.reader.models.readProviders('workspace_1', '1'))).not.toContain('private-value');
    const selection = await fixture.reader.models.selection({ providerId: saved.providerId, modelId: configuredModel.modelId });
    expect(selection.nativeModel.baseUrl).toBe(saved.endpoint);
    expect(await selection.nativeModel.resolveHeaders?.()).toMatchObject({ Authorization: 'Bearer private-value', 'X-Private': '!literal-not-a-command' });
    expect((await stat(fixture.writer.modelsPath)).mode & 0o777).toBe(0o600);
    expect(await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: saved.endpoint, protocol: saved.protocol }))
      .toEqual({ models: [{ modelId: configuredModel.modelId, name: 'Discovered' }] });
    expect(requests).toEqual([{ path: '/v1/models', authorization: 'Bearer private-value', custom: '!literal-not-a-command' }]);
    await fixture.writer.models.configureProvider({ expectedRevision: '1', configuration: { ...saved, name: 'Renamed' } }, '2');
    expect((await fixture.reader.models.readProviderConfiguration(saved.providerId, '2')).headerNames).toHaveLength(2);
    await fixture.writer.models.configureProvider({ expectedRevision: '2', configuration: saved, headers: {}, models: [] }, '3');
    expect(await fixture.reader.models.readProviderConfiguration(saved.providerId, '3')).toMatchObject({ headerNames: [], models: [] });
    await expect(fixture.reader.models.selection({ providerId: saved.providerId, modelId: configuredModel.modelId })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  } finally { server.stop(true); await fixture.close(); }
});

for (const protocol of ['chat-completions', 'responses', 'messages', 'generate-content'] as const) {
  test(`worker model discovery uses write-only ${protocol} authentication and real metadata`, async () => {
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      requests.push({ url: request.url, headers: Object.fromEntries(request.headers.entries()) });
      return Response.json(protocol === 'generate-content'
        ? { models: [{ name: 'models/loopback-model', displayName: 'Loopback', inputTokenLimit: 8192, outputTokenLimit: 1024 }] }
        : { data: [{ id: 'loopback-model', name: 'Loopback' }] });
    } });
    const fixture = await openCatalogFixture();
    try {
      const discovered = await fixture.reader.models.discoverProviderModels({ endpoint: `http://127.0.0.1:${server.port}/v1`, protocol,
        apiKey: 'write-only-secret', headers: { 'x-private': 'write-only-header' } });
      const expectedModel = protocol === 'generate-content'
        ? { modelId: 'loopback-model', name: 'Loopback', contextWindow: 8192, maxOutputTokens: 1024 }
        : { modelId: 'loopback-model', name: 'Loopback' };
      expect(discovered).toEqual({ models: [expectedModel] });
      expect(requests).toHaveLength(1);
      expect(new URL(requests[0]!.url).pathname).toBe('/v1/models');
      const headerName = protocol === 'messages' ? 'x-api-key' : protocol === 'generate-content' ? 'x-goog-api-key' : 'authorization';
      expect(requests[0]!.headers[headerName]).toBe(headerName === 'authorization' ? 'Bearer write-only-secret' : 'write-only-secret');
      expect(requests[0]!.headers['x-private']).toBe('write-only-header');
      if (protocol === 'messages') expect(requests[0]!.headers['anthropic-version']).toBe('2023-06-01');
      expect(JSON.stringify(discovered)).not.toContain('write-only');
      expect(await readFile(fixture.writer.modelsPath, 'utf8').catch(() => '')).not.toContain('write-only');
    } finally { server.stop(true); await fixture.close(); }
  });
}

test('selected stored account survives reopen and changes the actual native credential binding', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'first-loopback-key', source: 'login' });
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'second-loopback-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    const rows = fixture.writer.authStorage.credentials.list(configuration.providerId);
    const first = rows.find(row => row.credential.type === 'api_key' && row.credential.key === 'first-loopback-key')!;
    const second = rows.find(row => row.credential.type === 'api_key' && row.credential.key === 'second-loopback-key')!;
    const firstRef = credentialReference(configuration.providerId, first.id);
    const secondRef = credentialReference(configuration.providerId, second.id);
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, models: [configuredModel] }, '1');
    await fixture.writer.models.selectCredential(configuration.providerId, secondRef, '2');
    await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: configuredModel.modelId });
    expect(fixture.reader.models.defaultCredentialRef(configuration.providerId)).toBe(secondRef);
    expect(await fixture.reader.models.resolveProviderCredential(configuration.providerId, 'reader-session')).toEqual({
      bound: true, credential: { apiKey: 'second-loopback-key', credentialId: second.id },
    });
    await fixture.writer.models.selectCredential(configuration.providerId, firstRef, '3');
    expect(await fixture.reader.models.resolveProviderCredential(configuration.providerId, 'reader-session')).toEqual({
      bound: true, credential: { apiKey: 'first-loopback-key', credentialId: first.id },
    });
    await expect(fixture.writer.models.selectCredential(configuration.providerId, 'credential_missing', '4')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect((await fixture.reader.models.readProviderConfiguration(configuration.providerId, '3')).configuration.credentialRef).toBe(firstRef);
  } finally { await fixture.close(); }
});

test('invalid bundled model write leaves the previous provider configuration and headers intact', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, headers: { 'x-private': 'old-secret' }, models: [configuredModel] }, '1');
    const before = await readFile(fixture.writer.modelsPath, 'utf8');
    await expect(fixture.writer.models.configureProvider({ expectedRevision: '1', configuration: { ...configuration, name: 'Uncommitted' },
      headers: { 'x-private': 'uncommitted-secret' }, models: [{ ...configuredModel, reasoningEffortSupported: true,
        reasoningOptions: [{ reasoningEffort: 'not-native', label: 'Invalid', budgetTokens: null }] }] }, '2')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await readFile(fixture.writer.modelsPath, 'utf8')).toBe(before);
    expect((await fixture.reader.models.readProviderConfiguration(configuration.providerId, '1')).configuration.name).toBe(configuration.name);
  } finally { await fixture.close(); }
});

test('discovery errors and redirects cannot reveal keys or forward credentials to another endpoint', async () => {
  let redirected = 0;
  const sink = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() { redirected++; return Response.json({ data: [] }); } });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    return new URL(request.url).pathname.startsWith('/redirect')
      ? Response.redirect(`http://127.0.0.1:${sink.port}/models`)
      : new Response('private-response-key', { status: 401 });
  } });
  const fixture = await openCatalogFixture();
  try {
    for (const path of ['error', 'redirect']) {
      await expect(fixture.reader.models.discoverProviderModels({ endpoint: `http://127.0.0.1:${server.port}/${path}`,
        protocol: 'responses', apiKey: 'private-response-key' })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: 'Provider model discovery failed' });
    }
    expect(redirected).toBe(0);
  } finally { server.stop(true); sink.stop(true); await fixture.close(); }
});

test('stored discovery credentials are opaque and saved headers do not follow endpoint edits', async () => {
  const requests: { path: string; key: string | null; custom: string | null }[] = [];
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    requests.push({ path: new URL(request.url).pathname, key: request.headers.get('authorization'), custom: request.headers.get('x-private') });
    return Response.json({ data: [] });
  } });
  const fixture = await openCatalogFixture();
  const saved = { ...configuration, endpoint: `http://127.0.0.1:${server.port}/original` };
  try {
    await fixture.writer.authStorage.credentials.upsert(saved.providerId, { type: 'api_key', key: 'opaque-discovery-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    const row = fixture.writer.authStorage.credentials.list(saved.providerId)[0]!;
    const reference = credentialReference(saved.providerId, row.id);
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration: { ...saved, credentialRef: reference }, headers: { 'x-private': 'saved-secret' } }, '1');
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: saved.endpoint, protocol: saved.protocol });
    const changedEndpoint = `http://127.0.0.1:${server.port}/changed`;
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: changedEndpoint, protocol: saved.protocol });
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: changedEndpoint, protocol: saved.protocol, credentialRef: reference });
    expect(requests).toEqual([
      { path: '/original/models', key: 'Bearer opaque-discovery-key', custom: 'saved-secret' },
      { path: '/changed/models', key: null, custom: null },
      { path: '/changed/models', key: 'Bearer opaque-discovery-key', custom: null },
    ]);
    await expect(fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: saved.endpoint,
      protocol: saved.protocol, credentialRef: 'credential_unknown' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(requests).toHaveLength(3);
  } finally { server.stop(true); await fixture.close(); }
});

for (const protocol of ['messages', 'generate-content'] as const) {
  test(`${protocol} model discovery follows native pagination without duplicate identities`, async () => {
    const pages: string[] = [];
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      const url = new URL(request.url);
      pages.push(url.search);
      const second = url.search !== '';
      return Response.json(protocol === 'messages'
        ? { data: second ? [{ id: 'model-one' }, { id: 'model-two' }] : [{ id: 'model-one' }], has_more: !second, last_id: 'model-one' }
        : second ? { models: [{ name: 'models/model-one' }, { name: 'models/model-two' }] }
          : { models: [{ name: 'models/model-one' }], nextPageToken: 'page-two' });
    } });
    const fixture = await openCatalogFixture();
    try {
      const result = await fixture.reader.models.discoverProviderModels({ endpoint: `http://127.0.0.1:${server.port}/v1`, protocol });
      expect(result.models.map(model => model.modelId)).toEqual(['model-one', 'model-two']);
      expect(pages).toEqual(['', protocol === 'messages' ? '?after_id=model-one' : '?pageToken=page-two']);
    } finally { server.stop(true); await fixture.close(); }
  });
}

test('default stored credential selection never replaces a source-owned native override', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'stored-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    const row = fixture.writer.authStorage.credentials.list(configuration.providerId)[0]!;
    await fixture.writer.models.selectCredential(configuration.providerId, credentialReference(configuration.providerId, row.id), '1');
    fixture.writer.authStorage.keys.setRuntime(configuration.providerId, 'source-owned-key');
    expect(await fixture.writer.models.resolveProviderCredential(configuration.providerId, 'session')).toEqual({ bound: false });
    expect(fixture.writer.models.provider(configuration.providerId).auth).toMatchObject({ source: 'managed-environment' });
    expect(await fixture.writer.authStorage.keys.peek(configuration.providerId)).toBe('source-owned-key');
  } finally { await fixture.close(); }
});

test('configured discovery falls back to native key cascade when no explicit account is selected', async () => {
  const requests: Array<{ authorization: string | null }> = [];
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    requests.push({ authorization: request.headers.get('authorization') });
    return Response.json({ data: [] });
  } });
  const fixture = await openCatalogFixture();
  const saved = { ...configuration, endpoint: `http://127.0.0.1:${server.port}/v1`, credentialRef: null };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration: saved }, '1');
    // Runtime overrides belong to one AuthStorage instance; persisted native keys
    // are the normal configure-then-key-write flow observed by the separate reader.
    await fixture.writer.authStorage.credentials.upsert(saved.providerId, { type: 'api_key', key: 'cascade-key', source: 'login' });
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: saved.endpoint, protocol: saved.protocol });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.authorization).toBe('Bearer cascade-key');
  } finally { server.stop(true); await fixture.close(); }
});

test('explicit empty headers replace old native provider headers and remain empty after reopen', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, headers: { 'x-old': 'old-secret' } }, '1');
    await fixture.writer.models.configureProvider({ expectedRevision: '1', configuration, headers: {} }, '2');
    const reopened = await fixture.reader.models.readProviderConfiguration(configuration.providerId, '2');
    expect(reopened.headerNames).toEqual([]);
    const persisted = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    expect(persisted.providers[configuration.providerId].headers).toBeUndefined();
    expect(persisted.openchamber.providerHeaders[configuration.providerId]).toEqual({});
  } finally { await fixture.close(); }
});
