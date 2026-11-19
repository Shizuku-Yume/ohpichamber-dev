import { isDesktopShell } from '@/lib/desktop';

<<<<<<< HEAD
||||||| bc50ba56aa
/** True on Linux, where Chromium middle-click pastes the PRIMARY selection. */
export const isLinuxPlatform = (): boolean => navigator.platform.toLowerCase().startsWith('linux');

/** True when running inside the native Capacitor shell (iOS/Android app), not the web/PWA. */
=======
export const isLinuxPlatform = (): boolean => navigator.platform.toLowerCase().startsWith('linux');

>>>>>>> upstream/main
export const isCapacitorApp = (): boolean => {
 if (typeof window === 'undefined') return false;
 const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
 return capacitor?.isNativePlatform?.() === true || window.location.protocol === 'capacitor:';
};

export const canKeepScreenAwake = (): boolean => (
  isCapacitorApp() && (getClientPlatform() === 'ios' || 'wakeLock' in navigator)
);

export const isIPadApp = (): boolean => {
 if (typeof window === 'undefined' || !isCapacitorApp()) return false;
 return getClientPlatform() === 'ios' && isIPadDevice();
};

export const isIPadDevice = (): boolean => {
 if (typeof navigator === 'undefined') return false;
 const userAgent = navigator.userAgent || '';
 const maxTouchPoints = navigator.maxTouchPoints ?? 0;
 return /iPad/i.test(userAgent)
  || (/Macintosh|MacIntel/i.test(userAgent) && maxTouchPoints > 1);
};

type ClientPlatform = 'ios' | 'android' | 'desktop' | 'web';

export const getClientPlatform = (): ClientPlatform => {
 if (typeof window !== 'undefined') {
  const capacitor = (window as typeof window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const native = capacitor?.getPlatform?.();
  if (native === 'ios' || native === 'android') return native;
 }
 if (isDesktopShell()) return 'desktop';
 return 'web';
};
