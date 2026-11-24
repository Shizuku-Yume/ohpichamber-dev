import { describe, expect, test } from 'bun:test';
import type { OmpSettingValue } from '@openchamber/agent-contract';
import {
  inferUnit,
  isSentinelOption,
  optionSlug,
  readSummaryPresetChanges,
  readSummaryPresetOf,
} from './ompRowHelpers';

describe('inferUnit', () => {
  test('reads the camelCase suffix without false-matching inside a word', () => {
    expect(inferUnit('compaction.thresholdPercent')).toBe('percent');
    expect(inferUnit('retry.usageReservePct')).toBe('percent');
    expect(inferUnit('compaction.idleTimeoutSeconds')).toBe('seconds');
    expect(inferUnit('github.cache.softTtlSec')).toBe('seconds');
    expect(inferUnit('compaction.thresholdTokens')).toBe('tokens');
    expect(inferUnit('tools.artifactTailLines')).toBe('lines');
    // `Secs`, `Pcts`, `Money` and `ColumnsX` are words that merely end in the
    // letters; only a camelCase word boundary counts.
    expect(inferUnit('some.SecsThing')).toBeUndefined();
    expect(inferUnit('some.PctsThing')).toBeUndefined();
    expect(inferUnit('model.toolCallLoopGuard.threshold')).toBe('calls');
  });

  test('milliseconds, kilobytes and columns cover the rows a bare stepper lost', () => {
    expect(inferUnit('mcp.startupTimeoutMs')).toBe('milliseconds');
    expect(inferUnit('extensionHandlers.toolCallTimeoutMs')).toBe('milliseconds');
    expect(inferUnit('tools.artifactSpillThreshold')).toBeUndefined();
    expect(inferUnit('tools.artifactTailBytes')).toBe('kilobytes');
    expect(inferUnit('tools.artifactHeadBytes')).toBe('kilobytes');
    expect(inferUnit('read.summarize.minBodyLines')).toBe('lines');
    expect(inferUnit('codexResets.minBlockedMinutes')).toBe('minutes');
    expect(inferUnit('claudeResets.minBlockedMinutes')).toBe('minutes');
    expect(inferUnit('sharpshooter.intervalMinutes')).toBe('minutes');
    expect(inferUnit('codexResets.salvageHorizonHours')).toBe('hours');
    expect(inferUnit('claudeResets.salvageHorizonHours')).toBe('hours');
    expect(inferUnit('memories.minRolloutIdleHours')).toBe('hours');
    expect(inferUnit('some.MinutesThing')).toBeUndefined();
    expect(inferUnit('some.HoursThing')).toBeUndefined();
  });

  test('a Bytes suffix alone does not decide the unit: MB and a byte cap stay unlabelled', () => {
    // `tools.artifactMaxBytes` is stored in MB and `tools.outputMaxColumns` is
    // a per-line byte cap; a KB or columns chip would both be wrong.
    expect(inferUnit('tools.artifactMaxBytes')).toBeUndefined();
    expect(inferUnit('tools.outputMaxColumns')).toBeUndefined();
  });

  test('the read-summary unfolding bounds count lines without a Lines suffix', () => {
    expect(inferUnit('read.summarize.unfoldUntil')).toBe('lines');
    expect(inferUnit('read.summarize.unfoldLimit')).toBe('lines');
    // `minTotalLines` does carry the suffix, so the table stays supplementary.
    expect(inferUnit('read.summarize.minTotalLines')).toBe('lines');
  });
});

describe('optionSlug', () => {
  test('keeps the existing slug shapes', () => {
    expect(optionSlug('usage-limit')).toBe('usage-limit');
    expect(optionSlug('apply_patch')).toBe('apply-patch');
    expect(optionSlug('2.5')).toBe('2-5');
    expect(optionSlug(50)).toBe('50');
    expect(optionSlug(-1)).toBe('unlimited');
    expect(optionSlug('-1')).toBe('unlimited');
  });
});

describe('isSentinelOption', () => {
  test('only the string default is a sentinel; -1 is a real numeric option', () => {
    expect(isSentinelOption('default')).toBe(true);
    expect(isSentinelOption('-1')).toBe(false);
    expect(isSentinelOption('0')).toBe(false);
  });
});

const READ_SUMMARY_KEYS = [
  'read.summarize.minBodyLines',
  'read.summarize.minCommentLines',
  'read.summarize.unfoldUntil',
  'read.summarize.unfoldLimit',
] as const;

describe('readSummaryPresetOf', () => {
  test('an unset config reads as balanced, OMP\'s own defaults', () => {
    expect(readSummaryPresetOf({
      'read.summarize.enabled': null,
      'read.summarize.minBodyLines': null,
      'read.summarize.minCommentLines': null,
      'read.summarize.unfoldUntil': null,
      'read.summarize.unfoldLimit': null,
    })).toBe('balanced');
  });

  test('every written preset round-trips through its stored tuple', () => {
    const start = {
      'read.summarize.enabled': true,
      'read.summarize.minBodyLines': 4,
      'read.summarize.minCommentLines': 6,
      'read.summarize.unfoldUntil': 50,
      'read.summarize.unfoldLimit': 100,
    } satisfies Record<string, OmpSettingValue>;
    for (const preset of ['off', 'balanced', 'aggressive'] as const) {
      const changes = readSummaryPresetChanges(preset, start);
      expect(readSummaryPresetOf({ ...start, ...changes })).toBe(preset);
    }
  });

  test('off wins over a balanced tuple, and a partial tuple is custom', () => {
    expect(readSummaryPresetOf({
      'read.summarize.enabled': false,
      'read.summarize.minBodyLines': 4,
      'read.summarize.minCommentLines': 6,
      'read.summarize.unfoldUntil': 50,
      'read.summarize.unfoldLimit': 100,
    })).toBe('off');

    expect(readSummaryPresetOf({
      'read.summarize.enabled': true,
      'read.summarize.minBodyLines': 3,
      'read.summarize.minCommentLines': 4,
      'read.summarize.unfoldUntil': 50,
      'read.summarize.unfoldLimit': 100,
    })).toBe('custom');

    // A single unset threshold falls back to OMP's default, which is balanced.
    expect(readSummaryPresetOf({
      'read.summarize.enabled': true,
      'read.summarize.minBodyLines': null,
      'read.summarize.minCommentLines': 6,
      'read.summarize.unfoldUntil': 50,
      'read.summarize.unfoldLimit': 100,
    })).toBe('balanced');
  });
});

describe('readSummaryPresetChanges', () => {
  test('writes only the keys that differ from the stored values', () => {
    expect(readSummaryPresetChanges('aggressive', {
      'read.summarize.enabled': true,
      'read.summarize.minBodyLines': 4,
      'read.summarize.minCommentLines': 6,
      'read.summarize.unfoldUntil': 50,
      'read.summarize.unfoldLimit': 100,
    })).toEqual({
      'read.summarize.minBodyLines': 3,
      'read.summarize.minCommentLines': 4,
      'read.summarize.unfoldUntil': 30,
      'read.summarize.unfoldLimit': 60,
    });

    // Already aggressive but switched off: only the switch changes.
    expect(readSummaryPresetChanges('aggressive', {
      'read.summarize.enabled': false,
      'read.summarize.minBodyLines': 3,
      'read.summarize.minCommentLines': 4,
      'read.summarize.unfoldUntil': 30,
      'read.summarize.unfoldLimit': 60,
    })).toEqual({ 'read.summarize.enabled': true });
  });

  test('off touches only the switch, so the thresholds stay inspectable', () => {
    expect(readSummaryPresetChanges('off', {
      'read.summarize.enabled': true,
      'read.summarize.minBodyLines': 3,
      'read.summarize.minCommentLines': 4,
      'read.summarize.unfoldUntil': 30,
      'read.summarize.unfoldLimit': 60,
    })).toEqual({ 'read.summarize.enabled': false });
    expect(readSummaryPresetChanges('off', { 'read.summarize.enabled': false })).toEqual({});
  });

  test('balanced on a default config writes nothing, and custom always writes nothing', () => {
    expect(readSummaryPresetChanges('balanced', {
      'read.summarize.enabled': true,
      'read.summarize.minBodyLines': null,
      'read.summarize.minCommentLines': null,
      'read.summarize.unfoldUntil': null,
      'read.summarize.unfoldLimit': null,
    })).toEqual({});
    expect(readSummaryPresetChanges('custom', { 'read.summarize.enabled': false })).toEqual({});
  });

  test('an unset switch is on, so a preset keeps it out of the change set', () => {
    expect(readSummaryPresetChanges('aggressive', {
      'read.summarize.enabled': null,
      'read.summarize.minBodyLines': null,
      'read.summarize.minCommentLines': null,
      'read.summarize.unfoldUntil': null,
      'read.summarize.unfoldLimit': null,
    })).toEqual({
      'read.summarize.minBodyLines': 3,
      'read.summarize.minCommentLines': 4,
      'read.summarize.unfoldUntil': 30,
      'read.summarize.unfoldLimit': 60,
    });
  });

  test('a preset writes the four thresholds and the switch only', () => {
    for (const preset of ['off', 'balanced', 'aggressive'] as const) {
      const changes = readSummaryPresetChanges(preset, { 'read.summarize.enabled': null });
      for (const key of Object.keys(changes)) {
        expect([...READ_SUMMARY_KEYS, 'read.summarize.enabled']).toContain(key);
      }
    }
  });
});
