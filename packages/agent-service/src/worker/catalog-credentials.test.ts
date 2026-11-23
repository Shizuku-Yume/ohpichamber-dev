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
test('bound API-key credentialRef fails closed on disable while removing the pin enables native selection', async () => {
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
    const credentials = new NativeCredentials(runtime.authStorage, models, 'workspace_1', 'agent_1');
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
    expect(catalogAfterDelete.providers.find(entry => entry.providerId === providerId)?.auth).toMatchObject({ status: 'configured', source: 'stored-credential' });
    expect(models.defaultCredentialRef(providerId)).toBeNull();
    await expect(models.selection({ providerId, modelId })).resolves.toBeDefined();
    expect(await models.resolveProviderCredential(providerId, evenSessionId)).toEqual({ bound: false });
    expect(await runtime.modelRegistry.getApiKey(selectedBeforeDelete.nativeModel, evenSessionId)).toBe('secret-key-gamma');
    expect(await runtime.modelRegistry.resolver(selectedBeforeDelete.nativeModel, oddSessionId)({ lastChance: false, error: undefined })).toBeDefined();
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('bound OAuth credentialRef pins the selected row and deleting it enables native selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-oauth-credentials-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    nativeModelsContext(runtime, () => 'oauth-session-1');
    const models = runtime.models;
    const credentials = new NativeCredentials(runtime.authStorage, models, 'workspace_1', 'agent_1');
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
    const privateSelection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId,
      credentialRef: secondRef, purpose: 'quota' as const };
    expect((await credentials.resolve(privateSelection)).credential).toEqual({
      type: 'oauth', access: 'oauth-access-two', refresh: 'oauth-refresh-two', expires: expiresAt,
    });
    await expect(credentials.resolve({ ...privateSelection, agentDirectoryId: 'sibling-agent' })).rejects.toMatchObject({
      status: 403, code: 'UNAUTHORIZED',
    });

    await credentials.delete({
      expectedRevision: '4',
      providerId,
      credentialRef: secondRef,
    }, '5');
    await expect(credentials.resolve(privateSelection)).rejects.toMatchObject({ status: 404, code: 'CREDENTIAL_UNAVAILABLE' });
    expect(models.defaultCredentialRef(providerId)).toBeNull();
    await expect(models.selection({ providerId, modelId })).resolves.toBeDefined();
    expect(await runtime.modelRegistry.getApiKey(selected.nativeModel, 'oauth-session-1')).toBe('oauth-access-one');
    expect(await runtime.modelRegistry.getApiKeyWithCredentialForProvider(providerId, 'oauth-session-1')).toMatchObject({ apiKey: 'oauth-access-one' });
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('selected custom-provider file handoff persists and reloads the exact SDK API key across a cold owner reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'selected-handoff-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  let runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    nativeModelsContext(runtime, () => 'handoff-session');
    await runtime.models.configureProvider({ expectedRevision: '0', configuration: {
      providerId: 'selected-proxy', name: 'Selected proxy', endpoint: 'http://127.0.0.1:18080/v1',
      protocol: 'chat-completions', credentialRef: null,
    } }, '1');
    const credentials = new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1');
    const imported = await credentials.handoff({ workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', expectedRevision: '1',
      selection: { providerId: 'selected-proxy', source: 'selected-file', credentialType: 'key',
        file: { format: 'opencode-auth-entry', content: JSON.stringify({ type: 'api', key: 'selected-secret-key' }) } },
    }, '2');
    expect(imported.outcome.status).toBe('imported');
    expect(JSON.stringify(imported)).not.toContain('selected-secret-key');
    const reference = imported.outcome.credentialRef;
    if (!reference) throw new Error('Expected opaque selected credential reference');
    const selection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'selected-proxy', credentialRef: reference, purpose: 'quota' as const };
    expect((await credentials.resolve(selection)).credential).toEqual({ type: 'api_key', key: 'selected-secret-key' });
    await expect(credentials.resolve({ ...selection, agentDirectoryId: 'sibling-agent' })).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 403 });
    await expect(credentials.resolve({ ...selection, workspaceId: 'sibling-workspace' })).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 403 });
    await expect(credentials.resolve({ ...selection, credentialRef: 'missing-reference' })).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE', status: 404 });
    runtime.authStorage.close();
    runtime = await openNativeRuntime({ cwd, agentDirectory });
    nativeModelsContext(runtime, () => 'cold-handoff-session');
    const reopened = new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1');
    expect((await reopened.resolve(selection)).credential).toEqual({ type: 'api_key', key: 'selected-secret-key' });
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('unsupported files, official conversion limits, and OAuth reauthentication do not write SDK credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'handoff-refusals-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    nativeModelsContext(runtime, () => 'refused-handoff');
    const credentials = new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1');
    const base = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', expectedRevision: '0' };
    const official = await credentials.handoff({ ...base, selection: { providerId: 'openai', source: 'stored-credential', credentialType: 'key' } }, '1');
    expect(official.outcome).toMatchObject({ status: 'unavailable', code: 'PROVIDER_CONVERSION_UNVERIFIED' });
    const oauth = await credentials.handoff({ ...base, selection: { providerId: 'anthropic', source: 'stored-credential', credentialType: 'oauth' } }, '1');
    expect(oauth.outcome).toMatchObject({ status: 're-auth-required', code: 'OAUTH_REAUTH_REQUIRED' });
    const console = await credentials.handoff({ ...base, selection: { providerId: 'opencode', source: 'stored-credential', credentialType: 'key' } }, '1');
    expect(console.outcome).toMatchObject({ status: 'unsupported', code: 'CONSOLE_CREDENTIAL_UNSUPPORTED' });
    expect(runtime.authStorage.credentials.list('openai')).toHaveLength(0);
    expect(runtime.authStorage.credentials.list('anthropic')).toHaveLength(0);
    expect(runtime.authStorage.credentials.list('opencode')).toHaveLength(0);
    expect(official.revision).toBe('0');
    await runtime.models.configureProvider({ expectedRevision: '0', configuration: { providerId: 'refused-proxy',
      name: 'Refused proxy', endpoint: 'http://127.0.0.1:18080/v1', protocol: 'chat-completions', credentialRef: null } }, '1');
    for (const content of ['{"unexpected":"private-marker"}', '{"type":"api","key":"!touch /private/marker"}']) {
      const rejected = await credentials.handoff({ ...base, expectedRevision: '1', selection: {
        providerId: 'refused-proxy', source: 'selected-file', credentialType: 'key', file: { format: 'opencode-auth-entry', content },
      } }, '2');
      expect(rejected.outcome).toMatchObject({ status: 'unsupported', code: 'CREDENTIAL_FORMAT_UNSUPPORTED' });
      expect(JSON.stringify(rejected)).not.toContain('private-marker');
      expect(runtime.authStorage.credentials.list('refused-proxy')).toHaveLength(0);
      expect(rejected.revision).toBe('1');
    }
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});
