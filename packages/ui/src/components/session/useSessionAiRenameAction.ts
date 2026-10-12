import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useIsSessionAiRenamePending, useSessionAiRename } from '@/sync/use-session-ai-rename';
import { useSmallModelAvailability } from '@/hooks/useSmallModelAvailability';

/** Menus and mobile swipe actions check history only while their controls are open. */
export function useSessionAiRenameAction(sessionID: string, directory: string | null | undefined, open: boolean) {
  const { t } = useI18n();
  const { prepare, rename } = useSessionAiRename(sessionID, directory);
  const pending = useIsSessionAiRenamePending(sessionID, directory);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'empty' | 'error'>('checking');
  // Renaming runs on the small model; without one the item is disabled with
  // the reason rather than failing after the click.
  const smallModel = useSmallModelAvailability(directory, open);
  const noSmallModel = smallModel === 'unavailable';

  useEffect(() => {
    if (!open || !directory || pending) return;
    const controller = new AbortController();
    const unsubscribe = subscribeRuntimeEndpointWillChange(() => controller.abort());
    setAvailability('checking');
    void prepare(controller.signal).then(({ turns }) => {
      if (!controller.signal.aborted) setAvailability(turns.length ? 'ready' : 'empty');
    }).catch(() => {
      if (!controller.signal.aborted) setAvailability('error');
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [directory, open, pending, prepare]);

  const disabled = !directory || pending || noSmallModel || availability === 'checking' || availability === 'empty';
  const hint = pending ? t('sessions.aiRename.generating')
      : noSmallModel ? t('sessions.aiRename.noSmallModel')
        : availability === 'checking' ? t('sessions.aiRename.checking')
          : availability === 'empty' ? t('sessions.aiRename.noCompletedTurns')
            : t('sessions.sidebar.session.menuHint.aiRename');
  const run = useCallback(() => {
    void rename().catch(() => toast.error(t('sessions.aiRename.failed')));
  }, [rename, t]);

  return { pending, disabled, hint, run };
}
