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

<<<<<<< HEAD
    if (leftPart.type === 'tool_call' && rightPart.type === 'tool_call') {
      if (leftPart.toolCallId !== rightPart.toolCallId || leftPart.toolName !== rightPart.toolName || leftPart.status !== rightPart.status || leftPart.input !== rightPart.input) return false;
||||||| bc50ba56aa
    if (leftPart.type !== rightPart.type) {
      return false;
    }

    const leftId = readPartId(leftPart);
    const rightId = readPartId(rightPart);
    if (leftId !== rightId) {
      return false;
    }

    if (leftPart.type === 'tool') {
      if (readToolStateRef(leftPart) !== readToolStateRef(rightPart)) {
        return false;
      }
      if (readPartMetadataRef(leftPart) !== readPartMetadataRef(rightPart)) {
        return false;
      }
      if (readToolStatus(leftPart) !== readToolStatus(rightPart)) {
        return false;
      }
      const leftTime = readPartTime(leftPart);
      const rightTime = readPartTime(rightPart);
      if (leftTime.start !== rightTime.start || leftTime.end !== rightTime.end) {
        return false;
      }
      const leftTool = (leftPart as { tool?: unknown }).tool;
      const rightTool = (rightPart as { tool?: unknown }).tool;
      if (leftTool !== rightTool) {
        return false;
      }
      // Compare tool output so streaming updates (e.g., todo list progress)
      // trigger re-renders when the output payload changes.
      const leftOutput = (leftPart as { output?: unknown }).output;
      const rightOutput = (rightPart as { output?: unknown }).output;
      if (leftOutput !== rightOutput) {
        return false;
      }
=======
    if (leftPart.type !== rightPart.type) {
      return false;
    }

    const leftId = readPartId(leftPart);
    const rightId = readPartId(rightPart);
    if (leftId !== rightId) {
      return false;
    }

    if (leftPart.type === 'tool') {
      if (readToolStateRef(leftPart) !== readToolStateRef(rightPart)) {
        return false;
      }
      if (readPartMetadataRef(leftPart) !== readPartMetadataRef(rightPart)) {
        return false;
      }
      if (readToolStatus(leftPart) !== readToolStatus(rightPart)) {
        return false;
      }
      const leftTime = readPartTime(leftPart);
      const rightTime = readPartTime(rightPart);
      if (leftTime.start !== rightTime.start || leftTime.end !== rightTime.end) {
        return false;
      }
      const leftTool = (leftPart as { tool?: unknown }).tool;
      const rightTool = (rightPart as { tool?: unknown }).tool;
      if (leftTool !== rightTool) {
        return false;
      }
      const leftOutput = (leftPart as { output?: unknown }).output;
      const rightOutput = (rightPart as { output?: unknown }).output;
      if (leftOutput !== rightOutput) {
        return false;
      }
>>>>>>> upstream/main
      continue;
    }
<<<<<<< HEAD
    if (leftPart.type === 'tool_result' && rightPart.type === 'tool_result') {
      if (leftPart.toolCallId !== rightPart.toolCallId || leftPart.toolName !== rightPart.toolName || leftPart.output !== rightPart.output || leftPart.error !== rightPart.error || leftPart.isError !== rightPart.isError) return false;
      continue;
||||||| bc50ba56aa

    const leftTime = readPartTime(leftPart);
    const rightTime = readPartTime(rightPart);
    if (leftTime.start !== rightTime.start || leftTime.end !== rightTime.end) {
      return false;
    }

    if (leftPart.type === 'text' || leftPart.type === 'reasoning') {
      if (readPartText(leftPart) !== readPartText(rightPart)) {
        return false;
      }
      // Shell-mode user messages carry their live command state in an
      // injected `shellAction` payload on a synthetic text part; without
      // comparing it, a running→completed transition never re-renders.
      const leftShell = (leftPart as { shellAction?: { command?: unknown; output?: unknown; status?: unknown } }).shellAction;
      const rightShell = (rightPart as { shellAction?: { command?: unknown; output?: unknown; status?: unknown } }).shellAction;
      if (leftShell || rightShell) {
        if (leftShell?.command !== rightShell?.command
          || leftShell?.output !== rightShell?.output
          || leftShell?.status !== rightShell?.status) {
          return false;
        }
      }
=======

    const leftTime = readPartTime(leftPart);
    const rightTime = readPartTime(rightPart);
    if (leftTime.start !== rightTime.start || leftTime.end !== rightTime.end) {
      return false;
    }

    if (leftPart.type === 'text' || leftPart.type === 'reasoning') {
      if (readPartText(leftPart) !== readPartText(rightPart)) {
        return false;
      }
      const leftShell = (leftPart as { shellAction?: { command?: unknown; output?: unknown; status?: unknown } }).shellAction;
      const rightShell = (rightPart as { shellAction?: { command?: unknown; output?: unknown; status?: unknown } }).shellAction;
      if (leftShell || rightShell) {
        if (leftShell?.command !== rightShell?.command
          || leftShell?.output !== rightShell?.output
          || leftShell?.status !== rightShell?.status) {
          return false;
        }
      }
>>>>>>> upstream/main
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
<<<<<<< HEAD
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
||||||| bc50ba56aa
    && left.sessionID === right.sessionID
    && (left as { finish?: unknown }).finish === (right as { finish?: unknown }).finish
    && (left as { status?: unknown }).status === (right as { status?: unknown }).status
    // A running compaction streams its summary into the message itself.
    && (left.role !== 'compaction' || right.role !== 'compaction' || left.summary === right.summary)
    && (left as { mode?: unknown }).mode === (right as { mode?: unknown }).mode
    && (left as { agent?: unknown }).agent === (right as { agent?: unknown }).agent
    && (left as { providerID?: unknown }).providerID === (right as { providerID?: unknown }).providerID
    && (left as { modelID?: unknown }).modelID === (right as { modelID?: unknown }).modelID
    && (left as { variant?: unknown }).variant === (right as { variant?: unknown }).variant
    && (left as { clientRole?: unknown }).clientRole === (right as { clientRole?: unknown }).clientRole
    && (left as { userMessageMarker?: unknown }).userMessageMarker === (right as { userMessageMarker?: unknown }).userMessageMarker
    && ((left as { time?: { created?: unknown; completed?: unknown } }).time?.created ?? null) === ((right as { time?: { created?: unknown; completed?: unknown } }).time?.created ?? null)
    && ((left as { time?: { created?: unknown; completed?: unknown } }).time?.completed ?? null) === ((right as { time?: { created?: unknown; completed?: unknown } }).time?.completed ?? null);
=======
    && left.sessionID === right.sessionID
    && (left as { finish?: unknown }).finish === (right as { finish?: unknown }).finish
    && (left as { status?: unknown }).status === (right as { status?: unknown }).status
    && (left.role !== 'compaction' || right.role !== 'compaction' || left.summary === right.summary)
    && (left.role !== 'compaction' || right.role !== 'compaction'
      || (left.model?.providerID === right.model?.providerID && left.model?.id === right.model?.id))
    && (left as { mode?: unknown }).mode === (right as { mode?: unknown }).mode
    && (left as { agent?: unknown }).agent === (right as { agent?: unknown }).agent
    && (left as { providerID?: unknown }).providerID === (right as { providerID?: unknown }).providerID
    && (left as { modelID?: unknown }).modelID === (right as { modelID?: unknown }).modelID
    && (left as { variant?: unknown }).variant === (right as { variant?: unknown }).variant
    && (left as { clientRole?: unknown }).clientRole === (right as { clientRole?: unknown }).clientRole
    && (left as { userMessageMarker?: unknown }).userMessageMarker === (right as { userMessageMarker?: unknown }).userMessageMarker
    && ((left as { time?: { created?: unknown; completed?: unknown } }).time?.created ?? null) === ((right as { time?: { created?: unknown; completed?: unknown } }).time?.created ?? null)
    && ((left as { time?: { created?: unknown; completed?: unknown } }).time?.completed ?? null) === ((right as { time?: { created?: unknown; completed?: unknown } }).time?.completed ?? null);
>>>>>>> upstream/main
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
  if (left.isFirstAssistantInTurn !== right.isFirstAssistantInTurn) return false;
  if (left.hasEarlierAssistantText !== right.hasEarlierAssistantText) return false;
  if (left.isLastAssistantInTurn !== right.isLastAssistantInTurn) return false;
  if (left.opensAnswerText !== right.opensAnswerText) return false;
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
