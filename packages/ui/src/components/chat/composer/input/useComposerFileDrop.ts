import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerFileIntake } from './useComposerFileIntake';
import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerEditorActions } from './useComposerEditorActions';
import type { useComposerDropState } from './useComposerDropState';
import type { useComposerDraftText } from './useComposerDraftText';
import React from 'react';
import { isVSCodeRuntime } from '@/lib/desktop';
import { confirmMention } from '../../composer/language/mentions';
import { appendInlineText } from '../../composer/text';
import { collectDroppedFiles, hasDraggedFiles } from '../../composer/attachments/dataTransfer';

type Dependencies = {
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'confirmedMentionsRef' | 'composerText' | 'setMessage'>;
    dropState: Pick<ReturnType<typeof useComposerDropState>, 'dragEnterCountRef' | 'isInternalDrag' | 'setIsInternalDrag' | 'isDragging' | 'setIsDragging' | 'pendingDroppedAbsolutePathsRef' | 'suppressNextFileDropTextInsertRef'>;
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerRef' | 'cursorPosRef'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'setPendingInputText' | 'currentSessionId' | 'newSessionDraftOpen'>;
    editorActions: Pick<ReturnType<typeof useComposerEditorActions>, 'clearDropTextSuppression' | 'scheduleDropTextSuppressionExpiry'>;
    fileIntake: Pick<ReturnType<typeof useComposerFileIntake>, 'attachFilesWithCitation'>;
};

export function useComposerFileDrop({
    draftText, dropState, editorState, sessionScope, editorActions, fileIntake,
}: Dependencies) {
    const { confirmedMentionsRef, composerText, setMessage } = draftText;
    const {
        dragEnterCountRef, isInternalDrag, setIsInternalDrag, isDragging, setIsDragging,
        suppressNextFileDropTextInsertRef,
    } = dropState;
    const { composerRef, cursorPosRef } = editorState;
    const { currentSessionId, newSessionDraftOpen } = sessionScope;
    const { clearDropTextSuppression, scheduleDropTextSuppressionExpiry } = editorActions;
    const { attachFilesWithCitation } = fileIntake;

    const canAcceptDropRef = React.useRef(false);

    React.useEffect(() => {
        canAcceptDropRef.current = Boolean(currentSessionId || newSessionDraftOpen);
    }, [currentSessionId, newSessionDraftOpen, canAcceptDropRef]);

    const handleDragEnter = (e: React.DragEvent) => {
        if (!hasDraggedFiles(e.dataTransfer)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        dragEnterCountRef.current++;
        const isInternal = e.dataTransfer.types?.includes('application/x-openchamber-file-path') ?? false;
        if (isInternal !== isInternalDrag) {
            setIsInternalDrag(isInternal);
        }
        if ((currentSessionId || newSessionDraftOpen) && !isDragging) {
            setIsDragging(true);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!hasDraggedFiles(e.dataTransfer)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        if ((currentSessionId || newSessionDraftOpen) && !isDragging) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragEnterCountRef.current--;
        if (dragEnterCountRef.current <= 0) {
            dragEnterCountRef.current = 0;
            setIsDragging(false);
            setIsInternalDrag(false);
            clearDropTextSuppression();
        }
    };

    const handleDragEnd = () => {
        dragEnterCountRef.current = 0;
        setIsDragging(false);
        setIsInternalDrag(false);
        clearDropTextSuppression();
    };

    const handleDrop = async (e: React.DragEvent) => {
        dragEnterCountRef.current = 0;
        const draggedFiles = hasDraggedFiles(e.dataTransfer);
        if (!draggedFiles) {
            clearDropTextSuppression();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!currentSessionId && !newSessionDraftOpen) return;

        const internalPath = e.dataTransfer.getData('application/x-openchamber-file-path');
        if (internalPath && internalPath !== '.') {
            confirmMention(internalPath, confirmedMentionsRef.current);
            const mention = `@${internalPath}`;
            const textarea = composerRef.current;
            const currentMessage = composerText.get();
            if (textarea) {
                const { start: pos, end } = textarea.getSelection();
                const before = currentMessage.slice(0, pos);
                const after = currentMessage.slice(end);
                const needSpaceBefore = before.length > 0 && !/\s$/.test(before);
                const needSpaceAfter = after.length > 0 && !/^\s/.test(after);
                const insert = `${needSpaceBefore ? ' ' : ''}${mention}${needSpaceAfter ? ' ' : ''}`;
                textarea.replaceRange(pos, end, insert);
                cursorPosRef.current = pos + insert.length;
                textarea.focus();
            } else {
                setMessage(appendInlineText(composerText.get(), mention));
            }
            clearDropTextSuppression();
            return;
        }

        const files = collectDroppedFiles(e.dataTransfer);

        if (files.length > 0) {
            await attachFilesWithCitation(files);
        }
        clearDropTextSuppression();
    };

    const handleDropCapture = (e: React.DragEvent) => {
        if (!hasDraggedFiles(e.dataTransfer)) {
            return;
        }
        e.preventDefault();
        if (isVSCodeRuntime()) {
            suppressNextFileDropTextInsertRef.current = true;
            scheduleDropTextSuppressionExpiry();
        }
    };

    return {
        handleDropCapture, handleDragEnter, handleDragOver, handleDragLeave, handleDrop, handleDragEnd,
    };
}
