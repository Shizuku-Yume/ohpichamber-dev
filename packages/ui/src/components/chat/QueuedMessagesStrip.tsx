import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import React, { memo } from 'react';
import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    closestCenter,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getMessageQueueKey, useMessageQueueStore, type MessageQueueTarget, type QueuedMessage } from '@/stores/messageQueueStore';
import { useInputStore } from '@/sync/input-store';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getQueuedMessagePreview } from '@/lib/messages/queuedMessagePreview';
import { withAttachmentChips } from './message/parts/attachmentCitationChips';

const ROW_ACTION_CLASS = 'shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground';

<<<<<<< HEAD
||||||| bc50ba56aa
/** The agent a queued message was captured with, in the composer agent control's colors. */
const QueuedMessageAgentBadge: React.FC<{ agentName: string }> = ({ agentName }) => {
    const { t } = useI18n();
    const getAgentColor = useAgentColors();
    const knownAgent = useConfigStore((state) => state.agents.find((agent) => agent.name === agentName));
    const label = agentLabel(knownAgent ?? { name: agentName, displayName: '' });
    const { color } = getAgentColor(agentName);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="flex min-w-0 max-w-[40%] shrink items-center gap-1.5 typography-ui-label font-medium" style={{ color }}>
                    <Icon name="ai-agent" className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
                {t('chat.queuedMessage.sendsAsAgent', { agent: label })}
            </TooltipContent>
        </Tooltip>
    );
};

=======
const QueuedMessageAgentBadge: React.FC<{ agentName: string }> = ({ agentName }) => {
    const { t } = useI18n();
    const getAgentColor = useAgentColors();
    const knownAgent = useConfigStore((state) => state.agents.find((agent) => agent.name === agentName));
    const label = agentLabel(knownAgent ?? { name: agentName, displayName: '' });
    const { color } = getAgentColor(agentName);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="flex min-w-0 max-w-[40%] shrink items-center gap-1.5 typography-ui-label font-medium" style={{ color }}>
                    <Icon name="ai-agent" className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
                {t('chat.queuedMessage.sendsAsAgent', { agent: label })}
            </TooltipContent>
        </Tooltip>
    );
};

>>>>>>> upstream/main
interface QueuedMessageRowProps {
    message: QueuedMessage;
    target: MessageQueueTarget;
<<<<<<< HEAD
||||||| bc50ba56aa
    /** The agent the composer would send as now; a message captured with another one says so. */
    composerAgentName: string | null | undefined;
=======
    composerAgentName: string | null | undefined;
>>>>>>> upstream/main
    onEdit: (message: QueuedMessage) => void;
    onSend: (message: QueuedMessage) => void;
    lead: React.ReactNode;
}

const QueuedMessageRow: React.FC<QueuedMessageRowProps> = ({ message, target, onEdit, onSend, lead }) => {
    const { t } = useI18n();
    const removeFromQueue = useMessageQueueStore((state) => state.removeFromQueue);
    const firstLine = getQueuedMessagePreview(message);
    const attachmentCount = message.attachments?.length ?? 0;
    const attachmentFilenames = React.useMemo(
        () => (message.attachments ?? []).map((file) => file.filename),
        [message.attachments],
    );

    return (
        <>
            {lead}
<<<<<<< HEAD
||||||| bc50ba56aa
            {message.goal ? (
                // Same lit target as the composer's armed goal button.
                <span
                    role="img"
                    className="flex shrink-0 text-[var(--status-info)]"
                    title={t('chat.queuedMessage.goal')}
                    aria-label={t('chat.queuedMessage.goal')}
                >
                    <Icon name="target-fill" className="size-3.5" aria-hidden="true" />
                </span>
            ) : null}
=======
            {message.goal ? (
                <span
                    role="img"
                    className="flex shrink-0 text-[var(--status-info)]"
                    title={t('chat.queuedMessage.goal')}
                    aria-label={t('chat.queuedMessage.goal')}
                >
                    <Icon name="target-fill" className="size-3.5" aria-hidden="true" />
                </span>
            ) : null}
>>>>>>> upstream/main
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {firstLine ? withAttachmentChips(firstLine, attachmentFilenames, `queued-${message.id}`) : t('chat.queuedMessage.empty')}
                {attachmentCount > 0 && (
                    <span className="ml-1 text-muted-foreground">{t('chat.queuedMessage.attachments', { count: attachmentCount })}</span>
                )}
            </span>
            {!message.scheduledTask ? (
                <>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onEdit(message)}
                                onMouseDown={(event) => event.preventDefault()}
                                className={ROW_ACTION_CLASS}
                            >
                                <Icon name="edit" className="size-3.5" aria-hidden="true" />
                                {t('chat.queuedMessage.edit')}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.queueEdit')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onSend(message)}
                                onMouseDown={(event) => event.preventDefault()}
                                className={ROW_ACTION_CLASS}
                            >
                                <Icon name="send-plane" className="size-3.5" aria-hidden="true" />
                                {t('chat.queuedMessage.send')}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.queueSend')}</TooltipContent>
                    </Tooltip>
                </>
            ) : null}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromQueue(target, message.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        aria-label={t('chat.queuedMessage.removeAria')}
                        className={ROW_ACTION_CLASS}
                    >
                        <Icon name="close" className="size-4" aria-hidden="true" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{t('chat.queuedMessage.removeAria')}</TooltipContent>
            </Tooltip>
        </>
    );
};

const ROW_CLASS = 'flex h-10 min-w-0 items-center gap-2 pl-3 pr-1.5';

const SortableQueuedMessageRow = memo((props: Omit<QueuedMessageRowProps, 'lead'>) => {
    const { t } = useI18n();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.message.id });

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn(ROW_CLASS, isDragging && 'relative z-10 opacity-60')}
        >
            <QueuedMessageRow
                {...props}
                lead={(
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                {...attributes}
                                {...listeners}
                                className="flex size-3.5 flex-shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
                                aria-label={t('chat.queuedMessage.reorderAria')}
                            >
                                <Icon name="draggable" className="size-3.5" aria-hidden="true" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>{t('chat.queuedMessage.reorderAria')}</TooltipContent>
                    </Tooltip>
                )}
            />
        </div>
    );
});

SortableQueuedMessageRow.displayName = 'SortableQueuedMessageRow';

interface QueuedMessagesStripProps {
    target: MessageQueueTarget | null;
<<<<<<< HEAD
    /** The message was taken from the queue in full; the composer restores it. */
    onEditMessage: (message: QueuedMessage) => void;
||||||| bc50ba56aa
    composerAgentName: string | null | undefined;
    /** The composer takes the message out of the queue and restores it. */
    onEditMessage: (messageId: string) => void;
=======
    composerAgentName: string | null | undefined;
    onEditMessage: (messageId: string) => void;
>>>>>>> upstream/main
    onSendMessage: (messageId: string) => void;
}

const EMPTY_QUEUE: QueuedMessage[] = [];

<<<<<<< HEAD
/**
 * Messages waiting for the running turn, as a top row of the composer next to
 * the background commands. One message is its own row; several collapse into
 * a count that expands in place into a reorderable list.
 */
export const QueuedMessagesStrip = memo(({ target, onEditMessage, onSendMessage }: QueuedMessagesStripProps) => {
||||||| bc50ba56aa
/**
 * Messages waiting for the running turn, as a top row of the composer next to
 * the background commands. One message is its own row; several collapse into
 * a count that expands in place into a reorderable list.
 */
export const QueuedMessagesStrip = memo(({ target, composerAgentName, onEditMessage, onSendMessage }: QueuedMessagesStripProps) => {
=======
export const QueuedMessagesStrip = memo(({ target, composerAgentName, onEditMessage, onSendMessage }: QueuedMessagesStripProps) => {
>>>>>>> upstream/main
    const { t } = useI18n();
    const expanded = useUIStore((state) => state.messageQueueExpanded);
    const setMessageQueueExpanded = useUIStore((state) => state.setMessageQueueExpanded);
    const listId = React.useId();
    const queueKey = target ? getMessageQueueKey(target) : null;
    const queuedMessages = useMessageQueueStore(
        React.useCallback(
            (state) => {
                if (!queueKey) return EMPTY_QUEUE;
                return state.queuedMessages[queueKey] ?? EMPTY_QUEUE;
            },
            [queueKey]
        )
    );
    const popToInput = useMessageQueueStore((state) => state.popToInput);
    const reorderQueue = useMessageQueueStore((state) => state.reorderQueue);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    );

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id || !target) return;
        reorderQueue(target, String(active.id), String(over.id));
    }, [target, reorderQueue]);

    const handleEdit = React.useCallback((message: QueuedMessage) => {
        if (!target) return;

        // The full message (attachments included) comes back from the queue's
        // owner; the row itself only knows the summary.
        void popToInput(target, message.id).then((popped) => {
            if (!popped) return;
            if (popped.attachments && popped.attachments.length > 0) {
                const currentAttachments = useInputStore.getState().attachedFiles;
                useInputStore.getState().setAttachedFiles([...currentAttachments, ...popped.attachments]);
            }
            onEditMessage(popped);
        }).catch((error) => {
            console.warn('[queue] failed to take queued message for editing:', error);
            toast.error(t('chat.queuedMessage.toast.takeFailed'));
        });
    }, [target, popToInput, onEditMessage, t]);

    const handleSend = React.useCallback((message: QueuedMessage) => {
        onSendMessage(message.id);
    }, [onSendMessage]);

    if (!target || queuedMessages.length === 0) return null;

    if (queuedMessages.length === 1) {
        return (
            <div role="group" className={cn(ROW_CLASS, 'border-b border-edge')} aria-label={t('chat.queuedMessage.title')}>
                <QueuedMessageRow
                    message={queuedMessages[0]}
                    target={target}
                    onEdit={handleEdit}
                    onSend={handleSend}
                    lead={<Icon name="time" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                />
            </div>
        );
    }

    return (
        <div role="group" className="border-b border-edge" aria-label={t('chat.queuedMessage.title')}>
            <div className="flex oc-composer-row items-center ps-3 pe-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setMessageQueueExpanded(!expanded)}
                            onMouseDown={(event) => event.preventDefault()}
                            aria-expanded={expanded}
                            aria-controls={expanded ? listId : undefined}
                            className="min-w-0 flex-1 shrink justify-start gap-2 px-0 text-sm font-normal normal-case text-muted-foreground hover:!bg-transparent hover:text-foreground has-[>svg]:px-0"
                        >
                            <Icon name="time" className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-start">
                                {t('chat.queuedMessage.title')} {queuedMessages.length}
                            </span>
                            <Icon name={expanded ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>{t(expanded ? 'contextTooltips.chat.queueHide' : 'contextTooltips.chat.queueShow')}</TooltipContent>
                </Tooltip>
            </div>
            {expanded ? (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={queuedMessages.map((m) => m.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <ScrollableOverlay id={listId} outerClassName="max-h-40" className="overscroll-contain" disableHorizontal>
                            {queuedMessages.map((message) => (
                                <SortableQueuedMessageRow
                                    key={message.id}
                                    message={message}
                                    target={target}
                                    onEdit={handleEdit}
                                    onSend={handleSend}
                                />
                            ))}
                        </ScrollableOverlay>
                    </SortableContext>
                </DndContext>
            ) : null}
        </div>
    );
});

QueuedMessagesStrip.displayName = 'QueuedMessagesStrip';
