import type { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { memoizeSessionListProjection } from '@/stores/sessionListProjection';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { getChatsRoot } from '@/lib/chatDirectories';
import { getRuntimeKey } from '@/lib/runtime-switch';
import type { Session } from '@openchamber/agent-contract';

import { normalizePath } from './mobilePaths';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';


export const getSessionDirectory = (session: Session): string => normalizePath(resolveGlobalSessionDirectory(session));

const hasChats = memoizeSessionListProjection((sessions: Session[], _root: string | null, _runtime: string) =>
  sessions.some((session) => isChatDirectoryPath(getSessionDirectory(session))));

export const selectHasChats = (state: ReturnType<typeof useGlobalSessionsStore.getState>): boolean =>
  hasChats(state.activeSessions, getChatsRoot(), getRuntimeKey());
