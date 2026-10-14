import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { CompletionRequest, CompletionResult, Model } from '@openchamber/agent-contract';
import type { DesktopSettings } from '@/lib/desktop';
import { canonicalClient } from '@/api/canonicalClient';
import { invalidateSettingsCache } from './persistence';
import { getRuntimeKey, switchRuntimeEndpoint } from './runtime-switch';
import { useConfigStore } from '@/stores/useConfigStore';
import { completionText, requestSmallModel, resolveSmallModel, SmallModelCompletionError } from './smallModelRequest';

const model = (provider: string, modelId: string): Model => ({
  provider, modelId, name: modelId, modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000,
  reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null,
});
let models: Model[];
let settings: Partial<DesktopSettings>;
let restorers: Array<() => void>;

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://utility.test', runtimeKey: `utility-${crypto.randomUUID()}` });
  invalidateSettingsCache();
  settings = {};
  models = [model('chosen', 'large'), model('other', 'haiku')];
  useConfigStore.setState({ currentProviderId: 'chosen', currentModelId: 'large' });
  const scope = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace-a', projectId: 'project-a', name: 'A' });
  const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => ({ workspaceId, revision: '0', models }));
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(settings));
  restorers = [() => scope.mockRestore(), () => catalog.mockRestore(), () => fetcher.mockRestore()];
});
afterEach(() => { for (const restore of restorers.reverse()) restore(); invalidateSettingsCache(); });

describe('canonical utility generation', () => {
  test('never switches a preferred provider to another subscription', async () => {
    expect(await resolveSmallModel({ directory: '/repo' })).toEqual({ workspaceId: 'workspace-a', selection: { providerId: 'chosen', modelId: 'large' } });
    models = [model('other', 'haiku')];
    expect((await resolveSmallModel({ directory: '/repo' })).selection).toBeNull();
  });

  test('scoped profile override is deliberate cross-provider intent', async () => {
    settings = { smallModelUseDefault: false, smallModelOverride: 'other/haiku' };
    expect((await resolveSmallModel({ directory: '/repo' })).selection).toEqual({ providerId: 'other', modelId: 'haiku' });
  });

  test('unavailable or malformed profile intent never silently redirects to the composer model', async () => {
    const complete = spyOn(canonicalClient, 'complete');
    restorers.push(() => complete.mockRestore());
    for (const override of ['other/missing', 'invalid-model-reference']) {
      settings = { smallModelUseDefault: false, smallModelOverride: override };
      invalidateSettingsCache();
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

  test('runtime changes during discovery never dispatch completion', async () => {
    const complete = spyOn(canonicalClient, 'complete');
    const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'other' });
      return { workspaceId, revision: '0', models };
    });
    restorers.push(() => complete.mockRestore(), () => catalog.mockRestore());
    await expect(requestSmallModel({ directory: '/repo', prompt: 'hello' }, { notifyOnError: false })).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
});
