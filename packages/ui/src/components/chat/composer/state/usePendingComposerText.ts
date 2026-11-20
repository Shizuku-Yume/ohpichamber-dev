
import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useInputStore } from '@/sync/input-store';
import { useChatColumnActions, useChatColumnSession } from '../../chatColumnSession';
import { appendInlineText, appendWithLineBreaks } from '../text';
import type { ComposerText } from './composerText';

export interface PendingComposerTextOptions {
 /**
  * False while another surface owns this composer's text: an expanded `/btw`
  * answer keeps the pending text for the composer the user returns to.
  */
 enabled?: boolean;
 target: string | null;
 sessionId?: string | null;
 text: ComposerText;
    setMessage: (text: string) => void;
 focus: () => void;
}

export function usePendingComposerText({
    enabled = true,
    target,
    sessionId = null,
    text,
    setMessage,
    focus,
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

 React.useEffect(() => {
  if (!enabled || columnBehindSelection) return;
  const store = useInputStore.getState();
  const restored = sessionId ? store.consumePendingSessionRestore(sessionId) : null;
  if (restored !== null) setMessage(restored);
  const pending = store.consumePendingInputText(target);
  if (restored !== null) setTimeout(() => focusRef.current(), 0);
  if (!pending?.text) return;
  if (pending.mode === 'append') {
   if (pending.text.trim()) setMessage(appendWithLineBreaks(text.get(), pending.text));
  } else if (pending.mode === 'append-inline') {
   setMessage(appendInlineText(text.get(), pending.text));
  } else {
   setMessage(pending.text);
  }
  setTimeout(() => focusRef.current(), 0);
 }, [columnBehindSelection, enabled, pendingRestore, pendingInputTarget, pendingInputText, sessionId, setMessage, target, text]);
}
