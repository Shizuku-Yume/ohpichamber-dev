import {
  HostRequestError,
  OPENCHAMBER_SDK_API_VERSION,
  OPENCHAMBER_SDK_CHANNEL,
  type GuestMicrophoneEndReason,
} from 'ohpichamber-sdk';

import { guestMay } from '@/lib/guests/capabilities';
import type { InstalledGuest } from '@/lib/guests/types';
import {
  canCaptureGuestMicrophone,
  markGuestListening,
  startGuestMicrophone,
  type GuestMicrophoneCapture,
} from '@/lib/guests/microphone';

const NOT_GRANTED_MESSAGE = 'The user has not allowed this capability for the extension.';

type MicrophoneSessionDeps = {
  headless: boolean;
  isDisposed: () => boolean;
  currentGuest: () => InstalledGuest | null;
  currentPort: () => MessagePort | null;
  guestId: () => string;
  postToGuest: (message: {
    channel: typeof OPENCHAMBER_SDK_CHANNEL;
    v: typeof OPENCHAMBER_SDK_API_VERSION;
    type: 'microphone-ended';
    payload: { reason: GuestMicrophoneEndReason };
  }) => void;
};

/**
 * One frame's microphone session: at most one capture, retired together with
 * the document, port or grant that owns it. The ticket invalidates callbacks
 * of a closing capture so a reopening guest never receives its trailing audio.
 */
export const createGuestMicrophoneSession = (deps: MicrophoneSessionDeps) => {
  let ticket = 0;
  let opening = false;
  let capture: GuestMicrophoneCapture | null = null;
  let releaseListening: (() => void) | null = null;

  const stop = () => {
    ticket += 1;
    opening = false;
    capture?.stop();
    capture = null;
    releaseListening?.();
    releaseListening = null;
  };

  const open = async (sampleRate: number, messagePort: MessagePort): Promise<void> => {
    if (!guestMay(deps.currentGuest(), 'microphone')) throw new HostRequestError('NOT_GRANTED', NOT_GRANTED_MESSAGE);
    if (deps.headless) throw new HostRequestError('UNSUPPORTED', 'A hidden frame cannot open the microphone.');
    if (!canCaptureGuestMicrophone()) throw new HostRequestError('UNSUPPORTED', 'This app cannot capture the microphone.');
    if (capture || opening) throw new HostRequestError('HOST_REJECTED', 'The microphone is already open in this frame.');
    ticket += 1;
    const ownTicket = ticket;
    opening = true;
    const ownerPort = messagePort;
    const mayHear = () => ownTicket === ticket && !deps.isDisposed() && deps.currentPort() === ownerPort
      && guestMay(deps.currentGuest(), 'microphone');
    const end = (reason: GuestMicrophoneEndReason) => {
      stop();
      if (deps.currentPort() === ownerPort) deps.postToGuest({
        channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION,
        type: 'microphone-ended', payload: { reason },
      });
    };
    let started: GuestMicrophoneCapture;
    try {
      started = await startGuestMicrophone({
        sampleRate,
        onSamples: (samples) => {
          if (ownTicket !== ticket) return;
          if (!mayHear()) { end('revoked'); return; }
          if (deps.currentPort() === ownerPort) ownerPort.postMessage({
            channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION,
            type: 'microphone-audio', payload: { samples },
          });
        },
        onDeviceLost: () => { if (ownTicket === ticket) end('device-lost'); },
      });
    } finally {
      if (ownTicket === ticket) opening = false;
    }
    if (!mayHear()) {
      started.stop();
      throw new HostRequestError('DISCONNECTED', 'The microphone closed while it was opening.');
    }
    capture = started;
    releaseListening = markGuestListening(deps.guestId());
  };

  const close = () => {
    stop();
  };

  return { open, close, stop };
};
