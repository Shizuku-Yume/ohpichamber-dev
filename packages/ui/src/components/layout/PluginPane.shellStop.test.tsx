import { expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CanonicalClient } from '@/api/canonicalClient';
import { Window } from 'happy-dom';
import { connectPluginPaneFixture } from './__tests__/pluginPaneFixture';
import { HostRequestError, OPENCHAMBER_SDK_API_VERSION, OPENCHAMBER_SDK_CHANNEL } from 'ohpichamber-sdk';

import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { I18nProvider } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { SyncProvider } from '@/sync/sync-context';
import { canonicalClient } from '@/api/canonicalClient';
import { useBackgroundShellsStore, resetBackgroundShells, type TrackedShell } from '@/sync/background-shells';
import { PluginPane } from './PluginPane';

test('a guest stops canonical shell jobs by identity and receives missing-job and host errors', async () => {
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
    if (target.includes('/session/active')) return Response.json({});
    if (target.includes('/location')) return Response.json({ directory: '/visible', project: { id: 'project', directory: '/visible', canonical: '/visible' } });
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
  const writer: InstalledGuest = {
    id: 'writer', storageId: 'store-1', name: 'Writer', icon: 'window', entry: 'panel/index.html', source: 'path',
    capabilities: { requested: ['shells'], granted: ['shells'] },
  };
  const runtimeKey = getRuntimeKey();
  useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
  useGuestsStore.getState().replaceCatalog([writer], runtimeKey);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const restores: Array<() => void> = [];
  const pane = (open: boolean, headless = false) => (
    <I18nProvider><ThemeSystemContext.Provider value={themeContext}>
      <SyncProvider client={client} directory="/visible">{open ? <PluginPane mode="plugin:writer" surface="panel" headless={headless} /> : null}</SyncProvider>
    </ThemeSystemContext.Provider></I18nProvider>
  );
  // Mount the panel and attach a stand-in for the document inside its frame.
  const openPanel = async (headless = false) => {
    await act(async () => root.render(pane(true, headless)));
    for (let attempt = 0; attempt < 100 && !container.querySelector('iframe'); attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    const frame = container.querySelector<HTMLIFrameElement>('iframe');
    if (!frame) throw new Error('Panel iframe did not mount');
    const guestWindow = new Window();
    restores.push(() => { void guestWindow.happyDOM.close(); });
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: guestWindow });
    const frameWindow = frame.contentWindow;
    if (!frameWindow) throw new Error('Guest window is missing');
    const connection = await connectPluginPaneFixture(frame);
    restores.push(connection.close);
    return connection;
  };
  resetBackgroundShells();
  const job: TrackedShell = { jobId: 'sh_waited', sessionId: 'ses_root', epoch: 'epoch-1', workerGeneration: 'worker-1', workspaceId: 'workspace', projectId: 'project', command: 'bun run test', startedAt: 1, outputCursor: '0', status: 'running', directory: '/visible', background: true };
  useBackgroundShellsStore.setState({ byId: new Map([[job.jobId, job]]), sessionIds: new Set([job.sessionId]) });
  const stop = spyOn(canonicalClient, 'stopShell').mockResolvedValue(job);
  try {
    const panel = await openPanel();
    const sendStop = (id: string, shellId: string) => panel.send({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'shell-stop', id, payload: { shellId } });
    await sendStop('stop-1', job.jobId);
    expect(panel.received.find((message) => message.type === 'result' && message.id === 'stop-1')).toMatchObject({ ok: true, payload: { stopped: true } });
    expect(stop.mock.calls[0]?.slice(0, 2)).toEqual([job.sessionId, { job: { sessionId: job.sessionId, jobId: job.jobId, epoch: job.epoch, workerGeneration: job.workerGeneration } }]);

    await sendStop('stop-missing', 'missing');
    expect(panel.received.find((message) => message.type === 'result' && message.id === 'stop-missing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(stop).toHaveBeenCalledTimes(1);

    stop.mockRejectedValueOnce(new HostRequestError('HOST_REJECTED', 'The command could not be stopped.'));
    await sendStop('stop-error', job.jobId);
    expect(panel.received.find((message) => message.type === 'result' && message.id === 'stop-error')).toMatchObject({ ok: false, code: 'HOST_REJECTED' });
  } finally {
    stop.mockRestore();
    resetBackgroundShells();
    await act(async () => root.unmount());
    for (const restore of restores) restore();
    fetch.mockRestore();
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
