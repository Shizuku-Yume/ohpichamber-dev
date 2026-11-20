import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UsageStats } from '@openchamber/agent-contract';
import { I18nProvider } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { UsageStatsView } from './UsageStatsView';
import { useUsageStatsStore, usageStatsKey } from './usageStatsStore';

const key = () => usageStatsKey(getRuntimeKey(), { range: '30d', projectDirectory: null });
const report: UsageStats = {
  range: { from: 1, to: 1000 }, sessions: 1, subagents: 0, prompts: 1, steps: 1,
  tokens: { input: 2, output: 3, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 5 }, cost: 0,
  tools: { mode: 'none' }, activeDays: 1, streak: 1, activity: [], providers: [], models: [], partial: false,
};
const render = () => renderToStaticMarkup(<I18nProvider><UsageStatsView /></I18nProvider>);
const serverState = useUsageStatsStore.getInitialState();
afterEach(() => { serverState.entries = {}; serverState.toolEntries = {}; });
describe('native usage report rendering', () => {
  test('unknown reasoning renders a dash and durationless tools show counts only', () => {
    Object.assign(serverState, {
      entries: { [key()]: { stats: report, loading: false, error: null, fetchedAt: 1000 } },
      toolEntries: {
        [key()]: {
          loading: false, error: null, tools: {
            totals: { calls: 3, succeeded: 2, failed: 0, unfinished: 1 },
            usage: [{ name: 'read', calls: 3, succeeded: 2, failed: 0, unfinished: 1, durationP50: null }], partial: false,
          }
        }
      },
    });
    const html = render();
    expect(html).toMatch(/Reasoning share<\/span><span[^>]*>—<\/span>/);
    expect(html).toContain('calls: 3');
    expect(html).not.toContain('median:');
    expect(html).not.toContain('NaN');
  });

  test('partial data exposes failed sessions even when no activity survived', () => {
    Object.assign(serverState, {
      entries: {
        [key()]: {
          stats: { ...report, prompts: 0, steps: 0, partial: true, errors: { session_bad: 'SESSION_READ_FAILED' } },
          loading: false, error: null, fetchedAt: 1000,
        }
      }
    });
    const html = render();
    expect(html).toContain('These statistics are incomplete.');
    expect(html).toContain('session_bad: SESSION_READ_FAILED');
  });

  test('unpriced model with pricing === null renders dash instead of $0.00 and counts reasoning tokens', () => {
    const unpricedModel = {
      providerId: 'CLIProxyAPI', modelId: 'gemini-3.8-flash', variant: null, steps: 5,
      tokens: { input: 100, output: 50, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 150 },
      cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, errorRate: 0,
    };
    const provider = {
      providerId: 'CLIProxyAPI', steps: 5, failedRequests: 0, errorRate: 0,
      tokens: unpricedModel.tokens, cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, modelsCount: 1,
    };
    const reportWithUnpriced: UsageStats = {
      ...report,
      tokens: { input: 100, output: 50, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 150 },
      providers: [provider],
      models: [unpricedModel],
    };
    Object.assign(serverState, {
      entries: { [key()]: { stats: reportWithUnpriced, loading: false, error: null, fetchedAt: 1000 } },
    });
    const html = render();
    // Cost tile and efficiency tiles render "—" for fully unpriced scope, not "$0.00"
    expect(html).toContain('gemini-3.8-flash');
    expect(html).toContain('· —');
    expect(html).not.toContain('· $0.00');
    // Tokens hint includes reasoning
    expect(html).toContain('Reasoning 25');
  });

  test('fully unpriced scope renders dash for Cost tile, cost/session, and cost/million', () => {
    const unpricedModel = {
      providerId: 'CLIProxyAPI', modelId: 'gemini-3.8-flash', variant: null, steps: 5,
      tokens: { input: 100, output: 50, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 150 },
      cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, errorRate: 0,
    };
    const reportUnpriced: UsageStats = {
      ...report,
      cost: 0,
      tokens: { input: 100, output: 50, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 150 },
      models: [unpricedModel],
      providers: [{
        providerId: 'CLIProxyAPI', steps: 5, failedRequests: 0, errorRate: 0,
        tokens: unpricedModel.tokens, cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, modelsCount: 1,
      }],
    };
    Object.assign(serverState, {
      entries: { [key()]: { stats: reportUnpriced, loading: false, error: null, fetchedAt: 1000 } },
    });
    const html = render();
    // The Cost stat tile has label "Cost" and value "—"
    expect(html).toMatch(/<span[^>]*>Cost<\/span><span[^>]*>—<\/span>/);
    // Cost / session and Cost per 1M tokens in EfficiencyTiles render "—"
    expect(html).toMatch(/<span[^>]*>Cost \/ session<\/span><span[^>]*>—<\/span>/);
    expect(html).toMatch(/<span[^>]*>Cost per 1M tokens<\/span><span[^>]*>—<\/span>/);
    // Tokens tile has non-truncated hint with whitespace-normal break-words
    expect(html).toContain('whitespace-normal break-words');
  });

  test('mixed pricing scope renders the priced sum with a partial pricing hint', () => {
    const pricedModel = {
      providerId: 'anthropic', modelId: 'claude-3-5-sonnet', variant: null, steps: 5,
      tokens: { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 150 },
      cost: 0.05, pricing: { inputPerMillionTokens: 3, outputPerMillionTokens: 15, cacheReadPerMillionTokens: null, cacheWritePerMillionTokens: null }, avgTtft: 500, avgTokensPerSecond: 30, errorRate: 0,
    };
    const unpricedModel = {
      providerId: 'CLIProxyAPI', modelId: 'gemini-3.8-flash', variant: null, steps: 5,
      tokens: { input: 100, output: 50, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 150 },
      cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, errorRate: 0,
    };
    const reportMixed: UsageStats = {
      ...report,
      cost: 0.05,
      tokens: { input: 200, output: 100, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 300 },
      models: [pricedModel, unpricedModel],
      providers: [
        { providerId: 'anthropic', steps: 5, failedRequests: 0, errorRate: 0, tokens: pricedModel.tokens, cost: 0.05, pricing: pricedModel.pricing, avgTtft: 500, avgTokensPerSecond: 30, modelsCount: 1 },
        { providerId: 'CLIProxyAPI', steps: 5, failedRequests: 0, errorRate: 0, tokens: unpricedModel.tokens, cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, modelsCount: 1 },
      ],
    };
    Object.assign(serverState, {
      entries: { [key()]: { stats: reportMixed, loading: false, error: null, fetchedAt: 1000 } },
    });
    const html = render();
    // Cost stat tile renders "$0.05" and "Partial pricing" hint
    expect(html).toMatch(/<span[^>]*>Cost<\/span><span[^>]*>\$0\.05<\/span>/);
    expect(html).toContain('Partial pricing');
  });

  test('renders provider comparison table and bars when multiple providers exist', () => {
    const p1 = {
      providerId: 'anthropic', steps: 10, failedRequests: 1, errorRate: 0.1,
      tokens: { input: 200, output: 100, reasoning: 30, cacheRead: 0, cacheWrite: 0, total: 300 },
      cost: 0.05, pricing: null, avgTtft: 800, avgTokensPerSecond: 50, modelsCount: 1,
    };
    const p2 = {
      providerId: 'CLIProxyAPI', steps: 5, failedRequests: 0, errorRate: 0,
      tokens: { input: 100, output: 50, reasoning: 25, cacheRead: 0, cacheWrite: 0, total: 150 },
      cost: 0, pricing: null, avgTtft: 1200, avgTokensPerSecond: 20, modelsCount: 1,
    };
    const reportWithComparison: UsageStats = {
      ...report,
      providers: [p1, p2],
      models: [],
    };
    Object.assign(serverState, {
      entries: { [key()]: { stats: reportWithComparison, loading: false, error: null, fetchedAt: 1000 } },
    });
    const html = render();
    expect(html).toContain('Provider comparison');
    expect(html).toContain('anthropic');
    expect(html).toContain('CLIProxyAPI');
    expect(html).toContain('10%');
  });

  test('a single-provider report still shows TTFT, tok/s and error rate without a comparison', () => {
    const onlyProvider = {
      providerId: 'anthropic', steps: 10, failedRequests: 1, errorRate: 0.1,
      tokens: report.tokens, cost: 0, pricing: null, avgTtft: 800, avgTokensPerSecond: 50, modelsCount: 1,
    };
    const reportSingle: UsageStats = {
      ...report,
      providers: [onlyProvider],
      avgTtft: 800,
      avgTokensPerSecond: 50,
      errorRate: 0.1,
    };
    Object.assign(serverState, {
      entries: { [key()]: { stats: reportSingle, loading: false, error: null, fetchedAt: 1000 } },
    });
    const html = render();
    expect(html).not.toContain('Provider comparison');
    expect(html).toMatch(/TTFT<\/span><span[^>]*>800\s?ms<\/span>/);
    expect(html).toMatch(/Tok\/s<\/span><span[^>]*>50 tok\/s<\/span>/);
    expect(html).toMatch(/Error rate<\/span><span[^>]*>10%<\/span>/);
  });

  test('report-wide metrics render dashes, not blanks, when the report has no performance data', () => {
    Object.assign(serverState, {
      entries: {
        [key()]: {
          stats: { ...report, providers: [], avgTtft: null, avgTokensPerSecond: null, errorRate: undefined },
          loading: false, error: null, fetchedAt: 1000,
        },
      },
    });
    const html = render();
    expect(html).toMatch(/TTFT<\/span><span[^>]*>—<\/span>/);
    expect(html).toMatch(/Error rate<\/span><span[^>]*>—<\/span>/);
  });
});
