import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { YAML } from 'bun';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { NativeCredentials } from './catalog-credentials.ts';
import { credentialReference } from './catalog-models.ts';
import { nativeModelsContext, openNativeRuntime } from './native-runtime.ts';

beforeEach(() => resetSettingsForTest());
afterEach(() => resetSettingsForTest());

test('automatic selection persists over legacy pins without changing private provider projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'provider-selection-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  let runtime = await openNativeRuntime({ cwd, agentDirectory });
  const providerId = 'selection-provider';
  const credentials = () => new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1');
  const reopen = async () => {
    runtime.authStorage.close();
    resetSettingsForTest();
    runtime = await openNativeRuntime({ cwd, agentDirectory });
  };
  try {
    await runtime.models.configureProvider({ expectedRevision: '0', configuration: {
      providerId, name: 'Selection provider', endpoint: 'http://127.0.0.1:18080/v1', protocol: 'chat-completions', credentialRef: null,
    } }, '1');
    expect(await credentials().account(providerId, { action: 'automatic', expectedRevision: '1' }, '2'))
      .toMatchObject({ selectionMode: 'automatic', selectionOverriddenBy: null, accounts: [] });
    const first = await credentials().write({ expectedRevision: '2', providerId, credential: { method: 'api-key', apiKey: 'selection-first' } }, '3');
    await credentials().write({ expectedRevision: '3', providerId, credential: { method: 'api-key', apiKey: 'selection-second' } }, '4');
    if (first.auth.status !== 'configured') throw new Error('Expected a stored credential');
    const reference = first.auth.credentialRef;
    await credentials().account(providerId, { action: 'select', expectedRevision: '4', credentialRef: reference }, '5');
    const legacy = YAML.parse(await readFile(runtime.modelsPath, 'utf8'));
    delete legacy.openchamber.defaultCredentials[providerId];
    await writeFile(runtime.modelsPath, YAML.stringify(legacy));
    await reopen();
    expect(await credentials().accounts(providerId, '5')).toMatchObject({ selectionMode: 'pinned' });
    expect(runtime.models.defaultCredentialRef(providerId)).toBe(reference);
    expect((await runtime.models.resolveProviderCredential(providerId, 'legacy-session')).bound).toBe(true);

    const before = await readFile(runtime.modelsPath, 'utf8');
    const originalFlush = runtime.settings.flush.bind(runtime.settings);
    let failed = false;
    const flush = spyOn(runtime.settings, 'flush').mockImplementation(async () => {
      const current = YAML.parse(await readFile(runtime.modelsPath, 'utf8'));
      if (!failed && current.openchamber.defaultCredentials[providerId] === null) {
        failed = true;
        throw new Error('Fixture settings flush failure');
      }
      return originalFlush();
    });
    try {
      await expect(credentials().account(providerId, { action: 'automatic', expectedRevision: '5' }, '6'))
        .rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    } finally { flush.mockRestore(); }
    expect(await readFile(runtime.modelsPath, 'utf8')).toBe(before);
    expect(runtime.models.defaultCredentialRef(providerId)).toBe(reference);

    const automatic = await credentials().account(providerId, { action: 'automatic', expectedRevision: '5' }, '6');
    expect(automatic).toMatchObject({ revision: '6', selectionMode: 'automatic', selectionOverriddenBy: null });
    expect(automatic.accounts.every(account => !account.active)).toBe(true);
    const persisted = YAML.parse(await readFile(runtime.modelsPath, 'utf8'));
    expect(persisted.openchamber.defaultCredentials[providerId]).toBeNull();
    persisted.openchamber.providers[providerId].credentialRef = reference;
    await writeFile(runtime.modelsPath, YAML.stringify(persisted));
    await reopen();
    expect(await credentials().accounts(providerId, '6')).toMatchObject({ selectionMode: 'automatic', selectionOverriddenBy: null });
    expect(runtime.models.defaultCredentialRef(providerId)).toBeNull();
    expect(await runtime.models.resolveProviderCredential(providerId, 'automatic-session')).toEqual({ bound: false });
    expect(runtime.models.provider(providerId).auth).toMatchObject({ status: 'configured', source: 'stored-credential', credentialRef: reference });
    expect(await runtime.modelRegistry.getApiKeyWithCredentialForProvider(providerId, 'automatic-session')).toBeDefined();

    await credentials().account(providerId, { action: 'select', expectedRevision: '6', credentialRef: reference }, '7');
    const configured = YAML.parse(await readFile(runtime.modelsPath, 'utf8'));
    configured.providers[providerId].apiKey = 'configured-selection-key';
    await writeFile(runtime.modelsPath, YAML.stringify(configured));
    await reopen();
    const overridden = await credentials().accounts(providerId, '7');
    expect(overridden).toMatchObject({ selectionMode: 'pinned', selectionOverriddenBy: 'managed-environment' });
    expect(overridden.accounts.find(account => account.credentialRef === reference)?.active).toBe(true);
    expect(await runtime.models.resolveProviderCredential(providerId, 'config-session')).toEqual({ bound: false });
    expect((await runtime.modelRegistry.getApiKeyWithCredentialForProvider(providerId, 'config-session'))?.apiKey).toBe('configured-selection-key');
    expect(await credentials().account(providerId, { action: 'automatic', expectedRevision: '7' }, '8'))
      .toMatchObject({ selectionMode: 'automatic', selectionOverriddenBy: 'managed-environment' });
  } finally {
    runtime.authStorage.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('native account labels, selection, and removal survive reopen and select the actual model credential', async () => {
  const root = await mkdtemp(join(tmpdir(), 'provider-accounts-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const labelsPath = join(agentDirectory, 'private', 'provider-account-labels.json');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  let runtime = await openNativeRuntime({ cwd, agentDirectory });
  const providerId = 'task49-account-provider';
  const modelId = 'task49-account-model';
  try {
    nativeModelsContext(runtime, () => 'account-session');
    await runtime.models.configureProvider({ expectedRevision: '0', configuration: {
      providerId, name: 'Local accounts', endpoint: 'http://127.0.0.1:18080/v1', protocol: 'chat-completions', credentialRef: null,
    } }, '1');
    await runtime.models.configureModel({ expectedRevision: '1', model: {
      modelId, provider: providerId, name: 'Local account model', modalities: ['text'], contextWindow: 8192,
      maxOutputTokens: 1024, reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
    } }, '2');
    let credentials = new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1', labelsPath);
    expect((await credentials.accounts(providerId, '2')).accounts).toEqual([]);
    const first = await credentials.write({ expectedRevision: '2', providerId, credential: { method: 'api-key', apiKey: 'local-secret-alpha' } }, '3');
    const second = await credentials.write({ expectedRevision: '3', providerId, credential: { method: 'api-key', apiKey: 'local-secret-beta' } }, '4');
    if (first.auth.status !== 'configured' || second.auth.status !== 'configured') throw new Error('Expected stored credential references');
    const firstRef = first.auth.credentialRef;
    const secondRef = second.auth.credentialRef;
    expect(firstRef).not.toBe(secondRef);
    const roster = await credentials.accounts(providerId, '4');
    expect(roster.accounts).toHaveLength(2);
    expect(roster.selectionMode).toBe('automatic');
    expect(roster.selectionOverriddenBy).toBeNull();
    expect(roster.accounts.every(account => !account.active)).toBe(true);
    for (const account of roster.accounts) {
      expect(account.credentialRef).toMatch(/^credential_[0-9a-f]{24}$/);
      expect(account.method).toBe('api-key');
      expect(account.disabled).toBe(false);
    }
    expect(JSON.stringify(roster)).not.toContain('local-secret');
    const labeled = await credentials.account(providerId, { action: 'label', expectedRevision: '4', credentialRef: secondRef, label: '  Work account  ' }, '5');
    expect(labeled.accounts.find(account => account.credentialRef === secondRef)?.label).toBe('Work account');
    expect(JSON.parse(await readFile(labelsPath, 'utf8'))).toEqual({ [secondRef]: 'Work account' });
    const selected = await credentials.account(providerId, { action: 'select', expectedRevision: '5', credentialRef: secondRef }, '6');
    expect(selected.selectionMode).toBe('pinned');
    expect(selected.accounts.filter(account => account.active).map(account => account.credentialRef)).toEqual([secondRef]);
    const selectedModel = await runtime.models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(selectedModel.nativeModel, 'account-session')).toBe('local-secret-beta');
    const resolved = await runtime.modelRegistry.resolver(selectedModel.nativeModel, 'other-session')({ lastChance: false, error: undefined });
    expect(resolved?.apiKey).toBe('local-secret-beta');
    expect(resolved?.credentialId && credentialReference(providerId, resolved.credentialId)).toBe(secondRef);

    runtime.authStorage.close();
    resetSettingsForTest();
    runtime = await openNativeRuntime({ cwd, agentDirectory });
    nativeModelsContext(runtime, () => 'reopened-account-session');
    credentials = new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1', labelsPath);
    const reopened = await credentials.accounts(providerId, '6');
    expect(reopened.accounts.find(account => account.credentialRef === secondRef)).toMatchObject({ active: true, label: 'Work account' });
    const reopenedModel = await runtime.models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(reopenedModel.nativeModel, 'reopened-account-session')).toBe('local-secret-beta');
    const switched = await credentials.account(providerId, { action: 'select', expectedRevision: '6', credentialRef: firstRef }, '7');
    expect(switched.accounts.filter(account => account.active).map(account => account.credentialRef)).toEqual([firstRef]);
    expect(await runtime.modelRegistry.getApiKey(reopenedModel.nativeModel, 'reopened-account-session')).toBe('local-secret-alpha');
    const removed = await credentials.account(providerId, { action: 'remove', expectedRevision: '7', credentialRef: secondRef }, '8');
    expect(removed.accounts.map(account => account.credentialRef)).toEqual([firstRef]);
    expect(removed.accounts[0]?.active).toBe(true);
    await expect(credentials.account(providerId, { action: 'select', expectedRevision: '8', credentialRef: secondRef }, '9')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    await credentials.account(providerId, { action: 'label', expectedRevision: '8', credentialRef: firstRef, label: 'Personal' }, '9');
    const cleared = await credentials.account(providerId, { action: 'label', expectedRevision: '9', credentialRef: firstRef, label: '   ' }, '10');
    expect(cleared.accounts[0]?.label).toBeUndefined();
    runtime.authStorage.close();
    resetSettingsForTest();
    runtime = await openNativeRuntime({ cwd, agentDirectory });
    nativeModelsContext(runtime, () => 'second-reopen-session');
    credentials = new NativeCredentials(runtime.authStorage, runtime.models, 'workspace_1', 'agent_1', labelsPath);
    expect((await credentials.accounts(providerId, '10')).accounts).toEqual([{ credentialRef: firstRef, method: 'api-key', active: true, disabled: false }]);
    const finalModel = await runtime.models.selection({ providerId, modelId });
    expect(await runtime.modelRegistry.getApiKey(finalModel.nativeModel, 'second-reopen-session')).toBe('local-secret-alpha');
    expect(runtime.authStorage.credentials.list(providerId)).toHaveLength(1);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});
