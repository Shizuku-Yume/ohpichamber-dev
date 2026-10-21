import { expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import type { ReactNode } from 'react';
import { Window } from 'happy-dom';
import type { ToolResultPart } from '@openchamber/agent-contract';

// Load the production Markdown worker asset under Bun, without replacing modules.
plugin({ name: 'dialog-arguments-worker-url', setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
        contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`, loader: 'js',
    }));
} });

const bashResult: ToolResultPart = {
    type: 'tool_result', partId: 'bash-result', toolCallId: 'bash-call', toolName: 'bash', isError: false,
    output: { content: [{ type: 'text', text: 'task57 bash output' }] },
};

const editResult: ToolResultPart = {
    type: 'tool_result', partId: 'edit-result', toolCallId: 'edit-call', toolName: 'edit', isError: true,
    output: { content: [{ type: 'text', text: 'Edit refused' }], details: { path: 'NOTES.md', diff: '-1|old\n+1|new' } },
    error: 'Permission denied',
};

test('the output dialog inspects canonical arguments, output and failure metadata', async () => {
    const dom = new Window({ url: 'http://localhost/' });
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({
        window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
        Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
        HTMLAnchorElement: dom.HTMLAnchorElement, customElements: dom.customElements,
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
        // DOM-aware loading: static imports would capture a missing browser
        // before installation and precede the production asset loader.
        const { createRoot } = await import('react-dom/client');
        const { I18nProvider } = await import('@/lib/i18n');
        const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
        const { default: ToolOutputDialog } = await import('./ToolOutputDialog');
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        const render = (children: ReactNode) => act(async () => {
            root.render(React.createElement(ThemeSystemProvider, {
                children: React.createElement(I18nProvider, { children }),
            }));
        });
        const dialogText = (): string => document.querySelector('[role="dialog"]')?.textContent ?? '';
        try {
            await render(React.createElement(ToolOutputDialog, {
                popup: {
                    open: true, title: 'bash', toolName: 'bash', input: { command: 'printf task57\\n', timeout: 5000 },
                    content: 'task57 bash output', toolResult: bashResult, language: 'bash',
                },
                onOpenChange: () => {}, isMobile: false,
            }));
            expect(document.querySelector('[role="dialog"]')).not.toBeNull();
            expect(dialogText()).toContain('Arguments');
            expect(dialogText()).toContain('printf task57');
            expect(dialogText()).toContain('5000');
            expect(dialogText()).toContain('Output');
            expect(dialogText()).toContain('task57 bash output');

            await render(React.createElement(ToolOutputDialog, {
                popup: {
                    open: true, title: 'edit', toolName: 'edit',
                    input: { path: 'NOTES.md', old_string: 'old', new_string: 'new' },
                    content: '{"diff":"-1|old\\n+1|new"}', toolResult: editResult,
                },
                onOpenChange: () => {}, isMobile: false,
            }));
            expect(dialogText()).toContain('Arguments');
            expect(dialogText()).toContain('"path": "NOTES.md"');
            expect(dialogText()).toContain('Permission denied');
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
