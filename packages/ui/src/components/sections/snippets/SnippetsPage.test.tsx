import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { PromptTemplateEntry } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, Node: browser.Node, Element: browser.Element,
  HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement, DocumentFragment: browser.DocumentFragment,
  Event: browser.Event, FocusEvent: browser.FocusEvent, MouseEvent: browser.MouseEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Browser-backed stores and providers must initialize after the test installs DOM/storage globals.
// These imports intentionally exercise the browser module-loading boundary.
const { createRoot } = await import('react-dom/client');
const { useSnippetsStore } = await import('@/stores/useSnippetsStore');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { useUIStore } = await import('@/stores/useUIStore');
const { SnippetsPage } = await import('./SnippetsPage');
const { SnippetsSidebar } = await import('./SnippetsSidebar');
const { I18nProvider } = await import('@/lib/i18n');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { toast } = await import('@/components/ui');
const entries: PromptTemplateEntry[] = [
  { templateId: 'workspace-template', name: 'deploy', content: '# Workspace\n\nDeploy $1\n', description: 'Workspace deployment', scope: 'workspace', source: '(project)', editable: true, group: 'release' },
  { templateId: 'external-template', name: 'deploy', content: '# External\n\n{{arguments}}\n', description: 'External deployment', scope: 'inherited', source: 'external root', editable: false, group: 'shared' },
];
let resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace');
let list = spyOn(canonicalClient.fileResources, 'getPromptTemplates');
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  useSnippetsStore.getState().resetForRuntimeSwitch();
  useDirectoryStore.setState({ currentDirectory: '/repo' });
  useUIStore.setState({ settingsProjectPath: null });
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'repo' });
  list = spyOn(canonicalClient.fileResources, 'getPromptTemplates').mockResolvedValue({ workspaceId: 'workspace', revision: '4', templates: entries });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  resolveWorkspace.mockRestore(); list.mockRestore();
  useSnippetsStore.getState().resetForRuntimeSwitch();
});
afterAll(() => browser.close());

test('same-name templates select by opaque identity; external Markdown remains read-only', async () => {
  await act(async () => {
    await useSnippetsStore.getState().loadSnippets();
    root.render(<ThemeSystemProvider><I18nProvider><TooltipProvider><SnippetsSidebar /><SnippetsPage /></TooltipProvider></I18nProvider></ThemeSystemProvider>);
  });
  const rows = [...container.querySelectorAll<HTMLElement>('.group')].filter(row => row.textContent?.includes('/deploy'));
  expect(rows).toHaveLength(2);
  const externalRow = rows.find(row => row.textContent?.includes('external root'));
  const workspaceRow = rows.find(row => row.textContent?.includes('(project)'));
  if (!externalRow || !workspaceRow) throw new Error('Missing native template rows');
  expect(externalRow.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  expect(workspaceRow.querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
  const externalSelect = externalRow.querySelector('button');
  if (!externalSelect) throw new Error('Missing external template selection');
  await act(async () => externalSelect.click());
  expect(useSnippetsStore.getState().selectedSnippetName).toBe('external-template');
  const externalEditor = container.querySelector('textarea');
  expect(externalEditor?.value).toBe(entries[1].content);
  expect(externalEditor?.readOnly).toBe(true);
  expect(container.querySelector('h1')?.textContent).toBe('/deploy');
  expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Save Changes')).toBeUndefined();
  const workspaceSelect = workspaceRow.querySelector('button');
  if (!workspaceSelect) throw new Error('Missing workspace template selection');
  await act(async () => workspaceSelect.click());
  expect(useSnippetsStore.getState().selectedSnippetName).toBe('workspace-template');
  expect(container.querySelector('textarea')?.value).toBe(entries[0].content);
  expect(container.querySelector('textarea')?.readOnly).toBe(false);
  expect(container.textContent).not.toContain('Aliases');
});

test('the empty pane keeps the page heading so Settings can focus it', async () => {
  await act(async () => {
    await useSnippetsStore.getState().loadSnippets();
    root.render(<ThemeSystemProvider><I18nProvider><TooltipProvider><SnippetsSidebar /><SnippetsPage /></TooltipProvider></I18nProvider></ThemeSystemProvider>);
  });
  const heading = container.querySelector('[data-settings-page-heading]');
  expect(heading?.textContent).toBe('Prompt Templates');
});

test('a new prompt uses a confined nested native name and selects the new opaque ID', async () => {
  const created: PromptTemplateEntry = {
    ...entries[0], templateId: 'new-template', group: 'reviews/backend', source: '(project:reviews:backend)',
  };
  const create = spyOn(canonicalClient.fileResources, 'createPromptTemplate').mockResolvedValue({
    workspaceId: 'workspace', revision: '5', templates: [...entries, created],
  });
  try {
    await act(async () => {
      await useSnippetsStore.getState().loadSnippets();
      useSnippetsStore.getState().setSnippetDraft({ name: 'deploy', scope: 'workspace', content: 'Say hello.' });
      useSnippetsStore.getState().setSelectedSnippet('deploy');
      root.render(<ThemeSystemProvider><I18nProvider><TooltipProvider><SnippetsPage /></TooltipProvider></I18nProvider></ThemeSystemProvider>);
    });
    const folder = container.querySelector<HTMLInputElement>('input[aria-label="Prompt folder"]');
    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const createBtn = [...container.querySelectorAll('button')].find(button => button.textContent === 'Create');
    const cancelBtn = [...container.querySelectorAll('button')].find(button => button.textContent === 'Cancel');
    if (!folder || !nameInput || !setValue || !createBtn || !cancelBtn) throw new Error('Missing prompt creation fields');
    expect(nameInput.parentElement?.textContent).toContain('/');
    const enterFolder = (value: string) => act(async () => {
      setValue.call(folder, value);
      folder.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await enterFolder('../outside');
    expect(createBtn.disabled).toBe(true);
    await enterFolder('reviews/backend');
    expect(createBtn.disabled).toBe(false);
    const successSpy = spyOn(toast, 'success');
    await act(async () => createBtn.click());
    expect(create).toHaveBeenCalledWith('workspace', {
      expectedRevision: '4', name: 'reviews/backend/deploy', scope: 'workspace', description: '', content: 'Say hello.',
    });
    expect(successSpy).not.toHaveBeenCalled();
    successSpy.mockRestore();
    expect(useSnippetsStore.getState().selectedSnippetName).toBe('new-template');
  } finally { create.mockRestore(); }
});

test('existing editable snippets autosave silently on blur and show an error toast on failure', async () => {
  const successSpy = spyOn(toast, 'success');
  const errorSpy = spyOn(toast, 'error');
  let shouldSucceed = true;
  const update = spyOn(canonicalClient.fileResources, 'updatePromptTemplate').mockImplementation(async (_workspaceId, req) => {
    if (!shouldSucceed) throw new Error('disk full');
    return {
      workspaceId: 'workspace',
      revision: '5',
      templates: entries.map(entry => entry.templateId === req.templateId
        ? { ...entry, content: req.content, description: req.description ?? entry.description }
        : entry),
    };
  });
  try {
    await act(async () => {
      await useSnippetsStore.getState().loadSnippets();
      useSnippetsStore.getState().setSelectedSnippet('workspace-template');
      root.render(<ThemeSystemProvider><I18nProvider><TooltipProvider><SnippetsPage /></TooltipProvider></I18nProvider></ThemeSystemProvider>);
    });
    expect([...container.querySelectorAll('button')].some(button => button.textContent === 'Save Changes' || button.textContent === 'Create')).toBe(false);
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    const setTextValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!editor || !setTextValue) throw new Error('Missing snippet content editor');

    await act(async () => {
      setTextValue.call(editor, '# Updated\n\nDeploy $1 safely\n');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(successSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    shouldSucceed = false;
    await act(async () => {
      setTextValue.call(editor, '# Failed draft\n');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(successSpy).not.toHaveBeenCalled();
    expect(editor.value).toBe('# Failed draft\n');
  } finally {
    update.mockRestore();
    successSpy.mockRestore();
    errorSpy.mockRestore();
  }
});

test('cancel on a new snippet draft discards it without saving', async () => {
  const create = spyOn(canonicalClient.fileResources, 'createPromptTemplate');
  try {
    await act(async () => {
      await useSnippetsStore.getState().loadSnippets();
      useSnippetsStore.getState().setSnippetDraft({ name: 'draft-cmd', scope: 'agent', content: '' });
      useSnippetsStore.getState().setSelectedSnippet('draft-cmd');
      root.render(<ThemeSystemProvider><I18nProvider><TooltipProvider><SnippetsPage /></TooltipProvider></I18nProvider></ThemeSystemProvider>);
    });
    const cancelBtn = [...container.querySelectorAll('button')].find(button => button.textContent === 'Cancel');
    if (!cancelBtn) throw new Error('Missing Cancel button');
    await act(async () => cancelBtn.click());
    expect(create).not.toHaveBeenCalled();
    expect(useSnippetsStore.getState().snippetDraft).toBeNull();
    expect(useSnippetsStore.getState().selectedSnippetName).toBeNull();
  } finally {
    create.mockRestore();
  }
});
