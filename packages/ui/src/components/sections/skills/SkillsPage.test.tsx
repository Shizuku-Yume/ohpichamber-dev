import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { DiscoveredSkill } from '@/stores/useSkillsStore';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  customElements: browser.customElements, localStorage: browser.localStorage, sessionStorage: browser.sessionStorage,
  HTMLTextAreaElement: browser.HTMLTextAreaElement, Text: browser.Text, NodeList: browser.NodeList,
  Event: browser.Event, FocusEvent: browser.FocusEvent,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.pathname === '/api/config/settings') return Response.json({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/test' });
  if (url.pathname === '/api/location') return Response.json({ data: { directory: '/test' } });
  if (url.pathname === '/api/session') return Response.json({ data: [], cursor: {} });
  throw new Error(`Unexpected request: ${url.pathname}`);
});
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useSkillsStore } = await import('@/stores/useSkillsStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { ThemeSystemContext } = await import('@/contexts/theme-system-context');
const { getDefaultTheme } = await import('@/lib/theme/themes');
const { EditorView } = await import('@codemirror/view');
const { plugin } = await import('bun');
plugin({ name: 'skill-editor-worker-url', setup(build) {
  build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, () => ({ contents: 'export default "http://localhost/worker.js";', loader: 'js' }));
} });
const { SkillsPage } = await import('./SkillsPage');
const theme = getDefaultTheme(false);
const noThemeChange = (): never => { throw new Error('Unexpected theme change'); };
const themeContext = {
  currentTheme: theme, availableThemes: [theme], customThemeIds: [], customThemesLoading: false,
  setTheme: noThemeChange, reloadCustomThemes: noThemeChange, importTheme: noThemeChange, deleteImportedTheme: noThemeChange,
  isSystemPreference: false, setSystemPreference: noThemeChange, themeMode: 'light', setThemeMode: noThemeChange,
  lightThemeId: theme.metadata.id, darkThemeId: getDefaultTheme(true).metadata.id,
  setLightThemePreference: noThemeChange, setDarkThemePreference: noThemeChange,
} satisfies import('@/contexts/theme-system-context').ThemeContextValue;
const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
afterEach(async () => {
  await act(async () => root.unmount());
  fetchSpy.mockRestore();
  browser.close();
});

test('skill refresh preserves newer editor text while a save is pending and switches entities', async () => {
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  const skill = { skillId: 'one', authoredSkillId: 'one', name: 'one', content: '', scope: 'agent', source: '.omp/agent/skills', description: 'one', readOnly: false } satisfies DiscoveredSkill;
  let persisted = '---\nname: one\ndescription: one\ncustom: [keep, metadata]\n---\n\ninitial';
  const writes: Array<{ instructions: string; finish: () => void }> = [];
  useSkillsStore.setState({ selectedSkillName: 'one', selectedAuthoredSkill: null, skills: [skill], skillsByDirectory: { '/project': [skill] }, filesByDirectory: {},
    getSkillDetail: async (name) => ({ content: persisted.replace('description: one', `description: ${name}`), supportingFiles: [] }),
    updateSkill: async (_name, input) => {
      const { promise, resolve } = Promise.withResolvers<boolean>();
      const instructions = input.split('\n\n').at(-1) ?? '';
      writes.push({ instructions, finish: () => {
        persisted = input;
        useSkillsStore.setState({ skills: [{ ...skill }], skillsByDirectory: { '/project': [{ ...skill }] } });
        resolve(true);
      } });
      return promise;
    },
  });
  await act(async () => root.render(<I18nProvider><ThemeSystemContext.Provider value={themeContext}><SkillsPage /></ThemeSystemContext.Provider></I18nProvider>));
  const currentView = () => {
    const editorNode = container.querySelector<HTMLElement>('.cm-editor');
    if (!editorNode) throw new Error('Skill editor missing');
    const editor = EditorView.findFromDOM(editorNode);
    if (!editor) throw new Error('Skill editor view missing');
    return editor;
  };
  const edit = async (instructions: string) => {
    const editor = currentView();
    await act(async () => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: `---\ndescription: one\n---\n\n${instructions}` } }));
    await act(async () => { editor.contentDOM.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  };
  await edit('older');
  await edit('newer');
  await act(async () => useSkillsStore.setState({ skills: [{ ...skill }], skillsByDirectory: { '/project': [{ ...skill }] } }));
  expect(currentView().state.doc.toString()).toContain('newer');
  expect(writes.map((write) => write.instructions)).toEqual(['older']);
  await act(async () => { writes[0].finish(); });
  expect(currentView().state.doc.toString()).toContain('newer');
  expect(writes.map((write) => write.instructions)).toEqual(['older', 'newer']);
  await act(async () => { writes[1].finish(); });
  await act(async () => useSkillsStore.setState({ selectedSkillName: 'two', skills: [{ ...skill, skillId: 'two', name: 'two' }], skillsByDirectory: { '/project': [{ ...skill, skillId: 'two', name: 'two' }] } }));
  expect(currentView().state.doc.toString()).toContain('description: two');
  let finishPending = () => {};
  await act(async () => useSkillsStore.setState({
    selectedSkillName: 'loading', skills: [{ ...skill, skillId: 'loading', name: 'loading' }], skillsByDirectory: { '/project': [{ ...skill, skillId: 'loading', name: 'loading' }] },
    getSkillDetail: async () => {
      const { promise, resolve } = Promise.withResolvers<null>();
      finishPending = () => resolve(null);
      return promise;
    },
  }));
  await act(async () => useSkillsStore.setState({
    selectedSkillName: 'draft',
    skillDraft: { name: 'draft', scope: 'agent', content: '---\ndescription: new draft\n---\n\ndraft body' },
  }));
  expect(currentView().state.doc.toString()).toContain('description: new draft');
  await act(async () => { finishPending(); });
  expect(currentView().state.doc.toString()).toContain('draft body');
});
