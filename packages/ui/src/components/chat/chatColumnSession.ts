
import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { focusChatInput } from './composer/editor/dom';

export type ChatColumnSession = {
  sessionId: string | null;
  directory: string | null;
};

export const ChatColumnSessionContext = React.createContext<ChatColumnSession | null>(null);

export const useChatColumnSession = (): ChatColumnSession | null => React.useContext(ChatColumnSessionContext);

export const useChatSessionSelection = (): ChatColumnSession => {
  const column = useChatColumnSession();
  const liveSessionId = useSessionUIStore((state) => (column ? null : state.currentSessionId));
  const liveDirectory = useSessionUIStore((state) => (column ? null : state.currentSessionDirectory));
  return React.useMemo(
    () => column ?? { sessionId: liveSessionId, directory: liveDirectory },
    [column, liveDirectory, liveSessionId],
  );
};

/**
 * What a column does on behalf of the chat inside it. The app's main chat
 * acts on the global selection and the global panels; a pinned column (a chat
 * opened in the side panel) keeps its own session, navigates inside itself,
 * and leaves the main chat's selection and panels alone.
 */
export type ChatColumnActions = {
  pinned: boolean;
  openSession: (sessionId: string, directory: string | null) => void;
  openTimelineDialog: () => void;
  focusInput: () => void;
};

const MAIN_COLUMN_ACTIONS: ChatColumnActions = {
  pinned: false,
  openSession: (sessionId, directory) => useSessionUIStore.getState().setCurrentSession(sessionId, directory),
  openTimelineDialog: () => useUIStore.getState().setTimelineDialogOpen(true),
  focusInput: focusChatInput,
};

export const ChatColumnActionsContext = React.createContext<ChatColumnActions>(MAIN_COLUMN_ACTIONS);

export const useChatColumnActions = (): ChatColumnActions => React.useContext(ChatColumnActionsContext);

/**
 * Whether the composer is expanded to fill the column (focus mode). The main
 * chat keeps it as an app-wide preference; a pinned column keeps its own, so
 * expanding one composer leaves the other chat as it was.
 */
export type ChatColumnExpandedInput = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

export const ChatColumnExpandedInputContext = React.createContext<ChatColumnExpandedInput | null>(null);

export const useChatColumnExpandedInput = (): ChatColumnExpandedInput => {
  const column = React.useContext(ChatColumnExpandedInputContext);
  const globalExpanded = useUIStore((state) => (column ? false : state.isExpandedInput));
  const setGlobalExpanded = useUIStore((state) => state.setExpandedInput);
  return React.useMemo(
    () => column ?? { expanded: globalExpanded, setExpanded: setGlobalExpanded },
    [column, globalExpanded, setGlobalExpanded],
  );
};

