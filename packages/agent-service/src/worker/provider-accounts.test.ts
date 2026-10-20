import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { NativeCredentials } from './catalog-credentials.ts';
import { credentialReference } from './catalog-models.ts';
import { nativeModelsContext, openNativeRuntime } from './native-runtime.ts';

beforeEach(() => resetSettingsForTest());
afterEach(() => resetSettingsForTest());

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
