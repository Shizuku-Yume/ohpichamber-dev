import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { NativeCredentials } from './catalog-credentials.ts';
import { credentialReference } from './catalog-models.ts';
import { nativeModelsContext, openNativeRuntime } from './native-runtime.ts';

beforeEach(() => {
  resetSettingsForTest();
});

afterEach(() => {
  resetSettingsForTest();
});
test('bound API-key credentialRef selects the exact stored row across multiple keys and fails closed on disable or delete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-credentials-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  let activeSessionId = 'session-1';
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    nativeModelsContext(runtime, () => activeSessionId);
    const models = runtime.models;
    const credentials = new NativeCredentials(runtime.authStorage, models, 'workspace_1');
    const providerId = 'm212-loopback';
    const modelId = 'm212-model';
    const endpoint = 'http://127.0.0.1:18080/v1';

    await models.configureProvider({
      expectedRevision: '0',
      configuration: {
        providerId,
        name: 'Loopback provider',
        endpoint,
        protocol: 'chat-completions',
        credentialRef: null,
      },
    }, '1');
    await models.configureModel({
      expectedRevision: '1',
      model: {
        modelId,
        provider: providerId,
        name: 'Loopback text',
        modalities: ['text'],
        contextWindow: 65536,
        maxOutputTokens: 256,
        reasoningEffortSupported: false,
        reasoningOptions: [],
        variants: [],
        toolsSupported: true,
        enabled: true,
        pricing: null,
      },
    }, '2');

    const firstWrite = await credentials.write({
      expectedRevision: '2',
      providerId,
      credential: { method: 'api-key', apiKey: 'secret-key-alpha' },
    }, '3');
    const secondWrite = await credentials.write({
      expectedRevision: '3',
      providerId,
      credential: { method: 'api-key', apiKey: 'secret-key-beta' },
    }, '4');

    if (firstWrite.auth.status !== 'configured' || secondWrite.auth.status !== 'configured') {
      throw new Error('Expected configured credential references');
    }
    const firstRef = firstWrite.auth.credentialRef;
    const secondRef = secondWrite.auth.credentialRef;
    expect(firstRef).not.toBe(secondRef);

    await models.configureProvider({
      expectedRevision: '4',
      configuration: {
        providerId,
        name: 'Loopback provider',
        endpoint,
        protocol: 'chat-completions',
        credentialRef: secondRef,
      },
    }, '5');

    const catalogWithSecond = await models.readProviders('workspace_1', '5');
    expect(catalogWithSecond.providers.find(entry => entry.providerId === providerId)?.auth).toEqual({
      status: 'configured',
      method: 'api-key',
      credentialRef: secondRef,
      source: 'stored-credential',
    });

    // Pick two session IDs that map to distinct implicit xxHash32 % 2 buckets.
    const evenSessionId = 'session-4';
    const oddSessionId = 'session-1';

    activeSessionId = evenSessionId;
    const selectedSecond = await models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(selectedSecond.nativeModel, evenSessionId)).toBe('secret-key-beta');
    const secondResolved = await runtime.modelRegistry.resolver(selectedSecond.nativeModel, oddSessionId)({ lastChance: false, error: undefined });
    expect(secondResolved?.apiKey).toBe('secret-key-beta');
    expect(secondResolved?.credentialId && credentialReference(providerId, secondResolved.credentialId)).toBe(secondRef);

    await models.configureProvider({
      expectedRevision: '5',
      configuration: {
        providerId,
        name: 'Loopback provider',
        endpoint,
        protocol: 'chat-completions',
        credentialRef: firstRef,
      },
    }, '6');

    activeSessionId = oddSessionId;
    const selectedFirst = await models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(selectedFirst.nativeModel, oddSessionId)).toBe('secret-key-alpha');
    const firstResolved = await runtime.modelRegistry.getApiKeyWithCredentialForProvider(providerId, evenSessionId);
    expect(firstResolved?.apiKey).toBe('secret-key-alpha');
    expect(firstResolved?.credentialId && credentialReference(providerId, firstResolved.credentialId)).toBe(firstRef);
    if (!firstResolved?.credentialId) throw new Error('Expected resolved credentialId for firstRef');

    expect(await runtime.authStorage.credentials.disable(firstResolved.credentialId, 'revoked')).toBe(true);

    const catalogAfterDisable = await models.readProviders('workspace_1', '6');
    expect(catalogAfterDisable.providers.find(entry => entry.providerId === providerId)?.auth).toEqual({
      status: 'missing',
    });
    await expect(models.selection({ providerId, modelId })).rejects.toMatchObject({
      status: 422,
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(await runtime.modelRegistry.getApiKey(selectedFirst.nativeModel, evenSessionId)).toBeUndefined();
    expect(await runtime.modelRegistry.resolver(selectedFirst.nativeModel, oddSessionId)({ lastChance: false, error: undefined })).toBeUndefined();

    await models.configureProvider({
      expectedRevision: '6',
      configuration: {
        providerId,
        name: 'Loopback provider',
        endpoint,
        protocol: 'chat-completions',
        credentialRef: secondRef,
      },
    }, '7');
    await credentials.write({
      expectedRevision: '7',
      providerId,
      credential: { method: 'api-key', apiKey: 'secret-key-gamma' },
    }, '8');
    const selectedBeforeDelete = await models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(selectedBeforeDelete.nativeModel, evenSessionId)).toBe('secret-key-beta');

    await credentials.delete({
      expectedRevision: '8',
      providerId,
      credentialRef: secondRef,
    }, '9');
    const catalogAfterDelete = await models.readProviders('workspace_1', '9');
    expect(catalogAfterDelete.providers.find(entry => entry.providerId === providerId)?.auth).toEqual({
      status: 'missing',
    });
    await expect(models.selection({ providerId, modelId })).rejects.toMatchObject({
      status: 422,
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(await runtime.modelRegistry.getApiKey(selectedBeforeDelete.nativeModel, evenSessionId)).toBeUndefined();
    expect(await runtime.modelRegistry.resolver(selectedBeforeDelete.nativeModel, oddSessionId)({ lastChance: false, error: undefined })).toBeUndefined();
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('bound OAuth credentialRef pins session affinity to the selected row without sibling fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-oauth-credentials-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    nativeModelsContext(runtime, () => 'oauth-session-1');
    const models = runtime.models;
    const credentials = new NativeCredentials(runtime.authStorage, models, 'workspace_1');
    const providerId = 'anthropic';
    const modelId = 'anthropic-custom';
    const endpoint = 'http://127.0.0.1:18080/v1';
    const expiresAt = Date.now() + 3_600_000;

    const firstOAuth = await credentials.write({
      expectedRevision: '0',
      providerId,
      credential: { method: 'oauth', accessToken: 'oauth-access-one', refreshToken: 'oauth-refresh-one', expiresAt },
    }, '1');
    const secondOAuth = await credentials.write({
      expectedRevision: '1',
      providerId,
      credential: { method: 'oauth', accessToken: 'oauth-access-two', refreshToken: 'oauth-refresh-two', expiresAt },
    }, '2');
    if (firstOAuth.auth.status !== 'configured' || secondOAuth.auth.status !== 'configured') {
      throw new Error('Expected configured OAuth credential references');
    }
    const secondRef = secondOAuth.auth.credentialRef;
    expect(firstOAuth.auth.credentialRef).not.toBe(secondRef);

    await models.configureProvider({
      expectedRevision: '2',
      configuration: {
        providerId,
        name: 'Anthropic loopback',
        endpoint,
        protocol: 'messages',
        credentialRef: secondRef,
      },
    }, '3');
    await models.configureModel({
      expectedRevision: '3',
      model: {
        modelId,
        provider: providerId,
        name: 'Anthropic custom model',
        modalities: ['text'],
        contextWindow: 65536,
        maxOutputTokens: 256,
        reasoningEffortSupported: false,
        reasoningOptions: [],
        variants: [],
        toolsSupported: true,
        enabled: true,
        pricing: null,
      },
    }, '4');

    const selected = await models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(selected.nativeModel, 'oauth-session-1')).toBe('oauth-access-two');
    const accounts = runtime.authStorage.oauth.accounts(providerId, 'oauth-session-1');
    const activeAccount = accounts.find(account => account.active);
    expect(activeAccount && credentialReference(providerId, activeAccount.credentialId)).toBe(secondRef);

    await credentials.delete({
      expectedRevision: '4',
      providerId,
      credentialRef: secondRef,
    }, '5');
    await expect(models.selection({ providerId, modelId })).rejects.toMatchObject({
      status: 422,
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(await runtime.modelRegistry.getApiKey(selected.nativeModel, 'oauth-session-1')).toBeUndefined();
    expect(await runtime.modelRegistry.getApiKeyWithCredentialForProvider(providerId, 'oauth-session-1')).toBeUndefined();
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});
