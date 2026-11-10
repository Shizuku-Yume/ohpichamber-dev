<<<<<<< HEAD
import type { Part } from '@openchamber/agent-contract';
=======
import { isInvisibleText } from '@/lib/invisibleText';
import { getLastConversationRecord, type TextPart, type ToolPart } from '@/lib/opencode/model';
import { isShownInPlace, openChamberToolCall, renderedPage } from '@/lib/opencode/tools';
import { isSessionNoticePart } from '@/lib/opencode/session-notices';
import { isStandaloneTool } from '../../message/parts/toolRenderUtils';
>>>>>>> bc50ba56a
import { fenceUiBlocks } from '../../uiBlocks/taggedBlocks';
import type { ChatMessageEntry, TurnRecord } from './types';

/** A queued user message alone does not retire the previous turn. */
export function getTurnsWithLaterAssistant(turns: readonly TurnRecord[]): Set<string> {
    const retired = new Set<string>();
    let hasLaterAssistant = false;
    for (let index = turns.length - 1; index >= 0; index--) {
        const turn = turns[index];
        if (hasLaterAssistant) retired.add(turn.turnId);
        hasLaterAssistant ||= turn.assistantMessages.length > 0;
    }
    return retired;
}

export function getLiveFinalMessage(messages: readonly ChatMessageEntry[]): ChatMessageEntry | undefined {
    // System records do not retire a visible assistant response.
    let last: ChatMessageEntry | undefined;
    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].role !== 'system') {
            last = messages[index];
            break;
        }
    }
    return last?.role === 'assistant'
        && !last.parts.some((part) => part.type === 'tool_call')
        && last.parts.some((part) => part.type === 'text' && part.content.trim().length > 0)
        ? last : undefined;
}

export function hasLiveActivity(turn: TurnRecord, showReasoning: boolean): boolean {
    if (turn.hasTools || (showReasoning && turn.hasReasoning)) return true;
    return turn.activitySegments?.some((segment) => segment.parts.some((activity) => (
        activity.kind === 'tool' || (showReasoning && activity.kind === 'reasoning')
    ))) ?? false;
}

<<<<<<< HEAD
/** Something a turn showed the user that a collapsed Activity never folds away. */
export type ShownPart = Extract<Part, { type: 'tool_call' } | { type: 'text' }>;
=======
/** Something the turn showed the user that a collapsed Activity never folds away. */
export type ShownPart = ToolPart | TextPart;
>>>>>>> bc50ba56a

// An opening `openui-lang` fence; `openui-lang literal` is a code sample and stays text.
const UI_BLOCK_FENCE = /^ {0,3}(`{3,}|~{3,})openui-lang[ \t]*$/m;

/**
<<<<<<< HEAD
 * What a turn showed the user, in order: text carrying a native UI block that
 * the agent wrote before a later step, and a call still waiting on an answer.
 * The final answer's own text is the answer, so it is never hoisted.
 */
=======
 * A form or secret card that asked the user and no longer waits: answered,
 * answered in the chat instead, or stopped. Like the question tool's card it
 * is a step from then on, so a collapsed Activity folds it.
 */
export const isSettledAsk = (part: ToolPart): boolean => (
    part.state.status !== 'running' && part.state.status !== 'pending'
    && openChamberToolCall(part.tool, part.state.input)?.awaitsAnswer === true
);

/**
 * A settled form right after text the turn keeps in view. Text and the reply
 * would otherwise read as one passage with the question gone from between
 * them, so the form stays as the line that says how it was answered
 * (`ShownPartCard`). A settled secret card has no such line and folds.
 */
const continuesShownText = (part: ToolPart, previous: ShownPart | undefined): boolean => (
    previous !== undefined && isSettledAsk(part) && renderedPage(part.tool, part.state) !== null
    && (previous.type === 'text' || isSettledAsk(previous))
);

/**
 * What a turn showed the user, in the order it happened: the pages of
 * `openchamber_render` calls, and forms only while they wait or when they
 * continue shown text, the workflow runs `workflow.run` calls proposed, and
 * text with a UI block that the agent wrote before a later step. The final
 * answer's own text is the answer, so it is never hoisted.
 */
>>>>>>> bc50ba56a
export function getShownPages(messages: readonly ChatMessageEntry[], finalMessage?: ChatMessageEntry): ShownPart[] {
    const shown: ShownPart[] = [];
    for (const message of messages) {
        for (const part of message.parts) {
<<<<<<< HEAD
            if (part.type === 'tool_call') {
                if (part.status === 'pending_approval' || part.status === 'approved' || part.status === 'running') shown.push(part);
            } else if (part.type === 'text' && message !== finalMessage && UI_BLOCK_FENCE.test(fenceUiBlocks(part.content))) {
=======
            if (part.type === 'tool') {
                const inView = isShownInPlace(part.tool, part.state) && !isSettledAsk(part);
                if (inView || continuesShownText(part, shown.at(-1))) shown.push(part);
            } else if (part.type === 'text' && message !== finalMessage && UI_BLOCK_FENCE.test(fenceUiBlocks(part.text))) {
>>>>>>> bc50ba56a
                shown.push(part);
            }
        }
    }
    return shown;
<<<<<<< HEAD
=======
}

/** The message row that currently draws a hoisted UI page. */
export function uiPageMessageId(turn: TurnRecord | undefined, expanded: boolean, messageId: string, partId: string): string {
    const final = turn ? getLiveFinalMessage(turn.assistantMessages) : undefined;
    return !expanded && turn && final && getShownPages(turn.assistantMessages, final).some((part) => part.id === partId && part.messageID === messageId)
        ? final.info.id
        : messageId;
>>>>>>> bc50ba56a
}
