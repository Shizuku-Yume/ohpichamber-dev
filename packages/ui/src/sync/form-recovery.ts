<<<<<<< HEAD
import type { Message, Part } from "@openchamber/agent-contract"
import { isQuestionTool } from "@/lib/toolPresentation"
||||||| bc50ba56aa
import type { Message, Part } from "@/lib/opencode/model"
import { isQuestionTool } from "@/lib/opencode/tools"

type MessageRecord = {
  info: Message
  parts: Part[]
}
=======
import type { Message, Part, Session } from "@/lib/opencode/model"
import { isQuestionTool } from "@/lib/opencode/tools"
import { normalizePath } from "@/lib/pathNormalization"

type MessageRecord = {
  info: Message
  parts: Part[]
}
>>>>>>> upstream/main

const RECOVERY_DELAYS_MS = [0, 500, 1500] as const

<<<<<<< HEAD
/** A persisted active question tool without a pending QuestionRequest needs cold-start recovery. */
const isActiveQuestionTool = (part: Part): boolean => {
  if (part.type !== "tool_call" || !isQuestionTool(part.toolName)) return false
  return part.status === "pending_approval" || part.status === "running"
||||||| bc50ba56aa
/**
 * v2 has no `form` tool: a form is raised by the tool that blocks on it, which
 * today is `question`.
 */
const isActiveFormTool = (part: Part): boolean => {
  if (part.type !== "tool" || !isQuestionTool(part.tool)) return false
  const status = part.state.status
  return status === "pending" || status === "running"
=======
export const resolveRecoveryDirectory = (
  session: Pick<Session, "directory"> | null,
  fallback: string | null,
): string | null => normalizePath(session?.directory ?? null) ?? normalizePath(fallback)

const isActiveFormTool = (part: Part): boolean => {
  if (part.type !== "tool" || !isQuestionTool(part.tool)) return false
  const status = part.state.status
  return status === "pending" || status === "running"
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Inspect only the current canonical turn; older question tools cannot trigger new network work. */
export function hasActiveFormToolInCurrentTurn(messages: readonly Message[]): boolean {
||||||| bc50ba56aa
/**
 * A persisted running form tool without a matching pending-request record
 * is the cold-start recovery signal. Only inspect the current turn so an old,
 * stale tool cannot trigger network work after the user has continued chatting.
 */
export function hasActiveFormToolInCurrentTurn(messages: readonly MessageRecord[]): boolean {
=======
export function hasActiveFormToolInCurrentTurn(messages: readonly MessageRecord[]): boolean {
>>>>>>> upstream/main
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
