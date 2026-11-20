import type { Session } from '@openchamber/agent-contract';
import { getChatsRoot, isChatDirectoryPath } from '@/lib/chatDirectories';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { memoizeSessionListProjection } from '@/stores/sessionListProjection';
import type { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';

import { normalizePath } from './mobilePaths';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';


export const getSessionDirectory = (session: Session): string => normalizePath(resolveGlobalSessionDirectory(session));
