import { getLiveFinalMessage } from './liveActivity';
import { summarizeLiveActivity } from './liveActivitySummary';
import type { ChatMessageEntry, TurnChangedFile, TurnDiffStats, TurnSummaryRecord } from './types';

const getTextFromPart = (part: ChatMessageEntry['parts'][number]): string | undefined => (
    (part.type === 'text' || part.type === 'reasoning') && part.content.trim().length > 0
        ? part.content : undefined
);

export const projectTurnSummary = (assistantMessages: ChatMessageEntry[]): TurnSummaryRecord => {
    for (let messageIndex = assistantMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const assistantMessage = assistantMessages[messageIndex];
        if (!assistantMessage) continue;

        if (!getLiveFinalMessage([assistantMessage])) continue;

        for (let partIndex = assistantMessage.parts.length - 1; partIndex >= 0; partIndex -= 1) {
            const part = assistantMessage.parts[partIndex];
            if (!part || part.type !== 'text') continue;

            const text = getTextFromPart(part);
            if (!text) continue;

            return {
                text,
                sourceMessageId: assistantMessage.messageId,
                sourcePartId: part.partId,
            };
        }
    }

    for (let messageIndex = assistantMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const assistantMessage = assistantMessages[messageIndex];
        if (!assistantMessage) continue;

        for (let partIndex = assistantMessage.parts.length - 1; partIndex >= 0; partIndex -= 1) {
            const part = assistantMessage.parts[partIndex];
            if (!part || part.type !== 'text') continue;

            const text = getTextFromPart(part);
            if (!text) continue;

            return {
                text,
                sourceMessageId: assistantMessage.messageId,
                sourcePartId: part.partId,
            };
        }
    }

    return {};
};

/**
 * "+N −M across F files" for a turn, summed from the edits the turn itself
 * made. v1 read these numbers off a working-tree snapshot on the user
 * message; v2 has none, so the tool-call patches are the source, and a file
 * whose patch carried no line counts contributes only to the file count.
 */
export const projectTurnDiffStats = (changedFiles: TurnChangedFile[] | undefined): TurnDiffStats | undefined => {
    if (!changedFiles || changedFiles.length === 0) {
        return undefined;
    }

    let additions = 0;
    let deletions = 0;

    for (const change of changedFiles) {
        additions += change.additions ?? 0;
        deletions += change.deletions ?? 0;
    }

    return {
        additions,
        deletions,
        files: changedFiles.length,
    };
};

/**
 * Files this turn changed, as evidenced by its own edit/write calls.
 *
 * Native execution supplies no filesystem snapshot. Line counts come from
 * each call's patch; files changed only in a child session are not listed here.
 */
export const projectTurnChangedFiles = (
    assistantMessages: ChatMessageEntry[],
): TurnChangedFile[] | undefined => {
    const summary = summarizeLiveActivity(assistantMessages);

    const files = summary.changedFiles.map((change): TurnChangedFile => (
        change.additions !== undefined && change.deletions !== undefined
            ? { file: change.path, additions: change.additions, deletions: change.deletions }
            : { file: change.path }
    ));

    return files.length > 0 ? files : undefined;
};
