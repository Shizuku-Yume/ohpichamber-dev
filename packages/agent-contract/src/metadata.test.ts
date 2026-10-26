import { expect, test } from 'bun:test';
import {
  SessionMetadataPatchSchema,
  SessionMetadataSchema,
  SessionMetadataStateSchema,
} from './metadata.ts';

const goal = {
  id: 'goal_1', objective: 'Ship it', objectiveFile: true, status: 'active', tokenBudget: 100,
  tokensUsed: 1, tokensBaseline: 2, tokensCommitted: 3, turnsUsed: 4, blockedStreak: 5,
  auditFailStreak: 6, note: 'note', statusReason: 'reason',
};
const links = [
  { kind: 'issue', id: 'link_1', title: 'Issue', url: 'https://example.test/i', linkedAt: 1, number: 1, author: 'A', authorAvatarUrl: 'avatar' },
  { kind: 'pull', id: 'link_2', title: 'Pull', url: 'https://example.test/p', linkedAt: 2, number: 2 },
  { kind: 'linear', id: 'link_3', title: 'Linear', url: 'https://example.test/l', linkedAt: 3, identifier: 'LIN-1' },
  { kind: 'guest', id: 'link_4', title: 'Guest', url: 'https://example.test/g', linkedAt: 4, providerId: 'provider_1', identifier: 'guest_1', thread: 'issue', data: { ok: true } },
  { kind: 'external', id: 'link_5', title: 'External', url: 'https://example.test/e', linkedAt: 5, thread: 'change', identifier: 'ext_1' },
];
const multirun = {
  version: 1, sessionID: 'session_1', group: { kind: 'id', id: '550e8400-e29b-41d4-a716-446655440000' },
  groupSlug: 'group_1', runGroup: 'g1', providerID: 'provider_1', modelID: 'model_1', index: 1,
  role: 'run', title: 'Run', autoFusion: { providerID: 'provider_1', modelID: 'model_1', variant: 'v1', agent: 'agent_1', launcherId: 'launcher_1' },
};
const metadata = {
  title: 'Title', folder: 'folder_1', isPinned: true, color: 'blue', icon: 'star', notes: 'Notes',
  openchamber: {
    knowledge_context_delivered: 'cursor', context_obligatory_last_compaction_message_id: 'message_1',
    project_context_pins: { notes: ['note_1'], plans: ['plan_1'] },
    context_obligatory_messages: [{ id: 'message_1', createdAt: 1, role: 'user' }], linked_issues: links,
    work: { state: 'done', openedAt: 1, openedBy: 'user', doneAt: 2, suggestDoneAt: null },
    reviewOffer: { at: 3 }, reviewSessionID: 'session_3', kind: 'review', originalSessionID: 'session_1', multirun,
  },
};

test('metadata preserves presentation and all operational shapes', () => {
  expect(SessionMetadataSchema.parse(metadata)).toEqual(metadata);
  const emptyAssist = { openchamber: { assist: { recap: '', suggestion: '', forMessageID: 'message_1', generatedAt: 1 } } };
  expect(SessionMetadataSchema.parse(emptyAssist)).toEqual(emptyAssist);
  expect(SessionMetadataSchema.parse({ openchamber: { knowledge_context_delivered: '' } })).toEqual({ openchamber: { knowledge_context_delivered: '' } });
  expect(SessionMetadataSchema.parse({ openchamber: { goal: { objective: 'partial' } } })).toEqual({ openchamber: { goal: { objective: 'partial' } } });
  const pausedGoal = { openchamber: { goal: { status: 'paused', statusReason: 'paused in fork' } } };
  expect(SessionMetadataSchema.parse(pausedGoal)).toEqual(pausedGoal);
  const legacyFusion = { openchamber: { multirun: { ...multirun, group: { kind: 'legacy', scope: 'opaque_scope' }, role: 'fusion' } } };
  expect(SessionMetadataSchema.parse(legacyFusion)).toEqual(legacyFusion);
});

test('metadata rejects host-owned and malformed values', () => {
  for (const invalid of [
    { ...metadata, openchamber: { ...metadata.openchamber, goal: 'goal' } },
    { ...metadata, directory: '/tmp' }, { ...metadata, projectID: 'project_1' },
    { ...metadata, openchamber: { ...metadata.openchamber, unknown: true } },
    { ...metadata, goal: 'scalar alias' },
    { ...metadata, openchamber: { ...metadata.openchamber, kind: 'other' } },
    { ...metadata, openchamber: { ...metadata.openchamber, goal: { ...goal, status: 'unknown' } } },
    { ...metadata, openchamber: { ...metadata.openchamber, goal: { ...goal, tokenBudget: 1.5 } } },
    { ...metadata, openchamber: { ...metadata.openchamber, linked_issues: [{ ...links[0], number: 0 }] } },
    { ...metadata, openchamber: { ...metadata.openchamber, linked_issues: [{ ...links[3], data: { unsupported: undefined } }] } },
    { ...metadata, openchamber: { ...metadata.openchamber, work: { state: 'bad' } } },
    { ...metadata, openchamber: { ...metadata.openchamber, multirun: { ...multirun, group: { kind: 'legacy', scope: '/absolute' }, role: 'fusion' } } },
    { ...metadata, openchamber: { ...metadata.openchamber, multirun: { ...multirun, group: { kind: 'legacy', scope: 'opaque' }, role: 'run' } } },
  ]) expect(SessionMetadataSchema.safeParse(invalid).success).toBe(false);
});

test('metadata state distinguishes missing null revision zero from present empty object', () => {
  expect(SessionMetadataStateSchema.parse({ sessionId: 'session_1', revision: '0', metadata: null })).toEqual({ sessionId: 'session_1', revision: '0', metadata: null });
  expect(SessionMetadataStateSchema.parse({ sessionId: 'session_1', revision: '1', metadata: {} })).toEqual({ sessionId: 'session_1', revision: '1', metadata: {} });
  expect(SessionMetadataStateSchema.safeParse({ sessionId: 'session_1', revision: '0', metadata: {} }).success).toBe(false);
  expect(SessionMetadataStateSchema.safeParse({ sessionId: 'session_1', revision: '1', metadata: null }).success).toBe(false);
});

test('metadata patches support typed null deletion and reject malformed patch values', () => {
  const cleared = { changes: {
    title: null, folder: null, isPinned: null, color: null, icon: null, notes: null, openchamber: {
      goal: null, assist: null, knowledge_context_delivered: null, context_obligatory_last_compaction_message_id: null,
      project_context_pins: null, context_obligatory_messages: null, linked_issues: null, work: null, reviewOffer: null,
      reviewSessionID: null, kind: null, originalSessionID: null, multirun: null,
    },
  } };
  expect(SessionMetadataPatchSchema.parse(cleared)).toEqual(cleared);
  for (const invalid of [
    { changes: { title: 1 } }, { changes: { openchamber: { goal: 'bad' } } },
    { changes: { openchamber: { assist: { suggestion: 1 } } } },
    { changes: { openchamber: { reviewOffer: { at: 'bad' } } } },
    { changes: { openchamber: { knowledge_context_delivered: 1 } } },
    { changes: { openchamber: { unknown: null } } },
  ]) expect(SessionMetadataPatchSchema.safeParse(invalid).success).toBe(false);
  const nestedDeletion = { changes: { openchamber: {
    goal: { objective: null, note: null }, assist: { suggestion: null },
    project_context_pins: { notes: null }, work: { openedAt: null }, reviewOffer: { at: null },
  } } };
  expect(SessionMetadataPatchSchema.parse(nestedDeletion)).toEqual(nestedDeletion);
  expect(SessionMetadataSchema.safeParse({ openchamber: {
    goal: { objective: null }, assist: { suggestion: null }, project_context_pins: { notes: null },
    work: { openedAt: null }, reviewOffer: { at: null },
  } }).success).toBe(false);
});
