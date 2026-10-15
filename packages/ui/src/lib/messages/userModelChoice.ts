import type { Message, Session } from '@openchamber/agent-contract'

export type UserModelChoice = {
  id: string
  agent?: string
  providerId?: string
  modelId?: string
  variant?: string
}

/**
 * The agent/model a turn actually ran on.
 *
 * OpenCode v2 user messages carry no model: the server records the choice on
 * the assistant reply, so the reply is the authority for what the composer
 * should show.
 */
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

/**
 * Find the latest turn's model/agent choice.
 *
 * Messages whose parts have not been loaded yet are skipped so an incomplete
 * snapshot cannot be treated as authoritative.
 */
export const findLatestUserModelChoice = (messages: readonly Message[]): UserModelChoice | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'assistant' || message.parts.length === 0) {
      continue
    }
    return extractAssistantModelChoice(message)
  }
  return null
}

/**
 * The selection OpenCode 2 keeps on the session record itself (`model` with
 * its variant). The record's agent is followed separately, so the choice
 * carries none.
 */
export const extractSessionRecordModelChoice = (session: Session | undefined): UserModelChoice | null => {
  return null
}

/** Field equality, so a re-derived choice keeps its previous reference. */
export const areModelChoicesEqual = (left: UserModelChoice | null, right: UserModelChoice | null): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  return left.id === right.id
    && left.agent === right.agent
    && left.providerId === right.providerId
    && left.modelId === right.modelId
    && left.variant === right.variant
}

/**
 * When the user has a manual session model override, historical user-message
 * metadata must not overwrite it. After a real send the selection store is
 * updated to match the message, so a conflict means the picker was changed
 * after the last prompt — keep the override.
 */
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
