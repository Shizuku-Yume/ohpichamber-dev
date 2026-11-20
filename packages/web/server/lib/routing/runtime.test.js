import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachmentHint, createRoutingRuntime, routingRequestTextOf } from './runtime.js';
import { createRoutingStore, resolveEffectiveConfig } from './store.js';
import { excerptHead, excerptHeadTail, turnsToHistory } from './history.js';
import { createJevClient, decidePermission, decideRouting } from './jev.js';
import { classifierEndpoint, parseCustomEndpointUrl, resolveClassifier } from './classifier.js';
import express from 'express';
import request from 'supertest';
import { registerRoutingRoutes } from './routes.js';

const AUTO = { providerId: 'openchamber', modelId: 'auto' };
const FALLBACK = { model: { providerID: 'anthropic', modelID: 'claude-sonnet-5' }, variant: 'medium' };
const HARD = { providerID: 'openai', modelID: 'gpt-6-astra' };
const SCOPE = { projectId: 'project_a', workspaceId: 'workspace_a', agentDirectoryId: 'agent_a', cwd: '/repo' };
const NOW = 1_000_000_000;
const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const readyConfig = () => {
  const config = resolveEffectiveConfig(null);
  config.enabled = true;
  config.fallback = FALLBACK;
  config.safetyNet = { enabled: true, threshold: 0.6 };
  config.categories = config.categories.map((category) => category.id === 'hard'
    ? { ...category, model: HARD, variant: 'high', agent: 'plan' }
    : category);
  return config;
};
const historyPage = (messages = [], turns = []) => ({
  sessionId: 's1', branch: { branchId: 'branch_a', branchVersion: '1', leafMessageId: messages.at(-1)?.messageId ?? null },
  turns, messages, nextCursor: null,
});
const settledHistory = (model, finishedAt = NOW - 60_000) => historyPage([
  {
    messageId: 'user_1', sessionId: 's1', turnId: 'turn_1', role: 'user', createdAt: finishedAt - 1000,
    parts: [{ partId: 'user_text', type: 'text', content: 'Investigate the regression.' }]
  },
  {
    messageId: 'answer_1', sessionId: 's1', turnId: 'turn_1', role: 'assistant', createdAt: finishedAt - 100,
    providerId: model.providerID, modelId: model.modelID,
    parts: [{ partId: 'answer_text', type: 'text', content: 'The bounded fix is ready.' },
    { partId: 'answer_tool', type: 'tool_result', toolCallId: 'tool_1', toolName: 'bash', output: 'private tool output', isError: false }]
  },
], [{
  turnId: 'turn_1', sessionId: 's1', runId: 'run_1', status: 'completed',
  userMessageId: 'user_1', assistantMessageIds: ['answer_1'], startedAt: finishedAt - 1000, finishedAt
}]);
const catalogModel = (model, variants) => ({
  provider: model.providerID, modelId: model.modelID, name: model.modelID,
  modalities: ['text'], contextWindow: 128_000, maxOutputTokens: 8_000,
  reasoningEffortSupported: variants.length > 0,
  reasoningOptions: variants.map((effort) => ({ reasoningEffort: effort, label: effort, budgetTokens: null })),
  pricing: null,
  variants: variants.map((variant) => ({ variant, label: variant, reasoningEffort: null })),
});

// Native service responses and durable routing files are the inputs. No SDK,
// legacy auth/config readers, or mocked runtime methods participate.
const makeRuntime = async ({
  config = readyConfig(), token = 'key', classifierSource = 'typesafe', customEndpoint = null,
  credentials = {}, credentialError = null, providerError = null, zenPromotionActive = true, enterprise = false, pinned = null,
  catalog = [], history = historyPage(), answers = { category: { choice: 'hard', confidence: 0.97 } },
  askError = null, sessionScope = SCOPE, workspaceScope = SCOPE, nowMs = NOW,
} = {}) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'routing-runtime-'));
  temporaryDirectories.push(dataDir);
  const store = createRoutingStore({ dataDir });
  await store.writeConfig(config);
  if (token) await store.writeToken(token);
  if (classifierSource !== null) await store.writeClassifierSource(classifierSource);
  if (customEndpoint) await store.writeCustomEndpoint(customEndpoint);
  const events = [];
  const state = { answers, askError, history, catalog, credentials, credentialError, providerError, enterprise, pinned, nowMs };
  const service = {
    getState: () => ({ phase: 'ready' }),
    request: vi.fn(async (resource) => {
      const url = new URL(resource, 'http://agent.internal');
      if (url.pathname === '/api/agent/v1/sessions/s1/history') {
        if (state.history instanceof Error) return Response.json({ detail: state.history.message, code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
        return Response.json(state.history);
      }
      if (url.pathname === '/api/agent/v1/workspaces/workspace_a/models') {
        if (state.catalog instanceof Error) return Response.json({ detail: state.catalog.message, code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
        return Response.json({ workspaceId: SCOPE.workspaceId, revision: '1', models: state.catalog, imageModels: [], defaults: { model: null, thinkingLevel: null }, planRoleAvailable: true });
      }
      if (url.pathname === '/api/agent/v1/workspaces/workspace_a/providers') {
        if (state.providerError) return Response.json({ detail: state.providerError.message, code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
        return Response.json({
          workspaceId: SCOPE.workspaceId, revision: '1',
          providers: Object.keys(state.credentials).map((providerId) => ({
            providerId, name: providerId,
            endpoint: null, protocol: null, authMethods: ['api-key'],
            auth: { status: 'configured', method: 'api-key', source: 'stored-credential', credentialRef: `cred_${providerId}` }
          })),
        });
      }
      throw new Error(`Unexpected Agent Service operation: ${resource}`);
    }),
  };
  const jev = {
    ask: vi.fn(async () => {
      if (state.askError) throw state.askError;
      return { answers: state.answers, ms: 12 };
    })
  };
  const resolveCredential = vi.fn(async (selection) => {
    if (state.credentialError) throw state.credentialError;
    return state.credentials[selection.providerId];
  });
  const runtime = createRoutingRuntime({
    dataDir, service, store, jev,
    resolveSessionScope: async (sessionId) => sessionId === 's1' ? sessionScope : null,
    resolveWorkspaceScope: async (workspaceId) => workspaceId === SCOPE.workspaceId ? workspaceScope : null,
    resolveCredential,
    enterpriseMode: () => state.enterprise,
    readPinnedEndpoint: () => state.pinned,
    zenPromotionActive,
    broadcastGlobalUiEvent: (event) => events.push(event),
    now: () => state.nowMs,
  });
  return { runtime, store, service, jev, events, state, resolveCredential };
};
const send = (extra = {}) => ({ sessionId: 's1', workspaceId: SCOPE.workspaceId, model: AUTO, requestText: 'find the root cause', ...extra });

describe('Gemini classifier HTTP composition', () => {
  it('saves, uses and removes a key without returning it to the client', async () => {
    const { runtime } = await makeRuntime({ token: null, classifierSource: 'off', zenPromotionActive: false });
    const app = express();
    registerRoutingRoutes(app, runtime);
    const saved = await request(app).put('/api/routing/classifier/gemini').send({ key: 'test-classifier-key' }).expect(200);
    expect(saved.body.geminiKeyPresent).toBe(true);
    expect(saved.body.classification.effective).toBe('gemini');
    expect(JSON.stringify(saved.body)).not.toContain('test-classifier-key');
    expect(await runtime.classifierEndpoint(SCOPE.workspaceId)).toMatchObject({ format: 'gemini', headers: { 'x-goog-api-key': 'test-classifier-key' } });
    const cleared = await request(app).delete('/api/routing/classifier/gemini').expect(200);
    expect(cleared.body.geminiKeyPresent).toBe(false);
    expect(cleared.body.classification.effective).toBe(null);
  });

  it('rejects empty and malformed keys without changing storage', async () => {
    const { runtime, store } = await makeRuntime();
    const app = express();
    registerRoutingRoutes(app, runtime);
    for (const key of ['', '   ', null, 1, 'x'.repeat(4001)]) {
      await request(app).put('/api/routing/classifier/gemini').send({ key }).expect(400);
    }
    expect(await store.readGeminiKey()).toBe(null);
  });

  it('refuses saves in enterprise mode and preserves a saved key when its write fails', async () => {
    const { runtime, store, state } = await makeRuntime({ enterprise: true });
    const app = express();
    registerRoutingRoutes(app, runtime);
    await request(app).put('/api/routing/classifier/gemini').send({ key: 'test-classifier-key' }).expect(403);
    expect(await store.readGeminiKey()).toBe(null);
    state.enterprise = false;
    const write = vi.spyOn(store, 'writeGeminiKey').mockRejectedValueOnce(new Error('unavailable'));
    await request(app).put('/api/routing/classifier/gemini').send({ key: 'test-classifier-key' }).expect(500);
    expect(await store.readClassifierSource()).toBe('typesafe');
    write.mockRestore();
  });
});

const image = (name, mediaType = 'image/png') => ({ attachmentId: 'attachment_1', name, mediaType, size: 12, uri: 'attachment://attachment_1' });

describe('attachment hint for the classifier', () => {
  it('describes a pasted image from its media type and names it', () => {
    expect(attachmentHint({ text: "what's wrong?", attachments: [image('screenshot.png')] }))
      .toBe('\n\n[The user attached an image: screenshot.png]');
  });
  it('counts several images and lists at most three names', () => {
    const attachments = ['a.png', 'b.jpg', 'c.webp', 'd.gif'].map((name) => image(name));
    expect(attachmentHint({ text: 'compare these', attachments })).toBe(
      '\n\n[The user attached 4 images: a.png, b.jpg, c.webp]',
    );
  });
  it('recognizes an image by its extension when the media type is generic', () => {
    expect(attachmentHint({ text: 'look', attachments: [image('FIGURE-1.PNG', 'application/octet-stream')] }))
      .toBe('\n\n[The user attached an image: FIGURE-1.PNG]');
  });
  it('stays silent without images, without attachments, or for non-image files', () => {
    expect(attachmentHint({ text: 'read the log', attachments: [image('notes.txt', 'text/plain')] })).toBe('');
    expect(attachmentHint({ text: 'sign this', attachments: [image('contract.pdf', 'application/pdf')] })).toBe('');
    expect(attachmentHint({ text: 'no files here' })).toBe('');
    expect(attachmentHint({ text: '' })).toBe('');
  });
  it('survives a malformed attachments value', () => {
    expect(attachmentHint({ text: 'hi', attachments: 'nope' })).toBe('');
    expect(attachmentHint({ text: 'hi', attachments: [{ mediaType: null, name: null }] })).toBe('');
  });
});

describe('routing request text', () => {
  it('appends the attachment fact to the words being classified', () => {
    const input = { text: "what's wrong?", attachments: [image('screenshot.png')] };
    expect(routingRequestTextOf(input)).toBe("what's wrong?\n\n[The user attached an image: screenshot.png]");
  });
  it('is the trimmed words alone when nothing image-shaped is attached', () => {
    const input = { text: '  fix the typo in README  ', attachments: [image('notes.txt', 'text/plain')] };
    expect(routingRequestTextOf(input)).toBe('fix the typo in README');
  });
});

describe('request content and decision policy', () => {
  it('bounds history excerpts and keeps the last three turns oldest first', () => {
    expect(excerptHead('a'.repeat(1000), 600)).toBe(`${'a'.repeat(600)} […]`);
    expect(excerptHeadTail(`${'h'.repeat(400)}${'m'.repeat(400)}${'t'.repeat(400)}`, 300, 300)).toBe(`${'h'.repeat(300)} […] ${'t'.repeat(300)}`);
    const turns = [1, 2, 3, 4].map((n) => ({ user: { text: `u${n}` }, assistant: { text: `a${n}` } }));
    expect(turnsToHistory(turns)).toEqual([2, 3, 4].flatMap((n) => [{ role: 'user', text: `u${n}` }, { role: 'assistant', text: `a${n}` }]));
  });
  it('routes only confident enabled known categories and holds at the safety threshold', () => {
    const categories = readyConfig().categories;
    expect(decideRouting({ choice: 'hard', confidence: 0.9 }, { categories, minConfidence: 0.6 }).reason).toBe('routed');
    expect(decideRouting({ choice: 'hard', confidence: 0.4 }, { categories, minConfidence: 0.6 })).toMatchObject({ category: null, reason: 'low-confidence' });
    expect(decideRouting({ choice: 'unknown', confidence: 0.99 }, { categories, minConfidence: 0.6 })).toMatchObject({ category: null, reason: 'unknown-category' });
    expect(decidePermission({ ask: { noul: 0.6 } }, { threshold: 0.6 }).hold).toBe(true);
    expect(() => decidePermission({}, { threshold: 0.6 })).toThrow(/ask score/);
  });
});

describe('native Auto selection', () => {
  it('leaves a non-Auto selection alone without consulting the service or classifier', async () => {
    const { runtime, service, jev } = await makeRuntime();
    expect(await runtime.resolveAutoSelection(send({ model: { providerId: 'anthropic', modelId: 'claude-opus-5' } }))).toBeNull();
    expect(service.request).not.toHaveBeenCalled();
    expect(jev.ask).not.toHaveBeenCalled();
  });
  it('selects the category model, its own variant and null agent, using canonical history', async () => {
    const { runtime, jev, events } = await makeRuntime({ history: settledHistory(FALLBACK.model) });
    const resolved = await runtime.resolveAutoSelection(send({ agent: 'build' }));
    expect(resolved).toMatchObject({ model: { providerId: HARD.providerID, modelId: HARD.modelID, reasoningEffort: 'high' }, agent: null });
    expect(jev.ask.mock.calls[0][0].state.history).toEqual([
      { role: 'user', text: 'Investigate the regression.' },
      { role: 'assistant', text: 'The bounded fix is ready.' },
    ]);
    expect(JSON.stringify(jev.ask.mock.calls[0][0])).not.toContain('private tool output');
    expect(events.at(-1)).toMatchObject({ type: 'openchamber:routing.decision', properties: { sessionId: 's1', category: 'hard', reason: 'routed', confidence: 0.97 } });
  });
  it('uses the fallback model and variant for an unbound category, with null agent', async () => {
    const { runtime } = await makeRuntime({ answers: { category: { choice: 'trivial', confidence: 0.99 } } });
    const resolved = await runtime.resolveAutoSelection(send({ requestText: 'fix typo', agent: 'build' }));
    expect(resolved).toMatchObject({ model: { providerId: FALLBACK.model.providerID, modelId: FALLBACK.model.modelID, reasoningEffort: 'medium' }, agent: null });
  });
  it.each([
    ['low-confidence', { category: { choice: 'hard', confidence: 0.3 } }],
    ['unknown-category', { category: { choice: 'unknown', confidence: 0.99 } }],
    ['unknown-category', { category: { choice: 'research', confidence: 0.99 } }],
  ])('falls back for %s rather than using a warm higher category', async (reason, answers) => {
    const config = readyConfig();
    config.categories = config.categories.map((category) => category.id === 'research' ? { ...category, enabled: false } : { ...category, agent: null });
    const { runtime } = await makeRuntime({ config, answers, history: settledHistory(HARD) });
    const resolved = await runtime.resolveAutoSelection(send());
    expect(resolved.model).toMatchObject({ providerId: FALLBACK.model.providerID, modelId: FALLBACK.model.modelID, reasoningEffort: 'medium' });
    expect(resolved.decision).toMatchObject({ reason, category: null });
    expect(resolved.decision.cacheHold).toBeUndefined();
  });
  it('uses the configured fallback on classifier failure and reports the failure', async () => {
    const { runtime } = await makeRuntime({ askError: Object.assign(new Error('Jev responded 401'), { status: 401 }) });
    expect(await runtime.resolveAutoSelection(send())).toMatchObject({
      model: { providerId: 'anthropic', modelId: FALLBACK.model.modelID }, decision: { reason: 'error', error: 'Jev responded 401' },
    });
  });
  it('uses the fallback while routing is disabled, but rejects Auto without a fallback', async () => {
    const disabled = await makeRuntime({ config: { ...readyConfig(), enabled: false } });
    expect((await disabled.runtime.resolveAutoSelection(send())).decision.reason).toBe('not-ready');
    expect(disabled.jev.ask).not.toHaveBeenCalled();
    const missing = await makeRuntime({ config: { ...readyConfig(), fallback: null } });
    await expect(missing.runtime.resolveAutoSelection(send())).rejects.toMatchObject({ status: 400 });
    expect(missing.jev.ask).not.toHaveBeenCalled();
  });
  it('rejects absent or conflicting Host scope before classifying or applying a selection', async () => {
    const missing = await makeRuntime({ sessionScope: null });
    await expect(missing.runtime.resolveAutoSelection(send())).rejects.toMatchObject({ status: 404, code: 'SESSION_NOT_FOUND' });
    const conflict = await makeRuntime();
    await expect(conflict.runtime.resolveAutoSelection(send({ workspaceId: 'workspace_other' }))).rejects.toMatchObject({ status: 403 });
    expect(missing.jev.ask).not.toHaveBeenCalled();
    expect(conflict.jev.ask).not.toHaveBeenCalled();
  });
  it('keeps provider catalog failures as service errors before classification', async () => {
    const { runtime, jev } = await makeRuntime({ providerError: new Error('Agent service unavailable') });
    await expect(runtime.resolveAutoSelection(send())).rejects.toMatchObject({ status: 503 });
    expect(jev.ask).not.toHaveBeenCalled();
  });
  it('continues on request-only context after history failure without claiming a warm cache', async () => {
    const { runtime, jev } = await makeRuntime({ history: new Error('history unavailable') });
    const resolved = await runtime.resolveAutoSelection(send());
    expect(resolved.decision.reason).toBe('routed');
    expect(resolved.decision.cacheHold).toBeUndefined();
    expect(jev.ask.mock.calls[0][0].state.history).toEqual([]);
  });
  it('drops only a variant the canonical model catalog excludes', async () => {
    const made = await makeRuntime({
      catalog: [catalogModel(HARD, ['low'])],
    });
    const resolved = await made.runtime.resolveAutoSelection(send());
    expect(resolved.model).toMatchObject({ providerId: HARD.providerID, modelId: HARD.modelID, reasoningEffort: null });
    expect(resolved.decision.variant).toBeNull();
    const known = await makeRuntime({ catalog: [catalogModel(HARD, ['high'])] });
    expect((await known.runtime.resolveAutoSelection(send())).model.reasoningEffort).toBe('high');
    const unavailable = await makeRuntime({ catalog: new Error('catalog unavailable') });
    expect((await unavailable.runtime.resolveAutoSelection(send())).model.reasoningEffort).toBe('high');
  });
});

describe('prompt-cache hysteresis from settled native history', () => {
  const cacheConfig = () => {
    const config = readyConfig();
    config.categories = config.categories.map((category) => ({ ...category, agent: null }));
    return config;
  };
  const route = async ({ choice = 'trivial', config = cacheConfig(), model = HARD, age = 60_000, history } = {}) => {
    const made = await makeRuntime({ config, history: history ?? settledHistory(model, NOW - age), answers: { category: { choice, confidence: 0.95 } } });
    return made.runtime.resolveAutoSelection(send({ agent: 'build' }));
  };
  it('holds a downward move on the warm model and reports the requested lower category', async () => {
    const resolved = await route();
    expect(resolved.model).toMatchObject({ providerId: HARD.providerID, modelId: HARD.modelID, reasoningEffort: 'high' });
    expect(resolved.agent).toBeNull();
    expect(resolved.decision).toMatchObject({ category: 'hard', cacheHold: { requested: 'trivial' } });
  });
  it('lets upward moves through immediately and releases downward moves at cache expiry', async () => {
    expect((await route({ choice: 'hard', model: FALLBACK.model })).decision.category).toBe('hard');
    expect((await route({ age: 5 * 60_000 - 1 })).decision.category).toBe('hard');
    expect((await route({ age: 5 * 60_000 })).decision.category).toBe('trivial');
  });
  it('does not hold when disabled, a different agent is required, or the category is user-defined', async () => {
    expect((await route({ config: { ...cacheConfig(), preserveCache: false } })).decision.category).toBe('trivial');
    expect((await route({ config: readyConfig() })).decision.category).toBe('trivial');
    const config = cacheConfig();
    config.categories.push({ id: 'docs', builtin: false, enabled: true, name: 'Docs', description: 'Write docs', model: null, variant: null, agent: null });
    expect((await route({ choice: 'docs', config })).decision.category).toBe('docs');
  });
  it('ignores unfinished answers and uses the most recent settled model even when another request is pending', async () => {
    const pending = {
      messageId: 'pending', sessionId: 's1', turnId: 'turn_pending', role: 'user', createdAt: NOW,
      parts: [{ partId: 'pending_text', type: 'text', content: 'push it' }]
    };
    const settled = settledHistory(HARD);
    const pendingTurn = {
      turnId: 'turn_pending', sessionId: 's1', runId: 'run_pending', status: 'running',
      userMessageId: 'pending', assistantMessageIds: [], startedAt: NOW
    };
    expect((await route({ history: historyPage([...settled.messages, pending], [...settled.turns, pendingTurn]) })).decision.category).toBe('hard');
    const unfinished = settledHistory(HARD);
    unfinished.turns[0].status = 'running';
    delete unfinished.turns[0].finishedAt;
    expect((await route({ history: unfinished })).decision.category).toBe('trivial');
    expect((await route({ history: historyPage() })).decision.category).toBe('trivial');
  });
  it('keeps completed context but does not invent cache age when a Turn has no finishedAt', async () => {
    const history = settledHistory(HARD);
    delete history.turns[0].finishedAt;
    expect((await route({ history })).decision.category).toBe('trivial');
  });
});

describe('permission safety', () => {
  const permission = {
    approvalId: 'approval_a', sessionId: 's1', turnId: 'turn_a', toolCallId: 'tool_a',
    version: '1', epoch: '1', workerGeneration: 'worker_a', requestedAt: NOW, status: 'pending',
    toolName: 'bash', actionType: 'bash_command', commandSummary: 'git push --force origin main',
    details: { command: 'git push --force origin main' }
  };
  it('holds risky requests across reconciliation, and forgets them after resolution', async () => {
    const { runtime, jev, state } = await makeRuntime({ answers: { ask: { noul: 0.9 }, kind: { choice: 'git_history' } } });
    expect(await runtime.evaluatePermission(permission)).toEqual({ action: 'hold', score: 0.9, kind: 'git_history' });
    state.answers = { ask: { noul: 0.1 } };
    expect(await runtime.evaluatePermission(permission)).toEqual({ action: 'hold', score: 0.9, kind: 'git_history' });
    expect(jev.ask.mock.calls[0][0].state.permission).toEqual({
      type: 'bash_command', toolName: 'bash',
      commandSummary: permission.commandSummary, details: permission.details
    });
    expect(jev.ask).toHaveBeenCalledTimes(1);
    expect(runtime.heldPermissions()).toEqual([{ permissionId: 'approval_a', score: 0.9, kind: 'git_history' }]);
    runtime.forgetPermission(permission.approvalId);
    expect(runtime.heldPermissions()).toEqual([]);
    expect((await runtime.evaluatePermission(permission)).action).toBe('accept');
  });
  it('accepts only a well-formed low-risk verdict, independently of Auto being enabled', async () => {
    const { runtime } = await makeRuntime({ config: { ...readyConfig(), enabled: false }, answers: { ask: { noul: 0.1 }, kind: { choice: 'read_only' } } });
    expect(await runtime.evaluatePermission(permission)).toEqual({ action: 'accept', score: 0.1, kind: 'read_only' });
    expect(await runtime.evaluatePermission({})).toEqual({ action: 'hold' });
  });
  it('holds on classifier failure or malformed verdict and retries without caching failure', async () => {
    const { runtime, state, events } = await makeRuntime({ askError: new Error('classifier unavailable') });
    expect(await runtime.evaluatePermission(permission)).toEqual({ action: 'hold', skipped: 'classifier unavailable' });
    expect(events.at(-1).type).toBe('openchamber:routing.safety-skipped');
    state.askError = null;
    state.answers = {};
    expect((await runtime.evaluatePermission(permission)).action).toBe('hold');
    state.answers = { ask: { noul: 0.1 } };
    expect((await runtime.evaluatePermission(permission)).action).toBe('accept');
  });
  it('keeps provider unavailability and credential-service failure from approving a pending request', async () => {
    const off = await makeRuntime({ classifierSource: 'off' });
    expect(await off.runtime.evaluatePermission(permission)).toEqual({ action: 'hold', unavailable: true });
    expect(off.jev.ask).not.toHaveBeenCalled();
    const failed = await makeRuntime({ token: null, classifierSource: 'openrouter', credentials: { openrouter: { type: 'api_key', key: 'private-key' } }, credentialError: Object.assign(new Error('credential unavailable'), { status: 503 }) });
    await expect(failed.runtime.evaluatePermission(permission)).rejects.toMatchObject({ status: 503 });
    expect(failed.jev.ask).not.toHaveBeenCalled();
  });
  it('expires a held verdict rather than letting stale classification survive indefinitely', async () => {
    const { runtime, state } = await makeRuntime({ answers: { ask: { noul: 0.9 } } });
    await runtime.evaluatePermission(permission);
    state.nowMs += 15 * 60_000;
    state.answers = { ask: { noul: 0.1 } };
    expect((await runtime.evaluatePermission(permission)).action).toBe('accept');
  });
  it('does not reuse an approved verdict across worker or epoch changes and keeps sibling requests independent', async () => {
    const { runtime, state, jev } = await makeRuntime({ answers: { ask: { noul: 0.1 } } });
    expect((await runtime.evaluatePermission(permission)).action).toBe('accept');
    state.answers = { ask: { noul: 0.9 } };
    expect((await runtime.evaluatePermission({ ...permission, workerGeneration: 'worker_b' })).action).toBe('hold');
    expect((await runtime.evaluatePermission({ ...permission, workerGeneration: 'worker_b', epoch: 'epoch_b' })).action).toBe('hold');
    expect((await runtime.evaluatePermission({ ...permission, approvalId: 'approval_sibling' })).action).toBe('hold');
    runtime.forgetPermission(permission.approvalId);
    expect(runtime.heldPermissions().map((entry) => entry.permissionId)).toEqual(['approval_sibling']);
    expect(jev.ask).toHaveBeenCalledTimes(4);
  });
  it('does not classify terminal approvals or requests outside Host session scope', async () => {
    const made = await makeRuntime({ sessionScope: null });
    await expect(made.runtime.evaluatePermission(permission)).rejects.toMatchObject({ status: 404 });
    expect(await made.runtime.evaluatePermission({ ...permission, version: '2', status: 'revoked', resolvedAt: NOW + 1 })).toEqual({ action: 'hold' });
    expect(made.jev.ask).not.toHaveBeenCalled();
  });
  it('rechecks enterprise availability and changed safety thresholds before using a cached acceptance', async () => {
    const made = await makeRuntime({ answers: { ask: { noul: 0.4 } } });
    expect((await made.runtime.evaluatePermission(permission)).action).toBe('accept');
    made.state.enterprise = true;
    expect(await made.runtime.evaluatePermission(permission)).toEqual({ action: 'hold', unavailable: true });
    expect(made.jev.ask).toHaveBeenCalledTimes(1);
    made.state.enterprise = false;
    await made.runtime.updateConfig({ ...readyConfig(), safetyNet: { enabled: true, threshold: 0.3 } });
    expect((await made.runtime.evaluatePermission(permission)).action).toBe('hold');
    expect(made.jev.ask).toHaveBeenCalledTimes(2);
  });
});

describe('classifier policy and durable settings', () => {
  it('honors Off, unavailable picks and explicit native provider keys without a promotional fallback', () => {
    expect(resolveClassifier({ selected: 'off', typesafeKey: 'key', openrouterKey: 'key', zenPromotionActive: true }).effective).toBeNull();
    expect(resolveClassifier({ selected: 'typesafe', openrouterKey: 'key', zenPromotionActive: true }).effective).toBe('openrouter');
    expect(resolveClassifier({ selected: 'typesafe', zenPromotionActive: true }).effective).toBeNull();
    expect(resolveClassifier({ selected: 'openrouter', openrouterKey: 'key', typesafeKey: 'other', zenPromotionActive: true }).effective).toBe('openrouter');
  });
  it('persists a chosen source and token so later reads observe the new selection', async () => {
    const { runtime, store } = await makeRuntime({ token: null, classifierSource: 'off' });
    await runtime.setToken('ts-secret');
    expect(await runtime.describe()).toMatchObject({ autoReady: true, classification: { selected: 'typesafe', effective: 'typesafe' } });
    expect(await store.readToken()).toBe('ts-secret');
    await runtime.setClassifierSource('off');
    expect((await runtime.describe()).jevAvailable).toBe(false);
    await expect(runtime.setClassifierSource('unknown')).rejects.toMatchObject({ status: 400 });
    expect(await store.readClassifierSource()).toBe('off');
    await runtime.clearToken();
    expect((await runtime.describe()).tokenPresent).toBe(false);
  });
  it('round-trips valid config and preserves it after an invalid update', async () => {
    const { runtime, store } = await makeRuntime();
    const config = { ...readyConfig(), minConfidence: 0.8, preserveCache: false };
    await runtime.updateConfig(config);
    expect((await runtime.describe()).config).toEqual(config);
    await expect(runtime.updateConfig({ ...config, minConfidence: 2 })).rejects.toMatchObject({ status: 400 });
    expect(await store.readConfig()).toEqual(config);
  });
  it('saves the custom request URL exactly, hides keys, keeps an omitted key and clears only on null', async () => {
    const { runtime, store } = await makeRuntime();
    const url = 'https://jev.example/v1/decision';
    await runtime.setCustomEndpoint({ url: ` ${url}#ignored `, model: ' jev-x ', key: ' custom-secret ' });
    expect(await runtime.describe()).toMatchObject({ customEndpoint: { url, model: 'jev-x', keyPresent: true }, classification: { effective: 'custom' } });
    expect(JSON.stringify(await runtime.describe())).not.toContain('custom-secret');
    await runtime.setCustomEndpoint({ url, model: 'jev-y' });
    expect((await store.readCustomEndpoint()).key).toBe('custom-secret');
    await runtime.setCustomEndpoint({ url, model: 'jev-z', key: null });
    expect((await store.readCustomEndpoint()).key).toBeUndefined();
    await expect(runtime.setCustomEndpoint({ url: 'file:///etc/hosts', model: 'm' })).rejects.toMatchObject({ status: 400 });
    expect((await store.readCustomEndpoint()).url).toBe(url);
  });
  it('checks enterprise policy at use time and refuses provider entry without losing stored picks', async () => {
    const { runtime, store, state, jev } = await makeRuntime();
    state.enterprise = true;
    expect(await runtime.classifierEndpoint(SCOPE.workspaceId)).toBeNull();
    await expect(runtime.setToken('secret')).rejects.toMatchObject({ status: 403 });
    await expect(runtime.setClassifierSource('openrouter')).rejects.toMatchObject({ status: 403 });
    await expect(runtime.setCustomEndpoint({ url: 'https://jev.example/decision', model: 'm' })).rejects.toMatchObject({ status: 403 });
    await expect(runtime.testClassifier({ url: 'https://jev.example/decision', model: 'm' })).rejects.toMatchObject({ status: 403 });
    expect(await store.readClassifierSource()).toBe('typesafe');
    expect(jev.ask).not.toHaveBeenCalled();
    state.enterprise = false;
    expect(await runtime.classifierEndpoint(SCOPE.workspaceId)).not.toBeNull();
  });
  it('uses only the administrator-pinned endpoint in enterprise mode, permits Off and never publishes its key', async () => {
    const pinned = { url: 'https://company.example/decision', model: 'jev-org', key: 'org-secret' };
    const { runtime, state } = await makeRuntime({ enterprise: true, pinned });
    expect(await runtime.describe()).toMatchObject({ classification: { selected: 'custom', effective: 'custom' }, customEndpoint: { url: pinned.url, pinned: true } });
    expect(JSON.stringify(await runtime.describe())).not.toContain('org-secret');
    await expect(runtime.clearCustomEndpoint()).rejects.toMatchObject({ status: 409 });
    await expect(runtime.setCustomEndpoint({ url: 'https://other.example', model: 'm' })).rejects.toMatchObject({ status: 409 });
    await runtime.setClassifierSource('off');
    expect(await runtime.classifierEndpoint(SCOPE.workspaceId)).toBeNull();
    await runtime.setClassifierSource('custom');
    expect((await runtime.classifierEndpoint(SCOPE.workspaceId)).url).toBe(pinned.url);
    state.pinned = null;
    expect(await runtime.classifierEndpoint(SCOPE.workspaceId)).toBeNull();
  });
  it('requires an authorized workspace before resolving any classifier endpoint', async () => {
    const { runtime, service, resolveCredential } = await makeRuntime();
    await expect(runtime.classifierEndpoint()).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(runtime.classifierEndpoint('workspace_other')).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(service.request).not.toHaveBeenCalled();
    expect(resolveCredential).not.toHaveBeenCalled();
  });
  it('describes catalog presence without resolving keys, then resolves only the selected provider at use time', async () => {
    const { runtime, state, resolveCredential, jev } = await makeRuntime({
      token: null, classifierSource: 'openrouter', credentials: {
        openrouter: { type: 'api_key', key: 'private-key' }, 'vercel-ai-gateway': { type: 'api_key', key: 'unselected-secret' },
      }
    });
    const described = await runtime.describe(SCOPE.workspaceId);
    expect(described).toMatchObject({ jevAvailable: true, classification: { effective: 'openrouter' } });
    expect(resolveCredential).not.toHaveBeenCalled();
    expect(JSON.stringify(described)).not.toContain('private-key');
    await runtime.resolveAutoSelection(send());
    expect(resolveCredential).toHaveBeenCalledWith({ workspaceId: SCOPE.workspaceId, agentDirectoryId: SCOPE.agentDirectoryId, providerId: 'openrouter', credentialRef: 'cred_openrouter', purpose: 'routing' });
    expect(resolveCredential).toHaveBeenCalledTimes(1);
    expect(jev.ask.mock.calls.at(-1)[1].headers.authorization).toBe('Bearer private-key');
    state.credentialError = Object.assign(new Error('credential unavailable'), { status: 503 });
    await expect(runtime.resolveAutoSelection(send())).rejects.toMatchObject({ status: 503 });
    state.providerError = new Error('catalog unavailable');
    await expect(runtime.describe(SCOPE.workspaceId)).rejects.toMatchObject({ status: 503 });
  });
});

describe('classifier probe and HTTP boundary', () => {
  it('names HTTP, timeout and malformed-answer failures, and does not mutate stored settings', async () => {
    const { runtime, state, store } = await makeRuntime({ answers: { probe: { choice: 'blue', confidence: 0.98 } } });
    expect(await runtime.testClassifier()).toMatchObject({ ok: true, source: 'typesafe', ms: 12 });
    state.askError = Object.assign(new Error('denied'), { status: 401 });
    expect(await runtime.testClassifier()).toMatchObject({ ok: false, reason: 'http', status: 401 });
    state.askError = Object.assign(new Error('timeout'), { code: 'timeout' });
    expect(await runtime.testClassifier()).toMatchObject({ ok: false, reason: 'timeout' });
    state.askError = null;
    state.answers = {};
    expect(await runtime.testClassifier()).toMatchObject({ ok: false, reason: 'unparsable' });
    expect(await store.readClassifierSource()).toBe('typesafe');
  });
  it('tests draft custom fields without storing them and without returning secret material', async () => {
    const saved = { url: 'https://old.example/decision', model: 'm', key: 'saved-secret' };
    const { runtime, store, jev } = await makeRuntime({ customEndpoint: saved, answers: { probe: { choice: 'blue', confidence: 0.98 } } });
    const result = await runtime.testClassifier({ url: 'https://new.example/decision', model: 'jev-new', key: '' });
    expect(result).toMatchObject({ ok: true, source: 'custom', model: 'jev-new' });
    expect(jev.ask.mock.calls.at(-1)[1].headers.authorization).toBe('Bearer saved-secret');
    expect(await store.readCustomEndpoint()).toEqual(saved);
    expect(JSON.stringify(result)).not.toContain('saved-secret');
  });
  it('sends the selected endpoint credentials only in HTTP authorization and sends its exact URL/model', async () => {
    const requests = [];
    const client = createJevClient({
      fetchImpl: async (url, init) => {
        requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return Response.json({ answers: { probe: { choice: 'blue', confidence: 0.98 } } });
      }
    });
    const endpoint = classifierEndpoint('custom', { customEndpoint: { url: 'https://company.example/arbitrary/decision', model: 'jev-org', key: 'private-key' } });
    await client.ask({ state: {}, questions: {} }, endpoint);
    expect(requests[0]).toMatchObject({ url: endpoint.url, headers: { authorization: 'Bearer private-key' }, body: { model: 'jev-org' } });
    expect(JSON.stringify(requests[0].body)).not.toContain('private-key');
  });
  it('rejects unsafe URLs and embedded credentials rather than rewriting them', () => {
    expect(parseCustomEndpointUrl(' https://company.example/decision#fragment ')).toBe('https://company.example/decision');
    expect(() => parseCustomEndpointUrl('https://user:secret@company.example/decision')).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => parseCustomEndpointUrl('file:///etc/passwd')).toThrow(expect.objectContaining({ status: 400 }));
  });
});
