import React from 'react';

import { useSessionPartsForMessages } from '@/sync/sync-context';
import { buildLiveStreamingEntry } from '../lib/turns/streamingTailEntry';
import { EMPTY_ROW_MESSAGE_IDS } from './emptyCollections';
import type { RenderEntry } from './types';
import { useLiveTailCommitNotify, type LiveTailStore } from './liveTailStore';

export const LiveTailSource: React.FC<{
    entry: RenderEntry | undefined;
    sessionId: string;
    directory?: string;
    showTurnChangedFiles: boolean;
    showTextJustificationActivity?: boolean;
    store: LiveTailStore;
}> = ({ entry, sessionId, directory, showTurnChangedFiles, showTextJustificationActivity = false, store }) => {
    const tailMessageIds = React.useMemo(() => {
        if (!entry) return EMPTY_ROW_MESSAGE_IDS;
        if (entry.kind === 'turn') return entry.turn.assistantMessageIds;
        return [entry.message.messageId];
    }, [entry]);
    const livePartsByMessageId = useSessionPartsForMessages(sessionId, tailMessageIds, directory);
    const liveEntry = React.useMemo(() => (entry ? buildLiveStreamingEntry(entry, {
        livePartsByMessageId,
        showTextJustificationActivity,
        showTurnChangedFiles,
        mergeHiddenUserTurns: true,
    }) : null), [entry, livePartsByMessageId, showTextJustificationActivity, showTurnChangedFiles]);
    store.set(liveEntry);
    useLiveTailCommitNotify(liveEntry, store);
    return null;
};
