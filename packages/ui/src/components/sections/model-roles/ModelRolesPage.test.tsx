import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Model, OmpSetting, OmpSettingsChange, OmpSettingsState } from '@openchamber/agent-contract';
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
const { toast } = await import('@/components/ui');
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
      'tiny', 'memory', 'task', 'advisor', 'widget', 'judge',
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
    expect(row?.textContent).toContain('exa');
    expect(row?.textContent).not.toContain('web/exa');
    expect(row?.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();
    const link = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Set in Web search');
    expect(link).toBeDefined();
    await act(async () => link?.click());
    expect(jump).toHaveBeenCalledWith(LINKED_ROLES.web.page, LINKED_ROLES.web.item ?? null);
  });

  test('the image role is linked to the OpenChamber tools row that owns it', async () => {
    const jump = spyOn(useUIStore.getState(), 'requestSettingsJump').mockImplementation(() => { });
    restore.push(() => jump.mockRestore());
    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const row = host.querySelector('[data-settings-item="omp.modelRoles.image"]');
    expect(row).not.toBeNull();
    // One control owns the image role: the hub links to it instead of drawing
    // a second picker, so no dropdown trigger may render here.
    expect(row?.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();
    const link = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Set in General');
    expect(link).toBeDefined();
    await act(async () => link?.click());
    expect(jump).toHaveBeenCalledWith(LINKED_ROLES.image.page, LINKED_ROLES.image.item ?? null);
  });

  test('renders Custom roles section empty state and creates a custom role in one batch updateSettings call', async () => {
    const chatModels: Model[] = [{
      modelId: 'fast-chat',
      provider: 'provider',
      name: 'Fast Chat',
      modalities: ['text'],
      contextWindow: 128000,
      maxOutputTokens: 8192,
      reasoningEffortSupported: false,
      reasoningOptions: [],
      variants: [],
      pricing: null,
    }];
    const modelSpy = spyOn(models, 'useSettingsModels').mockReturnValue(chatModels);
    restore.push(() => modelSpy.mockRestore());

    const customState: OmpSettingsState = {
      workspaceId: 'workspace_1',
      revision: '1',
      totalCount: 2,
      settings: [
        modelRoles,
        {
          id: 'modelTags',
          type: 'record',
          default: {},
          configured: false,
          value: {},
          placement: { type: 'owned-by', owner: 'model-roles.section.custom' },
        },
      ],
    };
    const customChanges: OmpSettingsChange[] = [];
    const customOmp = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state: customState, form: {}, loading: false, saving: false, pageSettings: [], getSectionSettings: () => [],
      updateSetting: async () => { },
      updateSettings: async (build) => { customChanges.push(...build(customState)); return true; },
    });
    restore.push(() => customOmp.mockRestore());

    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const customSection = host.querySelector('[data-settings-item="model-roles.section.custom"]');
    expect(customSection).not.toBeNull();
    expect(customSection?.textContent).toContain('No custom roles yet.');

    const addButton = Array.from(customSection?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('Add role'));
    expect(addButton).toBeDefined();
    await act(async () => addButton?.click());

    const idInput = document.body.querySelector<HTMLInputElement>('input[aria-label="Role ID"]');
    const nameInput = document.body.querySelector<HTMLInputElement>('input[aria-label="Display name"]');
    expect(idInput).not.toBeNull();
    expect(nameInput).not.toBeNull();

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(idInput, 'smol');
      idInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('reserved for a built-in role');

    await act(async () => {
      setter?.call(idInput, 'review-fast');
      idInput?.dispatchEvent(new Event('input', { bubbles: true }));
      setter?.call(nameInput, 'Fast Reviewer');
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.querySelector('[role="alert"]')).toBeNull();

    const createButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Create role');
    expect(createButton).toBeDefined();
    await act(async () => createButton?.click());

    expect(customChanges).toEqual([
      { id: 'modelRoles', value: { smol: 'provider/small,provider/backup', task: ['provider/worker', 'provider/second'], web: 'web/exa' } },
      { id: 'modelTags', value: { 'review-fast': { name: 'Fast Reviewer' } } },
    ]);
  });

  test('renders custom role rows with display name, edits and deletes from both records, and shows CATALOG_CONFLICT toast', async () => {
    const customState: OmpSettingsState = {
      workspaceId: 'workspace_1',
      revision: '1',
      totalCount: 2,
      settings: [
        {
          ...modelRoles,
          value: { smol: 'provider/small', 'review-fast': 'provider/fast' },
        },
        {
          id: 'modelTags',
          type: 'record',
          default: {},
          configured: true,
          value: { 'review-fast': { name: 'Fast Reviewer', color: 'accent' } },
          placement: { type: 'owned-by', owner: 'model-roles.section.custom' },
        },
      ],
    };
    const toastError = spyOn(toast, 'error').mockImplementation(() => '');
    restore.push(() => toastError.mockRestore());

    let failConflict = false;
    const customChanges: OmpSettingsChange[] = [];
    const customOmp = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state: customState, form: {}, loading: false, saving: false, pageSettings: [], getSectionSettings: () => [],
      updateSetting: async () => { },
      updateSettings: async (build, options) => {
        if (failConflict) {
          options?.onProblem?.({
            type: 'urn:ohpichamber:problem:CATALOG_CONFLICT',
            title: 'Conflict',
            status: 409,
            detail: 'Native configuration overrides the shared setting',
            code: 'CATALOG_CONFLICT',
            retryable: false,
          });
          return false;
        }
        customChanges.push(...build(customState));
        return true;
      },
    });
    restore.push(() => customOmp.mockRestore());

    await act(async () => root.render(<I18nProvider><ModelRolesPage /></I18nProvider>));
    const customRow = host.querySelector('[data-settings-item="omp.modelRoles.review-fast"]');
    expect(customRow).not.toBeNull();
    expect(customRow?.textContent).toContain('Fast Reviewer');
    expect(customRow?.textContent).toContain('@review-fast');

    const editButton = customRow?.querySelector<HTMLButtonElement>('button[aria-label="Edit custom role Fast Reviewer"]');
    expect(editButton).not.toBeNull();
    await act(async () => editButton?.click());

    const nameInput = document.body.querySelector<HTMLInputElement>('input[aria-label="Display name"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(nameInput, 'Renamed Reviewer');
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Save changes');
    await act(async () => saveButton?.click());

    expect(customChanges).toEqual([
      { id: 'modelRoles', value: { smol: 'provider/small', 'review-fast': 'provider/fast' } },
      { id: 'modelTags', value: { 'review-fast': { name: 'Renamed Reviewer', color: 'accent' } } },
    ]);

    customChanges.length = 0;
    const deleteButton = customRow?.querySelector<HTMLButtonElement>('button[aria-label="Delete custom role Fast Reviewer"]');
    expect(deleteButton).not.toBeNull();
    await act(async () => deleteButton?.click());

    const confirmDelete = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Delete');
    expect(confirmDelete).toBeDefined();
    await act(async () => confirmDelete?.click());

    expect(customChanges).toEqual([
      { id: 'modelRoles', value: { smol: 'provider/small' } },
      { id: 'modelTags', value: {} },
    ]);

    failConflict = true;
    await act(async () => deleteButton?.click());
    const confirmDeleteConflict = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Delete');
    await act(async () => confirmDeleteConflict?.click());
    expect(toastError).toHaveBeenCalledWith(
      "This project's .omp/config.yml overrides this setting or another change conflicted. Refresh or update the project config.",
    );
  });
});
