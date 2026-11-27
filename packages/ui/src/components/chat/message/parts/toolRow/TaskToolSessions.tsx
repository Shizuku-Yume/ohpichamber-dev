import React from 'react';
import type { JsonValue, Subagent, ToolCallPart } from '@openchamber/agent-contract';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { getSyncSessions } from '@/sync/sync-refs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useChatColumnActions, useChatSessionSelection } from '../../../chatColumnSession';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { openSubagentsPanel } from '@/components/chat/subagents/panel';
import { isVSCodeRuntime } from '@/lib/desktop';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { OpenSubtaskButton } from './OpenSubtaskButton';
import { isActiveCallStatus, taskResultDetailsSchema } from './types';

const EMPTY_SUBAGENTS: Subagent[] = [];

interface SubagentStatusIcon {
    name: IconName;
    color?: string;
}

const subagentStatusIcon = (status: string | undefined): SubagentStatusIcon => {
    switch (status) {
        case 'running':
            return { name: 'record-circle', color: 'var(--status-info)' };
        case 'completed':
            return { name: 'checkbox-circle', color: 'var(--status-success)' };
        case 'failed':
            return { name: 'close-circle', color: 'var(--status-error)' };
        case 'cancelled':
        case 'aborted':
            return { name: 'close-circle' };
        default:
            return { name: 'time' };
    }
};

export const TaskToolSessions: React.FC<{
    call: ToolCallPart;
    resultDetails?: JsonValue;
    sessionId?: string;
    directory?: string | null;
    isMobile: boolean;
}> = ({ call, resultDetails, sessionId: addressedSessionId, directory: addressedDirectory, isMobile }) => {
    const { t } = useI18n();
    const selection = useChatSessionSelection();
    const column = useChatColumnActions();
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    const sessionId = addressedSessionId ?? selection.sessionId;
    const directory = addressedDirectory ?? selection.directory;
    const allSubagents = useSubagentsStore(
        React.useCallback((state) => (sessionId ? (state.byParent[sessionId] ?? EMPTY_SUBAGENTS) : EMPTY_SUBAGENTS), [sessionId]),
    );
    const isHydrated = useSubagentsStore(
        React.useCallback((state) => Boolean(sessionId && state.hydratedByParent[sessionId] === runtimeKey), [runtimeKey, sessionId]),
    );
    const hydrateFailed = useSubagentsStore(
        React.useCallback((state) => Boolean(sessionId && state.failedByParent?.[sessionId] === runtimeKey), [runtimeKey, sessionId]),
    );
    const children = React.useMemo(
        () => (sessionId ? allSubagents.filter((child) => child.parentSessionId === sessionId && child.toolCallId === call.toolCallId) : EMPTY_SUBAGENTS),
        [allSubagents, call.toolCallId, sessionId],
    );
    const parsedDetails = React.useMemo(() => taskResultDetailsSchema.safeParse(resultDetails).data, [resultDetails]);
    const progressFallback = React.useMemo(
        () => (children.length === 0 ? (parsedDetails?.progress ?? []) : []),
        [children.length, parsedDetails?.progress],
    );

    const ownerKey = `${sessionId ?? ''}\0${runtimeKey}\0${call.toolCallId}`;
    const [hydratingToken, setHydratingToken] = React.useState<string | null>(null);
    const hydrating = hydratingToken?.startsWith(`${ownerKey}\0`) ?? false;
    const mountedRef = React.useRef(true);
    const hydrateSeqRef = React.useRef(0);
    const prevCallRef = React.useRef<{ ownerKey: string; status: ToolCallPart['status'] | undefined }>({
        ownerKey: '',
        status: undefined,
    });

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runHydrate = React.useCallback((force: boolean) => {
        if (!sessionId || !directory) return;
        const token = `${ownerKey}\0${++hydrateSeqRef.current}`;
        setHydratingToken(token);
        void useSubagentsStore.getState().hydrateParent(sessionId, force).finally(() => {
            if (mountedRef.current) {
                setHydratingToken((current) => (current === token ? null : current));
            }
        });
    }, [directory, ownerKey, sessionId]);

    React.useEffect(() => {
        const prev = prevCallRef.current;
        const prevStatus = prev.ownerKey === ownerKey ? prev.status : undefined;
        prevCallRef.current = { ownerKey, status: call.status };
        if (!sessionId || !directory) return;
        const settledTransition = isActiveCallStatus(prevStatus) && !isActiveCallStatus(call.status);
        if (!isHydrated || settledTransition) {
            runHydrate(settledTransition);
        }
    }, [call.status, directory, isHydrated, ownerKey, runHydrate, sessionId]);

    React.useEffect(() => {
        if (!sessionId || !directory || children.length === 0) return;
        const global = useGlobalSessionsStore.getState();
        const parent = getSyncSessions(directory).find((session) => session.sessionId === sessionId) ?? global.entityById.get(sessionId);
        if (parent) global.upsertSubagents(parent, children);
    }, [children, directory, sessionId]);

    if (!sessionId || !directory) return null;

    const openChild = (child: Subagent) => {
        if (!child.childSessionId) return;
        const label = child.name?.trim() || child.role;
        if (column.pinned) column.openSession(child.childSessionId, directory);
        else if (isMobile) useSessionUIStore.getState().setCurrentSession(child.childSessionId, directory);
        else useUIStore.getState().openContextPanelTab(directory, {
            mode: 'chat', dedupeKey: `session:${child.childSessionId}`, label, sessionTitleFallback: label, readOnly: true,
        });
    };

    const isAsyncRunning = parsedDetails?.async?.state === 'running' || isActiveCallStatus(call.status);
    const showPanelButton = !isMobile && !isVSCodeRuntime() && (children.length > 0 || progressFallback.length > 0);

    return (
        <div className="mb-2 space-y-1 typography-meta">
            {children.map((child) => {
                const icon = subagentStatusIcon(child.status);
                const displayName = child.name?.trim() || child.role;
                const showRole = Boolean(child.name?.trim() && child.name.trim() !== child.role);
                const liveDetail = child.status === 'running'
                    ? (child.activeTool
                        ? (child.activeToolArgs ? `${child.activeTool}: ${child.activeToolArgs}` : child.activeTool)
                        : (child.stage || child.lastIntent || t('chat.workStatus.subagent.working')))
                    : child.status === 'failed'
                        ? (child.stage || t('chat.workStatus.subagent.failed'))
                        : child.status === 'cancelled'
                            ? (child.stage || t('subagents.status.cancelled'))
                            : child.status === 'completed'
                                ? (child.stage || t('chat.workStatus.subagent.done'))
                                : (child.stage || null);
                return (
                    <div
                        key={child.subagentId}
                        className={cn(
                            'flex items-center gap-2 rounded-lg px-2 py-1 border border-border/20 bg-muted/15 min-w-0 transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none',
                            child.childSessionId && 'hover:bg-interactive-hover cursor-pointer',
                        )}
                        onClick={child.childSessionId ? (event) => { event.stopPropagation(); openChild(child); } : undefined}
                    >
                        <Icon
                            name={icon.name}
                            className={cn('size-3.5 shrink-0', !icon.color && 'text-muted-foreground')}
                            style={icon.color ? { color: icon.color } : undefined}
                        />
                        <span className="font-medium text-foreground truncate" dir="auto">{displayName}</span>
                        {showRole ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">({child.role})</span>
                        ) : null}
                        {liveDetail ? (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" dir="auto" title={liveDetail}>
                                {liveDetail}
                            </span>
                        ) : <span className="flex-1" />}
                        {child.childSessionId ? (
                            <OpenSubtaskButton
                                sessionId={child.childSessionId}
                                agent={child.role}
                                label={displayName}
                                directory={directory}
                                isMobile={isMobile}
                            />
                        ) : null}
                    </div>
                );
            })}
            {progressFallback.map((item) => {
                const icon = subagentStatusIcon(item.status);
                const detail = item.currentTool
                    ? (item.currentToolArgs ? `${item.currentTool}: ${item.currentToolArgs}` : item.currentTool)
                    : (item.stage || item.lastIntent || null);
                return (
                    <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 border border-border/20 bg-muted/15 min-w-0"
                    >
                        <Icon
                            name={icon.name}
                            className={cn('size-3.5 shrink-0', !icon.color && 'text-muted-foreground')}
                            style={icon.color ? { color: icon.color } : undefined}
                        />
                        <span className="font-medium text-foreground truncate" dir="auto">{item.id}</span>
                        {item.agent && item.agent !== item.id ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">({item.agent})</span>
                        ) : null}
                        {detail ? (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" dir="auto" title={detail}>
                                {detail}
                            </span>
                        ) : null}
                    </div>
                );
            })}
            {hydrating && children.length === 0 && progressFallback.length === 0 ? (
                <span className="text-muted-foreground">{t('common.loading')}</span>
            ) : null}
            {hydrateFailed ? (
                <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{t('common.unavailable')}</span>
                    <Button variant="ghost" size="xs" onClick={(event) => { event.stopPropagation(); runHydrate(true); }}>
                        {t('errorBoundary.actions.tryAgain')}
                    </Button>
                </div>
            ) : children.length === 0 && progressFallback.length === 0 && !hydrating && isAsyncRunning ? (
                <span className="text-muted-foreground">{t('chat.toolPart.awaitingResponse')}</span>
            ) : null}
            {showPanelButton ? (
                <div className="flex items-center justify-end">
                    <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                            event.stopPropagation();
                            openSubagentsPanel(directory);
                        }}
                    >
                        <Icon name="ai-agent" className="size-3.5" />
                        {t('chat.workStatus.subagent.openPanel')}
                    </Button>
                </div>
            ) : null}
        </div>
    );
};
