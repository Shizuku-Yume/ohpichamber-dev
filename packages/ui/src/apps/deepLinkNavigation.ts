import React from 'react';
import { Capacitor } from '@capacitor/core';

import { isCapacitorApp } from '@/lib/platform';
<<<<<<< HEAD
import type { PairingConnectionPayload } from '@/lib/connectionPayload';
||||||| bc50ba56aa
import { subscribeToNativeShortcutRequests } from '@/lib/nativeShortcutRequests';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useInputStore } from '@/sync/input-store';
=======
import { subscribeToNativeShortcutRequests } from '@/lib/nativeShortcutRequests';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { QuotaProviderId } from '@/types';
import { useInputStore } from '@/sync/input-store';
>>>>>>> upstream/main
import { useSessionUIStore } from '@/sync/session-ui-store';
import { openSession } from '@/lib/router/openSessionFromRoute';

import { parseDeepLink, type DeepLinkIntent, type SessionsFilter, type ViewTarget } from './deepLinks';


interface DeepLinkHandlers {
  openSessions?: (filter?: SessionsFilter) => void;
  openView?: (target: ViewTarget) => void;
  openChanges?: (options?: { path?: string; staged?: boolean }) => void;
  openSettings?: (section?: string) => void;
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * A new session asked for by the iOS Shortcuts app or Siri (see nativeShortcutRequests).
 * Unlike a deep link it may carry a first message to send, which is why it never comes
 * from a URL.
 */
type ShortcutNewSessionIntent = { type: 'shortcut-new-session'; projectId?: string; text?: string };

type NavigationIntent = DeepLinkIntent | ShortcutNewSessionIntent;

=======
type ShortcutNewSessionIntent = { type: 'shortcut-new-session'; projectId?: string; text?: string };

type NavigationIntent = DeepLinkIntent | ShortcutNewSessionIntent;

>>>>>>> upstream/main
let handlers: DeepLinkHandlers = {};
let ready = false;
type NavigationIntent = Exclude<DeepLinkIntent, { type: 'pairing' }>;
let pending: NavigationIntent | null = null;
let launchUrlConsumed = false;

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Opens a draft in the requested project, or where the user last was when none is named,
 * and leaves the message for the draft's composer to send. A project the app no longer
 * knows (the Shortcuts picker lists the projects of the last time the app was open) opens
 * the default draft with the message added to its composer, unsent: the user picks the place.
 */
const openShortcutSession = (intent: ShortcutNewSessionIntent): void => {
  const store = useSessionUIStore.getState();
  const project = intent.projectId
    ? useProjectsStore.getState().projects.find((entry) => entry.id === intent.projectId) ?? null
    : null;
  store.openNewSessionDraft(project ? { selectedProjectId: project.id } : undefined);
  const text = intent.text?.trim();
  if (!text) return;
  if (intent.projectId && !project) {
    useInputStore.getState().setPendingInputText(text, 'append');
    return;
  }
  useInputStore.getState().requestDraftSubmit(useSessionUIStore.getState().newSessionDraft.draftId, text);
};

=======
const openShortcutSession = (intent: ShortcutNewSessionIntent): void => {
  const store = useSessionUIStore.getState();
  const project = intent.projectId
    ? useProjectsStore.getState().projects.find((entry) => entry.id === intent.projectId) ?? null
    : null;
  store.openNewSessionDraft(project ? { selectedProjectId: project.id } : undefined);
  const text = intent.text?.trim();
  if (!text) return;
  if (intent.projectId && !project) {
    useInputStore.getState().setPendingInputText(text, 'append');
    return;
  }
  useInputStore.getState().requestDraftSubmit(useSessionUIStore.getState().newSessionDraft.draftId, text);
};

>>>>>>> upstream/main
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
        // SAFETY: parseDeepLink admits only well-formed provider ids, and the widgets send ids
        // taken from the quota store's own results.
        useQuotaStore.getState().setSelectedProvider(intent.providerId as QuotaProviderId);
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

<<<<<<< HEAD
/** Convenience: parse a raw `ohpichamber://…` URL and apply it. No-op for unrecognised URLs. */
const applyDeepLinkUrl = (raw: string | null | undefined, onPairing?: (payload: PairingConnectionPayload) => void): void => {
||||||| bc50ba56aa
/** Convenience: parse a raw `openchamber://…` URL and apply it. No-op for unrecognised URLs. */
const applyDeepLinkUrl = (raw: string | null | undefined): void => {
=======
const applyDeepLinkUrl = (raw: string | null | undefined): void => {
>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * Single native entry point for deep links. Subscribes to both the custom URL scheme
 * (`App.appUrlOpen` — widgets, Live Activities, external links) and notification taps
 * (`pushNotificationActionPerformed`), normalising each into a {@link DeepLinkIntent}.
 * Both listeners are registered UNCONDITIONALLY so a cold-launch tap/open isn't lost while
 * the app is still connecting; intents stash until `ready` (connected + initialized).
 */
export const useDeepLinkSource = ({ ready: isReady, onPairing }: {
  ready: boolean;
  onPairing?: (payload: PairingConnectionPayload) => void;
}): void => {
  const onPairingRef = React.useRef(onPairing);
  React.useEffect(() => {
    onPairingRef.current = onPairing;
  }, [onPairing]);
||||||| bc50ba56aa
/**
 * Single native entry point for deep links. Subscribes to the custom URL scheme
 * (`App.appUrlOpen` — widgets, Live Activities, external links), notification taps
 * (`pushNotificationActionPerformed`) and iOS Shortcuts requests, normalising each into an
 * intent. The listeners are registered UNCONDITIONALLY so a cold-launch tap/open isn't lost
 * while the app is still connecting; intents stash until `ready` (connected + initialized).
 */
export const useDeepLinkSource = (options: { ready: boolean }): void => {
  const { ready: isReady } = options;
=======
export const useDeepLinkSource = (options: { ready: boolean }): void => {
  const { ready: isReady } = options;
>>>>>>> upstream/main

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
<<<<<<< HEAD
        const launch = await App.getLaunchUrl();
        if (!disposed && !receivedAppUrl) {
          const intent = parseDeepLink(launch?.url);
          if (intent?.type === 'pairing') onPairingRef.current?.(intent.payload);
        }
||||||| bc50ba56aa
=======
        // external: https://capacitorjs.com/docs/apis/app#getlaunchurl Android cold-launch URLs require getLaunchUrl and are consumed once per process.
        if (!launchUrlConsumed && Capacitor.getPlatform() === 'android') {
          launchUrlConsumed = true;
          const initial = await App.getLaunchUrl().catch(() => null);
          if (!disposed && initial?.url) applyDeepLinkUrl(initial.url);
        }
>>>>>>> upstream/main
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
