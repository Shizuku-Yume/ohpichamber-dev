import type { Message, Session } from '@openchamber/agent-contract'

type UserModelChoice = {
  id: string
  agent?: string
  providerId?: string
  modelId?: string
  variant?: string
}

export const extractAssistantModelChoice = (message: Message): UserModelChoice | null => {
  if (message.role !== 'assistant') {
    return null
  }
  return {
    id: message.messageId,
    providerId: message.providerId,
    modelId: message.modelId,
  }
}

<<<<<<< HEAD
/**
 * Find the latest turn's model/agent choice.
 *
 * Messages whose parts have not been loaded yet are skipped so an incomplete
 * snapshot cannot be treated as authoritative.
 */
export const findLatestUserModelChoice = (messages: readonly Message[]): UserModelChoice | null => {
||||||| bc50ba56aa
/**
 * Find the latest turn's model/agent choice.
 *
 * Messages whose parts have not been loaded yet are skipped so an incomplete
 * snapshot cannot be treated as authoritative.
 */
export const findLatestUserModelChoice = (
  messages: readonly Message[],
  getParts: (messageId: string) => Part[] | undefined,
): UserModelChoice | null => {
=======
export const findLatestUserModelChoice = (
  messages: readonly Message[],
  getParts: (messageId: string) => Part[] | undefined,
): UserModelChoice | null => {
>>>>>>> upstream/main
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'assistant' || message.parts.length === 0) {
      continue
    }
    return extractAssistantModelChoice(message)
  }
  return null
}

export const extractSessionRecordModelChoice = (session: Session | undefined): UserModelChoice | null => {
  void session
  return null
}

export const areModelChoicesEqual = (left: UserModelChoice | null, right: UserModelChoice | null): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  return left.id === right.id
    && left.agent === right.agent
    && left.providerId === right.providerId
    && left.modelId === right.modelId
    && left.variant === right.variant
}

export const shouldPreserveManualModelOverride = ({
  selectionSource,
  savedSessionModel,
  candidate,
}: {
  selectionSource: 'auto' | 'manual' | undefined
  savedSessionModel: { providerId: string; modelId: string } | null | undefined
  candidate: Pick<UserModelChoice, 'providerId' | 'modelId'> | null | undefined
}): boolean => {
  if (selectionSource !== 'manual' || !savedSessionModel?.providerId || !savedSessionModel.modelId) {
    return false
  }
  if (!candidate?.providerId || !candidate.modelId) {
    return true
  }
  return savedSessionModel.providerId !== candidate.providerId
    || savedSessionModel.modelId !== candidate.modelId
}
