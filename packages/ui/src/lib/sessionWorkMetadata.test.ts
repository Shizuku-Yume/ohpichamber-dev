import { describe, expect, test } from 'bun:test';
<<<<<<< HEAD
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { getSessionWork, isDoneSuggested, isReviewSuggested, isSessionInWork, withSessionWorkState } from './sessionWorkMetadata';
||||||| bc50ba56aa
import type { Metadata, Session } from '@/lib/opencode/model';
import { getSessionWork, isDoneSuggested, isReviewSuggested, isSessionInWork, withSessionWorkState } from './sessionWorkMetadata';
=======
import type { Metadata, Session } from '@/lib/opencode/model';
import { getSessionWork, isDoneSuggested, isReviewSuggested, isSessionInWork, withSessionWorkClosed, withSessionWorkState } from './sessionWorkMetadata';
>>>>>>> upstream/main

const session = (metadata: SessionMetadata, updatedAt = 100): Session => ({
  sessionId: 'ses_1', projectId: 'prj', workspaceId: 'ws', displayPath: 'repo', rootSessionId: 'ses_1',
  createdAt: 1, updatedAt, epoch: 'e', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata, metadataRevision: '1', archiveRevision: '0',
});

describe('session work metadata', () => {
  test('reads membership from the stored state, and anything else as not in work', () => {
    expect(isSessionInWork(session({ openchamber: { work: { state: 'open' } } }))).toBe(true);
    expect(isSessionInWork(session({ openchamber: { work: { state: 'done' } } }))).toBe(false);
    expect(isSessionInWork(session({ openchamber: { goal: { id: 'g' } } }))).toBe(false);
    expect(isSessionInWork(session({}))).toBe(false);
    expect(isSessionInWork(null)).toBe(false);
  });

  test('a touched session file does not drop the hint: freshness is same-clock only', () => {
    expect(isDoneSuggested(session({ openchamber: { work: { state: 'open', suggestDoneAt: 150 }, workbench: { lastIdleAt: 100 } } }, 9_000))).toBe(true);
    expect(isReviewSuggested(session({ openchamber: { reviewOffer: { at: 150 }, workbench: { lastIdleAt: 100 } } }, 9_000))).toBe(true);
  });

  test('shows the done hint only while it was written after the last turn ended', () => {
    expect(isDoneSuggested(session({ openchamber: { work: { state: 'open', suggestDoneAt: 150 } } }, 100))).toBe(true);
    expect(isDoneSuggested(session({ openchamber: { work: { state: 'open', suggestDoneAt: 150 }, workbench: { lastIdleAt: 300 } } }))).toBe(false);
    expect(isDoneSuggested(session({ openchamber: { work: { state: 'done', suggestDoneAt: 150 } } }, 100))).toBe(false);
    expect(isDoneSuggested(session({ openchamber: { work: { state: 'open' } } }))).toBe(false);
  });

  test('reads a record the server opened on a sent message, done hint included', () => {
    const opened = session({ openchamber: { work: { state: 'open', openedAt: 5, openedBy: 'jev', suggestDoneAt: 150 } } }, 100);
    expect(getSessionWork(opened)).toMatchObject({ state: 'open', openedBy: 'jev' });
    expect(isDoneSuggested(opened)).toBe(true);
  });

  test('offers a review under the same freshness rule, in or out of work, and yields to a current done hint', () => {
    expect(isReviewSuggested(session({ openchamber: { reviewOffer: { at: 150 } } }, 100))).toBe(true);
    expect(isReviewSuggested(session({ openchamber: { reviewOffer: { at: 150 }, workbench: { lastIdleAt: 300 } } }))).toBe(false);
    expect(isReviewSuggested(session({ openchamber: { work: { state: 'done' }, reviewOffer: { at: 150 } } }, 100))).toBe(true);
    expect(isReviewSuggested(session({ openchamber: { work: { state: 'open', suggestDoneAt: 150 }, reviewOffer: { at: 150 } } }, 100))).toBe(false);
  });

  test('the user tracks and closes; closing keeps when and by whom it opened and drops the hint', () => {
    const base: SessionMetadata = { openchamber: { goal: { id: 'g' } } };
    const tracked = withSessionWorkState(base, 'open', 10);
    expect(tracked).toEqual({ openchamber: { goal: { id: 'g' }, work: { state: 'open', openedAt: 10, openedBy: 'user' } } });

    const hinted: SessionMetadata = { openchamber: { work: { state: 'open', openedAt: 5, openedBy: 'jev', suggestDoneAt: 8 } } };
    const closed = withSessionWorkState(hinted, 'done', 20);
    expect(getSessionWork(session(closed))).toEqual({ state: 'done', doneAt: 20, openedAt: 5, openedBy: 'jev' });

    // Asking for the state it already has changes nothing.
    expect(withSessionWorkState(closed, 'done', 30)).toBe(closed);
  });

  test('closing for a pin closes only work that is open, and gives a session never in work no record', () => {
    const open: Metadata = { openchamber: { pinned: { at: 1 }, work: { state: 'open', openedAt: 5, openedBy: 'auto' } } };
    expect(withSessionWorkClosed(open, 9)).toEqual({ openchamber: { pinned: { at: 1 }, work: { state: 'done', doneAt: 9, openedAt: 5, openedBy: 'auto' } } });
    const never: Metadata = { openchamber: { pinned: { at: 1 } } };
    expect(withSessionWorkClosed(never, 9)).toBe(never);
    const done: Metadata = { openchamber: { work: { state: 'done', doneAt: 3 } } };
    expect(withSessionWorkClosed(done, 9)).toBe(done);
  });
});
