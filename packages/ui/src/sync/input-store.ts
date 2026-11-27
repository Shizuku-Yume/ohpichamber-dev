
import { create } from "zustand"
import type { AttachIssueRequest } from 'ohpichamber-sdk'
import type { ContextPartMetadata } from '@/lib/messages/contextParts'
import type { AttachedFile } from "@/stores/types/sessionTypes"
import type { InlineCommentDraftTarget } from "@/stores/useInlineCommentDraftStore"
import { HeicConversionError, PATH_NOTE_MEDIA_TYPE, fileReferenceNoteText, prepareAttachmentFiles } from "./attachment-files";
import { getChatDraftIdentityKey, subscribeChatDraftDeletion, type ChatDraftIdentity } from "@/lib/chatDraftPersistence"
import { pathForDroppedFile } from "@/lib/desktop"
import { attachmentBasename } from "@/lib/attachmentIdentity";
import { formatFileSize } from "@/lib/fileSize"
import { formatMessage, useI18nStore } from "@/lib/i18n/store"
import { captureRuntimeInstance, getRuntimeKey, getRuntimeSwitchRevision } from "@/lib/runtime-switch"
import { prepareAttachmentsHeldForSend } from "./held-attachments"
import type { RejectedSharedFile } from '@/lib/nativeSharedFiles'

type PendingDraftContent = {
 draftId: number
 files: File[]
 text: string | null
 rejected: RejectedSharedFile[]
 accept?: () => void
}

export const MAX_INLINE_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const INTAKE_REDACTED_FILENAME = /\.(har|ipynb)$/i

const prepareFileReference = async (file: File, path: string): Promise<AttachedFile> => {
 const note = new File(
  [fileReferenceNoteText(path, formatFileSize(file.size))],
  file.name,
  { type: "text/plain" },
 )
 return {
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  file: note,
  dataUrl: await readFileAsDataUrl(note, PATH_NOTE_MEDIA_TYPE),
  mimeType: "text/plain",
  filename: file.name,
  size: file.size,
  source: "local",
  agentPath: path,
  serverPath: path,
 }
}

const MAX_ATTACHMENT_PREPARATION_ATTEMPTS = 3
let attachmentReadGeneration = 0
const heldSavesInFlight = new Map<string, Promise<string[]>>()

const hasGeneratedFilenameCollision = (filenames: string[], attachedFiles: AttachedFile[]): boolean => {
 if (filenames.length === 0) return false
 const attachedFilenames = new Set(attachedFiles.map((attachment) => attachment.filename.toLowerCase()))
 return filenames.some((filename) => attachedFilenames.has(filename.toLowerCase()))
}

const readFileAsDataUrl = (file: File, mime: string): Promise<string> => new Promise((resolve, reject) => {
 const reader = new FileReader()
 reader.onload = () => {
  const value = typeof reader.result === "string" ? reader.result : ""
  const commaIndex = value.indexOf(",")
  resolve(commaIndex === -1 ? value : `data:${mime};base64,${value.slice(commaIndex + 1)}`)
 }
 reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
 reader.onabort = () => reject(new Error("File read aborted"))
 reader.readAsDataURL(file)
})

export const prepareLocalAttachments = async (
 file: File,
 reservedFilenames: Iterable<string> = [],
): Promise<AttachedFile[] | undefined> => {
 const preparedOrPending = prepareAttachmentFiles(file, reservedFilenames)
 const preparedFiles = preparedOrPending instanceof Promise ? await preparedOrPending : preparedOrPending
 if (!preparedFiles || preparedFiles.length === 0) return

 const sourceDocumentId = preparedFiles.length > 1
  ? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  : undefined
 const attachedFiles: AttachedFile[] = []
 const agentPath = pathForDroppedFile(file) ?? undefined
 for (const prepared of preparedFiles) {
  const dataUrl = await readFileAsDataUrl(prepared.file, prepared.mimeType)
  if (!dataUrl) return
  const attached: AttachedFile = {
   id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
   file: prepared.file,
   dataUrl,
   mimeType: prepared.mimeType,
   filename: prepared.file.name,
   size: prepared.file.size,
   source: "local",
   sourceDocumentId,
  }
  if (agentPath && attachedFiles.length === 0 && !INTAKE_REDACTED_FILENAME.test(file.name)) {
   attached.agentPath = agentPath
   attached.filename = file.name
  }
  attachedFiles.push(attached)
 }
 return attachedFiles
}

type RestoredAttachment = {
 url: string
 mimeType: string
 filename: string
 size?: number
}

const restoredAttachmentFile = ({ url, mimeType, filename }: RestoredAttachment): File => {
 const basename = attachmentBasename(filename)
 if (!url.startsWith('data:')) return new File([], basename, { type: mimeType })
 const commaIndex = url.indexOf(',')
 if (commaIndex < 0) throw new Error("Invalid restored attachment data URL")
 const metadata = url.slice(0, commaIndex).toLowerCase()
 const payload = url.slice(commaIndex + 1)
 if (!metadata.endsWith(';base64')) {
  return new File([decodeURIComponent(payload)], basename, { type: mimeType })
 }
 const binary = atob(payload)
 const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
 return new File([bytes], basename, { type: mimeType })
}

export type AddAttachedFileOptions = { shared?: boolean; saveOnSend?: "reference" | "copy" }

const saveHeldFiles = async (
 get: () => InputState,
 target: ChatDraftIdentity | null,
 directory: string | undefined,
 sentIds: ReadonlySet<string>,
): Promise<string[]> => {
 const isCurrent = captureRuntimeInstance()
 const activeDraftKey = get().attachmentDraftKey
 const held = attachedFilesFor(get(), target).filter((file) => sentIds.has(file.id) && (file.saveOnSend || file.saveCopyOnSend))
 if (target && target.runtimeKey !== getRuntimeKey()) return held.map((entry) => entry.filename)
 const failed: string[] = []
 for (const file of held) {
  try {
   const replacement = await prepareAttachmentsHeldForSend([file], directory, isCurrent)
   if (!isCurrent()) return held.map((entry) => entry.filename)
   if (target === null && get().attachmentDraftKey !== activeDraftKey) continue
   const current = attachedFilesFor(get(), target)
   if (!current.includes(file)) continue
   get().setAttachedFiles(current.flatMap((entry) => entry === file ? replacement : [entry]), target ?? undefined)
  } catch {
   failed.push(file.filename)
  }
 }
 return failed
}

export type SyntheticContextPart = {
 text: string
 attachments?: AttachedFile[]
 synthetic?: boolean
 metadata?: ContextPartMetadata
}

type PendingBtwComposerRequest = {
 parentSessionId: string
 text: string
}

export type ComposerAddress = {
 inline: InlineCommentDraftTarget | null
 attachments: ChatDraftIdentity | null
}

type InputState = {
 pendingComposerRestore: {
  target: ChatDraftIdentity
  text: string
  files: RestoredAttachment[]
 } | null
 consumePendingComposerRestore: (target: ChatDraftIdentity | null) => InputState["pendingComposerRestore"]
 pendingInputText: string | null
 pendingInputMode: "replace" | "append" | "append-inline"
 /**
  * Who the pending text is for. Null is the main chat's composer, which
  * app-wide sources (plugins, git dialogs, file selections) write to; a
  * session id is the composer of a chat pinned in the side panel on that
  * session, which text quoted inside that chat is written to.
  */
 pendingInputTarget: string | null
 /** Restores wait for their session independently of column insertions. */
 pendingSessionRestores: Map<string, string>
 setPendingSessionRestore: (sessionId: string, text: string | null) => void
 consumePendingSessionRestore: (sessionId: string) => string | null
 /** Pending context for the main chat's composer. */
 pendingSyntheticParts: SyntheticContextPart[] | null
 /** Pending context for pinned composers, by their session id. */
 pinnedSyntheticParts: Map<string, SyntheticContextPart[]>
 /**
  * Text a draft preset chip asked to submit immediately. Set by surfaces that
  * render the chips outside ChatInput (e.g. under the welcome message on
  * narrow layouts); consumed by ChatInput, which owns the command-aware submit.
  */
 pendingPresetSubmit: { text: string; type: "command" | "skill" } | null
 pendingDraftSubmit: { draftId: number; text: string } | null
 /** Guest rail/dialog attach. ChatInput consumes this into the composer chip. */
 pendingGuestIssue: AttachIssueRequest | null
 pendingDraftContents: Map<number, { content: PendingDraftContent; isCurrent: () => boolean }>
 requestDraftContent: (draftId: number, content: Omit<PendingDraftContent, 'draftId'>) => void
 consumePendingDraftContent: (draftId: number) => PendingDraftContent | null
 pendingBtwComposerRequest: PendingBtwComposerRequest | null
 attachedFiles: AttachedFile[]
 attachmentDraftKey: string | null
 attachmentDrafts: Map<string, AttachedFile[]>
 selectAttachmentDraft: (target: ChatDraftIdentity | null) => void
 restoreAttachedFiles: (files: AttachedFile[], target: ChatDraftIdentity | null) => void
 moveAttachedFiles: (from: ChatDraftIdentity, to: ChatDraftIdentity) => void
 composerAddress: ComposerAddress | null
 setComposerAddress: (address: ComposerAddress | null) => void

 setPendingInputText: (text: string | null, mode?: "replace" | "append" | "append-inline", target?: string | null) => void
 consumePendingInputText: (target?: string | null) => { text: string; mode: "replace" | "append" | "append-inline" } | null
 requestPresetSubmit: (text: string, type: "command" | "skill") => void
 consumePendingPresetSubmit: () => { text: string; type: "command" | "skill" } | null
 requestDraftSubmit: (draftId: number, text: string) => void
 consumePendingDraftSubmit: (draftId: number | null) => string | null
 setPendingGuestIssue: (issue: AttachIssueRequest | null) => void
 consumePendingGuestIssue: () => AttachIssueRequest | null
 requestBtwComposer: (request: PendingBtwComposerRequest) => void
 consumePendingBtwComposerRequest: (parentSessionId: string | null) => PendingBtwComposerRequest | null
 setPendingSyntheticParts: (parts: SyntheticContextPart[] | null, target?: string | null) => void
 consumePendingSyntheticParts: (target?: string | null) => SyntheticContextPart[] | null
 getPendingSyntheticParts: (target?: string | null) => SyntheticContextPart[] | null
 addAttachedFile: (file: File, target?: ChatDraftIdentity | null, onPrepared?: (files: readonly AttachedFile[]) => void, options?: AddAttachedFileOptions) => Promise<boolean>
 saveAttachmentsHeldForSend: (target: ChatDraftIdentity | null, directory: string | undefined, sentIds: ReadonlySet<string>) => Promise<string[]>
 removeAttachedFile: (id: string) => void
 setAttachedFiles: (files: AttachedFile[], target?: ChatDraftIdentity | null) => void
 clearAttachedFiles: (target?: ChatDraftIdentity | null) => void
 /** Add attachments restored from a reverted message (file already on server) */
 addRestoredAttachment: (file: RestoredAttachment, target?: ChatDraftIdentity | null) => void
 getAttachedFiles: (target?: ChatDraftIdentity | null) => AttachedFile[]
}

/** Attachments filed under `target`, or the current slot when none is named. */
const attachedFilesFor = (state: InputState, target?: ChatDraftIdentity | null): AttachedFile[] => {
 if (!target) return state.attachedFiles
 const key = getChatDraftIdentityKey(target)
 return key === state.attachmentDraftKey ? state.attachedFiles : state.attachmentDrafts.get(key) ?? []
}

/** Writes `files` into the slot `target` names, or the current one when none is named. */
const appendAttachedFiles = (state: InputState, files: AttachedFile[], target?: ChatDraftIdentity | null): Partial<InputState> => {
 const appended = [...attachedFilesFor(state, target), ...files]
 if (!target) return { attachedFiles: appended }
 const key = getChatDraftIdentityKey(target)
 if (key === state.attachmentDraftKey) return { attachedFiles: appended }
 const drafts = new Map(state.attachmentDrafts)
 drafts.set(key, appended)
 return { attachmentDrafts: drafts }
}

export const useInputStore = create<InputState>()((set, get) => ({
 pendingComposerRestore: null,
 consumePendingComposerRestore: (target) => {
  const pending = get().pendingComposerRestore
  if (!pending || !target || getChatDraftIdentityKey(pending.target) !== getChatDraftIdentityKey(target)) return null
  set({ pendingComposerRestore: null })
  return pending
 },
 pendingInputText: null,
 pendingInputMode: "replace",
 pendingInputTarget: null,
 pendingSessionRestores: new Map(),
 setPendingSessionRestore: (sessionId, text) => {
  const restores = new Map(get().pendingSessionRestores)
  if (text === null) restores.delete(sessionId)
  else restores.set(sessionId, text)
  set({ pendingSessionRestores: restores })
 },
 consumePendingSessionRestore: (sessionId) => {
  const text = get().pendingSessionRestores.get(sessionId) ?? null
  if (text !== null) get().setPendingSessionRestore(sessionId, null)
  return text
 },
 pendingSyntheticParts: null,
 pinnedSyntheticParts: new Map(),
 pendingPresetSubmit: null,
 pendingDraftSubmit: null,
 pendingGuestIssue: null,
 pendingDraftContents: new Map(),
 requestDraftContent: (draftId, content) => {
  const pending = new Map([...get().pendingDraftContents].filter(([, entry]) => entry.isCurrent()))
  const { files, text, rejected, accept } = content
  pending.set(draftId, { content: { draftId, files: [...files], text, rejected: [...rejected], ...(accept ? { accept } : {}) }, isCurrent: captureRuntimeInstance() })
  set({ pendingDraftContents: pending })
 },
 consumePendingDraftContent: (draftId) => {
  const pending = new Map(get().pendingDraftContents)
  const entry = pending.get(draftId)
  if (!entry) return null
  pending.delete(draftId)
  set({ pendingDraftContents: pending })
  return entry.isCurrent() ? entry.content : null
 },
 pendingBtwComposerRequest: null,
 attachedFiles: [],
 attachmentDraftKey: null,
 attachmentDrafts: new Map(),
 composerAddress: null,
 setComposerAddress: (address) => {
  const current = get().composerAddress
  if (current === address) return
  if (current && address && current.inline === address.inline && current.attachments === address.attachments) return
  set({ composerAddress: address })
 },
 selectAttachmentDraft: (target) => {
  const key = target ? getChatDraftIdentityKey(target) : null
  const state = get()
  if (key === state.attachmentDraftKey) return
  const drafts = new Map(state.attachmentDrafts)
  if (state.attachmentDraftKey) {
   if (state.attachedFiles.length) drafts.set(state.attachmentDraftKey, state.attachedFiles)
   else drafts.delete(state.attachmentDraftKey)
  }
  // Unowned files may arrive from a native picker before the first mount.
  const files = key ? (drafts.get(key) ?? (state.attachmentDraftKey === null ? state.attachedFiles : [])) : []
  if (key) drafts.delete(key)
  attachmentReadGeneration += 1
  set({ attachmentDraftKey: key, attachmentDrafts: drafts, attachedFiles: files })
 },
 restoreAttachedFiles: (files, target) => {
  const state = get()
  const key = target ? getChatDraftIdentityKey(target) : null
  const existing = key === state.attachmentDraftKey ? state.attachedFiles : (key && state.attachmentDrafts.get(key)) || []
  const present = new Set(existing.map((file) => file.id))
  const missing = files.filter((file) => !present.has(file.id))
  if (missing.length) state.setAttachedFiles([...existing, ...missing], target)
 },
 moveAttachedFiles: (from, to) => {
  if (from.runtimeKey !== to.runtimeKey) throw new Error("Cannot move attachments between runtimes")
  const fromKey = getChatDraftIdentityKey(from)
  const toKey = getChatDraftIdentityKey(to)
  if (fromKey === toKey) return
  set((state) => {
   const files = attachedFilesFor(state, from)
   if (!files.length) return state
   const existing = attachedFilesFor(state, to)
   const ids = new Set(existing.map((file) => file.id))
   const moved = [...existing, ...files.filter((file) => !ids.has(file.id))]
   const drafts = new Map(state.attachmentDrafts)
   drafts.delete(fromKey)
   if (toKey !== state.attachmentDraftKey) drafts.set(toKey, moved)
   return { attachmentDrafts: drafts, attachedFiles: state.attachmentDraftKey === toKey ? moved : state.attachmentDraftKey === fromKey ? [] : state.attachedFiles }
  })
 },

 setPendingInputText: (text, mode = "replace", target = null) =>
  set({ pendingInputText: text, pendingInputMode: mode, pendingInputTarget: text === null ? null : target }),

 consumePendingInputText: (target = null) => {
  const { pendingInputText, pendingInputMode, pendingInputTarget } = get()
  if (pendingInputText === null || pendingInputTarget !== target) return null
  set({ pendingInputText: null, pendingInputMode: "replace", pendingInputTarget: null })
  return { text: pendingInputText, mode: pendingInputMode }
 },

 requestPresetSubmit: (text, type) => set({ pendingPresetSubmit: { text, type } }),

 consumePendingPresetSubmit: () => {
  const { pendingPresetSubmit } = get()
  if (pendingPresetSubmit === null) return null
  set({ pendingPresetSubmit: null })
  return pendingPresetSubmit
 },

 requestDraftSubmit: (draftId, text) => set({ pendingDraftSubmit: { draftId, text } }),

 consumePendingDraftSubmit: (draftId) => {
  const { pendingDraftSubmit } = get()
  if (pendingDraftSubmit === null) return null
  set({ pendingDraftSubmit: null })
  return pendingDraftSubmit.draftId === draftId ? pendingDraftSubmit.text : null
 },

 setPendingGuestIssue: (issue) => set({ pendingGuestIssue: issue }),

 consumePendingGuestIssue: () => {
  const { pendingGuestIssue } = get()
  if (pendingGuestIssue === null) return null
  set({ pendingGuestIssue: null })
  return pendingGuestIssue
 },

 requestBtwComposer: (request) => set({ pendingBtwComposerRequest: request }),

 consumePendingBtwComposerRequest: (parentSessionId) => {
  const request = get().pendingBtwComposerRequest
  if (!request || request.parentSessionId !== parentSessionId) return null
  set({ pendingBtwComposerRequest: null })
  return request
 },

 setPendingSyntheticParts: (parts, target = null) => {
  if (target === null) {
   set({ pendingSyntheticParts: parts })
   return
  }
  const pinned = new Map(get().pinnedSyntheticParts)
  if (parts?.length) pinned.set(target, parts)
  else pinned.delete(target)
  set({ pinnedSyntheticParts: pinned })
 },

 consumePendingSyntheticParts: (target = null) => {
  const parts = get().getPendingSyntheticParts(target)
  if (parts !== null) get().setPendingSyntheticParts(null, target)
  return parts
 },

 getPendingSyntheticParts: (target = null) => (
  target === null ? get().pendingSyntheticParts : get().pinnedSyntheticParts.get(target) ?? null
 ),

 addAttachedFile: async (file, target, onPrepared, options) => {
  const generation = attachmentReadGeneration
  if (options?.saveOnSend === "reference" && !INTAKE_REDACTED_FILENAME.test(file.name) && file.size <= MAX_ATTACHMENT_BYTES) {
   const mimeType = file.type.split(";", 1)[0]?.trim() || "application/octet-stream"
   const attached: AttachedFile = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, dataUrl: await readFileAsDataUrl(file, mimeType),
    mimeType, filename: file.name, size: file.size, source: "local",
    saveOnSend: true,
   }
   if (generation !== attachmentReadGeneration) return false
   set((state) => appendAttachedFiles(state, [attached], target))
   onPrepared?.([attached])
   return true
  }
  const referencePath = INTAKE_REDACTED_FILENAME.test(file.name) ? null : pathForDroppedFile(file)
  const attachReference = async (path: string): Promise<boolean> => {
   const reference = await prepareFileReference(file, path)
   if (generation !== attachmentReadGeneration) return false
   set((state) => appendAttachedFiles(state, [reference], target))
   onPrepared?.([reference])
   return true
  }

  if (file.size > MAX_INLINE_ATTACHMENT_BYTES) {
   if (referencePath) return attachReference(referencePath)
   const limit = file.size > MAX_ATTACHMENT_BYTES
    ? { key: 'chat.fileAttachment.toast.overSendLimit', bytes: MAX_ATTACHMENT_BYTES } as const
    : { key: 'chat.fileAttachment.toast.tooLarge', bytes: MAX_INLINE_ATTACHMENT_BYTES } as const
   throw new Error(formatMessage(useI18nStore.getState().dictionary, limit.key, {
    name: file.name,
    size: formatFileSize(limit.bytes),
   }))
  }

  for (let attempt = 0; attempt < MAX_ATTACHMENT_PREPARATION_ATTEMPTS; attempt += 1) {
   const reservedFilenames = attachedFilesFor(get(), target).map((attachment) => attachment.filename)
   let attachedFiles: AttachedFile[] | undefined
   try {
    attachedFiles = await prepareLocalAttachments(file, reservedFilenames)
   } catch (error) {
    return error instanceof HeicConversionError && referencePath ? attachReference(referencePath) : false
   }
   if (generation !== attachmentReadGeneration) return false
   if (!attachedFiles) return referencePath ? attachReference(referencePath) : false

   if (options?.saveOnSend) {
    for (const attached of attachedFiles) {
     if (options.saveOnSend === "copy") attached.saveCopyOnSend = true
     else attached.saveOnSend = true
    }
   }

   const generatedFilenames = attachedFiles.slice(1).map((attachment) => attachment.filename)
   if (hasGeneratedFilenameCollision(generatedFilenames, attachedFilesFor(get(), target))) continue

   set((state) => appendAttachedFiles(state, attachedFiles, target))
   onPrepared?.(attachedFiles)
   return true
  }
  return false
 },

 saveAttachmentsHeldForSend: (target, directory, sentIds) => {
  const key = JSON.stringify([getRuntimeKey(), getRuntimeSwitchRevision(), target ? getChatDraftIdentityKey(target) : get().attachmentDraftKey, directory, [...sentIds].sort()])
  const pending = heldSavesInFlight.get(key)
  if (pending) return pending
  const saving = saveHeldFiles(get, target, directory, sentIds)
  heldSavesInFlight.set(key, saving)
  const settle = () => { if (heldSavesInFlight.get(key) === saving) heldSavesInFlight.delete(key) }
  void saving.then(settle, settle)
  return saving
 },

 removeAttachedFile: (id) =>
  set((s) => {
   const target = s.attachedFiles.find((f) => f.id === id)
   if (target?.sourceDocumentId) {
    return { attachedFiles: s.attachedFiles.filter((f) => f.sourceDocumentId !== target.sourceDocumentId) }
   }
   return { attachedFiles: s.attachedFiles.filter((f) => f.id !== id) }
  }),

 setAttachedFiles: (files, target) => {
  const state = get()
  const key = target === undefined ? state.attachmentDraftKey : target ? getChatDraftIdentityKey(target) : null
  if (key !== state.attachmentDraftKey) {
   if (!key) return
   const drafts = new Map(state.attachmentDrafts)
   if (files.length) drafts.set(key, files)
   else drafts.delete(key)
   set({ attachmentDrafts: drafts })
   return
  }
  attachmentReadGeneration += 1
  set({ attachedFiles: files })
 },

 clearAttachedFiles: (target) => get().setAttachedFiles([], target),

 getAttachedFiles: (target) => attachedFilesFor(get(), target),
 addRestoredAttachment: (restored, target) => {
  const { url, mimeType, filename, size } = restored
  const attachmentId = /^attachment:\/\/([^/?#]+)$/.exec(url)?.[1]
  const file = restoredAttachmentFile(restored)
  const basename = attachmentBasename(filename)
  const attached: AttachedFile = {
   id: attachmentId ?? `restored-${Date.now()}-${Math.random().toString(36).slice(2)}`,
   file,
   dataUrl: url,
   mimeType,
   filename: basename,
   agentPath: basename !== filename ? filename : undefined,
   size: size ?? file.size,
   source: url.startsWith('data:') ? "local" : "server",
   serverPath: url.startsWith('data:') ? undefined : url,
  }
  set((s) => appendAttachedFiles(s, [attached], target))
 },
}))

const NO_ATTACHMENTS: AttachedFile[] = []

export const useDraftAttachedFiles = (target: ChatDraftIdentity | null | undefined): AttachedFile[] => {
 const key = target === undefined ? undefined : target ? getChatDraftIdentityKey(target) : null
 return useInputStore((state) => {
  if (key === undefined || key === state.attachmentDraftKey) return state.attachedFiles
  return key ? state.attachmentDrafts.get(key) ?? NO_ATTACHMENTS : NO_ATTACHMENTS
 })
}

subscribeChatDraftDeletion((identity) => {
 useInputStore.getState().setAttachedFiles([], identity)
})
