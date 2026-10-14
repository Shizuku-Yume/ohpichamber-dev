import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { canonicalClient } from '@/api/canonicalClient';
import { ChildStoreManager } from '@/sync/child-store';
import { registerSessionDirectory, setSyncRefs } from '@/sync/sync-refs';
import { useConfigStore } from '@/stores/useConfigStore';
import { invalidateSettingsCache } from './persistence';
import { switchRuntimeEndpoint } from './runtime-switch';
import { distillGoalObjective, summarizeSelectionForNotes } from './smallModel';

let stores: ChildStoreManager;
let restorers: Array<() => void>;
beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://notes.test', runtimeKey: `notes-${crypto.randomUUID()}` });
  invalidateSettingsCache();
  stores = new ChildStoreManager();
  setSyncRefs(stores, '/composer');
  registerSessionDirectory('source-session', '/source');
  const store = stores.ensureChild('/source', { bootstrap: false });
  store.setState({ message: { 'source-session': [{ messageId: 'source-answer', sessionId: 'source-session', turnId: 'source-turn', role: 'assistant', createdAt: 1, providerId: 'source', modelId: 'source-model', parts: [{ type: 'text', partId: 'source-text', content: 'Answer' }] }] } });
  useConfigStore.setState({ currentProviderId: 'composer', currentModelId: 'composer-model' });
  const workspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => {
    expect(directory).toBe('/source');
    return { workspaceId: 'workspace-source', projectId: 'project-source', name: 'Source' };
  });
  const models = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => ({ workspaceId, revision: '0', models: [{ provider: 'source', modelId: 'source-model', name: 'Source', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }] }));
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
  restorers = [() => workspace.mockRestore(), () => models.mockRestore(), () => fetcher.mockRestore()];
});
afterEach(() => { for (const restore of restorers.reverse()) restore(); stores.disposeAll(); invalidateSettingsCache(); });

describe('canonical note summaries', () => {
  const selectedText = 'Useful source context. '.repeat(30);
  test('source session scope and native assistant selection outrank the composer', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (workspaceId, input) => {
      expect(workspaceId).toBe('workspace-source');
      expect(input.selection).toEqual({ providerId: 'source', modelId: 'source-model' });
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'Keep this decision.' }, finishReason: 'complete', usage: null };
    });
    restorers.push(() => complete.mockRestore());
    expect(await summarizeSelectionForNotes(selectedText, 'source-session')).toBe('Keep this decision.');
  });
  test('provider failure and an unknown source scope keep the note verbatim', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => ({ completionId: input.completionId, selection: input.selection, status: 'failed', error: { code: 'PROVIDER_FAILURE', detail: 'Offline', retryable: true } }));
    restorers.push(() => complete.mockRestore());
    expect(await summarizeSelectionForNotes(selectedText, 'source-session')).toBe(selectedText.trim());
    expect(await summarizeSelectionForNotes(selectedText, 'unknown-session')).toBe(selectedText.trim());
    expect(complete).toHaveBeenCalledTimes(1);
  });
  test('short notes preserve exact wording without generation', async () => {
    const complete = spyOn(canonicalClient, 'complete');
    restorers.push(() => complete.mockRestore());
    expect(await summarizeSelectionForNotes(' Exact identifiers ', 'source-session')).toBe('Exact identifiers');
    expect(complete).not.toHaveBeenCalled();
  });
  test('goal distillation honors the target scope instead of the current composer workspace', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (workspaceId, input) => {
      expect(workspaceId).toBe('workspace-source');
      expect(input.selection).toEqual({ providerId: 'source', modelId: 'source-model' });
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'Verified completion criteria' }, finishReason: 'complete', usage: null };
    });
    restorers.push(() => complete.mockRestore());
    expect(await distillGoalObjective(selectedText, { directory: '/source', sessionId: 'source-session', preferred: { providerId: 'source', modelId: 'source-model' } })).toBe('Verified completion criteria');
  });
  test('cancelled goal distillation cannot return a fallback objective', async () => {
    const controller = new AbortController();
    controller.abort();
    const complete = spyOn(canonicalClient, 'complete');
    restorers.push(() => complete.mockRestore());
    await expect(distillGoalObjective(selectedText, { directory: '/source', signal: controller.signal })).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
});
