import type { Part } from '@openchamber/agent-contract';
import { getCurrentIntlLocale } from '@/lib/i18n';
import type { TimeFormatPreference } from '@/stores/useUIStore';


const PREVIEW_ID_LENGTH = 8;

const labelForPart = (part: Part): string =>
  part.type === 'tool_call' || part.type === 'tool_result'
    ? part.toolName
    : part.type;

export const derivePartsLabel = (parts: Part[]): string => {
  if (parts.length === 0) return '';
  const seen: string[] = [];
  for (const part of parts) {
    const label = labelForPart(part);
    if (!seen.includes(label)) {
      seen.push(label);
    }
  }
  return seen.join(' + ');
};

export const truncateMessageId = (id: string, length: number = PREVIEW_ID_LENGTH): string => {
  if (typeof id !== 'string') return '';
  return id.length <= length ? id : id.slice(-length);
};

const collapseWhitespace = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

export const deriveUserSnippet = (parts: Part[]): string => {
  for (const part of parts) {
    if (part.type === 'text') {
      const cleaned = collapseWhitespace(part.content);
      if (cleaned.length === 0) continue;
      return cleaned;
    }
  }
  const nonTextCount = parts.filter((part) => part.type === 'attachment').length;
  if (nonTextCount === 0) return '';
  return `${nonTextCount} attachment${nonTextCount === 1 ? '' : 's'}`;
};

export const formatAssistantTokens = (
  input: number,
  output: number,
  formatNumber: (value: number) => string,
): string => `${formatNumber(input)} / ${formatNumber(output)}`;

const resolveHour12 = (preference: TimeFormatPreference): boolean | undefined => {
  if (preference === '12h') return true;
  if (preference === '24h') return false;
  return undefined;
};

export const formatMessagePreviewTime = (
  timestamp: number | null,
  preference: TimeFormatPreference,
): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '-';
  const hour12 = resolveHour12(preference);
  // `undefined` would follow the *browser's* locale, not the app's: a zh-CN
  // reader with an en-US browser saw "11/18, 11:06 PM" here while every other
  // timestamp in the app was already localized.
  return new Date(timestamp).toLocaleString(getCurrentIntlLocale(), {
    month: 'numeric',
    day: 'numeric',
    hour: hour12 === false ? '2-digit' : 'numeric',
    minute: '2-digit',
    ...(hour12 === undefined ? {} : { hour12 }),
  });
};
