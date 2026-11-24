import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface BehaviorListFieldProps {
  values: readonly string[];
  onChange: (next: string[], committedImmediately?: boolean) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  mono?: boolean;
}

export const BehaviorListField: React.FC<BehaviorListFieldProps> = ({
  values,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  mono = false,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState('');

  const commitDraft = (triggerImmediateSave: boolean) => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft('');
      return;
    }
    setDraft('');
    if (!values.includes(trimmed)) {
      onChange([...values, trimmed], triggerImmediateSave);
    }
  };

  return (
    <div className="w-full space-y-2">
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((item) => (
            <span
              key={item}
              className="oc-tile-inset inline-flex max-w-full items-center gap-1 rounded ps-2 pe-0.5 py-0.5 typography-meta text-foreground"
            >
              <span className={cn('truncate', mono && 'font-mono')}>{item}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                disabled={disabled}
                aria-label={t('settings.behavior.files.listField.removeAria', { item })}
                onClick={() => onChange(values.filter((existing) => existing !== item), true)}
              >
                <Icon name="close" className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex min-w-0 w-full items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft(true);
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              commitDraft(false);
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          inputSize="compact"
          disabled={disabled}
          className={cn('min-w-0 flex-1', mono && 'font-mono typography-meta')}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !draft.trim()}
          onClick={() => commitDraft(true)}
        >
          {t('settings.behavior.files.listField.add')}
        </Button>
      </div>
    </div>
  );
};
