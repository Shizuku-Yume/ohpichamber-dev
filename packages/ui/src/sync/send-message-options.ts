import type { JsonObject } from '@openchamber/agent-contract'
import type { QueuedMessageGoal } from "@/stores/messageQueueStore"
import type { InputHistorySubmission } from "@/stores/useInputHistoryStore"
import type { CanonicalSkillMentions, NewSessionDraftState } from "./session-ui-store"

export type SentMessage = { route: 'command' | 'prompt' | 'shell'; sessionId: string }

type CapturedSendTarget = {
  runtimeKey: string
  sessionId: string
  directory: string
}

export type SendProgress = {
  sessionMinted?: (sessionId: string, chatDirectory: string | null) => void
  messageMinted?: (messageId: string) => void
  requestLeaving?: () => void
}

export type SendMessageOptions = {
  userInitiated?: boolean
  target?: CapturedSendTarget
  sessionId?: string
  directory?: string
  historySubmissions?: InputHistorySubmission[]
  draftSnapshot?: NewSessionDraftState
  delivery?: 'steer'
  skills?: CanonicalSkillMentions
  metadata?: JsonObject
  onSent?: (sent: SentMessage) => void
  queuedGoal?: QueuedMessageGoal | null
  recordEffort?: boolean
  effortRevision?: number
  progress?: SendProgress
}
