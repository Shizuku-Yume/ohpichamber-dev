import React from 'react';
import type { QuestionRequest } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import * as sessionActions from '@/sync/session-actions';
import { deliverQuestionAnswer, type QuestionAnswerPayload } from './questionRequest';
import { problemMessage } from '@/lib/problemMessage';
import { captureRuntimeInstance } from '@/lib/runtime-switch';

/**
 * Submits one native question or plan review reply and cancels the request.
 *
 * The action owner re-reads the pending record before replying, so the CAS
 * `version`/`epoch`/`workerGeneration` are always the current ones and a
 * competing reply cannot be replayed. A rejected reply (including a duplicate
 * CAS conflict) leaves the request pending; refresh the pending set so the card
 * keeps showing the authoritative record instead of disappearing.
 */
export function useQuestionResponse(form: QuestionRequest) {
    const { t } = useI18n();
    const [isResponding, setIsResponding] = React.useState(false);
    const [hasResponded, setHasResponded] = React.useState(false);
    const respondingRef = React.useRef(false);
    const updatesRef = React.useRef(Promise.resolve());

    React.useEffect(() => {
        respondingRef.current = false;
        setIsResponding(false);
        setHasResponded(false);
    }, [form.questionId, form.sessionId]);

    const recoverPending = React.useCallback(() => {
        void sessionActions.refetchSessionMessages(form.sessionId).catch(() => {
            // The request stays visible; the next sync event retries recovery.
        });
    }, [form.sessionId]);

    const update = React.useCallback((payload: QuestionAnswerPayload) => {
        if (respondingRef.current || hasResponded) return;
        const isCurrentRuntime = captureRuntimeInstance();
        updatesRef.current = updatesRef.current.catch(() => {}).then(() => isCurrentRuntime() ? sessionActions.updateForm(form.sessionId, form.questionId, payload) : undefined);
        void updatesRef.current.catch(() => { if (isCurrentRuntime()) recoverPending(); });
    }, [form.questionId, form.sessionId, hasResponded, recoverPending]);

    const answer = React.useCallback(async (payload: QuestionAnswerPayload): Promise<boolean> => {
        // Enter in a text box reaches both the field and the panel handler;
        // one accepted reply owns the CAS until it settles.
        if (respondingRef.current || hasResponded) return false;
        respondingRef.current = true;
        setIsResponding(true);
        const isCurrentRuntime = captureRuntimeInstance();
        try {
            await updatesRef.current.catch(() => {});
            if (!isCurrentRuntime()) return false;
            const accepted = await deliverQuestionAnswer({
                reply: (next) => sessionActions.replyToForm(form.sessionId, form.questionId, next),
                recover: () => { if (isCurrentRuntime()) recoverPending(); },
                failed: (error) => { if (isCurrentRuntime()) toast.error(problemMessage(error, t('chat.questionCard.submitFailed')), { description: t('chat.formCard.tryAgain') }); },
            }, payload);
            if (accepted && isCurrentRuntime()) setHasResponded(true);
            return accepted && isCurrentRuntime();
        } finally {
            respondingRef.current = false;
            setIsResponding(false);
        }
    }, [form.questionId, form.sessionId, hasResponded, recoverPending, t]);

    const cancel = React.useCallback(async (): Promise<boolean> => {
        if (respondingRef.current || hasResponded) return false;
        respondingRef.current = true;
        setIsResponding(true);
        const isCurrentRuntime = captureRuntimeInstance();
        try {
            await updatesRef.current.catch(() => {});
            if (!isCurrentRuntime()) return false;
            await sessionActions.cancelForm(form.sessionId, form.questionId);
            if (!isCurrentRuntime()) return false;
            setHasResponded(true);
            return true;
        } catch (error) {
            if (isCurrentRuntime()) {
                toast.error(problemMessage(error, t('chat.questionCard.dismissFailed')), { description: t('chat.formCard.tryAgain') });
                recoverPending();
            }
            return false;
        } finally {
            respondingRef.current = false;
            setIsResponding(false);
        }
    }, [form.questionId, form.sessionId, hasResponded, recoverPending, t]);

    return { isResponding, hasResponded, answer, cancel, update };
}
