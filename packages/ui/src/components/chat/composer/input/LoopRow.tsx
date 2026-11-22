import React from 'react';
import { canonicalClient } from '@/api/canonicalClient';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useDirectorySync } from '@/sync/sync-context';

export const LoopRow = React.memo(function LoopRow({ sessionId, directory }: { sessionId: string; directory?: string }) {
    const { t } = useI18n();
    const loop = useDirectorySync(React.useCallback((state) => state.snapshot[sessionId]?.session.loop, [sessionId]), directory);
    const [stopping, setStopping] = React.useState(false);
    if (!loop?.active) return null;

    const stop = async () => {
        setStopping(true);
        try {
            await canonicalClient.stopLoop(sessionId);
        } catch (error) {
            toast.error(t('chat.run.loop.stopFailed'), { description: error instanceof Error ? error.message : undefined });
        } finally {
            setStopping(false);
        }
    };
    const progress = loop.maxIterations ? `${loop.iteration}/${loop.maxIterations}` : String(loop.iteration);
    return (
        <div className="flex oc-composer-row min-w-0 items-center gap-2 border-b border-edge ps-3 pe-1.5">
            <Icon name="refresh" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span role="status" className="min-w-0 flex-1 truncate typography-meta text-muted-foreground" title={loop.condition}>
                {t('chat.run.loop.iteration', { progress })}
                {loop.condition && ` · ${loop.condition}`}
            </span>
            <Button variant="ghost" size="sm" className="shrink-0" disabled={stopping} onClick={() => void stop()} data-testid="composer-stop-loop-button">
                {t('chat.run.loop.stop')}
            </Button>
        </div>
    );
});
