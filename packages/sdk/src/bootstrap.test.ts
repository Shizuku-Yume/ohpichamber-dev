import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { connectHost, type HostFrame } from './host.ts';

import {
  GUEST_BOOTSTRAP_API_VERSION,
  GUEST_BOOTSTRAP_CHANNEL,
  GUEST_BOOTSTRAP_EVENT,
  GUEST_BOOTSTRAP_SCRIPT,
} from './bootstrap.ts';

const readBootstrapPort = (event: Event): MessagePort | null => {
  if (!('detail' in event) || !(event.detail instanceof MessagePort)) return null;
  return event.detail;
};

const messageType = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') return undefined;
  return value.type;
};
const messageId = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return undefined;
  return value.id;
};


const runBootstrap = () => {
  let bootstrapPort: MessagePort | null = null;
  const posted: object[] = [];
  const parent: HostFrame['parent'] = {
    postMessage: (message, _targetOrigin, transfer) => {
      posted.push(message);
      const transferred = transfer?.[0];
      if (transferred) {
        // SAFETY: the inline bootstrap's only transferred value is its channel.port2.
        bootstrapPort = transferred as MessagePort;
      }
    },
  };
  const window = Object.assign(new EventTarget(), { parent });
  const target: HostFrame = {
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
    parent,
  };
  class BootstrapEvent extends Event {
    detail: MessagePort | null;
    constructor(type: string, init: { detail: MessagePort | null; cancelable?: boolean }) {
      super(type, { cancelable: init.cancelable });
      this.detail = init.detail;
    }
  }
  runInNewContext(GUEST_BOOTSTRAP_SCRIPT, {
    window,
    MessageChannel,
    CustomEvent: BootstrapEvent,
  });
  return { window, target, posted, getBootstrapPort: () => bootstrapPort };
};

describe('Guest bootstrap transport', () => {
  test('posts one private bootstrap port and delivers requests in the same document', async () => {
    const first = runBootstrap();
    expect(first.posted).toEqual([{ channel: GUEST_BOOTSTRAP_CHANNEL, v: GUEST_BOOTSTRAP_API_VERSION, type: 'bootstrap' }]);
    const bootstrapPort = first.getBootstrapPort();
    expect(bootstrapPort).not.toBeNull();

    const eventPort = new Promise<MessagePort>((resolve) => {
      first.window.addEventListener(GUEST_BOOTSTRAP_EVENT, (event) => {
        const port = readBootstrapPort(event);
        if (port) resolve(port);
      });
    });
    const channel = new MessageChannel();
    const guestMessages: object[] = [];
    const hello = new Promise<void>((resolve) => channel.port2.addEventListener('message', (event) => {
      guestMessages.push(event.data);
      if (messageType(event.data) === 'hello') resolve();
    }));
    const requestMessage = new Promise<{ id: string }>((resolve) => channel.port2.addEventListener('message', (event) => {
      const id = messageType(event.data) === 'request' ? messageId(event.data) : undefined;
      if (id) resolve({ id });
    }));
    channel.port2.start();
    bootstrapPort?.postMessage({ channel: GUEST_BOOTSTRAP_CHANNEL, v: GUEST_BOOTSTRAP_API_VERSION, type: 'connect-port' }, [channel.port1]);
    const client = connectHost({ target: first.target, acceptSource: () => true });
    await eventPort;
    await hello;
    expect(guestMessages).toEqual([{ channel: 'openchamber.sdk', v: 1, type: 'hello' }]);
    const pending = client.request({ method: 'GET', path: '/api/v2/user' });
    const request = await requestMessage;
    channel.port2.postMessage({ channel: 'openchamber.sdk', v: 1, type: 'result', id: request.id, ok: true, payload: { status: 200, body: '{}' } });
    await expect(pending).resolves.toEqual({ status: 200, body: '{}' });
    client.dispose();
    channel.port2.close();
    bootstrapPort?.close();
  });

  test('keeps replacement documents isolated at the bootstrap protocol level', async () => {
    const first = runBootstrap();
    const replacement = runBootstrap();
    const firstEvent = new Promise<MessagePort>((resolve) => {
      first.window.addEventListener(GUEST_BOOTSTRAP_EVENT, (event) => {
        const port = readBootstrapPort(event);
        if (port) resolve(port);
      });
    });
    let replacementDispatched = false;
    replacement.window.addEventListener(GUEST_BOOTSTRAP_EVENT, () => { replacementDispatched = true; });
    const firstPort = first.getBootstrapPort();
    const replacementPort = replacement.getBootstrapPort();
    const firstChannel = new MessageChannel();
    firstPort?.postMessage({ channel: GUEST_BOOTSTRAP_CHANNEL, v: GUEST_BOOTSTRAP_API_VERSION, type: 'connect-port' }, [firstChannel.port1]);
    const client = connectHost({ target: first.target, acceptSource: () => true });
    await firstEvent;
    expect(replacementDispatched).toBe(false);
    client.dispose();
    firstChannel.port2.close();
    firstPort?.close();
    replacementPort?.close();
  });
});
