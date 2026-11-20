import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import { isDraftSessionId } from '@/lib/sessionIdentity';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import type { Subagent } from '@openchamber/agent-contract';
import { AgentHubModal } from '@/components/chat/AgentHubModal';

const EMPTY_SUBAGENTS: Subagent[] = [];

/**
 * The subagent route is root-only and authorized per session: a known child
 * answers 403 and an id the Host has not listed answers 404. Only an
 * unarchived root already in the global session index may be asked.
 */
const isKnownRootSession = (sessionId: string): boolean => {
  const session = useGlobalSessionsStore.getState().entityById.get(sessionId);
  return Boolean(session && !session.parentSessionId && session.rootSessionId === sessionId && session.archivedAt === undefined);
};

interface SubagentHudTrayProps {
  sessionId: string | null;
}

interface SubagentRowProps {
  subagent: Subagent;
  sessionId: string;
}

const SubagentRow: React.FC<SubagentRowProps> = ({ subagent, sessionId }) => {
  const { t } = useI18n();
  const [showSteerInput, setShowSteerInput] = React.useState(false);
  const [steerMessage, setSteerMessage] = React.useState('');
  const [isSteering, setIsSteering] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const handleSteer = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!steerMessage.trim() || isSteering) return;
    setIsSteering(true);
    try {
      await canonicalClient.steerSubagent(sessionId, subagent.subagentId, steerMessage.trim());
      setSteerMessage('');
      setShowSteerInput(false);
      toast.success(t('chat.subagentHud.steer'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('chat.questionCard.submitFailed'));
    } finally {
      setIsSteering(false);
    }
  };

  const handleCancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      await canonicalClient.cancelSubagent(sessionId, subagent.subagentId);
      useSubagentsStore.getState().applySubagentUpdate(sessionId, {
        ...subagent,
        status: 'cancelled',
      });
      toast.info(t('chat.subagentHud.cancelled'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('chat.toolPart.subagent.stopFailed'));
    } finally {
      setIsCancelling(false);
    }
  };

  const isLive = subagent.status === 'running' || subagent.status === 'idle';
  const depth = Math.min(8, subagent.depth ?? 0);

  return (
    <div
      className="flex flex-col gap-1 py-1.5 border-b border-border/40 last:border-b-0 text-xs"
      style={{ paddingInlineStart: `${depth * 14}px` }}
      data-testid={`subagent-hud-row-${subagent.subagentId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex size-4 shrink-0 items-center justify-center">
            {subagent.status === 'running' ? (
              <Icon name="loader-4" className="size-3.5 animate-spin text-info" />
            ) : subagent.status === 'completed' ? (
              <Icon name="checkbox-circle" className="size-3.5 text-success" />
            ) : subagent.status === 'cancelled' ? (
              <Icon name="close-circle" className="size-3.5 text-muted-foreground" />
            ) : (
              <Icon name="ai-agent" className="size-3.5 text-muted-foreground" />
            )}
          </span>
          <span className="font-medium text-foreground truncate max-w-[140px]">
            {subagent.role || subagent.subagentId}
          </span>
          {subagent.activeTool && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground typography-micro font-mono shrink-0">
              <Icon name="tools" className="size-2.5" />
              {subagent.activeTool}
            </span>
          )}
          {(subagent.stage || subagent.lastIntent || subagent.recentOutput?.length || subagent.task) ? (
            <span className="typography-micro text-muted-foreground truncate max-w-[240px]" title={subagent.recentOutput?.join('\n')}>
              {subagent.stage || subagent.lastIntent || subagent.recentOutput?.at(-1) || subagent.task}
            </span>
          ) : null}
          {subagent.completionPercent !== undefined ? (
            <span className="typography-micro text-muted-foreground tabular-nums">{Math.round(subagent.completionPercent)}%</span>
          ) : null}
          {subagent.retryCountdown !== undefined && subagent.retryCountdown > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/20 text-warning typography-micro shrink-0">
              <Icon name="refresh" className="size-2.5 animate-spin" />
              {t('chat.subagentHud.retryCountdown', { seconds: subagent.retryCountdown })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {subagent.tokens !== undefined && subagent.tokens > 0 && (
            <span className="typography-micro text-muted-foreground tabular-nums">
              {t('chat.subagentHud.tokens', { count: subagent.tokens })}
            </span>
          )}
          {subagent.cost !== undefined && subagent.cost > 0 && (
            <span className="typography-micro text-muted-foreground tabular-nums">
              ${subagent.cost.toFixed(3)}
            </span>
          )}

          {isLive && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowSteerInput(!showSteerInput)}
                title={t('chat.subagentHud.steer')}
              >
                <Icon name="edit" className="size-3" />
                <span className="hidden @xl:inline ms-1">{t('chat.subagentHud.steer')}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
                disabled={isCancelling}
                title={t('chat.subagentHud.cancel')}
              >
                <Icon name="close" className="size-3" />
                <span className="hidden @xl:inline ms-1">{isCancelling ? t('chat.subagentHud.cancelling') : t('chat.subagentHud.cancel')}</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {subagent.description && (
        <div className="text-[11px] text-muted-foreground truncate ps-5">
          {subagent.description}
        </div>
      )}

      {showSteerInput && (
        <form onSubmit={handleSteer} className="flex items-center gap-1.5 ps-5 pt-1">
          <Input
            inputSize="compact"
            placeholder={t('chat.subagentHud.steerPlaceholder')}
            value={steerMessage}
            onChange={(e) => setSteerMessage(e.target.value)}
            disabled={isSteering}
            autoFocus
          />
          <Button
            type="submit"
            size="xs"
            disabled={!steerMessage.trim() || isSteering}
          >
            {t('chat.subagentHud.steerSend')}
          </Button>
        </form>
      )}
    </div>
  );
};

export const SubagentHudTray: React.FC<SubagentHudTrayProps> = React.memo(({ sessionId }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(true);
  const [hubOpen, setHubOpen] = React.useState(false);
  const subagents = useSubagentsStore(
    React.useCallback((state) => (sessionId && state.byParent[sessionId]) ? state.byParent[sessionId] : EMPTY_SUBAGENTS, [sessionId]),
  );
  // Discovery can land after the chat mounts, so this re-runs when the
  // session becomes a known root rather than only on a session switch.
  const knownRoot = useGlobalSessionsStore(
    React.useCallback(() => (sessionId ? isKnownRootSession(sessionId) : false), [sessionId]),
  );
  React.useEffect(() => {
    if (!sessionId || isDraftSessionId(sessionId) || !knownRoot) return;
    void canonicalClient.listSubagents(sessionId).then((list) => {
      if (list.length > 0) {
        for (const sub of list) {
          useSubagentsStore.getState().applySubagentUpdate(sessionId, sub);
        }
      }
    }).catch(() => { });
  }, [sessionId, knownRoot]);

  if (!sessionId || subagents.length === 0) return null;

  const liveSubagents = subagents.filter((s) => s.status === 'running' || s.status === 'idle');
  const activeCount = liveSubagents.length;
  const totalTokens = subagents.reduce((acc, s) => acc + (s.tokens ?? 0), 0);
  const totalCost = subagents.reduce((acc, s) => acc + (s.cost ?? 0), 0);

  return (
    <>
      <div
        className="border-b border-border/60 bg-muted/20 px-3 py-1.5 transition-colors"
        data-testid="subagent-hud-tray"
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 font-medium text-foreground hover:text-foreground/80"
          >
            <Icon
              name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
              className="size-3.5 text-muted-foreground"
            />
            <Icon name="ai-agent" className="size-3.5 text-primary" />
            <span>{t('chat.subagentHud.title')}</span>
            <span className="text-muted-foreground tabular-nums">
              ({activeCount > 0 ? `${activeCount}/${subagents.length}` : subagents.length})
            </span>
          </button>

          <div className="flex items-center gap-2 typography-micro text-muted-foreground tabular-nums">
            {totalTokens > 0 && <span>{t('chat.subagentHud.tokens', { count: totalTokens })}</span>}
            {totalCost > 0 && <span>${totalCost.toFixed(3)}</span>}
          </div>
        </div>

        {expanded && (
          <div className="mt-1.5 max-h-48 overflow-y-auto">
            {subagents.map((subagent) => (
              <SubagentRow
                key={subagent.subagentId}
                subagent={subagent}
                sessionId={sessionId}
              />
            ))}
          </div>
        )}
      </div>
      <AgentHubModal open={hubOpen} onOpenChange={setHubOpen} sessionId={sessionId} />
    </>
  );
});

SubagentHudTray.displayName = 'SubagentHudTray';
