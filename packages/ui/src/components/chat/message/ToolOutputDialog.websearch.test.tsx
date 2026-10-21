import { expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import type { ReactNode } from 'react';
import { Window } from 'happy-dom';
import type { ToolResultPart } from '@openchamber/agent-contract';

// Load the production Markdown worker asset under Bun, without replacing modules.
plugin({ name: 'web-search-dialog-worker-url', setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
        contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`, loader: 'js',
    }));
} });

test('native search source links survive inline rendering and fullscreen inspection', async () => {
    const dom = new Window({ url: 'http://localhost/' });
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({
        window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
        Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
        HTMLAnchorElement: dom.HTMLAnchorElement,
        customElements: dom.customElements,
        Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent,
        MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
        getComputedStyle: dom.getComputedStyle.bind(dom),
        requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
        cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    try {
        // This test exercises DOM-aware loading: static imports would capture a
        // missing browser before installation and precede the production asset loader.
        const { createRoot } = await import('react-dom/client');
        const { SyncProvider } = await import('@/sync/sync-context');
        const { I18nProvider } = await import('@/lib/i18n');
        const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
        const { renderWebSearchOutput } = await import('./toolRenderers');
        const { default: ToolOutputDialog } = await import('./ToolOutputDialog');
        const result: ToolResultPart = {
            type: 'tool_result', partId: 'search_result', toolCallId: 'search_call',
            toolName: 'web_search', isError: false,
            output: {
                content: [{ type: 'text', text: 'Flattened-only output has no source metadata.' }],
                details: {
                    response: {
                        provider: 'tavily',
                        sources: [{
                            title: 'Original native evidence <not markup>',
                            url: 'https://example.com/native-evidence',
                            snippet: 'This excerpt exists only in details.response.',
                        }],
                    },
                },
            },
        };
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        const render = (children: ReactNode) => act(async () => {
            root.render(React.createElement(SyncProvider, { directory: '', children: React.createElement(ThemeSystemProvider, {
                children: React.createElement(I18nProvider, { children }),
            }) }));
        });
        const assertSourceCard = (scope: ParentNode) => {
            const link = scope.querySelector('a[href="https://example.com/native-evidence"]');
            expect(link).not.toBeNull();
            expect(link?.textContent).toContain('Original native evidence <not markup>');
            expect(link?.textContent).toContain('This excerpt exists only in details.response.');
            expect(link?.getAttribute('target')).toBe('_blank');
            expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
            expect(scope.querySelector('not')).toBeNull();
        };
        try {
            await render(renderWebSearchOutput(result.output));
            assertSourceCard(container);
            // Native search results keep the flattened text available under the
            // Output disclosure; source cards remain the primary rendering.
            expect(container.textContent).toContain('Output');
            expect(container.textContent).toContain('Flattened-only output has no source metadata.');
            expect(container.textContent).not.toContain('"response"');

            await render(React.createElement(ToolOutputDialog, {
                popup: {
                    open: true, title: 'Inspect original tool result',
                    content: 'Flattened popup text deliberately contains no source metadata.',
                    toolResult: result,
                },
                onOpenChange: () => {}, isMobile: false,
            }));
            const dialog = document.querySelector('[role="dialog"]');
            expect(dialog).not.toBeNull();
            if (!dialog) throw new Error('Fullscreen tool inspection must open a dialog');
            assertSourceCard(dialog);
            expect(dialog.textContent).not.toContain('Flattened popup text deliberately');
            expect(dialog.textContent).not.toContain('"response"');

            // Tool identity, not a matching popup title, selects native search rendering.
            await render(React.createElement(ToolOutputDialog, {
                popup: {
                    open: true, title: 'web_search', content: 'Ordinary non-search output',
                    toolResult: { ...result, toolName: 'bash' },
                },
                onOpenChange: () => {}, isMobile: false,
            }));
            expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Ordinary non-search output');
            expect(document.querySelector('[role="dialog"] a[href="https://example.com/native-evidence"]')).toBeNull();
        } finally {
            await act(async () => root.unmount());
        }
    } finally {
        await dom.happyDOM.close();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    }
});
