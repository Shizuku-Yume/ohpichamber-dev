import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { CompletionRequest, CompletionResult, Model } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { invalidateSettingsCache } from './persistence';
import { getRuntimeKey, switchRuntimeEndpoint } from './runtime-switch';
import { useConfigStore } from '@/stores/useConfigStore';
import { completionText, requestSmallModel, resolveSmallModel, SmallModelCompletionError } from './smallModelRequest';

const model = (provider: string, modelId: string): Model => ({
  provider, modelId, name: modelId, modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000,
  reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null,
});
const reasoningModel = (provider: string, modelId: string, efforts: string[]): Model => ({
  ...model(provider, modelId),
  reasoningEffortSupported: true,
  reasoningOptions: efforts.map((effort) => ({ reasoningEffort: effort, label: effort, budgetTokens: null })),
});
let models: Model[];
let ompSettingsRoles: Record<string, string>;
let restorers: Array<() => void>;

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://utility.test', runtimeKey: `utility-${crypto.randomUUID()}` });
  invalidateSettingsCache();
  ompSettingsRoles = {};
  models = [model('chosen', 'large'), model('other', 'haiku')];
  useConfigStore.setState({ currentProviderId: 'chosen', currentModelId: 'large', ompSettings: null, models: [] });
  const scope = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace-a', projectId: 'project-a', name: 'A' });
  const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async (workspaceId) => ({ workspaceId, revision: '0', models, defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false }));
  const settingsMock = spyOn(canonicalClient, 'getOmpSettings').mockImplementation(async (workspaceId) => ({
    workspaceId,
    revision: '0',
    totalCount: 1,
    settings: [{ id: 'modelRoles', type: 'record', value: ompSettingsRoles, default: null, configured: true, placement: { type: 'engine' } }],
  }));
  restorers = [() => scope.mockRestore(), () => catalog.mockRestore(), () => settingsMock.mockRestore()];
});
afterEach(() => { for (const restore of restorers.reverse()) restore(); invalidateSettingsCache(); });

describe('canonical utility generation', () => {
  test('never switches a preferred provider to another subscription', async () => {
    expect(await resolveSmallModel({ directory: '/repo' })).toMatchObject({ workspaceId: 'workspace-a', selection: { providerId: 'chosen', modelId: 'large' } });
    models = [model('other', 'haiku')];
    expect((await resolveSmallModel({ directory: '/repo' })).selection).toBeNull();
  });

  test('resolves utility completions via OMP modelRoles smol and commit', async () => {
    ompSettingsRoles = { smol: 'other/haiku', commit: 'chosen/large' };
    expect((await resolveSmallModel({ directory: '/repo' })).selection).toEqual({ providerId: 'other', modelId: 'haiku' });
    expect((await resolveSmallModel({ directory: '/repo', role: 'commit' })).selection).toEqual({ providerId: 'chosen', modelId: 'large' });
    ompSettingsRoles = { default: 'other/haiku' };
    expect((await resolveSmallModel({ directory: '/repo', role: 'commit' })).selection).toEqual({ providerId: 'other', modelId: 'haiku' });
  });

  test('a role chain that cannot resolve fails instead of redirecting to the composer model', async () => {
    ompSettingsRoles = { smol: '@tiny', tiny: '@smol' };
    const complete = spyOn(canonicalClient, 'complete');
    restorers.push(() => complete.mockRestore());
    await expect(requestSmallModel({ directory: '/repo', prompt: 'hello' }, { notifyOnError: false })).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });

  test('a role selector variant travels with the completion request', async () => {
    models = [model('chosen', 'large')];
    ompSettingsRoles = { smol: 'chosen/large#careful' };
    let captured: CompletionRequest | undefined;
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => {
      captured = input;
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'ok' }, finishReason: 'complete', usage: null };
    });
    restorers.push(() => complete.mockRestore());
    await requestSmallModel({ directory: '/repo', prompt: 'hello' }, { notifyOnError: false });
    expect(captured?.variant).toBe('careful');
  });

  test('unavailable or malformed role intent never silently redirects to the composer model', async () => {
    const complete = spyOn(canonicalClient, 'complete');
    restorers.push(() => complete.mockRestore());
    for (const override of ['other/missing', 'invalid-model-reference']) {
      ompSettingsRoles = { smol: override };
      await expect(requestSmallModel({ directory: '/repo', prompt: 'hello' }, { notifyOnError: false })).rejects.toThrow();
    }
    expect(complete).not.toHaveBeenCalled();
  });

  test('explicit full selection is preserved even when a smaller model exists', async () => {
    models.push(model('chosen', 'haiku'));
    const selection = { providerId: 'chosen', modelId: 'large' };
    let captured: CompletionRequest | undefined;
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => {
      captured = input;
      return { completionId: input.completionId, selection: input.selection, status: 'failed', error: { code: 'MODEL_UNAVAILABLE', detail: 'Unavailable exact model', retryable: false } };
    });
    restorers.push(() => complete.mockRestore());
    const result = await requestSmallModel({ directory: '/repo', prompt: 'hello', selection }, { notifyOnError: false });
    expect(captured?.selection).toEqual(selection);
    expect(captured?.overflow).toBe('truncate');
    expect(() => completionText(result)).toThrow(SmallModelCompletionError);
    expect(result).toMatchObject({ status: 'failed', error: { code: 'MODEL_UNAVAILABLE', retryable: false } });
  });

  test('cancel reaches the workspace owner before the pending completion settles', async () => {
    const pendingResult = Promise.withResolvers<CompletionResult>();
    const start = Promise.withResolvers<void>();
    let input!: CompletionRequest;
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, body) => {
      input = body; start.resolve(); return pendingResult.promise;
    });
    const cancel = spyOn(canonicalClient, 'cancelCompletion').mockImplementation(async (workspaceId, completionId) => {
      expect(workspaceId).toBe('workspace-a');
      expect(completionId).toBe(input.completionId);
      pendingResult.resolve({ completionId, selection: input.selection, status: 'cancelled', reason: 'requested' });
      return { completionId, status: 'cancelled' };
    });
    restorers.push(() => complete.mockRestore(), () => cancel.mockRestore());
    const controller = new AbortController();
    const pending = requestSmallModel({ directory: '/repo', prompt: 'hello', signal: controller.signal }, { notifyOnError: false });
    await start.promise;
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('runtime switch cancels the pending owner before replacing the endpoint and rejects late output', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { location: new URL('https://utility.test') }) });
    const entered = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<CompletionResult>();
    let request!: CompletionRequest;
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => { request = input; entered.resolve(); return finished.promise; });
    const cancel = spyOn(canonicalClient, 'cancelCompletion').mockImplementation(async (workspaceId, completionId) => {
      expect(workspaceId).toBe('workspace-a');
      expect(completionId).toBe(request.completionId);
      expect(getRuntimeKey()).not.toBe('new-owner');
      return { completionId, status: 'cancelled' };
    });
    restorers.push(() => complete.mockRestore(), () => cancel.mockRestore());
    try {
      const pending = requestSmallModel({ directory: '/repo', prompt: 'hello' }, { notifyOnError: false });
      await entered.promise;
      switchRuntimeEndpoint({ apiBaseUrl: 'https://new-owner.test', runtimeKey: 'new-owner' });
      finished.resolve({ completionId: request.completionId, selection: request.selection, status: 'completed', output: { kind: 'text', text: 'Old output' }, finishReason: 'complete', usage: null });
      await expect(pending).rejects.toThrow('Runtime changed');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  test('a reasoning-enabled completion asks for the effort the model advertises', async () => {
    models = [model('chosen', 'large'), reasoningModel('chosen', 'thinker', ['low', 'medium', 'high'])];
    ompSettingsRoles = { commit: 'chosen/thinker' };
    let captured: CompletionRequest | undefined;
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => {
      captured = input;
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'ok' }, finishReason: 'complete', usage: null };
    });
    restorers.push(() => complete.mockRestore());

    await requestSmallModel({ directory: '/repo', prompt: 'hello', role: 'commit', reasoning: true }, { notifyOnError: false });
    expect(captured?.reasoningEffort).toBe('medium');

    // Selecting the effort never invents a level the model does not offer.
    models = [model('chosen', 'large'), { ...reasoningModel('chosen', 'thinker', ['low', 'high']) }];
    await requestSmallModel({ directory: '/repo', prompt: 'hello', role: 'commit', reasoning: true }, { notifyOnError: false });
    expect(captured?.reasoningEffort).toBe('low');
  });

  test('the same completion without the toggle stays at a null effort, and a model without reasoning support is never given one', async () => {
    models = [model('chosen', 'plain'), reasoningModel('chosen', 'thinker', ['medium'])];
    let captured: CompletionRequest | undefined;
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => {
      captured = input;
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'ok' }, finishReason: 'complete', usage: null };
    });
    restorers.push(() => complete.mockRestore());

    await requestSmallModel({ directory: '/repo', prompt: 'hello', selection: { providerId: 'chosen', modelId: 'thinker' } }, { notifyOnError: false });
    expect(captured?.reasoningEffort).toBeNull();

    // Reasoning requested on a model with no advertised support: the request
    // is left exactly as it was, instead of being refused for a bad effort.
    models = [model('chosen', 'plain')];
    await requestSmallModel({
      directory: '/repo', prompt: 'hello', selection: { providerId: 'chosen', modelId: 'plain' }, reasoning: true,
    }, { notifyOnError: false });
    expect(captured?.reasoningEffort).toBeNull();
  });

  test('runtime changes during discovery never dispatch completion', async () => {
    const complete = spyOn(canonicalClient, 'complete');
    const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'other' });
      return { workspaceId, revision: '0', models, defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false };
    });
    restorers.push(() => complete.mockRestore(), () => catalog.mockRestore());
    await expect(requestSmallModel({ directory: '/repo', prompt: 'hello' }, { notifyOnError: false })).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
});
