import { isQuestionTool, isSubagentTool } from '@/lib/toolHelpers';
import type {
    ChatMessageEntry,
    TurnActivityGroup,
    TurnActivityRecord,
    TurnPartRecord,
} from './types';


const buildTurnPartRecord = (
    turnId: string,
    messageId: string,
    part: ChatMessageEntry['parts'][number],
    partIndex: number,
): TurnPartRecord => {
    return {
        id: part.partId,
        turnId,
        messageId,
        part,
        partIndex,
    };
};

interface ProjectActivityInput {
    turnId: string;
    assistantMessages: ChatMessageEntry[];
    summarySourceMessageId?: string;
    summarySourcePartId?: string;
    showTextJustificationActivity: boolean;
}

interface ProjectActivityResult {
    activityParts: TurnActivityRecord[];
    activitySegments: TurnActivityGroup[];
    hasTools: boolean;
    hasReasoning: boolean;
}

export const projectTurnActivity = (input: ProjectActivityInput): ProjectActivityResult => {
    const activityParts: TurnActivityRecord[] = [];
    let hasTools = false;
    let hasReasoning = false;

    input.assistantMessages.forEach((message) => {
        message.parts.forEach((part) => {
            if (part.type === 'tool_call' || part.type === 'tool_result') {
                hasTools = true;
                return;
            }

            if (part.type === 'reasoning' && part.content.trim().length > 0) {
                hasReasoning = true;
            }
        });
    });

    const taskMessageById = new Map<string, string>();
    const standaloneCallIds = new Set<string>();
    const taskOrder: string[] = [];
    const partsByAfterTool = new Map<string | null, TurnActivityRecord[]>();
    let currentAfterToolPartId: string | null = null;

    input.assistantMessages.forEach((message) => {
        const messageHasTool = message.parts.some((part) => part.type === 'tool_call' || part.type === 'tool_result');
        // Keep context for unanswered questions inline rather than burying it
        // in the collapsible activity group.
        const messageHasQuestion = message.parts.some((part) => (
            (part.type === 'tool_call' || part.type === 'tool_result') && isQuestionTool(part.toolName)
        ));

        message.parts.forEach((part, partIndex) => {
            const isTool = part.type === 'tool_call' || part.type === 'tool_result';

            const text = part.type === 'reasoning' || part.type === 'text'
                ? part.content.trim().length > 0 ? part.content : undefined
                : undefined;
            const partId = part.partId;
            const standaloneTool = (part.type === 'tool_call' || part.type === 'tool_result')
                && isSubagentTool(part.toolName);
            if (standaloneTool && (part.type === 'tool_call'
                || (part.type === 'tool_result' && !standaloneCallIds.has(part.toolCallId)))) {
                standaloneCallIds.add(part.toolCallId);
                taskMessageById.set(partId, message.messageId);
                taskOrder.push(partId);
                currentAfterToolPartId = partId;
            }

            const isConfirmedSummaryText = part.type === 'text'
                && typeof text === 'string'
                && input.summarySourceMessageId === message.messageId
                && input.summarySourcePartId === partId;

            let kind: TurnActivityRecord['kind'] | null = null;
            if (isTool) {
                kind = 'tool';
            } else if (part.type === 'reasoning') {
                if (text) {
                    kind = 'reasoning';
                }
            } else if (
                input.showTextJustificationActivity
                && part.type === 'text'
                && text
                && !messageHasQuestion
                && !isConfirmedSummaryText
                && messageHasTool
            ) {
                kind = 'justification';
            }

            if (!kind) {
                return;
            }

            const activity: TurnActivityRecord = {
                ...buildTurnPartRecord(input.turnId, message.messageId, part, partIndex),
                kind,
            };
            activityParts.push(activity);

            if (kind === 'tool' && standaloneTool && taskMessageById.has(partId)) {
                return;
            }

            const list = partsByAfterTool.get(currentAfterToolPartId) ?? [];
            list.push(activity);
            partsByAfterTool.set(currentAfterToolPartId, list);
        });
    });

    const activitySegments: TurnActivityGroup[] = [];

    const pickStartAnchor = (segmentParts: TurnActivityRecord[]): string | undefined => {
        if (segmentParts.length === 0) {
            return undefined;
        }

        const countByMessage = new Map<string, number>();
        segmentParts.forEach((activity) => {
            countByMessage.set(activity.messageId, (countByMessage.get(activity.messageId) ?? 0) + 1);
        });

        let firstWithAny: string | undefined;
        for (const message of input.assistantMessages) {
            const count = countByMessage.get(message.messageId) ?? 0;
            if (count > 0 && !firstWithAny) {
                firstWithAny = message.messageId;
            }
        }

        return firstWithAny;
    };

    const orderedKeys: Array<string | null> = [null, ...taskOrder];
    orderedKeys.forEach((afterToolPartId) => {
        const segmentParts = partsByAfterTool.get(afterToolPartId) ?? [];
        if (segmentParts.length === 0) {
            return;
        }

        const anchorMessageId = afterToolPartId === null
            ? pickStartAnchor(segmentParts)
            : taskMessageById.get(afterToolPartId);

        if (!anchorMessageId) {
            return;
        }

        activitySegments.push({
            id: `${input.turnId}:${anchorMessageId}:${afterToolPartId ?? 'start'}`,
            anchorMessageId,
            afterToolPartId,
            parts: segmentParts,
        });
    });

    return {
        activityParts,
        activitySegments,
        hasTools,
        hasReasoning,
    };
};
