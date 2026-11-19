import React from 'react';
<<<<<<< HEAD
import type { JsonValue, Message, Part } from '@openchamber/agent-contract';
import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';
||||||| bc50ba56aa
import type { Message, Part } from '@/lib/opencode/model';
import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';
=======
import type { Message, Part } from '@/lib/opencode/model';
import { HighlightedCode } from '@/components/code/HighlightedCode';
>>>>>>> upstream/main

import { Icon } from "@/components/icon/Icon";
import { selectConfiguredModelPair, selectProvidersForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { computeCacheHitRate, findLatestContextFill, type ContextFillMessage } from '@/stores/utils/tokenUtils';
import { useSessionMessageRecords, useSessions } from '@/sync/sync-context';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { TimeFormatPreference } from '@/stores/useUIStore';
import { formatDateTimeForPreference } from '@/lib/timeFormat';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { completePair, EMPTY_TOKEN_BREAKDOWN, readTokenBreakdown, resolveContextModel, type SidebarTokenBreakdown } from './contextSidebarModel';
import {
  derivePartsLabel,
  deriveUserSnippet,
  formatAssistantTokens,
  formatMessagePreviewTime,
} from './rawMessagePreview';


type SessionMessage = { info: Message; parts: Part[] };

type TokenBreakdown = SidebarTokenBreakdown;

type ContextBuckets = {
  user: number;
  assistant: number;
  tool: number;
  other: number;
};

const EMPTY_BREAKDOWN: TokenBreakdown = EMPTY_TOKEN_BREAKDOWN;

const EMPTY_BUCKETS: ContextBuckets = {
  user: 0,
  assistant: 0,
  tool: 0,
  other: 0,
};

const extractTokenBreakdown = (message: SessionMessage): TokenBreakdown => readTokenBreakdown(message.info.usage);

<<<<<<< HEAD
const estimateJsonLength = (value: JsonValue): number => JSON.stringify(value).length;
||||||| bc50ba56aa
const extractTokenBreakdown = (message: SessionMessage): TokenBreakdown => {
  const tokenCandidate = (message.info as { tokens?: unknown }).tokens;
  const source =
    tokenCandidate !== undefined
      ? tokenCandidate
      : (message.parts.find((part) => (part as { tokens?: unknown }).tokens !== undefined) as { tokens?: unknown } | undefined)?.tokens;

  if (typeof source === 'number') {
    return {
      ...EMPTY_BREAKDOWN,
      total: toNonNegativeNumber(source),
    };
  }

  if (!source || typeof source !== 'object') {
    return EMPTY_BREAKDOWN;
  }

  const breakdown = source as {
    total?: unknown;
    input?: unknown;
    output?: unknown;
    reasoning?: unknown;
    cache?: { read?: unknown; write?: unknown };
  };

  const input = toNonNegativeNumber(breakdown.input);
  const output = toNonNegativeNumber(breakdown.output);
  const reasoning = toNonNegativeNumber(breakdown.reasoning);
  const cacheRead = toNonNegativeNumber(breakdown.cache?.read);
  const cacheWrite = toNonNegativeNumber(breakdown.cache?.write);
  // Multi-step turns accumulate the fields across API round-trips (every tool
  // call re-reads the whole cached prompt), so summing them overstates the
  // window. The server-reported total is the final round-trip's window.
  const reportedTotal = toNonNegativeNumber(breakdown.total);

  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: reportedTotal > 0 ? reportedTotal : input + output + reasoning + cacheRead + cacheWrite,
  };
};

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
};

const estimateTextLength = (value: unknown): number => {
  if (typeof value === 'string') {
    return value.length;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).length;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateTextLength(item), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + estimateTextLength(item), 0);
  }
  return 0;
};
=======
const extractTokenBreakdown = (message: SessionMessage): TokenBreakdown => {
  const tokenCandidate = (message.info as { tokens?: unknown }).tokens;
  const source =
    tokenCandidate !== undefined
      ? tokenCandidate
      : (message.parts.find((part) => (part as { tokens?: unknown }).tokens !== undefined) as { tokens?: unknown } | undefined)?.tokens;

  if (typeof source === 'number') {
    return {
      ...EMPTY_BREAKDOWN,
      total: toNonNegativeNumber(source),
    };
  }

  if (!source || typeof source !== 'object') {
    return EMPTY_BREAKDOWN;
  }

  const breakdown = source as {
    total?: unknown;
    input?: unknown;
    output?: unknown;
    reasoning?: unknown;
    cache?: { read?: unknown; write?: unknown };
  };

  const input = toNonNegativeNumber(breakdown.input);
  const output = toNonNegativeNumber(breakdown.output);
  const reasoning = toNonNegativeNumber(breakdown.reasoning);
  const cacheRead = toNonNegativeNumber(breakdown.cache?.read);
  const cacheWrite = toNonNegativeNumber(breakdown.cache?.write);
  const reportedTotal = toNonNegativeNumber(breakdown.total);

  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: reportedTotal > 0 ? reportedTotal : input + output + reasoning + cacheRead + cacheWrite,
  };
};

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
};

const estimateTextLength = (value: unknown): number => {
  if (typeof value === 'string') {
    return value.length;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).length;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateTextLength(item), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + estimateTextLength(item), 0);
  }
  return 0;
};
>>>>>>> upstream/main

const estimatePartChars = (part: Part, role: 'user' | 'assistant' | 'tool' | 'other'): ContextBuckets => {
  if (part.type === 'reasoning') {
    return { ...EMPTY_BUCKETS, assistant: part.content.length };
  }
  if (part.type === 'text') {
    const bucket = role === 'user' ? 'user' : role === 'assistant' ? 'assistant' : role === 'tool' ? 'tool' : 'other';
    return { ...EMPTY_BUCKETS, [bucket]: part.content.length };
  }
  if (part.type === 'tool_call') {
    return { ...EMPTY_BUCKETS, tool: estimateJsonLength(part.input) + part.toolName.length };
  }
  if (part.type === 'tool_result') {
    return {
      ...EMPTY_BUCKETS,
      tool: (part.output ? estimateJsonLength(part.output) : 0) + (part.error?.length ?? 0) + part.toolName.length,
    };
  }
<<<<<<< HEAD
  if (part.type === 'attachment') {
    return { ...EMPTY_BUCKETS, other: part.name.length + part.mediaType.length + part.uri.length };
||||||| bc50ba56aa

  const directText = pickString(
    partRecord.text,
    partRecord.content,
    partRecord.value,
    (partRecord.source as { value?: unknown; text?: { value?: unknown } } | undefined)?.value,
    (partRecord.source as { value?: unknown; text?: { value?: unknown } } | undefined)?.text?.value,
  );

  if (type === 'tool' || role === 'tool') {
    const toolInputOutputLength =
      estimateTextLength(partRecord.input)
      + estimateTextLength(partRecord.output)
      + estimateTextLength(partRecord.error)
      + estimateTextLength((partRecord.call as { input?: unknown; output?: unknown; error?: unknown } | undefined)?.input)
      + estimateTextLength((partRecord.call as { input?: unknown; output?: unknown; error?: unknown } | undefined)?.output)
      + estimateTextLength((partRecord.call as { input?: unknown; output?: unknown; error?: unknown } | undefined)?.error);

    const toolPayloadLength =
      toolInputOutputLength
      + estimateTextLength(partRecord.raw)
      + Math.round(estimateTextLength(partRecord.metadata) * 0.25)
      + Math.round(estimateTextLength(partRecord.state) * 0.1)
      // A result left out of the page still counts, by the length the server reported.
      + Math.round((toolContentShellChars(part) ?? 0) * 0.1);

    return { user: 0, assistant: 0, tool: toolPayloadLength, other: 0 };
=======

  const directText = pickString(
    partRecord.text,
    partRecord.content,
    partRecord.value,
    (partRecord.source as { value?: unknown; text?: { value?: unknown } } | undefined)?.value,
    (partRecord.source as { value?: unknown; text?: { value?: unknown } } | undefined)?.text?.value,
  );

  if (type === 'tool' || role === 'tool') {
    const toolInputOutputLength =
      estimateTextLength(partRecord.input)
      + estimateTextLength(partRecord.output)
      + estimateTextLength(partRecord.error)
      + estimateTextLength((partRecord.call as { input?: unknown; output?: unknown; error?: unknown } | undefined)?.input)
      + estimateTextLength((partRecord.call as { input?: unknown; output?: unknown; error?: unknown } | undefined)?.output)
      + estimateTextLength((partRecord.call as { input?: unknown; output?: unknown; error?: unknown } | undefined)?.error);

    const toolPayloadLength =
      toolInputOutputLength
      + estimateTextLength(partRecord.raw)
      + Math.round(estimateTextLength(partRecord.metadata) * 0.25)
      + Math.round(estimateTextLength(partRecord.state) * 0.1)
      + Math.round((toolContentShellChars(part) ?? 0) * 0.1);

    return { user: 0, assistant: 0, tool: toolPayloadLength, other: 0 };
>>>>>>> upstream/main
  }
  if (part.type === 'notice') {
    return { ...EMPTY_BUCKETS, other: (part.title?.length ?? 0) + (part.message?.length ?? 0) };
  }
  return { ...EMPTY_BUCKETS, other: part.title.length };
};

const addBuckets = (target: ContextBuckets, value: ContextBuckets): ContextBuckets => ({
  user: target.user + value.user,
  assistant: target.assistant + value.assistant,
  tool: target.tool + value.tool,
  other: target.other + value.other,
});

const deriveRoleBucket = (message: SessionMessage): 'user' | 'assistant' | 'tool' | 'other' => {
  if (message.info.role === 'user') return 'user';
  if (message.info.role === 'assistant') return 'assistant';
  return 'other';
};

<<<<<<< HEAD
||||||| bc50ba56aa
// Keyed by the message record, which the sync layer replaces whenever the
// message or its parts change: a streamed delta re-measures one message, and
// records that leave the session are collected with the map entry.
const messageCharsCache = new WeakMap<SessionMessage, ContextBuckets>();

const messageChars = (message: SessionMessage): ContextBuckets => {
  const cached = messageCharsCache.get(message);
  if (cached) return cached;
  const role = deriveRoleBucket(message);
  let bucket = { ...EMPTY_BUCKETS };
  for (const part of message.parts) {
    bucket = addBuckets(bucket, estimatePartChars(part, role));
  }
  messageCharsCache.set(message, bucket);
  return bucket;
};

=======
const messageCharsCache = new WeakMap<SessionMessage, ContextBuckets>();

const messageChars = (message: SessionMessage): ContextBuckets => {
  const cached = messageCharsCache.get(message);
  if (cached) return cached;
  const role = deriveRoleBucket(message);
  let bucket = { ...EMPTY_BUCKETS };
  for (const part of message.parts) {
    bucket = addBuckets(bucket, estimatePartChars(part, role));
  }
  messageCharsCache.set(message, bucket);
  return bucket;
};

>>>>>>> upstream/main
const computeContextBreakdown = (
  sessionMessages: SessionMessage[],
  systemPrompt: string,
): ContextBuckets => {
  if (sessionMessages.length === 0) {
    return { ...EMPTY_BUCKETS };
  }

  const totalChars = sessionMessages.reduce<ContextBuckets>((acc, message) => {
    const role = deriveRoleBucket(message);
    let bucket = { ...EMPTY_BUCKETS };
    for (const part of message.parts) {
      bucket = addBuckets(bucket, estimatePartChars(part, role));
    }
    return addBuckets(acc, bucket);
  }, { ...EMPTY_BUCKETS });

  totalChars.user += systemPrompt.length;

  return {
    user: Math.ceil(totalChars.user / 4),
    assistant: Math.ceil(totalChars.assistant / 4),
    tool: Math.ceil(totalChars.tool / 4),
    other: Math.ceil(totalChars.other / 4),
  };
};

const formatNumber = (value: number): string => value.toLocaleString(getCurrentIntlLocale());

const formatDateTime = (timestamp: number | null, timeFormatPreference: TimeFormatPreference): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '-';
  return formatDateTimeForPreference(timestamp, timeFormatPreference, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

<<<<<<< HEAD
||||||| bc50ba56aa
const resolveProviderAndModel = (
  providers: ProviderLike[],
  providerID: string,
  modelID: string,
): { providerName: string; modelName: string; contextLimit: number | null } => {
  const provider = providers.find((entry) => entry.id === providerID);
  const model = provider?.models?.find((entry) => entry.id === modelID);

  return {
    providerName: provider?.name || providerID || '-',
    modelName: model?.name || modelID || '-',
    contextLimit: typeof model?.limit?.context === 'number' ? model.limit.context : null,
  };
};

type TokenFigures = {
  /** Every prompt token, cached or not; the cache cells beside it split it up. */
  prompt: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPercent: number | null;
};

/** Six token figures under a title; `null` figures, not yet known, read as dashes. */
const TokenFiguresCard: React.FC<{ title: string; figures: TokenFigures | null }> = ({ title, figures }) => {
  const { t } = useI18n();
  const items = [
    { label: t('contextSidebar.tokens.input'), value: figures?.prompt ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.output'), value: figures?.output ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.reasoning'), value: figures?.reasoning ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.cacheRead'), value: figures?.cacheRead ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.cacheWrite'), value: figures?.cacheWrite ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.cacheHit'), value: figures?.cacheHitPercent ?? null, format: 'percent' },
  ] as const;

  return (
    <div className="mb-5 rounded-lg bg-[var(--surface-elevated)]/70 px-4 py-3.5">
      <div className="typography-micro text-muted-foreground mb-2.5">{title}</div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <div className="typography-micro text-muted-foreground">{item.label}</div>
            <div className="mt-0.5 typography-ui-label tabular-nums text-foreground">
              {item.value === null
                ? '—'
                : item.format === 'percent'
                  ? `${item.value.toFixed(1)}%`
                  : formatNumber(item.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

type RawMessageRowProps = {
  message: SessionMessage;
  isExpanded: boolean;
  isCopied: boolean;
  timeFormatPreference: TimeFormatPreference;
  onToggle: (messageId: string) => void;
  onCopy: (messageId: string, value: string) => void;
};

// Memoized on the message record, which the sync layer keeps by reference
// while the message is unchanged: a streamed delta re-renders only the row of
// the message it touched, not one row per message of the session.
const RawMessageRow = React.memo(function RawMessageRow({
  message,
  isExpanded,
  isCopied,
  timeFormatPreference,
  onToggle,
  onCopy,
}: RawMessageRowProps) {
  const { t } = useI18n();
  const role = message.info.role;
  const isAssistant = role === 'assistant';
  const isUser = role === 'user';
  const messageCreatedAt = (message.info.time?.created ?? null) as number | null;
  const partsLabel = derivePartsLabel(message.parts);
  const tokens = isAssistant ? extractTokenBreakdown(message) : null;
  const userSnippet = isUser ? deriveUserSnippet(message.parts) : '';
  const previewTime = formatMessagePreviewTime(messageCreatedAt, timeFormatPreference);
  // Keep token/time columns stable; the message label owns all
  // remaining space and truncates before it can push metrics.
  const assistantLeft = partsLabel || '—';
  const assistantMiddle = tokens
    ? formatAssistantTokens(tokens.input, tokens.output, formatNumber)
    : '';
  const otherLeft = role || 'unknown';
  const otherLabel = partsLabel ? `${otherLeft}: ${partsLabel}` : otherLeft;

  const jsonValue = isExpanded
    ? JSON.stringify({ info: message.info, parts: message.parts }, null, 2)
    : '';

  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface-elevated)]/70">
      <button
        type="button"
        className="w-full cursor-pointer px-3 py-1.5 text-start hover:bg-[var(--interactive-hover)]"
        aria-expanded={isExpanded}
        onClick={() => onToggle(message.info.id)}
      >
        <div
          className="grid items-center gap-x-2 whitespace-nowrap typography-micro"
          style={{ gridTemplateColumns: isAssistant ? 'minmax(0, 1fr) 7.5rem max-content' : 'minmax(0, 1fr) max-content' }}
        >
          {isUser ? (
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="typography-ui-label text-foreground">user:</span>{' '}
              {userSnippet}
            </span>
          ) : (
            <>
              <span className="min-w-0 truncate text-muted-foreground">
                {isAssistant ? assistantLeft : otherLabel}
              </span>
              {isAssistant && (
                <span className="text-end text-muted-foreground tabular-nums">
                  {assistantMiddle}
                </span>
              )}
            </>
          )}
          <span className="text-end text-muted-foreground">{previewTime}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--surface-subtle)] p-0">
          <ScrollableOverlay outerClassName="max-h-[26rem] bg-[var(--surface-background)]" className="group relative" disableHorizontal>
            <div className="absolute top-1 inset-e-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopy(message.info.id, jsonValue);
                    }}
                    aria-label={isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}
                  >
                    {isCopied ? <Icon name="check" className="size-3.5" /> : <Icon name="file-copy" className="size-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>{isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}</TooltipContent>
              </Tooltip>
            </div>
            <WorkerHighlightedCode
              language="json"
              code={jsonValue}
              style={{
                margin: 0,
                padding: '0.75rem',
                background: 'transparent',
                fontSize: 'var(--text-micro)',
                lineHeight: '1.35',
              }}
              wrap
            />
          </ScrollableOverlay>
        </div>
      )}
    </div>
  );
});

=======
const resolveProviderAndModel = (
  providers: ProviderLike[],
  providerID: string,
  modelID: string,
): { providerName: string; modelName: string; contextLimit: number | null } => {
  const provider = providers.find((entry) => entry.id === providerID);
  const model = provider?.models?.find((entry) => entry.id === modelID);

  return {
    providerName: provider?.name || providerID || '-',
    modelName: model?.name || modelID || '-',
    contextLimit: typeof model?.limit?.context === 'number' ? model.limit.context : null,
  };
};

type TokenFigures = {
  prompt: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPercent: number | null;
};

const TokenFiguresCard: React.FC<{ title: string; figures: TokenFigures | null }> = ({ title, figures }) => {
  const { t } = useI18n();
  const items = [
    { label: t('contextSidebar.tokens.input'), value: figures?.prompt ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.output'), value: figures?.output ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.reasoning'), value: figures?.reasoning ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.cacheRead'), value: figures?.cacheRead ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.cacheWrite'), value: figures?.cacheWrite ?? null, format: 'count' },
    { label: t('contextSidebar.tokens.cacheHit'), value: figures?.cacheHitPercent ?? null, format: 'percent' },
  ] as const;

  return (
    <div className="mb-5 rounded-lg bg-[var(--surface-elevated)]/70 px-4 py-3.5">
      <div className="typography-micro text-muted-foreground mb-2.5">{title}</div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <div className="typography-micro text-muted-foreground">{item.label}</div>
            <div className="mt-0.5 typography-ui-label tabular-nums text-foreground">
              {item.value === null
                ? '—'
                : item.format === 'percent'
                  ? `${item.value.toFixed(1)}%`
                  : formatNumber(item.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

type RawMessageRowProps = {
  message: SessionMessage;
  isExpanded: boolean;
  isCopied: boolean;
  timeFormatPreference: TimeFormatPreference;
  onToggle: (messageId: string) => void;
  onCopy: (messageId: string, value: string) => void;
};

const RawMessageRow = React.memo(function RawMessageRow({
  message,
  isExpanded,
  isCopied,
  timeFormatPreference,
  onToggle,
  onCopy,
}: RawMessageRowProps) {
  const { t } = useI18n();
  const role = message.info.role;
  const isAssistant = role === 'assistant';
  const isUser = role === 'user';
  const messageCreatedAt = (message.info.time?.created ?? null) as number | null;
  const partsLabel = derivePartsLabel(message.parts);
  const tokens = isAssistant ? extractTokenBreakdown(message) : null;
  const userSnippet = isUser ? deriveUserSnippet(message.parts) : '';
  const previewTime = formatMessagePreviewTime(messageCreatedAt, timeFormatPreference);
  const assistantLeft = partsLabel || '—';
  const assistantMiddle = tokens
    ? formatAssistantTokens(tokens.input, tokens.output, formatNumber)
    : '';
  const otherLeft = role || 'unknown';
  const otherLabel = partsLabel ? `${otherLeft}: ${partsLabel}` : otherLeft;

  const jsonValue = isExpanded
    ? JSON.stringify({ info: message.info, parts: message.parts }, null, 2)
    : '';

  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface-elevated)]/70">
      <button
        type="button"
        className="w-full cursor-pointer px-3 py-1.5 text-start hover:bg-[var(--interactive-hover)]"
        aria-expanded={isExpanded}
        onClick={() => onToggle(message.info.id)}
      >
        <div
          className="grid items-center gap-x-2 whitespace-nowrap typography-micro"
          style={{ gridTemplateColumns: isAssistant ? 'minmax(0, 1fr) 7.5rem max-content' : 'minmax(0, 1fr) max-content' }}
        >
          {isUser ? (
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="typography-ui-label text-foreground">user:</span>{' '}
              {userSnippet}
            </span>
          ) : (
            <>
              <span className="min-w-0 truncate text-muted-foreground">
                {isAssistant ? assistantLeft : otherLabel}
              </span>
              {isAssistant && (
                <span className="text-end text-muted-foreground tabular-nums">
                  {assistantMiddle}
                </span>
              )}
            </>
          )}
          <span className="text-end text-muted-foreground">{previewTime}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--surface-subtle)] p-0">
          <ScrollableOverlay outerClassName="max-h-[26rem] bg-[var(--surface-background)]" className="group relative" disableHorizontal>
            <div className="absolute top-1 inset-e-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopy(message.info.id, jsonValue);
                    }}
                    aria-label={isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}
                  >
                    {isCopied ? <Icon name="check" className="size-3.5" /> : <Icon name="file-copy" className="size-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>{isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}</TooltipContent>
              </Tooltip>
            </div>
            <HighlightedCode
              language="json"
              code={jsonValue}
              style={{
                margin: 0,
                padding: '0.75rem',
                background: 'transparent',
                fontSize: 'var(--text-micro)',
                lineHeight: '1.35',
              }}
              wrap
            />
          </ScrollableOverlay>
        </div>
      )}
    </div>
  );
});

>>>>>>> upstream/main
export const ContextPanelContent: React.FC = () => {
  const { t } = useI18n();
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
  const [expandedRawMessages, setExpandedRawMessages] = React.useState<Record<string, boolean>>({});
  const [copiedRawMessageId, setCopiedRawMessageId] = React.useState<string | null>(null);
  const copyResetTimeoutRef = React.useRef<number | null>(null);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentSessionDirectory = useSessionUIStore((state) => state.currentSessionDirectory);
  const sessions = useSessions(currentSessionDirectory ?? undefined);
  const sessionMessages = useSessionMessageRecords(
    currentSessionId ?? '',
    currentSessionDirectory ?? undefined,
  ).map((message): SessionMessage => ({ info: message, parts: message.parts }));
  const providers = useConfigStore((state) => selectProvidersForDirectory(state, currentSessionDirectory));
  // The readout still has to name a model before the first answer carries one.
  // The session's own selection is authoritative; the composer's pair describes
  // only the directory it was configured for, never another one.
  // Primitive selectors keep every subscription stable: a fresh pair object
  // from a selector would re-render on every store read.
  // One shallow-compared pair per store read, so a fresh object literal still
  // notifies only when the values change.
  const configuredPairState = useConfigStore(useShallow(React.useCallback(
    (state) => selectConfiguredModelPair(state, currentSessionDirectory),
    [currentSessionDirectory],
  )));
  const sessionSelectionConfig = useSelectionStore(useShallow(React.useCallback((state) => {
    const model = currentSessionId ? state.sessionModelSelections.get(currentSessionId) ?? null : null;
    return { providerId: model?.providerId ?? '', modelId: model?.modelId ?? '' };
  }, [currentSessionId])));


  React.useEffect(() => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
    setExpandedRawMessages((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    setCopiedRawMessageId(null);
  }, [currentSessionDirectory, currentSessionId]);

  React.useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCopyRawMessage = React.useCallback(async (messageId: string, value: string) => {
    const result = await copyTextToClipboard(value);
    if (result.ok) {
      setCopiedRawMessageId(messageId);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedRawMessageId((prev) => (prev === messageId ? null : prev));
        copyResetTimeoutRef.current = null;
      }, 2000);
    } else {
      setCopiedRawMessageId(null);
    }
  }, []);

  const viewModel = React.useMemo(() => {
    const currentSession = currentSessionId ? sessions.find((session) => session.sessionId === currentSessionId) ?? null : null;

    const assistantMessages = sessionMessages.filter((entry) => entry.info.role === 'assistant');
    const userMessages = sessionMessages.filter((entry) => entry.info.role === 'user');

<<<<<<< HEAD
    const contextFill = findLatestContextFill(sessionMessages.map(({ info }): ContextFillMessage => ({
      messageId: info.messageId,
      role: info.role,
      usage: info.usage,
    })));
||||||| bc50ba56aa
    // After a compaction the fill is unknown until a response reports tokens;
    // the compaction record itself still supplies the last-turn breakdown.
    const contextFill = findLatestContextFill(sessionMessages.map((entry) => entry.info));
=======
    const contextFill = findLatestContextFill(sessionMessages.map((entry) => entry.info));
>>>>>>> upstream/main
    const contextMessage = contextFill ? sessionMessages[contextFill.index] ?? null : null;

    const tokenBreakdown = contextMessage ? extractTokenBreakdown(contextMessage) : EMPTY_BREAKDOWN;

    const cacheHitRate = computeCacheHitRate({
      input: tokenBreakdown.input,
      cache: { read: tokenBreakdown.cacheRead, write: tokenBreakdown.cacheWrite },
    });

<<<<<<< HEAD
    const totalAssistantCost = assistantMessages.reduce((sum, message) => sum + (message.info.usage?.cost.total ?? 0), 0);
||||||| bc50ba56aa
    // The session record carries the whole session's cost; the loaded
    // messages are only its tail once a long chat was opened cold or cut back
    // (`SessionMessageLoader.trimHistory`). A persisted snapshot strips the
    // field, so the sum stands in until the live record arrives.
    const totalAssistantCost = Number.isFinite(currentSession?.cost)
      ? toNonNegativeNumber(currentSession?.cost)
      : assistantMessages.reduce((sum, message) => {
        const cost = toNonNegativeNumber((message.info as { cost?: unknown }).cost);
        return sum + cost;
      }, 0);
=======
    const totalAssistantCost = Number.isFinite(currentSession?.cost)
      ? toNonNegativeNumber(currentSession?.cost)
      : assistantMessages.reduce((sum, message) => {
        const cost = toNonNegativeNumber((message.info as { cost?: unknown }).cost);
        return sum + cost;
      }, 0);
>>>>>>> upstream/main

    // The newest answer is the authority. Before one exists, the session's own
    // selection wins, then the configured pair of the session's directory; the
    // composer's pair only counts when it describes that same directory.
    const latestAssistantInfo = contextMessage?.info ?? null;
    const answering = completePair({
      providerId: latestAssistantInfo?.providerId ?? '',
      modelId: latestAssistantInfo?.modelId ?? '',
    });
    const sessionSelectionPair = completePair(sessionSelectionConfig);
    // The composer's pair describes only its own directory. Another directory's
    // configured pair must never label this session.
    const configuredPair = completePair(configuredPairState);
    const providerModel = resolveContextModel({
      providers,
      answering,
      sessionSelection: sessionSelectionPair,
      configured: configuredPair,
    });

    const contextLimit = providerModel.contextLimit;
    const usagePercent = contextFill && contextLimit && contextLimit > 0
      ? Math.min(999, (tokenBreakdown.total / contextLimit) * 100)
      : 0;

    const systemMessage = [...sessionMessages].reverse().find((entry) => entry.info.role === 'system');
    const systemPrompt = systemMessage?.info.role === 'system' ? systemMessage.info.parts.filter((part) => part.type === 'text').map((part) => part.content).join('') : '';

    const computedBreakdown = computeContextBreakdown(sessionMessages, systemPrompt);

<<<<<<< HEAD
    const userTokens = computedBreakdown.user;
    const assistantTokens = computedBreakdown.assistant;
    const toolTokens = computedBreakdown.tool;
    const otherTokens = Math.max(0, tokenBreakdown.input - userTokens - assistantTokens - toolTokens);
    const breakdownTotal = userTokens + assistantTokens + toolTokens + otherTokens;
||||||| bc50ba56aa
    // The bar sits under the readout, so it is measured against the same window
    // the readout reports, not against its own estimate. `other` is then the
    // real unattributed remainder — prompt, schemas, skills, estimation error —
    // rather than a leftover clamped to zero.
    //
    // A completed compaction record can still carry the summarizing turn's
    // tokens. The readout shows `—` for that state because the fill is unknown,
    // so the bar must not denominate against the pre-compaction window either;
    // zero sends it to the estimate, which is the same fallback the panel
    // documents for an unknown window.
    const breakdown = composeContextBreakdown(computedBreakdown, { windowTokens: tokenBreakdown.total, compacted: isCompacted });
=======
    const breakdown = composeContextBreakdown(computedBreakdown, { windowTokens: tokenBreakdown.total, compacted: isCompacted });
>>>>>>> upstream/main

    const firstMessageTs = sessionMessages[0]?.info.createdAt;
    const lastMessageTs = sessionMessages.length > 0
      ? sessionMessages[sessionMessages.length - 1]?.info.createdAt
      : null;

    return {
      sessionTitle: currentSession?.title || t('contextSidebar.session.untitled'),
      messagesCount: sessionMessages.length,
      userMessagesCount: userMessages.length,
      assistantMessagesCount: assistantMessages.length,
      createdAt: currentSession?.createdAt ?? firstMessageTs ?? null,
      lastActivityAt: lastMessageTs ?? currentSession?.createdAt ?? null,
      providerModel,
      tokenBreakdown,
      usagePercent,
      cacheHitRate,
      totalAssistantCost,
      contextLimit,
      breakdown: {
        user: userTokens,
        assistant: assistantTokens,
        tool: toolTokens,
        other: otherTokens,
      },
      breakdownTotal,
    };
  }, [configuredPairState, currentSessionId, providers, sessionMessages, sessionSelectionConfig, sessions, t]);

  if (!currentSessionId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center typography-ui-label text-muted-foreground">
        {t('contextSidebar.empty.openSession')}
      </div>
    );
  }

  const segments: Array<{ key: string; label: string; value: number; color: string }> = [
    { key: 'user', label: t('contextSidebar.breakdown.user'), value: viewModel.breakdown.user, color: 'var(--status-success)' },
    { key: 'assistant', label: t('contextSidebar.breakdown.assistant'), value: viewModel.breakdown.assistant, color: 'var(--primary-base)' },
    { key: 'tool', label: t('contextSidebar.breakdown.toolCalls'), value: viewModel.breakdown.tool, color: 'var(--status-warning)' },
    { key: 'other', label: t('contextSidebar.breakdown.other'), value: viewModel.breakdown.other, color: 'var(--surface-muted-foreground)' },
  ];

  return (
    <ScrollableOverlay outerClassName="h-full" className="bg-background">
<<<<<<< HEAD
||||||| bc50ba56aa
      {/* In the context panel the session title names the panel itself, in
          place of the generic "Context" label. */}
      {inPanelHeader ? (
        <ContextPanelHeaderToolbar>
          <div className="flex min-w-0 flex-1 items-center ps-1.5 pe-1">
            <span dir="auto" className="truncate typography-ui-label text-foreground" title={viewModel.sessionTitle}>{viewModel.sessionTitle}</span>
          </div>
        </ContextPanelHeaderToolbar>
      ) : null}
=======
      {inPanelHeader ? (
        <ContextPanelHeaderToolbar>
          <div className="flex min-w-0 flex-1 items-center ps-1.5 pe-1">
            <span dir="auto" className="truncate typography-ui-label text-foreground" title={viewModel.sessionTitle}>{viewModel.sessionTitle}</span>
          </div>
        </ContextPanelHeaderToolbar>
      ) : null}
>>>>>>> upstream/main
      <div className="mx-auto w-full max-w-[52rem] px-5 py-6">

        <div className="mb-6">
          <h2 dir="auto" className="typography-ui-header font-semibold text-foreground truncate text-left">{viewModel.sessionTitle}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 typography-micro text-muted-foreground/70">
            <span>{viewModel.providerModel.providerName} / {viewModel.providerModel.modelName}</span>
            {viewModel.createdAt && (
              <>
                <span>&middot;</span>
                <span>{formatDateTime(viewModel.createdAt, timeFormatPreference)}</span>
              </>
            )}
          </div>
        </div>

        <div className="mb-5 rounded-lg bg-[var(--surface-elevated)]/70 px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="typography-micro text-muted-foreground">{t('contextSidebar.section.context')}</span>
            <span className="typography-micro tabular-nums text-muted-foreground/70">
              {formatNumber(viewModel.tokenBreakdown.total)}
              {viewModel.contextLimit ? ` / ${formatNumber(viewModel.contextLimit)}` : ''}
            </span>
          </div>
          <div className="mt-2.5 flex h-1 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
            {viewModel.usagePercent > 0 && (
              <div
                className="rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(0.5, viewModel.usagePercent)}%`,
                  backgroundColor: viewModel.usagePercent > 80 ? 'var(--status-warning)' : 'var(--primary-base)',
                }}
              />
            )}
          </div>
          <div className="mt-1.5 typography-micro font-medium tabular-nums text-foreground/80">
            {t('contextSidebar.context.percentUsed', { percent: viewModel.usagePercent.toFixed(1) })}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          {([
            { label: t('contextSidebar.stats.messages'), value: formatNumber(viewModel.messagesCount) },
            { label: t('contextSidebar.stats.user'), value: formatNumber(viewModel.userMessagesCount) },
            { label: t('contextSidebar.stats.assistant'), value: formatNumber(viewModel.assistantMessagesCount) },
            { label: t('contextSidebar.stats.cost'), value: formatMoney(viewModel.totalAssistantCost) },
          ] as const).map((item) => (
            <div key={item.label} className="rounded-lg bg-[var(--surface-elevated)]/70 px-3 py-2.5">
              <div className="typography-micro text-muted-foreground/70">{item.label}</div>
              <div className="mt-0.5 typography-ui-label tabular-nums text-foreground">{item.value}</div>
            </div>
          ))}
        </div>

<<<<<<< HEAD
        {/* ── Last turn tokens ── */}
        <div className="mb-5 rounded-lg bg-[var(--surface-elevated)]/70 px-4 py-3.5">
          <div className="typography-micro text-muted-foreground mb-2.5">{t('contextSidebar.section.lastAssistantMessage')}</div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
            {([
              { label: t('contextSidebar.tokens.input'), value: viewModel.tokenBreakdown.input, format: 'count' },
              { label: t('contextSidebar.tokens.output'), value: viewModel.tokenBreakdown.output, format: 'count' },
              { label: t('contextSidebar.tokens.reasoning'), value: viewModel.tokenBreakdown.reasoning, format: 'count' },
              { label: t('contextSidebar.tokens.cacheRead'), value: viewModel.tokenBreakdown.cacheRead, format: 'count' },
              { label: t('contextSidebar.tokens.cacheWrite'), value: viewModel.tokenBreakdown.cacheWrite, format: 'count' },
              {
                label: t('contextSidebar.tokens.cacheHit'),
                value: viewModel.cacheHitRate.hasInput ? viewModel.cacheHitRate.percent : null,
                format: 'percent',
              },
            ] as const).map((item) => (
              <div key={item.label}>
                <div className="typography-micro text-muted-foreground/70">{item.label}</div>
                <div className="mt-0.5 typography-ui-label tabular-nums text-foreground">
                  {item.value !== null && item.value !== undefined
                    ? item.format === 'percent'
                      ? `${item.value.toFixed(1)}%`
                      : formatNumber(item.value)
                    : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
||||||| bc50ba56aa
        {/* ── Whole-session tokens, then the last turn's, in the same columns ── */}
        <TokenFiguresCard
          title={t('contextSidebar.section.sessionTotals')}
          figures={viewModel.sessionTotals}
        />
        <TokenFiguresCard
          title={t('contextSidebar.section.lastAssistantMessage')}
          figures={{
            ...viewModel.tokenBreakdown,
            prompt: viewModel.tokenBreakdown.input + viewModel.tokenBreakdown.cacheRead + viewModel.tokenBreakdown.cacheWrite,
            cacheHitPercent: viewModel.cacheHitRate.hasInput ? viewModel.cacheHitRate.percent : null,
          }}
        />
=======
        <TokenFiguresCard
          title={t('contextSidebar.section.sessionTotals')}
          figures={viewModel.sessionTotals}
        />
        <TokenFiguresCard
          title={t('contextSidebar.section.lastAssistantMessage')}
          figures={{
            ...viewModel.tokenBreakdown,
            prompt: viewModel.tokenBreakdown.input + viewModel.tokenBreakdown.cacheRead + viewModel.tokenBreakdown.cacheWrite,
            cacheHitPercent: viewModel.cacheHitRate.hasInput ? viewModel.cacheHitRate.percent : null,
          }}
        />
>>>>>>> upstream/main

        <div className="mb-6">
          <div className="flex h-1 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
            {segments.map((segment) => {
              if (segment.value <= 0 || viewModel.breakdownTotal <= 0) return null;
              return (
                <div
                  key={segment.key}
                  style={{
                    width: `${(segment.value / viewModel.breakdownTotal) * 100}%`,
                    backgroundColor: segment.color,
                  }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {segments.map((segment) => {
              const pct = viewModel.breakdownTotal > 0 ? (segment.value / viewModel.breakdownTotal) * 100 : 0;
              return (
                <div key={segment.key} className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  <span className="typography-micro text-muted-foreground/70">
                    {segment.label} <span className="tabular-nums">{pct.toFixed(0)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="typography-micro text-muted-foreground">{t('contextSidebar.section.rawMessages')}</div>
          <div className="mt-2.5 space-y-1">
            {[...sessionMessages].reverse().map((message) => {
              const role = message.info.role;
              const isAssistant = role === 'assistant';
              const isUser = role === 'user';
              const isExpanded = expandedRawMessages[message.info.messageId] === true;
              const isCopied = copiedRawMessageId === message.info.messageId;
              const messageCreatedAt = message.info.createdAt;
              const partsLabel = derivePartsLabel(message.parts);
              const tokens = isAssistant ? extractTokenBreakdown({ info: message.info, parts: message.parts }) : null;
              const userSnippet = isUser ? deriveUserSnippet(message.parts) : '';
              const previewTime = formatMessagePreviewTime(messageCreatedAt, timeFormatPreference);
              // Keep token/time columns stable; the message label owns all
              // remaining space and truncates before it can push metrics.
              const assistantLeft = partsLabel || '\u2014';
              const assistantMiddle = tokens
                ? formatAssistantTokens(tokens.input, tokens.output, formatNumber)
                : '';
              const otherLeft = role || 'unknown';
              const otherLabel = partsLabel ? `${otherLeft}: ${partsLabel}` : otherLeft;

              const jsonValue = isExpanded
                ? JSON.stringify({ info: message.info, parts: message.parts }, null, 2)
                : '';

              return (
                <div
                  key={message.info.messageId}
                  className="overflow-hidden rounded-lg bg-[var(--surface-elevated)]/70"
                >
                  <button
                    type="button"
                    className="w-full cursor-pointer px-3 py-1.5 text-left hover:bg-[var(--interactive-hover)]"
                    aria-expanded={isExpanded}
                    onClick={() => {
                      setExpandedRawMessages((prev) => ({
                        ...prev,
                        [message.info.messageId]: !(prev[message.info.messageId] === true),
                      }));
                    }}
                  >
                    <div
                      className="grid items-center gap-x-2 whitespace-nowrap typography-micro"
                      style={{ gridTemplateColumns: isAssistant ? 'minmax(0, 1fr) 7.5rem max-content' : 'minmax(0, 1fr) max-content' }}
                    >
                      {isUser ? (
                        <span
                          className="min-w-0 truncate text-muted-foreground"
                        >
                          <span className="typography-ui-label text-foreground">user:</span>{' '}
                          {userSnippet}
                        </span>
                      ) : (
                        <>
                          <span
                            className={
                              isAssistant
                                ? 'min-w-0 truncate text-muted-foreground'
                                : 'min-w-0 truncate text-muted-foreground'
                            }
                          >
                            {isAssistant ? assistantLeft : otherLabel}
                          </span>
                          {isAssistant && (
                            <span className="text-right text-muted-foreground tabular-nums">
                              {assistantMiddle}
                            </span>
                          )}
                        </>
                      )}
                      <span className="text-right text-muted-foreground">{previewTime}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--surface-subtle)] p-0">
                      <ScrollableOverlay outerClassName="max-h-[26rem] bg-[var(--surface-background)]" className="group relative" disableHorizontal>
                        <div className="absolute top-1 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCopyRawMessage(message.info.messageId, jsonValue);
                                }}
                                aria-label={isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}
                              >
                                {isCopied ? <Icon name="check" className="size-3.5" /> : <Icon name="file-copy" className="size-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>{isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}</TooltipContent>
                          </Tooltip>
                        </div>
                        <WorkerHighlightedCode
                          language="json"
                          code={jsonValue}
                          style={{
                            margin: 0,
                            padding: '0.75rem',
                            background: 'transparent',
                            fontSize: 'var(--text-micro)',
                            lineHeight: '1.35',
                          }}
                          wrap
                        />
                      </ScrollableOverlay>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollableOverlay>
  );
};
