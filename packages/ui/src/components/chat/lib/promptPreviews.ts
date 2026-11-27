import type { Part } from '@openchamber/agent-contract';
import type { ChatMessageEntry } from './turns/types';

const hasReadablePrompt = (parts: Part[]): boolean =>
    parts.some((part) => part.type !== 'text' || part.content.trim().length > 0);

const foldPromptEntries = (messages: ChatMessageEntry[]): ChatMessageEntry[] =>
    messages.filter((message) => message.role === 'user' && hasReadablePrompt(message.parts));

export const buildPromptPreviewsByTurnId = (messages: ChatMessageEntry[]): Map<string, Part[]> => {
    const previews = new Map<string, Part[]>();
    for (const message of foldPromptEntries(messages)) {
        previews.set(message.turnId, message.parts);
    }
    return previews;
};
