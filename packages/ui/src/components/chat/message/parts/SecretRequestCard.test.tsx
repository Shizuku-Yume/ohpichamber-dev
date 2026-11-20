import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { CanonicalToolView, RequestedSecretRun } from './toolView';
import type { SecretRunFields } from '@/lib/secretRequestAnswer';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement,
  Event: browser.Event, MouseEvent: browser.MouseEvent, MutationObserver: browser.MutationObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
});

const read = mock(async (_input: { sessionId: string; callId: string }, _directory: string | undefined, _signal?: AbortSignal): Promise<SecretRunFields | null> => ({ fields: ['TOKEN', 'PASSWORD'], reused: ['CACHED'] }));
const answer = mock(async (_input: unknown, _directory: unknown) => {});
const notifyError = mock((_message: string) => {});
let runtimeChanged: (() => void) | undefined;
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
mock.module('@/sync/sync-context', () => ({ useSessionDirectory: () => '/project' }));
mock.module('@/lib/secretRequestAnswer', () => ({ answerSecretRequest: answer, readSecretRunFields: read }));
const actualRuntimeSwitch = await import('@/lib/runtime-switch');
mock.module('@/lib/runtime-switch', () => ({ ...actualRuntimeSwitch, subscribeRuntimeEndpointWillChange: (callback: () => void) => { runtimeChanged = callback; return () => { runtimeChanged = undefined; }; } }));
mock.module('@/components/ui', () => ({ toast: { error: notifyError } }));
mock.module('@/components/chat/lib/scroll/timelineScrollIntent', () => ({ dispatchPageWaiting: () => {} }));
mock.module('@/stores/useUIStore', () => ({ useUIStore: () => false }));
mock.module('./ToolPart', () => ({ default: () => <div data-tool-row /> }));

const { createRoot } = await import('react-dom/client');
const { SecretRequestCard, SecretRunCard } = await import('./SecretRequestCard');
const part: CanonicalToolView = {
  id: 'part-1', sessionID: 'ses-1', messageID: 'msg-1', callID: 'call-1', tool: 'openchamber_secret',
  call: { type: 'tool_call', partId: 'part-1', toolCallId: 'call-1', toolName: 'openchamber_secret', input: {}, status: 'running' },
  result: undefined,
  state: { status: 'running', input: {}, metadata: {}, time: { start: 0 } },
};
const run: RequestedSecretRun = {
  reason: 'Authenticate one command', program: 'node', command: 'node deploy.js',
  fields: [
    { env: 'TOKEN', label: 'API key', placeholder: 'Paste key' },
    { env: 'PASSWORD', label: 'Password', placeholder: undefined },
    { env: 'CACHED', label: 'Remembered key', placeholder: undefined },
  ],
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  read.mockReset();
  read.mockImplementation(async () => ({ fields: ['TOKEN', 'PASSWORD'], reused: ['CACHED'] }));
  answer.mockReset();
  answer.mockImplementation(async () => {});
  notifyError.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
afterAll(() => browser.close());
const mount = async () => { await act(async () => root.render(<SecretRunCard part={part} run={run} />)); };
const input = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const enter = async (label: string, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value')!.set!.call(input(label), value);
    input(label).dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('reveals each field independently and submits only requested values and remembered field names', async () => {
  await mount();
  expect(read.mock.calls[0]).toEqual([{ sessionId: 'ses-1', callId: 'call-1' }, '/project', expect.any(AbortSignal)]);
  expect(input('Remembered key')).toBeNull();
  expect(container.textContent).toContain('chat.secretRun.reused');
  expect(submit().disabled).toBe(true);
  expect(input('API key').type).toBe('password');
  await enter('API key', 'token-test-value');
  expect(submit().disabled).toBe(true);
  await enter('Password', '  ');
  expect(submit().disabled).toBe(true);
  await enter('Password', ' password-test-value ');
  expect(submit().disabled).toBe(false);
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
  await act(async () => toggle.click());
  expect(input('API key').type).toBe('text');
  expect(input('Password').type).toBe('password');
  await act(async () => toggle.click());
  expect(input('API key').type).toBe('password');
  await act(async () => container.querySelector('[role="checkbox"]')!.closest('label')!.click());
  expect(container.querySelector('[role="checkbox"]')!.getAttribute('aria-checked')).toBe('true');
  await act(async () => submit().click());
  expect(answer.mock.calls).toEqual([[{
    sessionId: 'ses-1', callId: 'call-1', values: { TOKEN: 'token-test-value', PASSWORD: ' password-test-value ' }, remember: ['TOKEN'],
  }, '/project']]);
  expect(container.querySelector('input')).toBeNull();
  expect(container.textContent).not.toContain('token-test-value');
  expect(container.querySelector('[data-tool-row]')).not.toBeNull();
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
});

test('declines without sending any typed values', async () => {
  await mount();
  await enter('API key', 'never-submit-this');
  const decline = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'chat.secretRequest.decline')!;
  await act(async () => decline.click());
  expect(answer.mock.calls).toEqual([[{ sessionId: 'ses-1', callId: 'call-1', declined: true }, '/project']]);
  expect(container.querySelector('input')).toBeNull();
});

test('a failed answer stays retryable without exposing an echoed value in the error', async () => {
  answer.mockRejectedValueOnce(new Error('token-test-value'));
  await mount();
  await enter('API key', 'token-test-value');
  await enter('Password', 'test-password');
  await act(async () => submit().click());
  expect(notifyError.mock.calls).toEqual([['chat.secretRun.sendFailed']]);
  expect(submit().disabled).toBe(false);
  expect(input('API key').type).toBe('password');
  await act(async () => submit().click());
  expect(answer).toHaveBeenCalledTimes(2);
  expect(container.querySelector('input')).toBeNull();
});

test('empty or expired field lookup never presents inputs', async () => {
  read.mockResolvedValueOnce(null);
  await mount();
  expect(container.querySelector('input')).toBeNull();
  expect(answer).not.toHaveBeenCalled();
});

test('lookup failures are visible and retry until authoritative fields arrive', async () => {
  read.mockRejectedValueOnce(new Error('private-server-detail'));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('chat.secretRun.loadFailed');
  expect(container.textContent).not.toContain('private-server-detail');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2_050)); });
  expect(input('API key')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('runtime switching clears typed values and disables the old call', async () => {
  await mount();
  await enter('API key', 'old-runtime-secret');
  await act(async () => runtimeChanged!());
  expect(container.querySelector('input')).toBeNull();
  expect(answer).not.toHaveBeenCalled();
});

test('unmount aborts an in-flight field lookup', async () => {
  read.mockImplementation(() => new Promise(() => {}));
  await mount();
  const signal = read.mock.calls[0]![2] as AbortSignal;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
});

test('file-mode secret.request is a refusal with no input or save action', async () => {
  await act(async () => root.render(<SecretRequestCard part={part} request={{ label: 'API key', reason: 'Write it to disk', placeholder: undefined }} />));
  expect(container.querySelector('[data-secret-request-status="refused"]')).not.toBeNull();
  expect(container.textContent).toContain('chat.secretRequest.refused');
  expect(container.querySelector('input, form, button')).toBeNull();
  expect(read).not.toHaveBeenCalled();
  expect(answer).not.toHaveBeenCalled();
});
