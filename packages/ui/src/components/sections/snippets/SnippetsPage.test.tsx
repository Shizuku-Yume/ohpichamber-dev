import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
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
  Event: browser.Event, MouseEvent: browser.MouseEvent, CustomEvent: browser.CustomEvent,
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
  expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Save Changes')?.disabled).toBe(true);
  const workspaceSelect = workspaceRow.querySelector('button');
  if (!workspaceSelect) throw new Error('Missing workspace template selection');
  await act(async () => workspaceSelect.click());
  expect(useSnippetsStore.getState().selectedSnippetName).toBe('workspace-template');
  expect(container.querySelector('textarea')?.value).toBe(entries[0].content);
  expect(container.querySelector('textarea')?.readOnly).toBe(false);
  expect(container.textContent).not.toContain('Aliases');
});
