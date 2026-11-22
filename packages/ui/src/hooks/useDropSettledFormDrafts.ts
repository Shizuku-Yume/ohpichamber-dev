import React from 'react';
import type { QuestionRequest } from '@openchamber/agent-contract';
import { dropFormDraftsForRequest } from '@/components/chat/formDrafts';

type QuestionIdentity = Pick<QuestionRequest, 'questionId' | 'sessionId'>;

export const useDropSettledFormDrafts = (
    owner: { sessionId: string; directory: string },
    forms: readonly QuestionIdentity[],
    runtimeKey: string,
): void => {
    const shown = React.useRef<{ key: string; forms: readonly QuestionIdentity[] } | null>(null);
    const { sessionId, directory } = owner;
    const key = [runtimeKey, directory, sessionId].join('\u0000');
    React.useEffect(() => {
        const previous = shown.current;
        shown.current = { key, forms };
        if (previous?.key !== key) return;
        for (const form of previous.forms) {
            if (forms.some((item) => item.questionId === form.questionId && item.sessionId === form.sessionId)) continue;
            dropFormDraftsForRequest(runtimeKey, form.sessionId, form.questionId);
        }
    }, [key, forms, runtimeKey]);
};
