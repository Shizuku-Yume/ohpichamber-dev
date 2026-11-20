import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerOpenRouterModelInfoRoute } from './openrouter-model-info.js';
import { registerCommonRequestMiddleware } from '../server-frame/core-routes.js';

const ENDPOINT = '/api/openchamber/openrouter/model-info';

const listPayload = {
  data: [
    {
      id: 'anthropic/claude-sonnet-4.6',
      context_length: 1000000,
      top_provider: { context_length: 1000000, max_completion_tokens: 128000 },
      architecture: { input_modalities: ['text', 'image', 'file'] },
      pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003', input_cache_write: '0.00000375' },
      reasoning: { mandatory: false },
      supported_parameters: ['tools', 'tool_choice', 'reasoning'],
    },
    {
      id: 'xiaomi/mimo-v2-flash:free',
      context_length: 262144,
      top_provider: { context_length: 262144, max_completion_tokens: 65536 },
      architecture: { modality: 'text->text' },
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'no-output-limit/model',
      context_length: 128000,
      top_provider: { context_length: 128000, max_completion_tokens: null },
      architecture: { input_modalities: ['text'] },
      pricing: { prompt: '0.000001', completion: '0.000002' },
    },
    {
      id: 'no-context/model',
      context_length: null,
      top_provider: { context_length: null, max_completion_tokens: 4096 },
      architecture: { input_modalities: ['text'] },
      pricing: { prompt: '0.000001', completion: '0.000002' },
    },
    {
      id: 'no-price/model',
      context_length: 128000,
      top_provider: { context_length: 128000, max_completion_tokens: 4096 },
      architecture: { input_modalities: ['text'] },
      pricing: {},
      supported_parameters: ['tools'],
    },
  ],
};

const jsonResponse = (body, { ok = true, status = 200, contentLength } = {}) => ({
  ok,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-length' ? (contentLength ?? null) : null) },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const assertProblem = (response, status, code) => {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({ status, code, type: `urn:ohpichamber:problem:${code}` });
};

const createApp = ({ fetchImpl, enterprise = false, now, ttlMs, timeoutMs } = {}) => {
  const app = express();
  // The Host's shared middleware leaves this path unparsed for the route's own
  // bounded parser; include it so the test exercises production order.
  registerCommonRequestMiddleware(app, { express });
  registerOpenRouterModelInfoRoute(app, {
    fetchImpl,
    now,
    ttlMs,
    timeoutMs,
    enterprisePolicyOptions: {
      platform: 'linux',
      env: enterprise ? { OPENCHAMBER_ENTERPRISE_MODE: '1' } : {},
      readFile: () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    },
  });
  return app;
};

let warn;
afterEach(() => {
  warn?.mockRestore();
  warn = undefined;
});

describe('OpenRouter model info route', () => {
  it('fetches the public list with no ids, keys or cookies and no request body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(200);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/models');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(JSON.stringify(init)).not.toContain('claude-sonnet');
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('authorization');
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('cookie');
  });

  it('returns matched models with prices per million tokens', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    const res = await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(200);

    expect(res.body).toEqual({
      models: [{
        modelId: 'anthropic/claude-sonnet-4.6',
        catalog: {
          source: 'openrouter',
          input: ['text', 'image'],
          contextWindow: 1000000,
          maxTokens: 128000,
          cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
          reasoning: true,
          toolsSupported: true,
        },
      }],
    });
  });

  it('answers the shape the shared contract validates, without float noise', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{
        id: 'acme/noisy-prices',
        top_provider: { context_length: 131072, max_completion_tokens: 8192 },
        architecture: { input_modalities: ['text'] },
        // 3e-7 per token is 0.3 per million, which naive multiplication renders
        // as 0.30000000000000004.
        pricing: { prompt: '0.0000003', completion: '0', input_cache_read: '0.00000003' },
        supported_parameters: ['tools'],
      }],
    }));
    const app = createApp({ fetchImpl });

    const res = await request(app).post(ENDPOINT).send({ modelIds: ['acme/noisy-prices'] }).expect(200);
    const info = res.body.models[0].catalog;

    expect(info.cost).toEqual({ input: 0.3, output: 0, cacheRead: 0.03, cacheWrite: 0 });
    for (const price of Object.values(info.cost)) {
      expect(Number.isFinite(price)).toBe(true);
      expect(price).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isInteger(info.contextWindow) && info.contextWindow > 0).toBe(true);
    expect(Number.isInteger(info.maxTokens) && info.maxTokens > 0).toBe(true);
    expect(info.input.length).toBeGreaterThanOrEqual(1);
    expect(typeof info.reasoning).toBe('boolean');
    expect(info.source).toBe('openrouter');
  });

  it('matches the base id of a variant and keeps the requested id in the reply', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    const res = await request(app).post(ENDPOINT).send({ modelIds: ['mimo-v2-flash'] }).expect(200);

    expect(res.body.models).toEqual([{
      modelId: 'mimo-v2-flash',
      catalog: expect.objectContaining({ contextWindow: 262144, maxTokens: 65536, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, reasoning: false }),
    }]);
    expect(res.body.models[0].catalog).not.toHaveProperty('toolsSupported');
  });

  it('omits unknown ids and models without a context window, output limit or price', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    const res = await request(app)
      .post(ENDPOINT)
      .send({ modelIds: ['unknown/model', 'no-output-limit/model', 'no-context/model', 'no-price/model', 'anthropic/claude-sonnet-4.6'] })
      .expect(200);

    expect(res.body.models.map((model) => model.modelId)).toEqual(['anthropic/claude-sonnet-4.6']);
  });

  it('answers 403 enterprise_mode without making an outbound request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl, enterprise: true });

    const res = await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(403);

    expect(res.body).toMatchObject({ status: 403, code: 'enterprise_mode', type: 'urn:ohpichamber:problem:enterprise_mode' });
    expect(fetchImpl).not.toHaveBeenCalled();
    // Refused before the body is even parsed.
    await request(app).post(ENDPOINT).set('Content-Type', 'application/json').send('not json').expect(403);
  });

  it('answers 502 when OpenRouter fails and never as an empty success', async () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const app = createApp({ fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 503 })) });

    const res = await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(502);
    assertProblem(res, 502, 'PROVIDER_UNAVAILABLE');
  });

  it('answers 502 when the connection itself fails', async () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const app = createApp({ fetchImpl: vi.fn(async () => { throw new Error('socket closed'); }) });

    assertProblem(await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }), 502, 'PROVIDER_UNAVAILABLE');
  });

  it('answers 502 for a payload over the size cap, declared or streamed', async () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const oversized = 'x'.repeat(8 * 1024 * 1024 + 1);

    const declaredApp = createApp({ fetchImpl: vi.fn(async () => jsonResponse('{}', { contentLength: String(oversized.length) })) });
    assertProblem(await request(declaredApp).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }), 502, 'PROVIDER_UNAVAILABLE');

    const streamedApp = createApp({ fetchImpl: vi.fn(async () => jsonResponse(oversized)) });
    assertProblem(await request(streamedApp).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }), 502, 'PROVIDER_UNAVAILABLE');
  });

  it('answers 502 when OpenRouter never answers', async () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const app = createApp({
      timeoutMs: 20,
      fetchImpl: vi.fn(() => new Promise(() => { })),
    });

    assertProblem(await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }), 502, 'PROVIDER_UNAVAILABLE');
  });

  it('omits a listed model whose output limit is null', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    const res = await request(app).post(ENDPOINT).send({ modelIds: ['no-output-limit/model'] }).expect(200);
    expect(res.body.models).toEqual([]);
  });

  it('does not answer a bare basename two publishers share', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [
        {
          id: 'acme/jamba', top_provider: { context_length: 128000, max_completion_tokens: 4096 },
          architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' },
        },
        {
          id: 'other/jamba', top_provider: { context_length: 64000, max_completion_tokens: 2048 },
          architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' },
        },
      ],
    }));
    const app = createApp({ fetchImpl });

    const bare = await request(app).post(ENDPOINT).send({ modelIds: ['jamba'] }).expect(200);
    expect(bare.body.models).toEqual([]);

    const exact = await request(app).post(ENDPOINT).send({ modelIds: ['other/jamba'] }).expect(200);
    expect(exact.body.models).toHaveLength(1);
    expect(exact.body.models[0].catalog.contextWindow).toBe(64000);
  });

  it('answers 400 for an invalid body without calling OpenRouter', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    for (const body of [
      {},
      { modelIds: [] },
      { modelIds: [''] },
      { modelIds: ['   '] },
      { modelIds: ['x'.repeat(257)] },
      { modelIds: Array.from({ length: 201 }, (_, index) => `model-${index}`) },
      { modelIds: ['a'], extra: true },
      { modelIds: [3] },
    ]) {
      assertProblem(await request(app).post(ENDPOINT).send(body), 400, 'INVALID_REQUEST');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers 400 for a malformed JSON body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    assertProblem(await request(app).post(ENDPOINT).set('Content-Type', 'application/json').send('{"modelIds":'), 400, 'INVALID_REQUEST');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers 413 for a request body over 64 KiB without calling OpenRouter', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    // One valid id plus padding, so only the parser's size limit can refuse it.
    const body = JSON.stringify({ modelIds: ['anthropic/claude-sonnet-4.6'], padding: 'x'.repeat(65 * 1024) });
    assertProblem(await request(app).post(ENDPOINT).set('Content-Type', 'application/json').send(body), 413, 'PAYLOAD_TOO_LARGE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('serves repeated lookups from one cached fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listPayload));
    const app = createApp({ fetchImpl });

    await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(200);
    await request(app).post(ENDPOINT).send({ modelIds: ['xiaomi/mimo-v2-flash:free'] }).expect(200);

    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('OpenRouter model info cache', () => {
  it('refetches after the TTL and never caches a failure as an empty list', async () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    let nowMs = 0;
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error('offline');
      return jsonResponse(listPayload);
    });
    const app = createApp({ fetchImpl, now: () => nowMs, ttlMs: 1000 });

    const first = await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(200);
    expect(first.body.models).toHaveLength(1);
    nowMs = 2000;
    assertProblem(await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }), 502, 'PROVIDER_UNAVAILABLE');
    nowMs = 3000;
    const recovered = await request(app).post(ENDPOINT).send({ modelIds: ['anthropic/claude-sonnet-4.6'] }).expect(200);
    expect(recovered.body.models).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
