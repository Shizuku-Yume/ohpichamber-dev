import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Message, Session } from '@openchamber/agent-contract';
import { CanonicalClient } from '@/api/canonicalClient';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { RevertedMessagesStrip } from './RevertedMessagesStrip';

const directory = '/repo';
const sessionId = 'session-1';
const session: Session = {
  sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId,
  createdAt: 0, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: null, metadataRevision: '0', archiveRevision: '0',
};
const user = (messageId: string, turnId: string, createdAt: number): Message => ({
  messageId, sessionId, turnId, role: 'user', createdAt, parts: [{ type: 'text', partId: `part-${messageId}`, content: 'Prompt' }],
});

const DOM_GLOBAL_NAMES = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
type DomHarness = { container: HTMLElement; restore: () => void };
const installDom = (): DomHarness => {
  const win = new Window({ url: 'http://localhost' });
  const previous = DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const values = { window: win, document: win.document, navigator: win.navigator, Node: win.Node, Element: win.Element,
    HTMLElement: win.HTMLElement, localStorage: win.localStorage, getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
  for (const name of DOM_GLOBAL_NAMES) Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, restore: () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    void win.happyDOM.close();
  } };
};

describe('RevertedMessagesStrip', () => {
  let root: Root;
  let dom: DomHarness;
  const client = new CanonicalClient();
  const store = () => {
    const result = getSyncChildStores().getChild(directory);
    if (!result) throw new Error('Expected mounted directory store');
    return result;
  };

  beforeEach(async () => {
    dom = installDom();
    root = createRoot(dom.container);
    await act(async () => root.render(
      <SyncProvider client={client} directory={directory}>
        <I18nProvider><RevertedMessagesStrip sessionId={sessionId} directory={directory} /></I18nProvider>
      </SyncProvider>,
    ));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.restore();
  });

  test('canonical transcript has no staged-revert UI', async () => {
    await act(async () => store().setState({ session: [session], message: { [sessionId]: [user('message-1', 'turn-1', 1)] } }));
    expect(dom.container.textContent).toBe('');
  });
});
