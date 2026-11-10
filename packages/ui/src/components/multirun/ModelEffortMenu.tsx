import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { Icon } from '@/components/icon/Icon';
import { HoverTooltip } from '@/components/ui/row-tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { listModelVariantIds } from '@/lib/modelVariants';
import { useConfigStore } from '@/stores/useConfigStore';

/**
 * Thinking effort (model variant) picker for one model; renders nothing for
 * models without variants. `inline` sits inside a model chip, `trigger` stands
 * next to a model picker button.
 */
export function ModelEffortMenu({ providerId, modelId, variant, onChange, appearance = 'inline', disabled = false, tooltip }: {
  providerId: string;
  modelId: string;
  variant: string | undefined;
  onChange: (variant: string | undefined) => void;
  appearance?: 'inline' | 'trigger';
  disabled?: boolean;
  /** Tooltip over the trigger; absent leaves the aria name to stand alone. */
  tooltip?: string;
}): React.ReactNode {
  const { t } = useI18n();
  const variants = useConfigStore(React.useCallback((state) => {
    const model = state.providers.find((provider) => provider.providerId === providerId)?.models.find((entry) => entry.modelId === modelId);
    return listModelVariantIds(model?.variants).join('\n');
  }, [modelId, providerId]));
  if (!variants) return null;
  const label = variant ?? t('multirun.modelMultiSelect.variant.default');
  const trigger = (
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={appearance === 'trigger'
            ? cn(dropdownTriggerVariants({ size: 'default' }), 'w-fit gap-1.5')
            : 'inline-flex h-4 items-center gap-0.5 rounded px-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50'}
          aria-label={t('chat.parallel.models.effortAria', { effort: label })}
        >
          <Icon name="brain-ai-3" className={cn(appearance === 'trigger' ? 'size-3.5' : 'size-3', variant && 'text-[var(--status-info)]')} />
          <span className="max-w-[6rem] truncate">{label}</span>
          {appearance === 'trigger' ? <Icon name="arrow-down-s" /> : null}
        </button>
      </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {tooltip ? <HoverTooltip label={tooltip}>{trigger}</HoverTooltip> : trigger}
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onChange(undefined)}>
          {variant === undefined ? <Icon name="check" className="size-4" /> : <span className="size-4" />}
          {t('multirun.modelMultiSelect.variant.default')}
        </DropdownMenuItem>
        {variants.split('\n').map((entry) => (
          <DropdownMenuItem key={entry} onSelect={() => onChange(entry)}>
            {variant === entry ? <Icon name="check" className="size-4" /> : <span className="size-4" />}
            {entry}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
