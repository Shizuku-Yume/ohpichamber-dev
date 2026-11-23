import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { OmpSettingsState } from '@openchamber/agent-contract';
import type { DiscoveredSkill } from '@/stores/useSkillsStore';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, CustomEvent: browser.CustomEvent, navigator: browser.navigator,
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
  if (url.pathname === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace', projectId: 'project', name: 'project' });
  if (url.pathname === '/api/agent/v1/workspaces/workspace/settings') return Response.json({ workspaceId: 'workspace', revision: '0', totalCount: 0, settings: [] });
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
const { SkillsPage } = await import('./SkillsPage');
const { canonicalClient } = await import('@/api/canonicalClient');
test('Skills discovery writes its native setting and refreshes the catalog', async () => {
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  useSkillsStore.setState({ selectedSkillName: null, selectedAuthoredSkill: null, skillDraft: null });
  const state: OmpSettingsState = {
    workspaceId: 'workspace', revision: '1', totalCount: 2,
    settings: [{ id: 'skills.enabled', type: 'boolean', value: true, default: true, configured: false,
      placement: { type: 'page', page: 'skills', section: 'discovery' } }, {
      id: 'skills.enablePiProject', type: 'boolean', value: false, default: true, configured: true,
      condition: 'discoveryUsesSharedConfig', conditionActive: false,
      placement: { type: 'page', page: 'skills', section: 'discovery' },
    }],
  };
  const resolve = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'project' });
  const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(state);
  const write = spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue({
    ...state, revision: '2', settings: [{ ...state.settings[0], value: false, configured: true }],
  });
  const reload = spyOn(useSkillsStore.getState(), 'loadSkills').mockResolvedValue(true);
  try {
    await act(async () => root.render(<ThemeSystemContext.Provider value={themeContext}><I18nProvider><SkillsPage /></I18nProvider></ThemeSystemContext.Provider>));
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.skills.enabled"]');
    if (!row) throw new Error('Missing discovery setting');
    const overridden = container.querySelector<HTMLElement>('[data-settings-item="omp.skills.enablePiProject"]');
    expect(overridden?.getAttribute('aria-disabled')).toBe('true');
    expect(container.textContent).toContain('Editing the shared setting would not change this project.');
    await act(async () => overridden?.click());
    expect(write).not.toHaveBeenCalled();
    await act(async () => row.click());
    expect(write).toHaveBeenCalledWith('workspace', { expectedRevision: '1', changes: [{ id: 'skills.enabled', value: false }] });
    expect(reload).toHaveBeenCalledWith('/project');
  } finally { resolve.mockRestore(); read.mockRestore(); write.mockRestore(); reload.mockRestore(); }
});
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
let root = createRoot(container);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
});
afterAll(() => {
  fetchSpy.mockRestore();
  browser.close();
});

test('skill refresh preserves newer editor text while a save is pending and switches entities', async () => {
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  const skill = { skillId: 'one', authoredSkillId: 'one', name: 'one', content: '', scope: 'agent', source: '.omp/agent/skills', description: 'one', readOnly: false } satisfies DiscoveredSkill;
  let persisted = '---\nname: one\ndescription: one\ncustom: [keep, metadata]\n---\n\ninitial';
  const writes: Array<{ instructions: string; finish: () => void }> = [];
  useSkillsStore.setState({ selectedSkillName: null, selectedAuthoredSkill: null, skills: [skill], skillsByDirectory: { '/project': [skill] }, filesByDirectory: {},
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
  // With nothing selected the page still needs its heading: Settings focuses
  // `[data-settings-page-heading]` on navigation.
  expect(container.querySelector('[data-settings-page-heading]')?.textContent).toBe('Skills');
  await act(async () => useSkillsStore.setState({ selectedSkillName: 'one' }));
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

test('a skill list refresh keeps the name typed into a new skill', async () => {
  const builtIn = { skillId: 'built-in', name: 'Built-in', content: 'built-in body', description: '', scope: 'agent', source: 'built-in', readOnly: true } satisfies DiscoveredSkill;
  useSkillsStore.setState({ selectedSkillName: 'new-skill', skills: [builtIn], skillsByDirectory: { __default__: [builtIn], '/test': [builtIn] },
    skillDraft: { name: 'new-skill', scope: 'agent', content: '' },
    getSkillByName: (name) => useSkillsStore.getState().skills.find((entry) => entry.name === name),
  });
  await act(async () => root.render(<I18nProvider><ThemeSystemContext.Provider value={themeContext}><SkillsPage /></ThemeSystemContext.Provider></I18nProvider>));
  const nameInput = () => {
    const input = container.querySelector<HTMLInputElement>('input[placeholder="skill-name"]');
    if (!input) throw new Error('Skill name field missing');
    return input;
  };
  expect(nameInput().value).toBe('new-skill');
  await act(async () => {
    const input = nameInput();
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(input, 'net helper');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(nameInput().value).toBe('net-helper');
  // A catalog event or a slow first read replaces the list while the user is still filling the form.
  await act(async () => useSkillsStore.setState({ skills: [{ ...builtIn }], skillsByDirectory: { __default__: [{ ...builtIn }], '/test': [{ ...builtIn }] } }));
  expect(nameInput().value).toBe('net-helper');

  // Another skill takes the editor; coming back shows the draft again, not that skill's text.
  await act(async () => useSkillsStore.setState({ selectedSkillName: 'built-in',
    getSkillDetail: async () => ({ content: 'built-in body', supportingFiles: [] }),
  }));
  await act(async () => useSkillsStore.setState({ selectedSkillName: 'new-skill' }));
  expect(nameInput().value).toBe('new-skill');
  const editorNode = container.querySelector<HTMLElement>('.cm-editor');
  if (!editorNode) throw new Error('Skill editor missing');
  expect(EditorView.findFromDOM(editorNode)?.state.doc.toString()).not.toContain('built-in');
});

test('a skill selected before the list is read shows its editor only while it exists', async () => {
  const builtIn = { skillId: 'built-in', name: 'Built-in', content: 'built-in body', description: '', scope: 'agent', source: 'built-in', readOnly: true } satisfies DiscoveredSkill;
  // Settings in a VS Code tab receives the selection before it has read any skills.
  useSkillsStore.setState({ selectedSkillName: 'built-in', skillDraft: null, skills: [], skillsByDirectory: {},
    getSkillByName: (name) => useSkillsStore.getState().skills.find((entry) => entry.name === name),
    getSkillDetail: async () => ({ content: 'text', supportingFiles: [] }),
  });
  await act(async () => root.render(<I18nProvider><ThemeSystemContext.Provider value={themeContext}><SkillsPage /></ThemeSystemContext.Provider></I18nProvider>));
  expect(useSkillsStore.getState().selectedSkillName).toBe('built-in');

  await act(async () => useSkillsStore.setState({ skills: [builtIn], skillsByDirectory: { __default__: [builtIn], '/test': [builtIn] } }));
  expect(useSkillsStore.getState().selectedSkillName).toBe('built-in');

  await act(async () => useSkillsStore.setState({ skills: [], skillsByDirectory: { __default__: [], '/test': [] } }));
  expect(container.querySelector('.cm-editor')).toBeNull();
});
