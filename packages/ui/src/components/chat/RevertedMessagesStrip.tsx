import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
const attachmentBasename = (value: string): string => {
  const normalized = /^(?:[A-Za-z]:\\|\\\\)/.test(value) ? value.replace(/\\/g, "/") : value;
  const segments = normalized.split("/");
  return segments[segments.length - 1] || value;
};
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay";
import React from 'react';
import type { Part } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { clearStagedRevert } from '@/sync/session-actions';
import { attachmentBasename } from '@/lib/attachmentIdentity';
import { useDirectorySync } from '@/sync/sync-context';
<<<<<<< HEAD
=======
import { readSubagentRun } from '@/lib/opencode/subagent-run';
import { attachSyntheticContext } from './lib/attachSyntheticContext';
import { getPromptPreviewText } from './lib/messagePreview';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
>>>>>>> bc50ba56a
import {
    EMPTY_REVERTED_MESSAGE_DOCK_STATE,
    buildRevertedMessageDockState,
    type RevertedMessageDockState,
} from './revertedMessageDockState';

/**
 * A one-line preview of a reverted message: its text parts joined and
 * collapsed to a single line, falling back to an attached filename and then to
 * a caller-supplied placeholder.
 */
const getRevertedPreview = (parts: Part[], fallback: string): string => {
    const text = parts
        .filter((part) => part.type === 'text')
        .map((part) => (part.type === 'text' ? part.content : ''))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();

    if (text) return text;
<<<<<<< HEAD
    const filePart = parts.find((part) => part.type === 'attachment');
    return filePart?.name ? `[${attachmentBasename(filePart.name)}]` : fallback;
=======
    const filePart = parts.find((part) => part.type === 'file');
    return filePart?.filename ? `[${attachmentBasename(filePart.filename)}]` : fallback;
>>>>>>> bc50ba56a
};

const ROW_CLASS = 'flex h-10 min-w-0 items-center gap-2 pl-3 pr-1.5';

interface RevertedMessagesStripProps {
    sessionId: string | null;
    directory?: string;
}

/**
 * A staged revert, as a top row of the composer. OpenCode v2 stages a revert:
 * the messages after the revert point are hidden and the agent's file changes
 * from those turns are rolled back. The next message drops them for good
 * (OpenCode commits the revert before admitting it), so the only decision left
 * here is Restore, which puts the messages and the files back. One reverted
 * message is its own row; several collapse into a count that expands in place.
 */
export const RevertedMessagesStrip: React.FC<RevertedMessagesStripProps> = React.memo(({ sessionId, directory }) => {
    const { t } = useI18n();
    const [restoring, setRestoring] = React.useState(false);
    // The list opens for one revert point; a new revert starts collapsed.
    const [expandedFor, setExpandedFor] = React.useState<string | null>(null);
    const listId = React.useId();
    const revertedStateRef = React.useRef<RevertedMessageDockState>(EMPTY_REVERTED_MESSAGE_DOCK_STATE);
    const revertedState = useDirectorySync(
        React.useCallback((state) => {
            const next = buildRevertedMessageDockState(state, sessionId, revertedStateRef.current);
            revertedStateRef.current = next;
            return next;
        }, [sessionId]),
        directory,
    );
    const noTextContent = t('chat.revertPopover.noTextContent');
    const items = React.useMemo(() => revertedState.records.map((record) => ({
        id: record.message.messageId,
        text: getRevertedPreview(record.parts, noTextContent),
    })), [noTextContent, revertedState]);

    if (!sessionId || !revertedState.revertMessageID || items.length === 0) return null;

    const restore = async () => {
        if (restoring) return;
        setRestoring(true);
        try {
            await clearStagedRevert(sessionId);
        } catch (error) {
            console.warn('[revert] failed to restore reverted messages:', error);
            toast.error(t('chat.revertPopover.toast.restoreFailed'));
        } finally {
            setRestoring(false);
        }
    };

    const restoreLabel = items.length === 1 ? t('chat.revertPopover.restore') : t('chat.revertPopover.restoreAll');
    const restoreButton = (
        <Tooltip>
            <TooltipTrigger asChild>
<<<<<<< HEAD
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={restoring}
                    onClick={() => { void restore(); }}
                    onMouseDown={(event) => event.preventDefault()}
                    className="shrink-0 text-primary/80 hover:bg-transparent hover:text-primary"
                >
                    {restoring ? <Icon name="loader-4" className="size-3 animate-spin" aria-hidden="true" /> : null}
                    {restoreLabel}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{restoreLabel}</TooltipContent>
=======
                <span className="inline-flex shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={restoring}
                        onClick={() => { void restore(); }}
                        onMouseDown={(event) => event.preventDefault()}
                        className="shrink-0 text-primary/80 hover:bg-transparent hover:text-primary"
                    >
                        {restoring ? <Icon name="loader-4" className="size-3 animate-spin" aria-hidden="true" /> : null}
                        {items.length === 1 ? t('chat.revertPopover.restore') : t('chat.revertPopover.restoreAll')}
                    </Button>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t(items.length === 1 ? 'contextTooltips.chat.restoreOne' : 'contextTooltips.chat.restoreAll')}</TooltipContent>
>>>>>>> bc50ba56a
        </Tooltip>
    );

    if (items.length === 1) {
        return (
            <div role="group" className={`${ROW_CLASS} border-b border-edge`} aria-label={t('chat.revertPopover.title')}>
                <Icon name="arrow-go-back" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{items[0].text}</span>
                {restoreButton}
            </div>
        );
    }

    const expansionKey = `${revertedState.revertMessageID}:${items[0].id}`;
    const expanded = expandedFor === expansionKey;

    // The header toggles the list, as the background commands header does;
    // Restore stays on it, so the decision never hides behind the toggle.
    return (
        <div role="group" className="border-b border-edge" aria-label={t('chat.revertPopover.title')}>
<<<<<<< HEAD
            <div className="flex h-10 items-center gap-2 pl-3 pr-1.5">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedFor(expanded ? null : expansionKey)}
                    onMouseDown={(event) => event.preventDefault()}
                    aria-expanded={expanded}
                    aria-controls={expanded ? listId : undefined}
                    className="min-w-0 flex-1 shrink justify-start gap-2 px-0 text-sm font-normal normal-case text-muted-foreground hover:!bg-transparent hover:text-foreground has-[>svg]:px-0"
                >
                    <Icon name="arrow-go-back" className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate text-left">
                        {t('chat.revertPopover.staged', { count: items.length })}
                    </span>
                    <Icon name={expanded ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" aria-hidden="true" />
                </Button>
                {restoreButton}
            </div>
            {expanded ? (
                <ScrollableOverlay id={listId} outerClassName="max-h-40" className="overscroll-contain">
=======
            <div className="flex oc-composer-row items-center gap-2 ps-3 pe-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedFor(expanded ? null : expansionKey)}
                            onMouseDown={(event) => event.preventDefault()}
                            aria-expanded={expanded}
                            aria-controls={expanded ? listId : undefined}
                            className="min-w-0 flex-1 shrink justify-start gap-2 px-0 text-sm font-normal normal-case text-muted-foreground hover:!bg-transparent hover:text-foreground has-[>svg]:px-0"
                        >
                            <Icon name="arrow-go-back" className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate text-start">
                                {t('chat.revertPopover.staged', { count: items.length })}
                            </span>
                            <Icon name={expanded ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{t(expanded ? 'contextTooltips.chat.revertedHide' : 'contextTooltips.chat.revertedShow')}</TooltipContent>
                </Tooltip>
                {restoreButton}
            </div>
            {expanded ? (
                <ScrollableOverlay id={listId} outerClassName="max-h-40" className="overscroll-contain" disableHorizontal>
>>>>>>> bc50ba56a
                    {items.map((item) => (
                        <div key={item.id} className={ROW_CLASS}>
                            <span className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.text}</span>
                        </div>
                    ))}
                </ScrollableOverlay>
            ) : null}
        </div>
    );
});

RevertedMessagesStrip.displayName = 'RevertedMessagesStrip';
