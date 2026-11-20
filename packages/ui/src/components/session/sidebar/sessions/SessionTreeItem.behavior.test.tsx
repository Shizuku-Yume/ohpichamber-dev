import { describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@openchamber/agent-contract';
import type { SessionNodeItemProps } from './SessionNodeItem';
import type { SessionTreeItemProps } from './SessionTreeItem';
import { installHookTestDom } from '../test-utils/testDom';
import { I18nProvider } from '@/lib/i18n';

const renderedRows: SessionNodeItemProps[] = [];

mock.module('./SessionNodeItem', () => ({
  SessionNodeItem: (props: SessionNodeItemProps) => {
    renderedRows.push(props);
    return null;
  },
}));

mock.module('./useSessionActions', () => ({
  useSessionActions: (args: {
    setEditingId: (id: string | null) => void;
    setEditingRowKey: (key: string | null) => void;
    setEditTitle: (title: string) => void;
    editingOccurrenceKey: string | null;
  }) => ({
    handleSaveEdit: () => undefined,
    handleCancelEdit: () => undefined,
    handleSessionSelect: () => undefined,
    handleSessionDoubleClick: (id: string, title: string) => {
      args.setEditingId(id);
      args.setEditingRowKey(args.editingOccurrenceKey ?? null);
      args.setEditTitle(title);
    },
    handleDeleteSession: () => undefined,
    handleRestoreSession: () => undefined,
  }),
}));

const { SessionTreeItem } = await import('./SessionTreeItem');

const noopStartSessionWorktreeMenuLoad: SessionTreeItemProps['startSessionWorktreeMenuLoad'] = () => ({
  cachedTargets: [],
  refreshTargets: Promise.resolve([]),
});

const session = (sessionId: string): Session => ({
  sessionId,
  rootSessionId: sessionId,
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: '/workspace',
  createdAt: 1,
  updatedAt: 1,
  epoch: '1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  title: 'Shared title', metadata: {},
  metadataRevision: '1',
  archiveRevision: '0',
});

describe('SessionTreeItem public behavior', () => {
  test('keeps duplicate row state parent-owned while targeting one rename occurrence', async () => {
    const dom = installHookTestDom();
    const root = createRoot(dom.container);
    const sharedSession = session('same-session');
    const rowNode = { session: sharedSession, children: [], worktree: null };
    const noop = () => undefined;

    const Harness = () => {
      const [editingId, setEditingId] = React.useState<string | null>(null);
      const [editingRowKey, setEditingRowKey] = React.useState<string | null>(null);
      const [editTitle, setEditTitle] = React.useState('');
      const [menuKey, setMenuKey] = React.useState<string | null>(null);
      const rows = [
        { renderContext: 'project' as const, groupDirectory: '/workspace', rowKey: 'project:session:same-session' },
        { renderContext: 'mixed-compact' as const, groupDirectory: '/workspace', rowKey: 'mixed:session:same-session' },
      ];
      return <>{rows.map((context) => <SessionTreeItem
        key={context.renderContext}
        node={rowNode}
        pinnedSessionIds={new Set()}
        expandedParents={new Set()}
        editingId={editingId}
        editingRowKey={editingRowKey}
        setEditingId={setEditingId}
        setEditingRowKey={setEditingRowKey}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        toggleParent={noop}
        openSidebarMenuKey={menuKey}
        setOpenSidebarMenuKey={setMenuKey}
        allowReselect={false}
        deleteSessionConfirm={null}
        setDeleteSessionConfirm={noop}
        startFolderRename={noop}
        startSessionWorktreeMenuLoad={noopStartSessionWorktreeMenuLoad}
        mobileVariant={false}
        alwaysShowActions={false}
        {...context}
      />)}</>;
    };

    try {
      await act(async () => root.render(<I18nProvider><Harness /></I18nProvider>));
      expect(renderedRows).toHaveLength(2);

      await act(async () => renderedRows[0]?.handleSessionDoubleClick(sharedSession.sessionId, sharedSession.title ?? ''));
      expect(renderedRows).toHaveLength(4);
      expect(renderedRows.slice(-2).map((row) => [row.editingId, row.editingRowKey, row.editTitle]))
        .toEqual([
          [sharedSession.sessionId, 'project:session:same-session', sharedSession.title ?? ''],
          [sharedSession.sessionId, 'project:session:same-session', sharedSession.title ?? ''],
        ]);

      await act(async () => renderedRows[3]?.setOpenSidebarMenuKey('session-menu:recent:session:same-session'));
      expect(renderedRows).toHaveLength(6);
      expect(renderedRows.slice(-2).map((row) => row.openSidebarMenuKey))
        .toEqual(['session-menu:recent:session:same-session', 'session-menu:recent:session:same-session']);
    } finally {
      await act(async () => root.unmount());
      renderedRows.length = 0;
      dom.restore();
    }
  });
});
