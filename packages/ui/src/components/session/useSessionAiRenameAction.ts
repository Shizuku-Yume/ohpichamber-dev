import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useIsSessionAiRenamePending, useSessionAiRename } from '@/sync/use-session-ai-rename';
import { useSmallModelAvailability } from '@/hooks/useSmallModelAvailability';
import type { SmallModelAvailabilityScope } from '@/stores/useSmallModelStore';
import { problemMessage } from '@/lib/problemMessage';

export function useSessionAiRenameAction(sessionID: string, directory: string | null | undefined, open: boolean) {
  const { t } = useI18n();
  const { prepare, rename } = useSessionAiRename(sessionID, directory);
  const pending = useIsSessionAiRenamePending(sessionID, directory);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'empty' | 'error'>('checking');
  const [prepared, setPrepared] = useState<{ sessionId: string; directory: string; scope: SmallModelAvailabilityScope }>();
  const scope = prepared?.sessionId === sessionID && prepared.directory === directory ? prepared.scope : undefined;
  // Renaming runs on the small model; without one the item is disabled with
  // the reason rather than failing after the click.
  const smallModel = useSmallModelAvailability(directory, open && availability === 'ready' && Boolean(scope), scope);
  const noSmallModel = availability === 'ready' && Boolean(scope) && smallModel === 'unavailable';

  useEffect(() => {
    if (!open || !directory || pending) return;
    const controller = new AbortController();
    const unsubscribe = subscribeRuntimeEndpointWillChange(() => controller.abort());
    setAvailability('checking');
    setPrepared(undefined);
    void prepare(controller.signal).then(({ session, turns }) => {
      if (controller.signal.aborted) return;
      const finalMessage = turns.at(-1)?.assistant;
      if (!turns.length) { setAvailability('empty'); return; }
      if (!finalMessage?.providerId || !finalMessage.modelId) { setAvailability('error'); return; }
      setPrepared({ sessionId: sessionID, directory, scope: { workspaceId: session.workspaceId, preferred: { providerId: finalMessage.providerId, modelId: finalMessage.modelId } } });
      setAvailability('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setAvailability('error');
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [directory, open, pending, prepare, sessionID]);

  const disabled = !directory || pending || noSmallModel || availability === 'checking' || availability === 'empty';
  const hint = pending ? t('sessions.aiRename.generating')
      : noSmallModel ? t('sessions.aiRename.noSmallModel')
        : availability === 'checking' ? t('sessions.aiRename.checking')
          : availability === 'empty' ? t('sessions.aiRename.noCompletedTurns')
            : t('sessions.sidebar.session.menuHint.aiRename');
  const run = useCallback(() => {
    void rename().catch((error) => toast.error(problemMessage(error, t('sessions.aiRename.failed'))));
  }, [rename, t]);

  return { pending, disabled, hint, run };
}
