import React, { act } from 'react';
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { QuestionRequest } from '@openchamber/agent-contract';

const browser = new Window();
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, sessionStorage: browser.sessionStorage, Node: browser.Node, Element: browser.Element, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), HTMLElement: browser.HTMLElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, CustomEvent: browser.CustomEvent, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
let pending: QuestionRequest[] = [];
let calls: unknown[][] = [];
let failReply = false;
const { hostFilesystem } = await import('@/lib/host-filesystem');
spyOn(hostFilesystem, 'getFilesystemHome').mockResolvedValue('/home/test');
const actualPersistence = await import('@/lib/persistence');
mock.module('@/lib/persistence', () => ({ ...actualPersistence, updateDesktopSettings: async () => ({ ok: true }) }));
const actualSync = await import('@/sync/sync-context');
mock.module('@/sync/sync-context', () => ({
    ...actualSync,
    useScopedBlockingForms: (sessionId: string) => pending.filter(form => form.sessionId === sessionId && form.status === 'pending'),
    useSessions: () => [],
}));
const actualColumn = await import('./chatColumnSession');
mock.module('./chatColumnSession', () => ({ ...actualColumn, useChatSessionSelection: () => ({ sessionId: 'one', directory: '/project' }) }));
const actualActions = await import('@/sync/session-actions');
mock.module('@/sync/session-actions', () => ({
    ...actualActions,
    replyToForm: async (...args: unknown[]) => { calls.push(['reply', ...args]); if (failReply) throw new Error('CAS conflict'); },
    cancelForm: async (...args: unknown[]) => { calls.push(['cancel', ...args]); },
    updateForm: async (...args: unknown[]) => { calls.push(['update', ...args]); },
    refetchSessionMessages: async () => {},
}));
const { I18nProvider } = await import('@/lib/i18n');
const { FormCard } = await import('./FormCard');
const { FormDock } = await import('./FormDock');
const { TranscriptForms } = await import('./TranscriptForms');
const { FormDockModeContext, formWaitingBlockId, resolveFormDockMode, resolveFormsInChat } = await import('./formsInChat');
const { resetFormDrafts, loadFormDraft, formDraftScope } = await import('./formDrafts');
const request = (sessionId = 'one'): QuestionRequest => ({
    questionId: 'same', sessionId, turnId: 'turn', version: '1', epoch: 'epoch', workerGeneration: '1', requestedAt: 1, status: 'pending', prompt: 'Choose',
    schema: { type: 'omp.ask', questions: [{ id: 'choice', question: 'Choose', options: [{ label: 'One' }, { label: 'Two' }], multi: false }] },
});
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
beforeEach(() => { pending = [request()]; calls = []; failReply = false; resetFormDrafts(); });
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });
async function render(node: React.ReactNode) { await act(async () => root.render(<I18nProvider>{node}</I18nProvider>)); }
async function click(text: string) {
    const button = Array.from(container.querySelectorAll<HTMLElement>('button, [aria-label]')).find(button => button.getAttribute('aria-label') === text || button.textContent?.trim() === text);
    expect(button).toBeDefined();
    await act(async () => button!.click());
}

test('waiting blocks distinguish identical question IDs in sibling sessions', () => {
    expect(formWaitingBlockId(request())).not.toBe(formWaitingBlockId(request('two')));
    expect(resolveFormDockMode(true, true)).toBe('in-chat');
    expect(resolveFormDockMode(false, true)).toBe('reading');
    expect(resolveFormsInChat({ questionsInChat: true, pinned: true, transcriptShown: true })).toBe(false);
    expect(resolveFormsInChat({ questionsInChat: true, pinned: false, transcriptShown: false })).toBe(false);
});
test('renders Canonical transcript forms and uses the same block identity as the pointer', async () => {
    await render(<TranscriptForms sessionId="one" directory="/project" />);
    expect(container.querySelector('[data-waiting-page]')?.getAttribute('data-waiting-page')).toBe(formWaitingBlockId(request()));
    expect(container.textContent).toContain('Choose');
});
test('answers with native results and the owning session/question IDs', async () => {
    await render(<FormCard form={request()} directory="/project" />);
    await click('One');
    await click('Submit');
    expect(calls.find(call => call[0] === 'reply')).toEqual(['reply', 'one', 'same', { results: [{ id: 'choice', selectedOptions: ['One'] }] }]);
    expect(container.textContent).not.toContain('Choose');
    expect(loadFormDraft(formDraftScope(request(), '/project'))).toBeNull();
});
test('a rejected reply leaves the form and selected draft available for retry', async () => {
    failReply = true;
    await render(<FormCard form={request()} directory="/project" />);
    await click('Two');
    await click('Submit');
    expect(container.textContent).toContain('Choose');
    expect(loadFormDraft(formDraftScope(request(), '/project'))).toMatchObject({ kind: 'question', answers: [{ selected: ['Two'] }] });
    failReply = false;
    await click('Submit');
    expect(calls.filter(call => call[0] === 'reply')).toHaveLength(2);
});
test('cancellation uses the Canonical response owner', async () => {
    await render(<FormCard form={request()} directory="/project" />);
    await click('Dismiss');
    expect(calls.find(call => call[0] === 'cancel')).toEqual(['cancel', 'one', 'same']);
    expect(container.textContent).not.toContain('Choose');
});
test('restores drafts only for their own session and directory', async () => {
    await render(<FormCard form={request()} directory="/project" />);
    await click('Two');
    await render(<FormCard form={request('two')} directory="/project" />);
    expect(loadFormDraft(formDraftScope(request('two'), '/project'))).toMatchObject({ answers: [{ selected: [] }] });
    await render(<FormCard form={request()} directory="/other" />);
    expect(loadFormDraft(formDraftScope(request(), '/other'))).toMatchObject({ answers: [{ selected: [] }] });
    await render(<FormCard form={request()} directory="/project" />);
    await click('Submit');
    expect(calls.find(call => call[0] === 'reply')).toEqual(['reply', 'one', 'same', { results: [{ id: 'choice', selectedOptions: ['Two'] }] }]);
});
test('empty and cancelled forms disappear while unknown schemas remain available for dismissal', async () => {
    pending = [];
    await render(<TranscriptForms sessionId="one" directory="/project" />);
    expect(container.innerHTML).toBe('');
    await render(<FormCard form={{ ...request(), status: 'cancelled' }} />);
    expect(container.innerHTML).toBe('');
    await render(<FormCard form={{ ...request(), schema: {} }} />);
    expect(container.textContent).toContain('Choose');
    expect(container.textContent).toContain('Dismiss');
    expect(container.querySelector('input, textarea')).toBeNull();
});
test('the dock points into the transcript without drawing duplicate fields', async () => {
    await render(<FormDockModeContext.Provider value="in-chat"><FormDock sessionId="one" directory="/project" hidden={false} /></FormDockModeContext.Provider>);
    expect(container.textContent).not.toContain('Choose');
    expect(container.querySelector('button[aria-label]')).not.toBeNull();
});

test('reading folds the dock without discarding the reader\'s explicit dock collapse', async () => {
    const dock = (mode: 'dock' | 'reading') => <FormDockModeContext.Provider value={mode}><FormDock sessionId="one" directory="/project" hidden={false} /></FormDockModeContext.Provider>;
    await render(dock('dock'));
    const header = () => container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(header().getAttribute('aria-expanded')).toBe('true');
    await act(async () => header().click());
    await render(dock('reading'));
    await render(dock('dock'));
    expect(header().getAttribute('aria-expanded')).toBe('false');
});
