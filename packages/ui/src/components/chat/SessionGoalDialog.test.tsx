import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { ChildStoreManager } from '@/sync/child-store';
import { I18nProvider } from '@/lib/i18n';
import '@/sync/sync-context';

// React DOM and the Base UI dialog probe for a DOM when first imported; without
// one the dialog never mounts its popup. Give the probe a document, then
// restore the caller's globals.
const importWindow = new Window();
const importGlobals = ['window', 'document'] as const;
const previousImportGlobals = importGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
Object.defineProperty(globalThis, 'window', { value: importWindow, configurable: true, writable: true });
Object.defineProperty(globalThis, 'document', { value: importWindow.document, configurable: true, writable: true });
const { createRoot } = await import('react-dom/client');
const { SessionGoalDialog } = await import('./SessionGoalDialog');
for (const [name, descriptor] of previousImportGlobals) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
void importWindow.happyDOM.close();

const directory = '/repo';
const sessionId = 'session-1';
// A streamed step replaces the session record; an active goal's usage moves
// with it.
const session = (updated: number, turnsUsed: number): Session => ({
  sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId,
  createdAt: 0, updatedAt: updated, epoch: 'epoch', headSequence: String(updated), runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: 'test', openchamber: { goal: { id: 'goal-1', objective: 'Ship it', status: 'active', tokensUsed: updated * 100, turnsUsed } } },
  metadataRevision: '1', archiveRevision: '0',
});

const DOM_GLOBAL_NAMES = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
type InstallDomResult = { container: HTMLElement; restore: () => void };
const installDom = (): InstallDomResult => {
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

describe('SessionGoalDialog', () => {
  let root: Root;
  let dom: InstallDomResult;
  let childStores: ChildStoreManager;
  let renders = 0;
  const stage = (record: Session) => act(async () => {
    childStores.ensureChild(directory, { bootstrap: false }).setState({ session: [record] });
  });
  const render = (open: boolean) => act(async () => {
    const globals = globalThis as typeof globalThis & {
      __openchamber_sync_context__?: React.Context<unknown>;
      __openchamber_sync_runtime_context__?: React.Context<unknown>;
    };
    const syncContext = globals.__openchamber_sync_context__;
    const syncRuntimeContext = globals.__openchamber_sync_runtime_context__;
    if (!syncContext || !syncRuntimeContext) throw new Error('Expected sync contexts');
    const runtime = { childStores, messageLoader: {}, client: {}, runtimeKey: 'test', currentDirectory: { get: () => directory, subscribe: () => () => undefined } };
    root.render(React.createElement(syncContext.Provider, { value: { ...runtime, directory } },
      React.createElement(syncRuntimeContext.Provider, { value: runtime }, React.createElement(I18nProvider, null,
        React.createElement(React.Profiler, { id: 'goal-dialog', onRender: () => { renders += 1; } },
          React.createElement(SessionGoalDialog, { open, onOpenChange: () => undefined, sessionId, directory }),
        ),
      )),
    ));
  });

  beforeEach(() => {
    renders = 0;
    dom = installDom();
    childStores = new ChildStoreManager();
    root = createRoot(dom.container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    childStores.disposeAll();
    dom.restore();
  });


  test('a closed dialog does not re-render while the session streams', async () => {
    await render(false);
    await stage(session(1, 1));
    const settled = renders;

    await stage(session(2, 1));
    await stage(session(3, 2));
    await stage(session(4, 3));

    expect(renders).toBe(settled);
    expect(document.body.textContent).not.toContain('Session Goal');
  });

  test('an open dialog shows the goal and follows its live usage', async () => {
    await render(false);
    await stage(session(1, 3));
    await render(true);

    expect(document.body.textContent).toContain('Session Goal');
    expect(document.body.textContent).toContain('3 continuations');

    await stage(session(2, 4));

    expect(document.body.textContent).toContain('4 continuations');
  });
});
