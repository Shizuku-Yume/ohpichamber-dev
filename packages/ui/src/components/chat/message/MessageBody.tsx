import React from 'react';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import type { MessageBodyProps } from './body/messageBodyProps';
import { UserMessageBody } from './body/UserMessageBody';
import { AssistantMessageBody } from './body/AssistantMessageBody';

export type { MessageExtraAction } from './body/messageBodyProps';

const MessageBody = React.memo(({ isUser, ...props }: MessageBodyProps) => {
    const storeWorkspaceId = useGlobalSessionsStore(
        React.useCallback((state) => (props.sessionId ? state.entityById.get(props.sessionId)?.workspaceId : undefined), [props.sessionId]),
    );
    const workspaceId = props.workspaceId ?? storeWorkspaceId;

    if (isUser) {
        return (
            <UserMessageBody
                sessionId={props.sessionId}
                workspaceId={workspaceId}
                parts={props.parts}
                messageCreatedAt={props.messageCreatedAt}
                isMobile={props.isMobile}
                alwaysShowActions={props.alwaysShowActions}
                hasTouchInput={props.hasTouchInput}
                hasTextContent={props.hasTextContent}
                onCopyMessage={props.onCopyMessage}
                copiedMessage={props.copiedMessage}
                onCopyLink={props.onCopyLink}
                onSaveAsSnippet={props.onSaveAsSnippet}
                onSelectMessages={props.onSelectMessages}
                onShowPopup={props.onShowPopup}
                agentMention={props.agentMention}
                onRevert={props.onRevert}
                onFork={props.onFork}
                contextPinned={props.contextPinned}
                contextPinPending={props.contextPinPending}
                onToggleContextPin={props.onToggleContextPin}
                userMessagePart={props.userMessagePart}
                userActionsMode={props.userActionsMode}
                stickyUserHeaderEnabled={props.stickyUserHeaderEnabled}
                extraActions={props.extraActions}
            />
        );
    }

    return <AssistantMessageBody {...props} workspaceId={workspaceId} />;
});

MessageBody.displayName = 'MessageBody';

export default MessageBody;
