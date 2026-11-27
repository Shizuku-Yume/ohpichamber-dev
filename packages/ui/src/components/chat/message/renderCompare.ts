import type { Message, Part, SessionMention } from '@openchamber/agent-contract';
import type { TurnActivityGroup, TurnActivityRecord, TurnChangedFile, TurnDiffStats, TurnGroupingContext } from '../lib/turns/types';

type MessageRecord = {
  info: Message;
  parts: Part[];
};

const mentionsEqual = (left?: SessionMention[], right?: SessionMention[]): boolean => {
  if (left === right) return true;
  if ((left?.length ?? 0) !== (right?.length ?? 0)) return false;
  return (left ?? []).every((mention, index) => {
    const other = right?.[index];
    if (!other || mention.kind !== other.kind || mention.sessionId !== other.sessionId || mention.messageId !== other.messageId) return false;
    return mention.kind === 'session' && other.kind === 'session' ? mention.title === other.title
      : mention.kind === 'session-message' && other.kind === 'session-message' && mention.sessionTitle === other.sessionTitle && mention.excerpt === other.excerpt;
  });
};

// Canonical parts intentionally have no legacy state/metadata/time fields; render comparison uses only contract fields.
export const areRenderRelevantPartsEqual = (left: Part[], right: Part[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart.type !== rightPart.type || leftPart.partId !== rightPart.partId) return false;

    if (leftPart.type === 'tool_call' && rightPart.type === 'tool_call') {
      if (leftPart.toolCallId !== rightPart.toolCallId || leftPart.toolName !== rightPart.toolName || leftPart.status !== rightPart.status || leftPart.input !== rightPart.input) return false;
      continue;
    }
    if (leftPart.type === 'tool_result' && rightPart.type === 'tool_result') {
      if (leftPart.toolCallId !== rightPart.toolCallId || leftPart.toolName !== rightPart.toolName || leftPart.output !== rightPart.output || leftPart.error !== rightPart.error || leftPart.isError !== rightPart.isError) return false;
      continue;
    }
    if (leftPart.type === 'text' && rightPart.type === 'text' && (leftPart.content !== rightPart.content || !mentionsEqual(leftPart.sessionMentions, rightPart.sessionMentions))) return false;
    if (leftPart.type === 'reasoning' && rightPart.type === 'reasoning' && (leftPart.content !== rightPart.content || leftPart.signature !== rightPart.signature)) return false;
    if (leftPart.type === 'attachment' && rightPart.type === 'attachment' && (leftPart.attachmentId !== rightPart.attachmentId || leftPart.name !== rightPart.name || leftPart.mediaType !== rightPart.mediaType || leftPart.size !== rightPart.size || leftPart.uri !== rightPart.uri)) return false;
    if (leftPart.type === 'step_summary' && rightPart.type === 'step_summary' && (leftPart.title !== rightPart.title || leftPart.durationMs !== rightPart.durationMs)) return false;
  }

  return true;
};

const areRenderRelevantMessageInfoEqual = (left: Message, right: Message): boolean => {
  if (left === right) return true;
  return left.messageId === right.messageId
    && left.sessionId === right.sessionId
    && left.role === right.role
    && left.createdAt === right.createdAt
    && left.providerId === right.providerId
    && left.modelId === right.modelId
    && left.usage?.input === right.usage?.input
    && left.usage?.output === right.usage?.output
    && left.usage?.cacheRead === right.usage?.cacheRead
    && left.usage?.cacheWrite === right.usage?.cacheWrite
    && left.usage?.totalTokens === right.usage?.totalTokens
    && left.usage?.cost.input === right.usage?.cost.input
    && left.usage?.cost.output === right.usage?.cost.output
    && left.usage?.cost.cacheRead === right.usage?.cost.cacheRead
    && left.usage?.cost.cacheWrite === right.usage?.cost.cacheWrite
    && left.usage?.cost.total === right.usage?.cost.total;
};

export const areRenderRelevantMessagesEqual = (left: MessageRecord, right: MessageRecord): boolean => {
  return areRenderRelevantMessageInfoEqual(left.info, right.info) && areRenderRelevantPartsEqual(left.parts, right.parts);
};

export const areOptionalRenderRelevantMessagesEqual = (left?: MessageRecord, right?: MessageRecord): boolean => {
  if (!left || !right) return left === right;
  return areRenderRelevantMessagesEqual(left, right);
};


const areTurnDiffStatsEqual = (left?: TurnDiffStats, right?: TurnDiffStats): boolean => {
  if (!left || !right) {
    return left === right;
  }

  return left.additions === right.additions
    && left.deletions === right.deletions
    && left.files === right.files;
};

const areTurnChangedFilesEqual = (left?: TurnChangedFile[], right?: TurnChangedFile[]): boolean => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftFile = left[index];
    const rightFile = right[index];
    if (
      leftFile.file !== rightFile.file
      || leftFile.additions !== rightFile.additions
      || leftFile.deletions !== rightFile.deletions
    ) {
      return false;
    }
  }
  return true;
};

const areTurnActivityRecordsEqual = (left: TurnActivityRecord, right: TurnActivityRecord): boolean => {
  return left.id === right.id
    && left.messageId === right.messageId
    && left.kind === right.kind
    && left.partIndex === right.partIndex
    && left.endedAt === right.endedAt
    && areRenderRelevantPartsEqual([left.part], [right.part]);
};

const areRelevantActivityPartsEqual = (
  left: TurnActivityRecord[] | undefined,
  right: TurnActivityRecord[] | undefined,
  messageId: string,
): boolean => {
  let leftIndex = 0;
  let rightIndex = 0;

  while (true) {
    while (leftIndex < (left?.length ?? 0) && left?.[leftIndex]?.messageId !== messageId) {
      leftIndex += 1;
    }
    while (rightIndex < (right?.length ?? 0) && right?.[rightIndex]?.messageId !== messageId) {
      rightIndex += 1;
    }

    const leftRecord = left?.[leftIndex];
    const rightRecord = right?.[rightIndex];

    if (!leftRecord || !rightRecord) {
      return leftRecord === rightRecord;
    }

    if (!areTurnActivityRecordsEqual(leftRecord, rightRecord)) {
      return false;
    }

    leftIndex += 1;
    rightIndex += 1;
  }
};

const areTurnActivityGroupsEqual = (left: TurnActivityGroup, right: TurnActivityGroup): boolean => {
  if (left.id !== right.id || left.anchorMessageId !== right.anchorMessageId || left.afterToolPartId !== right.afterToolPartId) {
    return false;
  }

  if (left.parts.length !== right.parts.length) {
    return false;
  }

  for (let index = 0; index < left.parts.length; index += 1) {
    if (!areTurnActivityRecordsEqual(left.parts[index], right.parts[index])) {
      return false;
    }
  }

  return true;
};

const hasRelevantActivitySegments = (segments: TurnActivityGroup[] | undefined, messageId: string): boolean => {
  return Boolean(segments?.some((segment) => segment.anchorMessageId === messageId));
};

const areRelevantActivitySegmentsEqual = (
  left: TurnActivityGroup[] | undefined,
  right: TurnActivityGroup[] | undefined,
  messageId: string,
): boolean => {
  let leftIndex = 0;
  let rightIndex = 0;

  while (true) {
    while (leftIndex < (left?.length ?? 0) && left?.[leftIndex]?.anchorMessageId !== messageId) {
      leftIndex += 1;
    }
    while (rightIndex < (right?.length ?? 0) && right?.[rightIndex]?.anchorMessageId !== messageId) {
      rightIndex += 1;
    }

    const leftSegment = left?.[leftIndex];
    const rightSegment = right?.[rightIndex];

    if (!leftSegment || !rightSegment) {
      return leftSegment === rightSegment;
    }

    if (!areTurnActivityGroupsEqual(leftSegment, rightSegment)) {
      return false;
    }

    leftIndex += 1;
    rightIndex += 1;
  }
};

export const areRelevantTurnGroupingContextsEqual = (
  left: TurnGroupingContext | undefined,
  right: TurnGroupingContext | undefined,
  messageId: string,
  isUserMessage: boolean,
): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  if (isUserMessage) {
    return true;
  }

  if (left.turnId !== right.turnId) return false;
  if (left.snapshotTurnId !== right.snapshotTurnId) return false;
  if (left.isFirstAssistantInTurn !== right.isFirstAssistantInTurn) return false;
  if (left.hasEarlierAssistantText !== right.hasEarlierAssistantText) return false;
  if (left.opensAnswerText !== right.opensAnswerText) return false;
  if (left.earlierAssistantText !== right.earlierAssistantText) {
    if (!left.earlierAssistantText || !right.earlierAssistantText) return false;
    if (left.earlierAssistantText.length !== right.earlierAssistantText.length) return false;
    for (let i = 0; i < left.earlierAssistantText.length; i += 1) {
      if (left.earlierAssistantText[i] !== right.earlierAssistantText[i]) return false;
    }
  }
  if (left.isLastAssistantInTurn !== right.isLastAssistantInTurn) return false;
  if (left.isLatestTurn !== right.isLatestTurn) return false;
  if (left.isWorking !== right.isWorking) return false;
  if (left.hasTools !== right.hasTools) return false;
  if (left.hasReasoning !== right.hasReasoning) return false;
  if (left.userMessageCreatedAt !== right.userMessageCreatedAt) return false;
  if (left.assistantVariant !== right.assistantVariant) return false;

  const headerRelevant = left.headerMessageId === messageId || right.headerMessageId === messageId;
  if (headerRelevant && left.headerMessageId !== right.headerMessageId) {
    return false;
  }

  const ownerRelevant = left.activityOwnerMessageId === messageId || right.activityOwnerMessageId === messageId;
  if (ownerRelevant && left.activityOwnerMessageId !== right.activityOwnerMessageId) {
    return false;
  }

  if (!areRelevantActivityPartsEqual(left.activityParts, right.activityParts, messageId)) {
    return false;
  }

  if (!areRelevantActivitySegmentsEqual(left.activityGroupSegments, right.activityGroupSegments, messageId)) {
    return false;
  }

  const segmentsRelevant = hasRelevantActivitySegments(left.activityGroupSegments, messageId)
    || hasRelevantActivitySegments(right.activityGroupSegments, messageId);

  if ((ownerRelevant || segmentsRelevant) && left.isGroupExpanded !== right.isGroupExpanded) {
    return false;
  }

  if ((ownerRelevant || segmentsRelevant) && left.toggleGroup !== right.toggleGroup) {
    return false;
  }

  if ((ownerRelevant || segmentsRelevant) && !areTurnDiffStatsEqual(left.diffStats, right.diffStats)) {
    return false;
  }

  if ((ownerRelevant || segmentsRelevant || left.isLastAssistantInTurn || right.isLastAssistantInTurn) && !areTurnChangedFilesEqual(left.changedFiles, right.changedFiles)) {
    return false;
  }

  return true;
};
