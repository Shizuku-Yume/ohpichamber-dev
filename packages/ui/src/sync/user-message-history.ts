
import type { Message, Part } from "@openchamber/agent-contract"
import type { State } from "./types"

type UserMessageHistoryRecord = { message: Message; parts: Part[] }
export type TranscriptPrompt = { text: string; createdAt: number }
type UserMessageHistorySnapshot = {
  sessionId: string
  records: UserMessageHistoryRecord[]
  history: TranscriptPrompt[]
}

const EMPTY_RECORDS: UserMessageHistoryRecord[] = []
const EMPTY_HISTORY: TranscriptPrompt[] = []
export const EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT: UserMessageHistorySnapshot = {
  sessionId: "",
  records: EMPTY_RECORDS,
  history: EMPTY_HISTORY,
}

function getFirstTextFromParts(parts: readonly Part[]): string {
  for (const part of parts) if (part.type === "text" && part.content.length > 0) return part.content
  return ""
}

function areRecordsEqual(left: readonly UserMessageHistoryRecord[], right: readonly UserMessageHistoryRecord[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.message !== right[index]?.message || left[index]?.parts !== right[index]?.parts) return false
  }
  return true
}

export const buildUserMessageHistorySnapshot = (
  state: Pick<State, "message">,
  sessionId: string,
  previous: UserMessageHistorySnapshot = EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT,
): UserMessageHistorySnapshot => {
  if (!sessionId) return EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT
  const messages = state.message[sessionId] ?? []
  const records: UserMessageHistoryRecord[] = []
  for (const message of messages) {
    if (message.role !== "user") continue
    records.push({ message, parts: message.parts })
  }
  if (records.length === 0) {
    return previous.sessionId === sessionId && previous.records.length === 0
      ? previous
      : { sessionId, records: EMPTY_RECORDS, history: EMPTY_HISTORY }
  }
  if (previous.sessionId === sessionId && areRecordsEqual(previous.records, records)) return previous
  const history: TranscriptPrompt[] = []
  for (const record of records) {
    const text = getFirstTextFromParts(record.parts)
    if (text.length > 0) history.push({ text, createdAt: record.message.createdAt })
  }
  return { sessionId, records, history }
}
