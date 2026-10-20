import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Radio } from '@/components/ui/radio';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { FORM_CUSTOM_TEXTAREA_MIN_HEIGHT, getFormCustomTextareaHeight } from './formTextareaSizing';
import {
    type AskAnswerState,
    type AskQuestion,
    setAskCustom,
    setAskText,
    toggleAskOption,
} from './questionRequest';

/**
 * One native `omp.ask` question: its header/question, option rows as radios or
 * checkboxes, and a free-text answer. The card and the dock share this control
 * so both answer the request the same way.
 */

interface AutoGrowTextareaProps {
    value: string;
    placeholder: string;
    disabled: boolean;
    autoFocus?: boolean;
    onValueChange: (value: string) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * Free-text answer box. It keeps its own value while typing so a keystroke does
 * not re-render the whole request, and grows with the content up to the cap in
 * `formTextareaSizing`.
 */
const AutoGrowTextarea = React.memo(function AutoGrowTextarea({
    value,
    placeholder,
    disabled,
    autoFocus,
    onValueChange,
    onKeyDown,
}: AutoGrowTextareaProps) {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [localValue, setLocalValue] = React.useState(value);
    const [height, setHeight] = React.useState(FORM_CUSTOM_TEXTAREA_MIN_HEIGHT);
    const [isScrollable, setIsScrollable] = React.useState(false);

    React.useEffect(() => {
        setLocalValue(value);
    }, [value]);

    React.useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const nextHeight = getFormCustomTextareaHeight({
            scrollHeight: textarea.scrollHeight,
            currentHeight: height,
        });
        const nextScrollable = textarea.scrollHeight > (nextHeight ?? height);
        if (isScrollable !== nextScrollable) setIsScrollable(nextScrollable);
        if (nextHeight !== null && nextHeight !== height) setHeight(nextHeight);
    }, [height, isScrollable, localValue]);

    return (
        <textarea
            ref={textareaRef}
            value={localValue}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            style={{ height }}
            onChange={(event) => {
                setLocalValue(event.target.value);
                onValueChange(event.target.value);
            }}
            onKeyDown={onKeyDown}
            className={cn(
                'w-full resize-none rounded border border-border/30 bg-background/50 px-2 py-1',
                'typography-meta text-foreground placeholder:text-muted-foreground/60',
                'focus:outline-none focus:border-border/60',
                isScrollable ? 'overflow-y-auto' : 'overflow-y-hidden',
                disabled ? 'opacity-60' : null,
            )}
        />
    );
});

export interface FormFieldControlProps {
    question: AskQuestion;
    answer: AskAnswerState;
    index: number;
    showErrors: boolean;
    isMissing: boolean;
    isResponding: boolean;
    onChange: (answer: AskAnswerState) => void;
    /** Enter advances or submits; the owner decides which. */
    onTextKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function FormFieldControl({
    question,
    answer,
    index,
    showErrors,
    isMissing,
    isResponding,
    onChange,
    onTextKeyDown,
}: FormFieldControlProps) {
    const { t } = useI18n();
    const fallbackLabel = t('chat.questionCard.questionFallback', { index: String(index + 1) });
    const label = question.header?.trim() || question.question?.trim() || fallbackLabel;
    const body = question.header && question.question ? question.question : undefined;
    const missing = showErrors && isMissing;
    const customTextarea = (
        <AutoGrowTextarea
            value={answer.text}
            placeholder={t('chat.formCard.yourAnswer')}
            disabled={isResponding}
            autoFocus
            onValueChange={(next) => onChange(setAskText(answer, next))}
            onKeyDown={onTextKeyDown}
        />
    );

    return (
        <div className="px-1.5 py-1">
            <div className="flex items-baseline gap-1.5">
                <span className={cn('typography-meta font-medium whitespace-pre-wrap', missing ? 'text-[var(--status-error)]' : 'text-foreground')}>
                    {label}
                </span>
                <span className="typography-micro text-muted-foreground">{t('chat.formCard.required')}</span>
            </div>
            {body ? (
                <div className="typography-micro whitespace-pre-wrap text-muted-foreground mb-1">{body}</div>
            ) : null}

            {question.options.length === 0 ? customTextarea : (
                <div className="space-y-0.5" role={question.multi ? 'group' : 'radiogroup'} aria-label={label}>
                    {question.options.map((option, optionIndex) => {
                        const selected = answer.selected.includes(option.label);
                        const recommended = question.recommended === optionIndex;
                        const toggle = () => {
                            if (!isResponding) onChange(toggleAskOption(question, answer, option.label));
                        };
                        return (
                            <div
                                key={`${optionIndex}:${option.label}`}
                                onClick={toggle}
                                className={cn(
                                    'w-full px-1.5 py-1 text-left rounded transition-colors hover:bg-interactive-hover/30',
                                    selected ? 'bg-interactive-selection/20' : null,
                                    isResponding ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                                )}
                            >
                                {/* The control and label share one centred row; the
                                    description hangs under the label. */}
                                <div className="flex items-center gap-2">
                                    {question.multi ? (
                                        <Checkbox checked={selected} onChange={toggle} disabled={isResponding} ariaLabel={option.label} />
                                    ) : (
                                        <Radio checked={selected} onChange={toggle} disabled={isResponding} ariaLabel={option.label} />
                                    )}
                                    <span
                                        className={cn(
                                            'typography-meta min-w-0 break-words',
                                            selected ? 'text-foreground font-medium' : 'text-foreground/80',
                                        )}
                                    >
                                        {option.label}
                                    </span>
                                    {recommended ? (
                                        <span className="typography-micro shrink-0 text-primary/80">
                                            {t('chat.questionCard.recommended')}
                                        </span>
                                    ) : null}
                                </div>
                                {option.description ? (
                                    <div className="typography-micro break-words pl-[22px] text-muted-foreground">
                                        {option.description}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => onChange(setAskCustom(question, answer, !answer.custom))}
                        disabled={isResponding}
                        className={cn(
                            'w-full px-1.5 py-1 text-left rounded transition-colors hover:bg-interactive-hover/30',
                            answer.custom ? 'bg-interactive-selection/20' : null,
                            isResponding ? 'opacity-60 cursor-not-allowed' : null,
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <Icon
                                name="edit"
                                className={cn('h-3.5 w-3.5', answer.custom ? 'text-primary' : 'text-muted-foreground/50')}
                            />
                            <span
                                className={cn(
                                    'typography-meta',
                                    answer.custom ? 'text-foreground font-medium' : 'text-muted-foreground',
                                )}
                            >
                                {t('chat.formCard.other')}
                            </span>
                        </div>
                    </button>
                    {answer.custom ? (
                        <div className="pl-6 pr-1 pt-0.5">
                            {customTextarea}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
