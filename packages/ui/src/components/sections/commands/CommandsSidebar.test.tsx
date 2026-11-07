import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';
import type { CommandEntry } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  SVGElement: browser.SVGElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React input-event support is detected when react-dom loads, after the happy-dom globals above.
spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { CommandsSidebar } = await import('./CommandsSidebar');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemContext } = await import('@/contexts/theme-system-context');
const { getDefaultTheme } = await import('@/lib/theme/themes');
const { useCommandsStore } = await import('@/stores/useCommandsStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');

const command: CommandEntry = {
  commandId: 'command_custom', name: 'custom', content: 'custom template', description: 'Custom command',
  scope: 'workspace', source: 'workspace', editable: true,
};

const theme = getDefaultTheme(false);
const noop = () => undefined;
const themeValue = {
  currentTheme: theme, availableThemes: [theme], customThemeIds: [], setTheme: noop,
  customThemesLoading: false, reloadCustomThemes: async () => undefined, importTheme: async () => theme,
  deleteImportedTheme: async () => undefined, isSystemPreference: false, setSystemPreference: noop,
  themeMode: 'light' as const, setThemeMode: noop, lightThemeId: theme.metadata.id, darkThemeId: theme.metadata.id,
  setLightThemePreference: noop, setDarkThemePreference: noop,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const installStore = (deleteCommand: (name: string) => Promise<boolean>, commands: CommandEntry[] = [command]) => {
  useDirectoryStore.setState({ currentDirectory: '/project' });
  useProjectsStore.setState({
    projects: [{ id: 'project', path: '/project' }],
    activeProjectId: 'project',
  });
  useCommandsStore.setState({
    selectedCommandName: commands[0]?.name ?? null,
    commands,
    commandsByDirectory: { '/project': commands, __default__: commands },
    loadCommands: async () => true,
    deleteCommand,
  });
};

const render = async (deleteCommand: (name: string) => Promise<boolean>, commands: CommandEntry[] = [command]) => {
  installStore(deleteCommand, commands);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ThemeSystemContext.Provider value={themeValue}><I18nProvider><CommandsSidebar /></I18nProvider></ThemeSystemContext.Provider>);
  });
};

const openDeleteDialog = async () => {
  const trigger = container!.querySelector<HTMLButtonElement>('button svg use[href="#oc-more-2"]')?.closest('button');
  if (!trigger) throw new Error('Missing command menu trigger');
  await act(async () => {
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.dispatchEvent(new Event('pointerup', { bubbles: true }));
    trigger.click();
  });
  const deleteItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')]
    .find((item) => item.textContent?.trim() === 'Delete');
  if (!deleteItem) throw new Error('Missing delete menu item');
  await act(async () => { deleteItem.click(); });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('Delete dialog did not open');
  return dialog;
};

const clickDialogDelete = async (dialog: HTMLElement) => {
  const button = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === 'Delete');
  if (!button) throw new Error('Missing dialog delete action');
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
};

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
});

test('successful delete removes the row and unmounts the confirmation dialog', async () => {
  let deleted = '';
  await render(async (name) => {
    deleted = name;
    useCommandsStore.setState({ commands: [], commandsByDirectory: { '/project': [], __default__: [] }, selectedCommandName: null });
    return true;
  });
  expect(container!.textContent).toContain('/custom');
  const dialog = await openDeleteDialog();
  expect(dialog.textContent).toContain('custom');
  await clickDialogDelete(dialog);
  expect(deleted).toBe('custom');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container!.textContent).not.toContain('/custom');
});

test('failed delete keeps the named command and an actionable dialog', async () => {
  await render(async () => false);
  const dialog = await openDeleteDialog();
  expect(dialog.textContent).toContain('custom');
  await clickDialogDelete(dialog);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('custom');
  const deleteButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find((candidate) => candidate.textContent?.trim() === 'Delete');
  expect(deleteButton?.disabled).toBe(false);
  expect(container!.textContent).toContain('/custom');
});

test('a built-in command exposes no delete action', async () => {
  const builtin: CommandEntry = { ...command, commandId: 'command_builtin', name: 'builtin', editable: false, source: 'builtin' };
  await render(async () => true, [builtin]);
  const trigger = container!.querySelector<HTMLButtonElement>('button svg use[href="#oc-more-2"]')?.closest('button');
  if (!trigger) throw new Error('Missing built-in command menu trigger');
  await act(async () => { trigger.click(); });
  expect([...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')]
    .some((item) => item.textContent?.trim() === 'Delete')).toBe(false);
});

test('icon-only command actions carry accessible names', async () => {
  await render(async () => true);
  const create = container!.querySelector<HTMLButtonElement>('button[aria-label="Create"]');
  expect(create).not.toBeNull();
  const trigger = container!.querySelector<HTMLButtonElement>('button svg use[href="#oc-more-2"]')?.closest('button');
  expect(trigger?.getAttribute('aria-label')).toBe('custom');
});

test('built-in and custom commands have independent selection by id and built-in exposes no delete or rename actions', async () => {
  const builtin: CommandEntry = { ...command, commandId: 'command_builtin_compact', name: 'compact', description: 'Compact context', editable: false, source: 'builtin' };
  const custom: CommandEntry = { ...command, commandId: 'command_custom_compact', name: 'compact', description: 'Custom compact', editable: true, scope: 'workspace', source: 'workspace' };
  await render(async () => true, [builtin, custom]);

  const rows = container!.querySelectorAll<HTMLButtonElement>('.group.relative button.flex-col');
  expect(rows).toHaveLength(2);

  await act(async () => { rows[0].click(); });
  expect(useCommandsStore.getState().selectedCommandId).toBe('command_builtin_compact');

  const rowContainers = container!.querySelectorAll('.group.relative.flex.items-center');
  expect(rowContainers[0].className).toContain('bg-interactive-selection');
  expect(rowContainers[1].className).not.toContain('bg-interactive-selection');

  const triggers = container!.querySelectorAll<HTMLButtonElement>('button[aria-label="compact"]');
  expect(triggers).toHaveLength(2);
  await act(async () => { triggers[0].click(); });
  const menuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(item => item.textContent?.trim());
  expect(menuItems).toContain('Duplicate');
  expect(menuItems).not.toContain('Delete');
  expect(menuItems).not.toContain('Rename');
});
