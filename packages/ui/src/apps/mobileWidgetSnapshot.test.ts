import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { buildMobileWidgetSnapshot, installMobileWidgetSnapshotBridge } from './mobileWidgetSnapshot';

const session = (id: string, extra: Partial<Session> = {}, workbench?: { lastIdleAt?: number; viewedAt?: number }): Session => ({
  sessionId: id,
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: id,
  rootSessionId: id,
  createdAt: 1,
  updatedAt: 1,
  epoch: '1',
  headSequence: '1',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' as const },
  metadataRevision: '1',
  archiveRevision: '0',
  title: `Session ${id}`,
  metadata: (workbench ? { openchamber: { workbench } } : null) as unknown as SessionMetadata,
  ...extra,
});

describe('mobileWidgetSnapshot', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = globalThis;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://widget.test', runtimeKey: 'widget-runtime' });
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useProjectsStore.setState({ projects: [{ id: 'p1', path: '/repo', label: 'Repo' }] });
  });
  afterEach(() => {
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  });

  test('counts unread attention and surfaces top-level sessions', () => {
    const unreadTop = session('ses-1', {}, { lastIdleAt: 20, viewedAt: 10 });
    const readTop = session('ses-2', {}, { lastIdleAt: 10, viewedAt: 10 });
    const unreadSubtask = session('ses-3', { parentSessionId: 'ses-1' }, { lastIdleAt: 20 });

    useGlobalSessionsStore.getState().applySnapshot([unreadTop, readTop, unreadSubtask], [], 'ready');

    const snapshot = buildMobileWidgetSnapshot();
    expect(snapshot.runtimeKey).toBe('widget-runtime');
    // Subtask is not unread on its own; only ses-1 is unread
    expect(snapshot.attentionCount).toBe(1);
    expect(snapshot.recentSessions.map((s) => s.id)).toEqual(['ses-1', 'ses-2']);
    expect(snapshot.recentSessions.find((s) => s.id === 'ses-1')?.unread).toBe(true);
    expect(snapshot.recentSessions.find((s) => s.id === 'ses-2')?.unread).toBe(false);
  });

  test('bridge installs on window and returns valid JSON', () => {
    installMobileWidgetSnapshotBridge();
    const bridge = (window as unknown as { __OPENCHAMBER_WIDGET_SNAPSHOT__?: () => string | null }).__OPENCHAMBER_WIDGET_SNAPSHOT__;
    expect(typeof bridge).toBe('function');
    const raw = bridge?.();
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.runtimeKey).toBe('widget-runtime');
  });
});
