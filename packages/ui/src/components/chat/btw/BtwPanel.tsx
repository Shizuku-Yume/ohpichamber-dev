import React from 'react';
import { AnimatePresence } from 'motion/react';
import { ComposerFloatingPanel } from '../composer/ui/ComposerFloatingPanel';
import { useI18n } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import { isIMECompositionEvent } from '@/lib/ime';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { useBtwStore } from '@/stores/useBtwStore';
import { extractBtwInject, type BtwPanelState } from './useBtwPanelState';
import { useSessionUIStore } from '@/sync/session-ui-store';

/** The transient `/btw` answer panel. */
const BtwPanelView: React.FC<{ parentSessionId: string; panel: BtwPanelState; onExit: () => void }> = ({
    parentSessionId,
    panel,
    onExit,
}) => {
    const { t } = useI18n();
    React.useEffect(() => {
        if (panel.collapsed || (!panel.pending && !panel.ephemeralRecordId)) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented || isIMECompositionEvent(event)) return;
            event.preventDefault();
            onExit();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onExit, panel.collapsed, panel.ephemeralRecordId, panel.pending]);

    const [promoting, setPromoting] = React.useState(false);
    const [injecting, setInjecting] = React.useState(false);

    const handlePromote = React.useCallback(async () => {
        if (!panel.ephemeralRecordId || panel.ephemeralStatus !== 'completed' || promoting) return;
        setPromoting(true);
        try {
            const result = await canonicalClient.branchFromBtw(parentSessionId, panel.ephemeralRecordId);
            // The branch rekeys the session: the service and the Host retire the
            // pre-branch id, so the selection, projection and caches must move to
            // the minted id before anything reads the old one again.
            const rekeyedSessionId = result.sessionId && result.sessionId !== parentSessionId ? result.sessionId : null;
            if (rekeyedSessionId) useSessionUIStore.getState().rekeySession(parentSessionId, rekeyedSessionId);
            toast.success(t('chat.btw.promoteSuccess'));
            const panelOwner = rekeyedSessionId ?? parentSessionId;
            useBtwStore.getState().setPanelState(panelOwner, {
                ephemeralRecordId: undefined,
                ephemeralText: '',
                ephemeralStatus: 'idle',
                collapsed: true,
            });
            onExit();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
        } finally {
            setPromoting(false);
        }
    }, [onExit, panel.ephemeralRecordId, panel.ephemeralStatus, parentSessionId, promoting, t]);

    const handleInject = React.useCallback(async () => {
        const injectText = extractBtwInject(panel.ephemeralText);
        if (!injectText || panel.ephemeralStatus !== 'completed' || injecting) return;
        setInjecting(true);
        try {
            const requestPayload = {
                input: { text: injectText, attachments: [], context: [] },
                options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
            };
            try {
                await canonicalClient.steer(parentSessionId, requestPayload);
            } catch (err: unknown) {
                const isObject = typeof err === 'object' && err !== null;
                const code = isObject && 'code' in err ? (err as Record<string, unknown>).code : undefined;
                const status = isObject && 'status' in err ? (err as Record<string, unknown>).status : undefined;
                const isRunNotActive = code === 'RUN_NOT_ACTIVE'
                    || status === 404
                    || (err instanceof Error && (err.message.includes('RUN_NOT_ACTIVE') || err.message.includes('No active run') || err.message.includes('Run not found')));
                if (isRunNotActive) {
                    await canonicalClient.createRun(parentSessionId, requestPayload);
                } else {
                    throw err;
                }
            }
            useBtwStore.getState().setPanelState(parentSessionId, {
                ephemeralRecordId: undefined,
                ephemeralText: '',
                ephemeralStatus: 'idle',
                collapsed: true,
            });
            onExit();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
        } finally {
            setInjecting(false);
        }
    }, [injecting, onExit, panel.ephemeralStatus, panel.ephemeralText, parentSessionId]);

    const setCollapsed = React.useCallback((collapsed: boolean) => {
        useBtwStore.getState().setPanelState(parentSessionId, { collapsed });
    }, [parentSessionId]);

    const injectText = React.useMemo(() => extractBtwInject(panel.ephemeralText), [panel.ephemeralText]);

    let content: React.ReactNode = null;
    if (panel.ephemeralRecordId) {
        content = (
            <div className="space-y-2">
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm">{panel.ephemeralText || t('chat.btw.loading')}</div>
                {panel.ephemeralStatus === 'completed' ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-4 py-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => void handlePromote()}
                            disabled={promoting}
                            className="!font-normal text-xs"
                        >
                            <Icon name={promoting ? 'loader-4' : 'git-branch'} className={promoting ? 'me-1 size-3 animate-spin' : 'me-1 size-3'} />
                            {t('chat.btw.promoteToBranch')}
                        </Button>
                        {injectText ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => void handleInject()}
                                disabled={injecting}
                                className="!font-normal text-xs"
                            >
                                <Icon name={injecting ? 'loader-4' : 'corner-down-right'} className={injecting ? 'me-1 size-3 animate-spin' : 'me-1 size-3'} />
                                {t('chat.btw.injectSteer')}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        );
    } else if (panel.pending) {
        content = <div className="px-4 py-3 text-sm text-muted-foreground">{t('chat.btw.draftHint')}</div>;
    }

    const stage = content === null ? null : (
        <ComposerFloatingPanel
            role="dialog"
            ariaLabel="btw"
            compact={panel.collapsed}
            header={(
                <>
                    <button
                        type="button"
                        onClick={() => setCollapsed(!panel.collapsed)}
                        aria-label={panel.collapsed ? t('chat.btw.expandAria') : t('chat.btw.collapseAria')}
                        title={panel.collapsed ? t('chat.btw.expandAria') : t('chat.btw.collapseAria')}
                        className="flex min-w-0 items-center gap-2 text-start text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {panel.ephemeralStatus === 'running'
                            ? <Icon name="loader-4" className="size-3.5 shrink-0 animate-spin" />
                            : <Icon name="chat-ai-3" className="size-3.5 shrink-0" />}
                        <Icon name={panel.collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{t('chat.btw.draftHint')}</span>
                    {panel.ephemeralRecordId ? (
                        <Button type="button" variant="ghost" size="icon" onClick={() => void canonicalClient.cancelBtw(parentSessionId)} aria-label={t('chat.btw.cancelAria')}>
                            <Icon name="close" className="size-4" />
                        </Button>
                    ) : (
                        <Button type="button" variant="ghost" size="icon" onClick={onExit} aria-label={t('chat.btw.cancelAria')} title={t('chat.btw.cancelAria')}>
                            <Icon name="close" className="size-4" />
                        </Button>
                    )}
                </>
            )}
        >
            {panel.collapsed ? null : <>{content}<div className="h-2" /></>}
        </ComposerFloatingPanel>
    );
    return <AnimatePresence>{stage}</AnimatePresence>;
};

export const BtwPanel = React.memo(BtwPanelView);
