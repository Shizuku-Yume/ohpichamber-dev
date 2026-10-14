import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { Agent } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
});
const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  return Response.json(url.includes('/config/mcp') ? [] : { home: '/test' });
});
// These loading boundaries must run after the browser globals and the Bun asset-loader plugin are installed.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useAgentsStore } = await import('@/stores/useAgentsStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
plugin({
  name: 'agent-settings-provider-logos',
  setup(build) {
    build.onLoad({ filter: /useProviderLogo\.ts$/ }, ({ path }) => {
      const directory = resolve(dirname(path), '../assets/provider-logos');
      const logos = Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith('.svg')).map((name) => [
        `../assets/provider-logos/${name}`, pathToFileURL(resolve(directory, name)).href,
      ]));
      return { contents: readFileSync(path, 'utf8').replace(/import\.meta\.glob<string>\([\s\S]*?\);/, `${JSON.stringify(logos)};`), loader: 'ts' };
    });
  },
});
const { AgentsPage } = await import('./AgentsPage');
const initialAgent: Agent = {
  agentId: 'test', name: 'test', description: 'Initial description',
  model: { providerId: 'provider', modelId: 'model' }, allowedTools: ['read', 'custom-tool'],
  systemPromptOverride: 'initial', permissionPresetId: 'actual-native-preset',
};
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
beforeEach(() => {
  useProjectsStore.setState({ projects: [], activeProjectId: null });
  root = createRoot(container);
  useAgentsStore.setState({
    selectedAgentName: 'test', agentDraft: null,
    agentsByDirectory: { __default__: [initialAgent] },
    revisionsByDirectory: { __default__: '1' }, errorsByDirectory: {},
    loadAgents: async () => true,
    fetchAgentPermissions: async () => ({ global: [], agent: [], effective: [], source: 'json', path: '/config.json' }),
    updateAgent: async () => ({ ok: true, revision: '2' }),
    createAgent: async () => ({ ok: true, revision: '2' }),
  });
});
afterEach(async () => { await act(async () => root.unmount()); });
afterAll(() => { fetchSpy.mockRestore(); browser.close(); });
const render = async () => { await act(async () => { root.render(<I18nProvider><AgentsPage /></I18nProvider>); }); };
const field = (value: string) => {
  const entry = [...container.querySelectorAll<HTMLTextAreaElement>('textarea')].find((textarea) => textarea.value === value);
  if (!entry) throw new Error(`Missing textarea: ${value}`);
  return entry;
};
const edit = async (entry: HTMLTextAreaElement, value: string, blur = true) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing textarea setter');
  await act(async () => { setter.call(entry, value); entry.dispatchEvent(new Event('input', { bubbles: true })); });
  if (blur) await act(async () => { entry.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};

test('native catalog refresh during save preserves newer draft and advances only acknowledged revision', async () => {
  const writes: Array<{ agent: Agent; revision: string | undefined; finish: () => void }> = [];
  useAgentsStore.setState({
    updateAgent: async (agent, _directory, revision) => {
      const { promise, resolve } = Promise.withResolvers<{ ok: true; revision: string }>();
      writes.push({ agent, revision, finish: () => resolve({ ok: true, revision: String(Number(revision) + 1) }) });
      return promise;
    },
  });
  await render();
  const system = field('initial');
  await edit(system, 'older');
  await edit(system, 'newer');
  expect(writes.map((write) => write.agent.systemPromptOverride)).toEqual(['older']);
  await act(async () => { useAgentsStore.setState({
    agentsByDirectory: { __default__: [{ ...initialAgent, systemPromptOverride: 'older' }] },
    revisionsByDirectory: { __default__: '99' },
  }); });
  expect(system.value).toBe('newer');
  await act(async () => { writes[0].finish(); });
  expect(writes.map((write) => write.agent.systemPromptOverride)).toEqual(['older', 'newer']);
  expect(writes.map((write) => write.revision)).toEqual(['1', '2']);
  expect(writes[1].agent.allowedTools).toEqual(initialAgent.allowedTools);
  expect(writes[1].agent.permissionPresetId).toBe(initialAgent.permissionPresetId);
  await act(async () => { useAgentsStore.setState({
    selectedAgentName: 'other', agentsByDirectory: { __default__: [{ ...initialAgent, agentId: 'other', name: 'other', systemPromptOverride: 'other prompt' }] },
  }); });
  expect(system.value).toBe('other prompt');
  await act(async () => { writes[1].finish(); });
  expect(system.value).toBe('other prompt');
});

test('dirty native fields keep hydration revision on concurrent refresh and display mutation conflict', async () => {
  const writes: Array<{ agent: Agent; revision: string | undefined }> = [];
  useAgentsStore.setState({ updateAgent: async (agent, _directory, revision) => {
    writes.push({ agent, revision }); return { ok: false, error: 'CATALOG_CONFLICT' };
  } });
  await render();
  const description = field('Initial description');
  await edit(description, '', false);
  await act(async () => { useAgentsStore.setState({
    agentsByDirectory: { __default__: [{ ...initialAgent, description: 'External edit', allowedTools: ['external'] }] },
    revisionsByDirectory: { __default__: '2' },
  }); });
  expect(description.value).toBe('');
  await act(async () => { description.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(writes[0].revision).toBe('1');
  expect(writes[0].agent).toEqual({ ...initialAgent, description: '' });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('CATALOG_CONFLICT');
  expect(description.value).toBe('');
  expect(useAgentsStore.getState().selectedAgentName).toBe('test');
});

test('clean refresh hydrates native fields, actual preset and optional prompt removal', async () => {
  const writes: Agent[] = [];
  useAgentsStore.setState({ updateAgent: async (agent) => { writes.push(agent); return { ok: true, revision: '3' }; } });
  await render();
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Permission preset ID"]')?.value).toBe('actual-native-preset');
  expect(container.querySelectorAll('textarea')).toHaveLength(3);
  await act(async () => { useAgentsStore.setState({
    agentsByDirectory: { __default__: [{ ...initialAgent, description: 'Refreshed description', systemPromptOverride: 'refreshed' }] },
    revisionsByDirectory: { __default__: '2' },
  }); });
  expect(field('Refreshed description')).toBeDefined();
  await edit(field('refreshed'), '');
  expect(writes[0].systemPromptOverride).toBeUndefined();
  expect(writes[0].model).toEqual(initialAgent.model);
  expect(writes[0].allowedTools).toEqual(initialAgent.allowedTools);
  expect(writes[0].permissionPresetId).toBe(initialAgent.permissionPresetId);
});

test('unavailable catalog is visible and never renders editable stale fields', async () => {
  useAgentsStore.setState({ agentsByDirectory: {}, revisionsByDirectory: {}, errorsByDirectory: { __default__: 'SERVICE_UNAVAILABLE' } });
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('SERVICE_UNAVAILABLE');
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Unavailable');
  expect(container.querySelectorAll('textarea')).toHaveLength(0);
});

test('creating native draft preserves its identity, tools and preset without legacy fields', async () => {
  const writes: Agent[] = [];
  const draft: Agent = { ...initialAgent, agentId: 'new-profile-id', name: 'new-profile', systemPromptOverride: '' };
  useAgentsStore.setState({
    selectedAgentName: draft.name, agentDraft: draft,
    createAgent: async (agent) => { writes.push(agent); return { ok: true, revision: '2' }; },
  });
  await render();
  await edit(field('Initial description'), 'New description');
  await edit(field(initialAgent.allowedTools.join('\n')), ' new-tool \nread');
  expect(writes).toHaveLength(0);
  const create = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Create');
  if (!create) throw new Error('Missing create action');
  await act(async () => { create.click(); });
  expect(writes).toEqual([{ ...draft, description: 'New description', allowedTools: ['new-tool', 'read'] }]);
  expect(useAgentsStore.getState().selectedAgentName).toBe(draft.name);
  expect(useAgentsStore.getState().agentDraft).toBeNull();
});

test('native tools round-trip ordered duplicates and optional preset can be removed', async () => {
  const writes: Agent[] = [];
  useAgentsStore.setState({ updateAgent: async (agent) => {
    writes.push(agent); return { ok: true, revision: String(writes.length + 1) };
  } });
  await render();
  const tools = field(initialAgent.allowedTools.join('\n'));
  await edit(tools, ' custom-tool \n\n read\ncustom-tool ');
  expect(writes[0].allowedTools).toEqual(['custom-tool', 'read', 'custom-tool']);
  expect(writes[0].permissionPresetId).toBe(initialAgent.permissionPresetId);
  const preset = container.querySelector<HTMLInputElement>('input[aria-label="Permission preset ID"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!preset || !setter) throw new Error('Missing native preset input');
  await act(async () => { setter.call(preset, 'new-native-preset'); preset.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { preset.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(writes[1].permissionPresetId).toBe('new-native-preset');
  expect(writes[1].allowedTools).toEqual(['custom-tool', 'read', 'custom-tool']);
  await act(async () => { setter.call(preset, ''); preset.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { preset.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(writes[2].permissionPresetId).toBeUndefined();
  expect(Object.hasOwn(writes[2], 'permissionPresetId')).toBe(false);
});
