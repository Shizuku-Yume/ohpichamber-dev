import { describe, expect, test } from 'bun:test';
import { parseClassifierTestResult, routingStateSchema } from './routingApi';

const base = {
  available: true,
  autoReady: false,
  jevAvailable: true,
  tokenPresent: false,
  jevSource: 'zen-free',
  config: null,
  builtins: [],
};

const legacySources = [
  { id: 'typesafe', usable: false },
];

describe('routingStateSchema', () => {
  test('prefers the full classification over the legacy classifier view', () => {
    const state = routingStateSchema.parse({
      ...base,
      classifier: null,
      classification: {
        selected: 'openrouter',
        effective: 'openrouter',
        sources: [...legacySources, { id: 'openrouter', usable: true }, { id: 'vercel', usable: false }],
      },
    });
    expect(state.classifier?.effective).toBe('openrouter');
    expect(state.classifier?.sources.map((source) => source.id)).toEqual(['typesafe', 'openrouter', 'vercel']);
  });

  test('lists the Gemini source with its saved-key flag, which older servers leave out', () => {
    const state = routingStateSchema.parse({
      ...base,
      geminiKeyPresent: true,
      classification: { selected: 'gemini', effective: 'gemini', sources: [...legacySources, { id: 'gemini', usable: true }] },
    });
    expect(state.classifier?.effective).toBe('gemini');
    expect(state.classifier?.sources.map((source) => source.id)).toContain('gemini');
    expect(state.geminiKeyPresent).toBe(true);
    expect(routingStateSchema.parse(base).geminiKeyPresent).toBe(false);
    expect(parseClassifierTestResult({ ok: true, source: 'gemini', model: 'gemini-decision-1', ms: 160 })).toMatchObject({ source: 'gemini' });
  });

  test('reads a v2.0.2 server, which sends only the classifier view, and ignores retired sources', () => {
    const state = routingStateSchema.parse({ ...base, classifier: { selected: 'typesafe', effective: 'typesafe', sources: legacySources } });
    expect(state.classifier?.selected).toBe('typesafe');
    expect(state.classifier?.sources).toHaveLength(1);
    const retired = routingStateSchema.parse({
      ...base,
      classifier: {
        selected: 'zen-promo',
        effective: 'zen-key',
        sources: [{ id: 'zen-promo', usable: true }, { id: 'zen-key', usable: false }, ...legacySources],
      },
    });
    expect(retired.classifier?.selected).toBeNull();
    expect(retired.classifier?.effective).toBeNull();
    expect(retired.classifier?.sources.map((source) => source.id)).toEqual(['typesafe']);
  });

  test('a source this build does not know neither fails the state nor shows up', () => {
    const state = routingStateSchema.parse({
      ...base,
      classification: {
        selected: 'cloudflare',
        effective: 'typesafe',
        sources: [...legacySources, { id: 'cloudflare', usable: true }],
      },
    });
    expect(state.classifier?.selected).toBeNull();
    expect(state.classifier?.effective).toBe('typesafe');
    expect(state.classifier?.sources.map((source) => source.id)).toEqual(['typesafe']);
  });

  test('reads Off and enterprise mode, and a server that sends no enterprise flag as not enterprise', () => {
    const off = { selected: 'off', effective: null, sources: [{ id: 'off', usable: true }, ...legacySources] };
    const locked = routingStateSchema.parse({ ...base, jevAvailable: false, enterpriseMode: true, classification: off });
    expect(locked.enterpriseMode).toBe(true);
    expect(locked.classifier?.selected).toBe('off');
    expect(routingStateSchema.parse({ ...base, classification: off }).enterpriseMode).toBe(false);
  });

  test('reads a custom endpoint pick and its description, and a server without one as none', () => {
    const state = routingStateSchema.parse({
      ...base,
      customEndpoint: { url: 'https://jev.example.com/v1/systemone', model: 'jev-latest', keyPresent: true },
      classification: { selected: 'custom', effective: 'custom', sources: [...legacySources, { id: 'custom', usable: true }] },
    });
    expect(state.classifier?.effective).toBe('custom');
    expect(state.classifier?.sources.at(-1)).toEqual({ id: 'custom', usable: true });
    // A server from before the environment pin sends no `pinned`: editable.
    expect(state.customEndpoint).toEqual({ url: 'https://jev.example.com/v1/systemone', model: 'jev-latest', keyPresent: true, pinned: false });
    expect(routingStateSchema.parse(base).customEndpoint).toBeNull();
  });
});

// Every shape the server's testClassifier answers with must parse here.
describe('classifier test result', () => {
  test('parses success and each failure the server reports', () => {
    const answers = [
      { ok: true, source: 'typesafe', model: 'jev-latest', ms: 120 },
      { ok: false, reason: 'unavailable' },
      { ok: false, reason: 'http', status: 401, source: 'custom', model: 'm' },
      { ok: false, reason: 'timeout', source: 'gemini', model: 'm' },
      { ok: false, reason: 'unparsable', source: 'openrouter', model: 'm' },
      { ok: false, reason: 'network', message: 'ECONNREFUSED', source: 'vercel', model: 'm' },
    ];
    for (const answer of answers) {
      expect(parseClassifierTestResult(answer)).toEqual(answer);
    }
  });
});
