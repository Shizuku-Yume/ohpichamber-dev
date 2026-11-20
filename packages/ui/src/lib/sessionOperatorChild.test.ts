import { describe, expect, test } from 'bun:test';

import { isOperatorChildSession, metadataAfterTakeOver, operatorChildParentId, permissionsAfterTakeOver } from './sessionOperatorChild';
import { nativeHostSession } from '@/sync/session-message-loader-test-fixtures';

describe('operator child sessions', () => {
  test('reads the link the server writes and nothing else', () => {
    expect(operatorChildParentId({ openchamber: { kind: 'operator-child', parentID: 'ses_operator' } })).toBe('ses_operator');
    expect(operatorChildParentId({ openchamber: { kind: 'operator-child' } })).toBeUndefined();
    expect(operatorChildParentId({ openchamber: { kind: 'workflow-agent', parentID: 'ses_run' } })).toBeUndefined();
    expect(isOperatorChildSession(nativeHostSession())).toBe(false);
  });

  test('taking a session over drops the link, keeps the rest and puts it in work', () => {
    const metadata = { notes: 'keep', openchamber: { pinned: { at: 1 } } };
    expect(metadataAfterTakeOver(metadata, 42)).toEqual({
      notes: 'keep',
      openchamber: { pinned: { at: 1 }, work: { state: 'open', openedAt: 42, openedBy: 'user' } },
    });
  });

  test('taking a session over gives the question and secret tools back and keeps every other rule', () => {
    const rules = [
      { action: 'bash', resource: '*', effect: 'ask' as const },
      { action: 'question', resource: '*', effect: 'deny' as const },
      { action: 'question', resource: 'x', effect: 'deny' as const },
      { action: 'openchamber_secret', resource: '*', effect: 'deny' as const },
    ];
    expect(permissionsAfterTakeOver(rules)).toEqual([rules[0], rules[2]]);
    expect(permissionsAfterTakeOver(undefined)).toEqual([]);
  });
});
