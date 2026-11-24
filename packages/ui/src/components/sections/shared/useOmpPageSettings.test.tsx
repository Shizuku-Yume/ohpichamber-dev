import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { OmpSetting, OmpSettingsState, OmpSettingValue } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  Event: browser.Event,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React DOM must evaluate after happy-dom installs browser globals into globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { getSettingsSaveState, reportSettingsSaveState } = await import('@/lib/persistence');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useOmpPageSettings } = await import('./useOmpPageSettings');

// The runtime URL resolver turns /api routes absolute when an API base is injected;
// without it Bun's fetch rejects relative URLs before the stub below can see them.
// SAFETY: Window gains an optional injected API-base field the resolver reads at call time.
(window as typeof window & { __OPENCHAMBER_API_BASE_URL__?: string }).__OPENCHAMBER_API_BASE_URL__ = 'http://localhost';

const WORKSPACE = { workspaceId: 'ws1', projectId: 'project_1', name: 'repo' };

const snapshot = (revision: string, value: OmpSettingValue): OmpSettingsState => ({
  workspaceId: 'ws1',
  revision,
  totalCount: 1,
  settings: [{
    id: 'flag', type: 'string', value, default: 'initial', configured: true,
    placement: { type: 'page', page: 'test', section: 'main' },
  }],
});

const settingRow = (state: OmpSettingsState): OmpSetting => state.settings[0]!;

type PutHandler = (input: { expectedRevision: string; changes: { id: string; value: OmpSettingValue }[] }) => Promise<Response>;

let putHandler: PutHandler = async () => new Response(null, { status: 500 });
let loadSeen = Promise.withResolvers<void>();

const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost/');
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.pathname === '/api/agent/v1/workspaces/resolve' && method === 'POST') {
    return Response.json(WORKSPACE);
  }
  if (url.pathname === '/api/agent/v1/workspaces/ws1/settings') {
    if (method === 'GET') {
      const response = Response.json(snapshot('1', 'initial'));
      loadSeen.resolve();
      return response;
    }
    if (method === 'PUT') {
      const body = await (input instanceof Request ? input.json() : JSON.parse(String(init?.body)));
      return putHandler(body);
    }
  }
  throw new Error(`Unexpected request ${method} ${url.pathname}`);
}, originalFetch);
afterAll(() => { globalThis.fetch = originalFetch; });

type Harness = {
  latest: { form: Record<string, OmpSettingValue>; updateSetting: (id: string, value: OmpSettingValue) => Promise<void> } | null;
};

const HarnessView = ({ harness }: { harness: Harness }) => {
  const { form, updateSetting } = useOmpPageSettings('test');
  harness.latest = { form, updateSetting };
  return <div data-value={String(form.flag ?? 'unset')} />;
};

describe('useOmpPageSettings save feedback', () => {
  let host: HTMLDivElement;
  let root: Root;
  let harness: Harness;

  beforeEach(() => {
    reportSettingsSaveState('saved');
    putHandler = async () => new Response(null, { status: 500 });
    loadSeen = Promise.withResolvers<void>();
    harness = { latest: null };
    useProjectsStore.setState({
      projects: [{ id: 'project_1', path: '/repo' }],
      activeProjectId: 'project_1',
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    reportSettingsSaveState('saved');
  });

  const mountAndLoad = async () => {
    await act(async () => {
      root.render(<HarnessView harness={harness} />);
    });
    await act(async () => {
      await loadSeen.promise;
    });
    if (!harness.latest) throw new Error('Hook did not mount');
    return harness.latest;
  };

  test('a 5xx write reports the failed save state and rolls back the optimistic value', async () => {
    const api = await mountAndLoad();
    expect(host.querySelector('div')?.dataset.value).toBe('initial');
    const put = Promise.withResolvers<Response>();
    putHandler = () => put.promise;

    let write: Promise<void> | undefined;
    await act(async () => {
      write = api.updateSetting('flag', 'changed');
      await Promise.resolve();
    });
    expect(host.querySelector('div')?.dataset.value).toBe('changed');

    await act(async () => {
      put.resolve(Response.json(
        { type: 'urn:ohpichamber:problem:SETTINGS_WRITE_FAILED', title: 'Write failed', status: 500, detail: 'disk error', code: 'SETTINGS_WRITE_FAILED', retryable: true },
        { status: 500 },
      ));
      await write;
    });
    expect(getSettingsSaveState()).toBe('error');
    expect(host.querySelector('div')?.dataset.value).toBe('initial');
  });

  test('a thrown write reports the failed save state and rolls back the optimistic value', async () => {
    const api = await mountAndLoad();
    putHandler = async () => {
      throw new Error('network down');
    };

    let write: Promise<void> | undefined;
    await act(async () => {
      write = api.updateSetting('flag', 'changed');
    });
    await act(async () => {
      await write;
    });
    expect(getSettingsSaveState()).toBe('error');
    expect(host.querySelector('div')?.dataset.value).toBe('initial');
  });

  test('a committed write reports saved and keeps the new value', async () => {
    const api = await mountAndLoad();
    putHandler = async (input) => Response.json({
      workspaceId: 'ws1',
      revision: String(BigInt(input.expectedRevision) + 1n),
      totalCount: 1,
      settings: input.changes.map((change) => ({ ...settingRow(snapshot('1', 'initial')), value: change.value })),
    });

    let write: Promise<void> | undefined;
    await act(async () => {
      write = api.updateSetting('flag', 'changed');
      await write;
    });
    expect(getSettingsSaveState()).toBe('idle');
    expect(host.querySelector('div')?.dataset.value).toBe('changed');
  });

  test('a stale failure does not clear a newer pending write of the same key', async () => {
    const api = await mountAndLoad();
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const handlers = [first, second];
    putHandler = () => handlers.shift()?.promise ?? Promise.resolve(new Response(null, { status: 500 }));

    let firstWrite: Promise<void> | undefined;
    let secondWrite: Promise<void> | undefined;
    await act(async () => {
      firstWrite = api.updateSetting('flag', 'first');
      secondWrite = api.updateSetting('flag', 'second');
    });
    expect(host.querySelector('div')?.dataset.value).toBe('second');

    await act(async () => {
      first.resolve(Response.json(
        { type: 'urn:ohpichamber:problem:SETTINGS_WRITE_FAILED', title: 'Write failed', status: 500, detail: 'write failed', code: 'SETTINGS_WRITE_FAILED', retryable: true },
        { status: 500 },
      ));
      await firstWrite;
    });
    expect(host.querySelector('div')?.dataset.value).toBe('second');

    await act(async () => {
      second.resolve(Response.json({
        workspaceId: 'ws1',
        revision: '2',
        totalCount: 1,
        settings: [{ ...settingRow(snapshot('1', 'initial')), value: 'second' }],
      }));
      await secondWrite;
    });
    expect(host.querySelector('div')?.dataset.value).toBe('second');
    expect(getSettingsSaveState()).toBe('idle');
  });
});
