import type { Part, ToolResultPart } from '@openchamber/agent-contract';
import { fenceUiBlocks } from '../../uiBlocks/taggedBlocks';
import type { ChatMessageEntry, TurnRecord } from './types';
import { isShownInPlace } from '../../message/parts/pageRenderView';
import { toToolView } from '../../message/parts/toolView';

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
<<<<<<< HEAD
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
||||||| bc50ba56aa
    // Do not use projectTurnSummary's intermediate-text fallback. Compaction,
    // synthetic prompts, skill and shell records are their own message roles
    // in v2 and can trail the final answer, so the lookup skips them instead
    // of reading the last record.
    const last = getLastConversationRecord(messages);
    return last?.info.role === 'assistant' && last.info.finish === 'stop'
        && last.parts.some((part) => part.type === 'text' && !isInvisibleText(part.text))
=======
    const last = getLastConversationRecord(messages);
    return last?.info.role === 'assistant' && last.info.finish === 'stop'
        && last.parts.some((part) => part.type === 'text' && !isInvisibleText(part.text))
>>>>>>> upstream/main
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
||||||| bc50ba56aa
/** Something the turn showed the user that a collapsed Activity never folds away. */
export type ShownPart = ToolPart | TextPart;
=======
export type ShownPart = ToolPart | TextPart;
>>>>>>> upstream/main

const UI_BLOCK_FENCE = /^ {0,3}(`{3,}|~{3,})openui-lang[ \t]*$/m;

<<<<<<< HEAD
/**
 * What a turn showed the user, in order: text carrying a native UI block that
 * the agent wrote before a later step, and a call still waiting on an answer.
 * The final answer's own text is the answer, so it is never hoisted.
 */
||||||| bc50ba56aa
/**
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
=======
export const isSettledAsk = (part: ToolPart): boolean => (
    part.state.status !== 'running' && part.state.status !== 'pending'
    && openChamberToolCall(part.tool, part.state.input)?.awaitsAnswer === true
);

const continuesShownText = (part: ToolPart, previous: ShownPart | undefined): boolean => (
    previous !== undefined && isSettledAsk(part) && renderedPage(part.tool, part.state) !== null
    && (previous.type === 'text' || isSettledAsk(previous))
);

>>>>>>> upstream/main
export function getShownPages(messages: readonly ChatMessageEntry[], finalMessage?: ChatMessageEntry): ShownPart[] {
    const shown: ShownPart[] = [];
    const results = toolResultsByCall(messages);
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type === 'tool_call') {
                const view = toToolView(part, results.get(part.toolCallId), {
                    sessionID: message.sessionId, messageID: message.messageId,
                });
                if (isShownInPlace(view)) shown.push(part);
            } else if (part.type === 'text' && message !== finalMessage && UI_BLOCK_FENCE.test(fenceUiBlocks(part.content))) {
                shown.push(part);
            }
        }
    }
    return shown;
}

<<<<<<< HEAD
/**
 * Every tool result a turn's assistant messages carry, by call id. A shown
 * call draws the result the transcript glued to it, so a card that reads an
 * answer sees the same output the tool row does.
 */
export function toolResultsByCall(messages: readonly ChatMessageEntry[]): Map<string, ToolResultPart> {
    const results = new Map<string, ToolResultPart>();
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type === 'tool_result') results.set(part.toolCallId, part);
        }
    }
    return results;
}

/** The message a shown part belongs to, so a card can name its session and message. */
export function messageOwningPart(messages: readonly ChatMessageEntry[], partId: string): ChatMessageEntry | undefined {
    return messages.find((message) => message.parts.some((part) => part.partId === partId));
||||||| bc50ba56aa
/** The message row that currently draws a hoisted UI page. */
export function uiPageMessageId(turn: TurnRecord | undefined, expanded: boolean, messageId: string, partId: string): string {
    const final = turn ? getLiveFinalMessage(turn.assistantMessages) : undefined;
    return !expanded && turn && final && getShownPages(turn.assistantMessages, final).some((part) => part.id === partId && part.messageID === messageId)
        ? final.info.id
        : messageId;
=======
export function uiPageMessageId(turn: TurnRecord | undefined, expanded: boolean, messageId: string, partId: string): string {
    const final = turn ? getLiveFinalMessage(turn.assistantMessages) : undefined;
    return !expanded && turn && final && getShownPages(turn.assistantMessages, final).some((part) => part.id === partId && part.messageID === messageId)
        ? final.info.id
        : messageId;
>>>>>>> upstream/main
}
