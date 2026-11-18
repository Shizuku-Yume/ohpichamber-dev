import { getCurrentIntlLocale } from '@/lib/i18n';
import type { useI18n } from '@/lib/i18n';

/**
 * A duration in the reader's units: "9h 10m" in English, "9小时10分钟" in
 * Chinese. Units come from `Intl` rather than from concatenated letters, so a
 * locale that spells or spaces them differently stays correct.
 */
export const formatCompactDuration = (
 parts: ReadonlyArray<readonly [number, Intl.NumberFormatOptions['unit']]>,
 intlLocale: string,
): string => {
 const units = parts
  .filter(([, unit]) => unit !== undefined)
  .map(([value, unit]) => new Intl.NumberFormat(intlLocale, {
   style: 'unit',
   unit,
   unitDisplay: 'narrow',
   maximumFractionDigits: 0,
  }).format(value));
 return new Intl.ListFormat(intlLocale, { style: 'narrow', type: 'unit' }).format(units);
};

export const formatRelativeTime = (
 value: number | undefined,
 t: ReturnType<typeof useI18n>['t'],
 intlLocale: string = getCurrentIntlLocale(),
 now: number = Date.now(),
): string => {
 if (!value || !Number.isFinite(value)) {
  return '';
 }
 const diff = value - now;
 const abs = Math.abs(diff);
 const minute = 60_000;
 const hour = 60 * minute;
 const day = 24 * hour;
 const future = diff >= 0;
 if (abs < minute) {
  return future ? t('sessions.scheduledTasks.dialog.relativeTime.inLessThanOneMinute') : t('sessions.scheduledTasks.dialog.relativeTime.justNow');
 }
 if (abs < hour) {
  const m = Math.round(abs / minute);
  return future
   ? t('sessions.scheduledTasks.dialog.relativeTime.inMinutes', { count: m })
   : t('sessions.scheduledTasks.dialog.relativeTime.minutesAgo', { count: m });
 }
 if (abs < day) {
  const h = Math.floor(abs / hour);
  const m = Math.round((abs % hour) / minute);
  const body = formatCompactDuration(m > 0 ? [[h, 'hour'], [m, 'minute']] : [[h, 'hour']], intlLocale);
  return future
   ? t('sessions.scheduledTasks.dialog.relativeTime.inDuration', { duration: body })
   : t('sessions.scheduledTasks.dialog.relativeTime.durationAgo', { duration: body });
 }
 const d = Math.floor(abs / day);
 const h = Math.round((abs % day) / hour);
 const body = formatCompactDuration(h > 0 ? [[d, 'day'], [h, 'hour']] : [[d, 'day']], intlLocale);
 return future
  ? t('sessions.scheduledTasks.dialog.relativeTime.inDuration', { duration: body })
  : t('sessions.scheduledTasks.dialog.relativeTime.durationAgo', { duration: body });
};
