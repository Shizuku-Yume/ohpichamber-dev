import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';

import { resolveChatPromptReadOnly } from './chatPromptReadOnly';
import { withReviewSessionMarker } from '@/lib/sessionReviewMetadata';

const session = (parentSessionId?: string): Session => ({
    sessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.',
    parentSessionId, rootSessionId: parentSessionId ?? 'session', createdAt: 1, updatedAt: 1,
    epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
    metadata: null, metadataRevision: '0', archiveRevision: '0',
});

describe('resolveChatPromptReadOnly', () => {
    test('allows prompting a subagent without requiring its parent record', () => {
        expect(resolveChatPromptReadOnly(session('parent'), true, true)).toBe(false);
    });

    test('keeps a subagent read-only when prompting is disabled', () => {
        expect(resolveChatPromptReadOnly(session('parent'), false, false)).toBe(true);
    });

    test('preserves the surface read-only state for root sessions', () => {
        expect(resolveChatPromptReadOnly(session(), true, true)).toBe(true);
        expect(resolveChatPromptReadOnly(session(), true, false)).toBe(false);
    });

    test('keeps a session read through its parent\'s folder read-only, whatever the subagent setting says', () => {
        expect(resolveChatPromptReadOnly(session('parent'), true, false, false)).toBe(true);
        expect(resolveChatPromptReadOnly(session(), false, false, false)).toBe(true);
    });

    test('treats a marked code review as an independent session even with a stale parent ID', () => {
        const reviewSession: Session = {
            ...session('original'),
            metadata: withReviewSessionMarker({}, 'original'),
        };

        expect(resolveChatPromptReadOnly(reviewSession, false, false)).toBe(false);
        expect(resolveChatPromptReadOnly(reviewSession, true, true)).toBe(true);
    });
});
