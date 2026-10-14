import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as keep from './keep';
import { withMultiRunMembership } from './identity';
import { buildMultiRunIndex } from './runs';
import { fusionModeFor, NoFusionOutputsError, shouldInlineDiffs, startRunFusion } from './fusion';

describe('fusionModeFor', () => {
  const changed = { files: 3, insertions: 10, deletions: 2 };
  const clean = { files: 0, insertions: 0, deletions: 0 };

  test('code when every source has a worktree and at least one changed files', () => {
    expect(fusionModeFor([
      { hasWorktree: true, diff: changed },
      { hasWorktree: true, diff: clean },
    ])).toBe('code');
  });

  test('answers when any source shares a directory', () => {
    expect(fusionModeFor([
      { hasWorktree: true, diff: changed },
      { hasWorktree: false, diff: null },
    ])).toBe('answers');
  });

  test('answers when no source changed anything or the changes are unknown', () => {
    expect(fusionModeFor([
      { hasWorktree: true, diff: clean },
      { hasWorktree: true, diff: null },
    ])).toBe('answers');
    expect(fusionModeFor([])).toBe('answers');
  });
});

describe('shouldInlineDiffs', () => {
  test('inlines only while the diffs fit a tenth of the context window', () => {
    // 12 tokens per changed line: 1,000 lines ≈ 12,000 tokens.
    expect(shouldInlineDiffs(1_000, 200_000)).toBe(true);
    expect(shouldInlineDiffs(2_000, 200_000)).toBe(false);
  });

  test('never inlines without a known context window', () => {
    expect(shouldInlineDiffs(1, undefined)).toBe(false);
    expect(shouldInlineDiffs(1, 0)).toBe(false);
  });
});

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
function sourceFixture() {
  const sessions = ['a', 'b'].map((sessionId): Session => {
    const session: Session = { sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1,
      epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, metadata: {}, metadataRevision: '1', archiveRevision: '0' };
    session.metadata = withMultiRunMembership(session, { version: 1, sessionID: sessionId, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' }, groupSlug: 'run', role: 'run', providerID: 'provider', modelID: 'model' });
    return session;
  });
  const run = [...buildMultiRunIndex(sessions, (session) => session.projectId).runs.values()][0];
  spies.push(spyOn(keep, 'resolveRunMemberLocation').mockResolvedValue(null));
  const create = spyOn(canonicalClient, 'createSession');
  spies.push(create);
  return { sessions, create, input: { run, sourceIds: ['a', 'b'], judge: { providerId: 'judge', modelId: 'model' }, sessionById: new Map(sessions.map((session) => [session.sessionId, session])) } };
}

describe('canonical fusion source authority', () => {
  test('a listed source error aborts rather than dropping the source', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: { a: 'read_failed' } }));
    await expect(startRunFusion(api.input)).rejects.toThrow('Fusion source could not be read');
    expect(api.create).not.toHaveBeenCalled();
  });
  test('fresh changed membership invalidates cached source selection', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions.map((session) => ({ ...session, metadata: null })), errors: {} }));
    await expect(startRunFusion(api.input)).rejects.toThrow('Fusion source membership changed');
    expect(api.create).not.toHaveBeenCalled();
  });
  test('successfully empty native histories do not create a fusion', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: {} }));
    spies.push(spyOn(canonicalClient, 'getHistory').mockImplementation(async (sessionId) => ({ sessionId, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, messages: [], turns: [], nextCursor: null })));
    await expect(startRunFusion(api.input)).rejects.toBeInstanceOf(NoFusionOutputsError);
    expect(api.create).not.toHaveBeenCalled();
  });
  test('history errors abort before creating a result', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: {} }));
    spies.push(spyOn(canonicalClient, 'getHistory').mockRejectedValue(new Error('History failed')));
    await expect(startRunFusion(api.input)).rejects.toThrow('History failed');
    expect(api.create).not.toHaveBeenCalled();
  });
});
