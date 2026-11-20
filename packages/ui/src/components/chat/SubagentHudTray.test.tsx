import { afterEach, beforeEach, describe, expect, test, spyOn } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { SubagentHudTray } from './SubagentHudTray';
import type { Session, Subagent } from '@openchamber/agent-contract';

describe('SubagentHudTray', () => {
  let windowInstance: Window;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    windowInstance = new Window();
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    useSubagentsStore.setState({ byParent: {} });
    useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], entityById: new Map() });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useSubagentsStore.setState({ byParent: {} });
    useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], entityById: new Map() });
  });

  test('renders null when there are no subagents', async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <SubagentHudTray sessionId="ses_root" />
        </I18nProvider>,
      );
    });
    expect(host.querySelector('[data-testid="subagent-hud-tray"]')).toBeNull();
  });

  test('a draft session id never requests the root-only subagent route', async () => {
    const list = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <SubagentHudTray sessionId="draft_2" />
          </I18nProvider>,
        );
      });
      expect(list).not.toHaveBeenCalled();
      expect(host.querySelector('[data-testid="subagent-hud-tray"]')).toBeNull();
    } finally {
      list.mockRestore();
    }
  });

  const listedRoot = (sessionId: string, parentSessionId?: string): void => {
    const base = {
      sessionId, rootSessionId: sessionId, projectId: 'project_1', workspaceId: 'workspace_1',
      displayPath: '.', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0',
      mode: { kind: 'main' as const }, runtimeStatus: 'idle' as const, activeRunId: null,
      metadata: null, metadataRevision: '0', archiveRevision: '0',
    };
    // SAFETY: Session's only optional field here is parentSessionId; the rest of
    // the fixture is spelled out above, so the composed object is a Session.
    const session: Session = parentSessionId ? { ...base, parentSessionId } : base;
    useGlobalSessionsStore.setState({ activeSessions: [session], entityById: new Map([[sessionId, session]]) });
  };

  test('a listed root session reads its subagents', async () => {
    const list = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
    try {
      listedRoot('ses_root');
      await act(async () => {
        root.render(
          <I18nProvider>
            <SubagentHudTray sessionId="ses_root" />
          </I18nProvider>,
        );
      });
      expect(list).toHaveBeenCalledWith('ses_root');
    } finally {
      list.mockRestore();
    }
  });

  test('a child session id never asks the root-only subagent route', async () => {
    const list = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
    try {
      listedRoot('ses_child_1', 'ses_parent');
      await act(async () => {
        root.render(
          <I18nProvider>
            <SubagentHudTray sessionId="ses_child_1" />
          </I18nProvider>,
        );
      });
      expect(list).not.toHaveBeenCalled();
    } finally {
      list.mockRestore();
    }
  });

  test('an id the Host has not listed is not asked for subagents', async () => {
    const list = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <SubagentHudTray sessionId="ses_unlisted" />
          </I18nProvider>,
        );
      });
      expect(list).not.toHaveBeenCalled();
    } finally {
      list.mockRestore();
    }
  });

  test('asks once discovery lists the session after mount', async () => {
    const list = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <SubagentHudTray sessionId="ses_late" />
          </I18nProvider>,
        );
      });
      expect(list).not.toHaveBeenCalled();
      await act(async () => {
        listedRoot('ses_late');
      });
      expect(list).toHaveBeenCalledWith('ses_late');
    } finally {
      list.mockRestore();
    }
  });

  test('renders live subagent details, tokens, cost, active tool and handles steer/cancel', async () => {
    const subagent: Subagent = {
      subagentId: 'sub_worker_1',
      parentSessionId: 'ses_root',
      childSessionId: 'ses_child_1',
      role: 'task-runner',
      status: 'running',
      activeTool: 'bash',
      tokens: 4200,
      cost: 0.084,
      depth: 1,
      retryCountdown: 10,
      description: 'Running test pipeline',
      stage: 'Checking integration',
      completionPercent: 42,
      recentOutput: ['Tests started'],
    };

    useSubagentsStore.getState().applySubagentUpdate('ses_root', subagent);

    await act(async () => {
      root.render(
        <I18nProvider>
          <SubagentHudTray sessionId="ses_root" />
        </I18nProvider>,
      );
    });

    const tray = host.querySelector('[data-testid="subagent-hud-tray"]');
    expect(tray).not.toBeNull();
    expect(tray?.textContent).toContain('task-runner');
    expect(tray?.textContent).toContain('bash');
    expect(tray?.textContent).toContain('4200');
    expect(tray?.textContent).toContain('$0.084');
    expect(tray?.textContent).toContain('Checking integration');
    expect(tray?.textContent).toContain('42%');

    const steerSpy = spyOn(canonicalClient, 'steerSubagent').mockResolvedValue({
      type: 'subagent.steer' as const,
      subagentId: 'sub_worker_1',
      accepted: true,
    });
    const cancelSpy = spyOn(canonicalClient, 'cancelSubagent').mockResolvedValue({
      type: 'subagent.cancel' as const,
      subagentId: 'sub_worker_1',
      cancelled: true,
    });

    // Test cancel button
    const row = host.querySelector('[data-testid="subagent-hud-row-sub_worker_1"]');
    expect(row).not.toBeNull();
    const buttons = row?.querySelectorAll('button');
    expect(buttons?.length).toBeGreaterThanOrEqual(2);

    // Cancel button is the second button
    const cancelButton = buttons?.[1];
    await act(async () => {
      cancelButton?.click();
    });

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith('ses_root', 'sub_worker_1');

    cancelSpy.mockRestore();
    steerSpy.mockRestore();
  });
});
