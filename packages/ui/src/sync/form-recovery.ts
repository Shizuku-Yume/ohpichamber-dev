import type { Session } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import type { Message, Part } from "@openchamber/agent-contract"
import { isQuestionTool } from "@/lib/toolPresentation"

const RECOVERY_DELAYS_MS = [0, 500, 1500] as const

/** A persisted active question tool without a pending QuestionRequest needs cold-start recovery. */
const isActiveQuestionTool = (part: Part): boolean => {
  if (part.type !== "tool_call" || !isQuestionTool(part.toolName)) return false
  return part.status === "pending_approval" || part.status === "running"
}

/** Inspect only the current canonical turn; older question tools cannot trigger new network work. */
export function hasActiveFormToolInCurrentTurn(messages: readonly Message[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    if (message.role === "user") return false
    if (message.parts.some(isActiveQuestionTool)) return true
  }
  return false
}

export async function recoverPendingFormWithRetry(
  recover: () => Promise<boolean>,
  options?: {
    isCancelled?: () => boolean
    sleep?: (delayMs: number) => Promise<void>
  },
): Promise<boolean> {
  const isCancelled = options?.isCancelled ?? (() => false)
  const sleep = options?.sleep ?? ((delayMs) => new Promise<void>((resolve) => { setTimeout(resolve, delayMs) }))

  for (const delayMs of RECOVERY_DELAYS_MS) {
    if (delayMs > 0) await sleep(delayMs)
    if (isCancelled()) return false
    if (await recover()) return true
  }
  return false
}

export const resolveRecoveryDirectory = (
  session: Pick<Session, "directory"> | null,
  fallback: string | null,
): string | null => normalizePath(session?.directory ?? null) ?? normalizePath(fallback)
