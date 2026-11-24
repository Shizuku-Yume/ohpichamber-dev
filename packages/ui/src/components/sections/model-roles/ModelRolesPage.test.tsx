import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { OmpSetting, OmpSettingsChange, OmpSettingsState } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';

const window = new Window({ url: 'http://localhost/' });
const domGlobals = {
  window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
  HTMLInputElement: window.HTMLInputElement, navigator: window.navigator, Node: window.Node,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent, FocusEvent: window.FocusEvent, KeyboardEvent: window.KeyboardEvent,
  MutationObserver: window.MutationObserver, ResizeObserver: window.ResizeObserver,
  IntersectionObserver: class { observe() { } unobserve() { } disconnect() { } },
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
};
Object.assign(globalThis, domGlobals);

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const directory = await import('@/hooks/useSettingsDirectory');
const models = await import('@/hooks/useSettingsModels');
const omp = await import('@/components/sections/shared/useOmpPageSettings');
const { ModelRolesPage } = await import('./ModelRolesPage');
const { CHAT_ROLES, KIND_ROLES, LINKED_ROLES } = await import('./modelRoleLayout');

afterAll(() => window.close());

const modelRoles: OmpSetting = {
  id: 'modelRoles', type: 'record', default: {}, configured: true,
  value: {
    smol: 'provider/small,provider/backup',
    task: ['provider/worker', 'provider/second'],
    web: 'web/exa',
  },
  placement: { type: 'owned-by', owner: 'model-roles.section.chat' },
};
const state: OmpSettingsState = { workspaceId: 'workspace_1', revision: '1', totalCount: 1, settings: [modelRoles] };

describe('Model roles page', () => {
  let host: HTMLDivElement;
  let root: Root;
  let restore: (() => void)[];
  let changes: OmpSettingsChange[];
  beforeEach(() => {
    Object.assign(globalThis, domGlobals);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    changes = [];
    const spies = [
      spyOn(directory, 'useSettingsDirectory').mockReturnValue(null),
      spyOn(models, 'useSettingsModels').mockReturnValue([]),
      spyOn(models, 'useSettingsImageModels').mockReturnValue([
        { provider: 'provider', modelId: 'image-one', name: 'Image generator' },
        { provider: 'provider', modelId: 'image-two', name: 'Disabled image generator', enabled: false },
      ]),
      spyOn(omp, 'useOmpPageSettings').mockReturnValue({
        state, form: {}, loading: false, saving: false, pageSettings: [], getSectionSettings: () => [],
        updateSetting: async () => { },
        updateSettings: async (build) => { changes.push(...build(state)); return true; },
      }),
    ];
    restore = spies.map((spy) => () => spy.mockRestore());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restore.forEach((reset) => reset());
    host.remove();
  });

  test('draws one row per hub role, each at its own search anchor', async () => {
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    for (const role of [...CHAT_ROLES, ...KIND_ROLES]) {
      expect(`${role}: ${host.querySelectorAll(`[data-settings-item="omp.modelRoles.${role}"]`).length}`).toBe(`${role}: 1`);
    }
    expect(host.querySelector('[data-settings-item="omp.modelRoles.dictation"]')).toBeNull();
  });

  test('edits all 13 GUI-supported roles directly, including default, smol, slow, plan, and judge', async () => {
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const directRoles = [
      'default', 'smol', 'slow', 'plan', 'vision', 'commit',
      'tiny', 'memory', 'task', 'advisor', 'widget', 'judge', 'image',
    ];
    for (const role of directRoles) {
      const row = host.querySelector(`[data-settings-item="omp.modelRoles.${role}"]`);
      expect(row).not.toBeNull();
      expect(row?.querySelector('[data-slot="dropdown-menu-trigger"]')).not.toBeNull();
    }
    expect(host.querySelector('[data-settings-item="omp.modelRoles.smol"]')?.textContent).toContain('small');
  });

  test('a linked role shows its value and opens the page that owns it', async () => {
    const jump = spyOn(useUIStore.getState(), 'requestSettingsJump').mockImplementation(() => { });
    restore.push(() => jump.mockRestore());
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const row = host.querySelector('[data-settings-item="omp.modelRoles.web"]');
    expect(row?.textContent).toContain('web/exa');
    expect(row?.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();
    const link = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Set in Web search');
    expect(link).toBeDefined();
    await act(async () => link?.click());
    expect(jump).toHaveBeenCalledWith(LINKED_ROLES.web.page, LINKED_ROLES.web.item ?? null);
  });

  test('the image role uses the searchable picker over enabled image models only and preserves other roles', async () => {
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const trigger = host.querySelector<HTMLElement>('[data-settings-item="omp.modelRoles.image"] [data-slot="dropdown-menu-trigger"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    const searchInput = document.body.querySelector<HTMLInputElement>('input[role="combobox"]');
    expect(searchInput).not.toBeNull();

    const options = Array.from(document.body.querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.textContent)).toEqual(['Image generator']);
    expect(document.body.textContent).not.toContain('Disabled image generator');

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(searchInput, 'nomatch');
      searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.querySelectorAll('[role="option"]').length).toBe(0);

    await act(async () => {
      setter?.call(searchInput, 'Image');
      searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const filteredOptions = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(filteredOptions.length).toBe(1);
    await act(async () => filteredOptions[0]?.click());

    expect(changes).toEqual([{
      id: 'modelRoles',
      value: {
        smol: 'provider/small,provider/backup',
        task: ['provider/worker', 'provider/second'],
        web: 'web/exa',
        image: 'provider/image-one',
      },
    }]);
  });

  test('the image role picker clears back to default via Use the default model', async () => {
    const imageState: OmpSettingsState = {
      ...state,
      settings: [{
        ...modelRoles,
        value: { smol: 'provider/small,provider/backup', image: 'provider/image-one' },
      }],
    };
    const localChanges: OmpSettingsChange[] = [];
    const customOmp = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state: imageState, form: {}, loading: false, saving: false, pageSettings: [], getSectionSettings: () => [],
      updateSetting: async () => { },
      updateSettings: async (build) => { localChanges.push(...build(imageState)); return true; },
    });
    restore.push(() => customOmp.mockRestore());
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const trigger = host.querySelector<HTMLElement>('[data-settings-item="omp.modelRoles.image"] [data-slot="dropdown-menu-trigger"]');
    expect(trigger?.textContent).toContain('Image generator');
    await act(async () => trigger?.click());
    const clearButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="listbox"] button'))
      .find((button) => button.textContent?.includes('Use the default model'));
    expect(clearButton).toBeDefined();
    await act(async () => clearButton?.click());
    expect(localChanges).toEqual([{
      id: 'modelRoles',
      value: { smol: 'provider/small,provider/backup' },
    }]);
  });
});
