import { expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';

import { toToolView } from './toolView';
import type { RequestedSecret } from './toolView';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLButtonElement: browser.HTMLButtonElement,
  Event: browser.Event,
  MutationObserver: browser.MutationObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }), isRightToLeft: () => false }));
mock.module('@/sync/sync-context', () => ({ useSessionDirectory: () => '/project' }));
mock.module('@/lib/secretRequestAnswer', () => ({ answerSecretRequest: async () => undefined, readSecretRunFields: async () => null, forgetSavedSecret: async () => null }));
mock.module('@/components/ui', () => ({ toast: { error: () => undefined } }));
mock.module('@/components/chat/lib/scroll/timelineScrollIntent', () => ({ dispatchPageWaiting: () => undefined }));
mock.module('@/stores/useUIStore', () => ({ useUIStore: () => false }));
mock.module('./ToolPart', () => ({ default: () => null }));

const { createRoot } = await import('react-dom/client');
const { SecretRequestCard } = await import('./SecretRequestCard');

test('freeform secret requests are refused without a credential input', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const part = toToolView({ type: 'tool_call', partId: 'part-1', toolCallId: 'call-1', toolName: 'openchamber_secret', input: {}, status: 'running' }, undefined, { sessionID: 'ses-1', messageID: 'msg-1' });
  const request: RequestedSecret = { label: 'API key', reason: 'Needed for the test run', placeholder: undefined };
  try {
    await act(async () => root.render(<SecretRequestCard part={part} request={request} />));
    expect(container.querySelector('[data-secret-request-status="refused"]')).not.toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('chat.secretRequest.refused');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
