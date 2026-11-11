import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { SyncProvider } from '@/sync/sync-context';
import type { MessageListHandle } from './MessageList';
import { KeepAlive } from '@/components/ui/KeepAlive';
import { ChatColumnSessionContext } from './chatColumnSession';
import { useChatTimelineScroll, type TimelineListHandle } from '@/hooks/useChatTimelineScroll';
import { I18nProvider } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { useChatQuoteHighlightStore, type ChatQuoteHighlightStore } from './hooks/chatQuoteHighlightStore';
import { ChatQuoteHighlightLayer } from './message/ChatQuoteHighlightLayer';
import type { ChatMessageEntry } from './lib/turns/types';
import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';

// Bun does not implement Vite's worker URL imports.
plugin({
    name: 'navigation-worker-url',
    setup(build) {
        build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
            contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`,
            loader: 'js',
        }));
    },
});
const { default: MessageList } = await import('./MessageList');
const { MarkdownContent } = await import('./MarkdownRendererImpl');

test('quote reveal opens real folded Activity, including a source prepended from history', async () => {
    const dom = new Window({ url: 'https://app.test' });
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestAnimationFrame = (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; };
    const cancelAnimationFrame = (id: number) => { frames.delete(id); };
    class TestHighlight extends Set<Range> {
        priority = 0;
        constructor(...ranges: Range[]) { super(ranges); }
    }
    const highlights = new Map<string, TestHighlight>();
    Object.assign(dom, { requestAnimationFrame, cancelAnimationFrame, Highlight: TestHighlight });
    Object.defineProperties(dom.HTMLElement.prototype, {
        clientHeight: { configurable: true, get: () => 800 },
        clientWidth: { configurable: true, get: () => 800 },
    });
    dom.HTMLElement.prototype.getBoundingClientRect = () => new dom.DOMRect(0, 0, 800, 320);
    const matchMedia = dom.matchMedia.bind(dom);
    dom.matchMedia = (query) => {
        const result = matchMedia(query);
        if (query.includes('prefers-reduced-motion')) Object.defineProperty(result, 'matches', { value: true });
        return result;
    };
    const values = {
        window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element,
        Node: dom.Node, localStorage: dom.localStorage, sessionStorage: dom.sessionStorage,
        getComputedStyle: dom.getComputedStyle.bind(dom), ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver,
        requestAnimationFrame, cancelAnimationFrame, Highlight: TestHighlight,
        customElements: dom.customElements,
        CSS: { highlights, escape: (value: string) => value }, IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise(() => { });
    const unavailable = (): never => { throw new Error('Quote navigation must not call runtime APIs'); };
    const runtime: RuntimeAPIs = {
        runtime: { platform: 'web', isDesktop: false, isVSCode: false },
        get terminal() { return unavailable(); }, get git() { return unavailable(); },
        get files() { return unavailable(); }, get settings() { return unavailable(); },
        get permissions() { return unavailable(); }, get notifications() { return unavailable(); },
        get sourceControl() { return unavailable(); },
    };
    const previousMode = useUIStore.getState().activityRenderMode;
    const previousReasoning = useUIStore.getState().showReasoningTraces;
    useUIStore.setState({ activityRenderMode: 'collapsed', showReasoningTraces: true });
    const turn = (prefix: string, created: number): ChatMessageEntry[] => {
        const userId = `${prefix}-user`;
        return [
            {
                messageId: userId,
                sessionId: 'quote-navigation',
                turnId: `${prefix}-turn`,
                role: 'user',
                createdAt: created,
                parts: [
                    { type: 'text', partId: `${prefix}-prompt`, content: 'Check this.' },
                ],
            },
            ...['source', 'answer'].map((kind, index): ChatMessageEntry => {
                const id = `${prefix}-${kind}`;
                return {
                    messageId: id,
                    sessionId: 'quote-navigation',
                    turnId: `${prefix}-turn`,
                    role: 'assistant',
                    createdAt: created + index + 1,
                    parts: [
                        ...(index === 0 ? [{ type: 'reasoning' as const, partId: `${id}-reasoning`, content: 'Checking.' }] : []),
                        { type: 'text', partId: `${id}-text`, content: index === 0 ? `Earlier **${prefix} quoted text** here.` : 'Done.' },
                    ],
                };
            }),
        ];
    };
    const recent = turn('recent', 10);
    const older = turn('older', 1);
    let messages = recent;
    let store: ChatQuoteHighlightStore | undefined;
    let finishLoad: ((loaded: boolean) => void) | undefined;
    const ref = React.createRef<MessageListHandle>();
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    function Harness() {
        const quoteStore = useChatQuoteHighlightStore();
        store = quoteStore;
        const [scrollNode, setScrollNode] = React.useState<HTMLElement | null>(null);
        const register = React.useCallback((list: TimelineListHandle | null) => { setScrollNode(list?.getScrollableNode() ?? null); }, []);
        return <>
            <MessageList ref={ref} sessionKey="quote-navigation" messages={messages} isLoadingOlder={false} registerList={register} scrollContainerProps={{ 'data-scrollbar': 'chat' }} />
            <ChatQuoteHighlightLayer
                store={quoteStore}
                scrollNode={scrollNode}
                // A message already in the list needs no history; the older turn
                // is not there yet, so the layer waits for the load to finish.
                loadHistoryUntilMessage={(id) => (messages.some((message) => message.messageId === id)
                    ? Promise.resolve(true)
                    : new Promise<boolean>((resolve) => { finishLoad = resolve; }))}
                scrollToMessage={async (id, options) => ref.current?.scrollToMessageId(id, options) ?? false}
            />
        </>;
    }
    const render = () => act(async () => {
        root.render(
            <RuntimeAPIContext.Provider value={runtime}>
                <ThemeSystemProvider>
                    <SyncProvider directory="/repo">
                        <I18nProvider>
                            <ChatColumnSessionContext.Provider value={{ sessionId: 'quote-navigation', directory: '/repo' }}>
                                <Harness />
                            </ChatColumnSessionContext.Provider>
                        </I18nProvider>
                    </SyncProvider>
                </ThemeSystemProvider>
            </RuntimeAPIContext.Provider>,
        );
    });
    const flush = async () => {
        await act(async () => {
            await new Promise<void>((resolve) => dom.setTimeout(resolve, 0));
            const pending = [...frames.values()]; frames.clear();
            pending.forEach((callback) => callback(0));
        });
    };
    const reveal = (prefix: string) => act(async () => {
        store?.reveal(`${prefix}-source`, { text: `${prefix} quoted text`, prefix: '', suffix: '', start: 0 });
    });
    const expectHighlight = async (prefix: string) => {
        for (let index = 0; index < 30 && !highlights.has('oc-chat-quote'); index += 1) await flush();
        const source = host.querySelector(`[data-message-id="${prefix}-source"]`);
        expect(source).not.toBeNull();
        // An opened fold draws its steps as rows of their own, outside any closed fold.
        expect(source?.closest('[data-live-activity-content][aria-hidden="true"]')).toBeNull();
        expect(source?.textContent).toContain(`${prefix} quoted text`);
        expect([...highlights.get('oc-chat-quote') ?? []].map((range) => range.toString())).toEqual([`${prefix} quoted text`]);
    };
    try {
        await render();
        for (let index = 0; index < 5; index += 1) await flush();
        expect(host.querySelector('[data-message-id="recent-source"]')).toBeNull();
        await reveal('recent');
        await expectHighlight('recent');
        highlights.clear();
        await reveal('older');
        expect(finishLoad).toBeDefined();
        messages = [...older, ...recent];
        await render();
        for (let index = 0; index < 5; index += 1) await flush();
        expect(host.querySelector('[data-message-id="older-source"]')).toBeNull();
        await act(async () => finishLoad?.(true));
        await expectHighlight('older');
    } finally {
        await act(async () => root.unmount());
        useUIStore.setState({ activityRenderMode: previousMode, showReasoningTraces: previousReasoning });
        globalThis.fetch = originalFetch;
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
        await dom.happyDOM.close();
    }
});

test('retains real lists and Markdown while reconnecting only the selected scroller', async () => {
    const dom = new Window({ url: 'https://app.test' });
    const values = {
        window: dom,
        document: dom.document,
        navigator: dom.navigator,
        HTMLElement: dom.HTMLElement,
        Element: dom.Element,
        Node: dom.Node,
        localStorage: dom.localStorage,
        sessionStorage: dom.sessionStorage,
        getComputedStyle: dom.getComputedStyle.bind(dom),
        ResizeObserver: dom.ResizeObserver,
        MutationObserver: dom.MutationObserver,
        requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
        cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise(() => { });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const messages: [] = [];
    let selectedScrollRef: React.RefObject<HTMLDivElement | null> = { current: null };

    function Harness({ name, text }: { name: string; text: string }) {
        const ref = React.useRef<MessageListHandle | null>(null);
        const scroll = useChatTimelineScroll({
            currentSessionId: name,
            currentSessionKey: name,
            composerOverlayHeight: 0,
            messageListRef: ref,
            sessionIsWorking: false,
        });
        const { registerList } = scroll;
        const register = React.useCallback((list: TimelineListHandle | null) => {
            registerList(list);
        }, [registerList]);
        React.useLayoutEffect(() => {
            selectedScrollRef = scroll.scrollRef;
        });
        return (
            <KeepAlive cacheKey={name} capacity={4}>
                <ChatColumnSessionContext.Provider value={{ sessionId: name, directory: '/repo' }}>
                    <MessageList
                        ref={ref}
                        sessionKey={name}
                        directory="/repo"
                        messages={messages}
                        isLoadingOlder={false}
                        registerList={register}
                        listFooter={(
                            <div data-session={name}>
                                <input defaultValue={name} />
                                <MarkdownContent content={text} purpose="copy" enableFileReferences={false} />
                            </div>
                        )}
                        scrollContainerProps={{ 'data-scrollbar': 'chat' }}
                    />
                </ChatColumnSessionContext.Provider>
            </KeepAlive>
        );
    }
    const render = (name: string, text = `**${name}**`) => act(async () => {
        root.render(
            <SyncProvider directory="/repo">
                <Harness name={name} text={text} />
            </SyncProvider>,
        );
    });

    try {
        await render('A');
        const a = host.querySelector('[data-session="A"]');
        const markdown = a?.querySelector('[data-markdown-content]');
        const input = a?.querySelector('input');
        if (!input || !selectedScrollRef.current || !markdown) throw new Error('Missing initial list');
        input.value = 'kept';
        const firstScroller = selectedScrollRef.current;

        await render('B');
        const secondScroller = selectedScrollRef.current;
        expect(secondScroller).not.toBeNull();
        expect(secondScroller).not.toBe(firstScroller);

        await render('A', '**updated**');
        expect(selectedScrollRef.current).toBe(firstScroller);
        expect(host.querySelector('[data-session="A"]')).toBe(a);
        expect(a?.querySelector('[data-markdown-content]')).toBe(markdown);
        expect(markdown.textContent).toContain('updated');
        expect(input.value).toBe('kept');

        for (const name of ['C', 'D', 'E']) {
            await render(name);
        }
        expect(host.querySelectorAll('[data-scrollbar="chat"]').length).toBe(4);
        expect(host.querySelector('[data-session="B"]')).toBeNull();
        expect(a?.isConnected).toBe(true);

        await render('A', '**refreshed**');
        expect(host.querySelector('[data-session="A"]')).toBe(a);
        expect(markdown.textContent).toContain('refreshed');
    } finally {
        await act(async () => root.unmount());
        globalThis.fetch = originalFetch;
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
        await dom.happyDOM.close();
    }
});
