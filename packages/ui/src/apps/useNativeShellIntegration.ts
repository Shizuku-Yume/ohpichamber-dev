import type { PairingConnectionPayload } from '@/lib/connectionPayload';
import { useKeepScreenAwake } from '@/hooks/useKeepScreenAwake';

import { useDeepLinkSource } from './deepLinkNavigation';
import { useNativePushRegistration } from './useNativePushRegistration';
import { useNativeWidgetSync } from './useNativeWidgetSync';

/**
 * The native shell's platform bridges: push registration, screen awake,
 * widgets, and the single deep-link entry point for notification taps and the
 * ohpichamber:// URL scheme (widgets, Live Activities, external links). The
 * deep-link source registers unconditionally so a cold-launch tap or open is
 * not lost on the connect/splash screen; intents stash until the app is ready
 * (connected + initialized) and shell handlers are registered.
 */
export const useNativeShellIntegration = ({ native, connected, initialized, onPairing }: {
  native: boolean;
  connected: boolean;
  initialized: boolean;
  onPairing?: (payload: PairingConnectionPayload | null) => void;
}): void => {
  useNativePushRegistration({ enabled: native && connected });
  useKeepScreenAwake(connected);
  useNativeWidgetSync({ enabled: native && connected && initialized });
  useDeepLinkSource({ ready: native && connected && initialized, onPairing });
};
