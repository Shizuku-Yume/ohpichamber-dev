import { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Agent } from '@openchamber/agent-contract';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { SyncProvider } from '@/sync/sync-context';
import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useAgentColors } from './useAgentColors';

test('consumers share allocations and update together on roster and theme changes', async () => {
  const dom = new Window({ url: 'http://agent-colors.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const previousAgents = useAgentsStore.getState().agentsByDirectory;
  const previousSelectedAgent = useAgentsStore.getState().selectedAgentName;
  const directory = '/agent-colors';
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    fetch: async () => Response.json({ themes: [] }), IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const agent = (agentId: string): Agent => ({
    agentId, name: agentId, description: '', model: null, allowedTools: [],
  });
  const agents = ['architect', 'build', 'plan', 'simplifier'].map(agent);
  useAgentsStore.setState({ agentsByDirectory: { [directory]: agents } });
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const seen = new Set<ReturnType<typeof useAgentColors>>();
  let changeTheme = () => {};
  function Probe({ directory: probeDirectory }: { directory: string }) {
    const resolve = useAgentColors(probeDirectory);
    seen.add(resolve);
    return <span>{resolve('build').color}</span>;
  }
  function Controls() {
    const theme = useThemeSystem();
    changeTheme = () => theme.setTheme(theme.currentTheme.metadata.variant === 'dark' ? 'openchamber-light' : 'openchamber-dark');
    return null;
  }
  try {
    await act(async () => root.render(<SyncProvider directory={directory}><ThemeSystemProvider><Controls />{Array.from({ length: 100 }, (_, index) => <Probe key={index} directory={directory} />)}</ThemeSystemProvider></SyncProvider>));
    expect(seen.size).toBe(1);
    await act(async () => useAgentsStore.setState({ selectedAgentName: 'plan' }));
    expect(seen.size).toBe(1);
    await act(async () => useAgentsStore.setState({ agentsByDirectory: { [directory]: agents, '/other': [agent('other')] } }));
    expect(seen.size).toBe(1);
    await act(async () => useAgentsStore.setState({ agentsByDirectory: { [directory]: agents.map((entry) => ({ ...entry, name: 'Renamed' })) } }));
    expect(seen.size).toBe(2);
    const [initial, renamed] = [...seen];
    for (const { agentId } of agents) expect(renamed(agentId)).toEqual(initial(agentId));
    await act(async () => changeTheme());
    expect(seen.size).toBe(3);
    await act(async () => useAgentsStore.setState((state) => ({ agentsByDirectory: { ...state.agentsByDirectory, '/other': [agent('other')] } })));
    expect(seen.size).toBe(3);
    await act(async () => root.render(<SyncProvider directory={directory}><ThemeSystemProvider><Controls />{Array.from({ length: 100 }, (_, index) => <Probe key={index} directory="/other" />)}</ThemeSystemProvider></SyncProvider>));
    expect(seen.size).toBe(4);
    for (const resolve of seen) expect(resolve('build').color).toBe('var(--status-success)');
    expect(container.querySelectorAll('span').length).toBe(100);
  } finally {
    await act(async () => root.unmount());
    useAgentsStore.setState({ agentsByDirectory: previousAgents, selectedAgentName: previousSelectedAgent });
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
