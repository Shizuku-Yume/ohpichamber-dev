import React from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useI18n } from '@/lib/i18n';
import { isAutoModel } from '@/lib/routing/autoModel';
import { swallowGestureClick } from '@/lib/swallowGestureClick';
import { formatEffortLabel, getEffortToneClass } from './mobileControlsUtils';
import { getModelThinkingLevels, getReasoningEffortLevels, resolveThinkingLevel } from '@/lib/modelThinkingLevels';

interface MobileEffortButtonProps {
    onCycleThinking: () => void;
    onOpenThinking: () => void;
    className?: string;
}

const LONG_PRESS_MS = 500;

/**
 * The phone composer's effort, after the model as on the desktop: a quiet
 * "/ medium". Like the agent button beside it, a tap moves to the next level
 * and a long press opens the effort sheet. Absent for Auto and for models
 * without effort levels — real `reasoningOptions` first, as the desktop panel
 * reads them, with legacy route variants as the fallback.
 */
export const MobileEffortButton: React.FC<MobileEffortButtonProps> = ({ onCycleThinking, onOpenThinking, className }) => {
    const { t } = useI18n();
    const currentProviderId = useConfigStore((state) => state.currentProviderId);
    const currentModelId = useConfigStore((state) => state.currentModelId);
    // The catalog is the level source for both the desktop panel and this
    // button; the selector holds the level set so it stays reference-equal.
    const currentModel = useConfigStore((state) => state.getCurrentModel());
    const levels = React.useMemo(() => getModelThinkingLevels(currentModel), [currentModel]);
    const usesEfforts = React.useMemo(() => getReasoningEffortLevels(currentModel).length > 0, [currentModel]);
    const configuredReasoningEffort = useConfigStore((state) => state.currentReasoningEffort);
    const effectiveVariant = useConfigStore((state) => state.currentVariant);
    const variantSelection = useConfigStore((state) => state.currentVariantSelection);
    const longPressTimerRef = React.useRef<number | undefined>(undefined);
    const longPressedRef = React.useRef(false);
    const clearLongPress = () => {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = undefined;
    };
    React.useEffect(() => clearLongPress, []);

    if (isAutoModel(currentProviderId, currentModelId) || levels.length === 0) return null;

    // The selected level, the same cascade the desktop picker resolves: the
    // configured effort (or the model's own default) for real levels, and the
    // route selection for a legacy catalog.
    const effort = usesEfforts
        ? resolveThinkingLevel(levels, [configuredReasoningEffort, currentModel?.defaultReasoningEffort])
        : undefined;
    const variant = variantSelection.override === null ? undefined : variantSelection.override ?? effectiveVariant;
    const label = usesEfforts
        ? (effort === 'off' ? t('chat.modelControls.off') : formatEffortLabel(effort, t))
        : (variant ? formatEffortLabel(variant, t) : t('chat.modelControls.default'));
    const tone = usesEfforts ? (effort === 'off' ? undefined : effort) : variant;

    return (
        <button
            type="button"
            // The agent button's pattern: pointer events instead of a click, and
            // the touch's default blocked, so a tap keeps the keyboard open.
            onPointerDown={(event) => {
                if (event.pointerType === 'touch') event.preventDefault();
                longPressedRef.current = false;
                clearLongPress();
                longPressTimerRef.current = window.setTimeout(() => {
                    longPressedRef.current = true;
                    // The sheet slides up under the finger; its lift must not pick a level.
                    swallowGestureClick();
                    onOpenThinking();
                }, LONG_PRESS_MS);
            }}
            onPointerUp={() => {
                const pressing = longPressTimerRef.current !== undefined;
                clearLongPress();
                if (pressing && !longPressedRef.current) onCycleThinking();
            }}
            onPointerLeave={clearLongPress}
            onPointerCancel={clearLongPress}
            onContextMenu={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={`${t('chat.modelControls.thinking')}: ${label}`}
            className={cn(
                // Taller and wider than its text for a finger, without making the row taller.
                '-my-[5px] inline-flex h-9 min-w-0 flex-shrink-0 items-center gap-1 rounded-lg px-1.5',
                'typography-micro font-medium lowercase text-muted-foreground',
                'select-none touch-none focus:outline-none hover:bg-[var(--interactive-hover)]',
                className,
            )}
        >
            <span aria-hidden="true" className="opacity-60">/</span>
            <span className={cn('whitespace-nowrap', getEffortToneClass(tone))}>{label}</span>
        </button>
    );
};
