import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
import { AnimatePresence } from 'motion/react';
import type { ApprovalRequest } from '@openchamber/agent-contract';
import { ComposerFloatingPanel } from './composer/ui/ComposerFloatingPanel';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { useScopedBlockingPermissions } from '@/sync/sync-context';
import { useRequestReveal } from '@/sync/request-reveal';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import {
    PermissionActions,
    PermissionRequestContent,
} from './PermissionCard';
import { getApprovalPresentation } from './permissionPresentation';
import { usePermissionFromSubagent, usePermissionResponse } from './usePermissionResponse';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

/**
 * The agent's native approval requests, docked above the composer in the same
 * frame as the form dock. Every pending request for the composer's session
 * (including its subagents') is a step in the header, one dot per request with
 * the current one solid, so a batch raised together reads as one panel to walk
 * through rather than a stack of cards. The dock answers one request at a time;
 * once it is answered the next one takes its place.
 */

interface PermissionDockProps {
    sessionId: string | null;
    directory?: string;
    hidden: boolean;
}

const PermissionDockView: React.FC<PermissionDockProps> = ({ sessionId, directory, hidden }) => {
    const permissions = useScopedBlockingPermissions(sessionId, directory);
    return (
        <AnimatePresence>
            {hidden || permissions.length === 0 ? null : <PermissionDockPanel key="permissions" permissions={permissions} />}
        </AnimatePresence>
    );
};

const PermissionDockPanel: React.FC<{ permissions: ApprovalRequest[] }> = ({ permissions }) => {
    const { t } = useI18n();
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [collapsed, setCollapsed] = React.useState(false);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);

    // "Open session" on a request's toast expands the dock on that request.
    const permissionIds = React.useMemo(() => permissions.map((permission) => permission.approvalId), [permissions]);
    useRequestReveal(permissionIds, React.useCallback((id: string) => {
        setSelectedId(id);
        setCollapsed(false);
    }, []));

    // The chosen request stays current while it is pending; a request that was
    // answered elsewhere (another client, auto-accept) falls back to the oldest
    // one still open.
    const currentIndex = Math.max(0, permissions.findIndex((permission) => permission.approvalId === selectedId));
    const current = permissions[currentIndex];
    const availableMaxHeight = useMobileAutocompleteMaxHeight(bodyRef, !collapsed, 320);

    return (
        <PermissionDockRequest
            key={current.approvalId}
            permission={current}
            permissions={permissions}
            currentIndex={currentIndex}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
            onSelect={(id) => setSelectedId(id)}
            bodyRef={bodyRef}
            availableMaxHeight={availableMaxHeight}
            t={t}
        />
    );
};

const PermissionDockRequest: React.FC<{
    permission: ApprovalRequest;
    permissions: ApprovalRequest[];
    currentIndex: number;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    onSelect: (id: string) => void;
    bodyRef: React.RefObject<HTMLDivElement | null>;
    availableMaxHeight: number | undefined;
    t: ReturnType<typeof useI18n>['t'];
}> = ({ permission, permissions, currentIndex, collapsed, onToggleCollapsed, onSelect, bodyRef, availableMaxHeight, t }) => {
    const { isResponding, hasResponded, respond } = usePermissionResponse(permission);
    const isFromSubagent = usePermissionFromSubagent(permission);
    const tool = getApprovalPresentation(permission);
    const title = t('chat.permissionCard.title');

    if (hasResponded || permission.status !== 'pending') return null;

    return (
        <ComposerFloatingPanel
            role="dialog"
            ariaLabel={title}
            compact={collapsed}
            header={<>
                <Tooltip>
<<<<<<< HEAD
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={onToggleCollapsed}
                            aria-expanded={!collapsed}
                            aria-label={collapsed ? t('chat.permissionDock.expandAria') : t('chat.permissionDock.collapseAria')}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left text-muted-foreground transition-colors hover:text-foreground"
                        >
=======
                <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? t('chat.permissionDock.expandAria') : t('chat.permissionDock.collapseAria')}
                    className="flex min-w-0 flex-1 items-center gap-2 text-start text-muted-foreground transition-colors hover:text-foreground"
                >
>>>>>>> bc50ba56a
                    <Icon name="question" className="size-3.5 shrink-0 text-[var(--status-warning)]" />
                    <Icon name={collapsed ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" />
                    <span className="typography-ui-label min-w-0 truncate text-foreground">{title}</span>
                    {isFromSubagent ? (
                        <span className="typography-micro shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 text-muted-foreground">
                            {t('chat.questionCard.fromSubagent')}
                        </span>
                    ) : null}
                    {permissions.length > 1 ? (
                        <span className="typography-micro shrink-0 tabular-nums text-muted-foreground">
                            {t('chat.formDock.progress', { current: String(currentIndex + 1), total: String(permissions.length) })}
                        </span>
                    ) : null}
<<<<<<< HEAD
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{collapsed ? t('chat.permissionDock.expandAria') : t('chat.permissionDock.collapseAria')}</TooltipContent>
=======
                </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{collapsed ? t('chat.permissionDock.expandAria') : t('chat.permissionDock.collapseAria')}</TooltipContent>
>>>>>>> bc50ba56a
                </Tooltip>
                {/* One dot per pending request, the current one solid. */}
                {!collapsed && permissions.length > 1 ? (
                    <div className="flex shrink-0 items-center gap-1" role="tablist">
                        {permissions.map((entry, index) => {
                            const label = t('chat.permissionDock.stepAria', { index: String(index + 1), tool: entry.toolName });
                            return (
<<<<<<< HEAD
                                <Tooltip key={entry.approvalId}>
=======
                                <Tooltip key={entry.id}>
>>>>>>> bc50ba56a
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={index === currentIndex}
                                            aria-label={label}
<<<<<<< HEAD
                                            onClick={() => onSelect(entry.approvalId)}
=======
                                            onClick={() => onSelect(entry.id)}
>>>>>>> bc50ba56a
                                            className="flex size-4 items-center justify-center"
                                        >
                                            <span className={cn('block size-1.5 rounded-full transition-colors', index === currentIndex ? 'bg-primary' : 'bg-foreground/15')} />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                ) : null}
                <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                    <Icon name={tool.icon} className="h-3 w-3" />
                    <span className="typography-meta font-medium">{permission.toolName}</span>
                </span>
            </>}
        >
            {!collapsed ? (
                <div>
                    <ScrollableOverlay
                        ref={bodyRef}
                        outerClassName="max-h-[50vh]"
                        outerStyle={availableMaxHeight === undefined ? undefined : { maxHeight: Math.max(120, availableMaxHeight - 96) }}
                        className="overscroll-contain px-1.5"
                        disableHorizontal
                    >
                        <PermissionRequestContent permission={permission} />
                    </ScrollableOverlay>
                    <PermissionActions
                        permission={permission}
                        isResponding={isResponding}
                        onRespond={(response) => void respond(response)}
                        variant="dock"
                    />
                </div>
            ) : null}
        </ComposerFloatingPanel>
    );
};

/** Memoized: the composer re-renders on every keystroke, and nothing here depends on the draft text. */
export const PermissionDock = React.memo(PermissionDockView);
