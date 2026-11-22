import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import { ComposerModeSelector } from './ComposerModeSelector';

type RenderProps = React.ComponentProps<typeof ComposerModeSelector>;

let win: Window;
let container: HTMLDivElement;
let root: Root;

const render = async (props: Partial<RenderProps>) => {
    await act(async () => root.render(
        <I18nProvider>
            <ComposerModeSelector
                sessionId={null}
                draftOpen
                runActive={false}
                planRoleAvailable
                goalModeEnabled
                onDraftModeChange={() => undefined}
                {...props}
            />
        </I18nProvider>,
    ));
};

const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-label="Session mode"]');

afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', 'ResizeObserver', 'DOMRect', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Reflect.deleteProperty(globalThis, key);
});

const setup = () => {
    win = new Window({ url: 'http://localhost' });
    class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    Object.defineProperties(globalThis, {
        window: { configurable: true, value: win },
        document: { configurable: true, value: win.document },
        navigator: { configurable: true, value: win.navigator },
        ResizeObserver: { configurable: true, value: ResizeObserverStub },
        HTMLElement: { configurable: true, value: win.HTMLElement },
        Element: { configurable: true, value: win.Element },
        Node: { configurable: true, value: win.Node },
        Event: { configurable: true, value: win.Event },
        MouseEvent: { configurable: true, value: win.MouseEvent },
        KeyboardEvent: { configurable: true, value: win.KeyboardEvent },
        PointerEvent: { configurable: true, value: win.PointerEvent },
        getComputedStyle: { configurable: true, value: win.getComputedStyle.bind(win) },
        requestAnimationFrame: { configurable: true, value: win.requestAnimationFrame.bind(win) },
        cancelAnimationFrame: { configurable: true, value: win.cancelAnimationFrame.bind(win) },
        IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
};

describe('ComposerModeSelector', () => {
    test('is disabled without a session or an open draft', async () => {
        setup();
        await render({ sessionId: null, draftOpen: false });
        expect(trigger()?.disabled).toBe(true);
    });

    test('shows the draft-held mode until the session exists', async () => {
        setup();
        await render({ draftMode: 'plan' });
        expect(trigger()?.textContent).toContain('Plan');
        expect(trigger()?.disabled).toBe(false);
    });

    test('shows the authoritative session mode and disables changes during a run', async () => {
        setup();
        await render({ sessionId: 'session-1', draftOpen: false, mode: { kind: 'vibe' }, runActive: true });
        expect(trigger()?.textContent).toContain('Vibe');
        expect(trigger()?.disabled).toBe(true);
    });

    test('labels Goal in a draft while the goal feature is enabled', async () => {
        setup();
        await render({ draftMode: 'goal' });
        expect(trigger()?.textContent).toContain('Goal');
    });

    test('moves between mobile mode options with the arrow keys', async () => {
        setup();
        await render({ isMobile: true, defaultOpen: true });
        const options = [...document.querySelectorAll<HTMLButtonElement>('#composer-mode-options-mobile button[role="option"]')];
        expect(options.length).toBeGreaterThan(1);
        options[0].focus();
        await act(async () => {
            options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        });
        expect(document.activeElement).toBe(options[1]);
    });

    test('shows the acknowledged mode until the session snapshot changes', async () => {
        setup();
        const setMode = spyOn(canonicalClient, 'setMode').mockResolvedValue({ type: 'mode.set', mode: { kind: 'vibe' } });
        try {
            const main = { kind: 'main' } as const;
            await render({ sessionId: 'session-1', draftOpen: false, mode: main, isMobile: true, defaultOpen: true });
            const vibe = [...document.querySelectorAll<HTMLButtonElement>('#composer-mode-options-mobile button[role="option"]')]
                .find((option) => option.textContent?.includes('Vibe'));
            await act(async () => { vibe?.click(); });
            expect(setMode).toHaveBeenCalledWith('session-1', 'vibe');
            const label = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.textContent;
            expect(label()).toContain('Vibe');
            await render({ sessionId: 'session-1', draftOpen: false, mode: { kind: 'plan', status: 'armed', planReference: 'local://plan.md' }, isMobile: true });
            expect(label()).toContain('Plan');
        } finally {
            setMode.mockRestore();
        }
    });
});
