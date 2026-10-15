import { CanonicalClient } from "@/api/canonicalClient"
import type { ApprovalRequest, HistoryPage, Message, QuestionRequest, Session, SessionSnapshot, Turn } from "@openchamber/agent-contract"

export function nativeMessage(sessionId = "session-a", messageId = "message-a", createdAt = 1, role: Message["role"] = "user"): Message {
  return { sessionId, messageId, turnId: `turn-${messageId}`, createdAt, role, parts: [{ type: "text", partId: `part-${messageId}`, content: messageId }] }
}

export function nativeTurn(message: Message): Turn {
  return { turnId: message.turnId, sessionId: message.sessionId, runId: "run-a", status: "completed", userMessageId: message.messageId, assistantMessageIds: [], startedAt: message.createdAt, finishedAt: message.createdAt + 1 }
}

export function nativeSnapshot(sessionId = "session-a", messages: Message[] = [nativeMessage(sessionId)]): SessionSnapshot {
  return {
    session: { sessionId, projectId: "project-a", workspaceId: "workspace-a", displayPath: "repo", rootSessionId: sessionId, createdAt: 1, updatedAt: 2, epoch: "epoch-a", headSequence: "4", runtimeStatus: "idle", activeRunId: null },
    cursor: "epoch-a:4", activeRun: null,
    branch: { branchId: "branch-a", branchVersion: "1", leafMessageId: messages.at(-1)?.messageId ?? null },
    window: { firstTurnId: messages[0]?.turnId ?? null, lastTurnId: messages.at(-1)?.turnId ?? null, firstMessageId: messages[0]?.messageId ?? null, lastMessageId: messages.at(-1)?.messageId ?? null, hasEarlier: false },
    messages, turns: messages.map(nativeTurn), approvals: [], questions: [], requestRecovery: { pendingSet: "replace", priorEpochs: "expired" },
  }
}

export function nativeHostSession(snapshot: SessionSnapshot = nativeSnapshot()): Session {
  return { ...snapshot.session, metadata: { title: "Saved title" }, metadataRevision: "5", archiveRevision: "8", archivedAt: 3 }
}

export function nativeHistory(messages: Message[], nextCursor: string | null = null, snapshot: SessionSnapshot = nativeSnapshot(messages[0]?.sessionId)): HistoryPage {
  return { sessionId: snapshot.session.sessionId, branch: snapshot.branch, messages, turns: messages.map(nativeTurn), nextCursor }
}

export function nativeApproval(sessionId = "session-a", epoch = "epoch-a"): ApprovalRequest {
  return { approvalId: "approval-a", sessionId, turnId: "turn-a", toolCallId: "tool-a", toolName: "bash", actionType: "bash_command", commandSummary: "pwd", details: {}, status: "pending", requestedAt: 1, epoch, version: "1", workerGeneration: "worker-a" }
}

export function nativeQuestion(sessionId = "session-a", epoch = "epoch-a"): QuestionRequest {
  return { questionId: "question-a", sessionId, turnId: "turn-a", prompt: "Continue?", status: "pending", requestedAt: 1, epoch, version: "1", workerGeneration: "worker-a" }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail })
  return { promise, resolve, reject }
}

export function nativeClient(overrides: Partial<Pick<CanonicalClient, "getSnapshot" | "getHistory" | "getSessionMetadata" | "getQueue" | "listSessions" | "resolveWorkspace">> = {}): CanonicalClient {
  return Object.assign(new CanonicalClient(), {
    resolveWorkspace: async () => ({ workspaceId: "workspace-a", projectId: "project-a", name: "Workspace" }),
    getSnapshot: async (sessionId: string) => nativeSnapshot(sessionId),
    getHistory: async (sessionId: string) => nativeHistory([], null, nativeSnapshot(sessionId)),
    getSessionMetadata: async (sessionId: string) => ({ sessionId, metadata: null, revision: "0" }),
    getQueue: async (sessionId: string) => ({ sessionId, revision: "0", items: [] }),
    listSessions: async () => ({ items: [], errors: {} }),
  }, overrides)
}
