import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { z } from 'zod';

import { I18nProvider } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n/store';
import { buildSettingsSearchResults } from '@/lib/settings/search';
import { useUIStore } from '@/stores/useUIStore';
import * as device from '@/lib/device';

import { ChatSettings } from './ChatSettings';
import { chatSettingsTabForSearchTarget, useChatSettingsTabStore } from './chatSettingsTabs';

const runtimeCtx = {
  isVSCode: false,
  isWeb: true,
  isDesktop: false,
  isMobile: false,
  isDesktopLocalOrigin: false,
  isMac: false,
  isWindows: false,
  isLinux: false,
  routingAvailable: false,
  enterpriseMode: false,
  jevBlockedByEnterprise: false,
};

describe('ChatSettings', () => {
  let windowInstance: Window;
  let host: HTMLDivElement;
  let root: Root;
  let initialLargeTextPasteBehavior: ReturnType<typeof useUIStore.getState>['largeTextPasteBehavior'];
  let initialSelectionApprovalText: string;
  let globalDescriptors: Map<string, PropertyDescriptor | undefined>;

  // The tab strip measures itself, so it needs ResizeObserver too.
  const globalNames = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'ResizeObserver', 'localStorage', 'sessionStorage', 'IS_REACT_ACT_ENVIRONMENT'];

  beforeEach(async () => {
    windowInstance = new Window();
    initialLargeTextPasteBehavior = useUIStore.getState().largeTextPasteBehavior;
    initialSelectionApprovalText = useUIStore.getState().selectionApprovalText;
    globalDescriptors = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      Event: windowInstance.Event,
      CustomEvent: windowInstance.CustomEvent,
      ResizeObserver: windowInstance.ResizeObserver,
      localStorage: windowInstance.localStorage,
      sessionStorage: windowInstance.sessionStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    host = document.createElement('div');
    document.body.append(host);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(host);
  });

  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      useUIStore.setState({ largeTextPasteBehavior: initialLargeTextPasteBehavior, selectionApprovalText: initialSelectionApprovalText });
      useChatSettingsTabStore.setState({ tab: 'messages' });
      windowInstance.close();
      for (const [name, descriptor] of globalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  test('mobile Return-to-send is reachable and updates the existing preference', async () => {
    const previous = useUIStore.getState().mobileReturnKeySends;
    const mobile = spyOn(device, 'useDeviceInfo').mockReturnValue({ isMobile: true } as ReturnType<typeof device.useDeviceInfo>);
    try {
      useUIStore.setState({ mobileReturnKeySends: false });
      useChatSettingsTabStore.setState({ tab: 'composer' });
      await act(async () => root.render(<I18nProvider><ChatSettings /></I18nProvider>));
      const anchor = host.querySelector('[data-settings-item="chat.mobile-return-key-sends"]');
      expect(anchor).not.toBeNull();
      const checkbox = anchor?.querySelector('button[role="checkbox"]') ?? anchor?.querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      await act(async () => (checkbox as HTMLElement).click());
      expect(useUIStore.getState().mobileReturnKeySends).toBe(true);
    } finally {
      await act(async () => root.unmount());
      mobile.mockRestore();
      useUIStore.setState({ mobileReturnKeySends: previous });
    }
  });

  test('the large-paste radios on the Composer tab select the fourth persisted choice', async () => {
    useChatSettingsTabStore.setState({ tab: 'composer' });
    await act(async () => root.render(
      <I18nProvider>
        <ChatSettings />
      </I18nProvider>,
    ));
    const group = host.querySelector('[data-settings-item="chat.large-text-paste"]');
    expect(group).not.toBeNull();
    const radios = group?.querySelectorAll<HTMLElement>('[role="radio"]');
    expect(radios?.length).toBe(4);
    const fourth = radios?.[3];
    if (!fourth) throw new Error('Missing fourth paste choice');
    expect(fourth.getAttribute('aria-label')).toBe('Large text paste: Paste inline, double-paste to attach');
    await act(async () => fourth.click());
    expect(useUIStore.getState().largeTextPasteBehavior).toBe('inline-double-paste');
    expect(fourth.getAttribute('aria-checked')).toBe('true');
  });

  test('the Questions chips on the Composer tab switch questions into the chat and the choice persists', async () => {
    useChatSettingsTabStore.setState({ tab: 'composer' });
    useUIStore.setState({ questionsInChat: false });
    try {
      await act(async () => root.render(<I18nProvider><ChatSettings /></I18nProvider>));
      const row = host.querySelector('[data-settings-item="chat.questions-placement"]');
      if (!row) throw new Error('Missing questions row');
      const chip = (label: string) => [...row.querySelectorAll<HTMLElement>('button, [role="radio"]')].find((item) => item.textContent?.trim() === label);
      const inChat = chip('In the chat');
      if (!inChat) throw new Error('Missing "In the chat" chip');
      await act(async () => inChat.click());
      expect(useUIStore.getState().questionsInChat).toBe(true);
      const partialize = useUIStore.persist.getOptions().partialize;
      if (!partialize) throw new Error('Missing persisted slice');
      expect(z.object({ questionsInChat: z.boolean() }).parse(partialize(useUIStore.getState())).questionsInChat).toBe(true);
      const popup = chip('Pop-up');
      if (!popup) throw new Error('Missing "Pop-up" chip');
      await act(async () => popup.click());
      expect(useUIStore.getState().questionsInChat).toBe(false);
    } finally {
      useUIStore.setState({ questionsInChat: false });
    }
  });

  test('search reaches the approval text field and edits or clears its value', async () => {
    const t = (key: I18nKey): string => key;
    const result = buildSettingsSearchResults({ query: 'lgtm', runtimeCtx, t, getPageTitle: (page) => `${page}-page` })
      .find((item) => item.id === 'chat.selection-approval-text');
    expect(result?.page).toBe('chat');
    expect(chatSettingsTabForSearchTarget('chat.selection-approval-text')).toBe('messages');
    useChatSettingsTabStore.setState({ tab: 'messages' });
    useUIStore.setState({ selectionApprovalText: 'Existing feedback' });
    await act(async () => root.render(<I18nProvider><ChatSettings /></I18nProvider>));

    const field = host.querySelector<HTMLInputElement>('[data-settings-item="chat.selection-approval-text"] input');
    if (!field) throw new Error('Missing selection approval field');
    expect(field.value).toBe('Existing feedback');
    expect(field.placeholder).toBe('Sounds good');
    const setValue = Object.getOwnPropertyDescriptor(windowInstance.HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('Missing input value setter');
    for (const value of ['Ship this', '']) {
      await act(async () => {
        setValue.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(useUIStore.getState().selectionApprovalText).toBe(value);
      expect(field.value).toBe(value);
    }
  });
});
