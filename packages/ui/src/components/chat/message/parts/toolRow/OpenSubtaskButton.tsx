import React from 'react';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { Icon } from '@/components/icon/Icon';
import { HoverTooltip } from '@/components/ui/row-tooltip';
import { useI18n } from '@/lib/i18n';
import { useChatColumnActions, useChatSessionSelection } from '@/components/chat/chatColumnSession';

export const OpenSubtaskButton: React.FC<{
    sessionId: string;
    agent: string | undefined;
    isMobile: boolean;
    directory?: string | null;
    label?: string;
}> = ({ sessionId, agent, isMobile, directory, label: customLabel }) => {
    const { t } = useI18n();
    const selection = useChatSessionSelection();
    const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);
    const currentDirectory = directory ?? selection.directory ?? fallbackDirectory;
    const column = useChatColumnActions();
    const runtime = React.useContext(RuntimeAPIContext);

    const sessionTitle = useGlobalSessionsStore((state) => state.entityById.get(sessionId)?.title?.trim() || null);
    const agentType = agent ?? 'subagent';
    const trimmedCustom = customLabel?.trim() || '';
    const displayName = (trimmedCustom && trimmedCustom !== agentType
        ? trimmedCustom
        : sessionTitle || trimmedCustom) || agentType;
    const sessionTitleFallback = (trimmedCustom && trimmedCustom !== agentType
        ? trimmedCustom
        : sessionTitle || trimmedCustom || agent?.trim()) || null;
    const label = t('subagents.openSubtask', { name: displayName });

    const handleOpen = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (!currentDirectory) return;
        if (column.pinned) {
            column.openSession(sessionId, currentDirectory);
            return;
        }
        if (isMobile || runtime?.runtime.isVSCode) {
            useSessionUIStore.getState().setCurrentSession(sessionId, currentDirectory);
            return;
        }
        useUIStore.getState().openContextPanelTab(currentDirectory, {
            mode: 'chat',
            dedupeKey: `session:${sessionId}`,
            label: displayName,
            sessionTitleFallback,
            readOnly: true,
        });
    };

    return (
        <HoverTooltip label={label}>
            <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleOpen}
                className={cn(
                    'flex-shrink-0 inline-flex h-4 w-4 items-center justify-center rounded transition-opacity',
                    'opacity-60 hover:opacity-100 focus-visible:opacity-100',
                )}
                style={{ color: 'var(--tools-icon)' }}
                aria-label={label}
            >
                <Icon name="external-link" className="h-3 w-3" />
            </button>
        </HoverTooltip>
    );
};
