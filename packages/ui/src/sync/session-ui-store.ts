<<<<<<< HEAD
/**
 * Session UI Store — ephemeral UI state only.
 *
 * Domain data (sessions, messages with inline native parts, permissions,
 * questions, status) lives in sync child stores. This store owns ONLY transient
 * UI concerns: current selection, draft state, viewport anchors, model/agent
 * preferences, voice state, abort prompts, attached files, worktree metadata.
 *
 * Session↔worktree attachments are the authoritative exception: they live in
 * session-worktree-store (shared sync), and session-ui-store routes through it.
 *
 * SDK-calling actions that need domain data read it from sync-refs.
 */
||||||| bc50ba56aa
/**
 * Session UI Store — ephemeral UI state only.
 *
 * Domain data (sessions, messages, parts, permissions, questions, status)
 * lives in sync child stores. This store owns ONLY transient UI concerns:
 * current selection, draft state, viewport anchors, model/agent preferences,
 * voice state, abort prompts, attached files, worktree metadata.
 *
 * Session↔worktree attachments are the authoritative exception: they live in
 * session-worktree-store (shared sync), and session-ui-store routes through it.
 *
 * SDK-calling actions that need domain data read it from sync-refs.
 */
=======
>>>>>>> upstream/main

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
import { problemMessage } from "@/lib/problemMessage"
import { useConfigStore } from "@/stores/useConfigStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionDisplayStore } from "@/stores/useSessionDisplayStore"
<<<<<<< HEAD
||||||| bc50ba56aa
import { syncSessionKnowledge } from "@/lib/sessionKnowledgeApi"
import { fetchResponseStyleInstruction } from "@/lib/responseStyle"
import { attachmentWireName } from "@/lib/attachmentIdentity"
=======
import { syncSessionKnowledge } from "@/lib/sessionKnowledgeApi"
import { fetchResponseStyleInstruction } from "@/lib/responseStyle"
import { attachmentWireName } from "@/lib/attachmentIdentity"
import { filesForModel } from "./text-model-images"
>>>>>>> upstream/main
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
import { getWorktreeSetupWaitEnabled } from "@/lib/openchamberConfig"
import { createSessionDraftId } from "@/stores/useSessionDraftsStore"
import { resolveProjectForSessionDirectory } from "@/lib/projectResolution"
<<<<<<< HEAD
||||||| bc50ba56aa
import { admitSession, isSessionAdmitted } from "./session-admission"
import { isSessionDirectoryAdmitted } from "./session-admission-rule"
=======
import { admitSession, isSessionAdmitted, withAdmittedLineage } from "./session-admission"
import { isSessionDirectoryAdmitted } from "./session-admission-rule"
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
  optimisticSend,
  commitStagedRevert,
  refetchSessionMessages,
  revertToMessage as revertToMessageAction,
=======
  optimisticSend,
  commitStagedRevert,
  commitSessionRevert,
  waitForPendingRevert,
  refetchSessionMessages,
  revertToMessage as revertToMessageAction,
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
import type { QueuedMessageGoal } from "@/stores/messageQueueStore"
import { sessionGoalIntro, setSessionGoal } from "@/lib/sessionGoalActions"
=======
import { trackPreparedChatFolder } from "@/lib/unconfirmedSends"
import type { SendMessageOptions } from "./send-message-options"
export type { SendMessageOptions, SentMessage } from "./send-message-options"
import { sessionGoalIntro, setSessionGoal } from "@/lib/sessionGoalActions"
>>>>>>> upstream/main
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

<<<<<<< HEAD
export type { AttachedFile }

||||||| bc50ba56aa
export type { AttachedFile }

type GoalCommand = { name: string; template?: string }

export function expandSlashCommandGoalObjective(content: string, commands: GoalCommand[]): string {
  if (!content.startsWith("/")) return content
  const [head, ...tail] = content.split(" ")
  const command = commands.find((candidate) => candidate.name === head.slice(1))
  if (!command?.template?.trim()) return content
  const argumentsText = tail.join(" ")
  if (command.template.includes("$ARGUMENTS")) {
    return command.template.replaceAll("$ARGUMENTS", argumentsText)
  }

  const positions = [...command.template.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))
  if (positions.length > 0) {
    const parsedArguments = [...argumentsText.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
      .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    const lastPosition = Math.max(...positions)
    return command.template.replace(/\$(\d+)/g, (_match, value: string) => {
      const position = Number(value)
      return position === lastPosition
        ? parsedArguments.slice(position - 1).join(" ")
        : (parsedArguments[position - 1] ?? "")
    })
  }

  return argumentsText ? `${command.template}\n\n${argumentsText}` : command.template
}

/**
 * The goal objective a prompt stands for. Same directory-scoped resolution as
 * routeMessage: the objective must come from this directory's command, not a
 * same-named one elsewhere. OpenCode 2.x serves commands without their
 * templates, so an unknown command's raw invocation stays the objective.
 */
export function resolveGoalObjective(content: string, directory: string | null | undefined): string {
  if (!content.startsWith("/")) return content
  return expandSlashCommandGoalObjective(content, selectCommandsForDirectory(useCommandsStore.getState(), directory))
}
=======
type GoalCommand = { name: string; template?: string }

export function expandSlashCommandGoalObjective(content: string, commands: GoalCommand[]): string {
  if (!content.startsWith("/")) return content
  const [head, ...tail] = content.split(" ")
  const command = commands.find((candidate) => candidate.name === head.slice(1))
  if (!command?.template?.trim()) return content
  const argumentsText = tail.join(" ")
  if (command.template.includes("$ARGUMENTS")) {
    return command.template.replaceAll("$ARGUMENTS", argumentsText)
  }

  const positions = [...command.template.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))
  if (positions.length > 0) {
    const parsedArguments = [...argumentsText.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
      .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    const lastPosition = Math.max(...positions)
    return command.template.replace(/\$(\d+)/g, (_match, value: string) => {
      const position = Number(value)
      return position === lastPosition
        ? parsedArguments.slice(position - 1).join(" ")
        : (parsedArguments[position - 1] ?? "")
    })
  }

  return argumentsText ? `${command.template}\n\n${argumentsText}` : command.template
}

export function resolveGoalObjective(content: string, directory: string | null | undefined): string {
  if (!content.startsWith("/")) return content
  return expandSlashCommandGoalObjective(content, selectCommandsForDirectory(useCommandsStore.getState(), directory))
}
>>>>>>> upstream/main


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
<<<<<<< HEAD
  variant?: string
  reasoningEffort?: string
||||||| bc50ba56aa
  /** `null` is an explicit `Default` thinking level. */
  variant?: string | null
=======
  variant?: string | null
>>>>>>> upstream/main
  inputMode?: "normal" | "shell"
  files?: PromptAttachment[]
  additionalParts?: Array<{ text: string; synthetic?: boolean; metadata?: ContextPartMetadata; files?: PromptAttachment[]; systemContext?: 'session-knowledge' }>
  appendSubmissions?: () => void
<<<<<<< HEAD
  delivery?: 'run' | 'steer' | 'follow-up'
  /** Host idempotency key; never a slash command name. */
  commandId?: string
  skills?: CanonicalSkillMentions
  /** Queue capture already ran the native pipeline and preserved the resulting selection. */
  fileResourcesExpanded?: boolean
  /** Goal preparation reuses its authoritative expansion when the prompt is delivered. */
  fileResourceExpansion?: FileResourceExpandResult | null
||||||| bc50ba56aa
  delivery?: 'steer'
  skills?: SkillMentions
  /**
   * What the request waits for: the session being created from a draft, its
   * project knowledge being written into it. A prompt's message appears
   * without waiting for it; only the request does. A rejection fails the send.
   */
  ready?: Promise<void>
  /** Runs right before the request that starts the turn leaves (the gate on a session's first send). */
  beforeSend?: () => void
  /**
   * Whether the optimistic insert marks the session busy. A session created
   * from a draft is marked once it exists, by its creator.
   */
  markBusy?: boolean
=======
  delivery?: 'steer'
  skills?: SkillMentions
  metadata?: Metadata
  ready?: Promise<void>
  beforeSend?: () => void
  onMessageMinted?: (messageId: string) => void
  markBusy?: boolean
>>>>>>> upstream/main
}): Promise<'command' | 'prompt' | 'shell'> {
  const runtimeKey = params.runtimeKey ?? getRuntimeKey()
  const runtimeRevision = params.runtimeRevision ?? getRuntimeSwitchRevision()
  assertSendRuntime(runtimeKey, runtimeRevision)
  const requestDirectory = params.directory ?? undefined
<<<<<<< HEAD
  const sendSelection = resolveSendSelection(params.sessionId, requestDirectory, {
    providerId: params.providerID,
    modelId: params.modelID,
||||||| bc50ba56aa
  // The request goes to the directory the session lives in when it leaves:
  // a session created from a draft can end up elsewhere than where its first
  // message was shown, and its record is there. The record decides, since a
  // store holding the session proves containment only.
  const sendDirectory = () => getAuthoritativeSessionDirectory(params.sessionId) ?? requestDirectory
  // The session carries its own model and agent server-side. Sending them on
  // every turn would switch the session to whatever the composer happens to
  // show, so only a genuine change travels with the prompt. Resolved when the
  // request is about to leave: a session created from a draft has its record,
  // with the model it was created on, only once `ready` settles.
  const sendSelection = () => resolveCheckedSendSelection(params.sessionId, sendDirectory(), {
    providerID: params.providerID,
    modelID: params.modelID,
=======
  const sendDirectory = () => getAuthoritativeSessionDirectory(params.sessionId) ?? requestDirectory
  const sendSelection = () => resolveCheckedSendSelection(params.sessionId, sendDirectory(), {
    providerID: params.providerID,
    modelID: params.modelID,
>>>>>>> upstream/main
    variant: params.variant,
    agentId: params.agent,
    reasoningEffort: params.reasoningEffort,
  })
<<<<<<< HEAD

  const additionalContext: PromptContext[] = (params.additionalParts ?? [])
||||||| bc50ba56aa
  // A context item becomes a synthetic message, which carries text only. Any
  // file it brought rides with the send so the attachment still arrives.
  const contextItems = (params.additionalParts ?? [])
=======
  const contextItems = (params.additionalParts ?? [])
>>>>>>> upstream/main
    .filter((part) => part.text.trim().length > 0)
<<<<<<< HEAD
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
||||||| bc50ba56aa
    .map((part) => ({ text: part.text, metadata: part.metadata }))
  // The command route takes no skill attachments, so the skills named in a
  // command's arguments are named in an instruction as before.
  const skillInstructionContext = (): Array<{ text: string }> => {
    const text = params.skills?.names.length ? params.skills.instructionFor(params.skills.names) : null
    return text ? [{ text }] : []
=======
    .map((part) => ({ text: part.text, metadata: part.metadata }))
  const skillInstructionContext = (): Array<{ text: string }> => {
    const text = params.skills?.names.length ? params.skills.instructionFor(params.skills.names) : null
    return text ? [{ text }] : []
>>>>>>> upstream/main
  }
<<<<<<< HEAD

||||||| bc50ba56aa
  const contextFiles = (params.additionalParts ?? []).flatMap((part) => part.files ?? [])
  const sendFiles = [...(params.files ?? []), ...contextFiles]

=======
>>>>>>> upstream/main
  if (params.inputMode === "shell") {
    assertSendRuntime(runtimeKey, runtimeRevision)
    await canonicalClient.startShell(params.sessionId, { command: params.content, background: false }, params.commandId)
    assertSendRuntime(runtimeKey, runtimeRevision)
    return 'shell'
  }

<<<<<<< HEAD
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
||||||| bc50ba56aa
  let skills = params.skills
  // Slash commands use the command route; skills attach to a normal prompt.
  if (params.content.startsWith("/")) {
    const [head, ...tail] = params.content.split(" ")
    const cmdName = head.slice(1)

    // Commands and skills are resolved for the session's own directory. A
    // project root and one of its worktrees can define different commands
    // under the same name. OpenCode 2.x lists skills separately and accepts
    // them as prompt attachments rather than commands.
    let matchedCommand = selectCommandsForDirectory(useCommandsStore.getState(), requestDirectory)
      .find((c) => c.name === cmdName)
    let matchedSkill = selectAvailableSkillsForDirectory(useSkillsStore.getState(), requestDirectory)
      .find((s) => s.name === cmdName)

    // The command list is no longer pre-warmed at bootstrap (listing it
    // initializes the directory's whole MCP fleet), so a name known to neither
    // store gets one live, directory-scoped lookup. That lookup decides the
    // route: a successful no-match is a plain prompt, while a failed lookup is
    // a send failure, because treating it as a prompt would silently send the
    // raw "/name" text instead of running the command.
    // The skills list is loaded per directory on demand too, so a skill of a
    // directory the store has not loaded yet gets the same live lookup. A
    // failed skills load is a send failure for the same reason. Commands keep
    // precedence when both lookups match.
    if (!matchedCommand && !matchedSkill) {
      const [liveCommands, skillsLoaded] = await Promise.all([
        opencodeClient.listCommands(requestDirectory),
        useSkillsStore.getState().loadSkills(requestDirectory),
      ])
      matchedCommand = liveCommands.find((c) => c.name === cmdName)
      if (!matchedCommand) {
        if (!skillsLoaded) {
          throw new Error(`Could not load skills to resolve /${cmdName}`)
        }
        matchedSkill = selectAvailableSkillsForDirectory(useSkillsStore.getState(), requestDirectory)
          .find((s) => s.name === cmdName)
      }
    }

    if (matchedCommand) {
      // The command route takes files only, so attached context (a quoted
      // selection, prepared conflict instructions) is
      // admitted ahead of it as synthetic messages. Sending "/name args" as
      // a prompt instead would skip the command's template entirely: OpenCode
      // 2.x expands it only on the command route.
      //
      // `session.command` assigns the message id itself, so there is no id to
      // hang an optimistic user message on. The command's message arrives
      // through the stream instead.
      params.appendSubmissions?.()
      await params.ready
      assertRuntimeCurrent()
      const commandContext = [
        ...contextItems,
        ...skillInstructionContext(),
      ]
      const selection = await sendSelection()
      const revertStaged = getSyncSessions(sendDirectory()).some((session) => session.id === params.sessionId && session.revert)
      await opencodeClient.sendCommand({
        runtimeKey: params.runtimeKey,
        id: params.sessionId,
        model: selection.model,
        agent: selection.agent,
        command: cmdName,
        arguments: tail.join(" "),
        files: sendFiles,
        context: commandContext.length > 0 ? commandContext : undefined,
        delivery: params.delivery,
        directory: sendDirectory(),
        beforeSend: params.beforeSend,
        commitRevert: revertStaged ? () => opencodeClient.commitRevert(params.sessionId, sendDirectory()) : undefined,
      })
=======
  const sendFiles = await filesForModel(params, [...(params.files ?? []), ...(params.additionalParts ?? []).flatMap((part) => part.files ?? [])], requestDirectory)

  let skills = params.skills
  if (params.content.startsWith("/")) {
    const [head, ...tail] = params.content.split(" ")
    const cmdName = head.slice(1)

    let matchedCommand = selectCommandsForDirectory(useCommandsStore.getState(), requestDirectory)
      .find((c) => c.name === cmdName)
    let matchedSkill = selectAvailableSkillsForDirectory(useSkillsStore.getState(), requestDirectory)
      .find((s) => s.name === cmdName)

    if (!matchedCommand && !matchedSkill) {
      const [liveCommands, skillsLoaded] = await Promise.all([
        opencodeClient.listCommands(requestDirectory),
        useSkillsStore.getState().loadSkills(requestDirectory),
      ])
      matchedCommand = liveCommands.find((c) => c.name === cmdName)
      if (!matchedCommand) {
        if (!skillsLoaded) {
          throw new Error(`Could not load skills to resolve /${cmdName}`)
        }
        matchedSkill = selectAvailableSkillsForDirectory(useSkillsStore.getState(), requestDirectory)
          .find((s) => s.name === cmdName)
      }
    }

    if (matchedCommand) {
      await params.ready
      assertRuntimeCurrent()
      await waitForPendingRevert(params.sessionId, sendDirectory())
      assertRuntimeCurrent()
      params.appendSubmissions?.()
      const commandContext = [
        ...contextItems,
        ...skillInstructionContext(),
      ]
      const selection = await sendSelection()
      const revertStaged = getSyncSessions(sendDirectory()).some((session) => session.id === params.sessionId && session.revert)
      await opencodeClient.sendCommand({
        runtimeKey: params.runtimeKey,
        id: params.sessionId,
        model: selection.model,
        agent: selection.agent,
        command: cmdName,
        arguments: tail.join(" "),
        files: sendFiles,
        context: commandContext.length > 0 ? commandContext : undefined,
        delivery: params.delivery,
        directory: sendDirectory(),
        beforeSend: params.beforeSend,
        commitRevert: revertStaged ? () => commitSessionRevert(params.sessionId, sendDirectory()) : undefined,
      })
>>>>>>> upstream/main
      return 'command'
    }
    const invocation = /^\/([^\s]+)(?:\s([\s\S]*))?$/.exec(params.content)
    const matchedSkill = selectAvailableSkillsForDirectory(useSkillsStore.getState(), requestDirectory)
      .find(skill => skill.name === invocation?.[1])
    if (matchedSkill) {
<<<<<<< HEAD
      const expandedSkill = await expandCanonicalSkills(params.sessionId, [matchedSkill.name], invocation?.[2] ?? '', runtimeKey, runtimeRevision)
      if (expandedSkill) request.input.context = [...request.input.context, { kind: 'instruction', text: expandedSkill }]
||||||| bc50ba56aa
      skills = {
        names: [...new Set([matchedSkill.name, ...(params.skills?.names ?? [])])],
        // Callers without a composer (multi-run) pass no builder; the skill
        // still has to be named when it cannot be attached.
        instructionFor: params.skills?.instructionFor ?? buildSkillMentionInstruction,
      }
=======
      skills = {
        names: [...new Set([matchedSkill.name, ...(params.skills?.names ?? [])])],
        instructionFor: params.skills?.instructionFor ?? buildSkillMentionInstruction,
      }
>>>>>>> upstream/main
    }
  }

<<<<<<< HEAD
  await dispatchPrompt()
||||||| bc50ba56aa
  // Normal prompt — optimistic insert so message appears instantly.
  await optimisticSend({
    runtimeKey: params.runtimeKey,
    sessionId: params.sessionId,
    content: params.content,
    directory: requestDirectory,
    files: sendFiles,
    context: contextItems,
    ready: params.ready,
    markBusy: params.markBusy,
    appendSubmissions: params.appendSubmissions,
    send: async (messageID, context, commitRevert) => {
      assertRuntimeCurrent()
      const selection = await sendSelection()
      return opencodeClient.sendMessage({
        runtimeKey: params.runtimeKey,
        id: params.sessionId,
        providerID: params.providerID,
        model: selection.model,
        agent: selection.agent,
        text: params.content,
        agentMentions: params.agentMentionName ? [{ name: params.agentMentionName }] : undefined,
        files: sendFiles,
        context: context.length > 0 ? context : undefined,
        delivery: params.delivery,
        messageId: messageID,
        directory: sendDirectory(),
        skills,
        beforeSend: params.beforeSend,
        commitRevert,
      }).then(() => {})
    },
  })
=======
  await optimisticSend({
    runtimeKey: params.runtimeKey,
    sessionId: params.sessionId,
    content: params.content,
    directory: requestDirectory,
    files: sendFiles,
    context: contextItems,
    ready: params.ready,
    markBusy: params.markBusy,
    appendSubmissions: params.appendSubmissions,
    onOptimisticInsert: params.onMessageMinted,
    send: async (messageID, context, commitRevert) => {
      assertRuntimeCurrent()
      const selection = await sendSelection()
      return opencodeClient.sendMessage({
        runtimeKey: params.runtimeKey,
        id: params.sessionId,
        providerID: params.providerID,
        model: selection.model,
        agent: selection.agent,
        text: params.content,
        agentMentions: params.agentMentionName ? [{ name: params.agentMentionName }] : undefined,
        files: sendFiles,
        context: context.length > 0 ? context : undefined,
        metadata: params.metadata,
        delivery: params.delivery,
        messageId: messageID,
        directory: sendDirectory(),
        skills,
        beforeSend: params.beforeSend,
        commitRevert,
      }).then(() => {})
    },
  })
>>>>>>> upstream/main
  return 'prompt'
}

<<<<<<< HEAD
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
  for (const attachment of attachments) {
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

||||||| bc50ba56aa
type CapturedSendTarget = {
  runtimeKey: string
  sessionId: string
  directory: string
}

type SendMessageOptions = {
  /** Explicit composer intent; automated continuations must not restore archives. */
  userInitiated?: boolean
  target?: CapturedSendTarget
  sessionId?: string
  directory?: string
  historySubmissions?: InputHistorySubmission[]
  /** Immutable copy of the new-session draft at submit time; used instead of the live draft. */
  draftSnapshot?: NewSessionDraftState
  delivery?: 'steer'
  /** Skills named inline, attached to the prompt once the session exists. */
  skills?: SkillMentions
  /**
   * A queued message carries its own goal intent. Set (a goal or `null`), it
   * replaces the composer's armed goal, which belongs to the composer text.
   */
  queuedGoal?: QueuedMessageGoal | null
  /**
   * A person sent this from a composer: after a successful prompt, remember
   * the level it actually carried for that model. Background, BTW and queued
   * delivery leave this unset and never overwrite the remembered level.
   */
  recordEffort?: boolean
  /** Revision captured with the composer's selection, before async preparation. */
  effortRevision?: number
}

=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Index in `userMessages` of the user message a staged revert took back. The
 * marker may sit on that message's context carriers rather than on the message
 * itself, so it is the first user message at or after the marker.
 */
function revertedUserMessageIndex(
  messages: readonly { id: string }[],
  userMessages: readonly { id: string }[],
  revertMessageID: string,
): number {
  const markerIndex = messages.findIndex((message) => message.id === revertMessageID)
  if (markerIndex < 0) return -1
  const reverted = messages.slice(markerIndex).find((message) => userMessages.includes(message))
  return reverted ? userMessages.indexOf(reverted) : -1
}
=======
function revertedUserMessageIndex(
  messages: readonly { id: string }[],
  userMessages: readonly { id: string }[],
  revertMessageID: string,
): number {
  const markerIndex = messages.findIndex((message) => message.id === revertMessageID)
  if (markerIndex < 0) return -1
  const reverted = messages.slice(markerIndex).find((message) => userMessages.includes(message))
  return reverted ? userMessages.indexOf(reverted) : -1
}
>>>>>>> upstream/main



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
<<<<<<< HEAD
||||||| bc50ba56aa
  /**
   * Composer discovery follows this folder; the target picker keeps the root.
   * A null directory means resolution is pending.
   */
  worktreeStartDirectory?: { worktreeRoot: string; directory: string | null } | null
=======
  worktreeStartDirectory?: { worktreeRoot: string; directory: string | null } | null
>>>>>>> upstream/main
  preserveDirectoryOverride?: boolean
  parentID: string | null
  title?: string
  initialPrompt?: string
  syntheticParts?: SyntheticContextPart[]
  targetFolderId?: string
  projectContextPins?: { notes: string[]; plans: string[] }
  target: NewSessionDraftTarget
  preparedChatDirectory?: string | null
<<<<<<< HEAD
||||||| bc50ba56aa
  /**
   * The draft's id in the server's shared drafts, which the sidebar lists
   * once the user leaves it. Set for every opened draft; a draft reopened
   * from the sidebar carries the id it was saved under.
   */
  workDraftId?: string
}

export type SetCurrentSessionOptions = {
  /** The session materialized a submitted draft, which the chat announces as its own transition. */
  transition?: "submitted-draft"
  /** Launch restoration preserves the device's sidebar project selection. */
  keepSingleProject?: boolean
=======
  workDraftId?: string
}

export type SetCurrentSessionOptions = {
  transition?: "submitted-draft"
  keepSingleProject?: boolean
>>>>>>> upstream/main
}

export type SessionUIState = {
  currentSessionId: string | null
  currentSessionDirectory: string | null
  materializedDraftSessionId: string | null
<<<<<<< HEAD
||||||| bc50ba56aa
  /** First sends in flight, by the id of the session they create. */
  pendingDraftSends: ReadonlyMap<string, PendingDraftSend>
=======
  pendingDraftSends: ReadonlyMap<string, PendingDraftSend>
>>>>>>> upstream/main
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
<<<<<<< HEAD
  // Plan mode - per-session plan file availability (set when plan_enter tool creates a plan)
  sessionPlanAvailable: Map<string, boolean>
  markSessionPlanAvailable: (sessionId: string) => void
  isSessionPlanAvailable: (sessionId: string) => boolean

  // Non-Git mode: dismissed signature hash per session, hides bar until new turn arrives
||||||| bc50ba56aa
  // Non-Git mode: dismissed signature hash per session, hides bar until new turn arrives
=======
>>>>>>> upstream/main

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
<<<<<<< HEAD
||||||| bc50ba56aa
  initializeNewOpenChamberSession: (sessionId: string, agents: unknown[]) => void
  /** `cwd` is where the session runs inside the checkout; it defaults to the worktree root. */
=======
  initializeNewOpenChamberSession: (sessionId: string, agents: unknown[]) => void
>>>>>>> upstream/main
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
<<<<<<< HEAD
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata; systemContext?: 'session-knowledge' }>,
    variant?: string,
||||||| bc50ba56aa
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }>,
    /** `null` is an explicit `Default` thinking level. */
    variant?: string | null,
=======
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }>,
    variant?: string | null,
>>>>>>> upstream/main
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
<<<<<<< HEAD
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
||||||| bc50ba56aa
  /**
   * Replace a guessed selection directory with the authoritative one once sync
   * has indexed the session. Safe to call at any time: it only ever promotes a
   * guess, never overrides a confirmed selection.
   */
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * Resolve the Host directory for a native session without reading a path from
 * the Session DTO. The admitted workspace mapping is authoritative; the sync
 * ownership index is the live-store fallback when that mapping is unavailable.
 */
||||||| bc50ba56aa
/**
 * The directory that owns a session, from the two server-backed signals.
 *
 * `null` means "not indexed yet", never "no directory" — callers must fall back
 * rather than treat it as empty.
 *
 * The session's own record wins. Holding a session in a child store proves
 * containment, not ownership: a project's session list legitimately includes
 * the sessions of its worktrees so the sidebar can group them, so the parent
 * repository holds worktree sessions too. Reading ownership from store
 * membership therefore reports the parent for a session that lives in a
 * worktree, and every fetch is then addressed to a directory that does not own
 * it. Store membership remains the fallback for a session whose record carries
 * no directory.
 */
=======
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
let admissionNavigationRevision = 0
/** Bumped by every selection and user-opened draft; a pending continuation compares it to know it was overtaken. */
export const getAdmissionNavigationRevision = (): number => admissionNavigationRevision
=======
let admissionNavigationRevision = 0
export const getAdmissionNavigationRevision = (): number => admissionNavigationRevision
>>>>>>> upstream/main

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

<<<<<<< HEAD
||||||| bc50ba56aa
// A chat draft has no folder of its own yet. It reads the managed Chats root,
// where its commands and skills come from, so the catalog and defaults it starts
// on are the ones its folder will have. Null until the server names the root.
const resolveDraftConfigDirectory = (
  draft: NewSessionDraftState,
  project: { path?: string | null } | null | undefined,
): string | null => normalizePath(draft.directoryOverride ?? null)
  ?? normalizePath(project?.path ?? null)
  ?? (draft.target === "chat" ? getChatsRoot() : null)

=======
const resolveDraftConfigDirectory = (
  draft: NewSessionDraftState,
  project: { path?: string | null } | null | undefined,
): string | null => normalizePath(draft.directoryOverride ?? null)
  ?? normalizePath(project?.path ?? null)
  ?? (draft.target === "chat" ? getChatsRoot() : null)

>>>>>>> upstream/main
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
      projectDefaultModel: currentProject?.defaultModel,
      projectDefaultVariant: currentProject?.defaultVariant,
    })
  }
<<<<<<< HEAD
  const activation = activateConfigForDirectory(configDirectory, { preserveManualModel: !projectChanged && draft.target === 'project' })
||||||| bc50ba56aa
  const activationOptions = { preserveManualModel: !projectChanged && draft.target === 'project' }
  // The first session of a worktree starts in the project's OpenCode folder,
  // so the agents and models offered are the ones that folder's config defines.
  // The preview stays quiet: the send reports a fallback to the worktree root.
  const worktreeProject = projectOfWorktreeRoot(configDirectory, draft.selectedProjectId, availableWorktreesByProject)
  // Until the start folder resolves, the composer lists no commands for the root.
  if (configDirectory && worktreeProject) {
    useSessionUIStore.getState().setDraftWorktreeStartDirectory(draft.draftId, configDirectory, null)
  }
  const isDraftStillCurrent = () => {
    const current = useSessionUIStore.getState()
    return revision === draftDefaultsRevision && getRuntimeKey() === runtimeKey
      && current.newSessionDraft.open && current.newSessionDraft.draftId === draft.draftId
  }
  const activation = configDirectory && worktreeProject
    // A worktree that failed to populate has no folder to read; its root is the fallback.
    ? resolveStartDirectory(worktreeProject, configDirectory).then(({ directory }) => directory, () => configDirectory).then(async (directory) => {
      if (!isDraftStillCurrent()) return
      useSessionUIStore.getState().setDraftWorktreeStartDirectory(draft.draftId, configDirectory, directory)
      await activateConfigForDirectory(directory, activationOptions)
    })
    : !configDirectory && draft.target === "chat"
      // A failed lookup leaves the catalog as it is; the next draft asks again.
      ? resolveChatsRootDirectory().then(async (chatsRoot) => {
        if (!isDraftStillCurrent()) return
        const activated = activateConfigForDirectory(chatsRoot, activationOptions)
        // The root's saved snapshot can hold another draft's pick; this draft starts on defaults.
        applyDefaults()
        await activated
      }, () => undefined)
      : activateConfigForDirectory(configDirectory, activationOptions)
=======
  const activationOptions = { preserveManualModel: !projectChanged && draft.target === 'project' }
  const worktreeProject = projectOfWorktreeRoot(configDirectory, draft.selectedProjectId, availableWorktreesByProject)
  if (configDirectory && worktreeProject) {
    useSessionUIStore.getState().setDraftWorktreeStartDirectory(draft.draftId, configDirectory, null)
  }
  const isDraftStillCurrent = () => {
    const current = useSessionUIStore.getState()
    return revision === draftDefaultsRevision && getRuntimeKey() === runtimeKey
      && current.newSessionDraft.open && current.newSessionDraft.draftId === draft.draftId
  }
  const activation = configDirectory && worktreeProject
    ? resolveStartDirectory(worktreeProject, configDirectory).then(({ directory }) => directory, () => configDirectory).then(async (directory) => {
      if (!isDraftStillCurrent()) return
      useSessionUIStore.getState().setDraftWorktreeStartDirectory(draft.draftId, configDirectory, directory)
      await activateConfigForDirectory(directory, activationOptions)
    })
    : !configDirectory && draft.target === "chat"
      ? resolveChatsRootDirectory().then(async (chatsRoot) => {
        if (!isDraftStillCurrent()) return
        const activated = activateConfigForDirectory(chatsRoot, activationOptions)
        applyDefaults()
        await activated
      }, () => undefined)
      : activateConfigForDirectory(configDirectory, activationOptions)
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * A session's first send, from Enter in its draft until the request that
 * starts the turn has left. The chat already shows the session; while
 * `sessionCreated` is false the server has not answered its creation yet.
 */
export type PendingDraftSend = {
  draftId: number
  sessionCreated: boolean
}

=======
export type PendingDraftSend = {
  draftId: number
  sessionCreated: boolean
}

>>>>>>> upstream/main
const resolveProjectRefForWorktreeDirectory = (directory: string | null, projectId?: string | null): { id: string; path: string } | null => {
  const projectsState = useProjectsStore.getState()
  if (projectId) {
    const project = projectsState.projects.find((entry) => entry.id === projectId)
    if (project?.path) return { id: project.id, path: project.path }
  }
  const resolved = resolveProjectForSessionDirectory(projectsState.projects, useSessionUIStore.getState().availableWorktreesByProject, directory)
  return resolved?.path ? { id: resolved.id, path: resolved.path } : null
}

<<<<<<< HEAD
const waitForWorktreeBootstrapIfConfigured = async (directory: string | null, projectId?: string | null, runtimeKey = getRuntimeKey(), runtimeRevision = getRuntimeSwitchRevision()): Promise<void> => {
  assertSendRuntime(runtimeKey, runtimeRevision)
  if (!directory) return
||||||| bc50ba56aa
const waitForWorktreeBootstrapIfConfigured = async (directory: string | null, projectId?: string | null): Promise<void> => {
  // A space runs its setup commands itself, and its creation holds the first message for them.
  if (!directory || isSpaceDirectory(directory)) return
=======
const waitForWorktreeBootstrapIfConfigured = async (directory: string | null, projectId?: string | null): Promise<void> => {
  if (!directory || isSpaceDirectory(directory)) return
>>>>>>> upstream/main
  const project = resolveProjectRefForWorktreeDirectory(directory, projectId)
  const waitEnabled = project ? await getWorktreeSetupWaitEnabled(project) : false
  assertSendRuntime(runtimeKey, runtimeRevision)
  if (waitEnabled) {
    await waitForWorktreeBootstrap(directory)
    assertSendRuntime(runtimeKey, runtimeRevision)
  }
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * The project of a draft aimed at a worktree's root, or null for any other
 * directory, such as a project root or a folder already inside a worktree.
 * Only a worktree's root starts in the project's configured OpenCode folder.
 */
const projectOfWorktreeRoot = (
  directory: string | null,
  projectId: string | null | undefined,
  availableWorktreesByProject: ReadonlyMap<string, readonly WorktreeMetadata[]>,
): { id: string; path: string } | null => {
  if (!directory) return null
  const target = normalizePath(directory)
  const isWorktreeRoot = [...availableWorktreesByProject.values()]
    .some((worktrees) => worktrees.some((worktree) => normalizePath(worktree.path) === target))
  return isWorktreeRoot ? resolveProjectRefForWorktreeDirectory(directory, projectId) : null
}

/** Where the draft's first session starts; a fallback to the worktree root is reported to the user. */
const resolveDraftStartDirectory = async (directory: string | null, projectId?: string | null): Promise<string | null> => {
  const project = projectOfWorktreeRoot(directory, projectId, useSessionUIStore.getState().availableWorktreesByProject)
  return directory && project ? resolveWorktreeStartDirectory(project, directory) : directory
}

=======
const projectOfWorktreeRoot = (
  directory: string | null,
  projectId: string | null | undefined,
  availableWorktreesByProject: ReadonlyMap<string, readonly WorktreeMetadata[]>,
): { id: string; path: string } | null => {
  if (!directory) return null
  const target = normalizePath(directory)
  const isWorktreeRoot = [...availableWorktreesByProject.values()]
    .some((worktrees) => worktrees.some((worktree) => normalizePath(worktree.path) === target))
  return isWorktreeRoot ? resolveProjectRefForWorktreeDirectory(directory, projectId) : null
}

const resolveDraftStartDirectory = async (directory: string | null, projectId?: string | null): Promise<string | null> => {
  const project = projectOfWorktreeRoot(directory, projectId, useSessionUIStore.getState().availableWorktreesByProject)
  return directory && project ? resolveWorktreeStartDirectory(project, directory) : directory
}

>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * Regular new-chat drafts inherit the persisted current/last directory. If that
 * path is confirmed missing (deleted worktree), fall back to the active project.
 * Explicit worktree targets, in-flight worktree creation, and unknown/offline
 * probes stay unchanged so a temporary outage cannot rewrite the destination.
 * A concurrent rewrite of the same implicit draft to that fallback is accepted
 * instead of aborting create.
 */
||||||| bc50ba56aa
/**
 * Whether `directory` is a remembered target of an implicit draft, which the
 * draft may leave for the active project when it turns out to be gone. A
 * space's directory exists inside the space only: the host's probe would
 * call it missing and start the chat in the project.
 */
const isRecoverableDraftDirectory = (draft: NewSessionDraftState, directory: string | null): directory is string =>
  Boolean(directory)
  && draft.open
  && draft.preserveDirectoryOverride !== true
  && !isSpaceDirectory(directory)
  && !draft.pendingWorktreeRequestId
  && !draft.bootstrapPendingDirectory
  && normalizePath(draft.directoryOverride) === normalizePath(directory)

/**
 * `directory`, or the active project's when the directory the implicit draft
 * remembered is confirmed gone (a deleted worktree). For a draft that is
 * already a session on screen: the probe's answer cannot be outrun by a
 * change to the draft, so none is checked for.
 */
const recoverMissingDraftDirectory = async (draft: NewSessionDraftState, directory: string | null): Promise<string | null> => {
  if (!isRecoverableDraftDirectory(draft, directory)) return directory
  const activeProjectDirectory = resolveActiveProjectDirectory(draft)
  if (!activeProjectDirectory || normalizePath(directory) === activeProjectDirectory) return directory
  const availability = await opencodeClient.getDirectoryAvailability(directory)
  return availability === "missing" ? activeProjectDirectory : directory
}

/**
 * Regular new-chat drafts inherit the persisted current/last directory. If that
 * path is confirmed missing (deleted worktree), fall back to the active project.
 * Explicit worktree targets, in-flight worktree creation, and unknown/offline
 * probes stay unchanged so a temporary outage cannot rewrite the destination.
 * A concurrent rewrite of the same implicit draft to that fallback is accepted
 * instead of aborting create.
 */
=======
const isRecoverableDraftDirectory = (draft: NewSessionDraftState, directory: string | null): directory is string =>
  Boolean(directory)
  && draft.open
  && draft.preserveDirectoryOverride !== true
  && !isSpaceDirectory(directory)
  && !draft.pendingWorktreeRequestId
  && !draft.bootstrapPendingDirectory
  && normalizePath(draft.directoryOverride) === normalizePath(directory)

const recoverMissingDraftDirectory = async (draft: NewSessionDraftState, directory: string | null): Promise<string | null> => {
  if (!isRecoverableDraftDirectory(draft, directory)) return directory
  const activeProjectDirectory = resolveActiveProjectDirectory(draft)
  if (!activeProjectDirectory || normalizePath(directory) === activeProjectDirectory) return directory
  const availability = await opencodeClient.getDirectoryAvailability(directory)
  return availability === "missing" ? activeProjectDirectory : directory
}

>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * The effort a send should record for its session.
 *
 * A send carries `undefined` both when no effort was ever chosen and when the
 * user explicitly picked "Default", so the sent value alone cannot tell the two
 * apart, and recording it raw clears a real "Default". The live selection can
 * tell them apart, because its `override` keeps `null` for "Default" — but only
 * while it still describes the agent and model being sent to. Otherwise the
 * send's own value is all there is to go on.
 */
||||||| bc50ba56aa
/**
 * The effort a send should record for its session.
 *
 * A send carries `undefined` both when no effort was ever chosen and when the
 * user explicitly picked "Default", so the sent value alone cannot tell the two
 * apart, and recording it raw clears a real "Default". The live selection can
 * tell them apart, because its `override` keeps `null` for "Default" — but only
 * while it still describes the agent and model being sent to, and only for a
 * send from the main chat, whose composer that selection is: a `/btw` fork or
 * a chat pinned in the side panel keeps its own level on the same agent and
 * model. Otherwise the send's own value is all there is to go on.
 */
=======
>>>>>>> upstream/main
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
<<<<<<< HEAD
  variant?: string
  reasoningEffort?: string
}, draftOverride?: NewSessionDraftState, runtimeKey = getRuntimeKey(), runtimeRevision = getRuntimeSwitchRevision()): Promise<MaterializedDraftSession | null> {
  assertSendRuntime(runtimeKey, runtimeRevision)
||||||| bc50ba56aa
  /** `null` is an explicit `Default` thinking level. */
  variant?: string | null
}

const trimAgent = (agent: string | undefined): string | undefined => (
  typeof agent === "string" && agent.trim().length > 0 ? agent.trim() : undefined
)

/** The model and agent a draft's session is created on, so the first send needs no switch (which v2 would record in the transcript). */
const draftSessionCreateSelection = (selection: DraftSessionSelection): SessionCreateSelection => ({
  model: { providerID: selection.providerID, id: selection.modelID, variant: selection.variant },
  agent: trimAgent(selection.agent),
})

const draftSessionMetadata = (draft: NewSessionDraftState): Metadata | undefined => {
  const draftPins = draft.projectContextPins ?? { notes: [], plans: [] }
  return draftPins.notes.length > 0 || draftPins.plans.length > 0
    ? { openchamber: { project_context_pins: draftPins } }
    : undefined
}

/**
 * The directory a draft's session is shown in from its first message on: known
 * once a worktree still being made exists and a chat's folder is prepared.
 * Where the server creates the session can still differ, see
 * `resolveDraftCreateDirectory`.
 */
const resolveDraftTargetDirectory = async (draft: NewSessionDraftState): Promise<string | null> => {
=======
  variant?: string | null
}

const trimAgent = (agent: string | undefined): string | undefined => (
  typeof agent === "string" && agent.trim().length > 0 ? agent.trim() : undefined
)

const draftSessionCreateSelection = (selection: DraftSessionSelection): SessionCreateSelection => ({
  model: { providerID: selection.providerID, id: selection.modelID, variant: selection.variant },
  agent: trimAgent(selection.agent),
})

const draftSessionMetadata = (draft: NewSessionDraftState): Metadata | undefined => {
  const draftPins = draft.projectContextPins ?? { notes: [], plans: [] }
  return draftPins.notes.length > 0 || draftPins.plans.length > 0
    ? { openchamber: { project_context_pins: draftPins } }
    : undefined
}

const resolveDraftTargetDirectory = async (draft: NewSessionDraftState): Promise<string | null> => {
>>>>>>> upstream/main
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

<<<<<<< HEAD
  const isChatDraft = draft.target === "chat"
  if (isChatDraft) {
    draftDirectoryOverride = await store.prepareChatDraftDirectory(draft, runtimeKey, runtimeRevision)
    assertSendRuntime(runtimeKey, runtimeRevision)
    if (!draftDirectoryOverride) throw new Error("Failed to prepare chat directory")
||||||| bc50ba56aa
  if (draft.target === "chat") {
    directory = await store.prepareChatDraftDirectory()
    if (!directory) throw new Error("Failed to prepare chat directory")
    // The folder is the session's now: closing the draft must not remove it.
=======
  if (draft.target === "chat") {
    directory = await store.prepareChatDraftDirectory()
    if (!directory) throw new Error("Failed to prepare chat directory")
>>>>>>> upstream/main
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

<<<<<<< HEAD
  const draftPins = draft.projectContextPins ?? { notes: [], plans: [] }
  // Native admission and the first prompt use the same captured selection.
  const created = await createSessionWithDraftLifecycle(
    draft.title,
    draftDirectoryOverride,
    draftPins.notes.length > 0 || draftPins.plans.length > 0
      ? { openchamber: { project_context_pins: draftPins } }
      : undefined,
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
||||||| bc50ba56aa
/**
 * Where the server creates a draft's session, after the waits that need no
 * open draft: a worktree's setup commands, the project's start folder inside
 * a worktree, and the probe that moves an implicit draft off a deleted
 * directory. Reads the project's setup over the network, so it runs while
 * the first message is already on screen.
 */
const resolveDraftCreateDirectory = async (draft: NewSessionDraftState, directory: string | null): Promise<string | null> => {
  const draftProjectId = draft.selectedProjectId ?? null
  await waitForWorktreeBootstrapIfConfigured(directory, draftProjectId)
  const startDirectory = await resolveDraftStartDirectory(directory, draftProjectId)
  return recoverMissingDraftDirectory(draft, startDirectory)
}

/**
 * Where the draft's session will live, once every wait before its creation
 * is over, for a caller that keeps the draft open until then.
 */
const resolveDraftSessionDirectory = async (
  draft: NewSessionDraftState,
  chatDirectoryCleanup: CapturedChatDirectoryCleanup | null,
): Promise<string | null | undefined> => {
  const draftProjectId = draft.selectedProjectId ?? null
  let directory = await resolveDraftTargetDirectory(draft)
  await waitForWorktreeBootstrapIfConfigured(directory, draftProjectId)
  directory = await resolveDraftStartDirectory(directory, draftProjectId)
  const resolved = await resolveCreatableDraftDirectory(draft, directory)
  if (resolved.status === "aborted") {
    if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
=======
const resolveDraftCreateDirectory = async (draft: NewSessionDraftState, directory: string | null): Promise<string | null> => {
  const draftProjectId = draft.selectedProjectId ?? null
  await waitForWorktreeBootstrapIfConfigured(directory, draftProjectId)
  const startDirectory = await resolveDraftStartDirectory(directory, draftProjectId)
  return recoverMissingDraftDirectory(draft, startDirectory)
}

const resolveDraftSessionDirectory = async (
  draft: NewSessionDraftState,
  chatDirectoryCleanup: CapturedChatDirectoryCleanup | null,
): Promise<string | null | undefined> => {
  const draftProjectId = draft.selectedProjectId ?? null
  let directory = await resolveDraftTargetDirectory(draft)
  await waitForWorktreeBootstrapIfConfigured(directory, draftProjectId)
  directory = await resolveDraftStartDirectory(directory, draftProjectId)
  const resolved = await resolveCreatableDraftDirectory(draft, directory)
  if (resolved.status === "aborted") {
    if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
>>>>>>> upstream/main
    throw new Error("Failed to create session")
  }

<<<<<<< HEAD
  // The server response is authoritative. Resolve its workspace directory from
  // sync/global indexes; native Session deliberately carries no Host path.
  const createdDirectory = normalizePath(
    getSyncSessionDirectory(created.sessionId)
    ?? resolveGlobalSessionDirectory(created)
    ?? draftDirectoryOverride
    ?? null,
  )
||||||| bc50ba56aa
/**
 * Records what the session created from `draft` carries, once the server has
 * it, and answers the directory the server put it in. The response is
 * authoritative: it may canonicalize a requested worktree path (through a
 * symlink or platform path casing), and sending with the pre-canonical path
 * can target a different directory scope than the session itself.
 */
const finishDraftSession = (
  draft: NewSessionDraftState,
  created: Session,
  requestedDirectory: string | null | undefined,
): string | null => {
  const isChatDraft = draft.target === "chat"
  const createdDirectory = normalizePath(created.directory ?? requestedDirectory ?? null)
=======
const finishDraftSession = (
  draft: NewSessionDraftState,
  created: Session,
  requestedDirectory: string | null | undefined,
): string | null => {
  const isChatDraft = draft.target === "chat"
  const createdDirectory = normalizePath(created.directory ?? requestedDirectory ?? null)
>>>>>>> upstream/main

<<<<<<< HEAD
  if (useSessionUIStore.getState().newSessionDraft.draftId === draft.draftId) {
    persistDraftTarget({
      projectId: draftProjectId,
      directory: createdDirectory,
      target: draft.target,
    })
||||||| bc50ba56aa
  // A chat started while the Chats section is hidden would be listed nowhere
  // in the sidebar, so starting one brings the section back.
  if (isChatDraft && !useSessionDisplayStore.getState().showChatsSection) {
    useSessionDisplayStore.getState().setShowChatsSection(true)
    void import("@/lib/persistence")
      .then(({ updateDesktopSettings }) => updateDesktopSettings({ sidebarShowChatsSection: true }))
      .catch((error) => {
        console.warn("Failed to save the shown Chats section:", error)
      })
=======
  if (isChatDraft && !useSessionDisplayStore.getState().showChatsSection) {
    useSessionDisplayStore.getState().setShowChatsSection(true)
    void import("@/lib/persistence")
      .then(({ updateDesktopSettings }) => updateDesktopSettings({ sidebarShowChatsSection: true }))
      .catch((error) => {
        console.warn("Failed to save the shown Chats section:", error)
      })
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
  if (draft.targetFolderId) {
    const scopeDirectory = requestedDirectory || useSessionUIStore.getState().lastLoadedDirectory || created.directory
    const scopeKey = getChatsRootFromDirectory(scopeDirectory) ?? scopeDirectory
    if (scopeKey) {
      useSessionFoldersStore.getState().addSessionToFolder(scopeKey, draft.targetFolderId, created.id)
    }
  }

  return createdDirectory
}

/** Saves the selection a draft's session starts on under its id; answers the agent the first send runs on. */
const saveDraftSessionSelection = (sessionId: string, selection: DraftSessionSelection): string | undefined => {
  const configState = useConfigStore.getState()
  const effectiveDraftAgent = trimAgent(selection.agent) ?? configState.currentAgentName
  // Only the main chat opens a new-session draft.
  const variantOverride = resolveVariantToRecord(
    true,
    effectiveDraftAgent,
    selection.providerID,
    selection.modelID,
    selection.variant,
  )

  useSelectionStore.getState().saveSessionModelSelection(sessionId, selection.providerID, selection.modelID)

  if (effectiveDraftAgent) {
    useSelectionStore.getState().saveSessionAgentSelection(sessionId, effectiveDraftAgent)
    if (configState.selectionSource === "manual") {
      useSelectionStore.getState().saveAgentModelForSession(sessionId, effectiveDraftAgent, selection.providerID, selection.modelID)
    }
    useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, effectiveDraftAgent, selection.providerID, selection.modelID, variantOverride)
  }

  useSessionUIStore.getState().initializeNewOpenChamberSession(sessionId, configState.agents ?? [])
  return effectiveDraftAgent
}

type CapturedChatDirectoryCleanup = (directory: string) => Promise<void>

/**
 * Capture the folder's owner before preparation can yield to a runtime switch.
 */
const captureChatDirectoryCleanup = async (
  target: NewSessionDraftState["target"],
  expectedRuntimeKey: string,
): Promise<CapturedChatDirectoryCleanup | null> => {
  return target === "chat" ? captureChatCleanup(expectedRuntimeKey) : null
}

/**
 * Only the captured owner may remove a folder prepared by this operation.
 */
const deletePreparedChatDirectory = async (
  directory: string | null | undefined,
  cleanup: CapturedChatDirectoryCleanup | null,
): Promise<void> => {
  if (!directory) return
  await cleanup?.(directory)
}

export async function materializeOpenDraftSession(
  selection: DraftSessionSelection,
  draftOverride?: NewSessionDraftState,
  expectedRuntimeKey = getRuntimeKey(),
): Promise<MaterializedDraftSession | null> {
  const draft = draftOverride ?? useSessionUIStore.getState().newSessionDraft
  if (!draft?.open) return null
  const assertRuntimeCurrent = () => {
    if (getRuntimeKey() !== expectedRuntimeKey) throw new Error("Message was not sent because the runtime changed.")
  }
  assertRuntimeCurrent()
  const chatDirectoryCleanup = await captureChatDirectoryCleanup(draft.target, expectedRuntimeKey)
  assertRuntimeCurrent()

  const directory = await resolveDraftSessionDirectory(draft, chatDirectoryCleanup)
  if (getRuntimeKey() !== expectedRuntimeKey) {
    if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
    assertRuntimeCurrent()
  }
  const created = await createSessionAction(
    draft.title,
    directory,
    draftSessionMetadata(draft),
    "submitted-draft",
    draftSessionCreateSelection(selection),
    "open",
    undefined,
    expectedRuntimeKey,
  )
  if (!created?.id) {
    if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
    assertRuntimeCurrent()
    throw new Error("Failed to create session")
  }
  assertRuntimeCurrent()
  useSessionUIStore.getState().closeNewSessionDraft()

  const createdDirectory = finishDraftSession(draft, created, directory)
  const agent = saveDraftSessionSelection(created.id, selection)

=======
  if (draft.targetFolderId) {
    const scopeDirectory = requestedDirectory || useSessionUIStore.getState().lastLoadedDirectory || created.directory
    const scopeKey = getChatsRootFromDirectory(scopeDirectory) ?? scopeDirectory
    if (scopeKey) {
      useSessionFoldersStore.getState().addSessionToFolder(scopeKey, draft.targetFolderId, created.id)
    }
  }

  return createdDirectory
}

const saveDraftSessionSelection = (sessionId: string, selection: DraftSessionSelection): string | undefined => {
  const configState = useConfigStore.getState()
  const effectiveDraftAgent = trimAgent(selection.agent) ?? configState.currentAgentName
  const variantOverride = resolveVariantToRecord(
    true,
    effectiveDraftAgent,
    selection.providerID,
    selection.modelID,
    selection.variant,
  )

  useSelectionStore.getState().saveSessionModelSelection(sessionId, selection.providerID, selection.modelID)

  if (effectiveDraftAgent) {
    useSelectionStore.getState().saveSessionAgentSelection(sessionId, effectiveDraftAgent)
    if (configState.selectionSource === "manual") {
      useSelectionStore.getState().saveAgentModelForSession(sessionId, effectiveDraftAgent, selection.providerID, selection.modelID)
    }
    useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, effectiveDraftAgent, selection.providerID, selection.modelID, variantOverride)
  }

  useSessionUIStore.getState().initializeNewOpenChamberSession(sessionId, configState.agents ?? [])
  return effectiveDraftAgent
}

type CapturedChatDirectoryCleanup = (directory: string) => Promise<void>

const captureChatDirectoryCleanup = async (
  target: NewSessionDraftState["target"],
  expectedRuntimeKey: string,
): Promise<CapturedChatDirectoryCleanup | null> => {
  return target === "chat" ? captureChatCleanup(expectedRuntimeKey) : null
}

const deletePreparedChatDirectory = async (
  directory: string | null | undefined,
  cleanup: CapturedChatDirectoryCleanup | null,
): Promise<void> => {
  if (!directory) return
  await cleanup?.(directory)
}

export async function materializeOpenDraftSession(
  selection: DraftSessionSelection,
  draftOverride?: NewSessionDraftState,
  expectedRuntimeKey = getRuntimeKey(),
): Promise<MaterializedDraftSession | null> {
  const draft = draftOverride ?? useSessionUIStore.getState().newSessionDraft
  if (!draft?.open) return null
  const assertRuntimeCurrent = () => {
    if (getRuntimeKey() !== expectedRuntimeKey) throw new Error("Message was not sent because the runtime changed.")
  }
  assertRuntimeCurrent()
  const chatDirectoryCleanup = await captureChatDirectoryCleanup(draft.target, expectedRuntimeKey)
  assertRuntimeCurrent()

  const directory = await resolveDraftSessionDirectory(draft, chatDirectoryCleanup)
  if (getRuntimeKey() !== expectedRuntimeKey) {
    if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
    assertRuntimeCurrent()
  }
  const created = await createSessionAction(
    draft.title,
    directory,
    draftSessionMetadata(draft),
    "submitted-draft",
    draftSessionCreateSelection(selection),
    "open",
    undefined,
    expectedRuntimeKey,
  )
  if (!created?.id) {
    if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
    assertRuntimeCurrent()
    throw new Error("Failed to create session")
  }
  assertRuntimeCurrent()
  useSessionUIStore.getState().closeNewSessionDraft()

  const createdDirectory = finishDraftSession(draft, created, directory)
  const agent = saveDraftSessionSelection(created.id, selection)

>>>>>>> upstream/main
  return {
    sessionId: created.sessionId,
    directory: createdDirectory,
    agent: effectiveDraftAgent,
    syntheticParts: draftSyntheticParts,
  }
}

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
||||||| bc50ba56aa
/**
 * A send from a draft that failed, and where its text belongs now: the
 * session, when the server created it before the send failed, or the draft,
 * which is open again.
 */
export class DraftSendError extends Error {
  constructor(
    readonly sessionId: string,
    readonly directory: string,
    readonly sessionCreated: boolean,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = "DraftSendError"
  }
}

// A draft is sent once. Its id joins here when its send starts and leaves only
// when that send fails before the session exists, so the user can try again.
const sentDraftIds = new Set<number>()

const setPendingDraftSend = (sessionId: string, state: PendingDraftSend | null): void => {
  useSessionUIStore.setState((current) => {
    if (state === null && !current.pendingDraftSends.has(sessionId)) return current
    const next = new Map(current.pendingDraftSends)
    if (state === null) next.delete(sessionId)
    else next.set(sessionId, state)
    return { pendingDraftSends: next }
  })
}

/**
 * The server did not create the session: the chat shows the draft again,
 * where the composer gets the text back. A user who moved on meanwhile is
 * left where they are; their draft stays listed for a return.
 */
const reopenDraftAfterFailedCreation = (
  draft: NewSessionDraftState,
  sessionId: string,
  directory: string,
  runtimeKey: string,
): void => {
  sentDraftIds.delete(draft.draftId)
  // A worktree the draft waited for exists by now and its request is settled,
  // so the draft reopens on that directory; a chat prepares a new folder.
  const reopened: NewSessionDraftState = {
    ...draft,
    preparedChatDirectory: null,
    pendingWorktreeRequestId: null,
    directoryOverride: draft.target === "chat" ? draft.directoryOverride : directory,
  }
  if (getRuntimeKey() !== runtimeKey) {
    // The composer moved to another runtime: the captured one keeps the open
    // draft and forgets the empty session, so switching back shows the text
    // instead of a session that was never created. A draft or session the
    // user opened after sending stays as it is.
    const capturedKey = runtimeMemoryKey(runtimeKey)
    const capturedMemory = runtimeSessionMemory.get(capturedKey)
    if (capturedMemory && capturedMemory.sessionId !== sessionId) return
    writeRuntimeSessionMemory(capturedKey, {
      sessionId: null,
      directory: reopened.directoryOverride ?? null,
      draft: reopened,
    })
    activeSessionByRuntime.set(capturedKey, null)
    clearLastActiveSession(capturedKey)
    return
  }
  const store = useSessionUIStore.getState()
  if (store.currentSessionId !== sessionId) return
  store.setCurrentSession(null, reopened.directoryOverride)
  useSessionUIStore.setState({ newSessionDraft: reopened })
  writeRuntimeSessionMemory(runtimeMemoryKey(), { sessionId: null, directory: reopened.directoryOverride ?? null, draft: reopened })
  clearLastActiveSession(runtimeMemoryKey())
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
=======
export class DraftSendError extends Error {
  constructor(
    readonly sessionId: string,
    readonly directory: string,
    readonly sessionCreated: boolean,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = "DraftSendError"
  }
}

const sentDraftIds = new Set<number>()

const setPendingDraftSend = (sessionId: string, state: PendingDraftSend | null): void => {
  useSessionUIStore.setState((current) => {
    if (state === null && !current.pendingDraftSends.has(sessionId)) return current
    const next = new Map(current.pendingDraftSends)
    if (state === null) next.delete(sessionId)
    else next.set(sessionId, state)
    return { pendingDraftSends: next }
  })
}

const reopenDraftAfterFailedCreation = (
  draft: NewSessionDraftState,
  sessionId: string,
  directory: string,
  runtimeKey: string,
): void => {
  sentDraftIds.delete(draft.draftId)
  const reopened: NewSessionDraftState = {
    ...draft,
    preparedChatDirectory: null,
    pendingWorktreeRequestId: null,
    directoryOverride: draft.target === "chat" ? draft.directoryOverride : directory,
  }
  if (getRuntimeKey() !== runtimeKey) {
    const capturedKey = runtimeMemoryKey(runtimeKey)
    const capturedMemory = runtimeSessionMemory.get(capturedKey)
    if (capturedMemory && capturedMemory.sessionId !== sessionId) return
    writeRuntimeSessionMemory(capturedKey, {
      sessionId: null,
      directory: reopened.directoryOverride ?? null,
      draft: reopened,
    })
    activeSessionByRuntime.set(capturedKey, null)
    clearLastActiveSession(capturedKey)
    return
  }
  const store = useSessionUIStore.getState()
  if (store.currentSessionId !== sessionId) return
  store.setCurrentSession(null, reopened.directoryOverride)
  useSessionUIStore.setState({ newSessionDraft: reopened })
  writeRuntimeSessionMemory(runtimeMemoryKey(), { sessionId: null, directory: reopened.directoryOverride ?? null, draft: reopened })
  clearLastActiveSession(runtimeMemoryKey())
}

>>>>>>> upstream/main

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

<<<<<<< HEAD
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
||||||| bc50ba56aa
  // ---------------------------------------------------------------------------
  // setCurrentSession
  // ---------------------------------------------------------------------------
  setCurrentSession: (id, directoryHint?: string | null, options?: SetCurrentSessionOptions) => {
    const navigationRevision = ++admissionNavigationRevision
    if (id) {
      const record = useGlobalSessionsStore.getState().entityById.get(id)
      const directory = (record ? resolveGlobalSessionDirectory(record) : null)
        ?? resolveSessionDirectory(id, (sid) => get().worktreeMetadata.get(sid))
        ?? normalizePath(directoryHint)
      if (!directory || !isSessionAdmitted(directory)) {
        const runtimeKey = getRuntimeKey()
        const stillSelected = () => navigationRevision === admissionNavigationRevision && runtimeKey === getRuntimeKey()
        void (async () => {
          // Session detail starts no OpenCode location. Resolve unknown links
          // before trusting any fallback to the currently selected project.
          const destination = directory ?? resolveGlobalSessionDirectory(await opencodeClient.getSession(id))
          if (!destination || !stillSelected() || !await admitSession(id, destination, true) || !stillSelected()) return
          get().setCurrentSession(id, destination, options)
        })().catch((error) => console.warn('[session-admission] Could not open the session:', error))
        return
      }
      directoryHint = directory
    }
    const materializedDraftSessionId = id && options?.transition === "submitted-draft" ? id : null
    // Publish the transition identity before closing the draft. Those are two
    // separate store updates, and ChatContainer must never observe a closed
    // draft with the previous transition identity.
=======
  setCurrentSession: (id, directoryHint?: string | null, options?: SetCurrentSessionOptions) => {
    const navigationRevision = ++admissionNavigationRevision
    if (id) {
      const record = useGlobalSessionsStore.getState().entityById.get(id)
      const directory = withAdmittedLineage(id, (record ? resolveGlobalSessionDirectory(record) : null)
        ?? resolveSessionDirectory(id, (sid) => get().worktreeMetadata.get(sid))
        ?? normalizePath(directoryHint))
      if (!directory || !isSessionAdmitted(directory)) {
        const runtimeKey = getRuntimeKey()
        const stillSelected = () => navigationRevision === admissionNavigationRevision && runtimeKey === getRuntimeKey()
        void (async () => {
          const destination = directory ?? resolveGlobalSessionDirectory(await opencodeClient.getSession(id))
          if (!destination || !stillSelected()) return
          const admitted = await admitSession(id, destination, true)
          if (!admitted || !stillSelected()) return
          get().setCurrentSession(id, admitted, options)
        })().catch((error) => console.warn('[session-admission] Could not open the session:', error))
        return
      }
      directoryHint = directory
    }
    const materializedDraftSessionId = id && options?.transition === "submitted-draft" ? id : null
>>>>>>> upstream/main
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

<<<<<<< HEAD
    if (resolvedDir && directoryState.currentDirectory !== resolvedDir) {
      directoryState.setDirectory(resolvedDir, { showOverlay: false })
    }
    if (sessionProject && projectsState.activeProjectId !== sessionProject.id) {
      projectsState.setActiveProjectIdOnly(sessionProject.id)
    }
    if (id && !isGuessedDir && sessionProject) {
      useSessionDisplayStore.getState().setSingleProjectId(sessionProject.id)
||||||| bc50ba56aa
    try {
      if (resolvedDir && directoryState.currentDirectory !== resolvedDir) {
        directoryState.setDirectory(resolvedDir, { showOverlay: false })
      } else if (resolvedDir && leavesChatDraft) {
        // A chat draft keeps the app's directory but reads the Chats root's catalog.
        void activateConfigForDirectory(resolvedDir).catch((error) => {
          console.warn("Failed to activate directory after leaving a chat draft:", error)
        })
      }
      if (sessionProject && projectsState.activeProjectId !== sessionProject.id) {
        projectsState.setActiveProjectIdOnly(sessionProject.id)
      }
      if (id && !isGuessedDir && sessionProject && !options?.keepSingleProject) {
        useSessionDisplayStore.getState().setSingleProjectId(sessionProject.id)
      }
      opencodeClient.setDirectory(resolvedDir ?? undefined)
    } catch (e) {
      console.warn("Failed to set OpenCode directory for session switch:", e)
=======
    try {
      if (resolvedDir && directoryState.currentDirectory !== resolvedDir) {
        directoryState.setDirectory(resolvedDir, { showOverlay: false })
      } else if (resolvedDir && leavesChatDraft) {
        void activateConfigForDirectory(resolvedDir).catch((error) => {
          console.warn("Failed to activate directory after leaving a chat draft:", error)
        })
      }
      if (sessionProject && projectsState.activeProjectId !== sessionProject.id) {
        projectsState.setActiveProjectIdOnly(sessionProject.id)
      }
      if (id && !isGuessedDir && sessionProject && !options?.keepSingleProject) {
        useSessionDisplayStore.getState().setSingleProjectId(sessionProject.id)
      }
      opencodeClient.setDirectory(resolvedDir ?? undefined)
    } catch (e) {
      console.warn("Failed to set OpenCode directory for session switch:", e)
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
      if (!restoredSessionId && restoredDraft.open && restoredDraft.worktreeStartDirectory?.directory === null) {
        applyDraftTargetSelectionDefaults(restoredDraft, availableWorktreesByProject, undefined, restoredDraft)
      }
      // Opening a session admits its folder; a runtime switch is not the
      // user's choice, so a session outside every project is not reopened.
      const record = restoredSessionId ? useGlobalSessionsStore.getState().entityById.get(restoredSessionId) : null
      const directory = (record ? resolveGlobalSessionDirectory(record) : null) ?? restoredDirectory
      if (restoredSessionId && isSessionAdmitted(directory)) get().setCurrentSession(restoredSessionId, directory)
=======
      if (!restoredSessionId && restoredDraft.open && restoredDraft.worktreeStartDirectory?.directory === null) {
        applyDraftTargetSelectionDefaults(restoredDraft, availableWorktreesByProject, undefined, restoredDraft)
      }
      const record = restoredSessionId ? useGlobalSessionsStore.getState().entityById.get(restoredSessionId) : null
      const directory = (record ? resolveGlobalSessionDirectory(record) : null) ?? restoredDirectory
      if (restoredSessionId && isSessionAdmitted(directory)) get().setCurrentSession(restoredSessionId, directory)
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Callers that forward "the current session's directory" forward it for
    // chat sessions too, and a chat session's scratch directory names no
    // project. Treating it as an explicit project target would force a project
    // draft rooted in scratch; it is a request for another chat.
||||||| bc50ba56aa
    // Callers that forward "the current session's directory" forward it for
    // chat sessions too, and a chat session's scratch directory names no
    // project. Treating it as an explicit project target would force a project
    // draft rooted in scratch; it is a request for another chat. The archive
    // directory of a deleted isolated space is the same: a chat opened from
    // the Archive page leaves it behind as the current one, and a draft rooted
    // there would make a live session inside the archive.
    const isScratchDirectory = (directory: string): boolean => isChatDirectoryPath(directory) || isSpaceArchiveDirectory(directory)
=======
    const isScratchDirectory = (directory: string): boolean => isChatDirectoryPath(directory) || isSpaceArchiveDirectory(directory)
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Nothing explicit was asked for: reopen on the side the user last worked
    // on. Only a recorded project target that still resolves to an existing
    // project beats Chat — a project removed since must not open a draft
    // pointing at a directory that is no longer registered — and the live
    // directory must not itself be an unregistered external path.
    const restoresProjectTarget = !options?.target
||||||| bc50ba56aa
    // Nothing explicit was asked for: reopen on the side the user last worked
    // on. Only a recorded project target that still resolves to an existing
    // project beats Chat — a project removed since must not open a draft
    // pointing at a directory that is no longer registered — and the live
    // directory must not itself be an unregistered external path.
    const restoresProjectTarget = !isVSCodeRuntime()
      && !options?.target
=======
    const restoresProjectTarget = !isVSCodeRuntime()
      && !options?.target
>>>>>>> upstream/main
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
<<<<<<< HEAD
      // A chat session leaves a managed scratch directory behind as the current
      // one; it owns no project, so it must not decide this draft's project —
      // the recorded target below knows which project the user last chose.
      if (currentDirectory && !isChatDirectoryPath(currentDirectory)) {
        // Worktree discovery may not have run yet. If the live path matches
        // the recorded target, keep its registered project across launches.
        return currentDirProject
          ?? (restoresProjectTarget && currentDirectory === persistedTarget?.directory ? persistedProject : null)
      }
||||||| bc50ba56aa
      // A chat session leaves a managed scratch directory behind as the current
      // one; it owns no project, so it must not decide this draft's project —
      // the recorded target below knows which project the user last chose.
      if (currentDirectory && !isScratchDirectory(currentDirectory)) return currentDirProject
=======
      if (currentDirectory && !isScratchDirectory(currentDirectory)) return currentDirProject
>>>>>>> upstream/main
      return persistedProject ?? fallbackProject
    })()

<<<<<<< HEAD
||||||| bc50ba56aa
    // A space that cannot take a new session (its making failed, its container
    // is gone, its machine is out of reach) is no place to reopen a draft in:
    // the draft goes to the project root instead.
    const keepsDraft = (dir: string): boolean => !isScratchDirectory(dir) && !isSpaceDirectoryClosedToNewSessions(dir)
=======
    const keepsDraft = (dir: string): boolean => !isScratchDirectory(dir) && !isSpaceDirectoryClosedToNewSessions(dir)
>>>>>>> upstream/main
    const directory = target === "chat" ? null : (() => {
      if (explicitDirectory !== null) return explicitDirectory
      if (explicitProject) return normalizePath(explicitProject.path ?? null)
<<<<<<< HEAD
      // A chat session's directory is a managed scratch folder, never a
      // project: letting it through would open a project draft rooted in it.
      if (currentDirectory && !isChatDirectoryPath(currentDirectory)) return currentDirectory
      if (persistedTarget?.directory && !isChatDirectoryPath(persistedTarget.directory)) return persistedTarget.directory
||||||| bc50ba56aa
      // A chat session's directory is a managed scratch folder, never a
      // project: letting it through would open a project draft rooted in it.
      if (currentDirectory && keepsDraft(currentDirectory)) return currentDirectory
      if (persistedTarget?.directory && keepsDraft(persistedTarget.directory)) return persistedTarget.directory
=======
      if (currentDirectory && keepsDraft(currentDirectory)) return currentDirectory
      if (persistedTarget?.directory && keepsDraft(persistedTarget.directory)) return persistedTarget.directory
>>>>>>> upstream/main
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
<<<<<<< HEAD
      preserveDirectoryOverride: options?.preserveDirectoryOverride === true,
||||||| bc50ba56aa
      // A draft in a space is pinned wherever it opens from (a saved draft's
      // row, a restore): the space is not listed until its journey is read.
      preserveDirectoryOverride: options?.preserveDirectoryOverride === true || isSpaceDirectory(directory),
=======
      preserveDirectoryOverride: options?.preserveDirectoryOverride === true || isSpaceDirectory(directory),
>>>>>>> upstream/main
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
    if (directory) {
      const prep = resolveDraftWorkspace(nextDraft.draftId, directory)
        .then((ws) => canonicalClient.prepareSession({ projectId: ws.projectId, workspaceId: ws.workspaceId }))
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
<<<<<<< HEAD
      await deleteChatDirectory(directory).catch(() => undefined)
      assertSendRuntime(runtimeKey, runtimeRevision)
      return null
    }).finally(() => {
||||||| bc50ba56aa
      set({ newSessionDraft: { ...current, preparedChatDirectory: directory } })
      return directory
    })().finally(() => {
=======
      set({ newSessionDraft: { ...current, preparedChatDirectory: directory } })
      trackPreparedChatFolder(runtimeKey, directory)
      return directory
    })().finally(() => {
>>>>>>> upstream/main
      pendingChatDirectoryByDraft.delete(key)
    })
    pendingChatDirectoryByDraft.set(key, pending)
    return pending
  },

  closeNewSessionDraft: () => {
    const currentDraft = get().newSessionDraft
    if (currentDraft.preparedChatDirectory) {
      void deleteChatDirectory(currentDraft.preparedChatDirectory).catch(() => undefined)
    }
    const pendingPrep = pendingPreparationByDraft.get(currentDraft.draftId)
    pendingPreparationByDraft.delete(currentDraft.draftId)
    const discard = () => {
      const dir = currentDraft.preparedChatDirectory ?? currentDraft.directoryOverride ?? useDirectoryStore.getState().currentDirectory
      if (dir) {
        // The same per-draft resolution the open and admission used, so the
        // discard is the last reader of a workspace already resolved.
        void resolveDraftWorkspace(currentDraft.draftId, dir)
          .then((ws) => canonicalClient.discardPreparedSession({ workspaceId: ws.workspaceId }))
          .catch(() => undefined)
      }
    }
    if (pendingPrep) void pendingPrep.finally(discard)
    else discard()
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
      void deleteChatDirectory(previousDraft.preparedChatDirectory).catch(() => undefined)
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

<<<<<<< HEAD
  // ---------------------------------------------------------------------------
  // sendMessage — calls SDK, reads domain data from sync
  // ---------------------------------------------------------------------------
  // Armed goal: capture its objective and budget with the submitted prompt.
||||||| bc50ba56aa
  // ---------------------------------------------------------------------------
  // sendMessage — calls SDK, reads domain data from sync
  // ---------------------------------------------------------------------------
  // Armed goal (composer target button): the sent prompt becomes the goal
  // objective; budget comes from the global default setting. Fire-and-forget —
  // a failed metadata patch must not fail the send.
=======
>>>>>>> upstream/main
  sendMessage: async (
    content: string,
    providerID: string,
    modelID: string,
    agent?: string | null,
    attachments?: AttachedFile[],
    agentMentionName?: string,
<<<<<<< HEAD
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata; systemContext?: 'session-knowledge' }>,
    variant?: string,
||||||| bc50ba56aa
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }>,
    /** `null` is an explicit `Default` thinking level. */
    variant?: string | null,
=======
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }>,
    variant?: string | null,
>>>>>>> upstream/main
    inputMode?: "normal" | "shell",
    options?: SendMessageOptions,
  ) => {
<<<<<<< HEAD
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
||||||| bc50ba56aa
    const capturedTarget = options?.target
    const effortRevision = options?.effortRevision ?? readEffortRevision(providerID, modelID)
    const isCurrentRuntimeInstance = captureRuntimeInstance()
    const capturedRuntimeKey = capturedTarget?.runtimeKey ?? getRuntimeKey()
    if (capturedTarget && capturedTarget.runtimeKey !== getRuntimeKey()) {
      throw new Error("Message was not sent because the runtime changed.")
    }
    // A message sent while OpenCode is still starting waits for it here, ahead
    // of session creation, commands and shell, all of which need OpenCode.
    // Held sends go out one after another, in the order they were made.
    return runAfterOpenCodeStartup(async () => {
      const draft = options?.draftSnapshot ?? get().newSessionDraft
      const trimmedAgent = typeof agent === "string" && agent.trim().length > 0 ? agent.trim() : undefined
      if (capturedRuntimeKey !== getRuntimeKey()) {
        throw new Error("Message was not sent because the runtime changed.")
      }
      // The style goes into the session's instructions right before the send,
      // so a send carries the setting as it is now. The read runs alongside
      // the send: the message appears without waiting for it, only the prompt
      // request does.
      const responseStyleInstruction = inputMode === "shell"
        ? undefined
        : fetchResponseStyleInstruction().catch(() => undefined)
=======
    const capturedTarget = options?.target
    const effortRevision = options?.effortRevision ?? readEffortRevision(providerID, modelID)
    const isCurrentRuntimeInstance = captureRuntimeInstance()
    const capturedRuntimeKey = capturedTarget?.runtimeKey ?? getRuntimeKey()
    if (capturedTarget && capturedTarget.runtimeKey !== getRuntimeKey()) {
      throw new Error("Message was not sent because the runtime changed.")
    }
    return runAfterOpenCodeStartup(async () => {
      const draft = options?.draftSnapshot ?? get().newSessionDraft
      const trimmedAgent = typeof agent === "string" && agent.trim().length > 0 ? agent.trim() : undefined
      if (capturedRuntimeKey !== getRuntimeKey()) {
        throw new Error("Message was not sent because the runtime changed.")
      }
      const responseStyleInstruction = inputMode === "shell"
        ? undefined
        : fetchResponseStyleInstruction().catch(() => undefined)
>>>>>>> upstream/main

<<<<<<< HEAD
    // Resolve the captured destination and selection once; canonical delivery
    // owns connection readiness and request lifecycle.
    return (async () => {
      assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
      let sessionId = targetSessionId
      let directory = targetDirectory
      let parts: Parameters<SessionUIState['sendMessage']>[6] = submittedParts
      let draftEchoMessage: CanonicalMessage | undefined
||||||| bc50ba56aa
      const queuedGoal = options?.queuedGoal
      const goalArm = inputMode === "shell" || content.trim().length === 0
        ? { armed: false, objectiveOverride: null }
        : queuedGoal !== undefined
          ? { armed: queuedGoal !== null, objectiveOverride: queuedGoal?.objective ?? null }
          : useSessionGoalArmStore.getState().consume()
      const goalArmed = goalArm.armed
      // A queued goal keeps the budget it was queued with.
      const goalUiState = useUIStore.getState()
      const goalTokenBudget = queuedGoal
        ? queuedGoal.tokenBudget
        : (goalUiState.sessionGoalDefaultBudgetEnabled ? goalUiState.sessionGoalDefaultBudget : null)
      if (goalArmed) {
        additionalParts = [...(additionalParts ?? []), { text: sessionGoalIntro(goalTokenBudget), synthetic: true }]
      }
      const applyArmedGoal = async (goalSessionId: string, goalDirectory: string | null | undefined) => {
        if (!goalArmed) return
        const tokenBudget = goalTokenBudget
        const objective = goalArm.objectiveOverride?.trim() || resolveGoalObjective(content, goalDirectory)
        try {
          await setSessionGoal(goalSessionId, goalDirectory ?? undefined, { objective, tokenBudget }, null, capturedRuntimeKey)
        } catch (error) {
          // A queued message keeps its goal for the retry; only the composer's arm comes back.
          if (queuedGoal === undefined) useSessionGoalArmStore.getState().setArmed(true, goalArm.objectiveOverride)
          throw error
        }
      }
=======
      const queuedGoal = options?.queuedGoal
      const goalArm = inputMode === "shell" || content.trim().length === 0
        ? { armed: false, objectiveOverride: null }
        : queuedGoal !== undefined
          ? { armed: queuedGoal !== null, objectiveOverride: queuedGoal?.objective ?? null }
          : useSessionGoalArmStore.getState().consume()
      const goalArmed = goalArm.armed
      const goalUiState = useUIStore.getState()
      const goalTokenBudget = queuedGoal
        ? queuedGoal.tokenBudget
        : (goalUiState.sessionGoalDefaultBudgetEnabled ? goalUiState.sessionGoalDefaultBudget : null)
      if (goalArmed) {
        additionalParts = [...(additionalParts ?? []), { text: sessionGoalIntro(goalTokenBudget), synthetic: true }]
      }
      const applyArmedGoal = async (goalSessionId: string, goalDirectory: string | null | undefined) => {
        if (!goalArmed) return
        const tokenBudget = goalTokenBudget
        const objective = goalArm.objectiveOverride?.trim() || resolveGoalObjective(content, goalDirectory)
        try {
          await setSessionGoal(goalSessionId, goalDirectory ?? undefined, { objective, tokenBudget }, null, capturedRuntimeKey)
        } catch (error) {
          if (queuedGoal === undefined) useSessionGoalArmStore.getState().setArmed(true, goalArm.objectiveOverride)
          throw error
        }
      }
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
      // ---- New session from draft ----
      if (!capturedTarget && !options?.sessionId && draft?.open) {
        // The draft's first Enter made it a session; a later send with the same
        // draft would make a second one.
        if (sentDraftIds.has(draft.draftId)) throw new Error("The session is still being created.")
        sentDraftIds.add(draft.draftId)
        const selection: DraftSessionSelection = { providerID, modelID, agent: trimmedAgent, variant }
        let directory: string | null = null
        let chatDirectoryCleanup: CapturedChatDirectoryCleanup | null = null
        try {
          chatDirectoryCleanup = await captureChatDirectoryCleanup(draft.target, capturedRuntimeKey)
          if (getRuntimeKey() !== capturedRuntimeKey) throw new Error("Message was not sent because the runtime changed.")
          // The waits that decide where the session shows, with the draft
          // still open: a worktree being made, a chat folder being prepared.
          directory = (await resolveDraftTargetDirectory(draft)) ?? opencodeClient.getDirectory() ?? null
          if (!directory) throw new Error("Failed to create session")
          if (getRuntimeKey() !== capturedRuntimeKey) {
            throw new Error("Message was not sent because the runtime changed.")
          }
        } catch (error) {
          if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
          sentDraftIds.delete(draft.draftId)
          throw error
        }
        const sessionDirectory = directory

        // The session's id is minted here and sent with the create request, so
        // the chat can switch to it and show the message at once; the server
        // creates the session under this id while the message is on screen.
        const sessionId = descendingId("ses")
        const draftAgent = saveDraftSessionSelection(sessionId, selection)
        openPendingSessionTranscript(sessionId, sessionDirectory)
        get().setCurrentSession(sessionId, sessionDirectory, { transition: "submitted-draft" })
        setPendingDraftSend(sessionId, { draftId: draft.draftId, sessionCreated: false })
        const releaseGate = () => setPendingDraftSend(sessionId, null)

        // Whether the server has the session: answered by the create response
        // alone, since the goal and knowledge writes after it can fail with
        // the session already there.
        let resolveSessionCreated!: (created: boolean) => void
        const sessionCreatedOutcome = new Promise<boolean>((resolve) => { resolveSessionCreated = resolve })
        const creation = (async () => {
          try {
            const createDirectory = await resolveDraftCreateDirectory(draft, sessionDirectory)
            const created = await createSessionAction(
              draft.title,
              createDirectory,
              draftSessionMetadata(draft),
              undefined,
              draftSessionCreateSelection(selection),
              "preserve",
              sessionId,
              capturedRuntimeKey,
            )
            if (!created?.id) throw new Error("Failed to create session")
            if (created.id !== sessionId) {
              // The prompt must never go to a session that does not exist, and
              // the one the server made under another id is not this one: it
              // is empty, so it goes, best effort, before the draft comes back.
              console.error("[session-ui-store] the server created the session under another id", { requested: sessionId, created: created.id })
              void deleteSessionAction(created.id).catch(() => undefined)
              throw new Error("Failed to create session")
            }
            resolveSessionCreated(true)
            setPendingDraftSend(sessionId, { draftId: draft.draftId, sessionCreated: true })
            // The draft is a session now: it leaves the drafts every client lists.
            if (draft.workDraftId) void useSessionDraftsStore.getState().discard(draft.workDraftId, { final: true }).catch(() => undefined)
            const createdDirectory = finishDraftSession(draft, created, createDirectory) ?? sessionDirectory
            if (createdDirectory !== normalizePath(sessionDirectory)) {
              // The session lives elsewhere than where its first message was
              // shown (a start folder inside the worktree, a deleted directory
              // left for the project, a path the server canonicalized): the
              // transcript follows the record there.
              adoptSessionMove(sessionId, sessionDirectory, createdDirectory)
              if (get().currentSessionId === sessionId) get().setCurrentSession(sessionId, createdDirectory, { transition: "submitted-draft" })
            }
            // The session exists: from here its turn is the agent's.
            markSessionStatus(sessionId, createdDirectory, "busy")
            await applyArmedGoal(sessionId, createdDirectory)
            // The server writes the project knowledge and the response style
            // into the new session while the message is already on screen:
            // only the prompt request waits.
            if (inputMode !== "shell") await syncSessionKnowledge(createdDirectory, sessionId, await responseStyleInstruction, capturedRuntimeKey)
          } finally {
            resolveSessionCreated(false)
          }
        })()
        // The send below observes the outcome; nothing else has to.
        creation.catch(() => undefined)

        const draftParts: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }> | undefined = draft.syntheticParts?.length
          ? [...(additionalParts || []), ...draft.syntheticParts]
          : additionalParts
        const historyIdentity = createInputHistoryIdentity(capturedRuntimeKey, sessionDirectory, sessionId)
        const historySubmissions = options?.historySubmissions
        const appendSubmissions = historyIdentity && historySubmissions?.length
          ? () => useInputHistoryStore.getState().appendSubmissions(historyIdentity, historySubmissions)
          : undefined

        notifyMessageSent(sessionId)
        // Sending a message means working in the session: its tab stays.
        useSessionTabsStore.getState().pinTab(sessionId)

        markPendingUserSendAnimation(sessionId)

        const files = attachments?.map((a) => ({
          type: "file" as const,
          mime: a.mimeType,
          url: a.dataUrl,
          filename: attachmentWireName(a),
        }))

        try {
          const draftRoute = await routeMessage({
            runtimeKey: capturedRuntimeKey,
            sessionId,
            directory: sessionDirectory,
            content,
            providerID,
            modelID,
            agent: draftAgent,
            agentMentionName,
            variant,
            inputMode,
            files,
            appendSubmissions,
            delivery: options?.delivery,
            skills: options?.skills,
            ready: creation,
            beforeSend: releaseGate,
            markBusy: false,
            additionalParts: draftParts?.map((p) => ({
              text: p.text,
              synthetic: p.synthetic,
              metadata: p.metadata,
              files: p.attachments?.map((a: AttachedFile) => ({
                type: "file" as const,
                mime: a.mimeType,
                url: a.dataUrl,
                filename: attachmentWireName(a),
              })),
            })),
=======
      if (!capturedTarget && !options?.sessionId && draft?.open) {
        if (sentDraftIds.has(draft.draftId)) throw new Error("The session is still being created.")
        sentDraftIds.add(draft.draftId)
        const selection: DraftSessionSelection = { providerID, modelID, agent: trimmedAgent, variant }
        let directory: string | null = null
        let chatDirectoryCleanup: CapturedChatDirectoryCleanup | null = null
        try {
          chatDirectoryCleanup = await captureChatDirectoryCleanup(draft.target, capturedRuntimeKey)
          if (getRuntimeKey() !== capturedRuntimeKey) throw new Error("Message was not sent because the runtime changed.")
          directory = (await resolveDraftTargetDirectory(draft)) ?? opencodeClient.getDirectory() ?? null
          if (!directory) throw new Error("Failed to create session")
          if (getRuntimeKey() !== capturedRuntimeKey) {
            throw new Error("Message was not sent because the runtime changed.")
          }
        } catch (error) {
          if (draft.target === "chat") await deletePreparedChatDirectory(directory, chatDirectoryCleanup)
          sentDraftIds.delete(draft.draftId)
          throw error
        }
        const sessionDirectory = directory

        const sessionId = descendingId("ses")
        options?.progress?.sessionMinted?.(sessionId, draft.target === "chat" ? sessionDirectory : null)
        const draftAgent = saveDraftSessionSelection(sessionId, selection)
        openPendingSessionTranscript(sessionId, sessionDirectory)
        get().setCurrentSession(sessionId, sessionDirectory, { transition: "submitted-draft" })
        setPendingDraftSend(sessionId, { draftId: draft.draftId, sessionCreated: false })
        const releaseGate = () => setPendingDraftSend(sessionId, null)

        let resolveSessionCreated!: (created: boolean) => void
        const sessionCreatedOutcome = new Promise<boolean>((resolve) => { resolveSessionCreated = resolve })
        const creation = (async () => {
          try {
            const createDirectory = await resolveDraftCreateDirectory(draft, sessionDirectory)
            const created = await createSessionAction(
              draft.title,
              createDirectory,
              draftSessionMetadata(draft),
              undefined,
              draftSessionCreateSelection(selection),
              "preserve",
              sessionId,
              capturedRuntimeKey,
            )
            if (!created?.id) throw new Error("Failed to create session")
            if (created.id !== sessionId) {
              console.error("[session-ui-store] the server created the session under another id", { requested: sessionId, created: created.id })
              void deleteSessionAction(created.id).catch(() => undefined)
              throw new Error("Failed to create session")
            }
            resolveSessionCreated(true)
            setPendingDraftSend(sessionId, { draftId: draft.draftId, sessionCreated: true })
            if (draft.workDraftId) void useSessionDraftsStore.getState().discard(draft.workDraftId, { final: true }).catch(() => undefined)
            const createdDirectory = finishDraftSession(draft, created, createDirectory) ?? sessionDirectory
            if (createdDirectory !== normalizePath(sessionDirectory)) {
              adoptSessionMove(sessionId, sessionDirectory, createdDirectory)
              if (get().currentSessionId === sessionId) get().setCurrentSession(sessionId, createdDirectory, { transition: "submitted-draft" })
            }
            markSessionStatus(sessionId, createdDirectory, "busy")
            await applyArmedGoal(sessionId, createdDirectory)
            if (inputMode !== "shell") await syncSessionKnowledge(createdDirectory, sessionId, await responseStyleInstruction, capturedRuntimeKey)
          } finally {
            resolveSessionCreated(false)
          }
        })()
        creation.catch(() => undefined)

        const draftParts: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }> | undefined = draft.syntheticParts?.length
          ? [...(additionalParts || []), ...draft.syntheticParts]
          : additionalParts
        const historyIdentity = createInputHistoryIdentity(capturedRuntimeKey, sessionDirectory, sessionId)
        const historySubmissions = options?.historySubmissions
        const appendSubmissions = historyIdentity && historySubmissions?.length
          ? () => useInputHistoryStore.getState().appendSubmissions(historyIdentity, historySubmissions)
          : undefined

        notifyMessageSent(sessionId)
        useSessionTabsStore.getState().pinTab(sessionId)

        markPendingUserSendAnimation(sessionId)

        const files = attachments?.map((a) => ({
          type: "file" as const,
          mime: a.mimeType,
          url: a.dataUrl,
          filename: attachmentWireName(a),
        }))

        try {
          const draftRoute = await routeMessage({
            runtimeKey: capturedRuntimeKey,
            sessionId,
            directory: sessionDirectory,
            content,
            providerID,
            modelID,
            agent: draftAgent,
            agentMentionName,
            variant,
            inputMode,
            files,
            appendSubmissions,
            delivery: options?.delivery,
            skills: options?.skills,
            ready: creation,
            beforeSend: () => { releaseGate(); options?.progress?.requestLeaving?.() },
            onMessageMinted: options?.progress?.messageMinted,
            markBusy: false,
            additionalParts: draftParts?.map((p) => ({
              text: p.text,
              synthetic: p.synthetic,
              metadata: p.metadata,
              files: p.attachments?.map((a: AttachedFile) => ({
                type: "file" as const,
                mime: a.mimeType,
                url: a.dataUrl,
                filename: attachmentWireName(a),
              })),
            })),
>>>>>>> upstream/main
          })
<<<<<<< HEAD
||||||| bc50ba56aa
          if (draftRoute !== "shell" && options?.recordEffort && isCurrentRuntimeInstance()) {
            rememberEffort(providerID, modelID, variant ?? null, effortRevision)
          }
        } catch (error) {
          // The send can fail before the create response (a lost connection,
          // a command lookup): the creation still settles, and what the
          // server answered decides whether the draft comes back or the
          // session stays with the text in its composer.
          const sessionCreated = await sessionCreatedOutcome
          releaseGate()
          const liveDirectory = getSyncSessionDirectory(sessionId) ?? sessionDirectory
          if (sessionCreated) {
            // Nothing reached the agent: a session marked busy on creation
            // for a send that failed before its request is idle.
            markSessionStatus(sessionId, liveDirectory, "idle")
          } else {
            await deletePreparedChatDirectory(sessionDirectory, chatDirectoryCleanup)
            reopenDraftAfterFailedCreation(draft, sessionId, sessionDirectory, capturedRuntimeKey)
          }
          throw new DraftSendError(sessionId, liveDirectory, sessionCreated, error)
=======
          if (draftRoute !== "shell" && options?.recordEffort && isCurrentRuntimeInstance()) {
            rememberEffort(providerID, modelID, variant ?? null, effortRevision)
          }
        } catch (error) {
          const sessionCreated = await sessionCreatedOutcome
          releaseGate()
          const liveDirectory = getSyncSessionDirectory(sessionId) ?? sessionDirectory
          if (sessionCreated) {
            markSessionStatus(sessionId, liveDirectory, "idle")
          } else {
            await deletePreparedChatDirectory(sessionDirectory, chatDirectoryCleanup)
            reopenDraftAfterFailedCreation(draft, sessionId, sessionDirectory, capturedRuntimeKey)
          }
          throw new DraftSendError(sessionId, liveDirectory, sessionCreated, error)
>>>>>>> upstream/main
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
<<<<<<< HEAD
      if (goalArm.armed) {
        if (!goalArm.objectiveOverride?.trim() && !options?.fileResourcesExpanded && inputMode !== 'shell') {
          fileResourceExpansion = await expandNativeFileResource(content, directory)
        }
        const objective = goalArm.objectiveOverride?.trim() || fileResourceExpansion?.content || content
        assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
        await canonicalClient.goal(sessionId, { op: 'create', objective, tokenBudget })
        assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
        goalApplied = true
||||||| bc50ba56aa

      // ---- Existing session ----
      const targetSessionId = capturedTarget?.sessionId ?? options?.sessionId ?? get().currentSessionId
      const settleModelPick = targetSessionId
        ? useSelectionStore.getState().captureSessionModelPickSettlement(targetSessionId, providerID, modelID, capturedRuntimeKey)
        : undefined
      const resumeAfterSend = options?.userInitiated && inputMode !== 'shell' && targetSessionId
        ? prepareUserMessageResume(targetSessionId, capturedRuntimeKey)
        : undefined
      const sessionAgentSelection = targetSessionId
        ? useSelectionStore.getState().getSessionAgentSelection(targetSessionId)
        : null
      const configAgentName = useConfigStore.getState().currentAgentName
      const effectiveAgent = trimmedAgent || sessionAgentSelection || configAgentName || undefined

      if (targetSessionId) {
        useSelectionStore.getState().saveSessionModelSelection(targetSessionId, providerID, modelID)
=======

      const targetSessionId = capturedTarget?.sessionId ?? options?.sessionId ?? get().currentSessionId
      const settleModelPick = targetSessionId
        ? useSelectionStore.getState().captureSessionModelPickSettlement(targetSessionId, providerID, modelID, capturedRuntimeKey)
        : undefined
      const resumeAfterSend = options?.userInitiated && inputMode !== 'shell' && targetSessionId
        ? prepareUserMessageResume(targetSessionId, capturedRuntimeKey)
        : undefined
      const sessionAgentSelection = targetSessionId
        ? useSelectionStore.getState().getSessionAgentSelection(targetSessionId)
        : null
      const configAgentName = useConfigStore.getState().currentAgentName
      const effectiveAgent = trimmedAgent || sessionAgentSelection || configAgentName || undefined

      if (targetSessionId) {
        useSelectionStore.getState().saveSessionModelSelection(targetSessionId, providerID, modelID)
>>>>>>> upstream/main
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

<<<<<<< HEAD
      const historyIdentity = createInputHistoryIdentity(capturedRuntimeKey, directory ?? '', sessionId)
||||||| bc50ba56aa
      const currentSessionDirectory = targetSessionId
        ? normalizePath(capturedTarget?.directory ?? options?.directory ?? get().getDirectoryForSession(targetSessionId))
        : null
      if (targetSessionId) {
        notifyMessageSent(targetSessionId)
        useSessionTabsStore.getState().pinTab(targetSessionId)
      }

      if (targetSessionId) {
        markPendingUserSendAnimation(targetSessionId)
      }

      const files = attachments?.map((a) => ({
        type: "file" as const,
        mime: a.mimeType,
        url: a.dataUrl,
        filename: attachmentWireName(a),
      }))

      // Standing project context (pinned notes and plans, the memory index) and
      // the response style, written into the session alongside the goal write
      // and while the optimistic message is already on screen: only the prompt
      // request waits for it.
      const knowledgeSync = responseStyleInstruction
        ? responseStyleInstruction.then((style) => syncSessionKnowledge(currentSessionDirectory, targetSessionId, style, capturedRuntimeKey))
        : undefined

      if (targetSessionId) {
        await applyArmedGoal(targetSessionId, currentSessionDirectory)
      }
      const historyIdentity = createInputHistoryIdentity(
        capturedRuntimeKey,
        currentSessionDirectory ?? '',
        targetSessionId || '',
      )
      const historySubmissions = options?.historySubmissions
=======
      const currentSessionDirectory = targetSessionId
        ? normalizePath(capturedTarget?.directory ?? options?.directory ?? get().getDirectoryForSession(targetSessionId))
        : null
      if (targetSessionId) {
        notifyMessageSent(targetSessionId)
        useSessionTabsStore.getState().pinTab(targetSessionId)
      }

      if (targetSessionId) {
        markPendingUserSendAnimation(targetSessionId)
      }

      const files = attachments?.map((a) => ({
        type: "file" as const,
        mime: a.mimeType,
        url: a.dataUrl,
        filename: attachmentWireName(a),
      }))

      const knowledgeSync = responseStyleInstruction
        ? responseStyleInstruction.then((style) => syncSessionKnowledge(currentSessionDirectory, targetSessionId, style, capturedRuntimeKey))
        : undefined

      if (targetSessionId) {
        await applyArmedGoal(targetSessionId, currentSessionDirectory)
      }
      const historyIdentity = createInputHistoryIdentity(
        capturedRuntimeKey,
        currentSessionDirectory ?? '',
        targetSessionId || '',
      )
      const historySubmissions = options?.historySubmissions
>>>>>>> upstream/main
      const appendSubmissions = historyIdentity && historySubmissions?.length
        ? () => {
          assertSendRuntime(capturedRuntimeKey, capturedRuntimeRevision)
          useInputHistoryStore.getState().appendSubmissions(historyIdentity, historySubmissions)
        }
        : undefined
<<<<<<< HEAD
      await routeMessage({
||||||| bc50ba56aa

      // This send switches the session to its agent, so a pick of that agent
      // is no longer unsent and the composer follows the record again; a
      // failed send gives the pick back while the composer still shows it.
      // A shell command carries no agent.
      const carriedPick = inputMode !== "shell" && targetSessionId && effectiveAgent
        && useSelectionStore.getState().getSessionAgentPick(targetSessionId) === effectiveAgent
        ? { sessionId: targetSessionId, agent: effectiveAgent }
        : null
      if (carriedPick) useSelectionStore.getState().settleSessionAgentPick(carriedPick.sessionId, carriedPick.agent)
      const settleSentSelection = targetSessionId
        ? useSelectionStore.getState().captureSessionSelectionSentSettlement(targetSessionId, providerID, modelID, effectiveAgent, variant)
        : undefined
      const routed = await routeMessage({
=======

      const carriedPick = inputMode !== "shell" && targetSessionId && effectiveAgent
        && useSelectionStore.getState().getSessionAgentPick(targetSessionId) === effectiveAgent
        ? { sessionId: targetSessionId, agent: effectiveAgent }
        : null
      if (carriedPick) useSelectionStore.getState().settleSessionAgentPick(carriedPick.sessionId, carriedPick.agent)
      const settleSentSelection = targetSessionId
        ? useSelectionStore.getState().captureSessionSelectionSentSettlement(targetSessionId, providerID, modelID, effectiveAgent, variant)
        : undefined
      const routed = await routeMessage({
>>>>>>> upstream/main
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
<<<<<<< HEAD
        delivery,
        commandId,
        skills,
        fileResourcesExpanded: options?.fileResourcesExpanded,
        fileResourceExpansion,
        additionalParts: additionalContext,
||||||| bc50ba56aa
        delivery: options?.delivery,
        skills: options?.skills,
        ready: knowledgeSync,
        additionalParts: additionalParts?.map((p) => ({
          text: p.text,
          synthetic: p.synthetic,
          metadata: p.metadata,
          files: p.attachments?.map((a) => ({
            type: "file" as const,
            mime: a.mimeType,
            url: a.dataUrl,
            filename: attachmentWireName(a),
          })),
        })),
      }).catch((error) => {
        const selection = useSelectionStore.getState()
        if (carriedPick && selection.getSessionAgentPick(carriedPick.sessionId) === null
          && selection.getSessionAgentSelection(carriedPick.sessionId) === carriedPick.agent) {
          selection.pickSessionAgent(carriedPick.sessionId, carriedPick.agent)
        }
        throw error
=======
        delivery: options?.delivery,
        skills: options?.skills,
        metadata: options?.metadata,
        ready: knowledgeSync,
        beforeSend: options?.progress?.requestLeaving,
        onMessageMinted: options?.progress?.messageMinted,
        additionalParts: additionalParts?.map((p) => ({
          text: p.text,
          synthetic: p.synthetic,
          metadata: p.metadata,
          files: p.attachments?.map((a) => ({
            type: "file" as const,
            mime: a.mimeType,
            url: a.dataUrl,
            filename: attachmentWireName(a),
          })),
        })),
      }).catch((error) => {
        const selection = useSelectionStore.getState()
        if (carriedPick && selection.getSessionAgentPick(carriedPick.sessionId) === null
          && selection.getSessionAgentSelection(carriedPick.sessionId) === carriedPick.agent) {
          selection.pickSessionAgent(carriedPick.sessionId, carriedPick.agent)
        }
        throw error
>>>>>>> upstream/main
      })
<<<<<<< HEAD
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
||||||| bc50ba56aa
      if (routed !== "shell" && options?.recordEffort && isCurrentRuntimeInstance()) {
        rememberEffort(providerID, modelID, variant ?? null, effortRevision)
=======
      if (targetSessionId) options?.onSent?.({ route: routed, sessionId: targetSessionId })
      if (routed !== "shell" && options?.recordEffort && isCurrentRuntimeInstance()) {
        rememberEffort(providerID, modelID, variant ?? null, effortRevision)
>>>>>>> upstream/main
      }
      if (goalArm.armed && !goalApplied && getRuntimeKey() === capturedRuntimeKey && getRuntimeSwitchRevision() === capturedRuntimeRevision) {
        useSessionGoalArmStore.getState().setArmed(true, goalArm.objectiveOverride, goalArm.composerGoal)
      }
<<<<<<< HEAD
      throw error
||||||| bc50ba56aa
      // Keep restore failures outside the send promise and its retry path.
      void resumeAfterSend?.().catch(console.warn)
=======
      void resumeAfterSend?.().catch(console.warn)
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa

  // ---------------------------------------------------------------------------
  // revertToMessage — delegates to session-actions (single implementation)
  // ---------------------------------------------------------------------------
=======

>>>>>>> upstream/main
  revertToMessage: async (sessionId, messageId) => {
<<<<<<< HEAD
    const runtimeKey = getRuntimeKey()
    await refetchSessionMessages(sessionId)
    assertSendRuntime(runtimeKey)
    await revertToMessageAction(sessionId, messageId)
    assertSendRuntime(runtimeKey)
||||||| bc50ba56aa
    // Ensure the complete message range is present before applying the revert
    // marker. Reverted UI is derived from session.revert + stored messages.
    await refetchSessionMessages(sessionId)
    await revertToMessageAction(sessionId, messageId)
=======
    await revertToMessageAction(sessionId, messageId, { refresh: true })
>>>>>>> upstream/main
  },

  handleSlashUndo: async (sessionId) => {
    const runtimeKey = getRuntimeKey()
    const messages = getSyncMessages(sessionId)
    const userMessages = messages.filter((message) => message.role === "user")
    if (userMessages.length === 0) return
    const targetMessage = userMessages.at(-1)
    if (!targetMessage) return
<<<<<<< HEAD
    const textPart = targetMessage.parts.find((part) => part.type === "text")
    const preview = textPart?.type === "text"
      ? textPart.content.slice(0, 50) + (textPart.content.length > 50 ? "..." : "")
||||||| bc50ba56aa

    // Read target message parts BEFORE calling revertToMessage.
    // revertToMessage optimistically deletes messages from the sync store
    // before the API call, so getSyncParts must run first.
    const targetParts = getSyncParts(targetMessage.id)
    const textPart = targetParts.find((p: Part) => p.type === "text") as TextPart | undefined
    const preview = textPart?.text
      ? String(textPart.text).slice(0, 50) + (textPart.text.length > 50 ? "..." : "")
=======

    const targetParts = getSyncParts(targetMessage.id)
    const textPart = targetParts.find((p: Part) => p.type === "text") as TextPart | undefined
    const preview = textPart?.text
      ? String(textPart.text).slice(0, 50) + (textPart.text.length > 50 ? "..." : "")
>>>>>>> upstream/main
      : "[No text]"
<<<<<<< HEAD
    await get().revertToMessage(sessionId, targetMessage.messageId)
    assertSendRuntime(runtimeKey)
||||||| bc50ba56aa

    // revertToMessage handles the redo stack push internally
    await get().revertToMessage(sessionId, targetMessage.id)

=======

    await get().revertToMessage(sessionId, targetMessage.id)

>>>>>>> upstream/main
    const { toast } = await import("sonner")
    assertSendRuntime(runtimeKey)
    const { useI18nStore, formatMessage } = await import("@/lib/i18n/store")
    assertSendRuntime(runtimeKey)
    const { dictionary } = useI18nStore.getState()
    toast.success(formatMessage(dictionary, "chat.revert.toast.undo", { preview }))
  },

  handleSlashRedo: async (sessionId) => {
<<<<<<< HEAD
    const runtimeKey = getRuntimeKey()
    await clearStagedRevert(sessionId)
    assertSendRuntime(runtimeKey)
    const { toast } = await import("sonner")
    assertSendRuntime(runtimeKey)
    const { useI18nStore, formatMessage } = await import("@/lib/i18n/store")
    assertSendRuntime(runtimeKey)
    const { dictionary } = useI18nStore.getState()
    toast.success(formatMessage(dictionary, "chat.revert.toast.redo"))
||||||| bc50ba56aa
    const sessions = getSyncSessions()
    const currentSession = sessions.find((s) => s.id === sessionId)
    const revertToId = currentSession?.revert?.messageID
    if (!revertToId) return

    await refetchSessionMessages(sessionId)
    const messages = getSyncMessages(sessionId)
    const userMessages = messages.filter((m) => m.role === "user")
    const revertIndex = revertedUserMessageIndex(messages, userMessages, revertToId)
    const targetMessage = revertIndex >= 0 ? userMessages[revertIndex + 1] : undefined

    if (targetMessage) {
      await get().revertToMessage(sessionId, targetMessage.id, { skipRedoPush: true })
      const { toast } = await import("sonner")
      const { useI18nStore, formatMessage } = await import("@/lib/i18n/store")
      const { dictionary } = useI18nStore.getState()
      toast.success(formatMessage(dictionary, "chat.revert.toast.redo"))
    }
    // A committed revert has no server-side undo in OpenCode 2.x: once the
    // marker is at the newest user message there is nothing further to redo.
=======
    const sessions = getSyncSessions()
    const currentSession = sessions.find((s) => s.id === sessionId)
    const revertToId = currentSession?.revert?.messageID
    if (!revertToId) return

    await refetchSessionMessages(sessionId)
    const messages = getSyncMessages(sessionId)
    const userMessages = messages.filter((m) => m.role === "user")
    const revertIndex = revertedUserMessageIndex(messages, userMessages, revertToId)
    const targetMessage = revertIndex >= 0 ? userMessages[revertIndex + 1] : undefined

    if (targetMessage) {
      await get().revertToMessage(sessionId, targetMessage.id, { skipRedoPush: true })
      const { toast } = await import("sonner")
      const { useI18nStore, formatMessage } = await import("@/lib/i18n/store")
      const { dictionary } = useI18nStore.getState()
      toast.success(formatMessage(dictionary, "chat.revert.toast.redo"))
    }
>>>>>>> upstream/main
  },

<<<<<<< HEAD

  // ---------------------------------------------------------------------------
  // forkFromMessage — delegates to session-actions (handles text + sidebar)
  // ---------------------------------------------------------------------------
||||||| bc50ba56aa
  // ---------------------------------------------------------------------------
  // forkFromMessage — delegates to session-actions (handles text + sidebar)
  // ---------------------------------------------------------------------------
=======
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
      // A worktree of the host project would hold none of the space's changes.
      if (isSpaceDirectory(sourceDirectory)) {
        throw new Error("A fork of a session in an isolated space stays in the space")
      }
=======
      if (isSpaceDirectory(sourceDirectory)) {
        throw new Error("A fork of a session in an isolated space stays in the space")
      }
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Goal control starts the first OMP turn with this composed assignment.
    // Do not send it again as a Host prompt.
    useSessionGoalArmStore.getState().setArmed(execution.runAsGoal === true, null, true)
||||||| bc50ba56aa
    // "Run as goal" rides the same arm mechanism as the composer target
    // button: sendMessage consumes the flag, stamps the goal (objective =
    // the composed fork message) and attaches the goal-mode intro part.
    // Set explicitly either way so a stray armed flag cannot leak into a
    // non-goal fork.
    useSessionGoalArmStore.getState().setArmed(execution.runAsGoal === true)
=======
    useSessionGoalArmStore.getState().setArmed(execution.runAsGoal === true)
>>>>>>> upstream/main

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
<<<<<<< HEAD
||||||| bc50ba56aa
      // A session opened in a folder that was gone never loaded the model list,
      // so the composer stays on Loading until the directory follows it. A list
      // that did load stays, and with it the session's model.
      if (moved && normalized && !useConfigStore.getState().providersLoaded) {
        useDirectoryStore.getState().setDirectory(normalized, { showOverlay: false })
        opencodeClient.setDirectory(normalized)
      }
=======
      if (moved && normalized && !useConfigStore.getState().providersLoaded) {
        useDirectoryStore.getState().setDirectory(normalized, { showOverlay: false })
        opencodeClient.setDirectory(normalized)
      }
>>>>>>> upstream/main
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
