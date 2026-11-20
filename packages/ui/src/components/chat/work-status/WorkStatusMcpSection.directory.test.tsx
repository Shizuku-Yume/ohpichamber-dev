import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { act } from 'react';
import { toast } from 'sonner';
import { useUIStore } from '@/stores/useUIStore';
import { useMcpStore, type McpServerRuntimeState } from '@/stores/useMcpStore';
import { setupMcpDirectoryHarness } from '@/components/mcp/mcpDirectory.fixture';
import { WorkStatusMcpSection } from './WorkStatusMcpSection';

const server = (enabled: boolean): McpServerRuntimeState => ({
  configuration: { serverId: 'docs', label: 'Docs', enabled, scope: 'project', transport: { type: 'http', url: 'https://mcp.example.test' } },
  catalogs: [],
});

describe('native work-status MCP directory ownership', () => {
  const { renderNode } = setupMcpDirectoryHarness();
  const original = useMcpStore.getState();
  const expanded = useUIStore.getState().workStatusExpandedSections;
  const connect = mock(async (_name: string, _directory?: string | null) => {});
  const disconnect = mock(async (_name: string, _directory?: string | null) => {});
  const ensureFresh = mock(async (_options: { directory?: string | null; silent?: boolean; maxAgeMs: number }) => {});

  beforeEach(() => {
    connect.mockClear(); disconnect.mockClear(); ensureFresh.mockClear();
    useUIStore.setState({ workStatusExpandedSections: { ...expanded, mcp: true } });
    useMcpStore.setState({
      byDirectory: { '/proj-a': { docs: server(true) }, '/proj-b': { docs: server(false) } },
      phaseKeys: { '/proj-a': 'ready', '/proj-b': 'ready' },
      connect, disconnect, ensureFresh,
    });
  });
  afterEach(() => {
    useMcpStore.setState(original, true);
    useUIStore.setState({ workStatusExpandedSections: expanded });
  });

  test('enables only the directory displayed, not the globally selected project', async () => {
    const host = await renderNode(<WorkStatusMcpSection directory="/proj-b" />);
    expect(ensureFresh).toHaveBeenCalledWith({ directory: '/proj-b', silent: true, maxAgeMs: 60000 });
    const toggle = host.querySelector<HTMLElement>('[role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    await act(async () => toggle?.click());
    expect(connect.mock.calls).toEqual([['docs', '/proj-b']]);
    expect(disconnect).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Sign in');
  });

  test('can disable a persisted server without fabricating an active catalog', async () => {
    const host = await renderNode(<WorkStatusMcpSection directory="/proj-a" />);
    expect(host.textContent).toContain('0/1');
    const toggle = host.querySelector<HTMLElement>('[role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    await act(async () => toggle?.click());
    expect(disconnect.mock.calls).toEqual([['docs', '/proj-a']]);
  });

  test('distinguishes an unread directory from a confirmed empty one', async () => {
    useMcpStore.setState({ byDirectory: {}, phaseKeys: {} });
    const host = await renderNode(<WorkStatusMcpSection directory="/unknown" />);
    expect(host.querySelector('p')?.textContent).toBeTruthy();
    await act(async () => useMcpStore.setState({ phaseKeys: { '/unknown': 'ready' } }));
    expect(host.textContent).toBe('');
  });

  test('surfaces an enable failure and releases the busy switch', async () => {
    connect.mockRejectedValueOnce(new Error('Workspace unavailable'));
    const error = spyOn(toast, 'error').mockImplementation(() => 'toast');
    try {
      const host = await renderNode(<WorkStatusMcpSection directory="/proj-b" />);
      const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
      await act(async () => toggle?.click());
      expect(error).toHaveBeenCalledWith('Workspace unavailable');
      expect(toggle?.getAttribute('aria-disabled')).not.toBe('true');
    } finally {
      error.mockRestore();
    }
  });
});
