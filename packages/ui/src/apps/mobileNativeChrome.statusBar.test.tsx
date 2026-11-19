import React, { act } from 'react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';

let layout: { edgeToEdge: boolean; statusBarStyle?: 'LIGHT' | 'DARK' | 'DEFAULT' };
let platform = 'android';
let native = true;
let onSystemAppearance: (() => void) | null = null;
let onAppState: ((state: { isActive: boolean }) => void) | null = null;
const getLayout = mock(async () => layout);
const setStyle = mock(async (_options: { style: string }) => {});
const setBackgroundColor = mock(async (_options: { color: string }) => {});
const setOverlaysWebView = mock(async (_options: { overlay: boolean }) => {});
const show = mock(async () => {});

mock.module('@capacitor/core', () => ({ registerPlugin: () => ({ get: getLayout }) }));
mock.module('@capacitor/status-bar', () => ({
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
  StatusBar: { setStyle, setBackgroundColor, setOverlaysWebView, show },
}));
mock.module('@capacitor/keyboard', () => ({
  Keyboard: { addListener: async () => ({ remove: async () => {} }) },
}));
mock.module('@capacitor/app', () => ({
  App: {
    addListener: async (_event: string, callback: NonNullable<typeof onAppState>) => {
      onAppState = callback;
      return { remove: async () => { onAppState = null; } };
    },
  },
}));

const { createRoot } = await import('react-dom/client');
const { useNativeMobileChrome } = await import('./mobileNativeChrome');
const Chrome = () => { useNativeMobileChrome(); return null; };
let dom: Window;
let root: Root;
let host: HTMLElement;
const globalNames = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'CustomEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'] as const;
let originals: Map<string, PropertyDescriptor | undefined>;

beforeEach(() => {
  layout = { edgeToEdge: true, statusBarStyle: 'LIGHT' };
  platform = 'android';
  native = true;
  onSystemAppearance = null;
  onAppState = null;
  for (const fn of [getLayout, setStyle, setBackgroundColor, setOverlaysWebView, show]) fn.mockClear();
  getLayout.mockImplementation(async () => layout);
  setOverlaysWebView.mockImplementation(async () => {});
  dom = new Window({ url: 'https://localhost/mobile.html' });
  originals = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom, document: dom.document, HTMLElement: dom.HTMLElement, Element: dom.Element,
    Node: dom.Node, MutationObserver: dom.MutationObserver, CustomEvent: dom.CustomEvent,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), localStorage: dom.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom, { Capacitor: { isNativePlatform: () => native, getPlatform: () => platform } });
  Object.defineProperty(dom, 'matchMedia', { value: () => ({
    addEventListener: (_event: string, callback: () => void) => { onSystemAppearance = callback; },
    removeEventListener: () => { onSystemAppearance = null; },
  }) });
  localStorage.setItem('splashBgDark', '#120f0e');
  localStorage.setItem('splashBgLight', '#fffdf4');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const settle = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
};
const mount = async (dark: boolean) => {
  document.documentElement.classList.toggle('dark', dark);
  await act(async () => root.render(<Chrome />));
  await settle();
};
const lastStyle = () => setStyle.mock.calls.at(-1)?.[0].style;

test('Android native light background keeps dark icons when the app is dark', async () => {
  await mount(true);
  expect(lastStyle()).toBe('LIGHT');
  expect(setBackgroundColor).not.toHaveBeenCalled();
  expect(document.documentElement.classList.contains('oc-android-below-status-bar')).toBe(false);
});

test('Android native dark background keeps light icons when the app is light', async () => {
  layout.statusBarStyle = 'DARK';
  await mount(false);
  expect(lastStyle()).toBe('DARK');
  expect(setBackgroundColor).not.toHaveBeenCalled();
});

test('edge-to-edge WebView backgrounds follow the app theme in both directions', async () => {
  layout = { edgeToEdge: true };
  await mount(true);
  expect(lastStyle()).toBe('DARK');
  await act(async () => { document.documentElement.classList.remove('dark'); });
  await settle();
  expect(lastStyle()).toBe('LIGHT');
  expect(setBackgroundColor).not.toHaveBeenCalled();
});

test('legacy Android still paints its status bar and follows the app theme', async () => {
  layout = { edgeToEdge: false };
  await mount(true);
  expect(lastStyle()).toBe('DARK');
  expect(setBackgroundColor).toHaveBeenLastCalledWith({ color: '#120f0e' });
  expect(document.documentElement.classList.contains('oc-android-below-status-bar')).toBe(true);
  await act(async () => { document.documentElement.classList.remove('dark'); });
  await settle();
  expect(lastStyle()).toBe('LIGHT');
  expect(setBackgroundColor).toHaveBeenLastCalledWith({ color: '#fffdf4' });
});

test('system appearance and resume re-read the native background with a fixed app theme', async () => {
  await mount(true);
  expect(lastStyle()).toBe('LIGHT');
  expect(onSystemAppearance).not.toBeNull();
  layout.statusBarStyle = 'DARK';
  await act(async () => { onSystemAppearance?.(); });
  expect(lastStyle()).toBe('DARK');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  layout.statusBarStyle = 'LIGHT';
  await act(async () => { onAppState?.({ isActive: true }); });
  expect(lastStyle()).toBe('LIGHT');
});

test('a failed native layout read leaves contrast to the native default', async () => {
  getLayout.mockRejectedValueOnce(new Error('Bridge unavailable'));
  await mount(true);
  expect(lastStyle()).toBe('DEFAULT');
  expect(setBackgroundColor).not.toHaveBeenCalled();
  expect(document.documentElement.classList.contains('oc-android-below-status-bar')).toBe(false);
});

test('failed legacy overlay configuration does not reserve the inset twice', async () => {
  layout = { edgeToEdge: false };
  setOverlaysWebView.mockRejectedValueOnce(new Error('Overlay unavailable'));
  await mount(false);
  expect(lastStyle()).toBe('LIGHT');
  expect(document.documentElement.classList.contains('oc-android-below-status-bar')).toBe(false);
});

test('unmount releases appearance listeners and theme observation', async () => {
  await mount(true);
  await act(async () => root.render(null));
  expect(onSystemAppearance).toBeNull();
  expect(onAppState).toBeNull();
  const calls = setStyle.mock.calls.length;
  document.documentElement.classList.remove('dark');
  await settle();
  expect(setStyle).toHaveBeenCalledTimes(calls);
});

test('iOS retains its transparent overlay and native style default', async () => {
  platform = 'ios';
  await mount(true);
  expect(lastStyle()).toBe('DEFAULT');
  expect(setOverlaysWebView).toHaveBeenLastCalledWith({ overlay: true });
  expect(getLayout).not.toHaveBeenCalled();
  expect(setBackgroundColor).not.toHaveBeenCalled();
});

test('hosted mobile does not change native status bars', async () => {
  native = false;
  await mount(true);
  expect(setStyle).not.toHaveBeenCalled();
  expect(getLayout).not.toHaveBeenCalled();
});
