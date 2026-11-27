import React from 'react';
import type { Message, SessionRuntimeStatus } from '@openchamber/agent-contract';
import {
    useSessionStatus,
    useScopedBlockingPermissions,
    useScopedBlockingForms,
} from '@/sync/sync-context';
import type { useSync } from '@/sync/use-sync';
import { hasActiveFormToolInCurrentTurn, recoverPendingFormWithRetry } from '@/sync/form-recovery';

const IDLE_SESSION_STATUS: SessionRuntimeStatus = 'idle';

export const useColumnSessionActivity = ({
    active,
    currentSessionId,
    effectiveSessionDirectory,
    sessionMessages,
    sync,
}: {
    active: boolean;
    currentSessionId: string | null;
    effectiveSessionDirectory: string | undefined;
    sessionMessages: Message[];
    sync: ReturnType<typeof useSync>;
}) => {
    const sessionStatusForCurrent = useSessionStatus(currentSessionId ?? '', effectiveSessionDirectory) ?? IDLE_SESSION_STATUS;
    const sessionPermissions = useScopedBlockingPermissions(currentSessionId, effectiveSessionDirectory);
    const sessionForms = useScopedBlockingForms(currentSessionId, effectiveSessionDirectory);

    const hasUnreconciledFormTool = React.useMemo(
        () => !sessionForms.some((form) => form.sessionId === currentSessionId)
            && hasActiveFormToolInCurrentTurn(sessionMessages),
        [currentSessionId, sessionMessages, sessionForms],
    );

    React.useEffect(() => {
        if (!active || !currentSessionId || !effectiveSessionDirectory || !hasUnreconciledFormTool) return;
        let cancelled = false;

        void recoverPendingFormWithRetry(
            () => sync.recoverPendingQuestions(currentSessionId, effectiveSessionDirectory),
            { isCancelled: () => cancelled },
        );

        return () => {
            cancelled = true;
        };
    }, [active, currentSessionId, effectiveSessionDirectory, hasUnreconciledFormTool, sync]);

    const sessionIsWorking = React.useMemo(() => {
        if (!currentSessionId || sessionPermissions.length > 0 || sessionForms.length > 0) {
            return false;
        }
        return sessionStatusForCurrent === 'running';
    }, [currentSessionId, sessionPermissions.length, sessionForms.length, sessionStatusForCurrent]);

    return { sessionStatusForCurrent, sessionPermissions, sessionForms, sessionIsWorking };
};
