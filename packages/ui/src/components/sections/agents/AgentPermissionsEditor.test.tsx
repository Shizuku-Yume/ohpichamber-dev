import { afterAll, afterEach, expect, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import type { ToolCatalogEntry } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, Node: browser.Node, Element: browser.Element,
  HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  DocumentFragment: browser.DocumentFragment, Event: browser.Event, MouseEvent: browser.MouseEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// These loading boundaries must run after the browser globals are installed.
const { createRoot } = await import('react-dom/client');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { I18nProvider } = await import('@/lib/i18n');
const { AgentPermissionsEditor } = await import('./AgentPermissionsEditor');

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});
afterAll(() => browser.close());

const expandAllDisclosures = async (rootEl: HTMLElement) => {
  const collapsed = [
    ...rootEl.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]:not([aria-label])'),
  ];
  if (collapsed.length === 0) return;
  await act(async () => {
    for (const button of collapsed) {
      button.click();
    }
  });
};

const render = async (
  tools: ToolCatalogEntry[],
  allowedTools: string[] | null = null,
) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <I18nProvider>
        <TooltipProvider>
          <AgentPermissionsEditor allowedTools={allowedTools} toolsCatalog={tools} onChange={() => { }} />
        </TooltipProvider>
      </I18nProvider>,
    );
  });
  await expandAllDisclosures(container);
  return container;
};

test('a tool whose catalog label only repeats its id renders its name once', async () => {
  const view = await render([
    // The service builds a Host tool's label by capitalising the id.
    { name: 'bash', label: 'Bash', description: 'Run commands', tier: 'exec', availability: true },
    { name: 'openchamber', label: 'Openchamber', description: 'Host actions', tier: 'exec', availability: true },
  ]);
  expect(view.textContent).not.toContain('(bash)');
  expect(view.textContent).not.toContain('Bash (bash)');
  expect(view.textContent).toContain('Bash');
  // The host tool keeps its rebranded presentation label beside the raw tool id.
  expect(view.textContent).toContain('OhPiChamber');
  expect(view.textContent).toContain('(openchamber)');
});

test('a tool whose label adds information keeps the id beside it', async () => {
  const view = await render([
    { name: 'manage_skill', label: 'Manage skill', description: 'Install or remove a skill', tier: 'exec', availability: true },
  ]);
  expect(view.textContent).toContain('Manage skill');
  expect(view.textContent).toContain('(manage_skill)');
});

test('tool descriptions are hidden from inline row text and reachable via SettingsInfoHint', async () => {
  const snippet = 'Mach-O names resolve without the underscore.';
  const long = `${snippet} `.repeat(40);
  const view = await render([
    { name: 'custom_ida_disassembler', label: 'IDA Pro', description: long, tier: 'exec', availability: false },
  ]);

  expect(view.querySelector('.line-clamp-2')).toBeNull();
  expect(view.textContent).not.toContain(snippet);

  const infoButton = view.querySelector<HTMLButtonElement>('button[aria-label="More information"]');
  if (!infoButton) throw new Error('Missing SettingsInfoHint trigger');
  await act(async () => {
    infoButton.click();
  });

  const tooltip = document.body.querySelector('[data-slot="tooltip-content"]');
  expect(tooltip?.textContent).toContain(snippet);
  expect(tooltip?.textContent?.endsWith('…')).toBe(true);
});

test('renders zero hardcoded emerald, amber, rose, or divide-y classes', async () => {
  const view = await render(
    [
      { name: 'read', label: 'Read', description: 'Read files', tier: 'read', availability: true },
      { name: 'write', label: 'Write', description: 'Write files', tier: 'write', availability: true },
      { name: 'bash', label: 'Bash', description: 'Run commands', tier: 'exec', availability: true },
      { name: 'ida', label: 'IDA Pro', description: 'Disassembler', tier: 'exec', availability: false },
      { name: 'openchamber', label: 'OpenChamber', description: 'Host actions', tier: 'exec', availability: true },
      { name: 'custom-tool', label: 'Custom', description: 'Custom tool', tier: 'exec', availability: true },
    ],
    ['read', 'ida'],
  );

  const elements = [view, ...view.querySelectorAll('*')];
  for (const element of elements) {
    const className = element.getAttribute('class') ?? '';
    expect(className).not.toMatch(/\b(?:emerald|amber|rose)-|divide-y/);
  }
});
