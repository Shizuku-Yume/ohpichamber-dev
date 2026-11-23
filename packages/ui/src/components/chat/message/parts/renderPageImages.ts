import React from 'react';

import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { captureRuntimeInstance, getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import type { CanonicalToolView } from './toolView';
import {
    ImageGrantRequestError,
    loadPreparedImageAsDataUrl,
    prepareLocalMarkdownImages,
} from '../../markdown/markdownImageAssets';

const LOCAL_IMAGE_RE = /(["'`])((?:file:\/\/|\/(?!\/)|[A-Za-z]:[\\/])(?:(?!\1)[^<>\n])*?\.(?:png|jpe?g|gif|webp))\1|url\(\s*((?:file:\/\/|\/(?!\/)|[A-Za-z]:[\\/])[^"'`<>()\s]*?\.(?:png|jpe?g|gif|webp))\s*\)/gi;
const OLDER_SERVER_MAX_IMAGES = 12;

/** The local image paths a page names, in order, once each. */
export function renderPageImageSources(html: string): string[] {
    const sources = new Set<string>();
    for (const match of html.matchAll(LOCAL_IMAGE_RE)) {
        const source = match[2] ?? match[3];
        if (source) sources.add(source);
    }
    return [...sources];
}


/** The page with each loaded image's path swapped for its data URL; an image that did not load keeps its path. */
export function inlineRenderPageImages(html: string, images: ReadonlyMap<string, string>): string {
    return html.replace(LOCAL_IMAGE_RE, (match: string, quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
        const url = images.get(quoted ?? bare ?? '');
        if (!url) return match;
        return quote ? `${quote}${url}${quote}` : `url(${url})`;
    });
}

type PrepareImages = typeof prepareLocalMarkdownImages;

/**
 * Asks the image grant route for a page's images. A server from before the
 * weight budget refuses the whole request with a 400 when the page names more
 * than 12 images; the page then gets its first 12, as it did from that server
 * before. Any other failure stays a failure: a request without the page's call
 * id gets no weight budget.
 */
export function prepareRenderPageImages(
    request: Parameters<PrepareImages>[0] & { callId: string },
    prepare: PrepareImages = prepareLocalMarkdownImages,
    isCurrent: () => boolean = () => true,
): ReturnType<PrepareImages> {
    const { sources, directory, sessionId, messageId, signal } = request;
    return prepare(request).catch((error) => {
        const olderServer = error instanceof ImageGrantRequestError && error.status === 400;
        if (!olderServer || sources.length <= OLDER_SERVER_MAX_IMAGES || signal.aborted || !isCurrent()) throw error;
        return prepare({ sources: sources.slice(0, OLDER_SERVER_MAX_IMAGES), directory, sessionId, messageId, signal });
    });
}

async function loadRenderPageImages({ sources, sessionId, messageId, callId, directory, signal }: {
    sources: string[];
    sessionId: string;
    messageId: string;
    callId: string;
    directory: string;
    signal: AbortSignal;
}): Promise<Map<string, string>> {
    const isCurrent = captureRuntimeInstance();
    const images = new Map<string, string>();
    const keep = (source: string) => (url: string) => {
        images.set(source, url);
    };
    const skip = () => undefined;
    const prepared = await prepareRenderPageImages({ sources, directory, sessionId, messageId, callId, signal }, prepareLocalMarkdownImages, isCurrent);
    if (!isCurrent()) throw new Error('Runtime changed');
    await Promise.all(sources.map((source) => {
        const image = prepared.get(source);
        if (image?.status !== 'ready') return undefined;
        return loadPreparedImageAsDataUrl(image, directory, signal).then(keep(source), skip);
    }));
    return images;
}

const MAX_REMEMBERED_CHARACTERS = 100 * 1024 * 1024;
const rememberedPages = new Map<string, { html: string; inlined: string }>();
let rememberedCharacters = 0;
const forgetPage = (partId: string) => {
    const page = rememberedPages.get(partId);
    if (!page) return;
    rememberedPages.delete(partId);
    rememberedCharacters -= page.inlined.length;
};
const rememberPage = (partId: string, html: string, inlined: string) => {
    forgetPage(partId);
    rememberedPages.set(partId, { html, inlined });
    rememberedCharacters += inlined.length;
    for (const oldest of rememberedPages.keys()) {
        if (rememberedCharacters <= MAX_REMEMBERED_CHARACTERS || oldest === partId) break;
        forgetPage(oldest);
    }
};

/**
 * The page's HTML with its local images in place, or null while they load. A
 * page that names none is ready at once. The page is drawn once its images are
 * in, not before: drawing it again would reload it and lose what its script
 * holds.
 */
export function useRenderPageHtml(part: CanonicalToolView, html: string): string | null {
    const directory = useEffectiveDirectory() ?? '';
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    const pageKey = JSON.stringify([runtimeKey, directory, part.sessionID, part.messageID, part.callID, part.id]);
    const sources = React.useMemo(() => renderPageImageSources(html), [html]);
    const [loaded, setLoaded] = React.useState(() => ({ key: pageKey, page: rememberedPages.get(pageKey) ?? null }));
    const { id: partId, sessionID: sessionId, messageID: messageId, callID: callId } = part;

    React.useEffect(() => {
        if (sources.length === 0) return;
        const remembered = rememberedPages.get(pageKey);
        if (remembered?.html === html) {
            setLoaded({ key: pageKey, page: remembered });
            return;
        }
        const controller = new AbortController();
        const isCurrent = captureRuntimeInstance();
        loadRenderPageImages({ sources, sessionId, messageId, callId, directory, signal: controller.signal })
            .catch(() => new Map<string, string>())
            .then((images) => {
                if (controller.signal.aborted || !isCurrent()) return;
                const page = { html, inlined: inlineRenderPageImages(html, images) };
                rememberPage(pageKey, page.html, page.inlined);
                setLoaded({ key: pageKey, page });
            });
        return () => controller.abort();
    }, [callId, directory, html, messageId, pageKey, partId, sessionId, sources]);

    if (sources.length === 0) return html;
    return loaded.key === pageKey && loaded.page?.html === html ? loaded.page.inlined : null;
}
