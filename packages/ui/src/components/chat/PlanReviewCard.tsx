import React from 'react';
import { formatModelRef, parseModelSelector, type PlanReviewResponse, type QuestionRequest } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { useI18n } from '@/lib/i18n';
import { isIMECompositionEvent } from '@/lib/ime';
import { useRequestReveal } from '@/sync/request-reveal';
import { useConfigStore } from '@/stores/useConfigStore';
import { ComposerFloatingPanel } from './composer/ui/ComposerFloatingPanel';
import { FormMarkdown } from './FormMarkdown';
import { buildPlanReviewAnswer, parsePlanReview } from './questionRequest';
import { useQuestionResponse } from './useQuestionResponse';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import { useFormDockFold } from './useFormDockFold';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { dropFormDraft, formDraftScope, loadFormDraft, saveFormDraft } from './formDrafts';
interface PlanReviewCardProps {
    form: QuestionRequest;
    docked?: boolean;
    forms?: readonly QuestionRequest[];
    directory?: string;
}

/** Select sentinel for "no explicit execution model"; Base UI rejects an
 *  empty string as an item value. */
const DEFAULT_MODEL_VALUE = '__default__';

/** A plan decision is an answer, including Reject; it is never a cancellation. */
export function PlanReviewCard({ form, docked = false, forms, directory }: PlanReviewCardProps) {
    const { t } = useI18n();
    const review = React.useMemo(() => parsePlanReview(form.schema), [form.schema]);
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    const scope = React.useMemo(() => formDraftScope({ sessionId: form.sessionId, questionId: form.questionId }, directory, runtimeKey), [directory, form.sessionId, form.questionId, runtimeKey]);
    const signature = JSON.stringify(review);
    const [restored] = React.useState(() => {
        const draft = loadFormDraft(scope);
        return draft?.kind === 'plan-review' && draft.fieldsSignature === signature ? draft : null;
    });
    const [feedback, setFeedback] = React.useState(restored?.feedback ?? '');
    const [executionModel, setExecutionModel] = React.useState<{ providerId: string; modelId: string } | null>(restored?.executionModel ?? null);
    const [collapsed, setCollapsed] = useFormDockFold(docked);
    const feedbackId = React.useId();
    const providers = useConfigStore((state) => state.providers);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);
    const { isResponding, hasResponded, answer } = useQuestionResponse(form);
    const availableMaxHeight = useMobileAutocompleteMaxHeight(bodyRef, docked && !collapsed, 400);
    const formIds = React.useMemo(() => docked ? (forms ?? [form]).map((item) => item.questionId) : [], [docked, form, forms]);
    useRequestReveal(formIds, React.useCallback(() => setCollapsed(false), [setCollapsed]));

    // Rebuilt pending records and failed replies preserve the feedback draft.
    const appliedSignature = React.useRef(signature);
    React.useEffect(() => {
        if (appliedSignature.current === signature) return;
        appliedSignature.current = signature;
        setFeedback('');
        setExecutionModel(null);
    }, [signature]);
    React.useEffect(() => {
        if (!hasResponded && appliedSignature.current === signature) saveFormDraft(scope, { kind: 'plan-review', fieldsSignature: signature, feedback, executionModel });
    }, [executionModel, feedback, hasResponded, scope, signature]);

    const submit = React.useCallback(async (action: PlanReviewResponse['action']) => {
        const payload = buildPlanReviewAnswer(action, feedback, executionModel);
        if (payload && await answer(payload)) dropFormDraft(scope);
    }, [answer, executionModel, feedback, scope]);

    const handleFeedbackKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (isIMECompositionEvent(event) || event.key !== 'Enter' || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        void submit('feedback');
    };

    if (!review || hasResponded || form.status !== 'pending') return null;

    const waiting = Math.max(0, (forms?.length ?? 1) - 1);
    const content = (
        <div
            ref={bodyRef}
            className="max-h-[50vh] overflow-y-auto overscroll-contain px-3 pb-3"
            style={availableMaxHeight === undefined ? undefined : { maxHeight: availableMaxHeight }}
            aria-busy={isResponding}
        >
            <h3 className="typography-ui-label break-words font-medium text-foreground">{review.title}</h3>
            <div className="mt-1 typography-micro text-muted-foreground">
                <span>{t('chat.planReview.reference')}: </span>
                <code className="break-all select-text">{review.planReference}</code>
            </div>
            <FormMarkdown content={review.planText} size="meta" className="my-3" />
            <label htmlFor={feedbackId} className="typography-meta font-medium text-foreground">
                {t('chat.planReview.feedback')}
            </label>
            <Textarea
                id={feedbackId}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                onKeyDown={handleFeedbackKeyDown}
                disabled={isResponding}
                placeholder={t('chat.planReview.feedbackPlaceholder')}
                rows={3}
                outerClassName="mt-1"
                className="min-h-[82px] typography-meta"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <label htmlFor="plan-execution-model" className="typography-micro text-muted-foreground">
                    {t('chat.planReview.executionModel')}:
                </label>
                <Select
                    value={executionModel ? formatModelRef(executionModel) : DEFAULT_MODEL_VALUE}
                    onValueChange={(val) => {
                        if (val === DEFAULT_MODEL_VALUE) {
                            setExecutionModel(null);
                            return;
                        }
                        const parsed = parseModelSelector(val);
                        if (parsed) setExecutionModel({ providerId: parsed.providerId, modelId: parsed.modelId });
                    }}
                    disabled={isResponding}
                >
                    <SelectTrigger
                        id="plan-execution-model"
                        aria-label={t('chat.planReview.executionModel')}
                        className={cn(dropdownTriggerVariants({ size: 'default' }), 'max-w-[16rem] typography-micro')}
                    >
                        <SelectValue placeholder={t('chat.planReview.defaultModel')}>
                            {(value: string | undefined) => {
                                if (!value || value === DEFAULT_MODEL_VALUE) {
                                    return t('chat.planReview.defaultModel');
                                }
                                const parsed = parseModelSelector(value);
                                if (!parsed) return value;
                                const modelId = parsed.modelId;
                                const provider = providers.find((entry) => entry.providerId === parsed.providerId);
                                if (!provider) {
                                    return modelId;
                                }
                                const model = provider.models.find((entry) => entry.modelId === modelId);
                                return `${provider.name} - ${model?.name || modelId}`;
                            }}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={DEFAULT_MODEL_VALUE}>{t('chat.planReview.defaultModel')}</SelectItem>
                        {providers.flatMap((p) => p.models.map((m) => {
                            const ref = formatModelRef({ providerId: p.providerId, modelId: m.modelId });
                            return (
                                <SelectItem key={ref} value={ref}>
                                    {`${p.name} - ${m.name || m.modelId}`}
                                </SelectItem>
                            );
                        }))}
                    </SelectContent>
                </Select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="xs" disabled={isResponding} onClick={() => void submit('approve')}>
                    <Icon name={isResponding ? 'loader-4' : 'check'} className={isResponding ? 'size-3.5 animate-spin' : 'size-3.5'} />
                    {t('chat.planReview.approve')}
                </Button>
                <Button size="xs" variant="outline" disabled={isResponding} onClick={() => void submit('approve-compact')}>
                    {t('chat.planReview.approveCompact')}
                </Button>
                <Button size="xs" variant="outline" disabled={isResponding || !feedback.trim()} onClick={() => void submit('feedback')}>
                    {t('chat.planReview.sendFeedback')}
                </Button>
                <Button size="xs" variant="ghost" disabled={isResponding} onClick={() => void submit('reject')}>
                    {t('chat.planReview.reject')}
                </Button>
            </div>
        </div>
    );

    if (docked) {
        return (
            <ComposerFloatingPanel
                role="dialog"
                ariaLabel={t('chat.planReview.title')}
                compact={collapsed}
                header={<>
                    <button
                        type="button"
                        onClick={() => setCollapsed((value) => !value)}
                        aria-expanded={!collapsed}
                        aria-label={t(collapsed ? 'chat.formDock.expandAria' : 'chat.formDock.collapseAria')}
                        className="flex min-w-0 flex-1 items-center gap-2 text-start text-foreground"
                    >
                        <Icon name="file-text" className="size-3.5 shrink-0 text-muted-foreground" />
                        <Icon name={collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                        <span className="typography-ui-label truncate">{t('chat.planReview.title')}</span>
                    </button>
                    {waiting > 0 ? <span className="typography-micro text-muted-foreground">{t('chat.formDock.waiting', { count: String(waiting) })}</span> : null}
                </>}
            >
                {collapsed ? null : content}
            </ComposerFloatingPanel>
        );
    }

    return (
        <div className="group w-full pb-2 pt-0">
            <div className="chat-column">
                <section className="rounded-xl border border-border/30 bg-muted/10" aria-label={t('chat.planReview.title')}>
                    <div className="mb-2 flex items-center gap-2 border-b border-border/20 px-3 py-1.5">
                        <Icon name="file-text" className="size-3.5 text-muted-foreground" />
                        <span className="typography-meta font-medium text-foreground">{t('chat.planReview.title')}</span>
                    </div>
                    {content}
                </section>
            </div>
        </div>
    );
}
