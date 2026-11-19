import React from 'react';
import type { ApprovalRequest } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useSessions } from '@/sync/sync-context';
import * as sessionActions from '@/sync/session-actions';
import { useChatColumnActions, useChatSessionSelection } from './chatColumnSession';
import { problemMessage } from '@/lib/problemMessage';

export type PermissionResponse = 'once' | 'always' | 'reject';

type ColumnKind = 'main' | 'pinned';
type ActivePermissionCard = { id: string; column: ColumnKind };

<<<<<<< HEAD
// The newest pending card of a chat owns that chat's keyboard; older cards
// wait their turn. With a chat pinned in the side panel, each chat answers only
// the keys pressed inside it (anywhere else counts as the main chat).
const activePermissionCards: ActivePermissionCard[] = [];
||||||| bc50ba56aa
// Newest pending card of a chat owns that chat's keyboard; older cards wait
// their turn. With a chat pinned in the side panel, each chat answers only the
// keys pressed inside it (anywhere else counts as the main chat).
const activePermissionCards: Array<{ id: string; column: ColumnKind }> = [];
=======
const activePermissionCards: Array<{ id: string; column: ColumnKind }> = [];
>>>>>>> upstream/main

const columnOfEvent = (event: KeyboardEvent): ColumnKind => (
    event.target instanceof Element && event.target.closest('[data-chat-column="pinned"]') ? 'pinned' : 'main'
);

<<<<<<< HEAD
/** The request was raised by a child of the session the user is looking at. */
export const usePermissionFromSubagent = (permission: ApprovalRequest): boolean => {
    const { sessionId: currentSessionId, directory } = useChatSessionSelection();
    const sessions = useSessions(directory ?? undefined);
    return React.useMemo(() => {
        if (!currentSessionId || permission.sessionId === currentSessionId) return false;
        const sourceSession = sessions.find((session) => session.sessionId === permission.sessionId);
        return Boolean(sourceSession?.parentSessionId && sourceSession.parentSessionId === currentSessionId);
    }, [currentSessionId, permission.sessionId, sessions]);
||||||| bc50ba56aa
/**
 * The reply a key press gives. "Always" needs something to save. Bindings are
 * single chords matched here, in the capture phase, because the composer would
 * otherwise take the default Alt+Enter as a new line.
 */
export const permissionShortcutReply = (
  event: KeyboardEvent,
  canSave: boolean,
  overrides?: Record<string, string>,
): PermissionReply | null => {
  const pressed = (actionId: ShortcutActionId) => (
    eventMatchesShortcut(event, getEffectiveShortcutCombo(actionId, overrides))
  );
  if (pressed('permission_allow_once')) return 'once';
  if (pressed('permission_deny')) return 'reject';
  return canSave && pressed('permission_allow_always') ? 'always' : null;
};

/** The request was raised by a child of the session the user is looking at. */
export const usePermissionFromSubagent = (permission: PermissionRequest): boolean => {
  const { sessionId: currentSessionId, directory: currentSessionDirectory } = useChatSessionSelection();
  const sessions = useSessions(currentSessionDirectory ?? undefined);
  return React.useMemo(() => {
    if (!currentSessionId || permission.sessionID === currentSessionId) return false;
    const sourceSession = sessions.find((session) => session.id === permission.sessionID);
    return Boolean(sourceSession?.parentID && sourceSession.parentID === currentSessionId);
  }, [permission.sessionID, currentSessionId, sessions]);
=======
export const permissionShortcutReply = (
  event: KeyboardEvent,
  canSave: boolean,
  overrides?: Record<string, string>,
): PermissionReply | null => {
  const pressed = (actionId: ShortcutActionId) => (
    eventMatchesShortcut(event, getEffectiveShortcutCombo(actionId, overrides))
  );
  if (pressed('permission_allow_once')) return 'once';
  if (pressed('permission_deny')) return 'reject';
  return canSave && pressed('permission_allow_always') ? 'always' : null;
};

export const usePermissionFromSubagent = (permission: PermissionRequest): boolean => {
  const { sessionId: currentSessionId, directory: currentSessionDirectory } = useChatSessionSelection();
  const sessions = useSessions(currentSessionDirectory ?? undefined);
  return React.useMemo(() => {
    if (!currentSessionId || permission.sessionID === currentSessionId) return false;
    const sourceSession = sessions.find((session) => session.id === permission.sessionID);
    return Boolean(sourceSession?.parentID && sourceSession.parentID === currentSessionId);
  }, [permission.sessionID, currentSessionId, sessions]);
>>>>>>> upstream/main
};

<<<<<<< HEAD
/**
 * Replies to one native approval and owns its keyboard shortcuts while it is
 * the newest pending one: Alt+Enter allows once, Alt+Shift+Enter allows for
 * the session, Alt+Backspace denies. A session allowance exists only when the
 * request carries a native policy target. A rejected reply keeps the card
 * visible and refreshes the authoritative pending set.
 */
||||||| bc50ba56aa
/**
 * Replies to one request and owns its keyboard shortcuts while it is the
 * newest pending one (see `permissionShortcutReply`). Shared by the inline
 * card and the dock.
 */
=======
>>>>>>> upstream/main
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
        } catch (error) {
            toast.error(problemMessage(error, t('chat.questionCard.submitFailed')), { description: t('chat.formCard.tryAgain') });
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
