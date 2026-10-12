import type { HostFrame } from './host.ts';
import type { GuestMessage, HostMessage } from './contract.ts';

export type TestParent = HostFrame['parent'] & {
  readonly messages: GuestMessage[];
  readonly windowMessages: GuestMessage[];
  readonly source: MessagePort;
  attachPort: (port: MessagePort) => void;
};

export type MessageChannelConnection = {
  readonly guestPort: MessagePort;
  readonly parentPort: MessagePort;
  close: () => void;
};

export type MessageChannelFrame = HostFrame & {
  parent: TestParent;
  readonly posted: GuestMessage[];
  readonly windowPosted: GuestMessage[];
  connect: (source?: MessageEventSource | null) => MessageChannelConnection;
  receive: (message: HostMessage) => Promise<void>;
  receiveOn: (connection: MessageChannelConnection, message: HostMessage) => Promise<void>;
  dispatch: (event: Event) => void;
  dispatchWindow: (event: Event) => void;
  flush: () => Promise<void>;
};

const flush = (): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

export const createMessageChannelFrame = (): MessageChannelFrame => {
  const target = new EventTarget();
  const messages: GuestMessage[] = [];
  const windowMessages: GuestMessage[] = [];
  const sourceChannel = new MessageChannel();
  const source = sourceChannel.port1;
  sourceChannel.port2.close();
  let activeConnection: MessageChannelConnection | null = null;

  const parent: TestParent = {
    messages,
    windowMessages,
    source,
    postMessage: (message) => {
      windowMessages.push(message);
    },
    attachPort: (port) => {
      port.onmessage = (event) => { messages.push(event.data); };
      port.start();
    },
  };

  const frame: MessageChannelFrame = {
    parent,
    posted: messages,
    windowPosted: windowMessages,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => target.addEventListener(type, listener, options),
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => target.removeEventListener(type, listener, options),
    dispatch: (event) => { target.dispatchEvent(event); },
    dispatchWindow: (event) => { target.dispatchEvent(event); },
    connect: (connectionSource = null) => {
      const channel = new MessageChannel();
      const connection: MessageChannelConnection = {
        guestPort: channel.port1,
        parentPort: channel.port2,
        close: () => {
          channel.port1.close();
          channel.port2.close();
        },
      };
      frame.parent.attachPort(connection.parentPort);
      activeConnection = connection;
      const event = new CustomEvent('openchamber:guest-bootstrap', { detail: connection.guestPort });
      Object.defineProperty(event, 'source', { value: connectionSource });
      target.dispatchEvent(event);
      return connection;
    },
    receive: async (message) => {
      if (!activeConnection) throw new Error('No connected message port.');
      activeConnection.parentPort.postMessage(message);
      await flush();
    },
    receiveOn: async (connection, message) => {
      connection.parentPort.postMessage(message);
      await flush();
    },
    flush,
  };

  return frame;
};
