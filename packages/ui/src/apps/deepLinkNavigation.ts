import React from 'react';

import { isCapacitorApp } from '@/lib/platform';
import type { PairingConnectionPayload } from '@/lib/connectionPayload';
import { useUsageStatsStore } from '@/components/views/usage/usageStatsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { openSession } from '@/lib/router/openSessionFromRoute';

import { parseDeepLink, type DeepLinkIntent, type SessionsFilter, type ViewTarget } from './deepLinks';


interface DeepLinkHandlers {
  openSessions?: (filter?: SessionsFilter) => void;
  openView?: (target: ViewTarget) => void;
  openChanges?: (options?: { path?: string; staged?: boolean }) => void;
  openSettings?: (section?: string) => void;
}

let handlers: DeepLinkHandlers = {};
let ready = false;
type NavigationIntent = Exclude<DeepLinkIntent, { type: 'pairing' }>;
let pending: NavigationIntent | null = null;

const execute = (intent: NavigationIntent): boolean => {
  switch (intent.type) {
    case 'session':
      void openSession(intent.sessionId, { directory: intent.directory ?? null, messageId: intent.messageId ?? null });
      return true;

    case 'new-session': {
      const store = useSessionUIStore.getState();
      store.openNewSessionDraft();
      if (intent.directory || intent.projectId) {
        store.setNewSessionDraftTarget({
          directoryOverride: intent.directory ?? null,
          projectId: intent.projectId ?? null,
          selectedProjectId: intent.projectId ?? null,
        });
      }
      return true;
    }

    case 'sessions':
      if (!handlers.openSessions) return false;
      handlers.openSessions(intent.filter);
      return true;

    case 'status':
      if (!handlers.openSessions) return false;
      handlers.openSessions();
      return true;


    case 'view':
      if (!handlers.openView) return false;
      handlers.openView(intent.target);
      return true;

    case 'changes':
      if (!handlers.openChanges) return false;
      handlers.openChanges({ path: intent.path, staged: intent.staged });
      return true;

    case 'settings':
      if (!handlers.openSettings) return false;
      if (intent.section === 'usage' && intent.providerId) {
        useUsageStatsStore.getState().setSelectedProvider(intent.providerId);
      }
      handlers.openSettings(intent.section);
      return true;
  }
};

const flush = (): void => {
  if (!ready || !pending) return;
  const intent = pending;
  pending = null;
  if (!execute(intent)) {
    pending = intent;
  }
};

const applyDeepLinkIntent = (intent: NavigationIntent): void => {
  pending = intent;
  flush();
};

const applyDeepLinkUrl = (raw: string | null | undefined, onPairing?: (payload: PairingConnectionPayload) => void): void => {
  const intent = parseDeepLink(raw);
  if (intent?.type === 'pairing') {
    onPairing?.(intent.payload);
  } else if (intent) {
    applyDeepLinkIntent(intent);
  }
};

const setReady = (value: boolean): void => {
  ready = value;
  flush();
};

export const useDeepLinkHandlers = (next: DeepLinkHandlers): void => {
  React.useEffect(() => {
    handlers = next;
    flush();
    return () => {
      if (handlers === next) {
        handlers = {};
      }
    };
  }, [next]);
};

export const useDeepLinkSource = ({ ready: isReady, onPairing }: {
  ready: boolean;
  onPairing?: (payload: PairingConnectionPayload) => void;
}): void => {
  const onPairingRef = React.useRef(onPairing);
  React.useEffect(() => {
    onPairingRef.current = onPairing;
  }, [onPairing]);

  React.useEffect(() => {
    setReady(isReady);
  }, [isReady]);

  React.useEffect(() => {
    if (!isCapacitorApp()) return;
    let disposed = false;
    let receivedAppUrl = false;
    const cleanup: Array<() => void> = [];

    void import('@capacitor/app')
      .then(async ({ App }) => {
        if (disposed) return;
        const handle = await App.addListener('appUrlOpen', (event) => {
          if (disposed) return;
          receivedAppUrl = true;
          applyDeepLinkUrl(event?.url, onPairingRef.current);
        });
        if (disposed) {
          void handle.remove();
          return;
        }
        cleanup.push(() => void handle.remove());
        const launch = await App.getLaunchUrl();
        if (!disposed && !receivedAppUrl) {
          const intent = parseDeepLink(launch?.url);
          if (intent?.type === 'pairing') onPairingRef.current?.(intent.payload);
        }
      })
      .catch(() => undefined);

    void import('@capacitor/push-notifications')
      .then(async ({ PushNotifications }) => {
        if (disposed) return;
        const handle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action?.notification?.data as Record<string, unknown> | undefined;
          const url = typeof data?.url === 'string' ? data.url : typeof data?.deeplink === 'string' ? data.deeplink : undefined;
          if (url) {
            applyDeepLinkUrl(url);
            return;
          }
          const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : undefined;
          if (sessionId) {
            applyDeepLinkIntent({ type: 'session', sessionId });
          }
        });
        if (disposed) {
          void handle.remove();
          return;
        }
        cleanup.push(() => void handle.remove());
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      cleanup.forEach((remove) => remove());
    };
  }, []);
};
