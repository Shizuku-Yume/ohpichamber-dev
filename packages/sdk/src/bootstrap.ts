/**
 * The document-local transport used to authenticate the current sandboxed guest
 * document before the host hands it the SDK port.
 *
 * The first port stays inside this bootstrap closure. The host receives the
 * other end once, then sends the normal SDK port back over it. Guest code only
 * sees the internal event consumed by `connectHost`.
 */
export const GUEST_BOOTSTRAP_CHANNEL = 'openchamber.guest-bootstrap';
export const GUEST_BOOTSTRAP_API_VERSION = 1;
export const GUEST_BOOTSTRAP_EVENT = 'openchamber:guest-bootstrap';
const bootstrap = (channelName: string, apiVersion: number, eventName: string): void => {
  const hostWindow = globalThis.window;
  const Channel = globalThis.MessageChannel;
  if (!hostWindow || !Channel) return;
  try {
    const channel = new Channel();
    const privatePort = channel.port1;
    let closed = false;
    let hostReady = false;
    let pendingSdkPort: MessagePort | null = null;
    const closePort = (port: MessagePort): void => {
      try { port.close(); } catch { /* fail closed */ }
    };
    const fail = (ports: readonly MessagePort[] = []): void => {
      for (const port of ports) closePort(port);
      if (!closed) {
        closed = true;
        closePort(privatePort);
      }
    };
    const deliverSdkPort = (sdkPort: MessagePort): void => {
      const event = new CustomEvent(eventName, { detail: sdkPort, cancelable: true });
      if (!hostWindow.dispatchEvent(event)) return;
      closePort(sdkPort);
      closed = true;
    };
    hostWindow.addEventListener(eventName, (event: Event) => {
      if (!('detail' in event) || event.detail !== null) return;
      hostReady = true;
      if (pendingSdkPort) {
        const sdkPort = pendingSdkPort;
        pendingSdkPort = null;
        deliverSdkPort(sdkPort);
      }
    });
    privatePort.addEventListener('message', (event: MessageEvent) => {
      if (closed) return;
      const data = event.data;
      const ports = event.ports ?? [];
      if (!data || data.channel !== channelName || data.v !== apiVersion
        || data.type !== 'connect-port' || ports.length !== 1) {
        fail(ports);
        return;
      }
      const sdkPort = ports[0];
      closed = true;
      closePort(privatePort);
      sdkPort.start();
      if (!hostReady) {
        pendingSdkPort = sdkPort;
        return;
      }
      deliverSdkPort(sdkPort);
    });
    privatePort.start();
    hostWindow.parent.postMessage({
      channel: channelName,
      v: apiVersion,
      type: 'bootstrap',
    }, '*', [channel.port2]);
  } catch {
    // A document without MessageChannel or a usable parent cannot receive host capabilities.
  }
};

/** Inline form inserted before authored Guest scripts. */
export const GUEST_BOOTSTRAP_SCRIPT = `(${bootstrap.toString()})(${JSON.stringify(GUEST_BOOTSTRAP_CHANNEL)}, ${GUEST_BOOTSTRAP_API_VERSION}, ${JSON.stringify(GUEST_BOOTSTRAP_EVENT)});`;
