import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
import { AnimatePresence } from 'motion/react';
import type { QuestionRequest } from '@openchamber/agent-contract';
import { ComposerFloatingPanel } from './composer/ui/ComposerFloatingPanel';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { copyTextToClipboard } from '@/lib/clipboard';
import { isIMECompositionEvent } from '@/lib/ime';
import { useUIStore } from '@/stores/useUIStore';
import { useScopedBlockingForms, useSessions } from '@/sync/sync-context';
import { useRequestReveal } from '@/sync/request-reveal';
import { useChatSessionSelection } from './chatColumnSession';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { FormDockModeContext, formWaitingBlockId } from './formsInChat';
import { dropFormDraft, formDraftScope, loadFormDraft, saveFormDraft } from './formDrafts';
import { revealWaitingPage } from '@/sync/request-reveal';
import { AskCountdown } from './AskCountdown';
import { FormFieldControl } from './FormFieldControl';
import { PlanReviewCard } from './PlanReviewCard';
import {
    type AskAnswerState,
    type AskQuestion,
    answerAt,
    askSchemaSignature,
    buildAskAnswer,
    dockQuestionTextIntent,
    initialAskAnswers,
    isAskQuestionAnswered,
    missingAskQuestionIndexes,
    parseAskQuestions,
    parseAskTimeout,
    parsePlanReview,
    serializeAskQuestionsMarkdown,
} from './questionRequest';
import { useQuestionResponse } from './useQuestionResponse';
import { useFormDockFold } from './useFormDockFold';


interface FormDockProps {
    sessionId: string | null;
    directory?: string;
    hidden: boolean;
}

const questionKey = (form: QuestionRequest, directory: string | undefined, runtimeKey: string): string =>
    JSON.stringify([runtimeKey, directory, form.sessionId, form.questionId]);

const FormDockView: React.FC<FormDockProps> = ({ sessionId, directory, hidden }) => {
    const forms = useScopedBlockingForms(sessionId, directory);
    const form = forms[0];
    const mode = React.useContext(FormDockModeContext);
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    if (hidden || !form) return null;
    if (mode === 'in-chat') return <FormDockPointer sessionId={sessionId} form={form} waitingForms={forms} />;
    return (
        <AnimatePresence>
            {parsePlanReview(form.schema)
                ? <PlanReviewCard key={questionKey(form, directory, runtimeKey)} form={form} docked forms={forms} directory={directory} />
                : <QuestionFormPanel key={questionKey(form, directory, runtimeKey)} form={form} forms={forms} directory={directory} />}
        </AnimatePresence>
    );
};

const FormDockPointer: React.FC<{ sessionId: string | null; form: QuestionRequest; waitingForms: QuestionRequest[] }> = ({ sessionId, form, waitingForms }) => {
    const { t } = useI18n();
    const revealCard = React.useCallback((target: QuestionRequest) => {
        if (sessionId) revealWaitingPage(sessionId, formWaitingBlockId(target));
    }, [sessionId]);
    useRequestReveal(waitingForms.map((item) => item.questionId), React.useCallback((id: string) => {
        const target = waitingForms.find((item) => item.questionId === id);
        if (target) revealCard(target);
    }, [revealCard, waitingForms]));
    const title = t('chat.formCard.inputNeeded');
    return <ComposerFloatingPanel role="region" ariaLabel={title} compact header={<>
        <button type="button" onClick={() => revealCard(form)} aria-label={t('chat.formDock.showInChatAria')} className="flex min-w-0 flex-1 items-center gap-2 text-start text-muted-foreground transition-colors hover:text-foreground">
            <Icon name="question" className="size-3.5 shrink-0 text-primary" />
            <Icon name="arrow-up-s" className="size-4 shrink-0" />
            <span className="typography-ui-label min-w-0 truncate text-foreground">{title}</span>
        </button>
        {waitingForms.length > 1 ? <span className="typography-micro shrink-0 text-muted-foreground">{t('chat.formDock.waiting', { count: String(waitingForms.length - 1) })}</span> : null}
    </>} />;
};

function QuestionFrame({ inline, header, children, ariaLabel, ...props }: React.ComponentProps<typeof ComposerFloatingPanel> & { inline: boolean }) {
    return inline ? <div role="region" aria-label={ariaLabel} className="my-2 overflow-hidden rounded-xl border border-border/60 bg-[var(--surface-elevated)]">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">{header}</div>
        {children}
    </div> : <ComposerFloatingPanel {...props} header={header} ariaLabel={ariaLabel}>{children}</ComposerFloatingPanel>;
}

export const QuestionFormPanel: React.FC<{ form: QuestionRequest; forms: readonly QuestionRequest[]; directory?: string; inline?: boolean }> = ({ form, forms, directory: requestDirectory, inline = false }) => {
    const { t } = useI18n();
    const isMobile = useUIStore((state) => state.isMobile);
    // The sessions of the chat this dock belongs to, which may be a chat of
    // another project pinned in the side panel.
    const { sessionId: currentSessionId, directory: selectedDirectory } = useChatSessionSelection();
    const directory = requestDirectory ?? selectedDirectory ?? undefined;
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    const scope = React.useMemo(() => formDraftScope({ sessionId: form.sessionId, questionId: form.questionId }, directory, runtimeKey), [directory, form.sessionId, form.questionId, runtimeKey]);
    const sessions = useSessions(directory ?? undefined);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);

    const questions = React.useMemo(() => parseAskQuestions(form.schema), [form.schema]);
    const timeoutMs = React.useMemo(() => parseAskTimeout(form.schema), [form.schema]);
    const signature = React.useMemo(() => askSchemaSignature(form.schema), [form.schema]);
    const [restored] = React.useState(() => {
        const draft = loadFormDraft(scope);
        return draft?.kind === 'question' && draft.fieldsSignature === signature ? draft : null;
    });
    const [answers, setAnswers] = React.useState<AskAnswerState[]>(() => restored?.answers ?? initialAskAnswers(questions));
    const [step, setStep] = React.useState(restored?.step ?? 0);
    const [collapsed, setCollapsed] = useFormDockFold(!inline);
    const [showErrors, setShowErrors] = React.useState(false);
    const { isResponding, hasResponded, answer, cancel, update } = useQuestionResponse(form);
    const waiting = forms.length - 1;

    // "Open session" on a question's toast expands the dock, including for a
    // question queued behind the one shown.
    const formIds = React.useMemo(() => forms.map((item) => item.questionId), [forms]);
    useRequestReveal(formIds, React.useCallback(() => setCollapsed(false), [setCollapsed]));

    const appliedSignatureRef = React.useRef(signature);
    React.useEffect(() => {
        if (appliedSignatureRef.current === signature) return;
        appliedSignatureRef.current = signature;
        setAnswers(initialAskAnswers(questions));
        setStep(0);
        setShowErrors(false);
    }, [questions, signature]);

    React.useEffect(() => {
        if (appliedSignatureRef.current !== signature || hasResponded) return;
        saveFormDraft(scope, { kind: 'question', fieldsSignature: signature, answers, step });
    }, [answers, scope, hasResponded, signature, step]);

    const isFromSubagent = React.useMemo(() => {
        if (!currentSessionId || form.sessionId === currentSessionId) return false;
        const sourceSession = sessions.find((session) => session.sessionId === form.sessionId);
        return Boolean(sourceSession?.parentSessionId && sourceSession.parentSessionId === currentSessionId);
    }, [currentSessionId, form.sessionId, sessions]);

    const missing = React.useMemo(() => missingAskQuestionIndexes(questions, answers), [answers, questions]);
    const canSubmit = questions.length > 0 && missing.length === 0;
    const lastStep = Math.max(0, questions.length - 1);
    const currentStep = Math.min(step, lastStep);
    const currentQuestion = questions[currentStep];
    const answered = React.useMemo(
        () => questions.map((question, index) => isAskQuestionAnswered(question, answerAt(answers, index))),
        [answers, questions],
    );
    const submitEnabled = !isResponding && questions.length > 0 && answered.every(Boolean);

    const availableMaxHeight = useMobileAutocompleteMaxHeight(bodyRef, !collapsed, 320);

    const updateAnswer = React.useCallback((index: number, next: AskAnswerState) => {
        const nextAnswers = answers.map((entry, entryIndex) => (entryIndex === index ? next : entry));
        setAnswers(nextAnswers);
        if (form.schema?.form === true) update(buildAskAnswer(questions, nextAnswers));
    }, [answers, form.schema, questions, update]);

    const handleSubmit = React.useCallback(async () => {
        if (!canSubmit) {
            setShowErrors(true);
            const firstMissing = missing[0];
            if (firstMissing !== undefined) setStep(firstMissing);
            return;
        }
        if (await answer(buildAskAnswer(questions, answers))) dropFormDraft(scope);
    }, [answer, answers, canSubmit, scope, missing, questions]);

    const handleDismiss = React.useCallback(async () => {
        if (await cancel()) dropFormDraft(scope);
    }, [cancel, scope]);

    const goNext = React.useCallback(() => {
        setStep(Math.min(currentStep + 1, lastStep));
    }, [currentStep, lastStep]);

    const handleTextKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        const intent = dockQuestionTextIntent(event, {
            isComposing: isIMECompositionEvent(event),
            isMobile,
            isLastStep: currentStep >= lastStep,
        });
        if (intent === null) return;
        event.preventDefault();
        if (intent === 'submit') void handleSubmit();
        else goNext();
    }, [currentStep, goNext, handleSubmit, isMobile, lastStep]);

    const handlePanelKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const intent = dockQuestionTextIntent(event, {
            isComposing: isIMECompositionEvent(event),
            isMobile: true,
            isLastStep: true,
        });
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && intent === 'submit') {
            event.preventDefault();
            void handleSubmit();
        }
    }, [handleSubmit]);

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

    const title = t('chat.formCard.inputNeeded');
    const stepLabel = (question: AskQuestion, index: number) =>
        question.header?.trim() || question.question?.trim() || t('chat.questionCard.questionFallback', { index: String(index + 1) });
    const iconButtonClass = 'rounded p-1 text-muted-foreground/70 transition-colors hover:bg-interactive-hover/30 hover:text-foreground';

    if (hasResponded || form.status !== 'pending') return null;

    return (
        <QuestionFrame
            inline={inline}
            role="dialog"
            ariaLabel={title}
            compact={collapsed}
            header={<>
                <button
                    type="button"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? t('chat.formDock.expandAria') : t('chat.formDock.collapseAria')}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Icon name="question" className="size-3.5 shrink-0 text-[var(--status-warning)]" />
                    <Icon name={collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                    <span className="typography-ui-label min-w-0 truncate text-foreground">{title}</span>
                    {isFromSubagent ? (
                        <span className="typography-micro shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 text-muted-foreground">
                            {t('chat.formCard.fromSubagent')}
                        </span>
                    ) : null}
                    {questions.length > 0 ? (
                        <span className="typography-micro shrink-0 tabular-nums text-muted-foreground">
                            {t('chat.formDock.progress', { current: String(currentStep + 1), total: String(questions.length) })}
                        </span>
                    ) : null}
                    <span className="typography-micro shrink-0 tabular-nums text-muted-foreground">
                        <AskCountdown timeoutMs={timeoutMs} requestedAt={form.timeoutResetAt ?? form.requestedAt} />
                    </span>
                </button>
                {/* One dot per question: filled when answered, the current one solid. */}
                {!collapsed && questions.length > 1 ? (
                    <div className="flex shrink-0 items-center gap-1" role="tablist">
                        {questions.map((question, index) => (
                            <button
                                key={`${index}:${question.id}`}
                                type="button"
                                role="tab"
                                aria-selected={index === currentStep}
                                aria-label={t('chat.formDock.stepAria', { index: String(index + 1), title: stepLabel(question, index) })}
                                title={stepLabel(question, index)}
                                onClick={() => setStep(index)}
                                className="flex size-4 items-center justify-center"
                            >
                                <span
                                    className={cn(
                                        'block size-1.5 rounded-full transition-colors',
                                        index === currentStep
                                            ? 'bg-primary'
                                            : answered[index]
                                                ? 'bg-primary/40'
                                                : 'bg-foreground/15',
                                    )}
                                />
                            </button>
                        ))}
                    </div>
                ) : null}
                {waiting > 0 ? (
                    <span className="typography-micro shrink-0 text-muted-foreground">
                        {t('chat.formDock.waiting', { count: String(waiting) })}
                    </span>
                ) : null}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={() => void handleCopy('markdown')} aria-label={t('chat.questionCard.copyMarkdown')} className={iconButtonClass}>
                            <Icon name="file-text" className="size-3" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{t('chat.questionCard.copyMarkdown')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={() => void handleCopy('json')} aria-label={t('chat.questionCard.copyJson')} className={iconButtonClass}>
                            <Icon name="code" className="size-3" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{t('chat.questionCard.copyJson')}</TooltipContent>
                </Tooltip>
            </>}
        >
            {!collapsed ? (
                <div onKeyDown={handlePanelKeyDown}>
                    <ScrollableOverlay
                        ref={bodyRef}
                        preventOverscroll
                        outerClassName="max-h-[50vh] min-h-0"
                        outerStyle={availableMaxHeight === undefined ? undefined : { maxHeight: Math.max(120, availableMaxHeight - 96) }}
                        className="px-1.5"
                    >
                        {currentQuestion ? (
                            <FormFieldControl
                                key={`${currentStep}:${currentQuestion.id}`}
                                question={currentQuestion}
                                answer={answerAt(answers, currentStep)}
                                index={currentStep}
                                showErrors={showErrors}
                                isMissing={missing.includes(currentStep)}
                                isResponding={isResponding}
                                onChange={(next) => updateAnswer(currentStep, next)}
                                onTextKeyDown={handleTextKeyDown}
                            />
                        ) : (
                            <div className="px-1.5 py-1">
                                <FormMarkdownFallback prompt={form.prompt} />
                            </div>
                        )}
                    </ScrollableOverlay>

                    <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
                        <Button variant="ghost" size="xs" disabled={isResponding} onClick={() => void handleDismiss()}>
                            {t('chat.questionCard.dismiss')}
                        </Button>
                        {showErrors && !canSubmit ? (
                            <span className="typography-micro min-w-0 truncate text-[var(--status-error)]">{t('chat.formCard.missingRequired')}</span>
                        ) : null}
                        <div className="min-w-0 flex-1" />
                        {currentStep > 0 ? (
                            <Button variant="outline" size="xs" disabled={isResponding} onClick={() => setStep(currentStep - 1)}>
                                {t('chat.formDock.back')}
                            </Button>
                        ) : null}
                        {currentStep < lastStep ? (
                            <Button variant="outline" size="xs" disabled={isResponding} onClick={goNext}>
                                {t('chat.questionCard.next')}
                            </Button>
                        ) : questions.length > 0 ? (
                            <Button size="xs" disabled={!submitEnabled} onClick={() => void handleSubmit()}>
                                {isResponding ? <Icon name="loader-4" className="size-3.5 animate-spin" /> : <Icon name="check" className="size-3.5" />}
                                {t('chat.formCard.submit')}
                            </Button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </QuestionFrame>
    );
};

const FormMarkdownFallback: React.FC<{ prompt: string }> = ({ prompt }) => {
    const { t } = useI18n();
    return (
        <div>
            <div className="typography-meta font-medium text-foreground">{t('chat.formCard.inputNeeded')}</div>
            <div className="typography-micro whitespace-pre-wrap text-muted-foreground">{prompt}</div>
        </div>
    );
};

/** Memoized: the composer re-renders on every keystroke, and nothing here depends on the draft text. */
export const FormDock = React.memo(FormDockView);
