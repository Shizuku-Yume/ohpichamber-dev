import type { Session } from '@openchamber/agent-contract';

import { normalizePath } from './mobilePaths';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

/** Field readers shared by the mobile sessions sheet and its timeline list.
    Kept out of the sheet so the timeline list can read the same session
    fields without importing the sheet (which imports the list). */

export const getSessionDirectory = (session: Session): string => normalizePath(resolveGlobalSessionDirectory(session));
