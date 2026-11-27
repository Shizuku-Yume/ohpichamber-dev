import { getChatsRoot } from "@/lib/chatDirectories"
import { normalizePath } from "@/lib/pathNormalization"
import { type SessionFolder, type SessionFoldersMap } from "@/stores/useSessionFoldersStore"
import type { NewSessionDraftState } from "./session-ui-store"

type DraftFolderFields = Pick<NewSessionDraftState, "target" | "directoryOverride" | "pendingWorktreeRequestId" | "targetFolderId">

const getDraftFolderScope = (draft: DraftFolderFields): string | null => {
  if (draft.pendingWorktreeRequestId) return null
  return draft.target === "chat" ? getChatsRoot() : normalizePath(draft.directoryOverride ?? null)
}

export const getDraftTargetFolder = (
  foldersMap: SessionFoldersMap,
  draft: DraftFolderFields,
): { scope: string; folder: SessionFolder } | null => {
  const scope = getDraftFolderScope(draft)
  const folder = scope && draft.targetFolderId
    ? foldersMap[scope]?.find((candidate) => candidate.id === draft.targetFolderId)
    : undefined
  return scope && folder ? { scope, folder } : null
}

