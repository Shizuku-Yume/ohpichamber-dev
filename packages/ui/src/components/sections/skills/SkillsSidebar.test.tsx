import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage, Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  SVGElement: browser.SVGElement, Event: browser.Event, MouseEvent: browser.MouseEvent, FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent, MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
});

spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.pathname === '/api/config/settings') return Response.json({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/test' });
  throw new Error(`Unexpected request: ${url.pathname}`);
});
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemContext } = await import('@/contexts/theme-system-context');
const { getDefaultTheme } = await import('@/lib/theme/themes');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useSkillsStore } = await import('@/stores/useSkillsStore');
const { SkillsSidebar } = await import('./SkillsSidebar');

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

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
});

test('icon-only skill actions carry accessible names', async () => {
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  useSkillsStore.setState({
    selectedSkillName: 'one',
    skills: [{ skillId: 'one', authoredSkillId: 'one', name: 'one', content: '', scope: 'agent', source: '.omp/agent/skills', description: 'one', readOnly: false }],
    skillsByDirectory: { '/project': [{ skillId: 'one', authoredSkillId: 'one', name: 'one', content: '', scope: 'agent', source: '.omp/agent/skills', description: 'one', readOnly: false }] },
    loadSkills: async () => true,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ThemeSystemContext.Provider value={themeValue}><I18nProvider><SkillsSidebar /></I18nProvider></ThemeSystemContext.Provider>);
  });
  expect(container.querySelector('button[aria-label="Create"]')).not.toBeNull();
  const trigger = container.querySelector<HTMLButtonElement>('button svg use[href="#oc-more-2"]')?.closest('button');
  expect(trigger?.getAttribute('aria-label')).toBe('one');
});
