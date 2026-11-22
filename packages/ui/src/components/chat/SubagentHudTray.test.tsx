import { afterEach, beforeEach, describe, expect, mock, test, spyOn } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { canonicalClient } from '@/api/canonicalClient';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import type { Session, Subagent } from '@openchamber/agent-contract';

describe('SubagentHudTray', () => {
  let windowInstance: Window;
  let host: HTMLDivElement;
  let root: Root;
  let I18nProvider: typeof import('@/lib/i18n').I18nProvider;
  let SubagentHudTray: typeof import('./SubagentHudTray').SubagentHudTray;

  beforeEach(async () => {
    windowInstance = new Window();
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      Event: windowInstance.Event,
      KeyboardEvent: windowInstance.KeyboardEvent,
      HTMLInputElement: windowInstance.HTMLInputElement,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    useSubagentsStore.setState({ byParent: {} });
    useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], entityById: new Map() });
    host = document.createElement('div');
    document.body.append(host);
    const { createRoot } = await import('react-dom/client');
    ({ I18nProvider } = await import('@/lib/i18n'));
    ({ SubagentHudTray } = await import('./SubagentHudTray'));
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

    const submitParent = mock((event: React.FormEvent) => event.preventDefault());
    await act(async () => {
      root.render(
        <I18nProvider>
          <form onSubmit={submitParent}>
            <textarea defaultValue="Unsent parent draft" />
            <SubagentHudTray sessionId="ses_root" />
          </form>
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

    const row = host.querySelector('[data-testid="subagent-hud-row-sub_worker_1"]');
    expect(row).not.toBeNull();

    try {
      for (const method of ['click', 'enter'] as const) {
        const toggle = row?.querySelector<HTMLButtonElement>('button[title="Steer"]');
        await act(async () => toggle?.click());
        const input = row?.querySelector('input');
        expect(input).not.toBeNull();
        expect(host.querySelectorAll('form')).toHaveLength(1);
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, method);
          input?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => {
          if (method === 'click') {
            const send = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Send');
            expect(send?.type).toBe('button');
            send?.click();
          } else {
            const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            input?.dispatchEvent(enter);
            expect(enter.defaultPrevented).toBe(true);
          }
        });
        expect(steerSpy).toHaveBeenLastCalledWith('ses_root', 'sub_worker_1', method);
      }
      expect(steerSpy).toHaveBeenCalledTimes(2);
      expect(submitParent).not.toHaveBeenCalled();
      expect(host.querySelector('textarea')?.value).toBe('Unsent parent draft');

      const cancel = row?.querySelector<HTMLButtonElement>('button[title="Cancel"]');
      await act(async () => cancel?.click());
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith('ses_root', 'sub_worker_1');
    } finally {
      cancelSpy.mockRestore();
      steerSpy.mockRestore();
    }
  });
});
