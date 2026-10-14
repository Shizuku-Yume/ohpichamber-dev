import { describe, expect, test } from 'bun:test';
import { SessionSchema, type Session } from '@openchamber/agent-contract';
import { getMultiRunIdentity, sameMultiRunIdentity, withMultiRunMembership, type MultiRunMembership } from './identity';
import { getMultiRunSessionTitle, getFusionSessionTitle, parseMultiRunSessionTitle } from './title';
import { buildMultiRunIndex } from './runs';

const group = { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' } as const;
const membership = (id: string): MultiRunMembership => ({
  version: 1, sessionID: id, group, groupSlug: 'bench', role: 'run', runGroup: 'g1',
  providerID: 'openrouter', modelID: 'vendor/model',
});
const session = (id: string, marker: MultiRunMembership | null = membership(id)): Session => {
  const result: Session = { sessionId: id, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: id,
    createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: { title: 'bench/openrouter/vendor/model' }, metadataRevision: '1', archiveRevision: '0' };
  if (marker) result.metadata = withMultiRunMembership(result, marker);
  return result;
};

describe('multi-run identity', () => {
  test('renaming, archiving, serialization and model slashes do not change membership', () => {
    const original = session('s1');
    const renamed = { ...original, metadata: { ...original.metadata, title: 'any title' }, archivedAt: 5 };
    expect(getMultiRunIdentity(renamed)).toEqual(getMultiRunIdentity(original));
    expect(getMultiRunIdentity(SessionSchema.parse(JSON.parse(JSON.stringify(renamed))))).toEqual(getMultiRunIdentity(original));
    for (const modelID of ['vendor/2', 'vendor/fusion', 'a/b/c', 'vendor/model%2Fname']) {
      const current = session('s1', { ...membership('s1'), modelID });
      expect(getMultiRunIdentity(current)?.modelID).toBe(modelID);
      expect(getMultiRunIdentity(current)?.role).toBe('run');
    }
  });

  test('pending, invalid, future and forked markers never fall back to a convincing title', () => {
    const original = session('s1');
    expect(getMultiRunIdentity({ ...original, sessionId: 'fork' })).toBeNull();
    expect(getMultiRunIdentity(session('s1', { ...membership('s1'), sessionID: null }))).toBeNull();
    for (const marker of [null, {}, { ...membership('s1'), version: 2 }, { ...membership('s1'), group: { kind: 'id', id: '../other' } }]) {
      expect(SessionSchema.safeParse({ ...original, metadata: { openchamber: { multirun: marker } } }).success).toBe(false);
    }
  });

  test('separate launches never share a group; prompt variants and fusion results do', () => {
    const anchor = getMultiRunIdentity(session('s1'))!;
    const sibling = session('s2');
    const otherGroup = { kind: 'id', id: '5fdf22b1-d21e-4324-b2df-01747396c704' } as const;
    const otherLaunch = session('s3', { ...membership('s3'), group: otherGroup });
    const otherPrompt = session('s4', { ...membership('s4'), runGroup: 'g2' });
    const fusion = session('f1', { ...membership('f1'), role: 'fusion' });
    const legacy = session('old', null);
    const sameGroup = [sibling, otherLaunch, otherPrompt, fusion, legacy, { ...sibling, sessionId: 'fork' }]
      .filter((candidate) => getMultiRunIdentity(candidate)?.key === anchor.key);
    expect(sameGroup.map((item) => item.sessionId)).toEqual(['s2', 's4', 'f1']);
    // Same name, two launches: two runs, never merged.
    const otherLaunchSibling = session('s5', { ...membership('s5'), group: otherGroup });
    const runs = [...buildMultiRunIndex([session('s1'), sibling, otherLaunch, otherLaunchSibling, fusion], (record) => record.projectId).runs.values()];
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.memberIds.length).sort()).toEqual([2, 3]);
    expect(runs[0].title).toBe(runs[1].title);
    expect(runs[0].key).not.toBe(runs[1].key);
  });

  test('legacy slash IDs, groups, duplicate indices and fusion share one parser', () => {
    for (const runGroup of [undefined, 'g2']) {
      for (const index of [undefined, 2]) {
        const input = { groupSlug: 'bench', runGroup, providerID: 'openrouter', modelID: 'vendor/model', index };
        expect(parseMultiRunSessionTitle(getMultiRunSessionTitle(input))).toEqual({ ...input, fusion: false });
      }
      expect(parseMultiRunSessionTitle(getFusionSessionTitle('bench', 'openrouter', 'vendor/model', runGroup)))
        .toMatchObject({ modelID: 'vendor/model', runGroup, fusion: true });
    }
    expect(parseMultiRunSessionTitle('bench//openrouter/vendor/model/2')).toMatchObject({ modelID: 'vendor/model', index: 2 });
    expect(parseMultiRunSessionTitle('bench/openrouter/vendor/2')).toMatchObject({ modelID: 'vendor', index: 2 });
    expect(parseMultiRunSessionTitle('bench/openrouter/vendor/fusion')).toMatchObject({ modelID: 'vendor', fusion: true });
    for (const title of ['bench/openrouter//model', 'bench/openrouter/model/0', 'bad name/openrouter/vendor/model']) {
      expect(parseMultiRunSessionTitle(title)).toBeNull();
    }
  });

  test('a new fusion over legacy sources retains their scope without promoting those sources', () => {
    const old = session('old', null);
    const anchor = getMultiRunIdentity(old)!;
    const fusion = session('fusion', { ...membership('fusion'), group: anchor.group, runGroup: undefined, role: 'fusion' });
    expect(getMultiRunIdentity(fusion)!.key).toBe(anchor.key);
    expect(getMultiRunIdentity(old, 'different-project')!.key).not.toBe(anchor.key);
    expect(old.metadata?.openchamber?.multirun).toBeUndefined();
    for (const kind of ['btw', 'review'] as const) {
      expect(getMultiRunIdentity({ ...old, metadata: { openchamber: { kind } } })).toBeNull();
    }
  });

  test('title and auto-fusion round-trip; markers without them stay valid', () => {
    const autoFusion = { providerID: 'anthropic', modelID: 'claude', launcherId: 'page-1' };
    const marked = session('s1', { ...membership('s1'), title: 'Fix the race', autoFusion });
    expect(getMultiRunIdentity(SessionSchema.parse(JSON.parse(JSON.stringify(marked))))).toMatchObject({ title: 'Fix the race', autoFusion });
    const plain = getMultiRunIdentity(session('s1'));
    expect(plain?.title).toBeUndefined();
    expect(plain?.autoFusion).toBeUndefined();
    expect(sameMultiRunIdentity(session('s1'), marked)).toBe(false);
  });

  test('preserves unrelated metadata and invalidates row memoization only for relevant changes', () => {
    const original = session('s1');
    const changed = session('s1', { ...membership('s1'), role: 'fusion' });
    expect(sameMultiRunIdentity(original, changed)).toBe(false);
    expect(sameMultiRunIdentity(original, { ...original, metadata: { ...original.metadata, notes: 'unrelated' } })).toBe(true);
    expect(sameMultiRunIdentity(original, { ...original, sessionId: 'fork' })).toBe(false);
    const metadata = withMultiRunMembership({ metadata: { notes: 'preserve', openchamber: { goal: { status: 'active' } } } }, membership('s1'));
    expect(metadata.notes).toBe('preserve');
    expect(metadata.openchamber).toMatchObject({ goal: { status: 'active' } });
  });
});
