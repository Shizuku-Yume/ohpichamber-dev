import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useSessionAssistState } from '@/hooks/useSessionAssist';
import { useSessionSuggestionStore } from '@/stores/useSessionSuggestionStore';
import { useI18n } from '@/lib/i18n';

interface SessionSuggestionChipProps {
  sessionId: string | null;
  directory?: string;
  hidden: boolean;
  onApply: (text: string) => void;
}

<<<<<<< HEAD
// A suggested follow-up rendered as the composer's own top row (inside the
// box, and inside the mobile pill). Tapping it fills the composer (no
// auto-send); the X patches the suggestion out of the session metadata so
// it stays dismissed everywhere.
||||||| bc50ba56aa
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A suggested follow-up rendered as the composer's own top row (inside the
// box, and inside the mobile pill). Tapping it fills the composer (no
// auto-send); the X patches the suggestion out of the session metadata so
// it stays dismissed everywhere.
=======
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

>>>>>>> upstream/main
export const SessionSuggestionChip: React.FC<SessionSuggestionChipProps> = React.memo(({ sessionId, directory, hidden, onApply }) => {
  const { suggestion } = useSessionAssistState(sessionId ?? '', directory);
  const { t } = useI18n();
  const handleDismiss = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (sessionId) {
      useSessionSuggestionStore.getState().clearSuggestion(sessionId);
    }
  }, [sessionId]);

  const handleApply = React.useCallback(() => {
    if (suggestion) {
      onApply(suggestion);
      if (sessionId) {
        useSessionSuggestionStore.getState().clearSuggestion(sessionId);
      }
    }
  }, [suggestion, onApply, sessionId]);

  if (!suggestion || hidden) {
    return null;
  }

  const content = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleApply}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={t('chat.suggestion.applyAria')}
            className="min-w-0 flex-1 shrink justify-start px-0 text-sm font-normal normal-case text-muted-foreground hover:!bg-transparent hover:text-foreground has-[>svg]:px-0"
          >
            <Icon name="pencil-ai-2" className="size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
            <span className="truncate">{suggestion}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-wrap">
          {suggestion}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={t('chat.suggestion.dismissAria')}
            className="size-7 shrink-0 rounded-lg text-muted-foreground hover:!bg-transparent hover:text-foreground active:!bg-transparent"
          >
            <Icon name="close" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{t('chat.suggestion.dismissAria')}</TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <div className="flex oc-composer-row items-center gap-1 border-b border-edge ps-3 pe-1.5">
      {content}
    </div>
  );
});

SessionSuggestionChip.displayName = 'SessionSuggestionChip';
