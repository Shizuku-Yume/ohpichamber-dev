import { describe, expect, test } from 'bun:test';
import type { Session } from '@/lib/opencode/model';

import { mergeSessionDirectoryMetadata } from './globalSessionStructure';

type SessionWithProjectMetadata = Session & {
  project?: { id?: string; worktree?: string } | null;
};

const sessionWithProjectMetadata = (
  projectID: string,
  project: SessionWithProjectMetadata['project'],
): SessionWithProjectMetadata => ({
  id: 'session',
  projectID,
  directory: '/workspace',
  title: 'Session',
  cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
  project,
});

describe('mergeSessionDirectoryMetadata', () => {
  test('retains project identity when a lighter record omits it', () => {
    const existing = sessionWithProjectMetadata('opencode-project', { id: 'opencode-project', worktree: '/workspace' });
    const incoming = sessionWithProjectMetadata('opencode-project', { worktree: '/workspace' });

    expect(mergeSessionDirectoryMetadata(incoming, existing)).toEqual({
      ...incoming,
      project: { id: 'opencode-project', worktree: '/workspace' },
    });
  });

  test('does not pair an incoming project worktree with a conflicting previous ID', () => {
    const existing = sessionWithProjectMetadata('old-project', { id: 'old-project', worktree: '/workspace/old' });
    const incoming = sessionWithProjectMetadata('new-project', { id: 'new-project', worktree: '/workspace/new' });

    expect(mergeSessionDirectoryMetadata(incoming, existing)).toEqual({
      ...incoming,
    });
  });
});

test("preserves cached host fields and archive classification on marked records", () => {
  const existing = {
    ...sessionWithProjectMetadata("opencode-project", { id: "opencode-project", worktree: "/workspace" }),
    title: "Cached title",
    metadata: { source: "cached" },
    time: { created: 1, updated: 1, archived: 2 },
  }
  const incoming: Session = {
    ...existing,
    title: "",
    metadata: undefined,
    directory: "",
    projectID: "",
    time: { created: 1, updated: 2 },
    hostMetadataError: "METADATA_READ_FAILED",
    hostArchiveError: "METADATA_CORRUPT",
  }

  expect(mergeSessionDirectoryMetadata(incoming, existing)).toMatchObject({
    title: "Cached title",
    metadata: { source: "cached" },
    directory: "/workspace",
    projectID: "opencode-project",
    time: { archived: 2 },
    hostMetadataError: "METADATA_READ_FAILED",
    hostArchiveError: "METADATA_CORRUPT",
  })
})

test('keeps newer Host metadata without dropping independent runtime or archive state', () => {
  const existing = {
    ...sessionWithProjectMetadata('project-new', { id: 'project-new', worktree: '/new' }),
    directory: '/new', title: 'New title', metadata: { value: 'new' }, metadataRevision: '9007199254740993',
  };
  const incoming = {
    ...existing, directory: '/old', projectID: 'project-old', title: 'Old title',
    metadata: { value: 'old' }, metadataRevision: '9007199254740992', cost: 7,
    time: { created: 1, updated: 8, archived: 9 },
  };
  expect(mergeSessionDirectoryMetadata(incoming, existing)).toMatchObject({
    directory: '/new', projectID: 'project-new', title: 'New title', metadata: { value: 'new' },
    metadataRevision: '9007199254740993', cost: 7, time: { updated: 8, archived: 9 },
  });
});

test('accepts a higher decimal revision across a digit boundary', () => {
  const existing = { ...sessionWithProjectMetadata('project', null), metadata: { value: 'old' }, metadataRevision: '9' };
  const incoming = { ...existing, metadata: { value: 'new' }, metadataRevision: '10' };
  expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
});

test('does not deduplicate unrelated runtime changes at the same metadata revision', () => {
  const existing = { ...sessionWithProjectMetadata('project', null), metadata: { value: 'same' }, metadataRevision: '2' };
  const incoming = { ...existing, cost: 7, time: { created: 1, updated: 8 } };
  expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
});
