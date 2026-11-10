import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { CanonicalClient } from '@/api/canonicalClient';
import type { Message, Part, Session } from '@openchamber/agent-contract';
import { I18nProvider } from '@/lib/i18n';
import { opencodeClient } from '@/lib/opencode/client';
import { getImperativeSessionMessageLoader } from '@/sync/session-message-loader';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { ChatColumnSessionContext } from './chatColumnSession';

// React DOM and the Base UI dialog probe for a DOM when first imported; without
// one the dialog never mounts its popup. Give the probe a document, then
// restore the caller's globals.
const importWindow = new Window();
const importGlobals = ['window', 'document'] as const;
const previousImportGlobals = importGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
Object.defineProperty(globalThis, 'window', { value: importWindow, configurable: true, writable: true });
Object.defineProperty(globalThis, 'document', { value: importWindow.document, configurable: true, writable: true });
const { createRoot } = await import('react-dom/client');
const { TimelineDialog } = await import('./TimelineDialog');
for (const [name, descriptor] of previousImportGlobals) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
void importWindow.happyDOM.close();

const directory = '/repo';
const sessionId = 'session-1';
const column = { sessionId, directory };
const session: Session = {
  sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId,
  createdAt: 0, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
};
const user = (messageId: string, createdAt: number, parts: Part[] = []): Message => ({
  messageId, sessionId, turnId: `turn-${messageId}`, role: 'user', createdAt, parts,
});

// Counts every read of a part's text: the timeline reads it to build each
// row's preview, so the count is the work the dialog does on a store update.
let textReads = 0;
const countedText = (partId: string, value: string): Part => {
  const part: Part = { partId, type: 'text', content: value };
  Object.defineProperty(part, 'content', {
    enumerable: true,
    get: () => {
      textReads += 1;
      return value;
    },
  });
  return part;
};

const DOM_GLOBAL_NAMES = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const installDom = () => {
  const win = new Window({ url: 'http://localhost' });
  const previous = DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const values = {
    window: win, document: win.document, navigator: win.navigator, Node: win.Node, Element: win.Element,
    HTMLElement: win.HTMLElement, localStorage: win.localStorage, getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true
  };
  for (const name of DOM_GLOBAL_NAMES) Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  return {
    container, restore: () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      void win.happyDOM.close();
    }
  };
};

describe('TimelineDialog', () => {
  let root: Root;
  let dom: ReturnType<typeof installDom>;
  // Bootstrap stays pending, so each test owns the directory store's contents.
  const client = new CanonicalClient();
  const store = () => {
    const result = getSyncChildStores().getChild(directory);
    if (!result) throw new Error('Expected mounted directory store');
    return result;
  };
  const stage = (turns: string[]) => act(async () => {
    store().setState({
      session: [session],
      message: { [sessionId]: turns.map((value, index) => user(`u${index}`, 1_700_000_000_000 + index, [countedText(`p${index}`, value)])) },
    });
  });
  const render = (open: boolean) => act(async () => root.render(
    <SyncProvider client={client} directory={directory}>
      <I18nProvider>
        <ChatColumnSessionContext.Provider value={column}>
          <TimelineDialog open={open} onOpenChange={() => undefined} />
        </ChatColumnSessionContext.Provider>
      </I18nProvider>
    </SyncProvider>,
  ));

  beforeEach(() => {
    textReads = 0;
    dom = installDom();
    root = createRoot(dom.container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.restore();
  });

  test('a closed timeline reads no messages while the session updates', async () => {
    await render(false);
    await stage(['First prompt']);
    await stage(['First prompt', 'Second prompt']);
    await stage(['First prompt', 'Second prompt', 'Third prompt']);

    expect(textReads).toBe(0);
    expect(document.body.textContent).not.toContain('First prompt');
  });

  test('opening the timeline lists the session prompts', async () => {
    await render(false);
    await stage(['First prompt', 'Second prompt']);
    await render(true);

    expect(textReads).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('First prompt');
    expect(document.body.textContent).toContain('Second prompt');
  });

  test('an open timeline holds the loaded transcript against the history trim', async () => {
    const page = spyOn(opencodeClient, 'getSessionMessages').mockResolvedValue({
      items: Array.from({ length: 25 }, (_, index) => ({
        info: user(`u${index}`, 1_700_000_000_000 + index),
        parts: [countedText(`p${index}`, `u${index}`, `Prompt ${index}`)],
      })),
      cursor: {},
    });
    const inbox = spyOn(opencodeClient, 'getSessionInbox').mockResolvedValue([]);
    try {
      await render(false);
      const loader = getImperativeSessionMessageLoader();
      if (!loader) throw new Error('Expected the sync provider to install the message loader');
      await act(async () => {
        await loader.ensure({ directory, sessionID: sessionId }, { reason: 'navigation' });
      });
      expect(store().getState().message[sessionId]).toHaveLength(25);

      await render(true);
      expect(loader.trimHistory({ directory, sessionID: sessionId })).toBe(false);
      expect(store().getState().message[sessionId]).toHaveLength(25);

      await render(false);
      expect(loader.trimHistory({ directory, sessionID: sessionId })).toBe(true);
      expect(store().getState().message[sessionId]).toHaveLength(10);
    } finally {
      page.mockRestore();
      inbox.mockRestore();
    }
  });
});
