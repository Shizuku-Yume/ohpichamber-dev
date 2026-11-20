import * as React from 'react';

import { deleteChatDirectory } from '@/lib/chatDirectories';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { captureRuntimeInstance } from '@/lib/runtime-switch';
import { holdPageLock, recoverUnconfirmedSends, type UnconfirmedSendServer } from '@/lib/unconfirmedSends';
import { useSessionDraftsStore } from '@/stores/useSessionDraftsStore';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { waitForConnectionOrThrow } from '@/sync/session-actions';

type Restore = (target: ChatDraftIdentity, text: string, confirmedMentions: Set<string>) => void;

const absentOnNotFound = async <T>(read: Promise<T>, absent: T): Promise<T> => {
    try {
        return await read;
    } catch (error) {
        if (error instanceof CanonicalApiError && error.problem.status === 404) return absent;
        throw error;
    }
};

const serverOfThisRuntime = (): UnconfirmedSendServer => {
    const isCurrent = captureRuntimeInstance();
    return {
        isCurrent,
        ready: waitForConnectionOrThrow,
        sessionDirectory: (sessionId) => absentOnNotFound(
            canonicalClient.getSession(sessionId).then(({ session }) => {
                const directory = resolveWorkspaceDirectory(session.workspaceId);
                if (!directory) throw new Error('The session workspace has not loaded');
                return directory;
            }),
            null,
        ),
        hasMessage: async (sessionId, messageId) => {
            const { messages } = await canonicalClient.getSnapshot(sessionId);
            if (messages.some((message) => message.messageId === messageId)) return true;
            // Local send IDs are correlation IDs, not Canonical message IDs.
            throw new Error('The interrupted send could not be confirmed');
        },
        hasSessionsIn: async (directory) => {
            const workspace = await canonicalClient.resolveWorkspace(directory);
            if (!isCurrent()) throw new Error('Runtime changed while checking the chat directory');
            const { items, errors } = await canonicalClient.listSessions(workspace.workspaceId);
            if (Object.keys(errors).length > 0) throw new Error('The session list did not load completely');
            return items.length > 0;
        },
        deleteChatDirectory,
    };
};

export function useUnconfirmedSendRecovery(
    runtimeKey: string | null,
    restore: Restore,
    shownIdentityRef: React.RefObject<ChatDraftIdentity | null>,
): void {
    React.useEffect(() => {
        if (!runtimeKey) return;
        holdPageLock();
        void recoverUnconfirmedSends(runtimeKey, {
            shown: () => shownIdentityRef.current,
            restore,
            discardDraft: (workDraftId) => void useSessionDraftsStore.getState().discard(workDraftId).catch(() => undefined),
        }, serverOfThisRuntime());
    }, [runtimeKey, restore, shownIdentityRef]);
}
