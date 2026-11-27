import type { Message, Run, Session, SessionRuntimeStatus, Turn } from '@openchamber/agent-contract'
import { isAutoModel } from '@/lib/routing/autoModel'

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

export type ModelPair = {
  providerId: string
  modelId: string
}

const isActiveRuntimeStatus = (status?: SessionRuntimeStatus): boolean => (
  status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input'
)

export const isSessionRunActive = ({
  status,
  sessionRuntimeStatus,
  activeRun,
}: {
  status?: SessionRuntimeStatus
  sessionRuntimeStatus?: SessionRuntimeStatus
  activeRun?: Run | null
}): boolean => {
  if (activeRun && (activeRun.status === 'pending' || activeRun.status === 'running')) {
    return true
  }
  return isActiveRuntimeStatus(status) || isActiveRuntimeStatus(sessionRuntimeStatus)
}

export const resolveActiveRunModelSelection = ({
  isRunActive,
  activeRun,
  turns,
  messages,
  snapshotSelectionModel,
  sessionSavedModel,
  autoReady,
  isStaleAuto,
}: {
  isRunActive: boolean
  activeRun?: Run | null
  turns?: readonly Turn[]
  messages?: readonly Message[]
  snapshotSelectionModel?: ModelPair | null
  sessionSavedModel?: ModelPair | null
  autoReady?: boolean
  isStaleAuto?: boolean
}): ModelPair | null => {
  if (!isRunActive) {
    return null
  }
  if (
    sessionSavedModel
    && isAutoModel(sessionSavedModel.providerId, sessionSavedModel.modelId)
    && isStaleAuto === false
    && autoReady
  ) {
    return sessionSavedModel
  }
  const lastTurn = turns && turns.length > 0 ? turns[turns.length - 1] : undefined
  const activeTurn = activeRun
    ? (turns ? [...turns].reverse().find((turn) => turn.runId === activeRun.runId) : undefined)
    : (lastTurn?.status === 'running' ? lastTurn : undefined)
  if (activeTurn && messages && messages.length > 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role !== 'assistant' || !message.providerId || !message.modelId) {
        continue
      }
      if (message.turnId !== activeTurn.turnId && !activeTurn.assistantMessageIds.includes(message.messageId)) {
        continue
      }
      return { providerId: message.providerId, modelId: message.modelId }
    }
  }
  if (sessionSavedModel && sessionSavedModel.providerId && sessionSavedModel.modelId && !isStaleAuto) {
    return sessionSavedModel
  }
  if (snapshotSelectionModel && snapshotSelectionModel.providerId && snapshotSelectionModel.modelId) {
    return snapshotSelectionModel
  }
  return null
}
