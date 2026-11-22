import { normalizeParts } from '../message/partUtils';
import type { Part, ToolResultPart } from '@openchamber/agent-contract';
import type { ChatMessageEntry } from './turns/types';

const normalizeMessageParts = (message: ChatMessageEntry): ChatMessageEntry => {
    const validParts = normalizeParts(message.parts);
    const callKeys = new Set(validParts.flatMap((part) => part.type === 'tool_call'
        ? [`${part.toolCallId}\n${part.toolName}`] : []));
    const resultsByCall = new Map<string, ToolResultPart[]>();
    for (const part of validParts) {
        if (part.type !== 'tool_result') continue;
        const key = `${part.toolCallId}\n${part.toolName}`;
        if (!callKeys.has(key)) continue;
        const results = resultsByCall.get(key) ?? [];
        results.push(part);
        resultsByCall.set(key, results);
    }
    // Results arrive in execution order; their visible row stays at the call's position.
    const parts = validParts.flatMap<Part>((part) => {
        if (part.type === 'tool_result' && resultsByCall.has(`${part.toolCallId}\n${part.toolName}`)) return [];
        if (part.type === 'tool_call') return [part, ...resultsByCall.get(`${part.toolCallId}\n${part.toolName}`) ?? []];
        return [part];
    });
    if (parts.length === message.parts.length && parts.every((part, index) => part === message.parts[index])) {
        return message;
    }
    return {
        ...message,
        parts,
    };
};

const normalizedMessageBySource = new WeakMap<ChatMessageEntry, ChatMessageEntry>();

export const getNormalizedMessageForDisplay = (message: ChatMessageEntry): ChatMessageEntry => {
    const cached = normalizedMessageBySource.get(message);
    if (cached) {
        return cached;
    }

    const normalized = normalizeMessageParts(message);
    normalizedMessageBySource.set(message, normalized);
    return normalized;
};
