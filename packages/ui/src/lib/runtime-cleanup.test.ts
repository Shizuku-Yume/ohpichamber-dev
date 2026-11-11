import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { hostFilesystem } from '@/lib/host-filesystem';
import { captureChatDirectoryCleanup } from './chatDirectories';
import { captureRuntimeCleanup } from './runtime-cleanup';
import { installRuntimeFetchBridge } from './runtime-fetch';
import { getRuntimeKey, switchRuntimeEndpoint } from './runtime-switch';
import { adoptRelayTunnel } from './relay/runtime-tunnel';
import type { RelayTunnelClient } from './relay/tunnel-client';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
type Call = { url: string; method: string; headers: Headers; body: string };
let calls: Call[] = [];
let failDelete = false;
let onDelete: (() => void) | undefined;
const network: typeof fetch = async (input, init) => {
  const req = new Request(input instanceof Request ? input : new URL(String(input), 'https://origin.test'), init);
  calls.push({ url: req.url, method: req.method, headers: req.headers, body: await req.text() });
  if (req.method === 'DELETE' || req.url.endsWith('/api/fs/delete')) {
    onDelete?.();
    if (failDelete) return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204 });
};
const runtimeWindow = Object.assign(new EventTarget(), {
  location: { origin: 'https://origin.test', href: 'https://origin.test/' },
  fetch: network,
});
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: runtimeWindow });
installRuntimeFetchBridge();
globalThis.fetch = runtimeWindow.fetch;


beforeEach(() => {
  calls = [];
  failDelete = false;
  onDelete = undefined;
  switchRuntimeEndpoint({ apiBaseUrl: 'https://origin.test', runtimeKey: 'owner-a', clientToken: 'token-a', requestHeaders: { 'X-Owner': 'A' } });
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: originalWindow });
});
const deletes = () => calls.filter(call => call.method === 'DELETE' || call.url.endsWith('/api/fs/delete'));
const switchToB = () => switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'owner-b', clientToken: 'token-b' });

describe('cleanup on the runtime that created the resource', () => {
  test('a direct cleanup keeps the original URL and auth after A to B', async () => {
    const remove = await captureRuntimeCleanup(getRuntimeKey());
    switchToB();
    await remove(async ({ fetch }) => {
      await fetch('/api/session/ses-created', { method: 'DELETE' });
    });
    expect(deletes().map(call => [call.url, call.headers.get('authorization'), call.headers.get('x-owner')])).toEqual([
      ['https://origin.test/api/session/ses-created', 'Bearer token-a', 'A'],
    ]);
  });

  test('chat deletion goes through the same captured transport', async () => {
    const home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
    let removeChat: (directory: string) => Promise<void>;
    try {
      removeChat = await captureChatDirectoryCleanup(getRuntimeKey());
    } finally {
      home.mockRestore();
    }
    switchToB();
    await removeChat('/srv/chats/day/session-a');
    await removeChat('/srv/chats');
    expect(deletes().map(call => [call.url, call.headers.get('authorization'), call.headers.get('x-owner')])).toEqual([
      ['https://origin.test/api/fs/delete', 'Bearer token-a', 'A'],
    ]);
    expect(JSON.parse(deletes()[0].body)).toEqual({ path: '/srv/chats/day/session-a' });
  });

  test('same-origin cleanup waits for A and uses its refreshed credentials', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: '', runtimeKey: 'same-origin-a', clientToken: 'token-a' });
    const remove = await captureRuntimeCleanup(getRuntimeKey());
    const home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
    let removeChat: (directory: string) => Promise<void>;
    try {
      removeChat = await captureChatDirectoryCleanup(getRuntimeKey());
    } finally {
      home.mockRestore();
    }
    switchToB();
    await remove(async ({ fetch }) => {
      await fetch('/api/session/ses-deferred', { method: 'DELETE' });
    });
    await removeChat('/srv/chats/day/session-a');
    expect(deletes()).toHaveLength(0);
    const deleted = Promise.withResolvers<void>();
    onDelete = () => { if (deletes().length === 2) deleted.resolve(); };
    switchRuntimeEndpoint({ apiBaseUrl: '', runtimeKey: 'same-origin-a', clientToken: 'refreshed-a' });
    await deleted.promise;
    expect(deletes().map(call => [call.url, call.headers.get('authorization')])).toEqual([
      ['https://origin.test/api/session/ses-deferred', 'Bearer refreshed-a'],
      ['https://origin.test/api/fs/delete', 'Bearer refreshed-a'],
    ]);
  });

  test('failed direct cleanup remains pending and retries when its owner returns', async () => {
    const home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
    const removeChat = await captureChatDirectoryCleanup(getRuntimeKey());
    home.mockRestore();
    switchToB();
    failDelete = true;
    // Chat deletion rejects a non-ok response, which is what keeps the job pending.
    await removeChat('/srv/chats/day/session-retry');
    expect(deletes()).toHaveLength(1);
    failDelete = false;
    const deleted = Promise.withResolvers<void>();
    onDelete = deleted.resolve;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://returned.test/host', runtimeKey: 'owner-a', clientToken: 'refreshed-a' });
    await deleted.promise;
    expect(deletes()).toHaveLength(2);
    expect(deletes()[1].url).toBe('https://returned.test/host/api/fs/delete');
    expect(deletes()[1].headers.get('authorization')).toBe('Bearer refreshed-a');
  });

  test('relay cleanup is retained until the owning tunnel returns', async () => {
    const descriptor = { relayUrl: 'wss://relay.test/ws', serverId: 'owner', hostEncPubJwk: { kty: 'EC' } };
    let tunneledDeletes = 0;
    const tunnel: RelayTunnelClient = {
      fetch: async (input, init) => {
        if ((init?.method ?? (input instanceof Request ? input.method : 'GET')) === 'DELETE') tunneledDeletes += 1;
        return network(input, init);
      }, openWebSocket() { throw new Error('unused'); },
      getStatus: () => ({ state: 'connected' }), subscribeStatus: () => () => { }, retry() { }, close() { },
    };
    adoptRelayTunnel(descriptor, tunnel);
    const remove = await captureRuntimeCleanup(getRuntimeKey());
    switchToB();
    await remove(async ({ fetch }) => {
      await fetch('/api/session/ses-relay', { method: 'DELETE' });
    });
    expect(deletes()).toHaveLength(0);
    // Replay the endpoint event after adopting the test tunnel, as a real
    // switch activates its tunnel before publishing the endpoint change.
    const dispatchEvent = runtimeWindow.dispatchEvent.bind(runtimeWindow);
    runtimeWindow.dispatchEvent = (event) => event.type === 'openchamber:runtime-endpoint-changed' ? true : dispatchEvent(event);
    try {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://origin.test', runtimeKey: 'owner-a', clientToken: 'refreshed-a' });
      adoptRelayTunnel(descriptor, tunnel);
    } finally {
      runtimeWindow.dispatchEvent = dispatchEvent;
    }
    const deleted = Promise.withResolvers<void>();
    onDelete = deleted.resolve;
    runtimeWindow.dispatchEvent(new CustomEvent('openchamber:runtime-endpoint-changed', { detail: { runtimeKey: 'owner-a' } }));
    await deleted.promise;
    expect(deletes()).toHaveLength(1);
    expect(tunneledDeletes).toBe(1);
    expect(deletes()[0].headers.get('authorization')).toBe('Bearer refreshed-a');
  });
});
