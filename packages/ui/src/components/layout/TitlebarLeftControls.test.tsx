import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/useUIStore';
import { TitlebarLeftControls } from './TitlebarLeftControls';

let browser: Window;
let root: Root;
const descriptors = new Map<string, PropertyDescriptor | undefined>();

const OVERLAY_SELECTOR = 'div.app-region-no-drag.absolute.left-0.top-0';

beforeEach(() => {
  browser = new Window({ url: 'http://localhost' });
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    InputEvent: browser.InputEvent,
    MouseEvent: browser.MouseEvent,
    KeyboardEvent: browser.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await browser.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function renderControls() {
  await act(async () => root.render(
    <I18nProvider>
      <TooltipProvider>
        <TitlebarLeftControls />
      </TooltipProvider>
    </I18nProvider>,
  ));
}

describe('TitlebarLeftControls', () => {
  for (const platform of ['win32', 'linux']) {
    test(`${platform} app menu preserves input focus on mouse press`, async () => {
      const commands: string[] = [];
      const focusedAtOpen: Array<Element | null> = [];
      Object.assign(window, {
        __OPENCHAMBER_ELECTRON__: { runtime: 'electron' },
        __OPENCHAMBER_PLATFORM__: platform,
        __OPENCHAMBER_DESKTOP__: {
          invoke: async (command: string) => {
            commands.push(command);
            focusedAtOpen.push(document.activeElement);
            return null;
          },
        },
      });
      await renderControls();
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Open OhPiChamber menu"]')!;
      expect(button).not.toBeNull();
      const input = document.createElement('textarea');
      document.body.append(input);
      input.focus();

      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
      await act(async () => {
        button.dispatchEvent(press);
        button.click();
      });

      expect(press.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(commands).toContain('desktop_show_app_menu');
      expect(focusedAtOpen[commands.indexOf('desktop_show_app_menu')]).toBe(input);
    });

    test(`${platform} app menu remains focusable and accepts keyboard activation`, async () => {
      const commands: string[] = [];
      Object.assign(window, {
        __OPENCHAMBER_ELECTRON__: { runtime: 'electron' },
        __OPENCHAMBER_PLATFORM__: platform,
        __OPENCHAMBER_DESKTOP__: {
          invoke: async (command: string) => { commands.push(command); return null; },
        },
      });
      await renderControls();
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Open OhPiChamber menu"]')!;
      expect(button).not.toBeNull();
      expect(button.tabIndex).toBe(0);
      await act(async () => {
        button.focus();
        for (const key of ['Enter', ' ']) {
          const keydown = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
          expect(button.dispatchEvent(keydown)).toBe(true);
          button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
        }
      });
      expect(document.activeElement).toBe(button);
      expect(commands.filter((command) => command === 'desktop_show_app_menu')).toHaveLength(2);
    });
  }

  test('caps the overlay to the sidebar width when the sidebar is open', async () => {
    useUIStore.getState().setSidebarOpen(true);
    await renderControls();

    const overlay = document.querySelector<HTMLElement>(OVERLAY_SELECTOR);
    expect(overlay).not.toBeNull();
    expect(overlay!.style.maxWidth).toBe('var(--oc-left-sidebar-width, 100%)');
  });

  test('drops the cap when the sidebar is closed', async () => {
    useUIStore.getState().setSidebarOpen(false);
    await renderControls();

    const overlay = document.querySelector<HTMLElement>(OVERLAY_SELECTOR);
    expect(overlay).not.toBeNull();
    expect(overlay!.style.maxWidth).toBe('');
  });

  for (const open of [true, false]) test(`New session is the same icon button with the sidebar ${open ? 'open' : 'closed'}`, async () => {
    useUIStore.getState().setSidebarOpen(open);
    await renderControls();

    const button = document.querySelector<HTMLButtonElement>('button[aria-label="New session"]');
    expect(button).not.toBeNull();
    expect(button!.textContent?.trim()).toBe('');
    expect(button!.classList.contains('shrink-0')).toBe(true);
    expect(button!.querySelector('use')?.getAttribute('href')).toBe('#oc-edit-box');
  });
});