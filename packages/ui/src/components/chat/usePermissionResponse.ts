import React from 'react';
import type { ApprovalRequest } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useSessions } from '@/sync/sync-context';
import * as sessionActions from '@/sync/session-actions';
import { useChatColumnActions, useChatSessionSelection } from './chatColumnSession';

export type PermissionResponse = 'once' | 'always' | 'reject';

type ColumnKind = 'main' | 'pinned';
type ActivePermissionCard = { id: string; column: ColumnKind };

// The newest pending card of a chat owns that chat's keyboard; older cards
// wait their turn. With a chat pinned in the side panel, each chat answers only
// the keys pressed inside it (anywhere else counts as the main chat).
const activePermissionCards: ActivePermissionCard[] = [];

const columnOfEvent = (event: KeyboardEvent): ColumnKind => (
    event.target instanceof Element && event.target.closest('[data-chat-column="pinned"]') ? 'pinned' : 'main'
);

/** The request was raised by a child of the session the user is looking at. */
export const usePermissionFromSubagent = (permission: ApprovalRequest): boolean => {
    const { sessionId: currentSessionId, directory } = useChatSessionSelection();
    const sessions = useSessions(directory ?? undefined);
    return React.useMemo(() => {
        if (!currentSessionId || permission.sessionId === currentSessionId) return false;
        const sourceSession = sessions.find((session) => session.sessionId === permission.sessionId);
        return Boolean(sourceSession?.parentSessionId && sourceSession.parentSessionId === currentSessionId);
    }, [currentSessionId, permission.sessionId, sessions]);
};

/**
 * Replies to one native approval and owns its keyboard shortcuts while it is
 * the newest pending one: Alt+Enter allows once, Alt+Shift+Enter allows for
 * the session, Alt+Backspace denies. A session allowance exists only when the
 * request carries a native policy target. A rejected reply keeps the card
 * visible and refreshes the authoritative pending set.
 */
export const usePermissionResponse = (
    permission: ApprovalRequest,
    onResponse?: (response: PermissionResponse) => void,
) => {
    const { t } = useI18n();
    const column: ColumnKind = useChatColumnActions().pinned ? 'pinned' : 'main';
    const [isResponding, setIsResponding] = React.useState(false);
    const [hasResponded, setHasResponded] = React.useState(false);
    const respondingRef = React.useRef(false);

    React.useEffect(() => {
        respondingRef.current = false;
        setIsResponding(false);
        setHasResponded(false);
    }, [permission.approvalId]);

    const respond = React.useCallback(async (response: PermissionResponse) => {
        if (respondingRef.current || hasResponded) return;
        if (response === 'always' && permission.policyTarget === undefined) return;
        respondingRef.current = true;
        setIsResponding(true);
        try {
            await sessionActions.respondToPermission(permission.sessionId, permission.approvalId, response);
            setHasResponded(true);
            onResponse?.(response);
        } catch {
            toast.error(t('chat.questionCard.submitFailed'), { description: t('chat.formCard.tryAgain') });
            void sessionActions.refetchSessionMessages(permission.sessionId).catch(() => {
                // The request stays visible; the next sync event retries recovery.
            });
        } finally {
            respondingRef.current = false;
            setIsResponding(false);
        }
    }, [hasResponded, onResponse, permission.approvalId, permission.policyTarget, permission.sessionId, t]);

    const respondRef = React.useRef(respond);
    respondRef.current = respond;

    React.useEffect(() => {
        if (hasResponded) return;
        const card: ActivePermissionCard = { id: permission.approvalId, column };
        activePermissionCards.push(card);
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = columnOfEvent(event);
            let owner: ActivePermissionCard | undefined;
            for (const entry of activePermissionCards) {
                if (entry.column === target) owner = entry;
            }
            if (owner !== card) return;
            if (!event.altKey || event.metaKey || event.ctrlKey) return;
            const response: PermissionResponse | null = event.key === 'Enter'
                ? (event.shiftKey ? (permission.policyTarget ? 'always' : null) : 'once')
                : event.key === 'Backspace' && !event.shiftKey
                    ? 'reject'
                    : null;
            if (!response) return;
            event.preventDefault();
            event.stopPropagation();
            void respondRef.current(response);
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            const index = activePermissionCards.lastIndexOf(card);
            if (index !== -1) activePermissionCards.splice(index, 1);
        };
    }, [column, hasResponded, permission.approvalId, permission.policyTarget]);

    return { isResponding, hasResponded, respond };
};
