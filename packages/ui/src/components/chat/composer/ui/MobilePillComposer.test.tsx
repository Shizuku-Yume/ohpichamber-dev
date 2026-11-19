import React, { act } from 'react';
import { Window } from 'happy-dom';
import { describe, expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';

import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { I18nProvider } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';

import { MobilePillComposer } from './MobilePillComposer';

const renderPill = async (options: { hasContent: boolean; newSessionDraftOpen: boolean; canAbort?: boolean; dictationEnabled?: boolean }) => {
    const win = new Window({ url: 'http://localhost' });
    Object.defineProperty(win.navigator, 'mediaDevices', {
        value: { getUserMedia: () => Promise.resolve() },
        configurable: true,
    });
    // @ts-expect-error test mock
    win.AudioContext = class {} as unknown as typeof AudioContext;
    useConfigStore.setState({ dictationEnabled: options.dictationEnabled ?? true });
    // The pill's tooltip trigger and icon read the browser's element classes,
    // so the DOM globals have to come from this window, not bun's.
    const values = {
        window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage,
        Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, SVGElement: win.SVGElement,
        Event: win.Event, MouseEvent: win.MouseEvent, KeyboardEvent: win.KeyboardEvent,
        requestAnimationFrame: win.requestAnimationFrame.bind(win),
        cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
        getComputedStyle: win.getComputedStyle.bind(win),
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
    const container = document.createElement('div');
    const root = createRoot(container);
    let primaryActions = 0;
    let queued = 0;
    try {
        await act(async () => root.render(
        <ThemeSystemProvider>
        <I18nProvider>
            <MobilePillComposer
                message={options.hasContent ? 'Draft message' : ''}
                sessionId={options.newSessionDraftOpen ? null : 'session-1'}
                newSessionDraftOpen={options.newSessionDraftOpen}
                hasContent={options.hasContent}
                canAbort={options.canAbort ?? false}
                footerIconButtonClass="icon-button"
                iconSizeClass="icon-size"
                sendIconSizeClass="send-icon-size"
                stopIconSizeClass="stop-icon-size"
                onExpand={() => {}}
                onPrimaryAction={() => { primaryActions += 1; }}
                onQueueMessage={() => { queued += 1; }}
                onPickLocalFiles={() => {}}
                onOpenGitHubPicker={() => {}}
                onOpenAttachSheet={() => {}}
                onStartDictation={() => {}}
                onAbort={() => {}}
            />
        </I18nProvider>
        </ThemeSystemProvider>
        ));
        if (options.hasContent && options.canAbort) {
            // While a turn runs the pill's follow-up action goes through the
            // composer's primary action, which routes the draft to the queue
            // under the follow-up setting instead of sending it past the turn.
            const queue = container.querySelector<HTMLButtonElement>('[aria-label="Queue message"]');
            expect(queue).not.toBeNull();
            await act(async () => { queue?.click(); });
            expect(primaryActions).toBe(1);
            expect(queued).toBe(0);
        } else if (options.hasContent) {
            const send = container.querySelector<HTMLButtonElement>('[aria-label="Send message"]');
            expect(send).not.toBeNull();
            await act(async () => { send?.click(); });
            expect(primaryActions).toBe(1);
            expect(queued).toBe(0);
        }
        return container.innerHTML;
    } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
        await win.happyDOM.close();
    }
};

describe('MobilePillComposer', () => {
    test('uses the inline action to send content while the session is idle', async () => {
        const markup = await renderPill({ hasContent: true, newSessionDraftOpen: false });

        expect(markup).toContain('aria-label="Send message"');
        expect(markup).not.toContain('aria-label="Queue message"');
    });

    test('a draft typed during a run makes the disc Send, which queues, with a bare Stop before it: a phone has no Escape', async () => {
        const markup = await renderPill({ hasContent: true, newSessionDraftOpen: false, canAbort: true });

        expect(markup).toContain('aria-label="Queue message"');
        expect(markup).not.toContain('aria-label="Send message"');
        const mic = markup.indexOf('aria-label="Start dictation"');
        const stop = markup.indexOf('aria-label="Stop generating"');
        const queue = markup.indexOf('aria-label="Queue message"');
        expect(mic).toBeLessThan(stop);
        expect(stop).toBeLessThan(queue);
        // One disc: Send's. Stop beside it is a bare icon.
        expect(markup.match(/oc-action-disc/g)).toHaveLength(1);
    });

<<<<<<< HEAD
||||||| bc50ba56aa
    test('offers a plain send between mic and stop when follow-ups steer', async () => {
        const markup = await renderPill({ hasContent: true, newSessionDraftOpen: false, canAbort: true, followUpBehavior: 'steer' });

        expect(markup).not.toContain('aria-label="Queue message"');
        expect(markup).not.toContain('-rotate-90');
        const mic = markup.indexOf('aria-label="Start dictation"');
        const send = markup.indexOf('aria-label="Send message"');
        const stop = markup.indexOf('aria-label="Stop generating"');
        expect(mic).toBeLessThan(send);
        expect(send).toBeLessThan(stop);
    });

=======
    test('the same disc sends when follow-ups steer', async () => {
        const markup = await renderPill({ hasContent: true, newSessionDraftOpen: false, canAbort: true, followUpBehavior: 'steer' });

        expect(markup).toContain('aria-label="Send message"');
        expect(markup).not.toContain('aria-label="Queue message"');
        expect(markup).toContain('aria-label="Stop generating"');
    });

    test('a run with an empty input shows Stop in the disc', async () => {
        const markup = await renderPill({ hasContent: false, newSessionDraftOpen: false, canAbort: true });

        expect(markup).toContain('aria-label="Stop generating"');
        expect(markup.match(/oc-action-disc/g)).toHaveLength(1);
    });

>>>>>>> upstream/main
    test('uses the inline send action for content in a new-session draft', async () => {
        const markup = await renderPill({ hasContent: true, newSessionDraftOpen: true });

        expect(markup).toContain('aria-label="Send message"');
        expect(markup).not.toContain('aria-label="Queue message"');
    });

    test('shows neither send nor queue for an empty existing session', async () => {
        const markup = await renderPill({ hasContent: false, newSessionDraftOpen: false });

        expect(markup).not.toContain('aria-label="Queue message"');
        expect(markup).not.toContain('aria-label="Send message"');
    });

    test('shows neither send nor queue for an empty new-session draft', async () => {
        const markup = await renderPill({ hasContent: false, newSessionDraftOpen: true });

        expect(markup).not.toContain('aria-label="Queue message"');
        expect(markup).not.toContain('aria-label="Send message"');
    });

    test('keeps only abort while a session runs without content', async () => {
        const markup = await renderPill({ hasContent: false, newSessionDraftOpen: false, canAbort: true });

        expect(markup).toContain('aria-label="Stop generating"');
        expect(markup).not.toContain('aria-label="Queue message"');
        expect(markup).not.toContain('aria-label="Send message"');
    });

    test('renders the mic button when dictation is enabled and supported', async () => {
        const markup = await renderPill({ hasContent: false, newSessionDraftOpen: false, dictationEnabled: true });

        expect(markup).toContain('aria-label="Start dictation"');
    });

    test('hides the mic button when dictation is disabled', async () => {
        const markup = await renderPill({ hasContent: false, newSessionDraftOpen: false, dictationEnabled: false });

        expect(markup).not.toContain('aria-label="Start dictation"');
    });
});
