import type { Message } from '@openchamber/agent-contract';

/** Canonical messages carry content parts, not synthetic notice roles. */
export const isTimelineNoticeRole = (_role: Message['role']): boolean => false;

/** System instructions are not user-facing transcript entries. */
export const isSkippedTimelineRole = (role: Message['role']): boolean => role === 'system';

/** Background completion reports are not represented by canonical messages. */
export const isBackgroundReportEntry = (_message: Message): boolean => false;

/** Only user prompts open transcript turns; synthetic notices are unsupported. */
export const isTurnOpeningNotice = (_message: Message): boolean => false;

/** Whether the timeline renders nothing for this message. */
export const isSkippedTimelineMessage = (message: Message): boolean =>
    isSkippedTimelineRole(message.role);
