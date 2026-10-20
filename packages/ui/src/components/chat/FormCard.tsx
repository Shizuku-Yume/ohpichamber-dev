import React from 'react';
import type { QuestionRequest } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { copyTextToClipboard } from '@/lib/clipboard';
import { isIMECompositionEvent } from '@/lib/ime';
import { toast } from '@/components/ui';
import { useUIStore } from '@/stores/useUIStore';
import { useSessions } from '@/sync/sync-context';
import { useChatSessionSelection } from './chatColumnSession';
import { FormFieldControl } from './FormFieldControl';
import { FormMarkdown } from './FormMarkdown';
import {
    type AskAnswerState,
    answerAt,
    buildAskAnswer,
    cardQuestionTextIntent,
    initialAskAnswers,
    isAskQuestionAnswered,
    missingAskQuestionIndexes,
    askSchemaSignature,
    parseAskQuestions,
    serializeAskQuestionsMarkdown,
} from './questionRequest';
import { useQuestionResponse } from './useQuestionResponse';

interface FormCardProps {
    form: QuestionRequest;
}

/**
 * Inline native `omp.ask` card, used where a dock cannot float (the BTW
 * sheet). Every question is on screen at once and submits one `{ results }`
 * answer. The main composer uses `FormDock`, which walks the same questions one
 * at a time.
 */
export const FormCard: React.FC<FormCardProps> = ({ form }) => {
    const { t } = useI18n();
    const isMobile = useUIStore((state) => state.isMobile);
    const { sessionId: currentSessionId, directory } = useChatSessionSelection();
    const sessions = useSessions(directory ?? undefined);
    const questions = React.useMemo(() => parseAskQuestions(form.schema), [form.schema]);
    const signature = React.useMemo(() => askSchemaSignature(form.schema), [form.schema]);
    const resetKey = `${form.questionId}:${signature}`;
    const appliedResetKeyRef = React.useRef(resetKey);
    const [answers, setAnswers] = React.useState<AskAnswerState[]>(() => initialAskAnswers(questions));
    const [showErrors, setShowErrors] = React.useState(false);
    const { isResponding, hasResponded, answer, cancel } = useQuestionResponse(form);

    // A rebuilt pending list hands over a new object with the same content;
    // only a different request or changed question content starts over, so a
    // failed submission never discards the user's answers.
    React.useEffect(() => {
        if (appliedResetKeyRef.current === resetKey) return;
        appliedResetKeyRef.current = resetKey;
        setAnswers(initialAskAnswers(questions));
        setShowErrors(false);
    }, [questions, resetKey]);

    const isFromSubagent = React.useMemo(() => {
        if (!currentSessionId || form.sessionId === currentSessionId) return false;
        const sourceSession = sessions.find((session) => session.sessionId === form.sessionId);
        return Boolean(sourceSession?.parentSessionId && sourceSession.parentSessionId === currentSessionId);
    }, [currentSessionId, form.sessionId, sessions]);

    const missing = React.useMemo(() => missingAskQuestionIndexes(questions, answers), [answers, questions]);
    const canSubmit = missing.length === 0;

    const updateAnswer = React.useCallback((index: number, next: AskAnswerState) => {
        setAnswers((previous) => previous.map((entry, entryIndex) => (entryIndex === index ? next : entry)));
    }, []);

    const handleSubmit = React.useCallback(async () => {
        if (!canSubmit) {
            setShowErrors(true);
            return;
        }
        await answer(buildAskAnswer(questions, answers));
    }, [answer, answers, canSubmit, questions]);

    const handleCancel = React.useCallback(async () => {
        await cancel();
    }, [cancel]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (cardQuestionTextIntent(event, { isComposing: isIMECompositionEvent(event), isMobile }) !== 'submit') return;
        event.preventDefault();
        void handleSubmit();
    }, [handleSubmit, isMobile]);

    const handleCopy = React.useCallback(async (format: 'markdown' | 'json') => {
        const text = format === 'markdown'
            ? serializeAskQuestionsMarkdown(form.prompt, questions)
            : JSON.stringify(form.schema ?? {}, null, 2) ?? '';
        const result = await copyTextToClipboard(text);
        if (result.ok) {
            toast.success(t(format === 'markdown' ? 'chat.questionCard.copiedMarkdown' : 'chat.questionCard.copiedJson'));
            return;
        }
        toast.error(t('chat.questionCard.copyFailed'));
    }, [form.prompt, form.schema, questions, t]);

    if (hasResponded || form.status !== 'pending') return null;

    return (
        <div className="group w-full pt-0 pb-2">
            <div className="chat-column">
                <div className="-mt-1 border border-border/30 rounded-xl bg-muted/10">
                    <div className="px-2 py-1.5 border-b border-border/20">
                        <div className="flex items-center gap-2">
                            <Icon name="question" className="h-3.5 w-3.5 text-primary" />
                            <span className="typography-meta font-medium text-foreground">
                                {t('chat.formCard.inputNeeded')}
                            </span>
                            {isFromSubagent ? (
                                <span className="typography-micro text-muted-foreground px-1.5 py-0.5 rounded bg-foreground/5">
                                    {t('chat.formCard.fromSubagent')}
                                </span>
                            ) : null}
                            <div className="ml-auto flex items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => void handleCopy('markdown')}
                                    title={t('chat.questionCard.copyMarkdown')}
                                    aria-label={t('chat.questionCard.copyMarkdown')}
                                    className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-interactive-hover/30 hover:text-foreground"
                                >
                                    <Icon name="file-text" className="h-3 w-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleCopy('json')}
                                    title={t('chat.questionCard.copyJson')}
                                    aria-label={t('chat.questionCard.copyJson')}
                                    className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-interactive-hover/30 hover:text-foreground"
                                >
                                    <Icon name="code" className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="px-2 py-2 space-y-1">
                        {questions.length === 0 ? (
                            <FormMarkdown content={form.prompt} size="meta" />
                        ) : questions.map((question, index) => {
                            const state = answerAt(answers, index);
                            return (
                                <FormFieldControl
                                    key={`${index}:${question.id}`}
                                    question={question}
                                    answer={state}
                                    index={index}
                                    showErrors={showErrors}
                                    isMissing={!isAskQuestionAnswered(question, state)}
                                    isResponding={isResponding}
                                    onChange={(next) => updateAnswer(index, next)}
                                    onTextKeyDown={handleKeyDown}
                                />
                            );
                        })}
                    </div>

                    <div className="px-2 pb-1.5 pt-1 flex items-center gap-1.5 border-t border-border/20">
                        {questions.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => void handleSubmit()}
                                disabled={isResponding}
                                className={cn(
                                    'flex items-center gap-1 px-2 py-1 typography-meta font-medium rounded transition-colors',
                                    'bg-[rgb(var(--status-success)/0.1)] text-[var(--status-success)] hover:bg-[rgb(var(--status-success)/0.2)]',
                                    'disabled:opacity-50 disabled:cursor-not-allowed',
                                )}
                            >
                                <Icon name="check" className="h-3 w-3" />
                                {t('chat.formCard.submit')}
                            </button>
                        ) : null}

                        <button
                            type="button"
                            onClick={() => void handleCancel()}
                            disabled={isResponding}
                            className={cn(
                                'flex items-center gap-1 px-2 py-1 typography-meta font-medium rounded transition-colors',
                                'bg-[rgb(var(--status-error)/0.1)] text-[var(--status-error)] hover:bg-[rgb(var(--status-error)/0.2)]',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                            )}
                        >
                            <Icon name="close" className="h-3 w-3" />
                            {t('chat.formCard.cancel')}
                        </button>

                        {showErrors && !canSubmit ? (
                            <span className="typography-micro text-[var(--status-error)]">
                                {t('chat.formCard.missingRequired')}
                            </span>
                        ) : null}

                        {isResponding ? (
                            <div className="ml-auto">
                                <div className="animate-spin h-3 w-3 border border-primary border-t-transparent rounded-full" />
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};
