import { afterEach, expect, test } from 'bun:test';
import { useI18nStore } from '@/lib/i18n/store';
import { formatMessagePreviewTime } from './rawMessagePreview';

const defaultLocale = useI18nStore.getState().locale;
const AT = new Date(2026, 10, 18, 23, 6).getTime();

afterEach(() => {
  useI18nStore.setState({ locale: defaultLocale });
});

test('a zh-CN reader sees the app locale, not the browser one', () => {
  useI18nStore.setState({ locale: 'zh-CN' });
  // The reported bug: `11/18, 11:06 PM` in a zh-CN UI, because the preview
  // passed `undefined` and followed the browser's locale instead.
  expect(formatMessagePreviewTime(AT, 'auto')).not.toMatch(/\b(?:AM|PM)\b/);
});

test('an en reader keeps the 12-hour shape', () => {
  useI18nStore.setState({ locale: 'en' });
  expect(formatMessagePreviewTime(AT, 'auto')).toMatch(/\bPM\b/);
});

test('the explicit preference outranks the locale', () => {
  // zh-CN marks the half-day with a day-period word rather than AM/PM, so the
  // preference is read from the two shapes differing, not from the word.
  useI18nStore.setState({ locale: 'zh-CN' });
  const twelve = formatMessagePreviewTime(AT, '12h');
  const twentyFour = formatMessagePreviewTime(AT, '24h');
  expect(twelve).not.toBe(twentyFour);
  expect(twentyFour).toContain('23:06');
  useI18nStore.setState({ locale: 'en' });
  expect(formatMessagePreviewTime(AT, '12h')).toMatch(/\bPM\b/);
  expect(formatMessagePreviewTime(AT, '24h')).not.toMatch(/\b(?:AM|PM)\b/);
});
