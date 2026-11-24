import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { OmpSetting } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';

const window = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
  HTMLInputElement: window.HTMLInputElement, navigator: window.navigator, Node: window.Node, Event: window.Event, CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent, PointerEvent: window.PointerEvent, FocusEvent: window.FocusEvent,
  MutationObserver: window.MutationObserver, ResizeObserver: window.ResizeObserver,
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const desktop = await import('@/lib/desktop');
const persistence = await import('@/lib/persistence');
const directory = await import('@/hooks/useSettingsDirectory');
const models = await import('@/hooks/useSettingsModels');
const omp = await import('@/components/sections/shared/useOmpPageSettings');
const guests = await import('@/lib/guests/load-catalog');
const { ToolsPage } = await import('./ToolsPage');

afterAll(() => window.close());

describe('retained Host tool settings', () => {
  let host: HTMLDivElement;
  let root: Root;
  let restore: (() => void)[];
  let previous: Pick<ReturnType<typeof useUIStore.getState>, 'agentTerminalToolEnabled' | 'agentBrowserSharesLogins'>;
  beforeEach(async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    previous = { agentTerminalToolEnabled: useUIStore.getState().agentTerminalToolEnabled, agentBrowserSharesLogins: useUIStore.getState().agentBrowserSharesLogins };
    useUIStore.setState({ agentTerminalToolEnabled: false, agentBrowserSharesLogins: false });
    const spies = [
      spyOn(directory, 'useSettingsDirectory').mockReturnValue(null),
      spyOn(models, 'useSettingsImageModels').mockReturnValue([]),
      spyOn(omp, 'useOmpPageSettings').mockReturnValue({ state: null, form: {}, loading: false, saving: false, pageSettings: [], getSectionSettings: () => [], updateSetting: async () => {}, updateSettings: async () => false }),
      spyOn(guests, 'loadGuestCatalog').mockResolvedValue(undefined),
      spyOn(persistence, 'updateDesktopSettings').mockResolvedValue({ ok: true }),
    ];
    restore = spies.map((spy) => () => spy.mockRestore());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restore.forEach((reset) => reset());
    useUIStore.setState(previous);
    host.remove();
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

  test('the image role renders an inline ImageModelSelector writing canonical modelRoles.image', async () => {
    const imageEnabled: OmpSetting = {
      id: 'generate_image.enabled', type: 'boolean', default: true, value: true,
      configured: false, placement: { type: 'page', page: 'tools', section: 'image-generation' },
    };
    const modelRolesSetting: OmpSetting = {
      id: 'modelRoles', type: 'record', default: {}, configured: true,
      value: { image: 'provider/image-one', smol: 'provider/smol' },
      placement: { type: 'owned-by', owner: 'model-roles.section.chat' },
    };
    const state = { workspaceId: 'workspace_1', revision: '1', totalCount: 2, settings: [imageEnabled, modelRolesSetting] };
    const changes: Array<{ id: string; value: unknown }> = [];
    const imageModelsSpy = spyOn(models, 'useSettingsImageModels').mockReturnValue([
      { provider: 'provider', modelId: 'image-one', name: 'Image One' },
      { provider: 'provider', modelId: 'image-two', name: 'Image Two' },
    ]);
    const settings = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state, form: { 'generate_image.enabled': true, modelRoles: { image: 'provider/image-one', smol: 'provider/smol' } }, loading: false, saving: false,
      pageSettings: [imageEnabled], getSectionSettings: () => [imageEnabled],
      updateSetting: async () => {},
      updateSettings: async (build) => {
        changes.push(...build(state));
        return true;
      },
    });
    restore.push(() => settings.mockRestore(), () => imageModelsSpy.mockRestore());
    await act(async () => root.render(<I18nProvider><ToolsPage /></I18nProvider>));
    expect(host.querySelector('[data-settings-item="omp.modelRoles.image"]')).toBeNull();
    const trigger = host.querySelector<HTMLElement>('[aria-label="Image generation"][data-slot="dropdown-menu-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('Image One');
    expect(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Set in Model roles')).toBeUndefined();

    await act(async () => trigger?.click());

    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((el) => el.textContent?.trim() === 'Image Two');
    expect(item).toBeDefined();
    await act(async () => item?.click());
    expect(changes).toEqual([
      { id: 'modelRoles', value: { image: 'provider/image-two', smol: 'provider/smol' } },
    ]);
  });
});
