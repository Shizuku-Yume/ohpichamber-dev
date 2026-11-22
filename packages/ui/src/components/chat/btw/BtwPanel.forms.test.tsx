import React, { act } from 'react';
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { QuestionRequest } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, sessionStorage: browser.sessionStorage, Node: browser.Node, Element: browser.Element, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), HTMLElement: browser.HTMLElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, CustomEvent: browser.CustomEvent, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true });
mock.module('../composer/ui/ComposerFloatingPanel', () => ({ ComposerFloatingPanel: ({ children, header }: { children: React.ReactNode; header: React.ReactNode }) => <div>{header}{children}</div> }));
const question: QuestionRequest = { sessionId: 'parent', questionId: 'question', turnId: 'turn', version: '1', epoch: 'epoch', workerGeneration: '1', requestedAt: 1, status: 'pending', prompt: 'Choose', schema: { type: 'omp.ask', questions: [{ id: 'choice', question: 'Choose', options: [{ label: 'One' }] }] } };
const { hostFilesystem } = await import('@/lib/host-filesystem');
spyOn(hostFilesystem, 'getFilesystemHome').mockResolvedValue('/home/test');
const actualPersistence = await import('@/lib/persistence');
mock.module('@/lib/persistence', () => ({ ...actualPersistence, updateDesktopSettings: async () => ({ ok: true }) }));
const actualSync = await import('@/sync/sync-context');
mock.module('@/sync/sync-context', () => ({ ...actualSync, useScopedBlockingForms: (sessionId: string) => question.sessionId === sessionId ? [question] : [], useSessions: () => [] }));
const actualActions = await import('@/sync/session-actions');
mock.module('@/sync/session-actions', () => ({ ...actualActions, updateForm: async () => {} }));
const actualColumn = await import('../chatColumnSession');
mock.module('../chatColumnSession', () => ({ ...actualColumn, useChatSessionSelection: () => ({ sessionId: 'parent', directory: '/project' }) }));
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { BtwPanel } = await import('./BtwPanel');
const { FormDock } = await import('../FormDock');
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });
async function render(sessionId: string) { await act(async () => root.render(<I18nProvider><BtwPanel parentSessionId="parent" panel={{ collapsed: false, pending: false, ephemeralRecordId: 'record', ephemeralText: 'Aside text', ephemeralStatus: 'completed' }} onExit={() => {}} /><FormDock sessionId={sessionId} directory="/project" hidden={false} /></I18nProvider>)); }

test('a parent-owned Canonical question stays in its single dock while an aside is open', async () => {
    await render('parent');
    expect(container.textContent).toContain('Aside text');
    expect(container.textContent).toContain('Choose');
    expect(container.querySelectorAll('[aria-label="One"]')).toHaveLength(1);
});
test('an aside does not lend the parent question to a sibling session', async () => {
    await render('sibling');
    expect(container.textContent).toContain('Aside text');
    expect(container.textContent).not.toContain('Choose');
});
