import React, { act } from 'react';
import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { BtwPanelState } from './useBtwPanelState';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, sessionStorage: browser.sessionStorage, Node: browser.Node, Element: browser.Element, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), HTMLElement: browser.HTMLElement, Event: browser.Event, KeyboardEvent: browser.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true });
mock.module('../composer/ui/ComposerFloatingPanel', () => ({ ComposerFloatingPanel: ({ children, header }: { children: React.ReactNode; header: React.ReactNode }) => <div>{header}{children}</div> }));
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { BtwPanel } = await import('./BtwPanel');
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
const onExit = mock(() => {});
const panel: BtwPanelState = { collapsed: false, pending: false, ephemeralRecordId: 'record', ephemeralText: 'Native aside answer', ephemeralStatus: 'completed' };
async function render(value: BtwPanelState) { await act(async () => root.render(<I18nProvider><BtwPanel parentSessionId="parent" panel={value} onExit={onExit} /></I18nProvider>)); }
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); onExit.mockClear(); });

test('renders the Canonical ephemeral record without a child transcript', async () => {
    await render(panel);
    expect(container.textContent).toContain('Native aside answer');
    expect(container.querySelector('textarea')).toBeNull();
});
test('an empty inactive panel is absent', async () => {
    await render({ ...panel, ephemeralRecordId: null, ephemeralText: '', ephemeralStatus: 'idle' });
    expect(container.textContent).toBe('');
});
test('a failed ephemeral record does not offer branch promotion', async () => {
    await render({ ...panel, ephemeralStatus: 'failed', ephemeralText: 'Native failure' });
    expect(container.textContent).toContain('Native failure');
    expect(container.textContent).not.toContain('Promote to branch');
});
test('Escape exits the current parent panel', async () => {
    await render(panel);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onExit).toHaveBeenCalledTimes(1);
});
