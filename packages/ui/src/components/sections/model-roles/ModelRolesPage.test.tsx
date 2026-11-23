import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { OmpSetting, OmpSettingsChange, OmpSettingsState } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';

const window = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
  navigator: window.navigator, Node: window.Node, Event: window.Event, CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent, PointerEvent: window.PointerEvent, FocusEvent: window.FocusEvent,
  MutationObserver: window.MutationObserver, ResizeObserver: window.ResizeObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
});

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
  value: { smol: 'provider/small,provider/backup', task: ['provider/worker', 'provider/second'] },
  placement: { type: 'owned-by', owner: 'model-roles.section.chat' },
};
const state: OmpSettingsState = { workspaceId: 'workspace_1', revision: '1', totalCount: 1, settings: [modelRoles] };

describe('Model roles page', () => {
  let host: HTMLDivElement;
  let root: Root;
  let restore: (() => void)[];
  let changes: OmpSettingsChange[];
  beforeEach(() => {
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
        updateSetting: async () => {},
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

  test('a linked role shows its value and opens the page that owns it', async () => {
    const jump = spyOn(useUIStore.getState(), 'requestSettingsJump').mockImplementation(() => {});
    restore.push(() => jump.mockRestore());
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const row = host.querySelector('[data-settings-item="omp.modelRoles.smol"]');
    expect(row?.textContent).toContain('provider/small');
    expect(row?.querySelector('[role="combobox"]')).toBeNull();
    const link = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Set in Sessions');
    expect(link).toBeDefined();
    await act(async () => link?.click());
    expect(jump).toHaveBeenCalledWith(LINKED_ROLES.smol.page, LINKED_ROLES.smol.item ?? null);
  });

  test('the image role offers enabled image models only and keeps the other roles', async () => {
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const trigger = host.querySelector('[data-settings-item="omp.modelRoles.image"] [role="combobox"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })));
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.textContent)).toEqual(['Use the default model', 'Image generator (provider)']);
    await act(async () => (options[1] as HTMLElement).click());
    expect(changes).toEqual([{
      id: 'modelRoles',
      value: { smol: 'provider/small,provider/backup', task: ['provider/worker', 'provider/second'], image: 'provider/image-one' },
    }]);
  });
});
