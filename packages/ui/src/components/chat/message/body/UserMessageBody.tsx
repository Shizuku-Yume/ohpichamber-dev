import React from 'react';
import type { Part } from '@openchamber/agent-contract';
import { sessionMentionChipsOf } from '../parts/sessionMentionChips';
import UserTextPart from '../parts/UserTextPart';
import { MessageFilesDisplay } from '../../FileAttachment';
import type { ToolPopupContent, AgentMentionInfo } from '../types';
import { cn } from '@/lib/utils';
import { contextPartsPastCollapse, isEmptyTextPart, extractTextContent } from '../partUtils';
import { attachmentBasename } from '@/lib/attachmentIdentity';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { MobileSheetRow } from '@/components/ui/MobileSheetList';
import { useUIStore } from '@/stores/useUIStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useChatSurfaceMode } from '@/components/chat/useChatSurfaceMode';
import { toast } from '@/components/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/icon/Icon';
import { formatTimestampForDisplay } from '../timeFormat';
import { dispatchRowExpand } from '../../lib/scroll/timelineScrollIntent';
import { useI18n } from '@/lib/i18n';
import { delay } from '@/lib/timing/delay';
import type { MessageExtraAction } from './messageBodyProps';
import { CONTAIN_LAYOUT_STYLE } from './messageBodyStyles';
import { INLINE_TEXT_LINK_STYLE, USER_BUBBLE_TEXT_LINK_CLASS } from './userBubbleLinkStyle';

const isInStuckTurnHeader = (element: HTMLElement | null): boolean => {
    const header = element?.closest<HTMLElement>('[data-turn-sticky-header]');
    const chat = header?.closest<HTMLElement>('[data-scrollbar="chat"]');
    if (!header || !chat) return false;
    return Math.abs(header.getBoundingClientRect().top - chat.getBoundingClientRect().top) < 1;
};

export const UserMessageBody = React.memo(({
    sessionId,
    workspaceId,
    parts,
    messageCreatedAt,
    isMobile,
    alwaysShowActions = isMobile,
    hasTouchInput,
    hasTextContent,
    onCopyMessage,
    copiedMessage,
    onCopyLink,
    onSaveAsSnippet,
    onSelectMessages,
    onShowPopup,
    agentMention,
    onRevert,
    onFork,
    contextPinned,
    contextPinPending,
    onToggleContextPin,
    userMessagePart,
    userActionsMode = 'inline',
    stickyUserHeaderEnabled = true,
    extraActions,
}: {
    sessionId?: string;
    workspaceId?: string;
    parts: Part[];
    messageCreatedAt?: number | null;
    isMobile: boolean;
    alwaysShowActions?: boolean;
    hasTouchInput?: boolean;
    hasTextContent?: boolean;
    onCopyMessage?: () => void | boolean | Promise<void | boolean>;
    copiedMessage?: boolean;
    onCopyLink?: () => void;
    onSaveAsSnippet?: () => void;
    onSelectMessages?: () => void;
    onShowPopup: (content: ToolPopupContent) => void;
    agentMention?: AgentMentionInfo;
    onRevert?: () => void;
    onFork?: () => void;
    contextPinned?: boolean;
    contextPinPending?: boolean;
    onToggleContextPin?: () => void;
    userMessagePart?: 'bubble' | 'actions';
    userActionsMode?: 'inline' | 'external-content' | 'external-actions';
    stickyUserHeaderEnabled?: boolean;
    extraActions?: MessageExtraAction[];
}) => {
    const { locale, t } = useI18n();
    const chatSurfaceMode = useChatSurfaceMode();
    const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
    const [copyHintVisible, setCopyHintVisible] = React.useState(false);
    const copyHintTokenRef = React.useRef(0);

    const storeWorkspaceId = useGlobalSessionsStore(
        React.useCallback((state) => (sessionId ? state.entityById.get(sessionId)?.workspaceId : undefined), [sessionId]),
    );
    const resolvedWorkspaceId = workspaceId ?? storeWorkspaceId;

    const collapsibleUserMessages = useUIStore((state) => state.collapsibleUserMessages);
    const [messageExpandedState, setMessageExpandedState] = React.useState(false);
    const messageExpanded = collapsibleUserMessages && messageExpandedState;
    const [truncatedPartIndexes, setTruncatedPartIndexes] = React.useState<ReadonlySet<number>>(() => new Set());
    const bubbleRef = React.useRef<HTMLDivElement>(null);

    const expandMessage = React.useCallback(() => {
        const bubble = bubbleRef.current;
        if (!messageExpanded && !isInStuckTurnHeader(bubble)) dispatchRowExpand(bubble);
        setMessageExpandedState(true);
    }, [messageExpanded]);

    const toggleMessageExpanded = React.useCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        if (messageExpanded) setMessageExpandedState(false);
        else expandMessage();
    }, [expandMessage, messageExpanded]);

    const handlePartTruncationChange = React.useCallback((partIndex: number, truncated: boolean) => {
        setTruncatedPartIndexes((current) => {
            if (current.has(partIndex) === truncated) return current;
            const next = new Set(current);
            if (truncated) next.add(partIndex);
            else next.delete(partIndex);
            return next;
        });
    }, []);

    const [textLinesByPartIndex, setTextLinesByPartIndex] = React.useState<ReadonlyMap<number, number>>(() => new Map());
    const handlePartCollapsedLinesChange = React.useCallback((partIndex: number, lines: number) => {
        setTextLinesByPartIndex((current) => {
            if ((current.get(partIndex) ?? 0) === lines) return current;
            const next = new Map(current);
            if (lines > 0) next.set(partIndex, lines);
            else next.delete(partIndex);
            return next;
        });
    }, []);

    const userContentParts = React.useMemo(() => {
        return parts.filter((part) => {
            if (part.type === 'text') {
                return !isEmptyTextPart(part);
            }
            return false;
        });
    }, [parts]);

    const contextPartsToHide = React.useMemo(() => {
        let textLines = 0;
        for (const lines of textLinesByPartIndex.values()) textLines += lines;
        return contextPartsPastCollapse(userContentParts, textLines);
    }, [textLinesByPartIndex, userContentParts]);

    const hidesContextParts = collapsibleUserMessages && !messageExpanded && contextPartsToHide.size > 0;
    const showMessageExpandToggle = collapsibleUserMessages && (messageExpanded || truncatedPartIndexes.size > 0 || hidesContextParts);

    const sessionMentionChips = React.useMemo(() => sessionMentionChipsOf(parts), [parts]);
    const attachmentFilenames = React.useMemo(() => parts.flatMap((part) => (
        part.type === 'attachment' && part.name ? [attachmentBasename(part.name)] : []
    )), [parts]);

    const mentionToken = agentMention?.token;
    let mentionInjected = false;

    const canCopyMessage = Boolean(onCopyMessage);
    const isMessageCopied = Boolean(copiedMessage);
    const isTouchContext = Boolean(hasTouchInput ?? isMobile);
    const hasCopyableText = Boolean(hasTextContent);
    const effectiveCopyHintVisible = hasCopyableText && copyHintVisible;
    const showUserContent = userMessagePart ? userMessagePart !== 'actions' : userActionsMode !== 'external-actions';
    const showUserActions = userMessagePart ? userMessagePart !== 'bubble' : userActionsMode !== 'external-content';
    const useStickyScrollableUserContent = stickyUserHeaderEnabled && userActionsMode === 'inline' && !userMessagePart;

    const revealCopyHint = React.useCallback(() => {
        if (!isTouchContext || !canCopyMessage || !hasCopyableText) {
            return;
        }
        const token = ++copyHintTokenRef.current;
        setCopyHintVisible(true);
        void delay(1800).then(() => {
            if (copyHintTokenRef.current === token) {
                setCopyHintVisible(false);
            }
        });
    }, [canCopyMessage, hasCopyableText, isTouchContext]);

    const handleCopyButtonClick = React.useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            if (!onCopyMessage || !hasCopyableText) {
                return;
            }
            event.stopPropagation();
            event.preventDefault();
            void onCopyMessage();
            if (isTouchContext) {
                revealCopyHint();
            }
        },
        [hasCopyableText, isTouchContext, onCopyMessage, revealCopyHint]
    );

    const effectiveOnFork = chatSurfaceMode === 'mini-chat' ? undefined : onFork;
    const [userActionSheetOpen, setUserActionSheetOpen] = React.useState(false);

    const userSheetActions = React.useMemo(() => {
        const actions: Array<{ id: string; label: string; icon: React.ReactNode; disabled?: boolean; onSelect: () => void }> = [];
        if (canCopyMessage && hasCopyableText && onCopyMessage) {
            actions.push({
                id: 'copy',
                label: t('chat.messageBody.actions.copyMessage'),
                icon: <Icon name="file-copy" className="h-4 w-4" />,
                onSelect: () => {
                    void (async () => {
                        const copied = await onCopyMessage();
                        if (copied !== false) toast.success(t('chat.messageBody.toast.copied'));
                    })();
                },
            });
        }
        if (onCopyLink) {
            actions.push({
                id: 'copy-link',
                label: t('chat.messageBody.actions.copyLink'),
                icon: <Icon name="link" className="h-4 w-4" />,
                onSelect: onCopyLink,
            });
        }
        if (onSaveAsSnippet && hasCopyableText) {
            actions.push({
                id: 'save-as-snippet',
                label: t('snippets.quickCreate.action'),
                icon: <Icon name="file-code" className="h-4 w-4" />,
                onSelect: onSaveAsSnippet,
            });
        }
        if (onSelectMessages && hasCopyableText) {
            actions.push({
                id: 'select-messages',
                label: t('chat.messageSelection.action'),
                icon: <Icon name="checkbox-multiple" className="h-4 w-4" />,
                onSelect: onSelectMessages,
            });
        }
        if (onToggleContextPin && hasCopyableText) {
            actions.push({
                id: 'pin-context',
                label: t(contextPinned ? 'chat.messageBody.actions.unpinContext' : 'chat.messageBody.actions.pinContext'),
                icon: <Icon name={contextPinned ? 'pushpin-2-fill' : 'pushpin-2'} className="h-4 w-4" />,
                disabled: contextPinPending,
                onSelect: () => { onToggleContextPin(); },
            });
        }
        if (effectiveOnFork) {
            actions.push({
                id: 'fork',
                label: t('chat.messageBody.actions.fork'),
                icon: <Icon name="git-branch" className="h-4 w-4" />,
                onSelect: () => { effectiveOnFork(); },
            });
        }
        if (onRevert) {
            actions.push({
                id: 'revert',
                label: t('chat.messageBody.actions.revert'),
                icon: <Icon name="arrow-go-back" className="h-4 w-4" />,
                onSelect: () => { onRevert(); },
            });
        }
        for (const extra of extraActions ?? []) {
            actions.push({ id: extra.id, label: extra.label, icon: extra.icon, onSelect: extra.onSelect });
        }
        return actions;
    }, [canCopyMessage, contextPinPending, contextPinned, effectiveOnFork, extraActions, hasCopyableText, onCopyLink, onCopyMessage, onRevert, onSaveAsSnippet, onSelectMessages, onToggleContextPin, t]);

    const userMenuActions = userSheetActions.filter((action) => action.id !== 'copy' && action.id !== 'revert');

    const timestamp = React.useMemo(() => {
        void locale;
        if (messageCreatedAt === undefined || messageCreatedAt === null || messageCreatedAt <= 0) return null;
        const formatted = formatTimestampForDisplay(messageCreatedAt, timeFormatPreference);
        return formatted.length > 0 ? formatted : null;
    }, [locale, messageCreatedAt, timeFormatPreference]);

    const hasExtraActions = Boolean(extraActions && extraActions.length > 0);
    const actionsBlock = chatSurfaceMode !== 'peek' && ((canCopyMessage && hasCopyableText) || onCopyLink || onRevert || effectiveOnFork || onToggleContextPin || hasExtraActions) && showUserActions ? (
        <div
            data-user-message-actions=""
            className={cn(
                'group/user-actions',
                userMessagePart
                    ? cn('flex items-start justify-end', isMobile ? 'h-11 pt-0 in-data-[turn-sticky-header]:h-9' : 'h-8 pt-2')
                    : isMobile
                        ? userActionsMode === 'inline'
                            ? 'flex items-center justify-end pt-2 pb-3'
                            : stickyUserHeaderEnabled
                                ? 'flex h-9 items-start justify-end pt-0'
                                : 'flex h-11 items-start justify-end pt-0'
                        : userActionsMode === 'inline'
                            ? 'absolute top-full left-0 right-0 z-10 pt-5'
                            : 'flex h-8 items-start justify-end pt-2'
            )}
        >
            <div
                className={cn(
                    'flex items-center justify-end gap-1.5 [&_button]:!h-[26px] [&_button]:!w-[26px] [&_svg]:!size-[13px]',
                    !userMessagePart && userActionsMode === 'inline' ? 'translate-x-5' : 'translate-x-0',
                    alwaysShowActions
                        ? 'pointer-events-auto opacity-100'
                        : 'pointer-events-none opacity-0 transition-opacity duration-150 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-hover/user-actions:pointer-events-auto group-hover/user-actions:opacity-100 group-hover/user-shell:pointer-events-auto group-hover/user-shell:opacity-100 has-[[data-popup-open]]:pointer-events-auto has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100'
                )}
            >
                {timestamp && !alwaysShowActions ? (
                    <span
                        className="me-1 flex items-center gap-1 typography-meta tabular-nums text-muted-foreground"
                        aria-label={`Message time: ${timestamp}`}
                    >
                        <Icon name="time" className="h-3.5 w-3.5" />
                        <span>{timestamp}</span>
                    </span>
                ) : null}
                {alwaysShowActions ? (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={t('chat.messageBody.actions.moreActions')}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                setUserActionSheetOpen(true);
                            }}
                        >
                            <Icon name="more" className="h-3.5 w-3.5" />
                        </Button>
                        <MobileOverlayPanel
                            open={userActionSheetOpen}
                            onClose={() => setUserActionSheetOpen(false)}
                            title={t('chat.messageBody.actions.moreActions')}
                        >
                            {timestamp ? (
                                <div className="mb-1 flex items-center gap-2.5 border-b border-edge-muted px-2 pb-2 typography-meta text-muted-foreground">
                                    <Icon name="time" className="size-4" />
                                    <span>{timestamp}</span>
                                </div>
                            ) : null}
                            {userSheetActions.map((action) => (
                                <MobileSheetRow
                                    key={action.id}
                                    disabled={action.disabled}
                                    leading={<span className="flex size-4 flex-shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">{action.icon}</span>}
                                    onClick={() => {
                                        setUserActionSheetOpen(false);
                                        action.onSelect();
                                    }}
                                >
                                    {action.label}
                                </MobileSheetRow>
                            ))}
                        </MobileOverlayPanel>
                    </>
                ) : (
                    <>
                        {onRevert && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={t('chat.messageBody.actions.revertAria')}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onRevert();
                                        }}
                                    >
                                        <Icon name="arrow-go-back" className="h-3 w-3" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>{t('chat.messageBody.actions.revert')}</TooltipContent>
                            </Tooltip>
                        )}
                        {canCopyMessage && hasCopyableText && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        data-visible={effectiveCopyHintVisible || isMessageCopied ? 'true' : undefined}
                                        className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={t('chat.messageBody.actions.copyMessageAria')}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={handleCopyButtonClick}
                                        onFocus={() => setCopyHintVisible(true)}
                                        onBlur={() => {
                                            if (!isMessageCopied) {
                                                setCopyHintVisible(false);
                                            }
                                        }}
                                    >
                                        {isMessageCopied ? (
                                            <Icon name="check" className="h-3 w-3 text-[color:var(--status-success)]" />
                                        ) : (
                                            <Icon name="file-copy" className="h-3 w-3" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>{t('chat.messageBody.actions.copyMessage')}</TooltipContent>
                            </Tooltip>
                        )}
                        {userMenuActions.length > 0 ? (
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                                                aria-label={t('chat.messageBody.actions.moreActions')}
                                                onPointerDown={(event) => event.stopPropagation()}
                                            >
                                                <Icon name="more" className="h-3 w-3" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={6}>{t('chat.messageBody.actions.moreActions')}</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="end" onPointerDown={(event) => event.stopPropagation()}>
                                    {userMenuActions.map((action) => (
                                        <DropdownMenuItem
                                            key={action.id}
                                            className="typography-meta"
                                            disabled={action.disabled}
                                            onSelect={() => action.onSelect()}
                                        >
                                            <span className="flex size-4 shrink-0 items-center justify-center">{action.icon}</span>
                                            {action.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    ) : null;

    if (!showUserContent) {
        return <>{actionsBlock}</>;
    }

    return (
        <div
            ref={bubbleRef}
            className="relative w-full group/message"
            style={CONTAIN_LAYOUT_STYLE}
            onTouchStart={isTouchContext && canCopyMessage && hasCopyableText ? revealCopyHint : undefined}
        >
            <MessageFilesDisplay
                workspaceId={resolvedWorkspaceId}
                files={parts}
                onShowPopup={onShowPopup}
                compact
                className={userContentParts.length > 0 ? 'mb-2' : 'mt-0'}
            />
            <div
                className={cn(
                    'leading-relaxed text-foreground/90 text-base overflow-hidden scrollbar-none',
                    userMessagePart
                        ? 'in-data-[turn-sticky-header]:max-h-[40dvh] in-data-[turn-sticky-header]:overflow-y-auto in-data-[turn-sticky-header]:overscroll-contain'
                        : useStickyScrollableUserContent
                            ? 'overflow-y-auto overscroll-contain'
                            : 'overflow-y-hidden'
                )}
                style={useStickyScrollableUserContent ? { maxHeight: 'calc(var(--chat-scroll-height, 100dvh) * 0.4)' } : undefined}
            >
                {userContentParts.map((part, index) => {
                    if (hidesContextParts && contextPartsToHide.has(part)) return null;
                    let mentionForPart: AgentMentionInfo | undefined;
                    if (agentMention && mentionToken && !mentionInjected) {
                        const candidateText = extractTextContent(part);
                        if (candidateText.includes(mentionToken)) {
                            mentionForPart = agentMention;
                            mentionInjected = true;
                        }
                    }
                    return (
                        <React.Fragment key={`user-text-${index}`}>
                            <UserTextPart
                                part={part}
                                isMobile={isMobile}
                                agentMention={mentionForPart}
                                messageExpanded={messageExpanded}
                                onExpandMessage={expandMessage}
                                partIndex={index}
                                onTruncationChange={handlePartTruncationChange}
                                onCollapsedLinesChange={handlePartCollapsedLinesChange}
                                attachmentFilenames={attachmentFilenames}
                                onShowPopup={onShowPopup}
                                sessionMentionChips={sessionMentionChips}
                            />
                        </React.Fragment>
                    );
                })}
            </div>
            {showMessageExpandToggle && (
                <div className="mt-1 flex min-w-0 items-center justify-end gap-1.5 typography-micro text-muted-foreground">
                    <button
                        type="button"
                        onClick={toggleMessageExpanded}
                        className={cn('shrink-0', USER_BUBBLE_TEXT_LINK_CLASS)}
                        style={INLINE_TEXT_LINK_STYLE}
                        aria-expanded={messageExpanded}
                    >
                        {t(messageExpanded ? 'chat.message.userText.showLess' : 'chat.message.userText.showMore')}
                    </button>
                </div>
            )}
            {!userMessagePart ? actionsBlock : null}
        </div>
    );
});
