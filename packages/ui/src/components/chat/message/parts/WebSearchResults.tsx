import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n, getCurrentIntlLocale } from '@/lib/i18n';
import type { NativeSearchOutput, NativeSearchSource } from '@/lib/native-web-search';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { openExternalUrl } from '@/lib/url';
import { useWebSearchStore } from '@/stores/useWebSearchStore';


const formatPublished = (iso: string): string | null => {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleDateString(getCurrentIntlLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
};

const originOf = (url: string): string | null => {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

const SiteIcon: React.FC<{ url: string }> = ({ url }) => {
    const origin = originOf(url);
    const [failed, setFailed] = React.useState(false);
    if (!origin || failed) {
        return <Icon name="global" className="size-3.5 text-muted-foreground" />;
    }
    return (
        <img
            src={`${origin}/favicon.ico`}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-3.5 rounded-sm"
            onError={() => setFailed(true)}
        />
    );
};

const ResultCard: React.FC<{ result: NativeSearchSource }> = ({ result }) => {
    const published = result.publishedDate ? formatPublished(result.publishedDate) ?? result.publishedDate : null;
    let host = result.url;
    try {
        host = new URL(result.url).hostname;
    } catch {
        // Keep raw url as fallback display label.
    }
    const snippet = result.snippet?.replace(/\s+/g, ' ').trim() ?? '';

    // Plain primary clicks use the retained runtime's external URL opener;
    // modified clicks keep the browser default.
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        void openExternalUrl(result.url);
    };

    return (
        <li>
            <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClick}
                className="group flex min-w-0 gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-interactive-hover/30"
            >
                <span className="mt-1 flex size-3.5 shrink-0 items-center justify-center">
                    <SiteIcon url={result.url} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate typography-meta font-medium text-foreground group-hover:underline">
                        {result.title || host}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 typography-micro text-muted-foreground">
                        <span className="truncate">{host}</span>
                        {published ? <span className="shrink-0 tabular-nums">{published}</span> : null}
                    </span>
                    {snippet ? (
                        <span className="mt-0.5 line-clamp-2 break-words typography-meta text-muted-foreground">{snippet}</span>
                    ) : null}
                </span>
            </a>
        </li>
    );
};

export const WebSearchResults: React.FC<{ output: NativeSearchOutput }> = ({ output }) => {
    const { t } = useI18n();
    const response = output.details.response;
    const providerId = response.provider;
    const answer = response.answer?.trim() ?? '';
    const failures = output.details.failures ?? [];
    // Name the provider when Settings already read the list; the id otherwise.
    const providerName = useWebSearchStore((store) => {
        if (!providerId) return null;
        const state = store.state;
        if (state.kind !== 'ready') return providerId;
        return state.snapshot.providers.find((provider) => provider.providerId === providerId)?.name ?? providerId;
    });

    return (
        <div className="w-full min-w-0 space-y-2">
            {output.details.error ? (
                <p
                    role="alert"
                    className="rounded-lg border px-2.5 py-1.5 typography-meta"
                    style={{
                        color: 'var(--status-error-text)',
                        backgroundColor: 'var(--status-error-background)',
                        borderColor: 'var(--status-error-border)',
                    }}
                >
                    {output.details.error}
                </p>
            ) : null}
            {failures.length > 0 ? (
                <div
                    data-testid="web-search-failures"
                    className="rounded-lg border px-2.5 py-1.5 space-y-1 typography-micro"
                    style={{
                        color: 'var(--status-warning-text)',
                        backgroundColor: 'var(--status-warning-background)',
                        borderColor: 'var(--status-warning-border)',
                    }}
                >
                    <div className="flex items-center gap-1.5 font-medium">
                        <Icon name="alert" className="size-3.5 shrink-0" style={{ color: 'var(--status-warning)' }} />
                        <span>
                            {failures.length === 1
                                ? t('chat.webSearch.failuresSingle')
                                : t('chat.webSearch.failuresPlural', { count: failures.length })}
                        </span>
                    </div>
                    <ul className="space-y-0.5 ps-5">
                        {failures.map((item, index) => (
                            <li key={`${index}:${item.provider}`} className="break-words">
                                <span className="font-medium">{item.label || item.provider}</span>
                                {item.status !== undefined ? <span className="opacity-80"> ({item.status})</span> : null}
                                {item.reason ? <span>: {item.reason}</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {answer ? (
                <div
                    data-testid="web-search-answer"
                    className="rounded-lg border border-border/50 bg-[var(--surface-elevated)]/60 px-3 py-2 space-y-1"
                >
                    <div className="flex items-center gap-1.5 typography-micro font-medium text-muted-foreground">
                        <Icon name="sparkling-2" className="size-3.5 shrink-0" />
                        <span>{t('chat.webSearch.answer')}</span>
                    </div>
                    <SimpleMarkdownRenderer
                        content={answer}
                        variant="tool"
                        fallbackContent={<div className="typography-meta whitespace-pre-wrap break-words text-foreground/90">{answer}</div>}
                    />
                </div>
            ) : null}
            {response.sources.length > 0 ? (
                <ul className="space-y-0.5">
                    {response.sources.map((result, index) => (
                        <ResultCard key={`${index}:${result.url}`} result={result} />
                    ))}
                </ul>
            ) : !answer && !output.details.error ? (
                <div className="px-2 typography-meta text-muted-foreground">{t('chat.webSearch.noResults')}</div>
            ) : null}
            {response.citations?.map((citation, index) => (
                <a
                    key={`${index}:${citation.url}`}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block typography-meta underline"
                >
                    {citation.title || citation.url}{citation.citedText ? ` — ${citation.citedText}` : ''}
                </a>
            ))}
            {output.content.length > 0 ? (
                <details className="typography-meta">
                    <summary>{t('chat.toolPart.output')}</summary>
                    <SimpleMarkdownRenderer
                        content={output.content.map((part) => part.text).join('\n')}
                        variant="tool"
                        fallbackContent={<div className="typography-meta whitespace-pre-wrap break-words text-foreground/90">{output.content.map((part) => part.text).join('\n')}</div>}
                    />
                </details>
            ) : null}
            {providerName ? (
                <div className="px-2 typography-micro text-muted-foreground/80">
                    {t('chat.webSearch.provider', { provider: providerName })}
                </div>
            ) : null}
        </div>
    );
};
