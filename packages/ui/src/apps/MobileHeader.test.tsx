import React, { act } from 'react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

mock.module('@/components/icon/Icon', () => ({ Icon: () => null }));
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
mock.module('@/lib/multirun/useMultiRuns', () => ({ useMultiRunTitle: () => null }));
mock.module('@/stores/useDirectoryStore', () => ({ useDirectoryStore: () => null }));
mock.module('@/stores/useUIStore', () => ({ useUIStore: () => null }));
mock.module('@/stores/useGitStore', () => ({ useGitStore: () => false, useIsGitRepo: () => false }));
mock.module('@/sync/session-ui-store', () => ({ useSessionUIStore: () => null }));
mock.module('@/sync/sync-context', () => ({ useSession: () => null }));
mock.module('@/stores/useGlobalSessionsStore', () => ({ useGlobalSessionsStore: () => undefined }));
mock.module('./MobileSessionMetadata', () => ({ MobileSessionMetadataButton: () => null }));
mock.module('./MobileSessionSwitcher', () => ({ MobileSessionSwitcher: () => null }));

import { MobileHeader } from './MobileHeader';

let root: Root;
let host: HTMLElement;
let restoreGlobals: () => void;

beforeEach(() => {
  const dom = new Window();
  const globals = { window: dom, document: dom.document, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  Object.assign(globalThis, globals);
  restoreGlobals = () => {
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  restoreGlobals();
});

test.each(['mobile.sessions.openSheetAria', 'mobile.header.openWorkspaceAria'])(
  'a tap without browser button focus records the %s opener before opening', (label) => {
    let focusedWhenOpened: Element | null = null;
    const onOpen = () => { focusedWhenOpened = document.activeElement; };
    act(() => root.render(<MobileHeader onOpenSessions={onOpen} onOpenWorkspace={onOpen} />));
    const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    expect(document.activeElement).toBe(document.body);
    // Programmatic click has no default focus, matching WebKit's tapped buttons.
    act(() => button.click());
    expect(focusedWhenOpened === button).toBe(true);
  },
);
