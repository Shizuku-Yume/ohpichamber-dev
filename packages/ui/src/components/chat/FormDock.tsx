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
<<<<<<< HEAD
import { useI18n } from '@/lib/i18n';
import { copyTextToClipboard } from '@/lib/clipboard';
import { isIMECompositionEvent } from '@/lib/ime';
=======
import { isIMECompositionEvent } from '@/lib/ime';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { FormRequest } from '@/lib/opencode/model';
import type { RecoveredQuestion } from '@/sync/recoverable-questions';
import { readWebSearchConsent } from '@/lib/opencode/websearch';
>>>>>>> bc50ba56a
import { useUIStore } from '@/stores/useUIStore';
import { useScopedBlockingForms, useRecoveredQuestions, useSessions } from '@/sync/sync-context';
import { useRequestReveal } from '@/sync/request-reveal';
import { useChatSessionSelection } from './chatColumnSession';
<<<<<<< HEAD
=======
import * as sessionActions from '@/sync/session-actions';
import { agentUnavailableFrom, isFormRequestNotFoundError } from '@/sync/form-request-error';
>>>>>>> bc50ba56a
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import { AskCountdown } from './AskCountdown';
import { FormFieldControl } from './FormFieldControl';
<<<<<<< HEAD
import { PlanReviewCard } from './PlanReviewCard';
=======
import { WebSearchConsentDock } from './WebSearchConsent';
import { FormMarkdown } from './FormMarkdown';
import { serializeFormAnswerAsMarkdown, serializeFormAsJson, serializeFormAsMarkdown } from './formSerializers';
import { formDraftScope, loadFormDraft, saveFormDraft, dropFormDraft } from './formDrafts';
import { noteLocalFormCancelled } from '@/sync/recoverable-questions';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
>>>>>>> bc50ba56a
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

/**
 * The agent's native `omp.ask` question, docked above the composer.
 *
 * One request can carry several questions, and the reply is one `{ results }`
 * answer for all of them. The dock walks the questions one at a time with a
 * segment per step, Back / Next, and Submit in place of Next on the last one.
 * Enter in a text box moves to the next step (Submit on the last); Cmd/Ctrl+
 * Enter submits from anywhere. Composition keys never submit.
 */

interface FormDockProps {
    sessionId: string | null;
    directory?: string;
    hidden: boolean;
}

const FormDockView: React.FC<FormDockProps> = ({ sessionId, directory, hidden }) => {
    const forms = useScopedBlockingForms(sessionId, directory);
    const form = forms[0];
<<<<<<< HEAD
    // Keyed on the request id so a different request starts clean and the
    // panels cross-fade instead of swapping content in place.
    return (
        <AnimatePresence>
            {hidden || !form ? null : parsePlanReview(form.schema) ? (
                <PlanReviewCard key={form.questionId} form={form} docked forms={forms} />
            ) : <FormDockPanel key={form.questionId} form={form} forms={forms} />}
=======
    const webSearchConsent = form ? readWebSearchConsent(form) : null;
    // A question whose ask died with its turn waits behind the live requests;
    // answering it starts a new turn instead of replying to a form.
    const recovered = useRecoveredQuestions(sessionId, directory);
    const recoveredFirst = form ? undefined : recovered[0];
    // Keyed on the form id so a different request starts from a clean slate
    // (and the panels cross-fade instead of swapping content in place).
    return (
        <AnimatePresence>
            {hidden ? null : form ? (
                webSearchConsent
                    ? <WebSearchConsentDock key={form.id} form={form} consent={webSearchConsent} />
                    : <FormDockPanel key={form.id} form={form} forms={forms} directory={directory} />
            ) : recoveredFirst ? (
                <FormDockPanel
                    key={recoveredFirst.form.id}
                    form={recoveredFirst.form}
                    forms={forms}
                    directory={directory}
                    recovered={recoveredFirst}
                />
            ) : null}
>>>>>>> bc50ba56a
        </AnimatePresence>
    );
};

<<<<<<< HEAD
type FormDraft = { signature: string; answers: AskAnswerState[]; step: number };

// Answers in progress outlive the panel: switching sessions unmounts it, and
// coming back must find the request where it was left. Kept in memory only and
// dropped once the request is answered or dismissed.
const formDrafts = new Map<string, FormDraft>();
const MAX_FORM_DRAFTS = 50;

const saveFormDraft = (questionId: string, draft: FormDraft) => {
    formDrafts.delete(questionId);
    formDrafts.set(questionId, draft);
    if (formDrafts.size > MAX_FORM_DRAFTS) {
        const oldest = formDrafts.keys().next().value;
        if (oldest !== undefined) formDrafts.delete(oldest);
    }
};

const FormDockPanel: React.FC<{ form: QuestionRequest; forms: QuestionRequest[] }> = ({ form, forms }) => {
=======
const isStepAnswered = (field: FormField, values: FormValues): boolean => {
    if (!isAnswerableField(field)) return valueOf(values, field.key).acknowledged;
    const answer = fieldAnswer(field, values);
    if (answer === undefined) return false;
    return !(Array.isArray(answer) && answer.length === 0);
};

const FormDockPanel: React.FC<{
    form: FormRequest;
    forms: FormRequest[];
    directory?: string;
    /** Set when this card re-asks a question whose turn died before it was answered. */
    recovered?: RecoveredQuestion;
}> = ({ form, forms, directory, recovered }) => {
>>>>>>> bc50ba56a
    const { t } = useI18n();
    const isMobile = useUIStore((state) => state.isMobile);
    // The sessions of the chat this dock belongs to, which may be a chat of
    // another project pinned in the side panel.
    const { sessionId: currentSessionId, directory } = useChatSessionSelection();
    const sessions = useSessions(directory ?? undefined);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);

<<<<<<< HEAD
    const questions = React.useMemo(() => parseAskQuestions(form.schema), [form.schema]);
    const timeoutMs = React.useMemo(() => parseAskTimeout(form.schema), [form.schema]);
    const signature = React.useMemo(() => askSchemaSignature(form.schema), [form.schema]);
    const [restored] = React.useState(() => {
        const draft = formDrafts.get(form.questionId);
        return draft?.signature === signature ? draft : null;
=======
    const fields = form.fields;
    // A rebuilt pending list hands over a new object with the same content;
    // only fields that actually changed start the answers over.
    const fieldsSignature = fields.map((field) => `${field.key}:${field.type}`).join('|');
    const draftScope = React.useMemo(() => formDraftScope(form, recovered?.directory ?? directory), [directory, form, recovered?.directory]);
    const [restored] = React.useState(() => {
        const draft = loadFormDraft(draftScope);
        return draft?.fieldsSignature === fieldsSignature ? draft : null;
>>>>>>> bc50ba56a
    });
    const [answers, setAnswers] = React.useState<AskAnswerState[]>(() => restored?.answers ?? initialAskAnswers(questions));
    const [step, setStep] = React.useState(restored?.step ?? 0);
    const [collapsed, setCollapsed] = React.useState(false);
<<<<<<< HEAD
=======
    const [isResponding, setIsResponding] = React.useState(false);
    const respondingRef = React.useRef(false);
>>>>>>> bc50ba56a
    const [showErrors, setShowErrors] = React.useState(false);
    const { isResponding, hasResponded, answer, cancel } = useQuestionResponse(form);
    const waiting = forms.length - 1;

    // "Open session" on a question's toast expands the dock, including for a
    // question queued behind the one shown.
    const formIds = React.useMemo(() => forms.map((item) => item.questionId), [forms]);
    useRequestReveal(formIds, React.useCallback(() => setCollapsed(false), []));

    const appliedSignatureRef = React.useRef(signature);
    React.useEffect(() => {
        if (appliedSignatureRef.current === signature) return;
        appliedSignatureRef.current = signature;
        setAnswers(initialAskAnswers(questions));
        setStep(0);
        setShowErrors(false);
    }, [questions, signature]);

    React.useEffect(() => {
<<<<<<< HEAD
        if (appliedSignatureRef.current !== signature || hasResponded) return;
        saveFormDraft(form.questionId, { signature, answers, step });
    }, [answers, form.questionId, hasResponded, signature, step]);
=======
        if (appliedSignatureRef.current !== fieldsSignature) return;
        saveFormDraft(draftScope, { fieldsSignature, values, step });
    }, [draftScope, fieldsSignature, step, values]);
>>>>>>> bc50ba56a

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

<<<<<<< HEAD
    const updateAnswer = React.useCallback((index: number, next: AskAnswerState) => {
        setAnswers((previous) => previous.map((entry, entryIndex) => (entryIndex === index ? next : entry)));
=======
    // The phone's keyboard rises after the answer box takes focus and shrinks
    // the body under it, which leaves the box below the part still shown.
    React.useLayoutEffect(() => {
        const focused = document.activeElement;
        if (!focused || !bodyRef.current?.contains(focused)) return;
        focused.scrollIntoView({ block: 'nearest' });
    }, [availableMaxHeight]);

    const updateValue = React.useCallback((key: string, patch: Partial<FormValues[string]>) => {
        setValues((previous) => ({ ...previous, [key]: { ...valueOf(previous, key), ...patch } }));
>>>>>>> bc50ba56a
    }, []);

    const handleSubmit = React.useCallback(async () => {
        if (respondingRef.current) return;
        if (!canSubmit) {
            // Jump to the first question that still needs an answer.
            setShowErrors(true);
            const firstMissing = missing[0];
            if (firstMissing !== undefined) setStep(firstMissing);
            return;
        }
<<<<<<< HEAD
        if (await answer(buildAskAnswer(questions, answers))) formDrafts.delete(form.questionId);
    }, [answer, answers, canSubmit, form.questionId, missing, questions]);

    const handleDismiss = React.useCallback(async () => {
        if (await cancel()) formDrafts.delete(form.questionId);
    }, [cancel, form.questionId]);
=======
        respondingRef.current = true;
        setIsResponding(true);
        try {
            const answer = buildFormAnswer(fields, values);
            if (recovered) {
                await sessionActions.sendRecoveredFormAnswer(recovered, serializeFormAnswerAsMarkdown(form, answer));
            } else {
                await sessionActions.replyToForm(form.sessionID, form.id, answer);
            }
            dropFormDraft(draftScope);
        } catch (error) {
            if (!recovered && isFormRequestNotFoundError(error)) {
                dropFormDraft(draftScope);
                return;
            }
            const unavailableAgent = agentUnavailableFrom(error instanceof Error ? error : null);
            if (unavailableAgent) {
                toast.error(t('chat.chatInput.toast.agentUnavailable', { agent: unavailableAgent }));
                return;
            }
            toast.error(t('chat.formCard.submitFailed'), { description: t('chat.formCard.tryAgain') });
        } finally {
            respondingRef.current = false;
            setIsResponding(false);
        }
    }, [canSubmit, draftScope, fields, form, missing, recovered, shown, t, values]);

    const handleDismiss = React.useCallback(async () => {
        if (respondingRef.current) return;
        respondingRef.current = true;
        setIsResponding(true);
        try {
            if (recovered) {
                noteLocalFormCancelled(recovered.form.id);
            } else {
                await sessionActions.cancelForm(form.sessionID, form.id);
            }
            dropFormDraft(draftScope);
        } catch (error) {
            if (!recovered && isFormRequestNotFoundError(error)) {
                dropFormDraft(draftScope);
                return;
            }
            toast.error(t('chat.formCard.cancelFailed'), { description: t('chat.formCard.tryAgain') });
        } finally {
            respondingRef.current = false;
            setIsResponding(false);
        }
    }, [draftScope, form.id, form.sessionID, recovered, t]);
>>>>>>> bc50ba56a

    const goNext = React.useCallback(() => {
        setStep(Math.min(currentStep + 1, lastStep));
    }, [currentStep, lastStep]);

    const handleTextKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

<<<<<<< HEAD
    const title = t('chat.formCard.inputNeeded');
    const stepLabel = (question: AskQuestion, index: number) =>
        question.header?.trim() || question.question?.trim() || t('chat.questionCard.questionFallback', { index: String(index + 1) });
    const iconButtonClass = 'rounded p-1 text-muted-foreground/70 transition-colors hover:bg-interactive-hover/30 hover:text-foreground';
=======
    const title = form.title?.trim() || t('chat.formCard.inputNeeded');
    const stepLabel = (field: FormField, index: number) => field.title?.trim() || t('chat.questionCard.questionFallback', { index: String(index + 1) });
    const iconButtonClass = 'rounded p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/30 hover:text-foreground';
>>>>>>> bc50ba56a

    if (hasResponded || form.status !== 'pending') return null;

    return (
        <ComposerFloatingPanel
            role="dialog"
            ariaLabel={title}
            compact={collapsed}
            header={<>
                <Tooltip>
                <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? t('chat.formDock.expandAria') : t('chat.formDock.collapseAria')}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Icon name="question" className="size-3.5 shrink-0 text-[var(--status-warning)]" />
                    <Icon name={collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                    <span dir="auto" className="typography-ui-label min-w-0 truncate oc-ui-start-align text-foreground">{title}</span>
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
                        <AskCountdown timeoutMs={timeoutMs} requestedAt={form.requestedAt} />
                    </span>
                </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{collapsed ? t('chat.formDock.expandAria') : t('chat.formDock.collapseAria')}</TooltipContent>
                </Tooltip>
                {/* One dot per question: filled when answered, the current one solid. */}
                {!collapsed && questions.length > 1 ? (
                    <div className="flex shrink-0 items-center gap-1" role="tablist">
<<<<<<< HEAD
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
=======
                        {shown.map((field, index) => (
                            <Tooltip key={field.key}>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={index === currentStep}
                                        aria-label={t('chat.formDock.stepAria', { index: String(index + 1), title: stepLabel(field, index) })}
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
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={6}>{stepLabel(field, index)}</TooltipContent>
                            </Tooltip>
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
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
=======
                    {recovered ? (
                        <div className="typography-micro mx-1.5 mb-1 rounded bg-[var(--status-warning-background)] px-2 py-1.5 text-[var(--status-warning-text)]">
                            {t('chat.formCard.recoveredNotice')}
                        </div>
                    ) : null}
                    <ScrollableOverlay
                        ref={bodyRef}
                        outerClassName="max-h-[50vh]"
                        outerStyle={availableMaxHeight === undefined ? undefined : { maxHeight: Math.max(120, availableMaxHeight - 96) }}
                        className="overscroll-contain px-1.5"
                        disableHorizontal
                    >
                        {currentField ? (
                            currentField.type === 'external' ? (
                                <div className="px-1.5 py-1">
                                    <div className="typography-meta font-medium text-foreground">{stepLabel(currentField, currentStep)}</div>
                                    {currentField.description ? (
                                        <FormMarkdown content={currentField.description} size="micro" className="mb-1 text-muted-foreground" />
                                    ) : null}
                                    <a
                                        href={currentField.url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="typography-meta inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                        <Icon name="external-link" className="size-3" />
                                        {t('chat.formCard.openLink')}
                                    </a>
                                    <div className="typography-micro mt-1 text-muted-foreground">{t('chat.formDock.linkInfo')}</div>
                                </div>
                            ) : (
                                <FormFieldControl
                                    key={currentField.key}
                                    field={currentField}
                                    values={values}
                                    missing={missing}
                                    showErrors={showErrors}
                                    isResponding={isResponding}
                                    updateValue={updateValue}
                                    onTextKeyDown={handleTextKeyDown}
                                />
                            )
                        ) : null}
>>>>>>> bc50ba56a
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
        </ComposerFloatingPanel>
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
