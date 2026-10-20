import { describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { ToolPopupContent } from './types';

import { MermaidLoadFailure, getMermaidDataUrlSourcePromise, isCurrentMermaidLoadRequest, nextMermaidLoadRequestId } from './toolOutputDialogMermaid';

describe('getMermaidDataUrlSourcePromise', () => {
    test('turns malformed data URLs into rejected promises', async () => {
        const sourcePromise = getMermaidDataUrlSourcePromise('data:text/plain;base64');

        await sourcePromise.then(
            () => {
                throw new Error('expected malformed data URL to reject');
            },
            (error) => {
                expect(error).toBeInstanceOf(Error);
                expect(error).toBeInstanceOf(MermaidLoadFailure);
                expect(error.key).toBe('chat.toolOutputDialog.mermaid.dataUrlMalformed');
                expect(error.params).toBe(undefined);
            },
        );
    });
});

describe('Mermaid load request ids', () => {
    test('invalidates stale async loads when a newer load starts', () => {
        const firstRequest = nextMermaidLoadRequestId(0);
        const secondRequest = nextMermaidLoadRequestId(firstRequest);

        expect(isCurrentMermaidLoadRequest(secondRequest, firstRequest)).toBe(false);
        expect(isCurrentMermaidLoadRequest(secondRequest, secondRequest)).toBe(true);
    });
});

test('native decoded output and image previews need no tool metadata', async () => {
    const dom = new Window({ url: 'http://localhost/' });
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({
        window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
        Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
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
        // Load DOM-aware renderers only after installing the test browser;
        // React DOM and Base UI capture DOM availability during module loading.
        const { createRoot } = await import('react-dom/client');
        const { I18nProvider } = await import('@/lib/i18n');
        const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
        const { default: ToolOutputDialog } = await import('./ToolOutputDialog');
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        const render = (popup: ToolPopupContent) => act(async () => {
            root.render(React.createElement(ThemeSystemProvider, {
                children: React.createElement(I18nProvider, {
                    children: React.createElement(ToolOutputDialog, { popup, onOpenChange: () => {}, isMobile: false }),
                }),
            }));
        });
        try {
            const output = 'native output <not markup>\nsecond line';
            await render({ open: true, title: 'bash', content: output, language: 'text' });
            expect(document.body.textContent).toContain(output);
            expect(document.querySelector('not')).toBeNull();
            expect(document.body.textContent).not.toContain('Command:');
            expect(document.body.textContent).not.toContain('Subagent Details:');

            await render({
                open: true, title: 'shot.png', content: '',
                image: { url: 'data:image/png;base64,aGVsbG8=', filename: 'shot.png' },
            });
            expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,aGVsbG8=');
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
