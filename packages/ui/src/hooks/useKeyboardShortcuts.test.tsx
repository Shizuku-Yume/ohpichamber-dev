import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { getVisibleContextRailSurfaces } from '@/lib/surfaces/registry';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { useInputStore } from '@/sync/input-store';
import { SyncProvider } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

test('Ctrl+L adds a selection outside chat and yields to a sequence without one', async () => {
  const dom = new Window({ url: 'http://shortcut.test' });
  const directory = '/workspace/shortcut-test';
  const fetchResponse = async (request: Request | URL | string) => {
    const path = new URL(request instanceof Request ? request.url : request.toString()).pathname;
    if (path.endsWith('/event')) {
      return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    }
    const data = path.endsWith('/location')
      ? { directory, project: { id: 'project', directory, canonical: directory } }
      : path.endsWith('/vcs') ? { data: { branch: { current: 'main', default: 'main' } } }
      : path.endsWith('/session/active') ? { data: {} }
      : path.endsWith('/config') || path.endsWith('/project') ? [] : { data: [] };
    return Response.json(data);
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement,
    HTMLTextAreaElement: dom.HTMLTextAreaElement, Node: dom.Node, Event: dom.Event,
    KeyboardEvent: dom.KeyboardEvent, CustomEvent: dom.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: fetchResponse,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const previousOverrides = useUIStore.getState().shortcutOverrides;
  const textarea = document.createElement('textarea');
  textarea.value = 'alpha beta gamma';
  document.body.append(textarea);
  const chatInput = document.createElement('div');
  chatInput.dataset.chatInput = 'true';
  const composer = document.createElement('div');
  composer.className = 'cm-content';
  composer.tabIndex = 0;
  chatInput.append(composer);
  document.body.append(chatInput);

  function ShortcutOwner() {
    useKeyboardShortcuts();
    return null;
  }

  try {
    await act(async () => root.render(
      <ThemeSystemProvider>
        <SyncProvider directory={directory}><ShortcutOwner /></SyncProvider>
      </ThemeSystemProvider>,
    ));

    textarea.focus();
    textarea.setSelectionRange(6, 10);
    const selectedKey = new KeyboardEvent('keydown', {
      key: 'l', code: 'KeyL', ctrlKey: true, bubbles: true, cancelable: true,
    });
    await act(async () => { textarea.dispatchEvent(selectedKey); await Promise.resolve(); });

    expect(selectedKey.defaultPrevented).toBe(true);
    expect(useInputStore.getState()).toMatchObject({
      pendingInputText: '```md\nbeta\n```', pendingInputMode: 'append',
    });
    expect(document.activeElement).toBe(composer);
    expect(textarea.selectionStart).toBe(textarea.selectionEnd);

    useInputStore.getState().setPendingInputText(null);
    useUIStore.setState({ shortcutOverrides: { ...previousOverrides, focus_input: 'mod+l i' } });
    textarea.focus();
    const leader = new KeyboardEvent('keydown', {
      key: 'l', code: 'KeyL', ctrlKey: true, bubbles: true, cancelable: true,
    });
    await act(async () => { textarea.dispatchEvent(leader); await Promise.resolve(); });

    expect(leader.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(useInputStore.getState().pendingInputText).toBeNull();

    const completion = new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', bubbles: true, cancelable: true });
    await act(async () => { textarea.dispatchEvent(completion); });
    expect(completion.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(composer);
  } finally {
    await act(async () => root.unmount());
    useUIStore.setState({ shortcutOverrides: previousOverrides });
    useInputStore.getState().setPendingInputText(null);
    host.remove();
    textarea.remove();
    chatInput.remove();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});

test('switch_context_surface digit shortcut indexes subagents when the active session has subagents', async () => {
  const dom = new Window({ url: 'http://shortcut.test' });
  const directory = '/workspace/shortcut-subagents-test';
  const fetchResponse = async (request: Request | URL | string) => {
    const path = new URL(request instanceof Request ? request.url : request.toString()).pathname;
    if (path.endsWith('/event')) {
      return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    }
    const data = path.endsWith('/location')
      ? { directory, project: { id: 'project', directory, canonical: directory } }
      : path.endsWith('/vcs') ? { data: { branch: { current: 'main', default: 'main' } } }
      : path.endsWith('/session/active') ? { data: {} }
      : path.endsWith('/config') || path.endsWith('/project') ? [] : { data: [] };
    return Response.json(data);
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement,
    HTMLTextAreaElement: dom.HTMLTextAreaElement, Node: dom.Node, Event: dom.Event,
    KeyboardEvent: dom.KeyboardEvent, CustomEvent: dom.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: fetchResponse,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const previousSessionId = useSessionUIStore.getState().currentSessionId;
  const previousDirectory = useDirectoryStore.getState().currentDirectory;
  const previousOverrides = useUIStore.getState().shortcutOverrides;
  const previousHidden = useUIStore.getState().contextRailHiddenSurfaces;
  const previousOrder = useUIStore.getState().contextRailOrder;
  const previousPanels = useUIStore.getState().contextPanelByDirectory;
  const sessionId = 'parent-shortcut-subagent';

  function ShortcutOwner() {
    useKeyboardShortcuts();
    return null;
  }

  try {
    useDirectoryStore.setState({ currentDirectory: directory });
    useSessionUIStore.setState({ currentSessionId: sessionId });
    useUIStore.setState({
      contextRailOrder: [],
      contextRailHiddenSurfaces: [],
      shortcutOverrides: { ...previousOverrides, switch_context_surface: 'mod+alt' },
    });
    useSubagentsStore.getState().setSubagents(sessionId, [{
      subagentId: 'sub-1',
      parentSessionId: sessionId,
      role: 'scout',
      status: 'running',
    }]);

    await act(async () => root.render(
      <ThemeSystemProvider>
        <SyncProvider directory={directory}><ShortcutOwner /></SyncProvider>
      </ThemeSystemProvider>,
    ));

    const visibleSurfaces = getVisibleContextRailSurfaces({
      railOrder: [],
      hiddenSurfaces: [],
      isVSCode: false,
      workflowsShown: false,
      subagentsShown: true,
      screenWidth: window.innerWidth,
      tabs: [],
      sourceControlConnected: Object.values(useSourceControlAuthStore.getState().entries).some((entry) => entry.status?.status === 'connected'),
    });
    const subagentsIndex = visibleSurfaces.findIndex((surface) => surface.id === 'subagents');
    expect(subagentsIndex).toBeGreaterThan(-1);
    expect(subagentsIndex).toBeLessThan(10);
    const digit = subagentsIndex === 9 ? '0' : String(subagentsIndex + 1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', ctrlKey: true, altKey: true, bubbles: true }));
      const keyEvent = new KeyboardEvent('keydown', {
        key: digit, code: `Digit${digit}`, ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
      });
      window.dispatchEvent(keyEvent);
      await Promise.resolve();
    });

    const panel = useUIStore.getState().contextPanelByDirectory[directory];
    expect(panel?.isOpen).toBe(true);
    expect(panel?.tabs.some((tab) => tab.mode === 'subagents')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    useSubagentsStore.getState().clearSession(sessionId);
    useDirectoryStore.setState({ currentDirectory: previousDirectory });
    useSessionUIStore.setState({ currentSessionId: previousSessionId });
    useUIStore.setState({
      shortcutOverrides: previousOverrides,
      contextRailHiddenSurfaces: previousHidden,
      contextRailOrder: previousOrder,
      contextPanelByDirectory: previousPanels,
    });
    host.remove();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
