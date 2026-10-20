import React from 'react';
import type { JsonValue, Message, Part } from '@openchamber/agent-contract';
import type { Model, Provider } from '@openchamber/agent-contract';
import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';

import { Icon } from "@/components/icon/Icon";
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { computeCacheHitRate, findLatestContextFill, type ContextFillMessage } from '@/stores/utils/tokenUtils';
import { useSessions, useSessionMessageRecords } from '@/sync/sync-context';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { TimeFormatPreference } from '@/stores/useUIStore';
import { formatDateTimeForPreference } from '@/lib/timeFormat';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  derivePartsLabel,
  deriveUserSnippet,
  formatAssistantTokens,
  formatMessagePreviewTime,
} from './rawMessagePreview';


type SessionMessage = { info: Message; parts: Part[] };

type ContextProvider = Provider & { models: Model[] };
type ProviderModelDisplay = {
  providerName: string;
  modelName: string;
  contextLimit: number | null;
};

type TokenBreakdown = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

type ContextBuckets = {
  user: number;
  assistant: number;
  tool: number;
  other: number;
};

const EMPTY_BREAKDOWN: TokenBreakdown = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
};

const EMPTY_BUCKETS: ContextBuckets = {
  user: 0,
  assistant: 0,
  tool: 0,
  other: 0,
};

const extractTokenBreakdown = (message: SessionMessage): TokenBreakdown => {
  const usage = message.info.usage;
  if (!usage) return EMPTY_BREAKDOWN;
  return {
    input: usage.input,
    output: usage.output,
    reasoning: 0,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    total: usage.totalTokens,
  };
};

const estimateJsonLength = (value: JsonValue): number => JSON.stringify(value).length;

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
  if (part.type === 'attachment') {
    return { ...EMPTY_BUCKETS, other: part.name.length + part.mediaType.length + part.uri.length };
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

const resolveProviderAndModel = (
  providers: readonly ContextProvider[],
  providerID: string,
  modelID: string,
): ProviderModelDisplay => {
  const provider = providers.find((entry) => entry.providerId === providerID);
  const model = provider?.models?.find((entry) => entry.modelId === modelID);

  return {
    providerName: provider?.name || providerID || '-',
    modelName: model?.name || modelID || '-',
    contextLimit: model?.contextWindow ?? null,
  };
};

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
  const providers = useConfigStore((state) => state.providers);

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

    const contextFill = findLatestContextFill(sessionMessages.map(({ info }): ContextFillMessage => ({
      messageId: info.messageId,
      role: info.role,
      usage: info.usage,
    })));
    const contextMessage = contextFill ? sessionMessages[contextFill.index] ?? null : null;

    const tokenBreakdown = contextMessage ? extractTokenBreakdown(contextMessage) : EMPTY_BREAKDOWN;

    // Cache hit rate for the last assistant message. `input` is the non-cached portion
    // (total input - cache.read - cache.write per SDK's session.ts:getUsage),
    // so hit rate = cache.read / (input + cache.read + cache.write).
    const cacheHitRate = computeCacheHitRate({
      input: tokenBreakdown.input,
      cache: { read: tokenBreakdown.cacheRead, write: tokenBreakdown.cacheWrite },
    });

    const totalAssistantCost = assistantMessages.reduce((sum, message) => sum + (message.info.usage?.cost.total ?? 0), 0);

    const latestAssistantInfo = contextMessage?.info ?? null;
    const providerModel = resolveProviderAndModel(
      providers,
      latestAssistantInfo?.providerId || '',
      latestAssistantInfo?.modelId || '',
    );

    const contextLimit = providerModel.contextLimit;
    const usagePercent = contextFill && contextLimit && contextLimit > 0
      ? Math.min(999, (tokenBreakdown.total / contextLimit) * 100)
      : 0;

    // OpenCode v2 delivers instruction text as its own `system` message
    // instead of hanging a `system` string off the first user message.
    const systemMessage = [...sessionMessages].reverse().find((entry) => entry.info.role === 'system');
    const systemPrompt = systemMessage?.info.role === 'system' ? systemMessage.info.parts.filter((part) => part.type === 'text').map((part) => part.content).join('') : '';

    const computedBreakdown = computeContextBreakdown(sessionMessages, systemPrompt);

    const userTokens = computedBreakdown.user;
    const assistantTokens = computedBreakdown.assistant;
    const toolTokens = computedBreakdown.tool;
    const otherTokens = Math.max(0, tokenBreakdown.input - userTokens - assistantTokens - toolTokens);
    const breakdownTotal = userTokens + assistantTokens + toolTokens + otherTokens;

    const firstMessageTs = sessionMessages[0]?.info.createdAt;
    const lastMessageTs = sessionMessages.length > 0
      ? sessionMessages[sessionMessages.length - 1]?.info.createdAt
      : null;

    return {
      sessionTitle: currentSession?.metadata?.title || t('contextSidebar.session.untitled'),
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
  }, [currentSessionId, providers, sessionMessages, sessions, t]);

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
      <div className="mx-auto w-full max-w-[52rem] px-5 py-6">

        {/* ── Session header ── */}
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

        {/* ── Context usage ── */}
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

        {/* ── Stat grid ── */}
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

        {/* ── Context breakdown ── */}
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

        {/* ── Raw messages ── */}
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
                      <div className="group relative max-h-[26rem] w-full overflow-auto bg-[var(--surface-background)]">
                        <div className="absolute top-1 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleCopyRawMessage(message.info.messageId, jsonValue);
                            }}
                            aria-label={isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copyJson')}
                            title={isCopied ? t('contextSidebar.actions.copied') : t('contextSidebar.actions.copy')}
                          >
                            {isCopied ? <Icon name="check" className="size-3.5" /> : <Icon name="file-copy" className="size-3.5" />}
                          </button>
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
                      </div>
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
