import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { hostFilesystem } from '@/lib/host-filesystem';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { deriveRecentSessions } from '../recent/activitySections';
import { applyGlobalSessionStatusEvent, replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import {
  buildActiveSessionNode,
  buildSidebarSessionProjection,
  getDescendantIds,
  partitionSidebarSessions,
  projectSidebarActiveSessions,
  projectSidebarCollection,
  useRecentSessionCollection,
} from './sessionCollection';

const installMinimalDom = () => {
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const setGlobal = (name: string, value: unknown) => {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  class ElementStub {}
  const documentStub: Record<string, unknown> = {
    nodeType: 9, defaultView: globalThis, activeElement: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
  };
  const container = {
    nodeType: 1, tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: documentStub,
    addEventListener: () => undefined, removeEventListener: () => undefined,
  };
  documentStub.documentElement = container;
  documentStub.body = container;
  setGlobal('document', documentStub);
  setGlobal('window', globalThis);
  setGlobal('Element', ElementStub);
  setGlobal('HTMLElement', ElementStub);
  setGlobal('HTMLIFrameElement', ElementStub);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  return {
    container: container as unknown as Element,
    restore: () => {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
};

const session = (sessionId: string, displayPath: string | null): Session => {
  const workspaceId = `workspace:${displayPath ?? sessionId}`;
  if (displayPath) registerWorkspaceDirectory(workspaceId, displayPath);
  return {
    sessionId, projectId: 'project', workspaceId, displayPath: displayPath ?? '.', rootSessionId: sessionId,
    createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0',
  };
};

resetWorkspaceDirectories();

describe('projectSidebarActiveSessions', () => {
  test('keeps global precedence and order, then appends missing live sessions', () => {
    const global = [session('global-b', '/workspace/b'), session('global-a', '/workspace/a')];
    const live = [session('global-a', '/workspace/a'), session('live-c', '/workspace/c')];

    const projected = projectSidebarActiveSessions({
      globalActiveSessions: global,
      liveSessions: live,
    });
    expect(projected.map((entry) => entry.sessionId)).toEqual(['global-b', 'global-a', 'live-c']);
    expect(projected[1]).toBe(global[1]);
  });

  test('retains global records with missing or unknown directories', () => {
    const sessions = [session('unknown', '/workspace/unknown'), session('empty', null)];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: sessions,
      liveSessions: [],
    }).map((entry) => entry.sessionId)).toEqual(['unknown', 'empty']);
  });

  test('retains active global records from deleted worktrees', () => {
    const restored = { ...session('restored', '/deleted/worktrees/feature'), updatedAt: 1 };

    expect(projectSidebarActiveSessions({
      globalActiveSessions: [restored],
      liveSessions: [],
    }).map((entry) => entry.sessionId)).toEqual(['restored']);
  });

});

describe('projectSidebarCollection', () => {
  test('returns the same structural projection for unchanged inputs without module caching', () => {
    const globalActiveSessions = [session('a', '/workspace/a'), session('b', '/workspace/b')];
    const input = {
      globalActiveSessions,
      liveSessions: [],
    };

    const beforeSelection = projectSidebarCollection(input);
    const afterSelection = projectSidebarCollection(input);

    expect(afterSelection).toEqual(beforeSelection);
  });

  test('rebuilds when a structural session collection input changes', () => {
    const input = {
      globalActiveSessions: [session('a', '/workspace/a')],
      liveSessions: [],
    };

    const before = projectSidebarCollection(input);
    const after = projectSidebarCollection({
      ...input,
      globalActiveSessions: [session('a', '/workspace/a'), session('b', '/workspace/a')],
    });

    expect(after).not.toBe(before);
    expect(after.map((entry) => entry.sessionId)).toEqual(['a', 'b']);
  });

  test('keeps project membership independent from Recent active membership', () => {
    const input = {
      globalActiveSessions: [session('old-root', '/workspace/a')],
      liveSessions: [],
    };
    const projectBefore = projectSidebarCollection(input);
    const recentBefore = deriveRecentSessions(projectBefore, new Set(), 200_000_000);
    const projectAfter = projectSidebarCollection(input);
    const recentAfter = deriveRecentSessions(projectAfter, new Set(['old-root']), 200_000_000);

    expect(projectAfter).toEqual(projectBefore);
    expect(recentBefore).toEqual([]);
    expect(recentAfter.map((entry) => entry.sessionId)).toEqual(['old-root']);
  });

  test('keeps managed Chats in a dedicated projection and out of project and Recent ownership', () => {
    const managed = session('managed', '/home/.config/openchamber/chats/2026-08-24/session-managed');
    const project = session('project', '/workspace/a');
    const projects = projectSidebarCollection({
      globalActiveSessions: [managed, project],
      liveSessions: [],
    });

    expect(projects.map((entry) => entry.sessionId)).toEqual(['project']);
    expect(partitionSidebarSessions([managed, project]).chatSessions.map((entry) => entry.sessionId)).toEqual(['managed']);
    expect(deriveRecentSessions(projects, new Set(['managed', 'project']), 200_000_000)
      .map((entry) => entry.sessionId)).toEqual(['project']);
  });

  test('keeps a canonical managed chat visible when the server root uses different home casing', () => {
    const managed = session('canonical-chat', '/HOME/.config/openchamber/chats/day/session-a');
    const project = session('project', '/workspace/a');
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [managed, project], liveSessions: [],
      pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
    });
    expect(projection.chatSessions.map(entry => entry.sessionId)).toEqual(['canonical-chat']);
    expect(projection.projectSessions.map(entry => entry.sessionId)).toEqual(['project']);
    expect(projection.orderedSessions.map(entry => entry.sessionId)).toContain('canonical-chat');
  });

  test('excludes a /btw fork before project ownership and restores it when the marker is removed', () => {
    const fork = {
      ...session('fork', '/home/.config/openchamber/chats/2026-08-24/session-fork'),
      metadata: { openchamber: { kind: 'btw' as const, originalSessionID: 'parent' } },
    };
    const project = session('project', '/workspace/a');
    const input = {
      liveSessions: [],
    };

    expect(projectSidebarCollection({ ...input, globalActiveSessions: [fork, project] }).map((entry) => entry.sessionId)).toEqual(['project']);
    expect(partitionSidebarSessions([fork]).chatSessions).toEqual([]);

    const promoted = {
      ...fork,
      metadata: { openchamber: {} },
    };
    expect(partitionSidebarSessions([promoted]).chatSessions.map((entry) => entry.sessionId)).toEqual(['fork']);
  });

  test('keeps a ranked managed root and its active child in the Chats hierarchy', () => {
    const managedRoot = { ...session('managed-root', '/home/.config/openchamber/chats/2026-08-24/session-root'), createdAt: 1, updatedAt: 1 };
    const managedChild = {
      ...session('managed-child', '/home/.config/openchamber/chats/2026-08-24/session-root'),
      parentSessionId: 'managed-root', createdAt: 2, updatedAt: 2,
    };
    const projectRoot = { ...session('project-root', '/workspace/a'), createdAt: 3, updatedAt: 3 };

    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [projectRoot, managedRoot, managedChild],
      liveSessions: [],
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map([['managed-root', 10]]),
    });

    expect(projection.projectSessions.map((entry) => entry.sessionId)).toEqual(['project-root']);
    expect(projection.chatSessions.map((entry) => entry.sessionId)).toEqual(['managed-root', 'managed-child']);
    expect(projection.orderedSessions.map((entry) => entry.sessionId)).toEqual(['managed-root', 'managed-child', 'project-root']);
    expect(projection.childrenMap.get('managed-root')?.map((entry) => entry.sessionId)).toEqual(['managed-child']);
  });

});

describe('useRecentSessionCollection', () => {
  test('updates mounted Recent membership when global active status changes', async () => {
    const dom = installMinimalDom();
    const root: Root = createRoot(dom.container);
    const oldSession = { ...session('old-root', '/workspace/a'), createdAt: 1, updatedAt: 1 };
    let renderedIds: string[] = [];
    let renderCount = 0;
    let updatedReadCount = 0;
    Object.defineProperty(oldSession, 'updatedAt', {
      get: () => {
        updatedReadCount += 1;
        return 1;
      },
    });
    updatedReadCount = 0;
    const Harness = () => {
      renderCount += 1;
      const recent = useRecentSessionCollection({
        enabled: true,
        pinnedSessionIds: new Set(),
        sessionOrderRanks: new Map(),
        sessions: [oldSession],
      });
      renderedIds = recent.map((entry) => entry.sessionId);
      return null;
    };

    try {
      replaceGlobalSessionStatusById(new Map());
      await act(async () => root.render(React.createElement(Harness)));
      expect(renderedIds).toEqual([]);

      await act(async () => {
        applyGlobalSessionStatusEvent('/workspace/a', {
          type: 'session.status', sessionId: 'old-root', epoch: 'epoch_1', sequence: '1', timestamp: 1,
          runtimeStatus: 'running', activeRunId: 'run_1',
        });
      });
      expect(renderedIds).toEqual(['old-root']);
      const activeRenderCount = renderCount;
      const activeDeriveOperationCount = updatedReadCount;

      await act(async () => {
        applyGlobalSessionStatusEvent('/other-workspace', {
          type: 'session.status', sessionId: 'old-root', epoch: 'epoch_1', sequence: '2', timestamp: 2,
          runtimeStatus: 'awaiting_input', activeRunId: 'run_1',
        });
      });
      expect(renderCount).toBe(activeRenderCount);
      expect(updatedReadCount).toBe(activeDeriveOperationCount);
    } finally {
      await act(async () => root.unmount());
      replaceGlobalSessionStatusById(new Map());
      dom.restore();
    }
  });

});

describe('getDescendantIds', () => {
  test('returns a depth-first subtree without exposing session entities', () => {
    const childA = session('child-a', '/workspace/a');
    const grandchild = session('grandchild', '/workspace/a');
    const childB = session('child-b', '/workspace/a');
    const childrenMap = new Map([
      ['root', [childA, childB]],
      ['child-a', [grandchild]],
    ]);

    expect(getDescendantIds(childrenMap, 'root'))
      .toEqual(['child-a', 'grandchild', 'child-b']);
  });

  test('cuts a parent cycle with deterministic unique descendants and excludes the root', () => {
    const childA = session('a', '/workspace/a');
    const childB = session('b', '/workspace/a');
    const childC = session('c', '/workspace/a');
    const childrenMap = new Map([
      ['root', [childA]],
      ['a', [childB, childC]],
      ['b', [childA]],
    ]);

    expect(getDescendantIds(childrenMap, 'root')).toEqual(['a', 'b', 'c']);
    expect(new Set(getDescendantIds(childrenMap, 'root')).size).toBe(3);
  });
});

describe('buildActiveSessionNode', () => {
  const archived = (sessionId: string): Session => ({ ...session(sessionId, '/workspace'), archivedAt: 2 });

  test('nests every active descendant so archive reaches grandchildren', () => {
    const child = session('child', '/workspace');
    const grandchild = session('grandchild', '/workspace');
    const childrenMap = new Map([
      ['root', [child]],
      ['child', [grandchild]],
    ]);

    const node = buildActiveSessionNode(childrenMap, session('root', '/workspace'));

    expect(node.children.map((entry) => entry.session.sessionId)).toEqual(['child']);
    expect(node.children[0]?.children.map((entry) => entry.session.sessionId)).toEqual(['grandchild']);
    expect(node.worktree).toBeNull();
  });

  test('cuts archived children at every depth', () => {
    const activeChild = session('active-child', '/workspace');
    const archivedChild = archived('archived-child');
    const archivedGrandchild = archived('archived-grandchild');
    const childrenMap = new Map([
      ['root', [activeChild, archivedChild]],
      ['active-child', [archivedGrandchild]],
      ['archived-child', [session('hidden-leaf', '/workspace')]],
    ]);

    const node = buildActiveSessionNode(childrenMap, session('root', '/workspace'));

    expect(node.children.map((entry) => entry.session.sessionId)).toEqual(['active-child']);
    expect(node.children[0]?.children).toEqual([]);
  });

  test('stops on a parent cycle', () => {
    const a = session('a', '/workspace');
    const root = session('root', '/workspace');
    const childrenMap = new Map([
      ['root', [a]],
      ['a', [root]],
    ]);

    const node = buildActiveSessionNode(childrenMap, root);

    expect(node.children.map((entry) => entry.session.sessionId)).toEqual(['a']);
    expect(node.children[0]?.children).toEqual([]);
  });
});

const originalHomeInfo = hostFilesystem.getFilesystemHomeInfo;
hostFilesystem.getFilesystemHomeInfo = async () => ({
  home: '/home',
  canonicalChatsRoot: '/HOME/.config/openchamber/chats',
  canonicalLegacyChatsRoot: '/HOME/.config/openchamber/chats',
});
await ensureChatsRootDirectory();
hostFilesystem.getFilesystemHomeInfo = originalHomeInfo;
