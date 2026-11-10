import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n, getCurrentIntlLocale } from '@/lib/i18n';
<<<<<<< HEAD
import type { NativeSearchOutput, NativeSearchSource } from '@/lib/native-web-search';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { openExternalUrl } from '@/lib/url';
=======
import type { WebSearchOutput, WebSearchResult } from '@/lib/opencode/websearch';
import { ChatExternalLink } from './ChatExternalLink';
>>>>>>> bc50ba56a
import { useWebSearchStore } from '@/stores/useWebSearchStore';

/**
 * A finished `websearch` call as a list of result cards: site icon and
 * domain, the title linking out, the publish date, and a clamped snippet.
 * Native response details are projected by the canonical worker; malformed
 * responses retain the ordinary tool output renderer.
 */

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

// The site's own icon, fetched from the site itself (no third-party icon
// service sees the domain); the globe stands in when it has none.
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

<<<<<<< HEAD
const ResultCard: React.FC<{ result: NativeSearchSource }> = ({ result }) => {
    const published = result.publishedDate ? formatPublished(result.publishedDate) ?? result.publishedDate : null;
    const host = new URL(result.url).hostname;
    const snippet = result.snippet?.replace(/\s+/g, ' ').trim() ?? '';

    // Plain primary clicks use the retained runtime's external URL opener;
    // modified clicks keep the browser default.
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        void openExternalUrl(result.url);
    };

=======
const ResultCard: React.FC<{ result: WebSearchResult }> = ({ result }) => {
    const published = result.published ? formatPublished(result.published) : null;
    const snippet = result.snippet?.replace(/\s+/g, ' ').trim() ?? '';

>>>>>>> bc50ba56a
    return (
        <li>
            <ChatExternalLink
                href={result.url}
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
            </ChatExternalLink>
        </li>
    );
};

export const WebSearchResults: React.FC<{ output: NativeSearchOutput }> = ({ output }) => {
    const { t } = useI18n();
    const response = output.details.response;
    const providerId = response.provider;
    // Name the provider when Settings already read the list; the id otherwise.
    const providerName = useWebSearchStore((store) => {
        if (!providerId) return null;
        const state = store.state;
        if (state.kind !== 'ready') return providerId;
        return state.snapshot.providers.find((provider) => provider.providerId === providerId)?.name ?? providerId;
    });

    return (
        <div className="w-full min-w-0 space-y-1">
            {output.details.error ? <p role="alert">{output.details.error}</p> : null}
            {response.answer ? <SimpleMarkdownRenderer content={response.answer} variant="tool" /> : null}
            {response.sources.length === 0 && !response.answer ? (
                <div className="px-2 typography-meta text-muted-foreground">{t('chat.webSearch.noResults')}</div>
            ) : (
                <ul className="space-y-0.5">
                    {response.sources.map((result, index) => (
                        <ResultCard key={`${index}:${result.url}`} result={result} />
                    ))}
                </ul>
            )}
            {response.citations?.map((citation, index) => <a key={`${index}:${citation.url}`} href={citation.url} target="_blank" rel="noopener noreferrer" className="block typography-meta underline">{citation.title || citation.url}{citation.citedText ? ` — ${citation.citedText}` : ''}</a>)}
            {output.content.length > 0 ? <details className="typography-meta"><summary>{t('chat.toolPart.output')}</summary><SimpleMarkdownRenderer content={output.content.map((part) => part.text).join('\n')} variant="tool" /></details> : null}
            {providerName ? (
                <div className="px-2 typography-micro text-muted-foreground">
                    {t('chat.webSearch.provider', { provider: providerName })}
                </div>
            ) : null}
        </div>
    );
};
