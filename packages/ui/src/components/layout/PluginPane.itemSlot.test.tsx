import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CanonicalClient } from '@/api/canonicalClient';
import { Window } from 'happy-dom';
import { connectPluginPaneFixture } from './__tests__/pluginPaneFixture';
import type { GuestLinkItem } from 'ohpichamber-sdk';

import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { I18nProvider } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useGuestItemStore } from '@/lib/guests/item-store';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { SyncProvider } from '@/sync/sync-context';
import { PluginPane } from './PluginPane';

// A claimed link opens the extension's rail panel with the link as its item.
// A block of the same extension already in the chat comes first in the tree,
// and must leave the parked item to the panel.
test('an item parked for the rail reaches the panel, not a block of the same extension', async () => {
  const dom = new Window({ url: 'http://guest.test', settings: { disableIframePageLoading: true } });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator,
    localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), Event: dom.Event, MessageEvent: dom.MessageEvent,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.includes('/frame-grant')) return Response.json({ grant: 'grant-test', expiresAt: Date.now() + 60_000 });
    if (target.includes('/auth/url-token')) return Response.json({ token: 'scoped-test', expiresAt: Date.now() + 60_000 });
    if (target.includes('/event')) return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    return Response.json({ data: [] });
  });
  const client = new CanonicalClient();
  const theme = getDefaultTheme(false);
  const themeContext: ThemeContextValue = {
    currentTheme: theme, availableThemes: [theme], customThemeIds: [], setTheme: () => {}, customThemesLoading: false,
    reloadCustomThemes: async () => {}, importTheme: async () => theme, deleteImportedTheme: async () => {},
    isSystemPreference: false, setSystemPreference: () => {}, themeMode: 'light', setThemeMode: () => {},
    lightThemeId: theme.metadata.id, darkThemeId: theme.metadata.id, setLightThemePreference: () => {}, setDarkThemePreference: () => {},
  };
  const tracker: InstalledGuest = {
    id: 'tracker', name: 'Tracker', icon: 'window', entry: 'panel/index.html', source: 'path',
    capabilities: { requested: [], granted: [] },
  };
  const block = { call: { name: 'card', args: {}, answered: null }, entry: 'panel/block.html', answer: async () => {} };
  const link: GuestLinkItem = { kind: 'link', identifier: 'DEMO-12', url: 'https://tracker.example/DEMO-12' };
  const runtimeKey = getRuntimeKey();
  useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
  useGuestsStore.getState().replaceCatalog([tracker], runtimeKey);
  useGuestItemStore.setState({ pendingItemByGuest: {} });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const windows: Window[] = [];
  const restores: Array<() => void> = [];
  // Strict Mode runs the panel's mount effect twice, as the app does in development.
  const render = (withPanel: boolean, panelOpen = true) => root.render(
    <React.StrictMode><I18nProvider><ThemeSystemContext.Provider value={themeContext}>
      <SyncProvider client={client} directory="/visible">
        <PluginPane mode="plugin:tracker" surface="block" block={block} />
        {withPanel ? <PluginPane mode="plugin:tracker" panelOpen={panelOpen} /> : null}
      </SyncProvider>
    </ThemeSystemContext.Provider></I18nProvider></React.StrictMode>,
  );
  // What each frame is told after its `hello`: the `ready` and `item` it gets.
  const connections = new Map<HTMLIFrameElement, Awaited<ReturnType<typeof connectPluginPaneFixture>>>();
  const itemsSentTo = async (entry: string) => {
    const frame = [...container.querySelectorAll<HTMLIFrameElement>('iframe')].find((candidate) => candidate.src.includes(`/${entry}`));
    if (!frame) throw new Error(`${entry} frame did not mount`);
    let connection = connections.get(frame);
    if (!connection) {
      const guestWindow = new Window();
      windows.push(guestWindow);
      Object.defineProperty(frame, 'contentWindow', { configurable: true, value: guestWindow });
      connection = await connectPluginPaneFixture(frame);
      connections.set(frame, connection);
      restores.push(connection.close);
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    return connection.received.splice(0).flatMap((message) => (
      message.type === 'ready' ? [message.payload.item] : message.type === 'item' ? [message.payload.item] : []
    ));
  };
  try {
    await act(async () => render(false));
    // The click parks the link and opens the panel in the same turn.
    await act(async () => {
      useGuestItemStore.getState().setPendingItem('tracker', link);
      render(true);
    });
    for (let attempt = 0; attempt < 100 && container.querySelectorAll('iframe').length < 2; attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    const blockItems = await itemsSentTo('panel/block.html');
    const panelItems = await itemsSentTo('panel/index.html');
    expect(blockItems.length).toBeGreaterThan(0);
    expect(blockItems.every((item) => item === null)).toBe(true);
    expect(panelItems.length).toBeGreaterThan(0);
    expect(panelItems.every((item) => JSON.stringify(item) === JSON.stringify(link))).toBe(true);
    expect(useGuestItemStore.getState().pendingItemByGuest).toEqual({});
    await act(async () => render(true, false));
    await act(async () => render(true, true));
    expect(await itemsSentTo('panel/index.html')).toEqual([null, null]);
    await act(async () => render(true, false));
    const nextLink: GuestLinkItem = { ...link, identifier: 'DEMO-13' };
    await act(async () => {
      useGuestItemStore.getState().setPendingItem('tracker', nextLink);
      render(true, true);
    });
    expect(await itemsSentTo('panel/index.html')).toEqual([nextLink, nextLink]);
  } finally {
    await act(async () => root.unmount());
    for (const restore of restores) restore();
    fetch.mockRestore();
    useGuestItemStore.setState({ pendingItemByGuest: {} });
    useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
    for (const guestWindow of windows) await guestWindow.happyDOM.close();
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
