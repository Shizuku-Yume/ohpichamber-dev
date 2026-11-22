import React from 'react';

import { useGoalModeEnabled } from '@/hooks/useSessionGoal';
import { useSessionUIStore, type DraftGoalObjective } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionActiveRun } from '@/sync/sync-context';
import type { ComposerModeValue } from '../ui/ComposerModeSelector';
import type { useComposerExpansion } from './useComposerExpansion';
import type { useComposerQueueActions } from './useComposerQueueActions';
import type { useComposerSessionScope } from './useComposerSessionScope';

type Dependencies = {
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'isBtwActive' | 'currentSessionId' | 'currentSessionDirectoryForSync' | 'currentDirectory'>;
    expansion: Pick<ReturnType<typeof useComposerExpansion>, 'isExpandedInput' | 'setExpandedInput'>;
    queueActions: Pick<ReturnType<typeof useComposerQueueActions>, 'handleQueueMessage'>;
};

/** Mode, run and expansion state the composer footer controls. */
export function useComposerFooterModes({ sessionScope, expansion, queueActions }: Dependencies) {
    const { isBtwActive, currentSessionId, currentSessionDirectoryForSync, currentDirectory } = sessionScope;
    const { isExpandedInput, setExpandedInput } = expansion;
    const { handleQueueMessage } = queueActions;
    const directory = currentSessionDirectoryForSync ?? currentDirectory ?? undefined;

    const planRoleAvailable = useDirectorySync(React.useCallback((state) => state.models?.planRoleAvailable, []), directory);
    const goalModeEnabled = useGoalModeEnabled();
    const workerRun = useSessionActiveRun(currentSessionId ?? '', directory);

    const handleDraftModeChange = React.useCallback((next: ComposerModeValue, goal?: DraftGoalObjective | null) => {
        useSessionUIStore.getState().setDraftMode(next, goal ?? null);
    }, []);

    const handleToggleExpandedInput = React.useCallback(() => {
        if (isBtwActive) return;
        setExpandedInput(!isExpandedInput);
    }, [isBtwActive, isExpandedInput, setExpandedInput]);

    const handleQueueFromFooter = React.useCallback(() => {
        void handleQueueMessage();
    }, [handleQueueMessage]);

    return {
        planRoleAvailable,
        goalModeEnabled,
        runActive: Boolean(workerRun),
        runOrigin: workerRun?.origin,
        isExpandedInput,
        handleDraftModeChange,
        handleToggleExpandedInput,
        handleQueueFromFooter,
    };
}
