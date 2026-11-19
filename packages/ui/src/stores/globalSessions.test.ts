import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { compareSessionRevision, isSessionDiscoveryFailed, mergeSessionDirectoryMetadata, registerWorkspaceDirectory, resetWorkspaceDirectories, resolveWorkspaceDirectory, resolveWorkspaceDisplayPath, splitGlobalSessionsByArchived } from './globalSessions';

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
  test('resolves relative workspace displayPath values against their project root and rejects absolute paths', () => {
    expect(resolveWorkspaceDisplayPath('/srv/chats', '.')).toBe('/srv/chats');
    expect(resolveWorkspaceDisplayPath('/srv/chats/', '2026-11-16/session-one')).toBe('/srv/chats/2026-11-16/session-one');
    expect(resolveWorkspaceDisplayPath('/srv/repo', '../repo-wt')).toBe('/srv/repo-wt');
    expect(resolveWorkspaceDisplayPath('C:\\repo', '.\\worktrees\\wt')).toBe('C:/repo/worktrees/wt');
    expect(resolveWorkspaceDisplayPath('/srv/chats', '/etc/passwd')).toBeNull();
    expect(resolveWorkspaceDisplayPath('/srv/chats', '../../..')).toBeNull();
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

  test('compares decimal uint64 revisions without numeric precision loss', () => {
    expect(compareSessionRevision('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
    expect(compareSessionRevision('10', '9')).toBeGreaterThan(0);
    expect(compareSessionRevision('0', '0')).toBe(0);
  });

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

<<<<<<< HEAD
  test('unchanged revisions do not deduplicate native execution changes', () => {
    const existing = session();
    const incoming = session({ runtimeStatus: 'running', activeRunId: 'run_one', headSequence: '1' });
    expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
  });
});
||||||| bc50ba56aa
  test('sanitizes session list records before returning them', async () => {
    const listPage = pager([
      {
        sessions: [
          makeSession({
            id: 'ses_1',
            directory: '/repo/app',
            title: 'Alpha',
            metadata: { openchamber: { kind: 'review', originalSessionID: 'ses_original' } },
            permissions: [{ action: 'edit', resource: '**', effect: 'ask' }],
            revert: { messageID: 'msg_1', snapshot: 'abc123', files: [{ file: 'x', patch: '@@', additions: 1, deletions: 0, status: 'modified' }] },
          }),
        ],
        cursor: {},
      },
    ])

    const sessions = await listGlobalSessionPages(listPage, { pageSize: 500 })

    expect(sessions[0]?.metadata).toEqual({
      openchamber: { kind: 'review', originalSessionID: 'ses_original' },
    })
    expect(sessions[0]?.permissions).toBe(undefined)
    expect(sessions[0]?.revert).toEqual({ messageID: 'msg_1' })
  })

  test('walks the cursor until the server stops offering one', async () => {
    const calls: SessionListOptions[] = []
    const listPage = pager([
      { sessions: [makeSession({ id: 'ses_root' }), makeSession({ id: 'ses_child_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_child_2' })], cursor: {} },
    ], calls)

    const sessions = await listGlobalSessionPages(listPage, { directory: '/repo', pageSize: 2 })

    expect(calls).toEqual([
      { directory: '/repo', limit: 2 },
      { directory: '/repo', limit: 2, cursor: 'c1' },
    ])
    expect(sessions.map((session) => session.id)).toEqual(['ses_root', 'ses_child_1', 'ses_child_2'])
  })

  test('asks for every directory when no directory is given', async () => {
    const calls: SessionListOptions[] = []
    await listGlobalSessionPages(pager([{ sessions: [makeSession({ id: 'ses_1' })], cursor: {} }], calls), { pageSize: 50 })

    expect(calls).toEqual([{ global: true, limit: 50 }])
  })

  test('reports each page to onPage as it arrives', async () => {
    const pages: string[][] = []
    const listPage = pager([
      { sessions: [makeSession({ id: 'ses_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_2' })], cursor: {} },
    ])

    await listGlobalSessionPages(listPage, {
      pageSize: 1,
      onPage: (sessions) => pages.push(sessions.map((session) => session.id)),
    })

    expect(pages).toEqual([['ses_1'], ['ses_2']])
  })

  test('dedupes by id and stops when a page repeats known ids', async () => {
    const calls: SessionListOptions[] = []
    const repeated = { sessions: [makeSession({ id: 'ses_1' }), makeSession({ id: 'ses_2' })], cursor: { next: 'c1' } }
    const listPage = pager([repeated, { ...repeated, cursor: { next: 'c2' } }], calls)

    const sessions = await listGlobalSessionPages(listPage, { pageSize: 2 })

    expect(calls).toHaveLength(2)
    expect(sessions.map((session) => session.id)).toEqual(['ses_1', 'ses_2'])
  })

  test('retries a failed page before treating the load as failed', async () => {
    let calls = 0
    const listPage: SessionPageLister = async () => {
      calls += 1
      if (calls === 1) throw new Error('warming up')
      return { sessions: [makeSession({ id: 'ses_1' })], cursor: {} }
    }

    const sessions = await listGlobalSessionPages(listPage, { pageSize: 500 })

    expect(calls).toBe(2)
    expect(sessions.map((session) => session.id)).toEqual(['ses_1'])
  })
})

describe('splitGlobalSessionsByArchived', () => {
  test('classifies restored (falsy archived) records as active', () => {
    const { active, archived } = splitGlobalSessionsByArchived([
      makeSession({ id: 'ses_active', time: { created: 1, updated: 20 } }),
      makeSession({ id: 'ses_archived', time: { created: 1, updated: 10, archived: 15 } }),
      makeSession({ id: 'ses_restored', time: { created: 1, updated: 5, archived: 0 } }),
    ])

    expect(active.map((session) => session.id)).toEqual(['ses_active', 'ses_restored'])
    expect(archived.map((session) => session.id)).toEqual(['ses_archived'])
  })
})

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({ home: '/home/user' });
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;
=======
  test('sanitizes session list records before returning them', async () => {
    const listPage = pager([
      {
        sessions: [
          makeSession({
            id: 'ses_1',
            directory: '/repo/app',
            title: 'Alpha',
            metadata: { openchamber: { kind: 'review', originalSessionID: 'ses_original' } },
            permissions: [{ action: 'edit', resource: '**', effect: 'ask' }],
            revert: { messageID: 'msg_1', snapshot: 'abc123', files: [{ file: 'x', patch: '@@', additions: 1, deletions: 0, status: 'modified' }] },
          }),
        ],
        cursor: {},
      },
    ])

    const sessions = await listGlobalSessionPages(listPage, { pageSize: 500 })

    expect(sessions[0]?.metadata).toEqual({
      openchamber: { kind: 'review', originalSessionID: 'ses_original' },
    })
    expect(sessions[0]?.permissions).toBe(undefined)
    expect(sessions[0]?.revert).toEqual({ messageID: 'msg_1' })
  })

  test('walks the cursor until the server stops offering one', async () => {
    const calls: SessionListOptions[] = []
    const listPage = pager([
      { sessions: [makeSession({ id: 'ses_root' }), makeSession({ id: 'ses_child_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_child_2' })], cursor: {} },
    ], calls)

    const sessions = await listGlobalSessionPages(listPage, { directory: '/repo', pageSize: 2 })

    expect(calls).toEqual([
      { directory: '/repo', limit: 2 },
      { directory: '/repo', limit: 2, cursor: 'c1' },
    ])
    expect(sessions.map((session) => session.id)).toEqual(['ses_root', 'ses_child_1', 'ses_child_2'])
  })

  test('asks for every directory when no directory is given', async () => {
    const calls: SessionListOptions[] = []
    await listGlobalSessionPages(pager([{ sessions: [makeSession({ id: 'ses_1' })], cursor: {} }], calls), { pageSize: 50 })

    expect(calls).toEqual([{ global: true, limit: 50 }])
  })

  test('reports each page to onPage as it arrives', async () => {
    const pages: string[][] = []
    const listPage = pager([
      { sessions: [makeSession({ id: 'ses_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_2' })], cursor: {} },
    ])

    await listGlobalSessionPages(listPage, {
      pageSize: 1,
      onPage: (sessions) => pages.push(sessions.map((session) => session.id)),
    })

    expect(pages).toEqual([['ses_1'], ['ses_2']])
  })

  test('rejects an incomplete list when a continuing page repeats known ids', async () => {
    const calls: SessionListOptions[] = []
    const repeated = { sessions: [makeSession({ id: 'ses_1' }), makeSession({ id: 'ses_2' })], cursor: { next: 'c1' } }
    const listPage = pager([repeated, { ...repeated, cursor: { next: 'c2' } }], calls)

    await expect(listGlobalSessionPages(listPage, { pageSize: 2 })).rejects.toThrow('Session pagination did not advance')

    expect(calls).toHaveLength(2)
  })

  test('rejects a repeated cursor even when the page adds records', async () => {
    const calls: SessionListOptions[] = []
    const listPage = pager([
      { sessions: [makeSession({ id: 'ses_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_2' })], cursor: { next: 'c1' } },
    ], calls)

    await expect(listGlobalSessionPages(listPage, { pageSize: 1 })).rejects.toThrow('Session pagination did not advance')
    expect(calls).toHaveLength(2)
  })

  test('rejects a cursor cycle across multiple pages', async () => {
    const calls: SessionListOptions[] = []
    const listPage = pager([
      { sessions: [makeSession({ id: 'ses_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_2' })], cursor: { next: 'c2' } },
      { sessions: [makeSession({ id: 'ses_3' })], cursor: { next: 'c1' } },
    ], calls)

    await expect(listGlobalSessionPages(listPage, { pageSize: 1 })).rejects.toThrow('Session pagination did not advance')
    expect(calls).toHaveLength(3)
  })

  test('rejects an empty page that still advertises more records', async () => {
    await expect(listGlobalSessionPages(pager([
      { sessions: [], cursor: { next: 'c1' } },
    ]), { pageSize: 2 })).rejects.toThrow('Session pagination did not advance')
  })

  test('dedupes overlapping pages when pagination completes', async () => {
    const sessions = await listGlobalSessionPages(pager([
      { sessions: [makeSession({ id: 'ses_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_1' }), makeSession({ id: 'ses_2' })], cursor: {} },
    ]), { pageSize: 2 })

    expect(sessions.map((session) => session.id)).toEqual(['ses_1', 'ses_2'])
  })

  test('accepts an authoritative empty list without a continuation cursor', async () => {
    expect(await listGlobalSessionPages(pager([
      { sessions: [], cursor: {} },
    ]), { pageSize: 2 })).toEqual([])
  })

  test('honors intentional page stops after checking pagination progress', async () => {
    const calls: SessionListOptions[] = []
    const sessions = await listGlobalSessionPages(pager([
      { sessions: [makeSession({ id: 'ses_1' })], cursor: { next: 'c1' } },
      { sessions: [makeSession({ id: 'ses_2' })], cursor: {} },
    ], calls), { pageSize: 1, stopAfterPage: () => true })

    expect(calls).toHaveLength(1)
    expect(sessions.map((session) => session.id)).toEqual(['ses_1'])
  })

  test('an intentional page stop cannot hide a continuing pagination stall', async () => {
    await expect(listGlobalSessionPages(pager([
      { sessions: [], cursor: { next: 'c1' } },
    ]), { pageSize: 1, stopAfterPage: () => true })).rejects.toThrow('Session pagination did not advance')
  })

  test('retries a failed page before treating the load as failed', async () => {
    let calls = 0
    const listPage: SessionPageLister = async () => {
      calls += 1
      if (calls === 1) throw new Error('warming up')
      return { sessions: [makeSession({ id: 'ses_1' })], cursor: {} }
    }

    const sessions = await listGlobalSessionPages(listPage, { pageSize: 500 })

    expect(calls).toBe(2)
    expect(sessions.map((session) => session.id)).toEqual(['ses_1'])
  })
})

describe('splitGlobalSessionsByArchived', () => {
  test('classifies restored (falsy archived) records as active', () => {
    const { active, archived } = splitGlobalSessionsByArchived([
      makeSession({ id: 'ses_active', time: { created: 1, updated: 20 } }),
      makeSession({ id: 'ses_archived', time: { created: 1, updated: 10, archived: 15 } }),
      makeSession({ id: 'ses_restored', time: { created: 1, updated: 5, archived: 0 } }),
    ])

    expect(active.map((session) => session.id)).toEqual(['ses_active', 'ses_restored'])
    expect(archived.map((session) => session.id)).toEqual(['ses_archived'])
  })
})

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({ home: '/home/user' });
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;
>>>>>>> upstream/main
