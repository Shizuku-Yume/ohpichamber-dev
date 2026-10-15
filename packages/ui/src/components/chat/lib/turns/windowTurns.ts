import type { ChatMessageEntry } from './types';

const resolveMessageRole = (message: ChatMessageEntry): string => message.role;

/** Canonical user prompts open turns; system records remain timeline notices. */
const opensTurn = (message: ChatMessageEntry): boolean => message.role === 'user';

export interface TurnWindowModel {
    turnIds: string[];
    turnMessageStartIndexes: number[];
    turnIndexById: Map<string, number>;
    messageToTurnId: Map<string, string>;
    messageToTurnIndex: Map<string, number>;
    turnCount: number;
}

const getMessageSignature = (message: ChatMessageEntry | undefined): string | null => {
    if (!message) return null;
    const role = resolveMessageRole(message);
    return `${message.messageId}::${role}::${message.turnId}`;
};

const cloneTurnWindowModel = (model: TurnWindowModel): TurnWindowModel => ({
    turnIds: [...model.turnIds],
    turnMessageStartIndexes: [...model.turnMessageStartIndexes],
    turnIndexById: new Map(model.turnIndexById),
    messageToTurnId: new Map(model.messageToTurnId),
    messageToTurnIndex: new Map(model.messageToTurnIndex),
    turnCount: model.turnCount,
});

export const updateTurnWindowModelIncremental = (
    previousModel: TurnWindowModel | null,
    previousMessages: ChatMessageEntry[] | null,
    nextMessages: ChatMessageEntry[],
): TurnWindowModel | null => {
    if (!previousModel || !previousMessages) {
        return null;
    }

    if (previousMessages.length === nextMessages.length) {
        let changedIndex = -1;
        for (let index = 0; index < nextMessages.length; index += 1) {
            if (previousMessages[index] === nextMessages[index]) {
                continue;
            }
            if (changedIndex !== -1) {
                return null;
            }
            changedIndex = index;
        }

        if (changedIndex === -1) {
            return previousModel;
        }

        if (changedIndex !== nextMessages.length - 1) {
            return null;
        }

        return getMessageSignature(previousMessages[changedIndex]) === getMessageSignature(nextMessages[changedIndex])
            ? previousModel
            : null;
    }

    if (nextMessages.length !== previousMessages.length + 1) {
        return null;
    }

    for (let index = 0; index < previousMessages.length; index += 1) {
        if (previousMessages[index] !== nextMessages[index]) {
            return null;
        }
    }

    const nextMessage = nextMessages[nextMessages.length - 1];
    if (!nextMessage) {
        return null;
    }

    const role = resolveMessageRole(nextMessage);
    const messageId = nextMessage.messageId;
    const nextModel = cloneTurnWindowModel(previousModel);

    if (opensTurn(nextMessage)) {
        const nextTurnIndex = nextModel.turnIds.length;
        nextModel.turnIds.push(nextMessage.turnId);
        nextModel.turnMessageStartIndexes.push(nextMessages.length - 1);
        nextModel.turnIndexById.set(nextMessage.turnId, nextTurnIndex);
        nextModel.messageToTurnId.set(messageId, nextMessage.turnId);
        nextModel.messageToTurnIndex.set(messageId, nextTurnIndex);
        nextModel.turnCount = nextModel.turnIds.length;
        return nextModel;
    }

    if (role !== 'assistant') {
        const currentTurnIndex = nextModel.turnIds.length - 1;
        if (currentTurnIndex < 0) {
            return null;
        }
        const turnId = nextModel.turnIds[currentTurnIndex];
        if (!turnId) {
            return null;
        }
        nextModel.messageToTurnId.set(messageId, turnId);
        nextModel.messageToTurnIndex.set(messageId, currentTurnIndex);
        return nextModel;
    }

    const targetTurnIndex = nextModel.turnIndexById.get(nextMessage.turnId);
    if (typeof targetTurnIndex !== 'number' || targetTurnIndex < 0) {
        return null;
    }

    const turnId = nextModel.turnIds[targetTurnIndex];
    if (!turnId) {
        return null;
    }

    nextModel.messageToTurnId.set(messageId, turnId);
    nextModel.messageToTurnIndex.set(messageId, targetTurnIndex);
    return nextModel;
};

export const buildTurnWindowModel = (messages: ChatMessageEntry[]): TurnWindowModel => {
    const turnIds: string[] = [];
    const turnMessageStartIndexes: number[] = [];
    const turnIndexById = new Map<string, number>();
    const messageToTurnId = new Map<string, string>();
    const messageToTurnIndex = new Map<string, number>();

    let currentTurnIndex = -1;

    messages.forEach((message, index) => {
        const role = resolveMessageRole(message);
        const messageId = message.messageId;

        if (opensTurn(message)) {
            currentTurnIndex = turnIds.length;
            turnIds.push(message.turnId);
            turnMessageStartIndexes.push(index);
            turnIndexById.set(message.turnId, currentTurnIndex);
            messageToTurnId.set(messageId, message.turnId);
            messageToTurnIndex.set(messageId, currentTurnIndex);
            return;
        }

        if (role !== 'assistant') {
            if (currentTurnIndex >= 0) {
                const turnId = turnIds[currentTurnIndex];
                if (turnId) {
                    messageToTurnId.set(messageId, turnId);
                    messageToTurnIndex.set(messageId, currentTurnIndex);
                }
            }
            return;
        }

        const targetTurnIndex = turnIndexById.get(message.turnId);
        if (typeof targetTurnIndex !== 'number') {
            return;
        }
        if (targetTurnIndex < 0) {
            return;
        }

        const turnId = turnIds[targetTurnIndex];
        if (!turnId) {
            return;
        }

        messageToTurnId.set(messageId, turnId);
        messageToTurnIndex.set(messageId, targetTurnIndex);
    });

    return {
        turnIds,
        turnMessageStartIndexes,
        turnIndexById,
        messageToTurnId,
        messageToTurnIndex,
        turnCount: turnIds.length,
    };
};
