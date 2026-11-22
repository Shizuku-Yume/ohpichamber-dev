import { beforeEach, describe, expect, test } from 'bun:test';

import {
  clearChatDraft,
  createChatDraftIdentity,
  getChatDraftIdentityKey,
  keepWorkDraftOwnSlot,
  readChatDraft,
  readChatDraftClaimingFolderDraft,
  subscribeChatDraftDeletion,
  workDraftComposerKey,
  workDraftKeepsOwnSlot,
  writeChatDraft,
} from './chatDraftPersistence';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';

const storage = getDeferredSafeStorage();

describe('chatDraftPersistence', () => {
  beforeEach(() => {
    storage.removeItem('openchamber.chatDrafts.v2');
  });

  test('an explicitly owned work draft does not claim its folder input', () => {
    const folder = createChatDraftIdentity('own-slot-runtime', '/repo', null)!;
    const draft = createChatDraftIdentity('own-slot-runtime', '/repo', workDraftComposerKey('share-draft'))!;
    writeChatDraft(folder, 'keep folder input', []);
    keepWorkDraftOwnSlot('share-draft', folder.runtimeKey);
    expect(readChatDraftClaimingFolderDraft(draft).text).toBe('');
    expect(readChatDraft(folder).text).toBe('keep folder input');
    expect(readChatDraftClaimingFolderDraft(null).text).toBe('');
  });

  test('own-slot intent is scoped to the originating runtime', () => {
    const first = createChatDraftIdentity('own-a', '/repo', null)!;
    const second = createChatDraftIdentity('own-b', '/repo', null)!;
    keepWorkDraftOwnSlot('same-id', first.runtimeKey);
    writeChatDraft(first, 'first host', []);
    writeChatDraft(second, 'second host', []);
    expect(workDraftKeepsOwnSlot('same-id', first.runtimeKey)).toBe(true);
    expect(workDraftKeepsOwnSlot('same-id', second.runtimeKey)).toBe(false);
    expect(readChatDraftClaimingFolderDraft({ ...second, sessionId: workDraftComposerKey('same-id') }).text).toBe('second host');
    expect(readChatDraft(first).text).toBe('first host');
  });

  test('never writes a share link\'s key to storage', () => {
    const identity = createChatDraftIdentity('runtime-a', '/repo-a', 'session-1')!;
    writeChatDraft(identity, 'see https://evil.test/p/AbCdEfGhIjKlMnOpQrStUv#Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE now', []);
    expect(readChatDraft(identity).text).toBe('see https://evil.test/p/AbCdEfGhIjKlMnOpQrStUv now');
    expect(storage.getItem('openchamber.chatDrafts.v2')).not.toContain('Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE');
  });

  test('isolates drafts by runtime, directory, and session', () => {
    const first = createChatDraftIdentity('runtime-a', '/repo-a/', 'session-1')!;
    const second = createChatDraftIdentity('runtime-b', '/repo-a', 'session-1')!;
    const third = createChatDraftIdentity('runtime-a', '/repo-b', 'session-1')!;
    writeChatDraft(first, 'first', ['file.ts']);
    writeChatDraft(second, 'second', []);
    writeChatDraft(third, 'third', []);

    expect(readChatDraft(first)).toEqual({ text: 'first', confirmedMentions: new Set(['file.ts']) });
    expect(readChatDraft(second).text).toBe('second');
    expect(readChatDraft(third).text).toBe('third');
  });

  test('keeps new-session drafts separate from similarly named sessions', () => {
    const newSession = createChatDraftIdentity('runtime-a', '/repo', null)!;
    const namedSession = createChatDraftIdentity('runtime-a', '/repo', '__new__')!;

    writeChatDraft(newSession, 'new session', []);
    writeChatDraft(namedSession, 'named session', []);

    expect(readChatDraft(newSession).text).toBe('new session');
    expect(readChatDraft(namedSession).text).toBe('named session');
  });

  test('clears only the matching identity and notifies active composers', () => {
    const deleted = createChatDraftIdentity('runtime-a', '/repo-a', 'session-1')!;
    const retained = createChatDraftIdentity('runtime-a', '/repo-b', 'session-1')!;
    const notifications: string[] = [];
    const unsubscribe = subscribeChatDraftDeletion((identity) => notifications.push(identity.directory));
    writeChatDraft(deleted, 'delete', []);
    writeChatDraft(retained, 'retain', []);

    clearChatDraft(deleted, true);
    unsubscribe();

    expect(readChatDraft(deleted).text).toBe('');
    expect(readChatDraft(retained).text).toBe('retain');
    expect(notifications).toEqual(['/repo-a']);
  });

  test('bounds persisted drafts by recency', () => {
    for (let index = 0; index < 55; index += 1) {
      const identity = createChatDraftIdentity('runtime-a', '/repo', `session-${index}`)!;
      writeChatDraft(identity, `draft-${index}`, []);
    }

    const envelope = JSON.parse(storage.getItem('openchamber.chatDrafts.v2') ?? '{}') as { drafts?: object };
    expect(Object.keys(envelope.drafts ?? {})).toHaveLength(50);
  });

  test('reuses a parsed envelope while the stored value is unchanged', () => {
    const identity = createChatDraftIdentity('runtime-cache', '/repo', 'session-1')!;
    const key = getChatDraftIdentityKey(identity);
    storage.setItem('openchamber.chatDrafts.v2', JSON.stringify({
      version: 2,
      drafts: { [key]: { text: 'cached', confirmedMentions: [], touchedAt: 1 } },
    }));
    const originalParse = JSON.parse;
    let parseCalls = 0;
    JSON.parse = ((...args: Parameters<typeof JSON.parse>) => {
      parseCalls += 1;
      return originalParse(...args);
    }) as typeof JSON.parse;

    try {
      expect(readChatDraft(identity).text).toBe('cached');
      expect(readChatDraft(identity).text).toBe('cached');
      expect(parseCalls).toBe(1);
    } finally {
      JSON.parse = originalParse;
    }
  });
});
