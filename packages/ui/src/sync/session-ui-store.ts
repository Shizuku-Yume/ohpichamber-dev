
import type { InputHistorySubmission } from '@/stores/useInputHistoryStore';

export type CanonicalSkillMentions = {
  names: readonly string[]
}
import type { ContextPartMetadata } from "@/lib/messages/contextParts"
import { create } from "zustand"
import type { StoreApi, UseBoundStore } from "zustand"
import type { FileResourceExpandResult, PromptAttachment, PromptContext, PromptRequest, Session, SessionMetadata, Message as CanonicalMessage, Workspace } from "@openchamber/agent-contract"
import type { AttachedFile, SessionWorktreeAttachment } from "@/stores/types/sessionTypes"
import type { WorktreeMetadata } from "@/types/worktree"
import { runtimeFetch } from "@/lib/runtime-fetch"
import type { PermissionMode } from "@/stores/utils/permissionAutoAccept"
import { toast } from "sonner"
import { canonicalClient } from "@/api/canonicalClient"
import { prepareAttachmentsHeldForSend } from "./held-attachments"
import { draftSessionMetadata } from "./draft-session-metadata"
import { problemMessage } from "@/lib/problemMessage"
import { useConfigStore } from "@/stores/useConfigStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionDisplayStore } from "@/stores/useSessionDisplayStore"
import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { isDirectoryUnknown, useDirectoryStore } from "@/stores/useDirectoryStore"
import { hostFilesystem } from "@/lib/host-filesystem"
import { useSessionFoldersStore } from "@/stores/useSessionFoldersStore"
import { expandNativeFileResource } from '@/api/fileResourceExpansion'
import { selectAvailableSkillsForDirectory, useSkillsStore } from "@/stores/useSkillsStore"
import { getDeferredSafeStorage } from "@/stores/utils/safeStorage"
import { markPendingUserSendAnimation } from "@/lib/userSendAnimation"
import { getMultiRunMembership, withMultiRunMembership } from "@/lib/multirun/identity"
import { normalizePath } from "@/lib/pathNormalization"
import { CHAT_DRAFT_PROJECT_ID, createChatDirectory, deleteChatDirectory, getChatsRootFromDirectory, isChatDirectoryPath, warmChatsRootDirectory } from "@/lib/chatDirectories"
import { composeForkSessionMessage } from "@/lib/messages/executionMeta"
import { noteDraftSendWaiting, waitForPendingDraftWorktreeRequest } from "@/lib/worktrees/pendingDraftWorktree"
import { waitForWorktreeBootstrap } from "@/lib/worktrees/worktreeBootstrap"
import { isDirectoryInRemovingWorktree } from "@/lib/worktrees/worktreeRemovalState"
import { getWorktreeSetupWaitEnabled } from "@/lib/openchamberConfig"
import { createSessionDraftId } from "@/stores/useSessionDraftsStore"
import { resolveProjectForSessionDirectory } from "@/lib/projectResolution"
import {
  getSyncSessions,
  getAllSyncSessions,
  getSyncMessages,
  getDirectoryState,
  getSyncSessionDirectory,
} from "./sync-refs"
import {
  resolveSessionDirectoryFromSources,
  type SessionDirectoryResolution,
  type SessionDirectorySources,
} from "./session-directory-resolution"
import { markSessionViewed } from "./notification-store"
import { releaseKeptUnreadMarks } from "./session-unread"
import { setActiveSession } from "./sync-context"
import { registerSessionDirectory } from "./sync-refs"
import { getImperativeSessionMessageLoader } from "./session-message-loader"
import {
  createSession as createSessionAction,
  sendMessage as sendMessageAction,
  optimisticAdd,
  optimisticRemove,
  type SessionCreateSelection,
  deleteSession as deleteSessionAction,
  deleteSessions as deleteSessionsAction,
  archiveSession as archiveSessionAction,
  archiveSessions as archiveSessionsAction,
  unarchiveSession as unarchiveSessionAction,
  unarchiveSessions as unarchiveSessionsAction,
  updateSessionTitle as updateSessionTitleAction,
  forkFromMessage as forkFromMessageAction,
  forkAfterMessage as forkAfterMessageAction,
  fetchMessagesForSession,
  refetchSessionMessages,
  retireRekeyedSession,
  revertToMessage as revertToMessageAction,
  clearStagedRevert,
  type ArchiveSessionsOptions,
  type DeleteSessionOptions,
  type DeleteSessionsOptions,
  type UnarchiveSessionsOptions,
} from "./session-actions"
import { useInputStore, type SyntheticContextPart } from "./input-store"
import { useSessionGoalArmStore } from "@/stores/useSessionGoalArmStore"
import { useUIStore } from "@/stores/useUIStore"
import { ROOT_SELECTION_AGENT, useSelectionStore } from "./selection-store"
import { getViewportSessionMemory, useViewportStore, viewportSessionKey } from "./viewport-store"
import { useSessionWorktreeStore } from "./session-worktree-store"
import { getAttachedSessionDirectory } from "./session-worktree-contract"
import { getRuntimeKey, getRuntimeSwitchRevision, isTransientRuntimeKey } from "@/lib/runtime-switch"
import { clearLastActiveSession, persistLastActiveSession, readLastActiveSession } from "./last-session-cache"
import { persistWorktreeTopology, readPersistedWorktreeTopology } from "./worktree-topology-cache"
import { rememberRuntimeLiveStatus } from "./runtime-live-memory"
import {
  createInputHistoryIdentity,
  useInputHistoryStore,
} from '@/stores/useInputHistoryStore'

export type { AttachedFile }



/**
 * Build the native prompt selection captured at submit time. Session records
 * deliberately do not carry model or agent fields; the PromptRequest does.
 */
export function resolveSendSelection(
  _sessionId: string,
  _directory: string | undefined,
  desired: { providerId: string; modelId: string; variant?: string; agentId?: string | null; reasoningEffort?: string },
): PromptRequest['options'] {
  return {
    providerId: desired.providerId,
    modelId: desired.modelId,
    agentId: desired.agentId ?? null,
    variant: desired.variant ?? null,
    reasoningEffort: desired.reasoningEffort ?? null,
  }
}

type CanonicalSkillScope = {
  sessionId: string
  rootSessionId: string
  workspaceId: string
  projectId: string
}

const resolveCanonicalSkillScope = (sessionId: string): CanonicalSkillScope => {
  const session = getAllSyncSessions().find((candidate) => candidate.sessionId === sessionId)
  if (!session) throw new Error("Cannot expand a skill without an authoritative session record")
  return {
    sessionId: session.sessionId,
    rootSessionId: session.rootSessionId,
    workspaceId: session.workspaceId,
    projectId: session.projectId,
  }
}

export const expandCanonicalSkills = async (
  sessionId: string,
  names: readonly string[],
  argumentsText = "",
  runtimeKey = getRuntimeKey(),
  runtimeRevision = getRuntimeSwitchRevision(),
): Promise<string | null> => {
  const uniqueNames = [...new Set(names)]
  if (uniqueNames.length === 0) return null
  const scope = resolveCanonicalSkillScope(sessionId)
  const catalog = await canonicalClient.getSkillsCatalog(scope)
  assertSendRuntime(runtimeKey, runtimeRevision)
  const byName: Record<string, (typeof catalog.skills)[number]> = Object.fromEntries(
    catalog.skills.map((skill) => [skill.name, skill]),
  )
  const expansions: string[] = []
  for (const name of uniqueNames) {
    const skill = byName[name]
    if (!skill) throw new Error(`Skill "${name}" is unavailable in the active catalog`)
    const result = await canonicalClient.expandSkill(scope, {
      skillId: skill.skillId,
      catalogRevision: catalog.catalogRevision,
      workerGeneration: catalog.worker.workerGeneration,
      arguments: argumentsText,
    })
    assertSendRuntime(runtimeKey, runtimeRevision)
    if (result.message.trim()) expansions.push(result.message)
  }
  return expansions.length > 0 ? expansions.join("\n\n") : null
}

const assertSendRuntime = (runtimeKey: string, runtimeRevision = getRuntimeSwitchRevision()): void => {
  if (runtimeKey !== getRuntimeKey() || runtimeRevision !== getRuntimeSwitchRevision()) {
    throw new Error("Message was not sent because the runtime changed.")
  }
}

export async function routeMessage(params: {
  runtimeKey?: string
  runtimeRevision?: number
  sessionId: string
  directory?: string | null
  content: string
  providerID: string
  modelID: string
  agent?: string
  agentMentionName?: string
  variant?: string
  reasoningEffort?: string
  inputMode?: "normal" | "shell"
  files?: PromptAttachment[]
  additionalParts?: Array<{ text: string; synthetic?: boolean; metadata?: ContextPartMetadata; files?: PromptAttachment[]; systemContext?: 'session-knowledge' }>
  appendSubmissions?: () => void
  delivery?: 'run' | 'steer' | 'follow-up'
  /** Host idempotency key; never a slash command name. */
  commandId?: string
  skills?: CanonicalSkillMentions
  /** Queue capture already ran the native pipeline and preserved the resulting selection. */
  fileResourcesExpanded?: boolean
  /** Goal preparation reuses its authoritative expansion when the prompt is delivered. */
  fileResourceExpansion?: FileResourceExpandResult | null
}): Promise<'command' | 'prompt' | 'shell'> {
  const runtimeKey = params.runtimeKey ?? getRuntimeKey()
  const runtimeRevision = params.runtimeRevision ?? getRuntimeSwitchRevision()
  assertSendRuntime(runtimeKey, runtimeRevision)
  const requestDirectory = params.directory ?? undefined
  const sendSelection = resolveSendSelection(params.sessionId, requestDirectory, {
    providerId: params.providerID,
    modelId: params.modelID,
    variant: params.variant,
    agentId: params.agent,
    reasoningEffort: params.reasoningEffort,
  })

  const additionalContext: PromptContext[] = (params.additionalParts ?? [])
    .filter((part) => part.text.trim().length > 0)
    .map((part) => part.metadata
      ? { kind: 'context', text: part.text, metadata: part.metadata }
      : part.synthetic
        ? { kind: 'synthetic', text: part.text }
        : { kind: 'instruction', text: part.text })
  const skillText = params.skills?.names.length
    ? await expandCanonicalSkills(params.sessionId, params.skills.names, '', runtimeKey, runtimeRevision)
    : null
  const context: PromptContext[] = [
    ...additionalContext,
    ...(skillText ? [{ kind: 'instruction' as const, text: skillText }] : []),
  ]
  const request: PromptRequest = {
    input: {
      text: params.content,
      attachments: [...(params.files ?? []), ...(params.additionalParts ?? []).flatMap((part) => part.files ?? [])],
      context,
      ...(params.agentMentionName ? { agentMention: { agentId: params.agentMentionName } } : {}),
    },
    options: sendSelection,
  }
  const dispatchPrompt = async (): Promise<void> => {
    assertSendRuntime(runtimeKey, runtimeRevision)
    params.appendSubmissions?.()
    await sendMessageAction({
      sessionId: params.sessionId,
      directory: params.directory,
      request,
      mode: params.delivery ?? 'run',
      runtimeKey,
      runtimeRevision,
      commandId: params.commandId,
      optimistic: !params.delivery || params.delivery === 'run',
    })
    assertSendRuntime(runtimeKey, runtimeRevision)
  }

  if (params.inputMode === "shell") {
    assertSendRuntime(runtimeKey, runtimeRevision)
    await canonicalClient.startShell(params.sessionId, { command: params.content, background: false }, params.commandId)
    assertSendRuntime(runtimeKey, runtimeRevision)
    return 'shell'
  }

  if (!params.fileResourcesExpanded && params.content.startsWith('/')) {
    const expanded = params.fileResourceExpansion === undefined
      ? await expandNativeFileResource(params.content, requestDirectory)
      : params.fileResourceExpansion
    assertSendRuntime(runtimeKey, runtimeRevision)
    if (expanded) {
      request.input.text = expanded.content
      if (expanded.modelSelection) request.options = { ...request.options, ...expanded.modelSelection }
      if (expanded.agentId) request.options = { ...request.options, agentId: expanded.agentId }
      await dispatchPrompt()
      return 'command'
    }
    const invocation = /^\/([^\s]+)(?:\s([\s\S]*))?$/.exec(params.content)
    const matchedSkill = selectAvailableSkillsForDirectory(useSkillsStore.getState(), requestDirectory)
      .find(skill => skill.name === invocation?.[1])
    if (matchedSkill) {
      const expandedSkill = await expandCanonicalSkills(params.sessionId, [matchedSkill.name], invocation?.[2] ?? '', runtimeKey, runtimeRevision)
      if (expandedSkill) request.input.context = [...request.input.context, { kind: 'instruction', text: expandedSkill }]
    }
  }

  await dispatchPrompt()
  return 'prompt'
}

const encodeAttachmentFile = async (file: Blob): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const admitPromptAttachments = async (
  attachments: readonly AttachedFile[] | undefined,
  sessionId: string,
  runtimeKey: string,
  runtimeRevision: number,
  directory: string | null,
): Promise<PromptAttachment[] | undefined> => {
  assertSendRuntime(runtimeKey, runtimeRevision)
  if (!attachments?.length) return undefined
  let workspaceId: string | undefined
  const admitted: PromptAttachment[] = []
  const prepared = attachments.some((file) => file.saveOnSend || file.saveCopyOnSend)
    ? await prepareAttachmentsHeldForSend(attachments, directory, () => runtimeKey === getRuntimeKey() && runtimeRevision === getRuntimeSwitchRevision())
    : attachments
  for (const attachment of prepared) {
    assertSendRuntime(runtimeKey, runtimeRevision)
    const uri = attachment.serverPath?.startsWith('attachment://')
      ? attachment.serverPath
      : attachment.dataUrl
    const attachmentId = /^attachment:\/\/([^/?#]+)$/.exec(uri)?.[1]
    if (attachmentId) {
      admitted.push({
        attachmentId,
        name: attachment.filename,
        mediaType: attachment.mimeType,
        size: attachment.size,
        uri,
      })
      continue
    }
    let file: Blob = attachment.file
    if (attachment.source === 'server') {
      const sourcePath = attachment.serverPath ?? attachment.dataUrl
      const path = sourcePath.startsWith('file://')
        ? decodeURIComponent(sourcePath.slice(7)).replace(/^\/([A-Za-z]:\/)/, '$1')
        : sourcePath
      if (!path || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) {
        throw new Error("Server attachment has no native identity or Host file path.")
      }
      // Explicitly attached Host paths use the existing authenticated read
      // policy, including its outside-workspace and OS authorization.
      const response = await runtimeFetch('/api/fs/raw', {
        query: { path, directory: directory ?? undefined, allowOutsideWorkspace: 'true' },
      })
      assertSendRuntime(runtimeKey, runtimeRevision)
      if (!response.ok) throw new Error("Failed to read attachment file bytes")
      file = await response.blob()
      assertSendRuntime(runtimeKey, runtimeRevision)
    }
    if (!workspaceId) {
      workspaceId = getAllSyncSessions().find((session) => session.sessionId === sessionId)?.workspaceId
      if (!workspaceId) {
        const snapshot = await canonicalClient.getSession(sessionId)
        assertSendRuntime(runtimeKey, runtimeRevision)
        workspaceId = snapshot.session.workspaceId
      }
    }
    const data = await encodeAttachmentFile(file)
    assertSendRuntime(runtimeKey, runtimeRevision)
    const uploaded = await canonicalClient.uploadAttachment(
      workspaceId,
      { name: attachment.filename, mediaType: attachment.mimeType, size: file.size },
      data,
    )
    assertSendRuntime(runtimeKey, runtimeRevision)
    admitted.push({
      attachmentId: uploaded.attachmentId,
      name: uploaded.name,
      mediaType: uploaded.mediaType,
      size: uploaded.size,
      uri: uploaded.uri,
    })
  }
  return admitted
}
type CapturedSendTarget = {
  runtimeKey: string
  sessionId: string
  directory: string
}

type SendMessageOptions = {
  onSessionCreated?: (target: { sessionId: string; directory: string | null }) => void
  target?: CapturedSendTarget
  runtimeRevision?: number
  sessionId?: string
  directory?: string
  historySubmissions?: InputHistorySubmission[]
  /** Immutable copy of the new-session draft at submit time; used instead of the live draft. */
  draftSnapshot?: NewSessionDraftState
  delivery?: 'run' | 'steer' | 'follow-up'
  commandId?: string
  reasoningEffort?: string
  /** Skills named inline, attached to the prompt once the session exists. */
  skills?: CanonicalSkillMentions
  fileResourcesExpanded?: boolean
}

type AssistantMessageSessionExecution = {
  providerId: string
  modelId: string
  variant: string
  instructions: string
  createWorktree?: boolean
  runAsGoal?: boolean
}

type AssistantMessageSessionSource = {
  sessionId: string
  directory: string
  text: string
}




type NewSessionDraftTarget = "chat" | "project"

/** Modes a draft can hold before its session exists; Main is the absence of a value. */
export type DraftSessionMode = "plan" | "vibe" | "goal"
export type DraftGoalObjective = { objective: string; tokenBudget: number | null }

export type NewSessionDraftState = {
  draftId: number
  workDraftId?: string | null
  open: boolean
  selectedProjectId?: string | null
  directoryOverride: string | null
  permissionMode?: PermissionMode
  /** Chosen with the composer's mode dropdown; applied after the session is created. */
  mode?: DraftSessionMode
  /** Required for `mode: "goal"`; creates the native goal and its first turn instead of a prompt. */
  goalObjective?: DraftGoalObjective
  pendingWorktreeRequestId?: string | null
  bootstrapPendingDirectory?: string | null
  preserveDirectoryOverride?: boolean
  parentID: string | null
  title?: string
  initialPrompt?: string
  syntheticParts?: SyntheticContextPart[]
  targetFolderId?: string
  projectContextPins?: { notes: string[]; plans: string[] }
  target: NewSessionDraftTarget
  preparedChatDirectory?: string | null
}

export type SessionUIState = {
  currentSessionId: string | null
  currentSessionDirectory: string | null
  materializedDraftSessionId: string | null
  newSessionDraft: NewSessionDraftState
  abortPromptSessionId: string | null
  abortPromptExpiresAt: number | null
  error: string | null
  worktreeMetadata: Map<string, WorktreeMetadata>
  availableWorktrees: WorktreeMetadata[]
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>
  worktreeDiscoveryByProject: ReadonlyMap<string, 'loading' | 'ready' | 'error'>
  webUICreatedSessions: Set<string>
  sessionAbortFlags: Map<string, { timestamp: number; acknowledged: boolean }>
  abortControllers: Map<string, AbortController>
  isLoading: boolean
  lastLoadedDirectory: string | null
  // Plan mode - per-session plan file availability (set when plan_enter tool creates a plan)
  sessionPlanAvailable: Map<string, boolean>
  markSessionPlanAvailable: (sessionId: string) => void
  isSessionPlanAvailable: (sessionId: string) => boolean

  // Non-Git mode: dismissed signature hash per session, hides bar until new turn arrives

  setCurrentSession: (
    id: string | null,
    directoryHint?: string | null,
    transition?: "submitted-draft",
  ) => void
  clearMaterializedDraftSession: (sessionId: string) => void
  prepareForRuntimeSwitch: (apiBaseUrl?: string | null) => void
  restoreForRuntimeSwitch: (apiBaseUrl?: string | null, previousRuntimeKey?: string | null) => void
  openNewSessionDraft: (options?: Partial<NewSessionDraftState> & { automatic?: boolean }) => void
  prepareChatDraftDirectory: (draftSnapshot?: NewSessionDraftState, runtimeKey?: string, runtimeRevision?: number) => Promise<string | null>
  closeNewSessionDraft: () => void
  setNewSessionDraftTarget: (target: { projectId?: string | null; selectedProjectId?: string | null; directoryOverride?: string | null }, options?: { force?: boolean }) => void
  setDraftPreserveDirectoryOverride: (value: boolean) => void
  setDraftPermissionMode: (mode: PermissionMode) => void
  setDraftMode: (mode: "main" | DraftSessionMode, goalObjective?: DraftGoalObjective | null) => void
  setDraftProjectContextPin: (kind: "note" | "plan", id: string, pinned: boolean) => void
  acknowledgeSessionAbort: (sessionId: string) => void
  clearAbortPrompt: () => void
  armAbortPrompt: (durationMs?: number, sessionId?: string) => number | null
  clearError: () => void
  markSessionAsOpenChamberCreated: (sessionId: string) => void
  isOpenChamberCreatedSession: (sessionId: string) => boolean
  setWorktreeMetadata: (sessionId: string, metadata: WorktreeMetadata | null, cwd?: string) => void
  overrideNewSessionDraftTarget: (options: Record<string, unknown>) => void
  resolvePendingDraftWorktreeTarget: (requestId: string, directory: string | null, options?: Record<string, unknown>) => void
  setDraftBootstrapPendingDirectory: (directory: string | null) => void
  setPendingDraftWorktreeRequest: (requestId: string | null) => void
  getWorktreeMetadata: (sessionId: string) => WorktreeMetadata | undefined

  sendMessage: (
    content: string,
    providerID: string,
    modelID: string,
    agent?: string | null,
    attachments?: AttachedFile[],
    agentMentionName?: string,
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata; systemContext?: 'session-knowledge' }>,
    variant?: string,
    inputMode?: "normal" | "shell",
    options?: SendMessageOptions,
  ) => Promise<void>

  createSession: (
    title?: string,
    directoryOverride?: string | null,
    metadata?: SessionMetadata,
    selection?: SessionCreateSelection,
  ) => Promise<Session | null>
  /**
   * Seeds the in-memory selection a fresh session sends its first message
   * with, from the catalog of the agents it was created against. The
   * authoritative record stays with the session; this only fills the composer
   * state that `sendMessage` reads for a session nothing has opened yet.
   */
  initializeNewOpenChamberSession: (sessionId: string, agents: readonly unknown[]) => void
  deleteSession: (sessionId: string, options?: DeleteSessionOptions) => Promise<boolean>
  deleteSessions: (sessionIds: string[], options?: DeleteSessionsOptions) => Promise<{ deletedIds: string[]; failedIds: string[] }>
  archiveSession: (sessionId: string) => Promise<boolean>
  archiveSessions: (sessionIds: string[], options?: ArchiveSessionsOptions) => Promise<{ archivedIds: string[]; failedIds: string[] }>
  unarchiveSession: (sessionId: string) => Promise<boolean>
  unarchiveSessions: (sessionIds: string[], options?: UnarchiveSessionsOptions) => Promise<{ restoredIds: string[]; failedIds: string[] }>
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>
  revertToMessage: (sessionId: string, messageId: string, options?: { skipRedoPush?: boolean }) => Promise<void>
  handleSlashUndo: (sessionId: string) => Promise<void>
  handleSlashRedo: (sessionId: string) => Promise<void>
  forkFromMessage: (sessionId: string, messageId: string) => Promise<void>
  forkAfterMessage: (sessionId: string, messageId: string) => Promise<void>
  createSessionFromAssistantMessage: (source: AssistantMessageSessionSource, execution: AssistantMessageSessionExecution) => Promise<void>

  getSessionsByDirectory: (directory: string) => Session[]
  getDirectoryForSession: (sessionId: string) => string | null
  getLastUserChoice: (sessionId: string) => { agent?: string; providerId?: string; modelId?: string; variant?: string } | null
  getCurrentAgent: (sessionId: string) => string | undefined
  debugSessionMessages: (sessionId: string) => Promise<void>
  pollForTokenUpdates: () => void
  setSessionDirectory: (sessionId: string, directory: string | null) => void
  /**
   * Follow a session the Agent Service rekeyed to a new id (a completed `/btw`
   * branch mints a new native session). The pre-branch id is retired by the
   * service and the Host, so every identity keyed by it — the selected
   * session, the projected row, cached history and the active stream — is
   * replaced in one publish before any later read can address the old id.
   */
  rekeySession: (previousSessionId: string, sessionId: string, directory?: string | null) => void
  /**
   * Replace a guessed selection directory with the authoritative one once sync
   * has indexed the session. Safe to call at any time: it only ever promotes a
   * guess, never overrides a confirmed selection.
   */
  adoptAuthoritativeSessionDirectory: (sessionId?: string) => void
}



const resolveDirectoryKey = (session: Session): string | null => {
  return normalizePath(resolveGlobalSessionDirectory(session))
    ?? normalizePath(getSyncSessionDirectory(session.sessionId))
}

const safeStorage = getDeferredSafeStorage()
const DRAFT_TARGET_STORAGE_KEY = "oc.chatInput.lastDraftTarget"

type PersistedDraftTarget = {
  projectId: string | null
  directory: string | null
  target: NewSessionDraftTarget | null
}

const readPersistedDraftTarget = (): PersistedDraftTarget | null => {
  try {
    const raw = safeStorage.getItem(DRAFT_TARGET_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { projectId?: unknown; directory?: unknown; target?: unknown }
    return {
      projectId: typeof parsed?.projectId === "string" ? parsed.projectId : null,
      directory: normalizePath(typeof parsed?.directory === "string" ? parsed.directory : null),
      target: parsed?.target === "chat" || parsed?.target === "project" ? parsed.target : null,
    }
  } catch {
    return null
  }
}

const persistDraftTarget = (target: PersistedDraftTarget): void => {
  try {
    safeStorage.setItem(DRAFT_TARGET_STORAGE_KEY, JSON.stringify(target))
  } catch { /* ignored */ }
}

const resolveDraftProjectForDirectory = resolveProjectForSessionDirectory

const getAttachmentForSession = (sessionId: string | null | undefined): SessionWorktreeAttachment | undefined => {
  if (!sessionId) return undefined
  return useSessionWorktreeStore.getState().getAttachment(sessionId)
}

const getAuthoritativeSessionDirectory = (sessionId: string): string | null => {
  const target = getAllSyncSessions().find((s) => s.sessionId === sessionId)
  const recordDirectory = target ? resolveDirectoryKey(target) : null
  if (recordDirectory) return normalizePath(recordDirectory)
  const globalSession = useGlobalSessionsStore.getState().entityById.get(sessionId)
  const globalDirectory = globalSession ? normalizePath(resolveGlobalSessionDirectory(globalSession)) : null
  if (globalDirectory) return globalDirectory
  const owningDirectory = getSyncSessionDirectory(sessionId)
  return owningDirectory ? normalizePath(owningDirectory) : null
}

export const getRememberedSessionDirectory = (sessionId: string): {
  runtime: string | null
  persisted: string | null
} => {
  const key = runtimeMemoryKey()
  const runtimeMemory = runtimeSessionMemory.get(key)
  const persisted = readLastActiveSession(key)
  return {
    runtime: runtimeMemory?.sessionId === sessionId ? normalizePath(runtimeMemory.directory) : null,
    persisted: persisted?.sessionId === sessionId ? normalizePath(persisted.directory) : null,
  }
}

let guessedSelectionSessionId: string | null = null

const collectSessionDirectorySources = (
  sessionId: string,
  getWtMeta: (id: string) => WorktreeMetadata | undefined,
  selected: string | null,
): SessionDirectorySources => ({
  authoritative: getAuthoritativeSessionDirectory(sessionId),
  selected: sessionId === guessedSelectionSessionId ? null : normalizePath(selected),
  attachment: getAttachedSessionDirectory(getAttachmentForSession(sessionId)),
  worktreeMetadata: normalizePath(getWtMeta(sessionId)?.path ?? null),
  remembered: getRememberedSessionDirectory(sessionId).runtime,
})

const reportedDirectoryConflicts = new Set<string>()
const MAX_REPORTED_DIRECTORY_CONFLICTS = 200

const reportSessionDirectoryConflict = (
  sessionId: string,
  resolution: SessionDirectoryResolution,
): void => {
  if (!resolution.conflict) return
  const conflictKey = JSON.stringify([
    runtimeMemoryKey(),
    sessionId,
    resolution.directory,
    resolution.conflict.source,
    resolution.conflict.directory,
  ])
  if (reportedDirectoryConflicts.has(conflictKey)) return
  if (reportedDirectoryConflicts.size >= MAX_REPORTED_DIRECTORY_CONFLICTS) {
    reportedDirectoryConflicts.clear()
  }
  reportedDirectoryConflicts.add(conflictKey)
  console.warn(
    "[session-directory] session directory sources disagree; using the higher-authority one. "
    + "Run __opencodeDebug.diagnoseSessionDirectory() for the full picture.",
    {
      sessionId,
      using: resolution.source,
      directory: resolution.directory,
      conflictingSource: resolution.conflict.source,
      conflictingDirectory: resolution.conflict.directory,
    },
  )
}

const resolveSessionDirectory = (
  sessionId: string | null | undefined,
  getWtMeta: (id: string) => WorktreeMetadata | undefined,
  selected: string | null = null,
): string | null => {
  if (!sessionId) return null
  const resolution = resolveSessionDirectoryFromSources(
    collectSessionDirectorySources(sessionId, getWtMeta, selected),
  )
  reportSessionDirectoryConflict(sessionId, resolution)
  return resolution.directory
}

const activateConfigForDirectory = async (
  directory: string | null | undefined,
  options?: { preserveManualModel?: boolean },
): Promise<void> => {
  await useConfigStore.getState().activateDirectory(normalizePath(directory), options)
}

const applyDraftTargetSelectionDefaults = (
  draft: NewSessionDraftState,
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  selectedProjectOverride?: {
    path?: string | null
    defaultModel?: string | null
    defaultVariant?: string | null
  } | null,
  previousDraft?: NewSessionDraftState,
): void => {
  if (!draft.open) return
  const projects = useProjectsStore.getState().projects
  const selectedProject = draft.target !== "project"
    ? null
    : (selectedProjectOverride
      ?? (draft.selectedProjectId
        ? projects.find((project) => project.id === draft.selectedProjectId) ?? null
        : resolveDraftProjectForDirectory(
          projects,
          availableWorktreesByProject,
          normalizePath(draft.directoryOverride ?? null),
        )))

  const configDirectory = normalizePath(draft.directoryOverride ?? null)
    ?? normalizePath(selectedProject?.path ?? null)

  if (previousDraft?.open && previousDraft.draftId === draft.draftId && previousDraft.target === draft.target) {
    const previousProject = previousDraft.target !== 'project' ? null
      : projects.find((project) => project.id === previousDraft.selectedProjectId)
      ?? resolveDraftProjectForDirectory(projects, availableWorktreesByProject, normalizePath(previousDraft.directoryOverride ?? null))
    const previousConfigDirectory = normalizePath(previousDraft.directoryOverride ?? null)
      ?? normalizePath(previousProject?.path ?? null)
    if (previousConfigDirectory === configDirectory) return
  }

  const runtimeKey = getRuntimeKey()
  const revision = ++draftDefaultsRevision
  const projectChanged = !previousDraft || previousDraft.target !== draft.target
    || previousDraft.selectedProjectId !== draft.selectedProjectId
  const applyDefaults = () => {
    if (!projectChanged) return
    const currentProject = selectedProject?.path
      ? useProjectsStore.getState().projects.find((project) => normalizePath(project.path) === normalizePath(selectedProject.path))
      : undefined
    useConfigStore.getState().applyDefaultModelAgentSelection({
      projectDefaultModel: draft.target === 'chat' ? useConfigStore.getState().chatsDefaultModel : currentProject?.defaultModel,
      projectDefaultVariant: draft.target === 'chat' ? useConfigStore.getState().chatsDefaultVariant : currentProject?.defaultVariant,
    })
  }
  const activation = activateConfigForDirectory(configDirectory, { preserveManualModel: !projectChanged && draft.target === 'project' })
  applyDefaults()
  void activation.then(() => {
    const current = useSessionUIStore.getState()
    if (revision !== draftDefaultsRevision || getRuntimeKey() !== runtimeKey
      || current.currentSessionId || !current.newSessionDraft.open
      || current.newSessionDraft.draftId !== draft.draftId
      || current.newSessionDraft.target !== draft.target
      || current.newSessionDraft.selectedProjectId !== draft.selectedProjectId
      || useConfigStore.getState().selectionSource === 'manual'
      || useConfigStore.getState().agentSelectionSource === 'manual'
      || useConfigStore.getState().currentVariantSelection.override !== undefined) return
    applyDefaults()
  })
}

let draftDefaultsRevision = 0

const DEFAULT_DRAFT: NewSessionDraftState = {
  draftId: 0,
  open: false,
  directoryOverride: null,
  parentID: null,
  target: "chat",
}
let nextDraftId = 1
const pendingChatDirectoryByDraft = new Map<string, Promise<string | null>>()
const pendingPreparationByDraft = new Map<number, Promise<unknown>>()
/**
 * Workspace resolutions for a draft, keyed by draft and directory.
 *
 * Speculative preparation, session admission and discard each need the same
 * workspace for the same directory, and each is a Host round trip. Caching the
 * promise per draft makes one draft resolve once. A rejected resolution is
 * dropped, so a transient failure is retried instead of poisoning the draft, and
 * closing the draft clears its entries so a later reuse of the draft cannot
 * admit a session into a workspace the user has navigated away from.
 */
const workspaceByDraftDirectory = new Map<string, Promise<Workspace>>()
const workspaceDraftKey = (draftId: number, directory: string) => `${draftId}\u0000${directory}`
const resolveDraftWorkspace = (draftId: number, directory: string): Promise<Workspace> => {
  const key = workspaceDraftKey(draftId, directory)
  const cached = workspaceByDraftDirectory.get(key)
  if (cached) return cached
  const pending = canonicalClient.resolveWorkspace(directory)
  workspaceByDraftDirectory.set(key, pending)
  pending.catch(() => { if (workspaceByDraftDirectory.get(key) === pending) workspaceByDraftDirectory.delete(key) })
  return pending
}
// The Host resolves a prepared session's scope through its folder, so the
// discard must finish before a prepared chat folder is deleted; otherwise the
// session row outlives its folder and inventory reads of it keep failing.
const discardDraftPreparation = (
  draftId: number,
  directory: string | null | undefined,
  pendingPrep: Promise<unknown> | undefined,
  chatDirectory: string | null,
): void => {
  const discard = () => {
    // The same per-draft resolution the open and admission used, so the
    // discard is the last reader of a workspace already resolved.
    const discarded = directory
      ? resolveDraftWorkspace(draftId, directory)
        .then((ws) => canonicalClient.discardPreparedSession({ workspaceId: ws.workspaceId }))
        .catch(() => undefined)
      : Promise.resolve()
    if (chatDirectory) void discarded.then(() => deleteChatDirectory(chatDirectory)).catch(() => undefined)
  }
  if (pendingPrep) void pendingPrep.finally(discard).catch(() => undefined)
  else discard()
}

const forgetDraftWorkspaces = (draftId: number): void => {
  const prefix = `${draftId}\u0000`
  for (const key of workspaceByDraftDirectory.keys()) if (key.startsWith(prefix)) workspaceByDraftDirectory.delete(key)
}

const activeSessionByRuntime = new Map<string, string | null>()
type RuntimeSessionMemory = {
  sessionId: string | null
  directory: string | null
  draft: NewSessionDraftState
  worktreeMetadata: Map<string, WorktreeMetadata>
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>
}
const runtimeSessionMemory = new Map<string, RuntimeSessionMemory>()

const runtimeMemoryKey = (value?: string | null): string => {
  const key = (value ?? getRuntimeKey()).trim()
  return key || "default"
}

const cloneDraft = (draft: NewSessionDraftState): NewSessionDraftState => ({
  ...draft,
  syntheticParts: draft.syntheticParts?.map((part) => ({ ...part, attachments: part.attachments ? [...part.attachments] : undefined })),
  projectContextPins: draft.projectContextPins
    ? { notes: [...draft.projectContextPins.notes], plans: [...draft.projectContextPins.plans] }
    : undefined,
  goalObjective: draft.goalObjective ? { ...draft.goalObjective } : undefined,
})

const writeRuntimeSessionMemory = (key: string, patch: Partial<RuntimeSessionMemory>): void => {
  const current = runtimeSessionMemory.get(key)
  runtimeSessionMemory.set(key, {
    sessionId: current?.sessionId ?? null,
    directory: current?.directory ?? null,
    draft: current?.draft ? cloneDraft(current.draft) : { ...DEFAULT_DRAFT },
    worktreeMetadata: current?.worktreeMetadata ?? new Map(),
    availableWorktreesByProject: current?.availableWorktreesByProject ?? new Map(),
    ...patch,
  })
}

type MaterializedDraftSession = {
  sessionId: string
  directory: string | null
  agent?: string
  syntheticParts?: SyntheticContextPart[]
}

const resolveProjectRefForWorktreeDirectory = (directory: string | null, projectId?: string | null): { id: string; path: string } | null => {
  const projectsState = useProjectsStore.getState()
  if (projectId) {
    const project = projectsState.projects.find((entry) => entry.id === projectId)
    if (project?.path) return { id: project.id, path: project.path }
  }
  const resolved = resolveProjectForSessionDirectory(projectsState.projects, useSessionUIStore.getState().availableWorktreesByProject, directory)
  return resolved?.path ? { id: resolved.id, path: resolved.path } : null
}

const waitForWorktreeBootstrapIfConfigured = async (directory: string | null, projectId?: string | null, runtimeKey = getRuntimeKey(), runtimeRevision = getRuntimeSwitchRevision()): Promise<void> => {
  assertSendRuntime(runtimeKey, runtimeRevision)
  if (!directory) return
  const project = resolveProjectRefForWorktreeDirectory(directory, projectId)
  const waitEnabled = project ? await getWorktreeSetupWaitEnabled(project) : false
  assertSendRuntime(runtimeKey, runtimeRevision)
  if (waitEnabled) {
    await waitForWorktreeBootstrap(directory)
    assertSendRuntime(runtimeKey, runtimeRevision)
  }
}

const resolveActiveProjectDirectory = (draft: NewSessionDraftState): string | null => {
  const projectsState = useProjectsStore.getState()
  return normalizePath(
    projectsState.getActiveProject()?.path
    ?? (draft.selectedProjectId
      ? projectsState.projects.find((project) => project.id === draft.selectedProjectId)?.path
      : null)
    ?? null,
  )
}

/**
 * Regular new-chat drafts inherit the persisted current/last directory. If that
 * path is confirmed missing (deleted worktree), fall back to the active project.
 * Explicit worktree targets, in-flight worktree creation, and unknown/offline
 * probes stay unchanged so a temporary outage cannot rewrite the destination.
 * A concurrent rewrite of the same implicit draft to that fallback is accepted
 * instead of aborting create.
 */
const resolveCreatableDraftDirectory = async (
  draft: NewSessionDraftState,
  requestedDirectory: string | null | undefined,
  submittedDraft = false,
): Promise<{ status: "ok"; directory: string | null | undefined } | { status: "aborted" }> => {
  const directory = requestedDirectory ?? useDirectoryStore.getState().currentDirectory ?? null
  const isRecoverableDraftDirectory =
    draft.open
    && draft.preserveDirectoryOverride !== true
    && !draft.pendingWorktreeRequestId
    && !draft.bootstrapPendingDirectory
    && normalizePath(draft.directoryOverride) === normalizePath(directory)

  if (!isRecoverableDraftDirectory || !directory) {
    return { status: "ok", directory }
  }

  const activeProjectDirectory = resolveActiveProjectDirectory(draft)
  if (!activeProjectDirectory || normalizePath(directory) === activeProjectDirectory) {
    return { status: "ok", directory }
  }

  const runtimeKey = getRuntimeKey()
  const draftDirectory = draft.directoryOverride
  const availability = await hostFilesystem.getDirectoryAvailability(directory)
  if (submittedDraft) {
    if (getRuntimeKey() !== runtimeKey) return { status: "aborted" }
    return { status: "ok", directory: availability === "missing" ? activeProjectDirectory : directory }
  }
  const currentDraft = useSessionUIStore.getState().newSessionDraft
  const currentDirectory = normalizePath(currentDraft.directoryOverride)
  const capturedDirectory = normalizePath(draftDirectory)
  const recoveredToActiveProject = currentDirectory === activeProjectDirectory
    && capturedDirectory !== activeProjectDirectory
  const draftChanged = !currentDraft.open
    || currentDraft.preserveDirectoryOverride !== draft.preserveDirectoryOverride
    || currentDraft.pendingWorktreeRequestId !== draft.pendingWorktreeRequestId
    || (currentDirectory !== capturedDirectory && !recoveredToActiveProject)

  if (getRuntimeKey() !== runtimeKey || draftChanged) {
    return { status: "aborted" }
  }

  if (recoveredToActiveProject) {
    return { status: "ok", directory: activeProjectDirectory }
  }

  return { status: "ok", directory: availability === "missing" ? activeProjectDirectory : directory }
}

const recoverStaleDraftDirectory = async (openedDraft: NewSessionDraftState): Promise<void> => {
  if (openedDraft.target !== "project") return

  const resolved = await resolveCreatableDraftDirectory(openedDraft, openedDraft.directoryOverride)
  if (resolved.status !== "ok") return
  const recovered = normalizePath(resolved.directory ?? null)
  const original = normalizePath(openedDraft.directoryOverride)
  if (!recovered || recovered === original) return

  const currentDraft = useSessionUIStore.getState().newSessionDraft
  if (!currentDraft.open) return
  if (currentDraft.target !== "project") return
  if (currentDraft.preserveDirectoryOverride === true) return
  if (currentDraft.pendingWorktreeRequestId) return
  if (normalizePath(currentDraft.directoryOverride) !== original) return

  const recoveredProject = useProjectsStore.getState().projects.find((project) => (
    normalizePath(project.path) === recovered
  ))
  const nextDraft: NewSessionDraftState = {
    ...currentDraft,
    selectedProjectId: recoveredProject?.id ?? currentDraft.selectedProjectId,
    directoryOverride: recovered,
  }
  useSessionUIStore.setState({ newSessionDraft: nextDraft })
  writeRuntimeSessionMemory(runtimeMemoryKey(), { draft: nextDraft })
  persistDraftTarget({ projectId: nextDraft.selectedProjectId ?? null, directory: recovered, target: nextDraft.target })
  void activateConfigForDirectory(recovered)
}

const createSessionWithDraftLifecycle = async (
  title?: string,
  directoryOverride?: string | null,
  metadata?: SessionMetadata,
  selectionTransition?: "submitted-draft",
  selection?: SessionCreateSelection,
  draftSnapshot?: NewSessionDraftState,
  runtimeKey = getRuntimeKey(),
  selectedSessionId = useSessionUIStore.getState().currentSessionId,
  runtimeRevision = getRuntimeSwitchRevision(),
): Promise<Session | null> => {
  assertSendRuntime(runtimeKey, runtimeRevision)
  const store = useSessionUIStore.getState()
  const draft = draftSnapshot ?? store.newSessionDraft
  const targetFolderId = draft.targetFolderId

  try {
    const resolved = await resolveCreatableDraftDirectory(draft, directoryOverride, Boolean(draftSnapshot))
    assertSendRuntime(runtimeKey, runtimeRevision)
    if (resolved.status === "aborted") return null
    const directory = resolved.directory
    const session = await createSessionAction(title, directory, metadata, selectionTransition, selection, "preserve",
      (target) => resolveDraftWorkspace(draft.draftId, target))
    assertSendRuntime(runtimeKey, runtimeRevision)
    if (!session) return null

    const current = useSessionUIStore.getState()
    if (current.newSessionDraft.draftId === draft.draftId
      && (current.currentSessionId === selectedSessionId || current.currentSessionId === `draft_${draft.draftId}`)) {
      current.setCurrentSession(session.sessionId, directory, selectionTransition)
    }

    if (targetFolderId) {
      const sessionDirectory = getSyncSessionDirectory(session.sessionId)
        ?? resolveGlobalSessionDirectory(session)
      const scopeDirectory = directory || sessionDirectory
      const scopeKey = getChatsRootFromDirectory(scopeDirectory) ?? scopeDirectory
      if (scopeKey) {
        useSessionFoldersStore.getState().addSessionToFolder(scopeKey, targetFolderId, session.sessionId)
      }
    }

    return session
  } catch (error) {
    assertSendRuntime(runtimeKey, runtimeRevision)
    console.error("[session-ui-store] createSession failed", error)
    toast.error(problemMessage(error, 'The session could not be created.'))
    return null
  }
}

const resolveVariantToRecord = (
  agentName: string | undefined,
  providerID: string,
  modelID: string,
  sentVariant: string | undefined,
): string | null | undefined => {
  const config = useConfigStore.getState()
  const describesThisSend = config.currentProviderId === providerID
    && config.currentModelId === modelID
    && config.currentAgentName === agentName
  return describesThisSend ? config.currentVariantSelection.override : sentVariant
}

export async function materializeOpenDraftSession(selection: {
  providerId: string
  modelId: string
  agent?: string
  variant?: string
  reasoningEffort?: string
}, draftOverride?: NewSessionDraftState, runtimeKey = getRuntimeKey(), runtimeRevision = getRuntimeSwitchRevision()): Promise<MaterializedDraftSession | null> {
  assertSendRuntime(runtimeKey, runtimeRevision)
  const store = useSessionUIStore.getState()
  const draft = draftOverride ?? cloneDraft(store.newSessionDraft)
  if (!draft?.open) return null
  const draftPermissionMode = draft.permissionMode
  const configState = useConfigStore.getState()
  const effectiveDraftAgent = selection.agent?.trim() || undefined
  const variantOverride = resolveVariantToRecord(effectiveDraftAgent, selection.providerId, selection.modelId, selection.variant)
  let draftDirectoryOverride = draft.bootstrapPendingDirectory ?? draft.directoryOverride ?? null
  const draftProjectId = draft.selectedProjectId ?? null

  if (draft.pendingWorktreeRequestId) {
    const requestId = draft.pendingWorktreeRequestId
    noteDraftSendWaiting(requestId, true)
    try {
      draftDirectoryOverride = await waitForPendingDraftWorktreeRequest(requestId)
    } finally {
      noteDraftSendWaiting(requestId, false)
    }
    assertSendRuntime(runtimeKey, runtimeRevision)
    store.resolvePendingDraftWorktreeTarget(requestId, draftDirectoryOverride)
  }

  const isChatDraft = draft.target === "chat"
  if (isChatDraft) {
    draftDirectoryOverride = await store.prepareChatDraftDirectory(draft, runtimeKey, runtimeRevision)
    assertSendRuntime(runtimeKey, runtimeRevision)
    if (!draftDirectoryOverride) throw new Error("Failed to prepare chat directory")
    const currentDraft = useSessionUIStore.getState().newSessionDraft
    if (currentDraft.draftId === draft.draftId) {
      useSessionUIStore.setState({
        newSessionDraft: { ...currentDraft, preparedChatDirectory: null },
      })
    }
  }

  await waitForWorktreeBootstrapIfConfigured(draftDirectoryOverride, draftProjectId, runtimeKey, runtimeRevision)
  assertSendRuntime(runtimeKey, runtimeRevision)
  pendingPreparationByDraft.delete(draft.draftId)

  // Native admission and the first prompt use the same captured selection.
  const created = await createSessionWithDraftLifecycle(
    draft.title,
    draftDirectoryOverride,
    draftSessionMetadata(draft),
    "submitted-draft",
    {
      model: { providerId: selection.providerId, modelId: selection.modelId },
      agent: effectiveDraftAgent,
      variant: selection.variant,
      reasoningEffort: selection.reasoningEffort,
    },
    draft,
    runtimeKey,
    undefined,
    runtimeRevision,
  )
  assertSendRuntime(runtimeKey, runtimeRevision)
  if (!created?.sessionId) {
    if (isChatDraft && draftDirectoryOverride) {
      await deleteChatDirectory(draftDirectoryOverride).catch(() => undefined)
      assertSendRuntime(runtimeKey, runtimeRevision)
    }
    throw new Error("Failed to create session")
  }

  // The server response is authoritative. Resolve its workspace directory from
  // sync/global indexes; native Session deliberately carries no Host path.
  const createdDirectory = normalizePath(
    getSyncSessionDirectory(created.sessionId)
    ?? resolveGlobalSessionDirectory(created)
    ?? draftDirectoryOverride
    ?? null,
  )

  if (useSessionUIStore.getState().newSessionDraft.draftId === draft.draftId) {
    persistDraftTarget({
      projectId: draftProjectId,
      directory: createdDirectory,
      target: draft.target,
    })
  }

  const draftSyntheticParts = draft.syntheticParts
  if (useSessionUIStore.getState().currentSessionId === created.sessionId) {
    void activateConfigForDirectory(createdDirectory).catch((error) => {
      console.warn("Failed to activate directory after creating session:", error)
    })
  }

  useSelectionStore.getState().saveSessionModelSelection(created.sessionId, selection.providerId, selection.modelId)

  if (effectiveDraftAgent) {
    useSelectionStore.getState().saveSessionAgentSelection(created.sessionId, effectiveDraftAgent)
    if (configState.selectionSource === "manual") {
      useSelectionStore.getState().saveAgentModelForSession(created.sessionId, effectiveDraftAgent, selection.providerId, selection.modelId)
    }
    useSelectionStore.getState().saveAgentModelVariantForSession(created.sessionId, effectiveDraftAgent, selection.providerId, selection.modelId, variantOverride)
  }


  // Without a choice in the draft the server writes the default mode itself.
  if (draftPermissionMode) {
    void import("@/stores/permissionStore")
      .then(({ usePermissionStore }) => {
        assertSendRuntime(runtimeKey, runtimeRevision)
        return usePermissionStore.getState().setSessionMode(created.sessionId, draftPermissionMode)
      })
      .catch((error) => {
        console.warn("Failed to apply the draft permission mode to the new session:", error)
      })
  }

  return {
    sessionId: created.sessionId,
    directory: createdDirectory,
    agent: effectiveDraftAgent,
    syntheticParts: draftSyntheticParts,
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const flattenWorktreeMap = (map: Map<string, WorktreeMetadata[]>): WorktreeMetadata[] => {
  const out: WorktreeMetadata[] = []
  for (const list of map.values()) out.push(...list)
  return out
}

const PERSISTED_WORKTREE_MAP = readPersistedWorktreeTopology(runtimeMemoryKey())

/**
 * Counts deliberate navigation (a session pick, a user-opened draft). A session
 * parked because its directory is not admitted yet is dropped when the count
 * moves: the user went somewhere else.
 */
let admissionNavigationRevision = 0;

export const getAdmissionNavigationRevision = (): number => admissionNavigationRevision;

export const useSessionUIStore: UseBoundStore<StoreApi<SessionUIState>> = create<SessionUIState>()((set, get) => ({
  currentSessionId: null,
  currentSessionDirectory: null,
  materializedDraftSessionId: null,
  newSessionDraft: { ...DEFAULT_DRAFT },
  abortPromptSessionId: null,
  abortPromptExpiresAt: null,
  error: null,
  worktreeMetadata: new Map(),
  availableWorktrees: flattenWorktreeMap(PERSISTED_WORKTREE_MAP),
  availableWorktreesByProject: PERSISTED_WORKTREE_MAP,
  worktreeDiscoveryByProject: new Map(),
  webUICreatedSessions: new Set(),
  sessionAbortFlags: new Map(),
  abortControllers: new Map(),
  isLoading: false,
  lastLoadedDirectory: null,
  sessionPlanAvailable: new Map(),

  // ---------------------------------------------------------------------------
  // setCurrentSession
  // ---------------------------------------------------------------------------
  setCurrentSession: (id, directoryHint?: string | null, transition?: "submitted-draft") => {
    admissionNavigationRevision += 1
    const runtimeKey = getRuntimeKey()
    const materializedDraftSessionId = id && transition === "submitted-draft" ? id : null
    // Publish the transition identity before closing the draft. Those are two
    // separate store updates, and ChatContainer must never observe a closed
    // draft with the previous transition identity.
    if (get().materializedDraftSessionId !== materializedDraftSessionId) {
      set({ materializedDraftSessionId })
    }
    if (id) {
      get().closeNewSessionDraft()
    }

    const key = runtimeMemoryKey()
    activeSessionByRuntime.set(key, id)

    const previousSessionId = get().currentSessionId
    const directoryState = useDirectoryStore.getState()

    const sessionDir = resolveSessionDirectory(
      id,
      (sid) => get().worktreeMetadata.get(sid),
    )
    const fallbackDir = directoryState.currentDirectory ?? null
    const knownDir = (directoryHint ? normalizePath(directoryHint) : null) ?? sessionDir
    const resolvedDir = knownDir ?? fallbackDir
    const isGuessedDir = knownDir === null
    const projectsState = useProjectsStore.getState()
    const sessionProject = resolvedDir
      ? resolveProjectForSessionDirectory(
        projectsState.projects,
        get().availableWorktreesByProject,
        resolvedDir,
      )
      : null

    if (id) {
      void fetchMessagesForSession(id, resolvedDir)
    }

    set({
      currentSessionId: id,
      currentSessionDirectory: id ? resolvedDir ?? null : null,
    })
    guessedSelectionSessionId = isGuessedDir && id ? id : null
    const rememberedDir = isGuessedDir ? null : resolvedDir ?? null
    writeRuntimeSessionMemory(key, { sessionId: id, directory: rememberedDir })
    if (id) {
      persistLastActiveSession(key, { sessionId: id, directory: rememberedDir })
    }

    if (resolvedDir && directoryState.currentDirectory !== resolvedDir) {
      directoryState.setDirectory(resolvedDir, { showOverlay: false })
    }
    if (sessionProject && projectsState.activeProjectId !== sessionProject.id) {
      projectsState.setActiveProjectIdOnly(sessionProject.id)
    }
    if (id && !isGuessedDir && sessionProject) {
      useSessionDisplayStore.getState().setSingleProjectId(sessionProject.id)
    }

    if (previousSessionId && previousSessionId !== id) {
      const prevId = previousSessionId
      const newId = id
      queueMicrotask(() => {
        const current = get().currentSessionId
        if (getRuntimeKey() !== runtimeKey || current !== newId) return
        const memState = getViewportSessionMemory(prevId)
        if (!memState?.isStreaming) {
          const prevMessages = getSyncMessages(prevId)
          if (prevMessages.length > 0) {
            useViewportStore.getState().updateViewportAnchor(prevId, prevMessages.length - 1)
          }
        }
      });
    }

    if (id) {
      if (previousSessionId !== id) releaseKeptUnreadMarks()
      markSessionViewed(id)
      setActiveSession(resolvedDir ?? "", id)
    } else {
      setActiveSession("", "")
    }
  },

  clearMaterializedDraftSession: (sessionId) => {
    if (get().materializedDraftSessionId !== sessionId) return
    set({ materializedDraftSessionId: null })
  },

  prepareForRuntimeSwitch: (apiBaseUrl?: string | null) => {
    const key = runtimeMemoryKey(apiBaseUrl)
    const directoryState = useDirectoryStore.getState()
    const directory = isTransientRuntimeKey(key) || isDirectoryUnknown(directoryState)
      ? null
      : directoryState.currentDirectory || null
    const currentSessionId = get().currentSessionId
    const directorySnapshot = directory ? getDirectoryState(directory) : null
    rememberRuntimeLiveStatus({
      runtimeKey: key,
      directory,
      sessionId: currentSessionId,
      status: currentSessionId ? directorySnapshot?.session_status?.[currentSessionId] : null,
    })
    activeSessionByRuntime.set(key, get().currentSessionId)
    writeRuntimeSessionMemory(key, {
      sessionId: currentSessionId,
      directory,
      draft: cloneDraft(get().newSessionDraft),
      worktreeMetadata: new Map(get().worktreeMetadata),
      availableWorktreesByProject: new Map(get().availableWorktreesByProject),
    })
  },

  restoreForRuntimeSwitch: (apiBaseUrl?: string | null, previousRuntimeKey?: string | null) => {
    const key = runtimeMemoryKey(apiBaseUrl)
    const memory = runtimeSessionMemory.get(key)
    const restoredSessionId = memory?.sessionId ?? activeSessionByRuntime.get(key) ?? null
    const restoredDraft = memory?.draft ? cloneDraft(memory.draft) : { ...DEFAULT_DRAFT }
    const restoredDirectory = memory?.directory ?? null
    const availableWorktreesByProject = memory?.availableWorktreesByProject
      ?? readPersistedWorktreeTopology(key)
    if (restoredDirectory) {
      useDirectoryStore.getState().setDirectory(restoredDirectory, { showOverlay: false })
    } else if (previousRuntimeKey && previousRuntimeKey !== key && !isTransientRuntimeKey(previousRuntimeKey)) {
      useDirectoryStore.getState().resetForRuntimeSwitch()
    }
    set({
      currentSessionId: restoredSessionId,
      currentSessionDirectory: restoredSessionId ? restoredDirectory : null,
      newSessionDraft: restoredSessionId ? { ...DEFAULT_DRAFT } : restoredDraft,
      abortPromptSessionId: null,
      abortPromptExpiresAt: null,
      error: null,
      worktreeMetadata: memory?.worktreeMetadata ?? new Map(),
      availableWorktrees: flattenWorktreeMap(availableWorktreesByProject),
      availableWorktreesByProject,
      sessionAbortFlags: new Map(),
    })
    if (restoredSessionId) {
      setActiveSession(restoredDirectory ?? useDirectoryStore.getState().currentDirectory ?? "", restoredSessionId)
    } else {
      setActiveSession("", "")
    }
  },



  openNewSessionDraft: (options) => {
    if (!options?.automatic) admissionNavigationRevision += 1
    if (!options?.automatic) {
      clearLastActiveSession(runtimeMemoryKey())
    }
    const projectsState = useProjectsStore.getState()
    const projects = projectsState.projects
    const availableWorktreesByProject = get().availableWorktreesByProject
    const activeProject = projectsState.getActiveProject()
    const currentDirectory = normalizePath(useDirectoryStore.getState().currentDirectory ?? null)
    const persistedTarget = readPersistedDraftTarget()

    // Callers that forward "the current session's directory" forward it for
    // chat sessions too, and a chat session's scratch directory names no
    // project. Treating it as an explicit project target would force a project
    // draft rooted in scratch; it is a request for another chat.
    const rawExplicitDirectory = options?.directoryOverride !== undefined
      ? normalizePath(options.directoryOverride)
      : null
    const explicitDirectoryIsChat = rawExplicitDirectory !== null && isChatDirectoryPath(rawExplicitDirectory)
    const explicitDirectory = explicitDirectoryIsChat ? null : rawExplicitDirectory
    const persistedProjectById = persistedTarget?.projectId
      ? projects.find((p) => p.id === persistedTarget.projectId) ?? null
      : null
    const persistedProjectByDir = resolveDraftProjectForDirectory(projects, availableWorktreesByProject, persistedTarget?.directory ?? null)
    const currentDirProject = resolveDraftProjectForDirectory(projects, availableWorktreesByProject, currentDirectory)
    const isImplicitExternalChatFallback = currentDirectory !== null
      && !isChatDirectoryPath(currentDirectory)
      && currentDirProject === null
      && options?.automatic !== true
      && options?.target === undefined
      && options?.directoryOverride === undefined
      && options?.selectedProjectId === undefined
    const persistedProject = persistedProjectById ?? persistedProjectByDir

    // Nothing explicit was asked for: reopen on the side the user last worked
    // on. Only a recorded project target that still resolves to an existing
    // project beats Chat — a project removed since must not open a draft
    // pointing at a directory that is no longer registered — and the live
    // directory must not itself be an unregistered external path.
    const restoresProjectTarget = !options?.target
      && options?.directoryOverride === undefined
      && options?.selectedProjectId === undefined
      && persistedTarget?.target === "project"
      && persistedProject !== null
      && !isImplicitExternalChatFallback

    let target = options?.target
    if (!target) {
      const hasExplicitProjectTarget = (options?.directoryOverride !== undefined && !explicitDirectoryIsChat)
        || (options?.selectedProjectId !== undefined && options.selectedProjectId !== CHAT_DRAFT_PROJECT_ID)
      target = options?.selectedProjectId === CHAT_DRAFT_PROJECT_ID
        ? "chat"
        : hasExplicitProjectTarget || restoresProjectTarget
          ? "project"
          : "chat"
    }
    const explicitProject = target === "project" && options?.selectedProjectId
      ? projects.find((p) => p.id === options.selectedProjectId) ?? null
      : null

    const inferredProjectFromDir = resolveDraftProjectForDirectory(projects, availableWorktreesByProject, explicitDirectory)
    const fallbackProject = (() => {
      if (activeProject) return activeProject
      if (projectsState.activeProjectId) return projects.find((p) => p.id === projectsState.activeProjectId) ?? null
      return projects[0] ?? null
    })()

    const selectedProject = target === "chat" ? null : (() => {
      if (explicitProject) return explicitProject
      if (explicitDirectory !== null) return inferredProjectFromDir
      // A chat session leaves a managed scratch directory behind as the current
      // one; it owns no project, so it must not decide this draft's project —
      // the recorded target below knows which project the user last chose.
      if (currentDirectory && !isChatDirectoryPath(currentDirectory)) {
        // Worktree discovery may not have run yet. If the live path matches
        // the recorded target, keep its registered project across launches.
        return currentDirProject
          ?? (restoresProjectTarget && currentDirectory === persistedTarget?.directory ? persistedProject : null)
      }
      return persistedProject ?? fallbackProject
    })()

    const directory = target === "chat" ? null : (() => {
      if (explicitDirectory !== null) return explicitDirectory
      if (explicitProject) return normalizePath(explicitProject.path ?? null)
      // A chat session's directory is a managed scratch folder, never a
      // project: letting it through would open a project draft rooted in it.
      if (currentDirectory && !isChatDirectoryPath(currentDirectory)) return currentDirectory
      if (persistedTarget?.directory && !isChatDirectoryPath(persistedTarget.directory)) return persistedTarget.directory
      return normalizePath(selectedProject?.path ?? null)
    })()

    if (target === "chat") {
      warmChatsRootDirectory()
    }

    if (!(target === "chat" && isImplicitExternalChatFallback)) {
      persistDraftTarget({ projectId: selectedProject?.id ?? null, directory, target })
    }

    const nextDraft: NewSessionDraftState = {
      draftId: nextDraftId++,
      // Every project draft gets its own composer key, so two drafts in one
      // folder never share text and a caller can address a chip to this one.
      workDraftId: options?.workDraftId ?? createSessionDraftId(),
      open: true,
      target,
      preparedChatDirectory: null,
      selectedProjectId: selectedProject?.id ?? null,
      directoryOverride: directory,
      pendingWorktreeRequestId: options?.pendingWorktreeRequestId ?? null,
      bootstrapPendingDirectory: normalizePath(options?.bootstrapPendingDirectory ?? null),
      preserveDirectoryOverride: options?.preserveDirectoryOverride === true,
      parentID: options?.parentID ?? null,
      title: options?.title,
      initialPrompt: options?.initialPrompt,
      syntheticParts: options?.syntheticParts,
      targetFolderId: options?.targetFolderId,
      projectContextPins: options?.projectContextPins,
      mode: options?.mode !== undefined
        ? options.mode
        : ((() => {
          const defaultMode = useUIStore.getState().defaultSessionMode ?? 'main';
          return defaultMode === 'main' ? undefined : defaultMode;
        })()),
      goalObjective: options?.goalObjective !== undefined
        ? options.goalObjective
        : (options?.mode === 'goal' || (options?.mode === undefined && useUIStore.getState().defaultSessionMode === 'goal')
          ? { objective: '', tokenBudget: null }
          : undefined),
    }

    set({
      newSessionDraft: nextDraft,
      currentSessionId: null,
      currentSessionDirectory: null,
      error: null,
    })

    writeRuntimeSessionMemory(runtimeMemoryKey(), { sessionId: null, directory, draft: nextDraft })
    if (options?.initialPrompt) {
      useInputStore.getState().setPendingInputText(options.initialPrompt)
    }

    applyDraftTargetSelectionDefaults(nextDraft, availableWorktreesByProject, selectedProject)

    if (directory && directory !== useDirectoryStore.getState().currentDirectory) {
      useDirectoryStore.getState().setDirectory(directory)
    }

    void recoverStaleDraftDirectory(nextDraft)
    if (directory && !isDirectoryInRemovingWorktree(directory)) {
      const prep = resolveDraftWorkspace(nextDraft.draftId, directory)
        .then((ws) => isDirectoryInRemovingWorktree(directory)
          ? undefined
          : canonicalClient.prepareSession({ projectId: ws.projectId, workspaceId: ws.workspaceId }))
        .catch(() => undefined)
      pendingPreparationByDraft.set(nextDraft.draftId, prep)
    }
  },

  prepareChatDraftDirectory: async (draftSnapshot, runtimeKey = getRuntimeKey(), runtimeRevision = getRuntimeSwitchRevision()) => {
    assertSendRuntime(runtimeKey, runtimeRevision)
    const draft = draftSnapshot ?? get().newSessionDraft
    if (!draft.open || draft.target !== "chat") return null
    if (draft.preparedChatDirectory) return draft.preparedChatDirectory

    const key = `${runtimeKey}:${runtimeRevision}:${draft.draftId}`
    const existing = pendingChatDirectoryByDraft.get(key)
    if (existing) return existing

    const pending = createChatDirectory().then(async (directory) => {
      assertSendRuntime(runtimeKey, runtimeRevision)
      const current = get().newSessionDraft
      const shouldPrepare = (current.open && current.target === "chat" && current.draftId === draft.draftId) || Boolean(draftSnapshot)
      if (shouldPrepare) {
        if (current.open && current.target === "chat" && current.draftId === draft.draftId) {
          set({ newSessionDraft: { ...current, preparedChatDirectory: directory } })
        }
        const prep = resolveDraftWorkspace(draft.draftId, directory)
          .then((ws) => canonicalClient.prepareSession({ projectId: ws.projectId, workspaceId: ws.workspaceId }))
          .catch(() => undefined)
        pendingPreparationByDraft.set(draft.draftId, prep)
        await prep
        return directory
      }
      await deleteChatDirectory(directory).catch(() => undefined)
      assertSendRuntime(runtimeKey, runtimeRevision)
      return null
    }).finally(() => {
      pendingChatDirectoryByDraft.delete(key)
    })
    pendingChatDirectoryByDraft.set(key, pending)
    return pending
  },

  closeNewSessionDraft: () => {
    const currentDraft = get().newSessionDraft
    const pendingPrep = pendingPreparationByDraft.get(currentDraft.draftId)
    pendingPreparationByDraft.delete(currentDraft.draftId)
    discardDraftPreparation(
      currentDraft.draftId,
      currentDraft.preparedChatDirectory ?? currentDraft.directoryOverride ?? useDirectoryStore.getState().currentDirectory,
      pendingPrep,
      currentDraft.preparedChatDirectory ?? null,
    )
    // The draft is over: nothing may reuse its resolutions, and leaving them
    // would let a newer draft with a recycled path read a stale workspace.
    forgetDraftWorkspaces(currentDraft.draftId)
    if (
      !currentDraft.open
      && currentDraft.selectedProjectId == null
      && currentDraft.directoryOverride == null
      && currentDraft.pendingWorktreeRequestId == null
      && currentDraft.bootstrapPendingDirectory == null
      && !currentDraft.preserveDirectoryOverride
      && currentDraft.parentID == null
      && currentDraft.title === undefined
      && currentDraft.initialPrompt === undefined
      && currentDraft.syntheticParts === undefined
      && currentDraft.targetFolderId === undefined
      && currentDraft.permissionMode === undefined
      && currentDraft.mode === undefined
      && currentDraft.goalObjective === undefined
    ) {
      return
    }
    const nextDraft: NewSessionDraftState = {
      draftId: currentDraft.draftId,
      open: false,
      target: "chat",
      preparedChatDirectory: null,
      selectedProjectId: null,
      directoryOverride: null,
      pendingWorktreeRequestId: null,
      bootstrapPendingDirectory: null,
      preserveDirectoryOverride: false,
      parentID: null,
      title: undefined,
      initialPrompt: undefined,
      syntheticParts: undefined,
      targetFolderId: undefined,
      mode: undefined,
      goalObjective: undefined,
    }
    set({
      newSessionDraft: nextDraft,
    })
    writeRuntimeSessionMemory(runtimeMemoryKey(), { draft: nextDraft })
  },

  setNewSessionDraftTarget: (target) => {
    const previousDraft = get().newSessionDraft
    if (previousDraft.preparedChatDirectory && target.projectId !== CHAT_DRAFT_PROJECT_ID) {
      const pendingPrep = pendingPreparationByDraft.get(previousDraft.draftId)
      pendingPreparationByDraft.delete(previousDraft.draftId)
      discardDraftPreparation(previousDraft.draftId, previousDraft.preparedChatDirectory, pendingPrep, previousDraft.preparedChatDirectory)
    }
    let nextDirectory: string | null = null
    set((s) => {
      nextDirectory = normalizePath(target.directoryOverride ?? s.newSessionDraft.directoryOverride)
      return {
        newSessionDraft: {
          ...s.newSessionDraft,
          target: target.projectId === CHAT_DRAFT_PROJECT_ID ? "chat" : "project",
          preparedChatDirectory: target.projectId === CHAT_DRAFT_PROJECT_ID ? s.newSessionDraft.preparedChatDirectory : null,
          selectedProjectId: target.projectId ?? target.selectedProjectId ?? s.newSessionDraft.selectedProjectId,
          directoryOverride: target.projectId === CHAT_DRAFT_PROJECT_ID ? null : target.directoryOverride ?? s.newSessionDraft.directoryOverride,
        },
      }
    })

    applyDraftTargetSelectionDefaults(get().newSessionDraft, get().availableWorktreesByProject, undefined, previousDraft)

    const nextDraft = get().newSessionDraft
    persistDraftTarget({
      projectId: nextDraft.target === "chat" ? null : nextDraft.selectedProjectId ?? null,
      directory: normalizePath(nextDraft.directoryOverride ?? null),
      target: nextDraft.target,
    })

    if (nextDirectory && nextDirectory !== useDirectoryStore.getState().currentDirectory) {
      useDirectoryStore.getState().setDirectory(nextDirectory)
    }
  },

  setDraftPreserveDirectoryOverride: (value) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, preserveDirectoryOverride: value } }
    }),

  setDraftPermissionMode: (mode) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, permissionMode: mode } }
    }),

  setDraftMode: (mode, goalObjective = null) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return {
        newSessionDraft: {
          ...s.newSessionDraft,
          mode: mode === "main" ? undefined : mode,
          goalObjective: mode === "goal" ? goalObjective ?? undefined : undefined,
        },
      }
    }),

  setDraftProjectContextPin: (kind, id, pinned) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      const pins = s.newSessionDraft.projectContextPins ?? { notes: [], plans: [] }
      const key = kind === "note" ? "notes" : "plans"
      const next = new Set(pins[key])
      if (pinned) next.add(id)
      else next.delete(id)
      return {
        newSessionDraft: {
          ...s.newSessionDraft,
          projectContextPins: { ...pins, [key]: [...next] },
        },
      }
    }),

  acknowledgeSessionAbort: (sessionId) =>
    set((s) => {
      const flags = new Map(s.sessionAbortFlags)
      const existing = flags.get(sessionId)
      if (existing) flags.set(sessionId, { ...existing, acknowledged: true })
      return { sessionAbortFlags: flags }
    }),

  clearAbortPrompt: () => set({ abortPromptSessionId: null, abortPromptExpiresAt: null }),

  armAbortPrompt: (durationMs = 5000, sessionId) => {
    const target = sessionId ?? get().currentSessionId
    if (!target) return null
    const expiresAt = Date.now() + durationMs
    set({ abortPromptSessionId: target, abortPromptExpiresAt: expiresAt })
    return expiresAt
  },

  clearError: () => set({ error: null }),

  markSessionAsOpenChamberCreated: (sessionId) =>
    set((s) => {
      const next = new Set(s.webUICreatedSessions)
      next.add(sessionId)
      return { webUICreatedSessions: next }
    }),

  isOpenChamberCreatedSession: (sessionId) => get().webUICreatedSessions.has(sessionId),


  setWorktreeMetadata: (sessionId, metadata, cwd) => {
    if (metadata) {
      useSessionWorktreeStore.getState().setAttachment(sessionId, {
        worktreeRoot: metadata.worktreeRoot ?? metadata.path ?? null,
        // A session in a worktree may work in a folder of it (`<worktree>/ai`).
        cwd: cwd ?? metadata.path ?? null,
        branch: metadata.branch ?? null,
        headState: metadata.headState ?? (metadata.branch ? 'branch' : 'detached'),
        worktreeStatus: metadata.worktreeStatus ?? 'ready',
        worktreeSource: metadata.worktreeSource ?? null,
        legacy: false,
        degraded: false,
      })
    } else {
      useSessionWorktreeStore.getState().clearAttachment(sessionId)
    }
    set((s) => {
      const map = new Map(s.worktreeMetadata)
      if (metadata) map.set(sessionId, metadata)
      else map.delete(sessionId)
      return { worktreeMetadata: map }
    })
  },

  overrideNewSessionDraftTarget: (options) => {
    const previousDraft = get().newSessionDraft
    let nextDirectory: string | null = null
    set((s) => {
      const nextDraft = { ...s.newSessionDraft, ...options }
      nextDirectory = normalizePath(
        typeof nextDraft.directoryOverride === "string" ? nextDraft.directoryOverride : null,
      )
      return { newSessionDraft: nextDraft }
    })
    applyDraftTargetSelectionDefaults(get().newSessionDraft, get().availableWorktreesByProject, undefined, previousDraft)

    if (nextDirectory && nextDirectory !== useDirectoryStore.getState().currentDirectory) {
      useDirectoryStore.getState().setDirectory(nextDirectory)
    }
  },

  initializeNewOpenChamberSession: (sessionId, _agents) => {
    // A session the flow created but has not opened yet: its composer reads
    // the per-session selection, so start it from the config store's resolved
    // defaults rather than leaving it empty.
    const config = useConfigStore.getState()
    const selection = useSelectionStore.getState()
    if (selection.getSessionModelSelection(sessionId)) return
    if (config.currentProviderId && config.currentModelId) {
      selection.saveSessionModelSelection(sessionId, config.currentProviderId, config.currentModelId)
    }
    if (config.currentAgentName) selection.saveSessionAgentSelection(sessionId, config.currentAgentName)
  },

  resolvePendingDraftWorktreeTarget: (requestId, directory, options) =>
    set((s) => {
      if (!s.newSessionDraft?.open || s.newSessionDraft.pendingWorktreeRequestId !== requestId) return s
      return {
        newSessionDraft: {
          ...s.newSessionDraft,
          selectedProjectId: (options as Record<string, unknown> | undefined)?.projectId as string ?? s.newSessionDraft.selectedProjectId ?? null,
          directoryOverride: normalizePath(directory),
          pendingWorktreeRequestId: null,
          bootstrapPendingDirectory: normalizePath((options as Record<string, unknown> | undefined)?.bootstrapPendingDirectory as string ?? s.newSessionDraft.bootstrapPendingDirectory ?? null),
          preserveDirectoryOverride: ((options as Record<string, unknown> | undefined)?.preserveDirectoryOverride ?? true) as boolean,
        },
      }
    }),

  setDraftBootstrapPendingDirectory: (directory) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, bootstrapPendingDirectory: normalizePath(directory) } }
    }),

  setPendingDraftWorktreeRequest: (requestId) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, pendingWorktreeRequestId: requestId } }
    }),

  getWorktreeMetadata: (sessionId) => get().worktreeMetadata.get(sessionId),

  sendMessage: async (
    content: string,
    providerID: string,
    modelID: string,
    agent?: string | null,
    attachments?: AttachedFile[],
    agentMentionName?: string,
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata; systemContext?: 'session-knowledge' }>,
    variant?: string,
    inputMode?: "normal" | "shell",
    options?: SendMessageOptions,
  ) => {
    const capturedRuntimeKey = options?.target?.runtimeKey ?? getRuntimeKey()
    const capturedRuntimeRevision = options?.runtimeRevision ?? getRuntimeSwitchRevision()
    assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
    const capturedTarget = options?.target ? { ...options.target } : undefined
    const draft = cloneDraft(options?.draftSnapshot ?? get().newSessionDraft)
    const createsDraftSession = !capturedTarget && !options?.sessionId && draft.open
    const targetSessionId = capturedTarget?.sessionId ?? options?.sessionId ?? get().currentSessionId
    const targetDirectory = targetSessionId
      ? normalizePath(capturedTarget?.directory ?? options?.directory ?? get().getDirectoryForSession(targetSessionId))
      : null
    const trimmedAgent = agent === null ? null : agent?.trim() || undefined
    const effectiveAgent = trimmedAgent === null
      ? undefined
      : (trimmedAgent
        ?? (targetSessionId && !createsDraftSession ? useSelectionStore.getState().getSessionAgentSelection(targetSessionId) : undefined)
        ?? useConfigStore.getState().currentAgentName)?.trim() || undefined
    const variantToRecord = resolveVariantToRecord(effectiveAgent, providerID, modelID, variant)
    const delivery = options?.delivery
    const commandId = options?.commandId
    const reasoningEffort = options?.reasoningEffort
    const skills = options?.skills ? { ...options.skills, names: [...options.skills.names] } : undefined
    const historySubmissions = options?.historySubmissions ? [...options.historySubmissions] : undefined
    const submittedAttachments = attachments ? [...attachments] : undefined
    const submittedParts = additionalParts?.map((part) => ({ ...part, attachments: part.attachments ? [...part.attachments] : undefined }))
    const uiState = useUIStore.getState()
    const tokenBudget = uiState.sessionGoalDefaultBudgetEnabled ? uiState.sessionGoalDefaultBudget : null
    const goalArm = inputMode !== "shell" && content.trim().length > 0
      ? useSessionGoalArmStore.getState().consume()
      : { armed: false, objectiveOverride: null, composerGoal: false }
    let goalApplied = false
    let temporaryDraftSessionId: string | undefined
    let temporaryCorrelationId: string | undefined
    const draftEffectiveDirectory = targetDirectory ?? draft.bootstrapPendingDirectory ?? draft.directoryOverride ?? null

    // Resolve the captured destination and selection once; canonical delivery
    // owns connection readiness and request lifecycle.
    return (async () => {
      assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
      let sessionId = targetSessionId
      let directory = targetDirectory
      let parts: Parameters<SessionUIState['sendMessage']>[6] = submittedParts
      let draftEchoMessage: CanonicalMessage | undefined

      if (createsDraftSession) {
        temporaryDraftSessionId = `draft_${draft.draftId}`
        temporaryCorrelationId = `msg_${globalThis.crypto.randomUUID()}`
        const text = content
        const msgParts: CanonicalMessage['parts'] = [{ type: "text", partId: `part_${globalThis.crypto.randomUUID()}`, content: text }]
        for (const attachment of submittedAttachments ?? []) {
          msgParts.push({
            type: "attachment",
            partId: `part_${globalThis.crypto.randomUUID()}`,
            attachmentId: attachment.id,
            name: attachment.filename,
            mediaType: attachment.mimeType,
            size: attachment.size,
            uri: attachment.dataUrl,
          })
        }
        draftEchoMessage = {
          messageId: temporaryCorrelationId,
          sessionId: temporaryDraftSessionId,
          turnId: `turn_${globalThis.crypto.randomUUID()}`,
          role: "user",
          createdAt: Date.now(),
          parts: msgParts,
        }
        optimisticAdd({
          sessionId: temporaryDraftSessionId,
          directory: draftEffectiveDirectory,
          message: draftEchoMessage,
        })
        useSessionUIStore.setState({
          currentSessionId: temporaryDraftSessionId,
          currentSessionDirectory: draftEffectiveDirectory,
          newSessionDraft: { ...draft, open: false },
        })

        const created = await materializeOpenDraftSession({
          providerId: providerID,
          modelId: modelID,
          agent: effectiveAgent,
          variant,
          reasoningEffort,
        }, draft, capturedRuntimeKey, capturedRuntimeRevision)
        assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
        if (!created) throw new Error("Failed to create session")
        sessionId = created.sessionId
        directory = created.directory
        options?.onSessionCreated?.({ sessionId, directory })
        if (created.syntheticParts?.length) {
          parts = [...(parts ?? []), ...created.syntheticParts]
        }
        if (temporaryDraftSessionId && temporaryCorrelationId) {
          optimisticRemove({
            sessionId: temporaryDraftSessionId,
            directory: draftEffectiveDirectory,
            messageId: temporaryCorrelationId,
          })
        }
      }
      if (!sessionId) throw new Error("No session selected for this message")

      useSelectionStore.getState().saveSessionModelSelection(sessionId, providerID, modelID)
      if (effectiveAgent) {
        useSelectionStore.getState().saveSessionAgentSelection(sessionId, effectiveAgent)
        useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, effectiveAgent, providerID, modelID, variantToRecord)
      }
      // The captured effort is this session's level from now on, including
      // OMP's own default when the composer sent it without an explicit pick.
      // `off` is a real choice and must survive the reload too.
      if (reasoningEffort !== undefined) {
        useSelectionStore.getState().saveAgentModelReasoningEffortForSession(sessionId, effectiveAgent ?? ROOT_SELECTION_AGENT, providerID, modelID, reasoningEffort)
      }
      const viewportState = useViewportStore.getState()
      const memState = getViewportSessionMemory(sessionId)
      if (!memState?.lastUserMessageAt) {
        const newMemState = new Map(viewportState.sessionMemoryState)
        newMemState.set(viewportSessionKey(sessionId), {
          viewportAnchor: 0,
          isStreaming: false,
          lastAccessedAt: Date.now(),
          backgroundMessageCount: 0,
          ...memState,
          lastUserMessageAt: Date.now(),
        })
        useViewportStore.setState({ sessionMemoryState: newMemState })
      }
      markPendingUserSendAnimation(sessionId)

      // The draft holds the mode until the session exists. Apply it now so the
      // first prompt runs under it; a Goal draft never also sends that prompt,
      // because the native goal controller starts its own first turn.
      if (createsDraftSession && draft.mode) {
        if (draft.mode === "goal") {
          const objective = draft.goalObjective?.objective.trim()
          if (!objective) throw new Error("A goal objective is required")
          assertSendRuntime(capturedRuntimeKey)
          await canonicalClient.goal(sessionId, { op: "create", objective, tokenBudget: draft.goalObjective?.tokenBudget ?? null })
          assertSendRuntime(capturedRuntimeKey)
          goalApplied = true
          return
        }
        assertSendRuntime(capturedRuntimeKey)
        await canonicalClient.setMode(sessionId, draft.mode)
        assertSendRuntime(capturedRuntimeKey)
      }

      let fileResourceExpansion: FileResourceExpandResult | null | undefined
      if (goalArm.armed && goalArm.composerGoal) {
        const objective = goalArm.objectiveOverride?.trim() || content.trim()
        assertSendRuntime(capturedRuntimeKey)
        await canonicalClient.goal(sessionId, { op: 'create', objective, tokenBudget })
        assertSendRuntime(capturedRuntimeKey)
        goalApplied = true
        return
      }
      if (goalArm.armed) {
        if (!goalArm.objectiveOverride?.trim() && !options?.fileResourcesExpanded && inputMode !== 'shell') {
          fileResourceExpansion = await expandNativeFileResource(content, directory)
        }
        const objective = goalArm.objectiveOverride?.trim() || fileResourceExpansion?.content || content
        assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
        await canonicalClient.goal(sessionId, { op: 'create', objective, tokenBudget })
        assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
        goalApplied = true
      }

      const files = inputMode === 'shell' ? undefined : await admitPromptAttachments(submittedAttachments, sessionId, capturedRuntimeKey, capturedRuntimeRevision, directory)
      assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
      const additionalContext: NonNullable<Parameters<typeof routeMessage>[0]['additionalParts']> = []
      if (inputMode !== 'shell') {
        for (const part of parts ?? []) {
          const partFiles = await admitPromptAttachments(part.attachments, sessionId, capturedRuntimeKey, capturedRuntimeRevision, directory)
          assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
          additionalContext.push({
            text: part.text,
            synthetic: part.synthetic,
            metadata: part.metadata,
            systemContext: part.systemContext,
            files: partFiles,
          })
        }
      }

      const historyIdentity = createInputHistoryIdentity(capturedRuntimeKey, directory ?? '', sessionId)
      const appendSubmissions = historyIdentity && historySubmissions?.length
        ? () => {
          assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
          useInputHistoryStore.getState().appendSubmissions(historyIdentity, historySubmissions)
        }
        : undefined
      await routeMessage({
        runtimeKey: capturedRuntimeKey,
        runtimeRevision: capturedRuntimeRevision,
        sessionId,
        directory,
        content,
        providerID,
        modelID,
        agent: effectiveAgent,
        agentMentionName,
        variant,
        reasoningEffort,
        inputMode,
        files,
        appendSubmissions,
        delivery,
        commandId,
        skills,
        fileResourcesExpanded: options?.fileResourcesExpanded,
        fileResourceExpansion,
        additionalParts: additionalContext,
      })
      assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
    })().catch((error) => {
      if (createsDraftSession) {
        if (temporaryDraftSessionId && temporaryCorrelationId) {
          optimisticRemove({
            sessionId: temporaryDraftSessionId,
            directory: draftEffectiveDirectory,
            messageId: temporaryCorrelationId,
          })
        }
        if (getRuntimeKey() === capturedRuntimeKey && getRuntimeSwitchRevision() === capturedRuntimeRevision) {
          // Restore only while the draft and the selection still belong to this submission; newer navigation keeps its own state.
          const current = useSessionUIStore.getState()
          if (current.newSessionDraft.draftId === draft.draftId && (current.currentSessionId === temporaryDraftSessionId || current.currentSessionId === (targetSessionId ?? null))) {
            useSessionUIStore.setState({ newSessionDraft: draft, currentSessionId: targetSessionId ?? null })
          }
        }
      }
      if (goalArm.armed && !goalApplied && getRuntimeKey() === capturedRuntimeKey && getRuntimeSwitchRevision() === capturedRuntimeRevision) {
        useSessionGoalArmStore.getState().setArmed(true, goalArm.objectiveOverride, goalArm.composerGoal)
      }
      throw error
    })
  },

  createSession: (title, directoryOverride, metadata, selection) =>
    createSessionWithDraftLifecycle(title, directoryOverride, metadata, undefined, selection),

  deleteSession: async (id, options) => deleteSessionAction(id, options),

  deleteSessions: async (ids, options) => {
    const result = await deleteSessionsAction(ids, options)

    return result
  },

  archiveSession: (id) => archiveSessionAction(id),

  archiveSessions: (ids, options) => archiveSessionsAction(ids, options),

  unarchiveSession: (id) => unarchiveSessionAction(id),

  unarchiveSessions: (ids, options) => unarchiveSessionsAction(ids, options),

  updateSessionTitle: async (sessionId, title) => {
    await updateSessionTitleAction(sessionId, title)
  },

  revertToMessage: async (sessionId, messageId) => {
    const runtimeKey = getRuntimeKey()
    await refetchSessionMessages(sessionId)
    assertSendRuntime(runtimeKey)
    await revertToMessageAction(sessionId, messageId)
    assertSendRuntime(runtimeKey)
  },

  handleSlashUndo: async (sessionId) => {
    const runtimeKey = getRuntimeKey()
    const messages = getSyncMessages(sessionId)
    const userMessages = messages.filter((message) => message.role === "user")
    if (userMessages.length === 0) return
    const targetMessage = userMessages.at(-1)
    if (!targetMessage) return
    const textPart = targetMessage.parts.find((part) => part.type === "text")
    const preview = textPart?.type === "text"
      ? textPart.content.slice(0, 50) + (textPart.content.length > 50 ? "..." : "")
      : "[No text]"
    await get().revertToMessage(sessionId, targetMessage.messageId)
    assertSendRuntime(runtimeKey)
    const { toast } = await import("sonner")
    assertSendRuntime(runtimeKey)
    const { useI18nStore, formatMessage } = await import("@/lib/i18n/store")
    assertSendRuntime(runtimeKey)
    const { dictionary } = useI18nStore.getState()
    toast.success(formatMessage(dictionary, "chat.revert.toast.undo", { preview }))
  },

  handleSlashRedo: async (sessionId) => {
    const runtimeKey = getRuntimeKey()
    await clearStagedRevert(sessionId)
    assertSendRuntime(runtimeKey)
    const { toast } = await import("sonner")
    assertSendRuntime(runtimeKey)
    const { useI18nStore, formatMessage } = await import("@/lib/i18n/store")
    assertSendRuntime(runtimeKey)
    const { dictionary } = useI18nStore.getState()
    toast.success(formatMessage(dictionary, "chat.revert.toast.redo"))
  },

  forkFromMessage: async (sessionId, messageId) => {
    const sessions = getSyncSessions()
    const existingSession = sessions.find((session) => session.sessionId === sessionId)
    if (!existingSession) return

    try {
      await forkFromMessageAction(sessionId, messageId)

      const { toast } = await import("sonner")
      toast.success(`Forked from ${existingSession.title ?? existingSession.sessionId}`)
    } catch (error) {
      console.error("Failed to fork session:", error)
      const { toast } = await import("sonner")
      toast.error("Failed to fork session")
    }
  },

  forkAfterMessage: async (sessionId, messageId) => {
    const existingSession = getSyncSessions().find((session) => session.sessionId === sessionId)
    if (!existingSession) return

    try {
      await forkAfterMessageAction(sessionId, messageId)

      const { toast } = await import("sonner")
      toast.success(`Forked from ${existingSession.title ?? existingSession.sessionId}`)
    } catch (error) {
      console.error("Failed to fork session:", error)
      const { toast } = await import("sonner")
      toast.error("Failed to fork session")
    }
  },

  createSessionFromAssistantMessage: async (source, execution) => {
    const runtimeKey = getRuntimeKey()
    const draftSnapshot = cloneDraft(get().newSessionDraft)
    const selectedSessionId = get().currentSessionId
    execution = { ...execution }
    if (!source.sessionId) return
    if (!execution?.instructions?.trim()) return
    const assistantPlanText = source.text
    if (!assistantPlanText.trim()) return

    const sourceDirectory = normalizePath(source.directory)
    if (!sourceDirectory) {
      throw new Error("Source session directory is unavailable")
    }
    const sourceWorktreeMetadata = get().worktreeMetadata.get(source.sessionId)

    const providerID = execution.providerId || useSelectionStore.getState().lastUsedProvider?.providerID
    const modelID = execution.modelId || useSelectionStore.getState().lastUsedProvider?.modelID

    if (!providerID || !modelID) return

    let sessionDirectory: string | null = sourceDirectory
    let createdWorktree: WorktreeMetadata | null = null
    let createdWorktreeProject: { id: string; path: string } | null = null

    if (execution.createWorktree) {
      const projects = useProjectsStore.getState().projects
      const project = resolveProjectForSessionDirectory(
        projects,
        get().availableWorktreesByProject,
        sourceWorktreeMetadata?.projectDirectory ?? null,
      ) ?? resolveProjectForSessionDirectory(
        projects,
        get().availableWorktreesByProject,
        sourceDirectory,
      )
      if (!project?.path) {
        throw new Error("Project is not registered in OhPiChamber")
      }

      const [branchNameModule, configModule, trustModule, createModule] = await Promise.all([
        import("@/lib/git/branchNameGenerator"),
        import("@/lib/openchamberConfig"),
        import("@/lib/sharedTrustConfirmation"),
        import("@/lib/worktrees/worktreeCreate"),
      ])
      assertSendRuntime(runtimeKey)
      const branchName = branchNameModule.generateBranchName()
      createdWorktreeProject = { id: project.id, path: project.path }
      const setupCommands = await trustModule.resolveWorktreeSetupCommands(createdWorktreeProject)
      assertSendRuntime(runtimeKey)
      createdWorktree = await createModule.createWorktreeWithDefaults(createdWorktreeProject, {
        preferredName: branchName,
        mode: "new",
        branchName,
        worktreeName: branchName,
        setupCommands,
        returnAfterDirectoryCreated: true,
      })
      assertSendRuntime(runtimeKey)
      sessionDirectory = normalizePath(createdWorktree.path)
      if (!sessionDirectory) {
        throw new Error("Worktree create missing name/path")
      }
      const waitEnabled = await configModule.getWorktreeSetupWaitEnabled(createdWorktreeProject)
      assertSendRuntime(runtimeKey)
      if (waitEnabled) {
        await waitForWorktreeBootstrap(sessionDirectory)
        assertSendRuntime(runtimeKey)
      }
    }

    assertSendRuntime(runtimeKey)
    const session = await createSessionWithDraftLifecycle(undefined, sessionDirectory, undefined, undefined, {
      model: { providerId: providerID, modelId: modelID },
      agent: null,
      variant: execution.variant || undefined,
    }, draftSnapshot, runtimeKey, selectedSessionId)
    assertSendRuntime(runtimeKey)
    if (!session) {
      if (createdWorktree && createdWorktreeProject) {
        const { removeProjectWorktree } = await import("@/lib/worktrees/worktreeManager")
        assertSendRuntime(runtimeKey)
        await removeProjectWorktree(createdWorktreeProject, createdWorktree, { deleteLocalBranch: true }).catch(() => undefined)
        assertSendRuntime(runtimeKey)
      }
      throw new Error("Failed to create session")
    }

    if (createdWorktree) {
      get().setWorktreeMetadata(session.sessionId, {
        ...createdWorktree,
        kind: "standard",
      })
      if (get().currentSessionId === session.sessionId) {
        useDirectoryStore.getState().setDirectory(createdWorktree.path, { showOverlay: false })
      }
    }

    // Goal control starts the first OMP turn with this composed assignment.
    // Do not send it again as a Host prompt.
    useSessionGoalArmStore.getState().setArmed(execution.runAsGoal === true, null, true)

    await get().sendMessage(
      composeForkSessionMessage(execution.instructions, assistantPlanText),
      providerID,
      modelID,
      undefined,
      undefined,
      undefined,
      undefined,
      execution.variant || undefined,
      undefined,
      { target: { runtimeKey, sessionId: session.sessionId, directory: sessionDirectory } },
    )
    assertSendRuntime(runtimeKey)

  },

  getSessionsByDirectory: (directory) => {
    const nd = normalizePath(directory)
    if (!nd) return []
    const sessions = getAllSyncSessions()
    return sessions.filter((s) => resolveDirectoryKey(s) === nd)
  },

  getDirectoryForSession: (sessionId) => {
    const selected = sessionId === get().currentSessionId ? get().currentSessionDirectory : null
    const resolved = resolveSessionDirectory(
      sessionId,
      (sid) => get().worktreeMetadata.get(sid),
      selected,
    )
    if (resolved) return resolved
    const globalStore = useGlobalSessionsStore.getState()
    const globalSession = [...globalStore.activeSessions, ...globalStore.archivedSessions]
      .find((session) => session.sessionId === sessionId)
    if (globalSession) return resolveGlobalSessionDirectory(globalSession)
    return null
  },

  getLastUserChoice: (sessionId) => {
    const directory = get().getDirectoryForSession(sessionId) ?? undefined
    const messages = getSyncMessages(sessionId, directory)
    const assistant = [...messages].reverse().find((message) => (
      message.role === "assistant" && (message.providerId !== undefined || message.modelId !== undefined)
    ))
    if (!assistant) return null
    return {
      providerId: assistant.providerId,
      modelId: assistant.modelId,
    }
  },

  getCurrentAgent: (sessionId) => {
    return useSelectionStore.getState().sessionAgentSelections.get(sessionId) ?? undefined
  },

  debugSessionMessages: async (sessionId) => {
    const msgs = getSyncMessages(sessionId)
    const sessions = getSyncSessions()
    const session = sessions.find((candidate) => candidate.sessionId === sessionId)
    console.log(`Debug session ${sessionId}:`, {
      session,
      messageCount: msgs.length,
      messages: msgs.map((message) => ({
        messageId: message.messageId,
        role: message.role,
        usage: message.role === "assistant" ? message.usage : undefined,
      })),
    })
  },

  pollForTokenUpdates: () => {
    // Handled by sync system's SSE stream
  },

  adoptAuthoritativeSessionDirectory: (sessionId) => {
    const target = sessionId ?? get().currentSessionId
    if (!target || target !== guessedSelectionSessionId) return
    if (target !== get().currentSessionId) return

    const authoritative = getAuthoritativeSessionDirectory(target)
    if (!authoritative) return

    guessedSelectionSessionId = null
    if (authoritative !== get().currentSessionDirectory) {
      set({ currentSessionDirectory: authoritative })
    }
    setActiveSession(authoritative, target)
    writeRuntimeSessionMemory(runtimeMemoryKey(), { sessionId: target, directory: authoritative })
  },

  /**
   * Follow the Agent Service's rekey to the identity a `/btw` branch minted.
   * One publish replaces the identity keyed everywhere it is read: the
   * projected row, the remembered directory, cached history/status, and the
   * selected session. The retired id must leave no cache behind, because a
   * later read for it can only answer 404.
   */
  rekeySession: (previousSessionId, sessionId, directory) => {
    if (!previousSessionId || !sessionId || previousSessionId === sessionId) return
    const ownedDirectory = normalizePath(directory ?? get().getDirectoryForSession(previousSessionId))
    const globalStore = useGlobalSessionsStore.getState()
    const previousRow = globalStore.entityById.get(previousSessionId)
    // The service rekeys a root to a self-rooted session whose branch carries
    // the pre-branch conversation, so the projection keeps the same owner and
    // only the identity changes.
    if (previousRow && ownedDirectory) {
      const membership = getMultiRunMembership(previousRow)
      const metadata = membership
        ? withMultiRunMembership(previousRow, { ...membership, sessionID: sessionId })
        : previousRow.metadata
      globalStore.applySessionMutations([
        { type: "remove", sessionId: previousSessionId },
        { type: "upsert", session: { ...previousRow, sessionId, rootSessionId: sessionId, parentSessionId: undefined, metadata } },
      ])
      registerSessionDirectory(sessionId, ownedDirectory)
    } else if (previousRow) {
      globalStore.removeSessions([previousSessionId])
    }
    // Retire the pre-branch identity in one pass: its cached loads, child-store
    // projection and live recovery stream all address an id both authorities
    // now answer 404 for, so leaving the stream attached makes it retry forever.
    if (ownedDirectory) {
      retireRekeyedSession(previousSessionId, sessionId, [ownedDirectory])
      getImperativeSessionMessageLoader()?.touchSessionCache({ directory: ownedDirectory, sessionId })
    }
    const previousDirectory = get().currentSessionDirectory
    if (get().currentSessionId === previousSessionId) {
      guessedSelectionSessionId = null
      set({ currentSessionId: sessionId, currentSessionDirectory: ownedDirectory ?? previousDirectory })
      const activeDirectory = ownedDirectory ?? previousDirectory
      setActiveSession(activeDirectory ?? "", sessionId)
      const key = runtimeMemoryKey()
      writeRuntimeSessionMemory(key, { sessionId, directory: ownedDirectory })
      persistLastActiveSession(key, { sessionId, directory: ownedDirectory })
      if (ownedDirectory && useDirectoryStore.getState().currentDirectory !== ownedDirectory) {
        useDirectoryStore.getState().setDirectory(ownedDirectory, { showOverlay: false })
      }
    }
    if (get().webUICreatedSessions.has(previousSessionId)) {
      const next = new Set(get().webUICreatedSessions)
      next.delete(previousSessionId)
      next.add(sessionId)
      set({ webUICreatedSessions: next })
    }
  },

  setSessionDirectory: (sessionId, directory) => {
    const normalized = normalizePath(directory)
    if (sessionId === guessedSelectionSessionId) {
      guessedSelectionSessionId = null
    }
    if (sessionId === get().currentSessionId) {
      set({ currentSessionDirectory: normalized })
      setActiveSession(normalized ?? "", sessionId)
      writeRuntimeSessionMemory(runtimeMemoryKey(), { sessionId, directory: normalized })
    }
  },

  // ---------------------------------------------------------------------------
  // Plan mode availability tracking
  // ---------------------------------------------------------------------------
  markSessionPlanAvailable: (sessionId) => {
    set((state) => {
      if (state.sessionPlanAvailable.get(sessionId) === true) {
        return state
      }
      const next = new Map(state.sessionPlanAvailable)
      next.set(sessionId, true)
      return { sessionPlanAvailable: next }
    })
  },

  isSessionPlanAvailable: (sessionId) => {
    return get().sessionPlanAvailable.get(sessionId) ?? false
  },
}))

const lastPersistedWorktreeSerializedByRuntime = new Map<string, string>()
useSessionUIStore.subscribe((state, prev) => {
  if (state.availableWorktreesByProject !== prev.availableWorktreesByProject) {
    const runtimeKey = runtimeMemoryKey()
    const serialized = JSON.stringify([...state.availableWorktreesByProject.entries()])
    if (serialized !== lastPersistedWorktreeSerializedByRuntime.get(runtimeKey)) {
      lastPersistedWorktreeSerializedByRuntime.set(runtimeKey, serialized)
      persistWorktreeTopology(runtimeKey, state.availableWorktreesByProject)
    }
  }
})
