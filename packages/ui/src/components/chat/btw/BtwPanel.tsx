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

<<<<<<< HEAD
/** The transient `/btw` answer panel. */
const BtwPanelView: React.FC<{ parentSessionId: string; panel: BtwPanelState; onExit: () => void }> = ({
||||||| bc50ba56aa
const IDLE_SESSION_STATUS = { type: 'idle' as const };

/**
 * The `/btw` peek panel.
 *
 * Rendered from inside the composer form, so the sheet docks exactly above
 * the main composer (`absolute bottom-full` on the composer column) on both
 * desktop and mobile — the main composer IS the btw input, so nothing may
 * cover it. Identity is derived from the parent session's metadata (see
 * `useBtwPanelState`), so the panel belongs to one parent session only.
 *
 * Three exits: collapse (panel minimizes to the composer chip, the composer
 * returns to the main session), promote (the fork becomes a normal session
 * and the app navigates to it), destroy (the fork is deleted; the main
 * conversation is never touched).
 */
const BtwPanelView: React.FC<{ parentSessionId: string; panel: BtwPanelState; hidden: boolean; onExit: () => void }> = ({
=======
const IDLE_SESSION_STATUS = { type: 'idle' as const };

const BtwPanelView: React.FC<{ parentSessionId: string; panel: BtwPanelState; hidden: boolean; onExit: () => void }> = ({
>>>>>>> upstream/main
    parentSessionId,
    panel,
    onExit,
}) => {
    const { t } = useI18n();
<<<<<<< HEAD
||||||| bc50ba56aa
    useEscapeToExit(onExit, !panel.collapsed && Boolean(panel.pending || panel.creating || panel.btwSessionId));

    // Each stage is its own keyed panel, so moving between them cross-fades.
    let stage: React.ReactNode = null;
    if (panel.btwSessionId && panel.btwDirectory) {
        stage = (
            <BtwSheet
                key="sheet"
                sessionRef={{
                    parentSessionId,
                    btwSessionId: panel.btwSessionId,
                    directory: panel.btwDirectory,
                }}
                boundaryMessageID={panel.boundaryMessageID}
                collapsed={panel.collapsed}
            />
        );
    } else if (panel.creating) {
        stage = (
            <BtwFrame key="creating">
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                    <Icon name="loader-4" className="size-4 animate-spin" />
                    <span>{t('chat.btw.loading')}</span>
                </div>
            </BtwFrame>
        );
    } else if (panel.pending) {
        stage = (
            <BtwFrame
                key="pending"
                draftHint={t('chat.btw.draftHint')}
                collapsed={panel.collapsed}
                actions={(
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={onExit}
                                aria-label={t('chat.btw.cancelAria')}
                            >
                                <Icon name="close" className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>{t('chat.btw.cancelAria')}</TooltipContent>
                    </Tooltip>
                )}
            />
        );
    }

    // `hidden`: collapsed while the parent's own request takes the dock.
    return <AnimatePresence>{hidden ? null : stage}</AnimatePresence>;
};

const useBtwDestroy = (sessionRef: BtwSessionRef | null): (() => void) => {
    const { t } = useI18n();
    return React.useCallback(() => {
        if (!sessionRef) return;
        void destroyBtwSession(sessionRef).then((ok) => {
            if (!ok) toast.error(t('chat.btw.toast.destroyFailed'));
        });
    }, [sessionRef, t]);
};

type BtwSessionData = {
    messageRecords: Array<{ info: Message; parts: Part[] }>;
    sessionIsWorking: boolean;
    streamingMessageId: string | null;
    activeStreamingPhase: 'streaming' | 'cooldown' | 'completed' | null;
    sessionPermissions: ReturnType<typeof useScopedBlockingPermissions>;
    sessionForms: ReturnType<typeof useScopedBlockingForms>;
    sessionRecoveredQuestions: ReturnType<typeof useRecoveredQuestions>;
    isEmpty: boolean;
};

/**
 * Live session data for the fork, all keyed by the fork's own ids. Only the
 * fork's tail (messages after the inherited-history boundary) is shown.
 */
const useBtwSessionData = (
    sessionId: string,
    directory: string,
    boundaryMessageID: string | null,
): BtwSessionData => {
    const sync = useSync();
    const renderable = useSessionRenderable(sessionId, directory);
=======
    useEscapeToExit(onExit, !panel.collapsed && Boolean(panel.pending || panel.creating || panel.btwSessionId));

    let stage: React.ReactNode = null;
    if (panel.btwSessionId && panel.btwDirectory) {
        stage = (
            <BtwSheet
                key="sheet"
                sessionRef={{
                    parentSessionId,
                    btwSessionId: panel.btwSessionId,
                    directory: panel.btwDirectory,
                }}
                boundaryMessageID={panel.boundaryMessageID}
                collapsed={panel.collapsed}
            />
        );
    } else if (panel.creating) {
        stage = (
            <BtwFrame key="creating">
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                    <Icon name="loader-4" className="size-4 animate-spin" />
                    <span>{t('chat.btw.loading')}</span>
                </div>
            </BtwFrame>
        );
    } else if (panel.pending) {
        stage = (
            <BtwFrame
                key="pending"
                draftHint={t('chat.btw.draftHint')}
                collapsed={panel.collapsed}
                actions={(
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={onExit}
                                aria-label={t('chat.btw.cancelAria')}
                            >
                                <Icon name="close" className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>{t('chat.btw.cancelAria')}</TooltipContent>
                    </Tooltip>
                )}
            />
        );
    }

    return <AnimatePresence>{hidden ? null : stage}</AnimatePresence>;
};

const useBtwDestroy = (sessionRef: BtwSessionRef | null): (() => void) => {
    const { t } = useI18n();
    return React.useCallback(() => {
        if (!sessionRef) return;
        void destroyBtwSession(sessionRef).then((ok) => {
            if (!ok) toast.error(t('chat.btw.toast.destroyFailed'));
        });
    }, [sessionRef, t]);
};

type BtwSessionData = {
    messageRecords: Array<{ info: Message; parts: Part[] }>;
    sessionIsWorking: boolean;
    streamingMessageId: string | null;
    activeStreamingPhase: 'streaming' | 'cooldown' | 'completed' | null;
    sessionPermissions: ReturnType<typeof useScopedBlockingPermissions>;
    sessionForms: ReturnType<typeof useScopedBlockingForms>;
    sessionRecoveredQuestions: ReturnType<typeof useRecoveredQuestions>;
    isEmpty: boolean;
};

const useBtwSessionData = (
    sessionId: string,
    directory: string,
    boundaryMessageID: string | null,
): BtwSessionData => {
    const sync = useSync();
    const renderable = useSessionRenderable(sessionId, directory);
>>>>>>> upstream/main
    React.useEffect(() => {
<<<<<<< HEAD
        if (panel.collapsed || (!panel.pending && !panel.ephemeralRecordId)) return;
||||||| bc50ba56aa
        if (!renderable) {
            void sync.ensureSessionRenderable(sessionId, false, directory);
        }
    }, [directory, renderable, sessionId, sync]);

    const messageRecords = useSessionMessageRecords(sessionId, directory);
    const status = useSessionStatus(sessionId, directory) ?? IDLE_SESSION_STATUS;
    const streamingMessageId = useStreamingStore(
        React.useCallback((s) => s.streamingMessageIds.get(sessionId) ?? null, [sessionId]),
    );
    const activeStreamingPhase = useStreamingStore(
        React.useCallback(
            (s) => (streamingMessageId ? s.messageStreamStates.get(streamingMessageId)?.phase ?? null : null),
            [streamingMessageId],
        ),
    );
    const sessionPermissions = useScopedBlockingPermissions(sessionId, directory);
    const sessionForms = useScopedBlockingForms(sessionId, directory);
    const sessionRecoveredQuestions = useRecoveredQuestions(sessionId, directory);

    const tailRecords = React.useMemo(
        () => filterBtwTailMessages(messageRecords, boundaryMessageID),
        [boundaryMessageID, messageRecords],
    );

    const sessionIsWorking = React.useMemo(() => {
        if (sessionPermissions.length > 0 || sessionForms.length > 0) {
            return false;
        }
        const statusType = status.type ?? 'idle';
        if (statusType === 'busy' || statusType === 'retry') {
            return true;
        }
        // Plumbing roles trail the assistant message, so the working state
        // follows the last conversation message, not the last record.
        return isIncompleteAssistantTurn(getLastConversationRecord(tailRecords)?.info);
    }, [sessionPermissions.length, sessionForms.length, status.type, tailRecords]);

    return {
        messageRecords: tailRecords,
        sessionIsWorking,
        streamingMessageId,
        activeStreamingPhase,
        sessionPermissions,
        sessionForms,
        sessionRecoveredQuestions,
        isEmpty: tailRecords.length === 0,
    };
};

/** Composer and popup handlers get first refusal; the owner decides cancel versus collapse. */
const useEscapeToExit = (onExit: () => void, enabled: boolean): void => {
    React.useEffect(() => {
        if (!enabled) return;
=======
        if (!renderable) {
            void sync.ensureSessionRenderable(sessionId, false, directory);
        }
    }, [directory, renderable, sessionId, sync]);

    const messageRecords = useSessionMessageRecords(sessionId, directory);
    const status = useSessionStatus(sessionId, directory) ?? IDLE_SESSION_STATUS;
    const streamingMessageId = useStreamingStore(
        React.useCallback((s) => s.streamingMessageIds.get(sessionId) ?? null, [sessionId]),
    );
    const activeStreamingPhase = useStreamingStore(
        React.useCallback(
            (s) => (streamingMessageId ? s.messageStreamStates.get(streamingMessageId)?.phase ?? null : null),
            [streamingMessageId],
        ),
    );
    const sessionPermissions = useScopedBlockingPermissions(sessionId, directory);
    const sessionForms = useScopedBlockingForms(sessionId, directory);
    const sessionRecoveredQuestions = useRecoveredQuestions(sessionId, directory);

    const tailRecords = React.useMemo(
        () => filterBtwTailMessages(messageRecords, boundaryMessageID),
        [boundaryMessageID, messageRecords],
    );

    const sessionIsWorking = React.useMemo(() => {
        if (sessionPermissions.length > 0 || sessionForms.length > 0) {
            return false;
        }
        const statusType = status.type ?? 'idle';
        if (statusType === 'busy' || statusType === 'retry') {
            return true;
        }
        return isIncompleteAssistantTurn(getLastConversationRecord(tailRecords)?.info);
    }, [sessionPermissions.length, sessionForms.length, status.type, tailRecords]);

    return {
        messageRecords: tailRecords,
        sessionIsWorking,
        streamingMessageId,
        activeStreamingPhase,
        sessionPermissions,
        sessionForms,
        sessionRecoveredQuestions,
        isEmpty: tailRecords.length === 0,
    };
};

const useEscapeToExit = (onExit: () => void, enabled: boolean): void => {
    React.useEffect(() => {
        if (!enabled) return;
>>>>>>> upstream/main
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented || isIMECompositionEvent(event)) return;
            event.preventDefault();
            onExit();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onExit, panel.collapsed, panel.ephemeralRecordId, panel.pending]);

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * Stick-to-bottom auto-scroll. Streaming grows content inside one message
 * without changing the record count, so following the tail needs a
 * ResizeObserver on the content wrapper — data-driven effects alone would
 * stop following mid-stream.
 */
const useAutoScroll = (
    bodyRef: React.RefObject<HTMLDivElement | null>,
    contentRef: React.RefObject<HTMLDivElement | null>,
    contentReady: boolean,
): ((event: React.UIEvent<HTMLDivElement>) => void) => {
    const stickToBottomRef = React.useRef(true);
    // `contentReady` is a dependency because the refs are only attached once
    // the empty state gives way to the message list; an effect keyed on the
    // refs alone would run against `null` and never re-attach the observer.
    React.useEffect(() => {
        if (!contentReady) return;
        const content = contentRef.current;
        const element = bodyRef.current;
        if (element && stickToBottomRef.current) {
            element.scrollTop = element.scrollHeight;
=======
const useAutoScroll = (
    bodyRef: React.RefObject<HTMLDivElement | null>,
    contentRef: React.RefObject<HTMLDivElement | null>,
    contentReady: boolean,
): ((event: React.UIEvent<HTMLDivElement>) => void) => {
    const stickToBottomRef = React.useRef(true);
    React.useEffect(() => {
        if (!contentReady) return;
        const content = contentRef.current;
        const element = bodyRef.current;
        if (element && stickToBottomRef.current) {
            element.scrollTop = element.scrollHeight;
>>>>>>> upstream/main
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
<<<<<<< HEAD
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
||||||| bc50ba56aa
                            {headerSpinner ? (
                                <Spinner className="size-3.5 shrink-0" />
                            ) : (
                                <Icon name="chat-ai-3" className="size-3.5 shrink-0" />
                            )}
                            <Icon name={collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{titleClickLabel}</TooltipContent>
                </Tooltip>
            ) : (
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <Icon name="chat-ai-3" className="size-3.5 shrink-0" />
                    {draftHint ? <span className="typography-ui-label truncate">{draftHint}</span> : null}
                </span>
            )}
            <div className="min-w-0 flex-1" />
            {actions}
    </>}>
        {children ? (
            <>
                {children}
                <div className="h-2" />
            </>
        ) : null}
    </ComposerFloatingPanel>
);

const BtwSheet: React.FC<{
    sessionRef: BtwSessionRef;
    boundaryMessageID: string | null;
    collapsed: boolean;
}> = ({ sessionRef, boundaryMessageID, collapsed }) => {
    const { t } = useI18n();
    const handleDestroy = useBtwDestroy(sessionRef);
    const setCollapsed = React.useCallback((next: boolean) => {
        useBtwStore.getState().setPanelState(sessionRef.parentSessionId, { collapsed: next });
    }, [sessionRef.parentSessionId]);
    const handleToggleCollapsed = React.useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);
    const handlePromote = React.useCallback(() => {
        void promoteBtwSession(sessionRef).catch(() => {
            toast.error(t('chat.btw.toast.promoteFailed'));
        });
    }, [sessionRef, t]);

    const toggleLabel = collapsed ? t('chat.btw.expandAria') : t('chat.btw.collapseAria');
    const headerButtonClass = 'size-7 rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:!bg-transparent active:!bg-transparent';
    const actions = (
        <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={headerButtonClass}
                        onClick={handlePromote}
                        aria-label={t('chat.btw.promoteAria')}
                    >
                        <Icon name="external-link" className="size-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{t('chat.btw.promoteAria')}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={headerButtonClass}
                        onClick={handleDestroy}
                        aria-label={t('chat.btw.destroyAria')}
                    >
                        <Icon name="close" className="size-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{t('chat.btw.destroyAria')}</TooltipContent>
            </Tooltip>
        </div>
    );

    // Collapsed strip and expanded sheet are separate panels: cross-fade
    // between them, and let the whole sheet's exit reach whichever is shown.
    return (
        <AnimatePresence propagate>
            {collapsed ? (
                <BtwCollapsedStrip
                    key="collapsed"
                    sessionRef={sessionRef}
                    actions={actions}
                    onExpand={handleToggleCollapsed}
                    expandLabel={toggleLabel}
                />
            ) : (
                <BtwExpandedSheet
                    key="expanded"
                    sessionRef={sessionRef}
                    boundaryMessageID={boundaryMessageID}
                    actions={actions}
                    onTitleClick={handleToggleCollapsed}
                    titleClickLabel={toggleLabel}
                />
            )}
        </AnimatePresence>
    );
};

/**
 * Collapsed mode: only the header strip stays docked above the composer. The
 * fork keeps running in the background; a spinner replaces the header icon
 * while it is busy so activity stays visible without the message list.
 */
const BtwCollapsedStrip: React.FC<{
    sessionRef: BtwSessionRef;
    actions: React.ReactNode;
    onExpand: () => void;
    expandLabel: string;
}> = ({ sessionRef, actions, onExpand, expandLabel }) => {
    const status = useSessionStatus(sessionRef.btwSessionId, sessionRef.directory) ?? IDLE_SESSION_STATUS;
    const isBusy = status.type === 'busy' || status.type === 'retry';
    return (
        <BtwFrame
            actions={actions}
            onTitleClick={onExpand}
            titleClickLabel={expandLabel}
            collapsed
            headerSpinner={isBusy}
        />
    );
};

const BtwExpandedSheet: React.FC<{
    sessionRef: BtwSessionRef;
    boundaryMessageID: string | null;
    actions: React.ReactNode;
    onTitleClick: () => void;
    titleClickLabel: string;
}> = ({ sessionRef, boundaryMessageID, actions, onTitleClick, titleClickLabel }) => {
    const data = useBtwSessionData(sessionRef.btwSessionId, sessionRef.directory, boundaryMessageID);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const handleBodyScroll = useAutoScroll(bodyRef, contentRef, !data.isEmpty);
    // With the on-screen keyboard open the composer (this panel's anchor)
    // rises, and a vh-based cap would push the panel under the app header.
    // Same protection as the composer autocomplete popups: clamp the scroll
    // body to the space actually available above the anchor. The hook measures
    // room for the scroll body itself, but the panel header and bottom spacer
    // sit inside the same frame above/below it — reserve their height too.
    const BTW_FRAME_CHROME_PX = 48;
    const availableMaxHeight = useMobileAutocompleteMaxHeight(bodyRef, true, 520 + BTW_FRAME_CHROME_PX);
    const mobileMaxHeight = availableMaxHeight !== undefined
        ? Math.max(120, availableMaxHeight - BTW_FRAME_CHROME_PX)
        : undefined;

    return (
        <BtwFrame actions={actions} onTitleClick={onTitleClick} titleClickLabel={titleClickLabel} collapsed={false}>
            <ChatSurfaceProvider mode="peek">
                <ChatTranscriptDirectoryContext.Provider value={sessionRef.directory}>
                    <BtwMessages
                        sessionRef={sessionRef}
                        data={data}
                        bodyRef={bodyRef}
                        contentRef={contentRef}
                        onBodyScroll={handleBodyScroll}
                        maxHeight={mobileMaxHeight}
                    />
                </ChatTranscriptDirectoryContext.Provider>
            </ChatSurfaceProvider>
        </BtwFrame>
    );
};

const BtwMessages: React.FC<{
    sessionRef: BtwSessionRef;
    data: BtwSessionData;
    bodyRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    onBodyScroll: (event: React.UIEvent<HTMLDivElement>) => void;
    maxHeight?: number;
}> = ({ sessionRef, data, bodyRef, contentRef, onBodyScroll, maxHeight }) => {
    const { t } = useI18n();

    if (data.isEmpty) {
        return (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                <Icon name="loader-4" className="size-4 animate-spin" />
                <span>{t('chat.btw.loading')}</span>
            </div>
        );
    }

    return (
        <ScrollableOverlay
            ref={bodyRef}
            onScroll={onBodyScroll}
            useScrollShadow
            scrollShadowSize={32}
            data-scroll-shadow="true"
            data-selection-menu-boundary="true"
            outerClassName="max-h-[min(55vh,520px)] min-h-0"
            outerStyle={maxHeight !== undefined ? { maxHeight } : undefined}
            className="px-3 py-1"
            disableHorizontal
        >
            <div ref={contentRef}>
                {data.messageRecords.map((record, index) => (
                    <ChatMessage
                        key={record.info.id}
                        message={record}
                        nextMessage={data.messageRecords[index + 1]}
                        isInActiveTurn={index === data.messageRecords.length - 1}
                        activeStreamingPhase={
                            record.info.id === data.streamingMessageId ? data.activeStreamingPhase : null
                        }
                    />
                ))}
                {data.sessionForms.length > 0 || data.sessionPermissions.length > 0 || data.sessionRecoveredQuestions.length > 0 ? (
                    <div>
                        {data.sessionForms.map((form) => (
                            <FormCard key={form.id} form={form} />
                        ))}
                        {data.sessionRecoveredQuestions.map((question) => (
                            <FormCard key={question.form.id} form={question.form} recovered={question} />
                        ))}
                        {data.sessionPermissions.map((permission) => (
                            <PermissionCard key={permission.id} permission={permission} />
                        ))}
=======
                            {headerSpinner ? (
                                <Spinner className="size-3.5 shrink-0" />
                            ) : (
                                <Icon name="chat-ai-3" className="size-3.5 shrink-0" />
                            )}
                            <Icon name={collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{titleClickLabel}</TooltipContent>
                </Tooltip>
            ) : (
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <Icon name="chat-ai-3" className="size-3.5 shrink-0" />
                    {draftHint ? <span className="typography-ui-label truncate">{draftHint}</span> : null}
                </span>
            )}
            <div className="min-w-0 flex-1" />
            {actions}
    </>}>
        {children ? (
            <>
                {children}
                <div className="h-2" />
            </>
        ) : null}
    </ComposerFloatingPanel>
);

const BtwSheet: React.FC<{
    sessionRef: BtwSessionRef;
    boundaryMessageID: string | null;
    collapsed: boolean;
}> = ({ sessionRef, boundaryMessageID, collapsed }) => {
    const { t } = useI18n();
    const handleDestroy = useBtwDestroy(sessionRef);
    const setCollapsed = React.useCallback((next: boolean) => {
        useBtwStore.getState().setPanelState(sessionRef.parentSessionId, { collapsed: next });
    }, [sessionRef.parentSessionId]);
    const handleToggleCollapsed = React.useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);
    const handlePromote = React.useCallback(() => {
        void promoteBtwSession(sessionRef).catch(() => {
            toast.error(t('chat.btw.toast.promoteFailed'));
        });
    }, [sessionRef, t]);

    const toggleLabel = collapsed ? t('chat.btw.expandAria') : t('chat.btw.collapseAria');
    const headerButtonClass = 'size-7 rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:!bg-transparent active:!bg-transparent';
    const actions = (
        <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={headerButtonClass}
                        onClick={handlePromote}
                        aria-label={t('chat.btw.promoteAria')}
                    >
                        <Icon name="external-link" className="size-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{t('chat.btw.promoteAria')}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={headerButtonClass}
                        onClick={handleDestroy}
                        aria-label={t('chat.btw.destroyAria')}
                    >
                        <Icon name="close" className="size-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{t('chat.btw.destroyAria')}</TooltipContent>
            </Tooltip>
        </div>
    );

    return (
        <AnimatePresence propagate>
            {collapsed ? (
                <BtwCollapsedStrip
                    key="collapsed"
                    sessionRef={sessionRef}
                    actions={actions}
                    onExpand={handleToggleCollapsed}
                    expandLabel={toggleLabel}
                />
            ) : (
                <BtwExpandedSheet
                    key="expanded"
                    sessionRef={sessionRef}
                    boundaryMessageID={boundaryMessageID}
                    actions={actions}
                    onTitleClick={handleToggleCollapsed}
                    titleClickLabel={toggleLabel}
                />
            )}
        </AnimatePresence>
    );
};

const BtwCollapsedStrip: React.FC<{
    sessionRef: BtwSessionRef;
    actions: React.ReactNode;
    onExpand: () => void;
    expandLabel: string;
}> = ({ sessionRef, actions, onExpand, expandLabel }) => {
    const status = useSessionStatus(sessionRef.btwSessionId, sessionRef.directory) ?? IDLE_SESSION_STATUS;
    const isBusy = status.type === 'busy' || status.type === 'retry';
    return (
        <BtwFrame
            actions={actions}
            onTitleClick={onExpand}
            titleClickLabel={expandLabel}
            collapsed
            headerSpinner={isBusy}
        />
    );
};

const BtwExpandedSheet: React.FC<{
    sessionRef: BtwSessionRef;
    boundaryMessageID: string | null;
    actions: React.ReactNode;
    onTitleClick: () => void;
    titleClickLabel: string;
}> = ({ sessionRef, boundaryMessageID, actions, onTitleClick, titleClickLabel }) => {
    const data = useBtwSessionData(sessionRef.btwSessionId, sessionRef.directory, boundaryMessageID);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const handleBodyScroll = useAutoScroll(bodyRef, contentRef, !data.isEmpty);
    const BTW_FRAME_CHROME_PX = 48;
    const availableMaxHeight = useMobileAutocompleteMaxHeight(bodyRef, true, 520 + BTW_FRAME_CHROME_PX);
    const mobileMaxHeight = availableMaxHeight !== undefined
        ? Math.max(120, availableMaxHeight - BTW_FRAME_CHROME_PX)
        : undefined;

    return (
        <BtwFrame actions={actions} onTitleClick={onTitleClick} titleClickLabel={titleClickLabel} collapsed={false}>
            <ChatSurfaceProvider mode="peek">
                <ChatTranscriptDirectoryContext.Provider value={sessionRef.directory}>
                    <BtwMessages
                        sessionRef={sessionRef}
                        data={data}
                        bodyRef={bodyRef}
                        contentRef={contentRef}
                        onBodyScroll={handleBodyScroll}
                        maxHeight={mobileMaxHeight}
                    />
                </ChatTranscriptDirectoryContext.Provider>
            </ChatSurfaceProvider>
        </BtwFrame>
    );
};

const BtwMessages: React.FC<{
    sessionRef: BtwSessionRef;
    data: BtwSessionData;
    bodyRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    onBodyScroll: (event: React.UIEvent<HTMLDivElement>) => void;
    maxHeight?: number;
}> = ({ sessionRef, data, bodyRef, contentRef, onBodyScroll, maxHeight }) => {
    const { t } = useI18n();

    if (data.isEmpty) {
        return (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                <Icon name="loader-4" className="size-4 animate-spin" />
                <span>{t('chat.btw.loading')}</span>
            </div>
        );
    }

    return (
        <ScrollableOverlay
            ref={bodyRef}
            onScroll={onBodyScroll}
            useScrollShadow
            scrollShadowSize={32}
            data-scroll-shadow="true"
            data-selection-menu-boundary="true"
            outerClassName="max-h-[min(55vh,520px)] min-h-0"
            outerStyle={maxHeight !== undefined ? { maxHeight } : undefined}
            className="px-3 py-1"
            disableHorizontal
        >
            <div ref={contentRef}>
                {data.messageRecords.map((record, index) => (
                    <ChatMessage
                        key={record.info.id}
                        message={record}
                        nextMessage={data.messageRecords[index + 1]}
                        isInActiveTurn={index === data.messageRecords.length - 1}
                        activeStreamingPhase={
                            record.info.id === data.streamingMessageId ? data.activeStreamingPhase : null
                        }
                    />
                ))}
                {data.sessionForms.length > 0 || data.sessionPermissions.length > 0 || data.sessionRecoveredQuestions.length > 0 ? (
                    <div>
                        {data.sessionForms.map((form) => (
                            <FormCard key={form.id} form={form} />
                        ))}
                        {data.sessionRecoveredQuestions.map((question) => (
                            <FormCard key={question.form.id} form={question.form} recovered={question} />
                        ))}
                        {data.sessionPermissions.map((permission) => (
                            <PermissionCard key={permission.id} permission={permission} />
                        ))}
>>>>>>> upstream/main
                    </div>
                ) : null}
<<<<<<< HEAD
||||||| bc50ba56aa
                {/* A turn OpenCode stops before any reply exists (an unusable
                    model, a provider that fails to load) leaves only the
                    question here; the same notice as the main chat says why. */}
                <SessionErrorNotice sessionId={sessionRef.btwSessionId} directory={sessionRef.directory} />
                {/* Always reserve this row so the content does not shift down
                    by a line when the indicator disappears. */}
                <div
                    className={cn(
                        'flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground',
                        !data.sessionIsWorking && 'invisible',
                    )}
                    aria-hidden={!data.sessionIsWorking}
                >
                    {/* Hidden, not removed: it must not keep stepping then. */}
                    <PauseClock paused={!data.sessionIsWorking}>
                        <Spinner className="size-3.5" />
                    </PauseClock>
                    <span>{t('chat.btw.working')}</span>
                </div>
=======
                <SessionErrorNotice sessionId={sessionRef.btwSessionId} directory={sessionRef.directory} />
                <div
                    className={cn(
                        'flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground',
                        !data.sessionIsWorking && 'invisible',
                    )}
                    aria-hidden={!data.sessionIsWorking}
                >
                    <PauseClock paused={!data.sessionIsWorking}>
                        <Spinner className="size-3.5" />
                    </PauseClock>
                    <span>{t('chat.btw.working')}</span>
                </div>
>>>>>>> upstream/main
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
