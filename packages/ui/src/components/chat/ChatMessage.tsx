import { MessageSliceContext } from "./message/messageSliceContext";
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMessageEntry, TurnGroupingContext } from './lib/turns/types';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { cn } from '@/lib/utils';
import { useChatSurfaceMode } from './useChatSurfaceMode';

import MessageBody, { type MessageExtraAction } from './message/MessageBody';
import { GuestIcon } from '@/components/layout/GuestRailIcon';
import { useGuestActions } from '@/hooks/useGuestSurfaces';
import { buildGuestMessageItem, guestMessageActionsFor } from '@/lib/guests/actions';
import { runGuestAction } from '@/lib/guests/run-action';
import type { StreamPhase, ToolPopupContent } from './message/types';
import { filterVisibleParts, normalizeParts } from './message/partUtils';
import { isHiddenUserMessage } from './message/hiddenUserMessage';
import { flattenAssistantTextParts, flattenUserTextParts } from '@/lib/messages/messageText';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import { copyMarkdownToClipboard, copyTextToClipboard } from '@/lib/clipboard';
import { FadeInOnReveal } from './message/FadeInOnReveal';
import { streamPerfCount } from '@/stores/utils/streamDebug';
import { areOptionalRenderRelevantMessagesEqual, areRenderRelevantMessagesEqual, areRelevantTurnGroupingContextsEqual } from './message/renderCompare';
import type { ReviewTransferDirection } from '@/lib/reviewFlow';
import { toast } from '@/components/ui';
import { useCopyMessageLink } from './message/useCopyMessageLink';
import { useI18n } from '@/lib/i18n';
import { getContextObligatoryMessages } from '@/lib/contextObligatoryMessages';
import { setContextObligatoryMessage } from '@/sync/session-actions';
import { useChatColumnActions } from './chatColumnSession';
<<<<<<< HEAD
import { problemMessage } from '@/lib/problemMessage';
||||||| bc50ba56aa
=======
import { MessageSelectionMark } from './messageSelection/MessageSelectionMark';
import { MESSAGE_SELECT_UNIT_ATTRIBUTE } from './messageSelection/useMessageSelectionClicks';
import { useMessageSelectionEntry } from './messageSelection/useMessageSelectionEntry';
>>>>>>> upstream/main

const ToolOutputDialog = lazyWithChunkRecovery(() => import('./message/ToolOutputDialog'));

const EXPANDED_TOOLS_CACHE_MAX = 4000;
const expandedToolsStateCache = new Map<string, Set<string>>();

const readExpandedToolsCache = (messageId: string): Set<string> => {
    const cached = expandedToolsStateCache.get(messageId);
    return cached ? new Set(cached) : new Set();
};

const writeExpandedToolsCache = (messageId: string, value: Set<string>): void => {
    if (expandedToolsStateCache.size >= EXPANDED_TOOLS_CACHE_MAX && !expandedToolsStateCache.has(messageId)) {
        const oldest = expandedToolsStateCache.keys().next().value;
        if (oldest !== undefined) {
            expandedToolsStateCache.delete(oldest);
        }
    }
    expandedToolsStateCache.set(messageId, new Set(value));
};


function useStickyDisplayValue<T>(value: T | null | undefined): T | null | undefined {
    const [stickyValue, setStickyValue] = React.useState<T | null | undefined>(value);

    React.useEffect(() => {
        if (value !== undefined && value !== null) {
            setStickyValue(value);
        }
    }, [value]);

    return value ?? stickyValue;
}

<<<<<<< HEAD
||||||| bc50ba56aa
// Assistant text goes to the clipboard as Markdown with its rendered HTML,
// or as the plain text the reader sees when the user asked for that.
const copyAssistantText = async (text: string) => {
    const { renderMarkdownForExport } = await import('./markdown/renderMarkdownForExport');
    const root = await renderMarkdownForExport(text, { purpose: 'copy' });
    const plainText = useUIStore.getState().copyMessagesAsPlainText
        ? (await import('./markdown/selectionMarkdown')).serializeRenderedMarkdown(root, 'plain')
        : undefined;
    return copyMarkdownToClipboard(text, root.innerHTML, { plainText });
};

const getMessageInfoProp = (info: unknown, key: string): unknown => {
    if (typeof info === 'object' && info !== null) {
        return (info as Record<string, unknown>)[key];
    }
    return undefined;
};

=======
const copyAssistantText = async (text: string) => {
    const { renderMarkdownForExport } = await import('./markdown/renderMarkdownForExport');
    const root = await renderMarkdownForExport(text, { purpose: 'copy' });
    const plainText = useUIStore.getState().copyMessagesAsPlainText
        ? (await import('./markdown/selectionMarkdown')).serializeRenderedMarkdown(root, 'plain')
        : undefined;
    return copyMarkdownToClipboard(text, root.innerHTML, { plainText });
};

const getMessageInfoProp = (info: unknown, key: string): unknown => {
    if (typeof info === 'object' && info !== null) {
        return (info as Record<string, unknown>)[key];
    }
    return undefined;
};

>>>>>>> upstream/main
interface ChatMessageProps {
    message: ChatMessageEntry;
    previousMessage?: ChatMessageEntry;
    nextMessage?: ChatMessageEntry;
    turnGroupingContext?: TurnGroupingContext;
    assistantHeaderMessageId?: string;
    isInActiveTurn?: boolean;
    activeStreamingPhase?: StreamPhase | null;
    animateUserOnMount?: boolean;
    onUserAnimationConsumed?: (messageId: string) => void;
    reviewTransferDirection?: ReviewTransferDirection | null;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    previousMessage,
    nextMessage,
    turnGroupingContext,
    assistantHeaderMessageId,
    isInActiveTurn = false,
    activeStreamingPhase = null,
    animateUserOnMount = false,
    onUserAnimationConsumed,
    reviewTransferDirection = null,
}) => {
    const { t } = useI18n();
    const { isMobile, isTablet, hasTouchInput } = useDeviceInfo();
    const alwaysShowMessageActions = isMobile || isTablet;
    const { currentTheme } = useThemeSystem();
    const messageContainerRef = React.useRef<HTMLDivElement | null>(null);
<<<<<<< HEAD
||||||| bc50ba56aa
    // A long answer's later rows draw the rest of this message; they carry its
    // id for search and quotes, and name their slice so navigation and the
    // message's anchor id stay on its first row.
    const slice = React.useContext(MessageSliceContext);
    const sliceName = slice?.from ? `${slice.from.partId}:${slice.from.offset}` : undefined;

    const getAgentModelForSession = useSelectionStore((s) => s.getAgentModelForSession);
    const getSessionModelSelection = useSelectionStore((s) => s.getSessionModelSelection);
=======
    const slice = React.useContext(MessageSliceContext);
    const sliceName = slice?.from ? `${slice.from.partId}:${slice.from.offset}` : undefined;

    const getAgentModelForSession = useSelectionStore((s) => s.getAgentModelForSession);
    const getSessionModelSelection = useSelectionStore((s) => s.getSessionModelSelection);
>>>>>>> upstream/main

    streamPerfCount('ui.chat_message.render');
    if (isInActiveTurn) {
        streamPerfCount('ui.chat_message.render.streaming');
    }

    const providers = useConfigStore((state) => state.providers);
    const { showReasoningTraces, stickyUserHeader, chatRenderMode } = useUIStore(
        useShallow((state) => ({
            showReasoningTraces: state.showReasoningTraces,
            stickyUserHeader: state.stickyUserHeader,
            chatRenderMode: state.chatRenderMode,
        }))
    );

    const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
    const [copiedMessage, setCopiedMessage] = React.useState(false);
    const handleCopyLink = useCopyMessageLink(message.sessionId, message.messageId);
    const slice = React.useContext(MessageSliceContext);
    const sliceName = slice?.from ? `${slice.from.partId}:${slice.from.offset}` : undefined;

    const [expandedTools, setExpandedTools] = React.useState<Set<string>>(() => readExpandedToolsCache(message.messageId));
    const [popupContent, setPopupContent] = React.useState<ToolPopupContent>({
        open: false,
        title: '',
        content: '',
    });

    React.useEffect(() => {
        setExpandedTools(readExpandedToolsCache(message.messageId));
    }, [message.messageId]);

    const isUser = message.role === 'user';
    const chatSurfaceMode = useChatSurfaceMode();
    const useExternalUserActionsRow = isUser && (isMobile || !stickyUserHeader);
    const showStickyInlineHoverRow = isUser && !isMobile && stickyUserHeader && !useExternalUserActionsRow;

    const sessionId = message.sessionId;

<<<<<<< HEAD
    const visibleParts = React.useMemo(
        () => filterVisibleParts(normalizeParts(message.parts), { includeReasoning: showReasoningTraces }),
        [message.parts, showReasoningTraces]
||||||| bc50ba56aa
    // Keep non-active-turn rows detached from context-store churn.
    const { currentContextAgent, savedSessionAgentSelection } = useContextStore(
        useShallow((state) => ({
            currentContextAgent: isInActiveTurn && sessionId ? state.currentAgentContext.get(sessionId) : undefined,
            savedSessionAgentSelection: isInActiveTurn && sessionId ? state.sessionAgentSelections.get(sessionId) : undefined,
        }))
=======
    const { currentContextAgent, savedSessionAgentSelection } = useContextStore(
        useShallow((state) => ({
            currentContextAgent: isInActiveTurn && sessionId ? state.currentAgentContext.get(sessionId) : undefined,
            savedSessionAgentSelection: isInActiveTurn && sessionId ? state.sessionAgentSelections.get(sessionId) : undefined,
        }))
>>>>>>> upstream/main
    );

<<<<<<< HEAD
    // Canonical assistant messages carry no completion timestamp. The authoritative
    // owner of activity is the streaming store: the message the session reports as
    // streaming is the only incomplete one; everything else has settled.
    const isMessageCompleted = isUser ? true : !isInActiveTurn;

    const displayParts = React.useMemo(() => {
        if (isUser) {
            return visibleParts;
||||||| bc50ba56aa
    // Change-request chips are labelled by their provider; the lookup changes when the list lands.
    const descriptorOf = useSourceControlDescriptorOf();
    const normalizedParts = React.useMemo(() => {
        const safeParts = normalizeParts(message.parts);
        if (!isUser) {
            return safeParts;
=======
    const descriptorOf = useSourceControlDescriptorOf();
    const normalizedParts = React.useMemo(() => {
        const safeParts = normalizeParts(message.parts);
        if (!isUser) {
            return safeParts;
>>>>>>> upstream/main
        }

<<<<<<< HEAD
        if (!isMessageCompleted && chatRenderMode === 'sorted') {
            return [];
||||||| bc50ba56aa
        return normalizeUserDisplayParts(safeParts, descriptorOf);
    }, [descriptorOf, isUser, message.parts]);

    const agentName = React.useMemo(() => {
        if (isUser) return undefined;

        // v2 records the agent on the assistant message itself; the session
        // selection is only a fallback for a message that predates it.
        if (message.info.role === 'assistant') {
            const messageAgent = message.info.agent.trim();
            if (messageAgent) return messageAgent;
=======
        return normalizeUserDisplayParts(safeParts, descriptorOf);
    }, [descriptorOf, isUser, message.parts]);

    const agentName = React.useMemo(() => {
        if (isUser) return undefined;

        if (message.info.role === 'assistant') {
            const messageAgent = message.info.agent.trim();
            if (messageAgent) return messageAgent;
>>>>>>> upstream/main
        }

        return visibleParts;
    }, [chatRenderMode, isMessageCompleted, isUser, visibleParts]);


    const footerProviderID = isUser ? null : (message.providerId ?? null);
    const footerModelName = React.useMemo(() => {
        if (isUser || !message.modelId) return undefined;
        const provider = message.providerId ? providers.find((candidate) => candidate.providerId === message.providerId) : undefined;
        const model = provider?.models.find((candidate) => candidate.modelId === message.modelId);
        return model?.name.trim() || message.modelId;
    }, [isUser, message.modelId, message.providerId, providers]);

<<<<<<< HEAD
    const displayProviderIDValue = useStickyDisplayValue<string>(footerProviderID ?? undefined);
    const displayModelName = useStickyDisplayValue<string>(footerModelName);
||||||| bc50ba56aa
    const messageProviderID = message.info.role === 'assistant' ? message.info.providerID : null;
    const messageModelID = message.info.role === 'assistant' ? message.info.modelID : null;

    const contextModelSelection = React.useMemo(() => {
        if (isUser || !sessionId) return null;

        if (agentName) {
            const agentSelection = getAgentModelForSession(sessionId, agentName);
            if (agentSelection?.providerId && agentSelection?.modelId) {
                return agentSelection;
            }
        }

        const sessionSelection = getSessionModelSelection(sessionId);
        if (sessionSelection?.providerId && sessionSelection?.modelId) {
            return sessionSelection;
        }

        return null;
    }, [isUser, sessionId, agentName, getAgentModelForSession, getSessionModelSelection]);

    const providerID = React.useMemo(() => {
        if (isUser) return null;
        return messageProviderID?.trim() || contextModelSelection?.providerId || null;
    }, [isUser, messageProviderID, contextModelSelection]);

    const modelID = React.useMemo(() => {
        if (isUser) return null;
        return messageModelID?.trim() || contextModelSelection?.modelId || null;
    }, [isUser, messageModelID, contextModelSelection]);

    const modelName = React.useMemo(() => {
        if (isUser) return undefined;

        const provider = providerID && providers.length > 0
            ? providers.find((p) => p.id === providerID)
            : undefined;
        return getProviderModelDisplayName(provider, modelID) || undefined;
    }, [isUser, providerID, modelID, providers]);

    const modelHasVariants = React.useMemo(() => {
        if (isUser) return false;
        if (!providerID || !modelID) return false;

        // v2 lists variants as records, not as a keyed map.
        const model = findCatalogModel(providers.find((provider) => provider.id === providerID)?.models, modelID);
        return modelVariantNames(model).length > 0;
    }, [isUser, modelID, providerID, providers]);

    const displayAgentName = useStickyDisplayValue<string>(agentName);
    const displayProviderIDValue = useStickyDisplayValue<string>(providerID ?? undefined);
    const displayModelName = useStickyDisplayValue<string>(modelName);

    const headerAgentName = displayAgentName ?? undefined;
=======
    const messageProviderID = message.info.role === 'assistant' ? message.info.providerID : null;
    const messageModelID = message.info.role === 'assistant' ? message.info.modelID : null;

    const contextModelSelection = React.useMemo(() => {
        if (isUser || !sessionId) return null;

        if (agentName) {
            const agentSelection = getAgentModelForSession(sessionId, agentName);
            if (agentSelection?.providerId && agentSelection?.modelId) {
                return agentSelection;
            }
        }

        const sessionSelection = getSessionModelSelection(sessionId);
        if (sessionSelection?.providerId && sessionSelection?.modelId) {
            return sessionSelection;
        }

        return null;
    }, [isUser, sessionId, agentName, getAgentModelForSession, getSessionModelSelection]);

    const providerID = React.useMemo(() => {
        if (isUser) return null;
        return messageProviderID?.trim() || contextModelSelection?.providerId || null;
    }, [isUser, messageProviderID, contextModelSelection]);

    const modelID = React.useMemo(() => {
        if (isUser) return null;
        return messageModelID?.trim() || contextModelSelection?.modelId || null;
    }, [isUser, messageModelID, contextModelSelection]);

    const modelName = React.useMemo(() => {
        if (isUser) return undefined;

        const provider = providerID && providers.length > 0
            ? providers.find((p) => p.id === providerID)
            : undefined;
        return getProviderModelDisplayName(provider, modelID) || undefined;
    }, [isUser, providerID, modelID, providers]);

    const modelHasVariants = React.useMemo(() => {
        if (isUser) return false;
        if (!providerID || !modelID) return false;

        const model = findCatalogModel(providers.find((provider) => provider.id === providerID)?.models, modelID);
        return modelVariantNames(model).length > 0;
    }, [isUser, modelID, providerID, providers]);

    const displayAgentName = useStickyDisplayValue<string>(agentName);
    const displayProviderIDValue = useStickyDisplayValue<string>(providerID ?? undefined);
    const displayModelName = useStickyDisplayValue<string>(modelName);

    const headerAgentName = displayAgentName ?? undefined;
>>>>>>> upstream/main
    const headerProviderID = displayProviderIDValue ?? null;
    const headerModelName = displayModelName ?? undefined;

    const messageCreatedAt = message.createdAt;
    const { focusInput: focusColumnInput } = useChatColumnActions();

    const isPinnedIntoContext = useGlobalSessionsStore((state) => {
        const session = state.entityById.get(sessionId);
        return getContextObligatoryMessages(session).some((entry) => entry.id === message.messageId);
    });
    const [pinPending, setPinPending] = React.useState(false);
    const handleToggleContextPin = React.useCallback(async () => {
        if (!sessionId || !messageCreatedAt || pinPending || message.role === 'system') return;
        setPinPending(true);
        try {
            const directory = useSessionUIStore.getState().getDirectoryForSession(sessionId);
            await setContextObligatoryMessage(sessionId, directory, {
                id: message.messageId,
                createdAt: messageCreatedAt,
                role: isUser ? 'user' : 'assistant',
            }, !isPinnedIntoContext);
<<<<<<< HEAD
            // Return focus to the composer so the user can keep typing right
            // after adding the message to context.
||||||| bc50ba56aa
            // Return focus to the composer so the user can keep typing right
            // after adding the message to context (matches the refocus pattern
            // used by the model/agent selectors).
=======
>>>>>>> upstream/main
            requestAnimationFrame(focusColumnInput);
        } catch (error) {
            console.error('[chat-message] failed to update context pin', error);
            toast.error(problemMessage(error, t('chat.messageBody.actions.contextPinFailed')));
        } finally {
            setPinPending(false);
        }
    }, [focusColumnInput, isPinnedIntoContext, isUser, message.messageId, message.role, messageCreatedAt, pinPending, sessionId, t]);

    const themeVariant = currentTheme?.metadata.variant;
    const isDarkTheme = React.useMemo(() => {
        if (themeVariant) {
            return themeVariant === 'dark';
        }
        return document.documentElement.classList.contains('dark');
    }, [themeVariant]);

    const nextRole = nextMessage?.role ?? null;

    const hasTurnGrouping = Boolean(turnGroupingContext);
    const isLastAssistantInTurn = turnGroupingContext?.isLastAssistantInTurn ?? false;

    const previousIsHiddenUserMessage = React.useMemo(
        () => !isUser && isHiddenUserMessage(previousMessage),
        [isUser, previousMessage]
    );

    const nextIsHiddenUserMessage = React.useMemo(
        () => !isUser && isHiddenUserMessage(nextMessage),
        [isUser, nextMessage]
    );

    const isFollowedByAssistant = React.useMemo(() => {
        if (isUser) return false;
        if (hasTurnGrouping) {
            return !isLastAssistantInTurn;
        }
        return nextRole === 'assistant';
    }, [hasTurnGrouping, isLastAssistantInTurn, isUser, nextRole]);

    const streamPhase: StreamPhase = React.useMemo(() => {
        if (isMessageCompleted) {
            return 'completed';
        }
        if (isInActiveTurn) {
            return activeStreamingPhase ?? 'streaming';
        }
        return 'completed';
    }, [activeStreamingPhase, isInActiveTurn, isMessageCompleted]);

    React.useEffect(() => {
        if (!isUser || !animateUserOnMount) {
            return;
        }
        onUserAnimationConsumed?.(message.messageId);
    }, [animateUserOnMount, isUser, message.messageId, onUserAnimationConsumed]);

    const shouldShowHeader = React.useMemo(() => {
        if (isUser) return true;
<<<<<<< HEAD
||||||| bc50ba56aa

        // Use turn grouping context if available for more precise control
=======

>>>>>>> upstream/main
        const headerMessageId = assistantHeaderMessageId ?? turnGroupingContext?.headerMessageId;
        if (headerMessageId) {
<<<<<<< HEAD
            return message.messageId === headerMessageId;
||||||| bc50ba56aa
            // For turn grouping: only show header for the first assistant message in the turn
            const isFirstAssistantInTurn = message.info.id === headerMessageId;

            if (isFirstAssistantInTurn) {
                // For completed messages, always show header (historical messages)
                if (streamPhase === 'completed') {
                    return true;
                }

                // For streaming messages: show header when streaming starts and keep it visible
                const isCurrentlyStreaming = streamPhase === 'streaming' || streamPhase === 'cooldown';
                return hasStartedStreamingHeader || isCurrentlyStreaming;
            }

            // For non-first assistant messages, don't show header
            return false;
=======
            const isFirstAssistantInTurn = message.info.id === headerMessageId;

            if (isFirstAssistantInTurn) {
                if (streamPhase === 'completed') {
                    return true;
                }

                const isCurrentlyStreaming = streamPhase === 'streaming' || streamPhase === 'cooldown';
                return hasStartedStreamingHeader || isCurrentlyStreaming;
            }

            return false;
>>>>>>> upstream/main
        }
<<<<<<< HEAD
||||||| bc50ba56aa

        // Ungrouped fallback path: always show assistant header.
=======

>>>>>>> upstream/main
        return true;
    }, [assistantHeaderMessageId, isUser, message.messageId, turnGroupingContext?.headerMessageId]);

    const handleCopyCode = React.useCallback((code: string) => {
        void copyTextToClipboard(code).then((result) => {
            if (!result.ok) {
                return;
            }
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        });
    }, []);

<<<<<<< HEAD
||||||| bc50ba56aa
    // v2 keeps the variant on the assistant message that ran with it. Fall
    // back to the turn's first assistant step so every row of a turn shows the
    // same label, including one that arrived before the variant was recorded.
    const headerVariantRaw = !isUser
        ? ((message.info.role === 'assistant' ? message.info.variant?.trim() : undefined) || turnGroupingContext?.assistantVariant)
        : undefined;

    const headerVariant = !isUser && modelHasVariants ? (headerVariantRaw ?? 'Default') : undefined;

    // Summary body removed — flat rendering means text is always inline.

    const assistantError = React.useMemo(() => {
        if (isUser) {
            return undefined;
        }
        // A step whose stream broke off (the provider dropped its connection)
        // is recorded as failed, and OpenCode carries the turn on in the next
        // step. The turn did not fail, so the step's error is not shown.
        if (isFollowedByAssistant) {
            return undefined;
        }
        return assistantErrorNotice(message.info);
    }, [isFollowedByAssistant, isUser, message.info]);

    const assistantErrorText = assistantError?.text;
    // The provider's raw response behind the error, offered as expandable details.
    const assistantErrorResponseBody = assistantErrorText && message.info.role === 'assistant'
        ? message.info.error?.response?.body.trim() || undefined
        : undefined;

=======
    const headerVariantRaw = !isUser
        ? ((message.info.role === 'assistant' ? message.info.variant?.trim() : undefined) || turnGroupingContext?.assistantVariant)
        : undefined;

    const headerVariant = !isUser && modelHasVariants ? (headerVariantRaw ?? 'Default') : undefined;


    const assistantError = React.useMemo(() => {
        if (isUser) {
            return undefined;
        }
        if (isFollowedByAssistant) {
            return undefined;
        }
        return assistantErrorNotice(message.info);
    }, [isFollowedByAssistant, isUser, message.info]);

    const assistantErrorText = assistantError?.text;
    const assistantErrorResponseBody = assistantErrorText && message.info.role === 'assistant'
        ? message.info.error?.response?.body.trim() || undefined
        : undefined;

>>>>>>> upstream/main
    const messageTextContent = React.useMemo(() => {
        if (isUser) {
            return flattenUserTextParts(displayParts);
        }
        return flattenAssistantTextParts(displayParts);
    }, [displayParts, isUser]);

    const hasTextContent = messageTextContent.length > 0;

<<<<<<< HEAD
||||||| bc50ba56aa
    // The turn footer copies the whole reply: what the earlier steps of the
    // turn wrote before their tool calls, then this message.
    const earlierAssistantText = isUser ? undefined : turnGroupingContext?.earlierAssistantText;

=======
    const earlierAssistantText = isUser ? undefined : turnGroupingContext?.earlierAssistantText;

>>>>>>> upstream/main
    const handleCopyMessage = React.useCallback(async () => {
        let result;
        if (isUser) {
            result = await copyTextToClipboard(messageTextContent);
        } else {
            const { renderMarkdownForExport } = await import('./markdown/renderMarkdownForExport');
            const root = await renderMarkdownForExport(messageTextContent, { purpose: 'copy' });
            const plainText = useUIStore.getState().copyMessagesAsPlainText
                ? (await import('./markdown/selectionMarkdown')).serializeRenderedMarkdown(root, 'plain')
                : undefined;
            result = await copyMarkdownToClipboard(messageTextContent, root.innerHTML, { plainText });
        }
        if (!result.ok) {
            return false;
        }
        if (isUser) {
            setCopiedMessage(true);
            setTimeout(() => setCopiedMessage(false), 2000);
        }
        return true;
    }, [isUser, messageTextContent]);

    const handleRevert = React.useCallback(() => {
        if (!sessionId || !message.messageId) return;
        void useSessionUIStore.getState().revertToMessage(sessionId, message.messageId);
    }, [sessionId, message.messageId]);

    const guestActionEntries = useGuestActions();
    const messageRecordRef = React.useRef(message);
    messageRecordRef.current = message;
    const guestMessageActions = React.useMemo<MessageExtraAction[] | undefined>(() => {
        if (guestActionEntries.length === 0 || !sessionId) return undefined;
        const entries = guestMessageActionsFor(guestActionEntries, isUser ? 'user' : 'assistant');
        if (entries.length === 0) return undefined;
        return entries.map((entry) => ({
            id: `guest:${entry.guest.id}:${entry.action.id}`,
            label: entry.action.label,
            icon: <GuestIcon icon={entry.icon} iconSrc={entry.iconSrc} className="size-3.5" />,
            onSelect: () => {
                const sessionTitle = useGlobalSessionsStore.getState().entityById.get(sessionId)?.title ?? null;
                const directory = useSessionUIStore.getState().getDirectoryForSession(sessionId);
                const item = buildGuestMessageItem(entry.action.id, { sessionId, sessionTitle, directory }, messageRecordRef.current);
                void runGuestAction(entry, item, t);
            },
        }));
    }, [guestActionEntries, isUser, sessionId, t]);

<<<<<<< HEAD
||||||| bc50ba56aa
    // NEW: Fork handler
=======
    const { onSelectMessages, promptUnitKey } = useMessageSelectionEntry({
        sessionId, messageId: message.info.id, isUser, turnId: turnGroupingContext?.turnId, hasTextContent,
    });

>>>>>>> upstream/main
    const handleFork = React.useCallback(() => {
        if (!sessionId || !message.messageId) return;
        void useSessionUIStore.getState().forkFromMessage(sessionId, message.messageId);
    }, [sessionId, message.messageId]);

    const handleToggleTool = React.useCallback((toolId: string) => {
        setExpandedTools((prev) => {
            const next = new Set(prev);
            if (next.has(toolId)) {
                next.delete(toolId);
            } else {
                next.add(toolId);
            }
            writeExpandedToolsCache(message.messageId, next);
            return next;
        });
    }, [message.messageId]);

    const setImagePreviewOpen = useUIStore((state) => state.setImagePreviewOpen);

    const handleShowPopup = React.useCallback((content: ToolPopupContent) => {
        setPopupContent(content);
        if (content.image || content.mermaid) {
            setImagePreviewOpen(true);
        }
    }, [setImagePreviewOpen]);

    const handlePopupChange = React.useCallback((open: boolean) => {
        setPopupContent((prev) => ({ ...prev, open }));
        setImagePreviewOpen(open);
    }, [setImagePreviewOpen]);

    if (message.role === 'system') {
        return null;
    }

    // Desktop keeps the whole gap below the user bubble inside the user row
    // (see `pb-11` below), so the assistant block adds nothing on top.
    const assistantTopPaddingClass = !isUser && shouldShowHeader && !previousIsHiddenUserMessage && stickyUserHeader && isMobile
        ? 'pt-4'
        : 'pt-0';
    const userMessageRadius = 'var(--radius-xl)';

    return (
        <>
            <div
                className={cn(
                    'group w-full',
<<<<<<< HEAD
                    isUser ? (isMobile ? 'pt-2' : 'pt-4') : assistantTopPaddingClass,
                    isUser ? 'pb-0' : (isFollowedByAssistant || nextIsHiddenUserMessage) ? 'pb-0' : 'pb-2'
||||||| bc50ba56aa
                    isUser ? (isMobile ? 'pt-2' : 'pt-4') : 'pt-0',
                    // In the transcript the gap under an answer is the
                    // turn's (TurnItem gapBelow); only ungrouped lists (BTW) keep it here.
                    isUser || hasTurnGrouping || isFollowedByAssistant || nextIsHiddenUserMessage ? 'pb-0' : 'pb-2'
=======
                    isUser ? (isMobile ? 'pt-2' : 'pt-4') : 'pt-0',
                    isUser || hasTurnGrouping || isFollowedByAssistant || nextIsHiddenUserMessage ? 'pb-0' : 'pb-2'
>>>>>>> upstream/main
                )}
                id={sliceName ? undefined : `message-${message.messageId}`}
                data-message-id={message.messageId}
                data-message-slice={sliceName}
                data-message-continues={slice?.to ? "" : undefined}
                data-message-row={slice ? `${slice.index}/${slice.count}` : undefined}
                ref={messageContainerRef}
            >
                <div className="chat-message-column relative">
                    {isUser ? (
<<<<<<< HEAD
                        <FadeInOnReveal
                            forceAnimation
                            skipAnimation={!animateUserOnMount}
                            ignoreContextDisabled
                            respectReducedMotion
                        >
                            <div className={cn('relative flex justify-end', !isMobile ? 'group/user-shell' : undefined)}>
                                {/* The hover action row hangs below the bubble (absolute,
                                    `top-full` + `pt-5`, 26px tall), so the user row reserves
                                    the whole 44px gap to the assistant block here. The list's
                                    row containers paint-contain their content: anything that
                                    pokes past the row is cut, which showed as a half-visible
                                    action row while the reply had not started yet.
                                    peek: the action row is suppressed, so reserve only its
                                    gap to the next message, OUTSIDE the bubble background. */}
                                <div className={cn('flex max-w-[85%] flex-col items-end', showStickyInlineHoverRow ? 'pb-11' : undefined, chatSurfaceMode === 'peek' ? 'pb-3' : undefined)}>
                                    <div
                                        style={{
                                            backgroundColor: 'var(--chat-user-message-bg)',
                                            borderRadius: userMessageRadius,
                                            borderBottomRightRadius: 'var(--radius-sm)',
                                        }}
                                        className="w-fit max-w-full px-5 py-3 shadow-none border border-primary/5"
                                        data-user-message-bubble=""
                                    >
                                        <MessageBody
                                            sessionId={sessionId}
                                            messageId={message.messageId}
                                            parts={displayParts}
                                            isUser={isUser}
                                            isMessageCompleted={isMessageCompleted}
                                            messageCreatedAt={messageCreatedAt}
                                            isMobile={isMobile}
                                            alwaysShowActions={alwaysShowMessageActions}
                                            hasTouchInput={hasTouchInput}
                                            copiedCode={copiedCode}
                                            onCopyCode={handleCopyCode}
                                            expandedTools={expandedTools}
                                            onToggleTool={handleToggleTool}
                                            onShowPopup={handleShowPopup}
                                            streamPhase={streamPhase}
                                            allowAnimation={false}
                                            shouldShowHeader={false}
                                            hasTextContent={hasTextContent}
                                            onCopyMessage={handleCopyMessage}
                                            onCopyLink={handleCopyLink}
                                            copiedMessage={copiedMessage}
                                            showReasoningTraces={showReasoningTraces}
                                            onRevert={handleRevert}
                                            onFork={handleFork}
                                            contextPinned={isPinnedIntoContext}
                                            contextPinPending={pinPending}
                                            onToggleContextPin={isPinnedIntoContext || messageCreatedAt ? handleToggleContextPin : undefined}
                                            userActionsMode={useExternalUserActionsRow ? 'external-content' : 'inline'}
                                            stickyUserHeaderEnabled={stickyUserHeader}
                                            extraActions={guestMessageActions}
                                        />
||||||| bc50ba56aa
                        visibleParts.length === 0 ? null : (
                            <FadeInOnReveal
                                forceAnimation
                                skipAnimation={!animateUserOnMount}
                                ignoreContextDisabled
                                respectReducedMotion
                            >
                                {/* In a sticky turn header (TurnItem) the desktop row keeps
                                    the whole 44px gap to the reply, under the header's fade. */}
                                <div className={cn('relative flex flex-col items-end', !isMobile ? 'group/user-shell in-data-[turn-sticky-header]:pb-3' : undefined)}>
                                    {/* peek: the action row is suppressed, so reserve only its
                                        gap to the next message, OUTSIDE the bubble background. */}
                                    <div className={cn('max-w-[85%]', chatSurfaceMode === 'peek' ? 'pb-3' : undefined)}>
                                        <div
                                            style={{
                                                backgroundColor: 'var(--chat-user-message-bg)',
                                                borderRadius: userMessageRadius,
                                                borderBottomRightRadius: 'var(--radius-sm)',
                                            }}
                                            className="px-5 py-3 shadow-none border border-primary/5"
                                            data-user-message-bubble=""
                                        >
                                            <MessageBody
                                                messageId={message.info.id}
                                                parts={visibleParts}
                                                isUser={isUser}
                                                isMessageCompleted={isMessageCompleted}
                                                messageFinish={messageFinish}
                                                messageCreatedAt={messageCreatedAt ?? undefined}
                                                 isMobile={isMobile}
                                                 alwaysShowActions={alwaysShowMessageActions}
                                                 hasTouchInput={hasTouchInput}
                                                copiedCode={copiedCode}
                                                onCopyCode={handleCopyCode}
                                                expandedTools={expandedTools}
                                                onToggleTool={handleToggleTool}
                                                onShowPopup={handleShowPopup}
                                                streamPhase={streamPhase}
                                                allowAnimation={allowAnimation}
                                                shouldShowHeader={false}
                                                hasTextContent={hasTextContent}
                                                onCopyMessage={handleCopyMessage}
                                                onCopyLink={handleCopyLink}
                                                copiedMessage={copiedMessage}
                                                onSaveAsSnippet={handleSaveAsSnippet}
                                                showReasoningTraces={showReasoningTraces}
                                                agentMention={agentMention}
                                                onRevert={handleRevert}
                                                onFork={isUser ? handleFork : undefined}
                                                contextPinned={isPinnedIntoContext}
                                                contextPinPending={pinPending}
                                                onToggleContextPin={canPinIntoContext && messageCreatedAt ? handleToggleContextPin : undefined}
                                                errorMessage={assistantErrorText}
                                                errorResponseBody={assistantErrorResponseBody}
                                                extraActions={guestMessageActions}
                                                promptOrigin={promptOrigin}
                                            />
                                        </div>
=======
                        visibleParts.length === 0 ? null : (
                            <FadeInOnReveal
                                forceAnimation
                                skipAnimation={!animateUserOnMount}
                                ignoreContextDisabled
                                respectReducedMotion
                            >
                                <div
                                    className={cn('relative flex flex-col items-end', !isMobile ? 'group/user-shell in-data-[turn-sticky-header]:pb-3' : undefined)}
                                    {...(promptUnitKey ? { [MESSAGE_SELECT_UNIT_ATTRIBUTE]: promptUnitKey } : {})}
                                >
                                    <MessageSelectionMark sessionId={sessionId} unitKey={promptUnitKey} kind="prompt" />
                                    <div className={cn('max-w-[85%]', chatSurfaceMode === 'peek' ? 'pb-3' : undefined)}>
                                        <div
                                            style={{
                                                backgroundColor: 'var(--chat-user-message-bg)',
                                                borderRadius: userMessageRadius,
                                                borderBottomRightRadius: 'var(--radius-sm)',
                                            }}
                                            className="px-5 py-3 shadow-none border border-primary/5"
                                            data-user-message-bubble=""
                                        >
                                            <MessageBody
                                                messageId={message.info.id}
                                                parts={visibleParts}
                                                isUser={isUser}
                                                isMessageCompleted={isMessageCompleted}
                                                messageFinish={messageFinish}
                                                messageCreatedAt={messageCreatedAt ?? undefined}
                                                 isMobile={isMobile}
                                                 alwaysShowActions={alwaysShowMessageActions}
                                                 hasTouchInput={hasTouchInput}
                                                copiedCode={copiedCode}
                                                onCopyCode={handleCopyCode}
                                                expandedTools={expandedTools}
                                                onToggleTool={handleToggleTool}
                                                onShowPopup={handleShowPopup}
                                                streamPhase={streamPhase}
                                                allowAnimation={allowAnimation}
                                                shouldShowHeader={false}
                                                hasTextContent={hasTextContent}
                                                onCopyMessage={handleCopyMessage}
                                                onCopyLink={handleCopyLink}
                                                copiedMessage={copiedMessage}
                                                onSaveAsSnippet={handleSaveAsSnippet}
                                                onSelectMessages={onSelectMessages}
                                                showReasoningTraces={showReasoningTraces}
                                                agentMention={agentMention}
                                                onRevert={handleRevert}
                                                onFork={isUser ? handleFork : undefined}
                                                contextPinned={isPinnedIntoContext}
                                                contextPinPending={pinPending}
                                                onToggleContextPin={canPinIntoContext && messageCreatedAt ? handleToggleContextPin : undefined}
                                                errorMessage={assistantErrorText}
                                                errorResponseBody={assistantErrorResponseBody}
                                                extraActions={guestMessageActions}
                                                promptOrigin={promptOrigin}
                                            />
                                        </div>
>>>>>>> upstream/main
                                    </div>
<<<<<<< HEAD
                                    {useExternalUserActionsRow ? (
                                        <MessageBody
                                            sessionId={sessionId}
                                            messageId={message.messageId}
                                            parts={displayParts}
                                            isUser={isUser}
                                            isMessageCompleted={isMessageCompleted}
                                            messageCreatedAt={messageCreatedAt}
                                            isMobile={isMobile}
                                            alwaysShowActions={alwaysShowMessageActions}
                                            hasTouchInput={hasTouchInput}
                                            copiedCode={copiedCode}
                                            onCopyCode={handleCopyCode}
                                            expandedTools={expandedTools}
                                            onToggleTool={handleToggleTool}
                                            onShowPopup={handleShowPopup}
                                            streamPhase={streamPhase}
                                            allowAnimation={false}
                                            shouldShowHeader={false}
                                            hasTextContent={hasTextContent}
                                            onCopyMessage={handleCopyMessage}
                                            onCopyLink={handleCopyLink}
                                            copiedMessage={copiedMessage}
                                            showReasoningTraces={showReasoningTraces}
                                            onRevert={handleRevert}
                                            onFork={handleFork}
                                            contextPinned={isPinnedIntoContext}
                                            contextPinPending={pinPending}
                                            onToggleContextPin={isPinnedIntoContext || messageCreatedAt ? handleToggleContextPin : undefined}
                                            userActionsMode="external-actions"
                                            stickyUserHeaderEnabled={stickyUserHeader}
                                            extraActions={guestMessageActions}
                                        />
                                    ) : null}
||||||| bc50ba56aa
                                    <MessageBody
                                        messageId={message.info.id}
                                        parts={visibleParts}
                                        isUser={isUser}
                                        isMessageCompleted={isMessageCompleted}
                                        messageFinish={messageFinish}
                                        messageCreatedAt={messageCreatedAt ?? undefined}
                                        isMobile={isMobile}
                                        alwaysShowActions={alwaysShowMessageActions}
                                        hasTouchInput={hasTouchInput}
                                        copiedCode={copiedCode}
                                        onCopyCode={handleCopyCode}
                                        expandedTools={expandedTools}
                                        onToggleTool={handleToggleTool}
                                        onShowPopup={handleShowPopup}
                                        streamPhase={streamPhase}
                                        allowAnimation={allowAnimation}
                                        shouldShowHeader={false}
                                        hasTextContent={hasTextContent}
                                        onCopyMessage={handleCopyMessage}
                                        onCopyLink={handleCopyLink}
                                        copiedMessage={copiedMessage}
                                        onSaveAsSnippet={handleSaveAsSnippet}
                                        showReasoningTraces={showReasoningTraces}
                                        agentMention={agentMention}
                                        onRevert={handleRevert}
                                        onFork={isUser ? handleFork : undefined}
                                        contextPinned={isPinnedIntoContext}
                                        contextPinPending={pinPending}
                                        onToggleContextPin={canPinIntoContext && messageCreatedAt ? handleToggleContextPin : undefined}
                                        errorMessage={assistantErrorText}
                                        errorResponseBody={assistantErrorResponseBody}
                                        userMessagePart="actions"
                                        extraActions={guestMessageActions}
                                    />
=======
                                    <MessageBody
                                        messageId={message.info.id}
                                        parts={visibleParts}
                                        isUser={isUser}
                                        isMessageCompleted={isMessageCompleted}
                                        messageFinish={messageFinish}
                                        messageCreatedAt={messageCreatedAt ?? undefined}
                                        isMobile={isMobile}
                                        alwaysShowActions={alwaysShowMessageActions}
                                        hasTouchInput={hasTouchInput}
                                        copiedCode={copiedCode}
                                        onCopyCode={handleCopyCode}
                                        expandedTools={expandedTools}
                                        onToggleTool={handleToggleTool}
                                        onShowPopup={handleShowPopup}
                                        streamPhase={streamPhase}
                                        allowAnimation={allowAnimation}
                                        shouldShowHeader={false}
                                        hasTextContent={hasTextContent}
                                        onCopyMessage={handleCopyMessage}
                                        onCopyLink={handleCopyLink}
                                        copiedMessage={copiedMessage}
                                        onSaveAsSnippet={handleSaveAsSnippet}
                                        onSelectMessages={onSelectMessages}
                                        showReasoningTraces={showReasoningTraces}
                                        agentMention={agentMention}
                                        onRevert={handleRevert}
                                        onFork={isUser ? handleFork : undefined}
                                        contextPinned={isPinnedIntoContext}
                                        contextPinPending={pinPending}
                                        onToggleContextPin={canPinIntoContext && messageCreatedAt ? handleToggleContextPin : undefined}
                                        errorMessage={assistantErrorText}
                                        errorResponseBody={assistantErrorResponseBody}
                                        userMessagePart="actions"
                                        extraActions={guestMessageActions}
                                    />
>>>>>>> upstream/main
                                </div>
                            </div>
                        </FadeInOnReveal>
                    ) : (
                        <div className="relative">
                            <MessageBody
                                sessionId={sessionId}
                                messageId={message.messageId}
                                parts={visibleParts}
                                isUser={isUser}
                                isMessageCompleted={isMessageCompleted}
                                messageCreatedAt={messageCreatedAt}
                                contextPinned={isPinnedIntoContext}
                                contextPinPending={pinPending}
                                onToggleContextPin={handleToggleContextPin}
                                isMobile={isMobile}
                                alwaysShowActions={alwaysShowMessageActions}
                                hasTouchInput={hasTouchInput}
                                copiedCode={copiedCode}
                                onCopyCode={handleCopyCode}
                                expandedTools={expandedTools}
                                onToggleTool={handleToggleTool}
                                onShowPopup={handleShowPopup}
                                streamPhase={streamPhase}
                                allowAnimation={false}
                                shouldShowHeader={shouldShowHeader}
                                hasTextContent={hasTextContent}
                                onCopyMessage={handleCopyMessage}
                                onCopyLink={handleCopyLink}
                                copiedMessage={copiedMessage}
                                showReasoningTraces={showReasoningTraces}
                                turnGroupingContext={turnGroupingContext}
                                reviewTransferDirection={reviewTransferDirection}
                                footerProviderID={headerProviderID}
                                footerModelName={headerModelName}
                                isDarkTheme={isDarkTheme}
                                extraActions={guestMessageActions}
                                onSelectMessages={onSelectMessages}
                            />
                        </div>
                    )}
                </div>
            </div>
            <React.Suspense fallback={null}>
                <ToolOutputDialog
                    popup={popupContent}
                    onOpenChange={handlePopupChange}
                    isMobile={isMobile}
                />
            </React.Suspense>
        </>
    );
};

export default React.memo(ChatMessage, (prev, next) => {
    return areRenderRelevantMessagesEqual(
        { info: prev.message, parts: prev.message.parts },
        { info: next.message, parts: next.message.parts }
    )
        && areOptionalRenderRelevantMessagesEqual(
            prev.previousMessage ? { info: prev.previousMessage, parts: prev.previousMessage.parts } : undefined,
            next.previousMessage ? { info: next.previousMessage, parts: next.previousMessage.parts } : undefined
        )
        && areOptionalRenderRelevantMessagesEqual(
            prev.nextMessage ? { info: prev.nextMessage, parts: prev.nextMessage.parts } : undefined,
            next.nextMessage ? { info: next.nextMessage, parts: next.nextMessage.parts } : undefined
        )
        && prev.isInActiveTurn === next.isInActiveTurn
        && prev.activeStreamingPhase === next.activeStreamingPhase
        && prev.reviewTransferDirection === next.reviewTransferDirection
        && prev.assistantHeaderMessageId === next.assistantHeaderMessageId
        && prev.animateUserOnMount === next.animateUserOnMount
        && prev.onUserAnimationConsumed === next.onUserAnimationConsumed
        && areRelevantTurnGroupingContextsEqual(
            prev.turnGroupingContext,
            next.turnGroupingContext,
            prev.message.messageId,
            prev.message.role === 'user'
        );
});
