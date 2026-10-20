import { normalizeParts } from '../message/partUtils';
import type { Part, ToolResultPart } from '@openchamber/agent-contract';
import type { ChatMessageEntry } from './turns/types';

const callKey = (turnId: string | undefined, toolCallId: string, toolName: string): string => `${turnId ?? ''}\n${toolCallId}\n${toolName}`;

/**
 * Canonical projection authors tool results as independent role:"system"
 * messages. The timeline hides system rows, so pair each result into the
 * display copy of the message that owns its exact toolCallId. This never
 * mutates the authoritative messages and never renders a result twice.
 */
export const attachToolResultsForDisplay = (
    displayMessages: ChatMessageEntry[],
    sourceMessages: readonly ChatMessageEntry[] = displayMessages,
): ChatMessageEntry[] => {
    const results = new Map<string, { result: ToolResultPart; turnId: string | undefined }>();
    for (const message of sourceMessages) {
        if (message.role !== 'system') continue;
        for (const part of message.parts) {
            if (part.type === 'tool_result') results.set(part.partId, { result: part, turnId: message.turnId });
        }
    }
    if (results.size === 0) return displayMessages;

    const ownerByCallKey = new Map<string, number>();
    const displayedPartIds = new Set<string>();
    for (let index = 0; index < displayMessages.length; index++) {
        const message = displayMessages[index]!;
        for (const part of message.parts) {
            displayedPartIds.add(part.partId);
            if (part.type === 'tool_call') ownerByCallKey.set(callKey(message.turnId, part.toolCallId, part.toolName), index);
        }
    }

    const resultsByMessage = new Map<number, ToolResultPart[]>();
    for (const { result, turnId } of results.values()) {
        const owner = ownerByCallKey.get(callKey(turnId, result.toolCallId, result.toolName));
        if (owner === undefined || displayedPartIds.has(result.partId)) continue;
        const entries = resultsByMessage.get(owner);
        if (entries) entries.push(result);
        else resultsByMessage.set(owner, [result]);
    }
    if (resultsByMessage.size === 0) return displayMessages;

    const byCallKey = new Map<string, ToolResultPart[]>();
    for (const entries of resultsByMessage.values()) {
        for (const result of entries) {
            const key = callKey(results.get(result.partId)?.turnId, result.toolCallId, result.toolName);
            const current = byCallKey.get(key);
            if (current) current.push(result);
            else byCallKey.set(key, [result]);
        }
    }

    return displayMessages.map((message, index) => {
        const additions = resultsByMessage.get(index);
        if (!additions) return message;
        const parts: Part[] = [];
        for (const part of message.parts) {
            parts.push(part);
            if (part.type !== 'tool_call') continue;
            const key = callKey(message.turnId, part.toolCallId, part.toolName);
            const paired = byCallKey.get(key);
            if (!paired) continue;
            parts.push(...paired);
            byCallKey.delete(key);
        }
        return { ...message, parts };
    });
};


const normalizeMessageParts = (message: ChatMessageEntry): ChatMessageEntry => {
    const parts = normalizeParts(message.parts);
    if (parts.length === message.parts.length) {
        return message;
    }
    return {
        ...message,
        parts,
    };
};

const normalizedMessageBySource = new WeakMap<ChatMessageEntry, ChatMessageEntry>();

/**
 * The message a timeline row renders, with malformed parts dropped.
 *
 * Cached by source reference: streaming re-renders resolve an unchanged
 * message without rebuilding it, which also keeps its identity stable for the
 * turn projection.
 */
export const getNormalizedMessageForDisplay = (message: ChatMessageEntry): ChatMessageEntry => {
    const cached = normalizedMessageBySource.get(message);
    if (cached) {
        return cached;
    }

    const normalized = normalizeMessageParts(message);
    normalizedMessageBySource.set(message, normalized);
    return normalized;
};
