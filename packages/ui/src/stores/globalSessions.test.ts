<<<<<<< HEAD
import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { compareSessionRevision, isSessionDiscoveryFailed, mergeSessionDirectoryMetadata, registerWorkspaceDirectory, resetWorkspaceDirectories, resolveWorkspaceDirectory, splitGlobalSessionsByArchived } from './globalSessions';
=======
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { opencodeClient } from '@/lib/opencode/client';
import { describe, expect, test } from 'bun:test'
import type { SessionListOptions, SessionPage } from '@/lib/opencode/client'
import type { Session } from '@/lib/opencode/model'
import { OpenCode } from '@opencode/client'
import { switchRuntimeEndpoint } from '@/lib/runtime-switch'
>>>>>>> bc50ba56a

const session = (extra: Partial<Session> = {}): Session => ({
  sessionId: 'ses_one', projectId: 'pro_one', workspaceId: 'wsp_one', displayPath: 'repo',
  rootSessionId: 'ses_one', createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const }, title: 'One', metadata: {},
  metadataRevision: '1', archiveRevision: '0', ...extra,
});

beforeEach(resetWorkspaceDirectories);

describe('native global sessions', () => {
  test('splits active and archived native records by presence of archivedAt', () => {
    const active = session();
    const archived = session({ sessionId: 'ses_archived', archivedAt: 0 });
    const restored = session({ sessionId: 'ses_restored', archiveRevision: '2' });
    const split = splitGlobalSessionsByArchived([active, archived, restored]);
    expect(split.active).toEqual([active, restored]);
    expect(split.archived).toEqual([archived]);
  });

  test('binds only a resolved workspace identity and clears bindings on reset', () => {
    expect(resolveWorkspaceDirectory('wsp_one')).toBeNull();
    registerWorkspaceDirectory('wsp_one', '/repo/');
    expect(resolveWorkspaceDirectory('wsp_one')).toBe('/repo');
    resetWorkspaceDirectories();
    expect(resolveWorkspaceDirectory('wsp_one')).toBeNull();
  });

  test.each(['repo', './repo', 'C:repo'])('does not admit relative or display-path hint %s', (directory) => {
    registerWorkspaceDirectory('wsp_one', directory);
    expect(resolveWorkspaceDirectory('wsp_one')).toBeNull();
  });

  test('matches native per-session, workspace and project failure scopes independently', () => {
    const record = session();
    expect(isSessionDiscoveryFailed(record, { ses_one: 'METADATA_READ_FAILED' })).toBe(true);
    expect(isSessionDiscoveryFailed(record, { wsp_one: 'SERVICE_UNAVAILABLE' })).toBe(true);
    expect(isSessionDiscoveryFailed(record, { pro_one: 'SERVICE_UNAVAILABLE' })).toBe(true);
    expect(isSessionDiscoveryFailed(record, { ses_sibling: 'METADATA_READ_FAILED' })).toBe(false);
    expect(isSessionDiscoveryFailed(record, { wsp_sibling: 'SERVICE_UNAVAILABLE' })).toBe(false);
    expect(isSessionDiscoveryFailed(record, { pro_sibling: 'SERVICE_UNAVAILABLE' })).toBe(false);
  });

<<<<<<< HEAD
  test('compares decimal uint64 revisions without numeric precision loss', () => {
    expect(compareSessionRevision('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
    expect(compareSessionRevision('10', '9')).toBeGreaterThan(0);
    expect(compareSessionRevision('0', '0')).toBe(0);
  });
=======
describe('listGlobalSessionPages', () => {
  test('a retired page fails without publishing an empty or partial snapshot', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://page-a.test', runtimeKey: 'page-a' })
    const pages: Session[][] = []
    const load = listGlobalSessionPages(async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'http://page-b.test', runtimeKey: 'page-b' })
      return { sessions: [], cursor: {} }
    }, { pageSize: 1, onPage: (page) => pages.push(page) })
    await expect(load).rejects.toThrow('Runtime instance changed')
    expect(pages).toEqual([])
  })

  test('pagination never issues the next old-directory request after a round trip', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://page-a.test', runtimeKey: 'page-a' })
    let calls = 0
    const load = listGlobalSessionPages(async () => {
      calls++
      return { sessions: [makeSession({ id: `ses_${calls}` })], cursor: calls === 1 ? { next: 'next' } : {} }
    }, { directory: '/old', pageSize: 1, onPage: () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'http://page-b.test', runtimeKey: 'page-b' })
      switchRuntimeEndpoint({ apiBaseUrl: 'http://page-a.test', runtimeKey: 'page-a' })
    } })
    await expect(load).rejects.toThrow('Runtime instance changed')
    expect(calls).toBe(1)
  })

  test('failure after an instance change stops the old page retry', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://page-a.test', runtimeKey: 'page-a' })
    let calls = 0
    const load = listGlobalSessionPages(async () => {
      calls++
      switchRuntimeEndpoint({ apiBaseUrl: 'http://page-b.test', runtimeKey: 'page-b' })
      throw new Error('offline')
    }, { pageSize: 1 })
    await expect(load).rejects.toThrow('offline')
    expect(calls).toBe(1)
  })

  test('uses the next cursor from the SDK HTTP response rather than guessing from session timestamps', async () => {
    const cursors: Array<string | null> = []
    const apiClient = OpenCode.make({
      baseUrl: 'https://sessions.test',
      fetch: async (request) => {
        const url = new URL(request instanceof Request ? request.url : request.toString())
        const cursor = url.searchParams.get('cursor')
        cursors.push(cursor)
        return cursor === null
          ? Response.json({ data: [
            makeSession({ id: 'first', time: { created: 1, updated: 20 } }),
            makeSession({ id: 'second', time: { created: 1, updated: 10 } }),
          ], cursor: { next: 'opaque-8' } })
          : Response.json({ data: [makeSession({ id: 'last', time: { created: 1, updated: 5 } })], cursor: {} })
      },
    })
    const sessions = await listGlobalSessionPages(async ({ cursor, limit }) => {
      const response = await apiClient.session.list({ cursor, limit })
      return { sessions: response.data.map((session) => makeSession(session)), cursor: { next: response.cursor.next ?? undefined } }
    }, { pageSize: 2 })
    expect(cursors).toEqual([null, 'opaque-8'])
    expect(sessions.map((session) => session.id)).toEqual(['first', 'second', 'last'])
  })
>>>>>>> bc50ba56a

  test('keeps newer metadata while accepting independent native runtime and archive changes', () => {
    const existing = session({ metadataRevision: '9007199254740993', archivedAt: 3, archiveRevision: '1' });
    const incoming = session({ title: 'Stale', metadata: {}, metadataRevision: '9007199254740992', updatedAt: 5, archiveRevision: '2', workspaceId: 'wsp_moved' });
    const merged = mergeSessionDirectoryMetadata(incoming, existing);
    expect(merged.metadata).toBe(existing.metadata);
    expect(merged.metadataRevision).toBe('9007199254740993');
    expect(merged.updatedAt).toBe(5);
    expect(merged.workspaceId).toBe('wsp_moved');
    expect(merged.archivedAt).toBeUndefined();
  });

  test('keeps a newer archive revision while accepting new Host metadata', () => {
    const existing = session({ archivedAt: 3, archiveRevision: '9007199254740993' });
    const incoming = session({ title: 'Renamed', metadata: {}, metadataRevision: '2', archiveRevision: '9007199254740992' });
    const merged = mergeSessionDirectoryMetadata(incoming, existing);
    expect(merged.archivedAt).toBe(3);
    expect(merged.archiveRevision).toBe('9007199254740993');
    expect(merged.metadata).toBe(incoming.metadata);
  });

  test('confirmed missing Host metadata replaces older metadata', () => {
    const existing = session({ metadata: null, metadataRevision: '0' });
    const incoming = session({ metadata: null, metadataRevision: '0', updatedAt: 3 });
    expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
  });

  test('unchanged revisions do not deduplicate native execution changes', () => {
    const existing = session();
    const incoming = session({ runtimeStatus: 'running', activeRunId: 'run_one', headSequence: '1' });
    expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
  });
});
