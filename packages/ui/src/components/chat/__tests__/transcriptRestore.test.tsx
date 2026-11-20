import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Window } from 'happy-dom';

import { CanonicalClient } from '@/api/canonicalClient';
import type { Part } from '@openchamber/agent-contract';
import { I18nProvider, useI18nStore } from '@/lib/i18n';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { useUIStore } from '@/stores/useUIStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { SyncProvider } from '@/sync/sync-context';
import { projectTurnRecords } from '../lib/turns/projectTurnRecords';
import type { ChatMessageEntry } from '../lib/turns/types';

plugin({
    name: 'transcript-restore-worker-url',
    setup(build) {
        build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
            contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`, loader: 'js',
        }));
        // Expand Vite's eager asset glob into the same real file URL map for Bun.
        build.onLoad({ filter: /useProviderLogo\.ts$/ }, ({ path }) => {
            const folder = resolve(dirname(path), '../assets/provider-logos');
            const logos = Object.fromEntries(readdirSync(folder).filter((name) => name.endsWith('.svg'))
                .map((name) => [`../assets/provider-logos/${name}`, pathToFileURL(resolve(folder, name)).href]));
            const contents = readFileSync(path, 'utf8').replace(/import\.meta\.glob<string>\([\s\S]*?\);/, `${JSON.stringify(logos)};`);
            return { contents, loader: 'ts' };
        });
    },
});

const unavailable = (): never => { throw new Error('Transcript rendering must not call runtime APIs'); };
const runtimeApis: RuntimeAPIs = {
    runtime: { platform: 'web', isDesktop: false, isVSCode: false },
    get terminal() { return unavailable(); },
    get git() { return unavailable(); },
    get sourceControl() { return unavailable(); },
    get files() { return unavailable(); },
    get settings() { return unavailable(); },
    get permissions() { return unavailable(); },
    get notifications() { return unavailable(); },
};
const client = new CanonicalClient();

const theme = getDefaultTheme(false);
const themeValue: ThemeContextValue = {
    currentTheme: theme,
    availableThemes: [theme],
    customThemeIds: [],
    setTheme: () => undefined,
    customThemesLoading: false,
    reloadCustomThemes: async () => undefined,
    importTheme: async () => theme,
    deleteImportedTheme: async () => undefined,
    isSystemPreference: false,
    setSystemPreference: () => undefined,
    themeMode: 'light',
    setThemeMode: () => undefined,
    lightThemeId: theme.metadata.id,
    darkThemeId: theme.metadata.id,
    setLightThemePreference: () => undefined,
    setDarkThemePreference: () => undefined,
};

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <RuntimeAPIContext.Provider value={runtimeApis}>
        <SyncProvider client={client} directory="/project">
            <I18nProvider>
                <ThemeSystemContext.Provider value={themeValue}>
                    {children}
                </ThemeSystemContext.Provider>
            </I18nProvider>
        </SyncProvider>
    </RuntimeAPIContext.Provider>
);

function text(partId: string, content: string): Part {
    return { type: 'text', partId, content };
}

const toolPartsFixture: Part[] = [
    {
        type: 'tool_call', partId: 'bash-call-part', toolCallId: 'bash-call', toolName: 'bash',
        input: { command: 'cat src/source.ts' }, status: 'completed',
    },
    {
        type: 'tool_result', partId: 'bash-result', toolCallId: 'bash-call', toolName: 'bash',
        output: 'RICH TOOL OUTPUT BODY', isError: false,
    },
];

function message(
    messageId: string,
    role: ChatMessageEntry['role'],
    parts: Part[],
    createdAt: number,
): ChatMessageEntry {
    return { messageId, sessionId: 'session', turnId: 'turn', role, createdAt, parts };
}

const userMessage = message('user', 'user', [text('request', 'Restore this layout')], 1);
const progressMessage = message('progress', 'assistant', [text('progress-text', 'Checking the source'), ...toolPartsFixture], 2);
const finalMessage = message('final', 'assistant', [text('final-text', 'The final answer')], 3);

setDefaultTimeout(30_000);

describe('restored transcript composition', () => {
    let root: Root;
    let container: HTMLDivElement;
    let restore: () => void;

    beforeEach(() => {
        const win = new Window({ url: 'http://localhost', settings: { device: { prefersReducedMotion: 'reduce' } } });
        const globals = {
            window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage,
            customElements: win.customElements, Window: win.Window, Event: win.Event, CustomEvent: win.CustomEvent,
            Node: win.Node, NodeList: win.NodeList, Element: win.Element, HTMLElement: win.HTMLElement, SVGElement: win.SVGElement,
            HTMLAnchorElement: win.HTMLAnchorElement, DOMParser: win.DOMParser, DOMRect: win.DOMRect,
            MutationObserver: win.MutationObserver, ResizeObserver: win.ResizeObserver,
            IntersectionObserver: win.IntersectionObserver,
            requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
            getComputedStyle: win.getComputedStyle.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
        };
        const previous = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
        for (const [name, value] of Object.entries(globals)) {
            Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
        }
        restore = () => {
            for (const [name, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else Reflect.deleteProperty(globalThis, name);
            }
        };
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        useUIStore.setState({
            chatRenderMode: 'live',
            activityRenderMode: 'collapsed',
            collapsibleThinkingBlocks: false,
            showSplitAssistantMessageActions: false,
            showReasoningTraces: true,
            stickyUserHeader: true,
            isMobile: false,
        });
        useDirectoryStore.setState({ currentDirectory: '/project' });
        useI18nStore.getState().setLocale('en');
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        restore();
    });

    test('renders the real user bubble with its hover action row', async () => {
        // Static imports would evaluate the message body before the Bun plugin
        // above can expand Vite's worker/asset globs.
        const { default: ChatMessage } = await import('../ChatMessage');
        await act(async () => root.render(
            <Providers>
                <ChatMessage message={userMessage} />
            </Providers>,
        ));

        const bubble = container.querySelector('[data-user-message-bubble]');
        expect(bubble?.textContent).toContain('Restore this layout');
        expect(container.querySelector('.group\\/user-shell')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Copy message text"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Fork from this message"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Revert to this message"]')).not.toBeNull();
    });

    test('dispatches tool parts to the rich tool row, not a JSON details block', async () => {
        const { default: ChatMessage } = await import('../ChatMessage');
        const assistant = message('answer', 'assistant', [text('answer-text', 'Answer'), ...toolPartsFixture], 2);
        await act(async () => root.render(
            <Providers>
                <ChatMessage message={assistant} />
            </Providers>,
        ));

        expect(container.querySelector('details')).toBeNull();
        const toolToggles = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
        expect(toolToggles.length).toBeGreaterThan(0);

        for (const toolToggle of toolToggles) {
            await act(async () => toolToggle.click());
        }
        // A later click mounts the heavy body on the next animation frame;
        // flush both frames before inspecting the expanded row.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
        expect(Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
            .every((toggle) => toggle.getAttribute('aria-expanded') === 'true')).toBe(true);
        expect(container.textContent).toContain('RICH TOOL OUTPUT BODY');
    });

    test('groups a turn and collapses its activity until the live header is opened', async () => {
        const { TurnBlock } = await import('../MessageList');
        const turn = projectTurnRecords([userMessage, progressMessage, finalMessage], {
            showTextJustificationActivity: false,
            showTurnChangedFiles: true,
        }).turns[0];

        function Harness() {
            const [turnUiStates, setTurnUiStates] = React.useState<Map<string, { isExpanded: boolean; isLiveExpanded?: boolean }>>(
                () => new Map<string, { isExpanded: boolean; isLiveExpanded?: boolean }>([[turn.turnId, { isExpanded: false }]]),
            );
            const onToggleTurnGroup = React.useCallback((turnId: string, mode?: 'sorted' | 'live') => {
                setTurnUiStates((previous) => {
                    const next = new Map(previous);
                    const current = next.get(turnId) ?? { isExpanded: false };
                    next.set(turnId, mode === 'live'
                        ? { ...current, isLiveExpanded: !current.isLiveExpanded }
                        : { ...current, isExpanded: !current.isExpanded });
                    return next;
                });
            }, []);
            return (
                <TurnBlock
                    turn={turn}
                    isLastTurn
                    sessionIsWorking
                    defaultActivityExpanded={false}
                    turnUiStates={turnUiStates}
                    onToggleTurnGroup={onToggleTurnGroup}
                    chatRenderMode="live"
                    stickyUserHeader
                    shouldAnimateUserMessage={() => false}
                    onUserAnimationConsumed={() => undefined}
                />
            );
        }

        await act(async () => root.render(<Providers><Harness /></Providers>));

        const turnElement = container.querySelector('[data-turn-id="turn"]');
        expect(turnElement).not.toBeNull();
        expect(turnElement?.querySelector('[data-user-message-bubble]')?.textContent).toContain('Restore this layout');
        expect(container.textContent).toContain('The final answer');
        expect(container.textContent).not.toContain('Checking the source');

        const activityHeader = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-controls]'))
            .find((button) => button.textContent?.includes('Activity'));
        expect(activityHeader?.getAttribute('aria-expanded')).toBe('false');

        await act(async () => activityHeader?.click());
        expect(activityHeader?.getAttribute('aria-expanded')).toBe('true');
        expect(container.textContent).toContain('Checking the source');
        expect(container.textContent).toContain('The final answer');
    });

    test('updates when the following row changes and survives its removal', async () => {
        const { default: ChatMessage } = await import('../ChatMessage');
        const row = message('row', 'assistant', [text('row-text', 'Row answer')], 2);
        const nextAssistant = message('next-assistant', 'assistant', [text('next-answer', 'Next answer')], 3);
        const nextUser = message('next-user', 'user', [text('next-prompt', 'Next prompt')], 3);

        const renderRow = (nextMessage?: ChatMessageEntry) => act(async () => root.render(
            <Providers>
                <ChatMessage message={row} nextMessage={nextMessage} />
            </Providers>,
        ));
        const rowElement = () => container.querySelector<HTMLElement>('[data-message-id="row"]');

        await renderRow(undefined);
        expect(rowElement()?.classList.contains('pb-2')).toBe(true);

        // A following row arriving must re-render the existing row.
        await renderRow(nextAssistant);
        expect(rowElement()?.classList.contains('pb-0')).toBe(true);

        // Both rows are present before and after: the memo comparator must
        // notice the new following row, not compare the new row with itself.
        await renderRow(nextUser);
        expect(rowElement()?.classList.contains('pb-2')).toBe(true);

        // The following row can disappear; comparing it must not dereference it.
        await renderRow(undefined);
        expect(rowElement()?.classList.contains('pb-2')).toBe(true);
    });

    test('a long answer splits across rows without drawing itself twice', async () => {
        const { default: ChatMessage } = await import('../ChatMessage');
        const { MessageSliceContext } = await import('../message/messageSliceContext');
        const { answerChunkCuts } = await import('../lib/turns/answerChunks');

        // Ten paragraphs, well past the chunk threshold.
        const paragraphs = Array.from({ length: 10 }, (_, index) => `Paragraph ${index + 1} of the answer ${'detail '.repeat(90)}`);
        const longText = paragraphs.join('\n\n');
        const cuts = answerChunkCuts(longText);
        expect(cuts.length).toBeGreaterThan(0);

        const longMessage = message('long', 'assistant', [text('long-text', longText)], 2);
        const boundaries = [...cuts.map((offset) => ({ partId: 'long-text', offset }))];
        const rows = [
            { to: boundaries[0], index: 0, count: boundaries.length + 1 },
            ...boundaries.slice(1).map((cut, index) => ({
                from: boundaries[index], to: cut, index: index + 1, count: boundaries.length + 1,
            })),
            { from: boundaries[boundaries.length - 1], index: boundaries.length, count: boundaries.length + 1 },
        ];

        await act(async () => root.render(
            <Providers>
                {rows.map((slice) => (
                    <MessageSliceContext.Provider key={slice.index} value={slice}>
                        <ChatMessage message={longMessage} />
                    </MessageSliceContext.Provider>
                ))}
            </Providers>,
        ));

        // Each paragraph appears exactly once across the rows: every row draws
        // only its own stretch of the answer.
        for (let index = 0; index < paragraphs.length; index += 1) {
            const marker = `Paragraph ${index + 1} of the answer`;
            const occurrences = container.textContent?.split(marker).length ?? 0;
            expect(occurrences - 1).toBe(1);
        }
        expect(container.querySelectorAll('[data-message-id="long"]')).toHaveLength(rows.length);
        expect(container.querySelectorAll('[data-message-slice]')).toHaveLength(rows.length - 1);
        // Only the last row ends the message.
        expect(container.querySelectorAll('[data-message-continues]')).toHaveLength(rows.length - 1);

        // Outer margins stay on the outer slices only so rows stack seamlessly.
        const answerWrappers = Array.from(container.querySelectorAll<HTMLElement>('[data-answer-part="long:long-text"]'));
        expect(answerWrappers).toHaveLength(rows.length);
        expect(rows.length).toBeGreaterThanOrEqual(3);
        expect(answerWrappers[0]?.classList.contains('mt-1')).toBe(true);
        expect(answerWrappers[0]?.classList.contains('mb-1')).toBe(false);
        expect(answerWrappers[1]?.classList.contains('mt-1')).toBe(false);
        expect(answerWrappers[1]?.classList.contains('mb-1')).toBe(false);
        expect(answerWrappers[rows.length - 1]?.classList.contains('mt-1')).toBe(false);
        expect(answerWrappers[rows.length - 1]?.classList.contains('mb-1')).toBe(true);
    });

    test('touch footer sheet image export renders all slices and fits the column width', async () => {
        const { default: MessageBody } = await import('../message/MessageBody');
        const { MessageSliceContext } = await import('../message/messageSliceContext');
        const { answerChunkCuts } = await import('../lib/turns/answerChunks');

        const paragraphs = Array.from({ length: 10 }, (_, index) => `Paragraph ${index + 1} of the answer ${'detail '.repeat(90)}`);
        const longText = paragraphs.join('\n\n');
        const cuts = answerChunkCuts(longText);
        expect(cuts.length).toBeGreaterThan(0);
        const lastOffset = cuts[cuts.length - 1];
        if (lastOffset === undefined) {
            throw new Error('Expected at least one chunk cut');
        }
        const lastSlice = { from: { partId: 'long-text', offset: lastOffset }, index: cuts.length, count: cuts.length + 1 };
        const longParts = [text('long-text', longText)];

        await act(async () => root.render(
            <Providers>
                <MessageSliceContext.Provider value={lastSlice}>
                    <MessageBody
                        sessionId="session"
                        messageId="long"
                        parts={longParts}
                        isUser={false}
                        isMessageCompleted
                        isMobile
                        hasTouchInput
                        copiedCode={null}
                        onCopyCode={() => undefined}
                        expandedTools={new Set()}
                        onToggleTool={() => undefined}
                        onShowPopup={() => undefined}
                        streamPhase="completed"
                        allowAnimation={false}
                        hasTextContent
                        onCopyMessage={() => true}
                        turnGroupingContext={{
                            turnId: 'turn',
                            isFirstAssistantInTurn: true,
                            isLastAssistantInTurn: true,
                            isLatestTurn: true,
                            hasTools: false,
                            hasReasoning: false,
                            isWorking: false,
                        }}
                    />
                </MessageSliceContext.Provider>
            </Providers>,
        ));

        const exportRoot = container.querySelector<HTMLElement>('[data-message-text-export-root]');
        expect(exportRoot).not.toBeNull();
        if (exportRoot) {
            exportRoot.getBoundingClientRect = () => new DOMRect(0, 0, 640, 200);
        }

        const dictionary = useI18nStore.getState().dictionary;
        const moreLabel = dictionary['chat.messageBody.actions.moreActions'];
        const saveAsImageLabel = dictionary['chat.messageBody.actions.saveAsImage'];
        const moreButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${moreLabel}"]`);
        expect(moreButton).not.toBeNull();
        await act(async () => moreButton?.click());

        const sheetButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes(saveAsImageLabel));
        expect(sheetButton).not.toBeUndefined();

        let exportedWrapper: HTMLElement | null = null;
        const exportDone = Promise.withResolvers<void>();
        const safetyTimer = setTimeout(exportDone.resolve, 2000);
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof HTMLElement && node.getAttribute('data-message-image-export') === 'true') {
                        exportedWrapper = node;
                    }
                }
                for (const node of record.removedNodes) {
                    if (node === exportedWrapper) {
                        exportDone.resolve();
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true });

        let capturedText = '';
        let capturedWrapperWidth = '';
        let capturedCloneWidth = '';
        try {
            await act(async () => {
                sheetButton?.click();
                await exportDone.promise;
            });
            if (exportedWrapper) {
                const wrapperEl: HTMLElement = exportedWrapper;
                capturedText = wrapperEl.textContent ?? '';
                capturedWrapperWidth = wrapperEl.style.width;
                capturedCloneWidth = wrapperEl.lastElementChild instanceof HTMLElement ? wrapperEl.lastElementChild.style.width : '';
            }
        } finally {
            clearTimeout(safetyTimer);
            observer.disconnect();
        }

        expect(exportedWrapper).not.toBeNull();
        expect(capturedWrapperWidth).toBe('640px');
        expect(capturedCloneWidth).toBe('640px');
        expect(capturedText).toContain('Paragraph 1 of the answer');
        expect(capturedText).toContain('Paragraph 10 of the answer');
    });
});
