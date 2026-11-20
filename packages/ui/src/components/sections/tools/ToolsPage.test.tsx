import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { I18nProvider } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import * as desktop from '@/lib/desktop';
import * as persistence from '@/lib/persistence';
import * as directory from '@/hooks/useSettingsDirectory';
import * as models from '@/hooks/useSettingsModels';
import * as omp from '@/components/sections/shared/useOmpPageSettings';
import * as guests from '@/lib/guests/load-catalog';
import { ToolsPage } from './ToolsPage';

describe('retained Host tool settings', () => {
  let window: Window;
  let host: HTMLDivElement;
  let root: Root;
  let descriptors: Map<string, PropertyDescriptor | undefined>;
  let restore: (() => void)[];
  let previous: Pick<ReturnType<typeof useUIStore.getState>, 'agentTerminalToolEnabled' | 'agentBrowserSharesLogins'>;
  const globals = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'IS_REACT_ACT_ENVIRONMENT'];

  beforeEach(async () => {
    window = new Window();
    descriptors = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.assign(globalThis, {
      window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
      Node: window.Node, Event: window.Event, CustomEvent: window.CustomEvent, ResizeObserver: window.ResizeObserver,
      requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
      localStorage: window.localStorage, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
    });
    host = document.createElement('div');
    document.body.append(host);
    root = (await import('react-dom/client')).createRoot(host);
    previous = { agentTerminalToolEnabled: useUIStore.getState().agentTerminalToolEnabled, agentBrowserSharesLogins: useUIStore.getState().agentBrowserSharesLogins };
    useUIStore.setState({ agentTerminalToolEnabled: false, agentBrowserSharesLogins: false });
    const spies = [
      spyOn(directory, 'useSettingsDirectory').mockReturnValue(null),
      spyOn(models, 'useSettingsModels').mockReturnValue([]),
      spyOn(omp, 'useOmpPageSettings').mockReturnValue({ state: null, form: {}, loading: false, saving: false, pageSettings: [], getSectionSettings: () => [], updateSetting: async () => {}, setState: () => {}, setForm: () => {} }),
      spyOn(guests, 'loadGuestCatalog').mockResolvedValue(undefined),
      spyOn(persistence, 'updateDesktopSettings').mockResolvedValue({ ok: true }),
    ];
    restore = spies.map((spy) => () => spy.mockRestore());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restore.forEach((reset) => reset());
    useUIStore.setState(previous);
    window.close();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  const click = async (id: string) => {
    const checkbox = host.querySelector(`[data-settings-item="${id}"] button[role="checkbox"]`)
      ?? host.querySelector(`[data-settings-item="${id}"] input[type="checkbox"]`);
    expect(checkbox).not.toBeNull();
    await act(async () => (checkbox as HTMLElement).click());
  };

  test('offers explicit, default-off terminal reading and browser profile sharing on Electron', async () => {
    const shell = spyOn(desktop, 'isElectronShell').mockReturnValue(true);
    restore.push(() => shell.mockRestore());
    await act(async () => root.render(<I18nProvider><ToolsPage /></I18nProvider>));
    await click('sessions.agent-terminal-tool');
    expect(useUIStore.getState().agentTerminalToolEnabled).toBe(true);
    expect(persistence.updateDesktopSettings).toHaveBeenCalledWith({ agentTerminalToolEnabled: true });
    await click('sessions.agent-browser-logins');
    expect(useUIStore.getState().agentBrowserSharesLogins).toBe(true);
    expect(persistence.updateDesktopSettings).toHaveBeenCalledWith({ agentBrowserSharesLogins: true });
  });

  test('does not offer Electron profile sharing on browser/mobile clients', async () => {
    const shell = spyOn(desktop, 'isElectronShell').mockReturnValue(false);
    restore.push(() => shell.mockRestore());
    await act(async () => root.render(<I18nProvider><ToolsPage /></I18nProvider>));
    expect(host.querySelector('[data-settings-item="sessions.agent-browser-logins"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="sessions.agent-terminal-tool"]')).not.toBeNull();
  });
});
