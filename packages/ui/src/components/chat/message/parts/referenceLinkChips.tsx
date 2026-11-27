import React from 'react';

import { isSameRepositoryItemLink } from '@/components/sourceBoard/openTrackerItem';
import { PromptContextSchema, type PromptContext, type SessionMetadata } from '@openchamber/agent-contract';
import { referenceLinkChip, type ReferenceLinkChip } from '@/lib/messages/referenceLinkChip';
import { useRepositoryUrlMatcher, type RepositoryUrlMatcher } from '@/lib/source-control/repositoryUrlMatcher';
import { useTrackerUrlMatcher, type TrackerUrlMatcher } from '@/lib/trackers/matchTrackerUrl';
import { findWebLinks } from '../../composer/referenceLinks';
import { CONTEXT_METADATA_KEY, readContextPart, type ContextPartPayload } from '@/lib/messages/contextParts';
import type { InlineTextNode } from './attachmentCitationChips';
import { ReferenceLinkChipButton } from './ReferenceLinkChipButton';

type InlineLinkedItem = Extract<ContextPartPayload, { kind: 'repository-issue' | 'repository-discussion' | 'change-request' | 'tracker-item' }>;

const linkedItemOfPromptContext = (part: PromptContext): InlineLinkedItem | null => {
    const payload = part.kind === 'context' ? readContextPart(part) : null;
    return payload && (payload.kind === 'repository-issue' || payload.kind === 'repository-discussion' || payload.kind === 'change-request' || payload.kind === 'tracker-item') ? payload : null;
};

type InlineReferenceLink = { chip: ReferenceLinkChip; url: string; part: PromptContext };

export type ReferenceLinkChips = ReadonlyMap<string, InlineReferenceLink>;

const NO_CHIPS: ReferenceLinkChips = new Map();

const withoutCode = (text: string): string => text
    .replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, ' ')
    .replace(/^(?: {4}|\t).*$/gm, ' ')
    .replace(/(`+)[\s\S]*?\1/g, ' ');

const namesItem = (link: string, item: InlineLinkedItem, urls: RepositoryUrlMatcher, trackerUrls: TrackerUrlMatcher): boolean => {
    const tracked = trackerUrls(link);
    if (tracked) {
        return item.kind === 'tracker-item'
            && item.provider === tracked.provider
            && item.identifier.toUpperCase() === tracked.identifier.toUpperCase();
    }
    return item.kind !== 'tracker-item' && isSameRepositoryItemLink(link, item.url, urls);
};

export function referenceLinkChipsOf(
    texts: readonly string[],
    parts: readonly PromptContext[],
    urls: RepositoryUrlMatcher,
    trackerUrls: TrackerUrlMatcher,
): ReferenceLinkChips {
    const items = parts.flatMap((part) => {
        const item = linkedItemOfPromptContext(part);
        return item ? [{ item, part }] : [];
    });
    if (items.length === 0) return NO_CHIPS;
    let chips: Map<string, InlineReferenceLink> | null = null;
    for (const text of texts) {
        for (const { link } of findWebLinks(withoutCode(text))) {
            if (chips?.has(link)) continue;
            const linked = items.find(({ item }) => item.kind === 'change-request' && item.sourceLinks?.includes(link))
                ?? items.find(({ item }) => namesItem(link, item, urls, trackerUrls));
            if (!linked) continue;
            chips ??= new Map();
            chips.set(link, { chip: referenceLinkChip(linked.item, urls.descriptorOf), url: linked.item.url, part: linked.part });
        }
    }
    return chips ?? NO_CHIPS;
}

type LinkedItems = NonNullable<NonNullable<SessionMetadata['openchamber']>['linked_issues']>;

export function referenceContextsOfLinks(links: LinkedItems | undefined, urls: RepositoryUrlMatcher): PromptContext[] {
    return (links ?? []).flatMap((link) => {
        let payload: InlineLinkedItem;
        if (link.kind === 'issue' || link.kind === 'pull') {
            const provider = urls.match(link.url)?.provider;
            payload = { kind: link.kind === 'issue' ? 'repository-issue' : 'change-request', number: link.number, title: link.title, url: link.url, ...(provider ? { provider } : {}) };
        } else if (link.kind === 'linear' || link.kind === 'tracker') {
            payload = { kind: 'tracker-item', provider: link.kind === 'linear' ? 'linear' : link.provider, identifier: link.identifier, title: link.title, url: link.url };
        } else return [];
        return [PromptContextSchema.parse({ kind: 'context', text: '', metadata: { [CONTEXT_METADATA_KEY]: payload } })];
    });
}

export function useSessionReferenceLinkChips(text: string, links: LinkedItems | undefined): ReferenceLinkChips {
    const urls = useRepositoryUrlMatcher();
    const trackerUrls = useTrackerUrlMatcher();
    return React.useMemo(() => referenceLinkChipsOf([text], referenceContextsOfLinks(links, urls), urls, trackerUrls), [links, text, trackerUrls, urls]);
}

export const ReferenceLinkChipsContext = React.createContext<ReferenceLinkChips>(NO_CHIPS);

export function withReferenceLinkChips(text: string, chips: ReferenceLinkChips, keyPrefix: string): InlineTextNode[] {
    if (chips.size === 0) return [text];
    const nodes: InlineTextNode[] = [];
    let cursor = 0;
    for (const range of findWebLinks(text)) {
        const linked = chips.get(range.link);
        if (!linked) continue;
        if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
        nodes.push(<ReferenceLinkChipButton key={`${keyPrefix}-${range.start}`} chip={linked.chip} url={linked.url} />);
        cursor = range.end;
    }
    if (cursor === 0) return [text];
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
}
