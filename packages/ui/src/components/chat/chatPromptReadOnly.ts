import type { Session } from '@openchamber/agent-contract';
import { isReviewSession } from '@/lib/sessionReviewMetadata';
import { isOperatorChildSession } from '@/lib/sessionOperatorChild';

export const resolveChatPromptReadOnly = (
    session: Session | null | undefined,
    allowPromptingSubagentSessions: boolean,
    readOnly: boolean,
    ownFolderAdmitted = true,
): boolean => {
<<<<<<< HEAD
    // Review sessions are independent conversations even if an older server or
    // cached record still carries parentSessionId. Their explicit metadata is the
    // authority; only the surface itself may make them read-only.
||||||| bc50ba56aa
    // Review sessions are independent conversations even if an older server or
    // cached record still carries parentID. Their explicit metadata is the
    // authority; only the surface itself may make them read-only.
=======
    if (!ownFolderAdmitted) return true;
    if (isOperatorChildSession(session)) return true;
>>>>>>> upstream/main
    if (isReviewSession(session)) {
        return readOnly;
    }

    if (session?.parentSessionId) {
        return !allowPromptingSubagentSessions;
    }

    return readOnly;
};
