import React from 'react';
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
  tools: { mode: 'none' }, activeDays: 1, streak: 1, activity: [], models: [], partial: false,
};
const render = () => renderToStaticMarkup(<I18nProvider><UsageStatsView /></I18nProvider>);
const serverState = useUsageStatsStore.getInitialState();
afterEach(() => { serverState.entries = {}; serverState.toolEntries = {}; });
describe('native usage report rendering', () => {
  test('unknown reasoning renders a dash and durationless tools show counts only', () => {
    Object.assign(serverState, {
      entries: { [key()]: { stats: report, loading: false, error: null, fetchedAt: 1000 } },
      toolEntries: { [key()]: { loading: false, error: null, tools: {
        totals: { calls: 3, succeeded: 2, failed: 0, unfinished: 1 },
        usage: [{ name: 'read', calls: 3, succeeded: 2, failed: 0, unfinished: 1, durationP50: null }], partial: false,
      } } },
    });
    const html = render();
    expect(html).toMatch(/Reasoning share<\/span><span[^>]*>—<\/span>/);
    expect(html).toContain('calls: 3');
    expect(html).not.toContain('median:');
    expect(html).not.toContain('NaN');
  });

  test('partial data exposes failed sessions even when no activity survived', () => {
    Object.assign(serverState, { entries: { [key()]: {
      stats: { ...report, prompts: 0, steps: 0, partial: true, errors: { session_bad: 'SESSION_READ_FAILED' } },
      loading: false, error: null, fetchedAt: 1000,
    } } });
    const html = render();
    expect(html).toContain('These statistics are incomplete.');
    expect(html).toContain('session_bad: SESSION_READ_FAILED');
  });
});
