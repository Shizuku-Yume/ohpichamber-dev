import { act } from 'react';
import { GUEST_BOOTSTRAP_API_VERSION, GUEST_BOOTSTRAP_CHANNEL, OPENCHAMBER_SDK_API_VERSION, OPENCHAMBER_SDK_CHANNEL, type GuestMessage, type HostMessage } from 'ohpichamber-sdk';
import { hostMessageSchema } from 'ohpichamber-sdk/schemas';

export async function connectPluginPaneFixture(frame: HTMLIFrameElement) {
  const bootstrap = new MessageChannel();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connected = new Promise<MessagePort>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Guest bootstrap did not return a port')), 1000);
    bootstrap.port1.onmessage = (event) => {
      const port = event.ports[0];
      if (port) resolve(port);
      else reject(new Error('Guest bootstrap returned no port'));
    };
  });
  let port: MessagePort;
  try {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: GUEST_BOOTSTRAP_CHANNEL, v: GUEST_BOOTSTRAP_API_VERSION, type: 'bootstrap' },
      ports: [bootstrap.port2],
    }));
    port = await connected;
  } finally {
    clearTimeout(timer);
    bootstrap.port1.close();
    bootstrap.port2.close();
  }
  const received: HostMessage[] = [];
  port.addEventListener('message', (event) => { received.push(hostMessageSchema.parse(event.data)); });
  port.start();
  const send = async (message: GuestMessage) => {
    await act(async () => {
      port.postMessage(message);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };
  await send({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'hello' });
  return { received, send, close: () => port.close() };
}
