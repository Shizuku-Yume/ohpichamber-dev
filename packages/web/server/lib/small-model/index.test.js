import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { configureAgentService, resetAgentService, completeSmallModel } from './client.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-small-model-'));
const previousDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = directory;
const { generateSmallModelText, describeSmallModel } = await import('./index.js');
const model = (provider, modelId) => ({ provider, modelId, name: modelId, modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null });
let models;
let calls;
let completion;
let settingsModelRoles = {};
const install = (request) => configureAgentService({ request }, { resolveWorkspaceScope: async workspaceId => ({ workspaceId, cwd: '/authorized' }) });
const transport = async (pathname, init = {}) => {
  calls.push({ pathname, body: init.body ? JSON.parse(init.body) : null });
  if (pathname.endsWith('/models')) return Response.json({ workspaceId: 'workspace-a', revision: '0', models, imageModels: [], defaults: { model: null, thinkingLevel: null }, planRoleAvailable: true });
  if (pathname.endsWith('/providers')) return Response.json({ workspaceId: 'workspace-a', revision: '0', providers: [] });
  if (pathname.endsWith('/completions')) {
    const input = JSON.parse(init.body);
    return Response.json({ completionId: input.completionId, selection: input.selection, ...completion });
  }
  if (pathname.endsWith('/settings')) {
    return Response.json({
      workspaceId: 'workspace-a',
      revision: '0',
      settings: [
        { id: 'modelRoles', value: settingsModelRoles }
      ]
    });
  }
  throw new Error(`Unexpected route ${pathname}`);
};
beforeEach(() => {
  models = [model('selected', 'large'), model('other', 'haiku')];
  calls = [];
  completion = { status: 'completed', output: { kind: 'text', text: ' generated ' }, finishReason: 'complete', usage: null };
  settingsModelRoles = {};
  fs.writeFileSync(path.join(directory, 'settings.json'), '{}');
  const preferences = path.join(directory, 'preferences.json');
  if (fs.existsSync(preferences)) fs.unlinkSync(preferences);
  install(transport);
});
afterAll(() => {
  resetAgentService();
  if (previousDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = previousDataDirectory;
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('Host canonical utility completion owner', () => {
  test('provider-local selection never dispatches to a different subscription', async () => {
    const generated = await generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'hello', preferredProviderID: 'selected', preferredModelID: 'large' });
    expect(generated).toMatchObject({ text: 'generated', providerID: 'selected', modelID: 'large' });
    const request = calls.find(call => call.pathname.endsWith('/completions')).body;
    expect(request.selection).toEqual({ providerId: 'selected', modelId: 'large' });
    expect(request.timeoutMs).toBe(60_000);
    expect(calls.every(call => call.pathname.startsWith('/api/agent/v1/workspaces/workspace-a/'))).toBe(true);
  });
  test('missing selected provider remains unavailable without fallback execution', async () => {
    await expect(generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'hello', preferredProviderID: 'absent', preferredModelID: 'absent' })).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.some(call => call.pathname.endsWith('/completions'))).toBe(false);
  });
  test('explicit unavailable models and invalid role overrides do not fall through to another model', async () => {
    await expect(generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'hello', model: 'other/missing', preferredProviderID: 'selected', preferredModelID: 'large' })).rejects.toMatchObject({ statusCode: 404 });
    settingsModelRoles = { smol: 'invalid-model-reference' };
    expect(await describeSmallModel({ workspaceId: 'workspace-a', preferredProviderID: 'selected', preferredModelID: 'large' })).toBeNull();
    expect(calls.some(call => call.pathname.endsWith('/completions'))).toBe(false);
  });
  test('a role selector carrying a thinking level resolves its model', async () => {
    // OMP stores `provider/model:effort`; the suffix names the next turn's
    // thinking level and is not part of the model ID.
    settingsModelRoles = { smol: 'other/haiku:high', commit: 'selected/large:medium' };
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'smol' })).toMatchObject({ providerID: 'other', modelID: 'haiku', source: 'modelRoles' });
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'commit' })).toMatchObject({ providerID: 'selected', modelID: 'large', source: 'modelRoles' });
    // A colon that is not a known level stays part of the model ID.
    settingsModelRoles = { smol: 'other/haiku:2026' };
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'smol' })).toBeNull();
  });
  test('OMP modelRoles resolve smol, commit, and default roles without cross-provider fallback', async () => {
    settingsModelRoles = { smol: 'other/haiku', commit: 'selected/large' };
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'smol' })).toMatchObject({ providerID: 'other', modelID: 'haiku', source: 'modelRoles' });
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'commit' })).toMatchObject({ providerID: 'selected', modelID: 'large', source: 'modelRoles' });
    settingsModelRoles = { default: 'other/haiku' };
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'commit' })).toMatchObject({ providerID: 'other', modelID: 'haiku', source: 'modelRoles' });
  });
  test('a role written with :thinkingLevel resolves to its model and asks for that effort', async () => {
    models = [{
      ...model('other', 'haiku'),
      reasoningEffortSupported: true,
      reasoningOptions: [
        { reasoningEffort: 'low', label: 'Low', budgetTokens: null },
        { reasoningEffort: 'high', label: 'High', budgetTokens: null },
      ],
    }];
    settingsModelRoles = { smol: 'other/haiku:high' };
    // The suffix must not stop the role from resolving to `other/haiku`.
    expect(await describeSmallModel({ workspaceId: 'workspace-a', role: 'smol' })).toMatchObject({ providerID: 'other', modelID: 'haiku', source: 'modelRoles' });
    await generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'hello', role: 'smol' });
    expect(calls.find(call => call.pathname.endsWith('/completions')).body).toMatchObject({
      selection: { providerId: 'other', modelId: 'haiku' }, reasoningEffort: 'high',
    });
  });
  test('structured errors preserve the provider failure instead of valid empty output', async () => {
    completion = { status: 'failed', error: { code: 'STRUCTURED_OUTPUT_INVALID', detail: 'Invalid provider output', retryable: false } };
    await expect(generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'hello', model: 'selected/large', responseSchema: { type: 'object' }, onOverflow: 'error' })).rejects.toMatchObject({ statusCode: 422, code: 'structured-output-invalid' });
    expect(calls.find(call => call.pathname.endsWith('/completions')).body).toMatchObject({ format: { kind: 'json', schema: { type: 'object' } }, overflow: 'reject' });
  });
  test('output reserve and request budget agree and excessive strict input is rejected', async () => {
    await generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'hello', model: 'selected/large', maxOutputTokens: 3000 });
    expect(calls.find(call => call.pathname.endsWith('/completions')).body.maxOutputTokens).toBe(2000);
    await expect(generateSmallModelText({ workspaceId: 'workspace-a', prompt: 'x'.repeat(40_000), model: 'selected/large', onOverflow: 'error' })).rejects.toMatchObject({ statusCode: 413, code: 'context-too-small' });
  });
  test('cancellation calls the captured service owner while completion is pending', async () => {
    const finished = Promise.withResolvers();
    const entered = Promise.withResolvers();
    let started;
    install(async (pathname, init) => {
      const body = JSON.parse(init.body);
      if (pathname.endsWith('/completions')) { started = body; entered.resolve(); return finished.promise; }
      expect(pathname).toBe(`/api/agent/v1/workspaces/workspace-a/completions/${started.completionId}/cancel`);
      expect(body.completionId).toBe(started.completionId);
      finished.resolve(Response.json({ completionId: started.completionId, selection: started.selection, status: 'cancelled', reason: 'requested' }));
      return Response.json({ completionId: started.completionId, status: 'cancelled' });
    });
    const controller = new AbortController();
    const input = { workspaceId: 'workspace-a', completionId: 'completion-a', selection: { providerId: 'selected', modelId: 'large' }, prompt: 'hello', format: { kind: 'text' }, overflow: 'reject', variant: null, reasoningEffort: null };
    const pending = completeSmallModel(input, { signal: controller.signal });
    await entered.promise;
    install(async () => { throw new Error('Cancellation reached another service'); });
    controller.abort();
    expect(await pending).toMatchObject({ status: 'cancelled', reason: 'requested' });
  });
});
