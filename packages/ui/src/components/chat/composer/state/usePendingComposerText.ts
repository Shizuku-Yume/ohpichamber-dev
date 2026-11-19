
import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useInputStore } from '@/sync/input-store';
import { useChatColumnActions, useChatColumnSession } from '../../chatColumnSession';
import { appendInlineText, appendWithLineBreaks, withLeadingSlashCommand } from '../text';
import type { ComposerText } from './composerText';

export interface PendingComposerTextOptions {
<<<<<<< HEAD
 /**
  * False while another surface owns this composer's text: an expanded `/btw`
  * answer keeps the pending text for the composer the user returns to.
  */
 enabled?: boolean;
 /** Column role: null for the main chat's composer, a session id for a pinned one. */
 target: string | null;
 /** The session this composer is showing, which a session-scoped restore addresses. */
 sessionId?: string | null;
 setMessage: React.Dispatch<React.SetStateAction<string>>;
 focus: () => void;
||||||| bc50ba56aa
    /** Column role: null for the main chat's composer, a session id for a pinned one. */
    target: string | null;
    /** The session this composer is showing, which a session-scoped restore addresses. */
    sessionId?: string | null;
    setMessage: React.Dispatch<React.SetStateAction<string>>;
    focus: () => void;
=======
    target: string | null;
    sessionId?: string | null;
    text: ComposerText;
    setMessage: (text: string) => void;
    focus: () => void;
    holdSlashCommand?: boolean;
    onSlashCommand?: () => void;
>>>>>>> upstream/main
}

<<<<<<< HEAD
export function usePendingComposerText({ enabled = true, target, sessionId = null, setMessage, focus }: PendingComposerTextOptions): void {
 const column = useChatColumnSession();
 const { pinned } = useChatColumnActions();
 // A pinned column keeps its own session and takes only text addressed to it.
 const columnBehindSelection = useSessionUIStore((state) => (
  column !== null && !pinned && column.sessionId !== state.currentSessionId
 ));
 const pendingInputText = useInputStore((state) => state.pendingInputText);
 const pendingInputTarget = useInputStore((state) => state.pendingInputTarget);
 const pendingRestore = useInputStore((state) => sessionId ? state.pendingSessionRestores.get(sessionId) : undefined);
 const focusRef = React.useRef(focus);
 focusRef.current = focus;
||||||| bc50ba56aa
export function usePendingComposerText({ target, sessionId = null, setMessage, focus }: PendingComposerTextOptions): void {
    const column = useChatColumnSession();
    const { pinned } = useChatColumnActions();
    // A pinned column keeps its own session and takes only text addressed to it.
    const columnBehindSelection = useSessionUIStore((state) => (
        column !== null && !pinned && column.sessionId !== state.currentSessionId
    ));
    const pendingInputText = useInputStore((state) => state.pendingInputText);
    const pendingInputTarget = useInputStore((state) => state.pendingInputTarget);
    const pendingRestore = useInputStore((state) => sessionId ? state.pendingSessionRestores.get(sessionId) : undefined);
    const focusRef = React.useRef(focus);
    focusRef.current = focus;
=======
export function usePendingComposerText({
    target,
    sessionId = null,
    text,
    setMessage,
    focus,
    holdSlashCommand = false,
    onSlashCommand,
}: PendingComposerTextOptions): void {
    const column = useChatColumnSession();
    const { pinned } = useChatColumnActions();
    const columnBehindSelection = useSessionUIStore((state) => (
        column !== null && !pinned && column.sessionId !== state.currentSessionId
    ));
    const pendingInputText = useInputStore((state) => state.pendingInputText);
    const pendingInputTarget = useInputStore((state) => state.pendingInputTarget);
    const pendingRestore = useInputStore((state) => sessionId ? state.pendingSessionRestores.get(sessionId) : undefined);
    const focusRef = React.useRef(focus);
    focusRef.current = focus;
    const onSlashCommandRef = React.useRef(onSlashCommand);
    onSlashCommandRef.current = onSlashCommand;
>>>>>>> upstream/main

<<<<<<< HEAD
 React.useEffect(() => {
  if (!enabled || columnBehindSelection) return;
  const store = useInputStore.getState();
  const restored = sessionId ? store.consumePendingSessionRestore(sessionId) : null;
  if (restored !== null) setMessage(restored);
  const pending = store.consumePendingInputText(target);
  if (restored !== null) setTimeout(() => focusRef.current(), 0);
  if (!pending?.text) return;
  if (pending.mode === 'append') {
   setMessage((prev) => {
    const next = pending.text;
    if (!next.trim()) return prev;
    return appendWithLineBreaks(prev, next);
   });
  } else if (pending.mode === 'append-inline') {
   setMessage((prev) => appendInlineText(prev, pending.text));
  } else {
   setMessage(pending.text);
  }
  setTimeout(() => focusRef.current(), 0);
 }, [columnBehindSelection, enabled, pendingRestore, pendingInputTarget, pendingInputText, sessionId, setMessage, target]);
||||||| bc50ba56aa
    React.useEffect(() => {
        if (columnBehindSelection) return;
        const store = useInputStore.getState();
        const restored = sessionId ? store.consumePendingSessionRestore(sessionId) : null;
        if (restored !== null) setMessage(restored);
        const pending = store.consumePendingInputText(target);
        if (restored !== null) setTimeout(() => focusRef.current(), 0);
        if (!pending?.text) return;
        if (pending.mode === 'append') {
            setMessage((prev) => {
                const next = pending.text;
                if (!next.trim()) return prev;
                return appendWithLineBreaks(prev, next);
            });
        } else if (pending.mode === 'append-inline') {
            setMessage((prev) => appendInlineText(prev, pending.text));
        } else {
            setMessage(pending.text);
        }
        setTimeout(() => focusRef.current(), 0);
    }, [columnBehindSelection, pendingRestore, pendingInputTarget, pendingInputText, sessionId, setMessage, target]);
=======
    React.useEffect(() => {
        if (columnBehindSelection) return;
        const store = useInputStore.getState();
        const restored = sessionId ? store.consumePendingSessionRestore(sessionId) : null;
        if (restored !== null) setMessage(restored);
        const pending = holdSlashCommand && store.pendingInputMode === 'slash-command'
            ? null
            : store.consumePendingInputText(target);
        if (restored !== null) setTimeout(() => focusRef.current(), 0);
        if (!pending?.text) return;
        if (pending.mode === 'append') {
            if (pending.text.trim()) setMessage(appendWithLineBreaks(text.get(), pending.text));
        } else if (pending.mode === 'append-inline') {
            setMessage(appendInlineText(text.get(), pending.text));
        } else if (pending.mode === 'slash-command') {
            onSlashCommandRef.current?.();
            setMessage(withLeadingSlashCommand(text.get(), pending.text));
        } else {
            setMessage(pending.text);
        }
        setTimeout(() => focusRef.current(), 0);
    }, [columnBehindSelection, holdSlashCommand, pendingRestore, pendingInputTarget, pendingInputText, sessionId, setMessage, target, text]);
>>>>>>> upstream/main
}
