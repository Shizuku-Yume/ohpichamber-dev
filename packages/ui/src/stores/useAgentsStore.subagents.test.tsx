import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Agent } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import type { CanonicalClient } from '@/api/canonicalClient';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, Node: browser.Node, Element: browser.Element,
  HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  DocumentFragment: browser.DocumentFragment, Event: browser.Event,
  MouseEvent: browser.MouseEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const DIRECTORY = '/workspace/project';
const SETTINGS_DIRECTORY = '/workspace/settings';
const agent = (name: string): Agent => ({
  agentId: `profile-${name}`, name, description: `Native ${name} profile`,
  model: { providerId: 'provider', modelId: 'model' }, allowedTools: ['read', 'edit'],
  systemPromptOverride: 'Stored instructions',
});
let listedAgents: Agent[] = [];
let resolveWorkspace: Mock<CanonicalClient['resolveWorkspace']>;
let getAgents: Mock<CanonicalClient['getAgents']>;
let createAgent: Mock<CanonicalClient['createAgent']>;
let updateAgent: Mock<CanonicalClient['updateAgent']>;
let deleteAgent: Mock<CanonicalClient['deleteAgent']>;

const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [] }));
// Store/provider imports require the browser globals and storage installed above.
const { createRoot } = await import('react-dom/client');
const { useAgentsStore, invalidateAgentsLoadCache } = await import('./useAgentsStore');
const { useProjectsStore } = await import('./useProjectsStore');
const { useUIStore } = await import('./useUIStore');
const { AgentsSidebar } = await import('@/components/sections/agents/AgentsSidebar');
const { I18nProvider } = await import('@/lib/i18n');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  fetchSpy.mockClear();
  listedAgents = [agent('build'), agent('title'), agent('custom')];
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    workspaceId: directory === SETTINGS_DIRECTORY ? 'settings-workspace' : 'project-workspace', projectId: 'project', name: directory,
  }));
  getAgents = spyOn(canonicalClient, 'getAgents').mockImplementation(async (workspaceId) => ({ workspaceId, revision: '1', agents: listedAgents }));
  createAgent = spyOn(canonicalClient, 'createAgent').mockImplementation(async (_workspaceId, input) => ({ revision: '3', agentId: input.agent.agentId, agent: input.agent }));
  updateAgent = spyOn(canonicalClient, 'updateAgent').mockImplementation(async (_workspaceId, input) => ({ revision: '3', agentId: input.agent.agentId, agent: input.agent }));
  deleteAgent = spyOn(canonicalClient, 'deleteAgent').mockImplementation(async (_workspaceId, input) => ({ revision: '3', agentId: input.agentId, agent: null }));
  useProjectsStore.setState({ projects: [{ id: 'project', path: DIRECTORY }, { id: 'settings', path: SETTINGS_DIRECTORY }], activeProjectId: 'project' });
  useUIStore.setState({ settingsProjectPath: null });
  useAgentsStore.getState().resetForRuntimeSwitch();
  useAgentsStore.setState({ selectedAgentName: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  resolveWorkspace.mockRestore(); getAgents.mockRestore();
  createAgent.mockRestore(); updateAgent.mockRestore(); deleteAgent.mockRestore();
});
afterAll(() => { fetchSpy.mockRestore(); browser.close(); });

const render = async (directory = DIRECTORY) => {
  await act(async () => {
    await useAgentsStore.getState().loadAgents(directory);
    root.render(<ThemeSystemProvider><I18nProvider><TooltipProvider><AgentsSidebar /></TooltipProvider></I18nProvider></ThemeSystemProvider>);
  });
};

const rowFor = (name: string): HTMLElement => {
  const label = [...container.querySelectorAll('span')].find((entry) => entry.textContent === name);
  const row = label?.closest<HTMLElement>('.group');
  if (!row) throw new Error(`Missing native agent row for ${name}`);
  return row;
};

// Selection is wired to the row's inner select button, not the row container.
const selectRow = (name: string): void => {
  const button = rowFor(name).querySelector<HTMLButtonElement>('button:not([aria-haspopup])');
  if (!button) throw new Error(`Missing native agent select button for ${name}`);
  button.click();
};

const openMenu = async (name: string) => {
  const menu = rowFor(name).querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (!menu) throw new Error(`Missing native agent menu for ${name}`);
  await act(async () => menu.click());
};

const chooseAction = async (name: string, action: string) => {
  await openMenu(name);
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((entry) => entry.textContent?.trim() === action);
  if (!item) throw new Error(`Missing ${action} action for ${name}`);
  await act(async () => item.click());
};

const confirmAction = async (action: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((entry) => entry.textContent?.trim() === action);
  if (!button) throw new Error(`Missing ${action} confirmation`);
  await act(async () => button.click());
};

const enterRename = async (name: string) => {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
  if (!input) throw new Error('Missing rename input');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Missing native input value setter');
  await act(async () => {
    setValue.call(input, name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('Settings native agent profiles', () => {
  test('renders every native profile without legacy built-in or hidden classification', async () => {
    await render();
    expect(container.textContent).toContain('build');
    expect(container.textContent).toContain('title');
    expect(container.textContent).toContain('custom');
    expect(container.textContent).toContain('Total 3');
    expect(getAgents).toHaveBeenCalledWith('project-workspace');
    expect(getAgents).toHaveBeenCalledTimes(1);
  });

  test('selects the profile name rather than its stable native identity', async () => {
    await render();
    await act(async () => selectRow('custom'));
    expect(useAgentsStore.getState().selectedAgentName).toBe('custom');
    expect(useAgentsStore.getState().getAgentByName('custom', DIRECTORY)?.agentId).toBe('profile-custom');
  });

  test('duplicates the complete native profile into a new identity without a config lookup', async () => {
    await render();
    const menu = rowFor('custom').querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    if (!menu) throw new Error('Missing native agent menu');
    await act(async () => menu.click());
    const duplicate = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((entry) => entry.textContent?.includes('Duplicate'));
    if (!duplicate) throw new Error('Missing Duplicate action');
    await act(async () => duplicate.click());
    const original = agent('custom');
    const draft = useAgentsStore.getState().agentDraft;
    expect(draft).toMatchObject({
      name: 'custom-copy', description: original.description, model: original.model,
      allowedTools: original.allowedTools, systemPromptOverride: original.systemPromptOverride,
    });
    expect(draft?.agentId).toBeTruthy();
    expect(draft?.agentId).not.toBe(original.agentId);
    expect(useAgentsStore.getState().selectedAgentName).toBe('custom-copy');
    expect(getAgents).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.some(([input]) => String(input instanceof Request ? input.url : input).includes('/api/config/agents/'))).toBe(false);
  });

  test('shows the Settings workspace catalog without replacing the ambient mirror', async () => {
    getAgents.mockImplementation(async (workspaceId) => ({
      workspaceId, revision: '1', agents: [agent(workspaceId === 'settings-workspace' ? 'settings-profile' : 'ambient-profile')],
    }));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    useUIStore.setState({ settingsProjectPath: SETTINGS_DIRECTORY });
    await render(SETTINGS_DIRECTORY);
    expect(container.textContent).toContain('settings-profile');
    expect(container.textContent).not.toContain('ambient-profile');
    expect(useAgentsStore.getState().agents.map((entry) => entry.name)).toEqual(['ambient-profile']);
    expect(resolveWorkspace).toHaveBeenCalledWith(SETTINGS_DIRECTORY);
    expect(getAgents).toHaveBeenCalledWith('settings-workspace');
  });
});

describe('Settings native agent mutation boundaries', () => {
  test('successful native rename changes the name without recreating the stable identity', async () => {
    await render();
    await act(async () => selectRow('custom'));
    await chooseAction('custom', 'Rename');
    await enterRename('renamed-profile');
    await confirmAction('Rename');
    expect(updateAgent).toHaveBeenCalledWith('project-workspace', {
      expectedRevision: '1', agent: { ...agent('custom'), name: 'renamed-profile' },
    });
    expect(createAgent).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(useAgentsStore.getState().getAgentByName('renamed-profile', DIRECTORY)?.agentId).toBe('profile-custom');
    expect(useAgentsStore.getState().selectedAgentName).toBe('renamed-profile');
    expect(container.textContent).toContain('renamed-profile');
  });

  test('rename sends the captured revision after background refresh and preserves the refreshed catalog on conflict', async () => {
    await render();
    await act(async () => selectRow('custom'));
    await chooseAction('custom', 'Rename');
    await enterRename('renamed-profile');
    const refreshed = listedAgents.map((entry) => entry.agentId === 'profile-custom' ? { ...entry, description: 'Refreshed profile' } : entry);
    getAgents.mockResolvedValue({ workspaceId: 'project-workspace', revision: '2', agents: refreshed });
    await act(async () => {
      invalidateAgentsLoadCache(DIRECTORY);
      await useAgentsStore.getState().loadAgents(DIRECTORY);
    });
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('2');
    updateAgent.mockRejectedValue(new Error('Revision conflict'));
    await confirmAction('Rename');
    expect(updateAgent).toHaveBeenCalledWith('project-workspace', {
      expectedRevision: '1', agent: { ...agent('custom'), name: 'renamed-profile' },
    });
    expect(createAgent).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(useAgentsStore.getState().agentsByDirectory[DIRECTORY]).toEqual(refreshed);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('2');
    expect(useAgentsStore.getState().getAgentByName('renamed-profile', DIRECTORY)).toBeUndefined();
    expect(useAgentsStore.getState().selectedAgentName).toBe('custom');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  test('delete uses the stable id and captured revision and clears nonambient selection only after success', async () => {
    getAgents.mockImplementation(async (workspaceId) => ({
      workspaceId, revision: '1', agents: [agent(workspaceId === 'settings-workspace' ? 'settings-profile' : 'ambient-profile')],
    }));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    useUIStore.setState({ settingsProjectPath: SETTINGS_DIRECTORY });
    await render(SETTINGS_DIRECTORY);
    await act(async () => selectRow('settings-profile'));
    await chooseAction('settings-profile', 'Delete');
    expect(useAgentsStore.getState().selectedAgentName).toBe('settings-profile');
    expect(deleteAgent).not.toHaveBeenCalled();
    getAgents.mockResolvedValue({ workspaceId: 'settings-workspace', revision: '2', agents: [agent('settings-profile')] });
    await act(async () => {
      invalidateAgentsLoadCache(SETTINGS_DIRECTORY);
      await useAgentsStore.getState().loadAgents(SETTINGS_DIRECTORY);
    });
    await confirmAction('Delete');
    expect(deleteAgent).toHaveBeenCalledWith('settings-workspace', { agentId: 'profile-settings-profile', expectedRevision: '1' });
    expect(useAgentsStore.getState().selectedAgentName).toBeNull();
    expect(useAgentsStore.getState().agentsByDirectory[SETTINGS_DIRECTORY]).toEqual([]);
    expect(useAgentsStore.getState().agents).toEqual([agent('ambient-profile')]);
    expect(createAgent).not.toHaveBeenCalled();
    expect(updateAgent).not.toHaveBeenCalled();
  });

  test('a failed delete retains the nonambient profile and selection for retry', async () => {
    useUIStore.setState({ settingsProjectPath: SETTINGS_DIRECTORY });
    await render(SETTINGS_DIRECTORY);
    await act(async () => selectRow('custom'));
    await chooseAction('custom', 'Delete');
    deleteAgent.mockRejectedValue(new Error('Revision conflict'));
    await confirmAction('Delete');
    expect(deleteAgent).toHaveBeenCalledWith('settings-workspace', { agentId: 'profile-custom', expectedRevision: '1' });
    expect(useAgentsStore.getState().selectedAgentName).toBe('custom');
    expect(useAgentsStore.getState().getAgentByName('custom', SETTINGS_DIRECTORY)).toEqual(agent('custom'));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  test('an unavailable nonempty catalog keeps rows but disables server mutations', async () => {
    await render();
    getAgents.mockRejectedValueOnce(new Error('Native catalog unavailable'));
    await act(async () => {
      invalidateAgentsLoadCache(DIRECTORY);
      expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Native catalog unavailable');
    expect(container.textContent).toContain('custom');
    expect(container.textContent).toContain('Total 3');
    expect(useAgentsStore.getState().agentsByDirectory[DIRECTORY]).toEqual(listedAgents);
    expect(container.querySelector<HTMLButtonElement>('[data-settings-item="agents.create"]')?.disabled).toBe(true);
    await openMenu('custom');
    const actions = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((entry) => entry.textContent?.trim());
    expect(actions).toContain('Duplicate');
    expect(actions).not.toContain('Rename');
    expect(actions).not.toContain('Delete');
    expect(createAgent).not.toHaveBeenCalled();
    expect(updateAgent).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});
