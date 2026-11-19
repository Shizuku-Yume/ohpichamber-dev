import { describe, expect, test } from 'bun:test';

import { formatMessage, type I18nKey, type I18nParams } from '@/lib/i18n';
import type { I18nDictionary } from '@/lib/i18n/store';
import { dict as en } from '@/lib/i18n/messages/en';
import { dict as de } from '@/lib/i18n/messages/de';
import { dict as zhCn } from '@/lib/i18n/messages/zh-CN';
import { formatCompactDuration, formatRelativeTime } from './scheduledTasksRelativeTime';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Dictionary = I18nDictionary;

const tFor = (dictionary: Dictionary) => (key: I18nKey, params?: I18nParams): string =>
  formatMessage(dictionary, key, params);

const at = (offset: number, dictionary: Dictionary, intlLocale: string, now = Date.parse('2026-11-19T09:00:00Z')): string =>
  formatRelativeTime(now + offset, tFor(dictionary), intlLocale, now);

// `now` keeps the assertions off the wall clock; the two sides of the relative
// phrase are covered by the past and future cases.
describe('formatCompactDuration', () => {
  test('uses each locale unit words instead of concatenated letters', () => {
    expect(formatCompactDuration([[9, 'hour'], [10, 'minute']], 'en-US')).toBe('9h 10m');
    expect(formatCompactDuration([[9, 'hour'], [10, 'minute']], 'zh-CN')).toBe('9小时10分钟');
    expect(formatCompactDuration([[9, 'hour'], [10, 'minute']], 'zh-TW')).toBe('9 小時10 分鐘');
    expect(formatCompactDuration([[3, 'day'], [2, 'hour']], 'zh-CN')).toBe('3天2小时');
    expect(formatCompactDuration([[42, 'minute']], 'zh-CN')).toBe('42分钟');
  });

  test('a single unit renders alone', () => {
    expect(formatCompactDuration([[9, 'hour']], 'en-US')).toBe('9h');
    expect(formatCompactDuration([[3, 'day']], 'de-DE')).toBe('3 T');
  });
});

describe('formatRelativeTime', () => {
  test('English keeps its natural compact phrasing', () => {
    expect(at(5 * MINUTE, en, 'en-US')).toBe('in 5m');
    expect(at(-5 * MINUTE, en, 'en-US')).toBe('5m ago');
    expect(at(9 * HOUR + 10 * MINUTE, en, 'en-US')).toBe('in 9h 10m');
    expect(at(3 * DAY + 2 * HOUR, en, 'en-US')).toBe('in 3d 2h');
    expect(at(-(3 * DAY + 2 * HOUR), en, 'en-US')).toBe('3d 2h ago');
    expect(at(30_000, en, 'en-US')).toBe('in <1m');
    expect(at(-30_000, en, 'en-US')).toBe('just now');
  });

  test('Chinese renders Chinese units, not hard-coded h/m/d tokens', () => {
    expect(at(9 * HOUR + 10 * MINUTE, zhCn, 'zh-CN')).toBe('9小时10分钟 后');
    expect(at(3 * DAY + 2 * HOUR, zhCn, 'zh-CN')).toBe('3天2小时 后');
    expect(at(-(9 * HOUR + 10 * MINUTE), zhCn, 'zh-CN')).toBe('9小时10分钟 前');
    expect(at(42 * MINUTE, zhCn, 'zh-CN')).toBe('42 分钟后');
    expect(at(9 * HOUR + 10 * MINUTE, zhCn, 'zh-CN')).not.toContain('h');
  });

  test('a third locale follows its own unit words and phrasing', () => {
    expect(at(9 * HOUR + 10 * MINUTE, de, 'de-DE')).toBe('in 9h, 10 Min.');
    expect(at(-(3 * DAY + 2 * HOUR), de, 'de-DE')).toBe('3 T, 2h her');
  });

  test('an absent or non-finite next run renders nothing', () => {
    expect(formatRelativeTime(undefined, tFor(en), 'en-US')).toBe('');
    expect(formatRelativeTime(Number.NaN, tFor(en), 'en-US')).toBe('');
  });
});
