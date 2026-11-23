import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { BehaviorFileCatalog, BehaviorFileWrite } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement, Event: browser.Event, MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent, KeyboardEvent: browser.KeyboardEvent, CustomEvent: browser.CustomEvent,
  ResizeObserver: browser.ResizeObserver, MutationObserver: browser.MutationObserver,
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { canonicalClient, CanonicalApiError } = await import('@/api/canonicalClient');
const { NativeBehaviorFiles } = await import('./NativeBehaviorFiles');

const element = document.createElement('div');
document.body.appendChild(element);
let root = createRoot(element);
const resolve = spyOn(canonicalClient, 'resolveWorkspace');
const read = spyOn(canonicalClient.fileResources, 'getBehaviorFiles');
const write = spyOn(canonicalClient.fileResources, 'writeBehaviorFile');
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(element);
  resolve.mockReset();
  read.mockReset();
  write.mockReset();
});

const workspace = { workspaceId: 'workspace', projectId: 'project', name: 'Demo' };
const catalog: BehaviorFileCatalog = {
  workspaceId: workspace.workspaceId, revision: '3', scopes: ['workspace', 'agent'], files: [
    { kind: 'instruction', scope: 'workspace', name: 'demo.md', version: 'a'.repeat(64), content: 'A benign instruction.', fields: { applyTo: '**/*.ts' } },
  ],
};
const render = () => act(async () => root.render(<I18nProvider><NativeBehaviorFiles directory="/workspace" /></I18nProvider>));
const findButton = (label: string) => [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === label)!;

test('Behavior edits send a scoped instruction patch with both revision tokens', async () => {
  resolve.mockResolvedValue(workspace);
  read.mockResolvedValue(catalog);
  write.mockImplementation(async (_workspaceId: string, input: BehaviorFileWrite) => ({
    ...catalog, revision: '4', files: [{ ...catalog.files[0], fields: input.fields ?? {} }],
  }));
  await render();
  await act(async () => findButton('Project').click());
  const picker = element.querySelector<HTMLButtonElement>('[aria-label="Select a file"]')!;
  await act(async () => picker.click());
  const choice = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent?.includes('demo.md'))!;
  await act(async () => choice.click());
  const applyTo = element.querySelector<HTMLInputElement>('input[aria-label="applyTo"]')!;
  expect(applyTo.value).toBe('**/*.ts');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(applyTo, '**/*.md');
    applyTo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => findButton('Save Changes').click());
  expect(write).toHaveBeenCalledWith('workspace', {
    kind: 'instruction', scope: 'workspace', name: 'demo.md', expectedRevision: '3', expectedVersion: 'a'.repeat(64),
    fields: { applyTo: '**/*.md' }, content: 'A benign instruction.',
  });
});

test('an older Host without the opt-in route omits the native editor', async () => {
  resolve.mockResolvedValue(workspace);
  read.mockRejectedValue(new CanonicalApiError({ type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_IMPLEMENTED', detail: 'Unavailable', retryable: false }));
  await render();
  expect(element.textContent).not.toContain('Native behavior files');
  expect(element.querySelector('[role="alert"]')).toBeNull();
});
