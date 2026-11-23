import type { AttachedFile } from "@/stores/types/sessionTypes"
import { saveWorkspaceAttachments } from "@/lib/workspace-attachments"
import { captureRuntimeInstance } from "@/lib/runtime-switch"
import { PATH_NOTE_MEDIA_TYPE, savedFileNoteText } from "./attachment-files"

export class HeldAttachmentSaveError extends Error {
 readonly filenames: string[]

 constructor(filenames: string[]) {
  super(`Could not save ${filenames.join(", ")}`)
  this.name = "HeldAttachmentSaveError"
  this.filenames = filenames
 }
}

export async function prepareAttachmentsHeldForSend(
 files: readonly AttachedFile[],
 directory: string | null | undefined,
 isCurrent: () => boolean = captureRuntimeInstance(),
): Promise<AttachedFile[]> {
 const prepared: AttachedFile[] = []
 const failed: string[] = []
 const assertCurrent = () => { if (!isCurrent()) throw new Error("Runtime changed") }
 assertCurrent()
 for (const attached of files) {
  if (!attached.saveOnSend && !attached.saveCopyOnSend) {
   prepared.push(attached)
   continue
  }
  try {
   const bytes = new Uint8Array(await attached.file.arrayBuffer())
   assertCurrent()
   const [result] = await saveWorkspaceAttachments(directory, [{ filename: attached.filename, bytes }])
   assertCurrent()
   if (!result || !("path" in result)) {
    failed.push(attached.filename)
    continue
   }
   const text = savedFileNoteText(attached.filename, result.path, attached.saveCopyOnSend
    ? "The same file is attached to this message."
    : "Its content is not in this message. Read what you need from it with your tools.")
   const file = new File([text], attached.filename, { type: "text/plain" })
   const dataUrl = `data:${PATH_NOTE_MEDIA_TYPE};base64,${btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""))}`
   const note: AttachedFile = {
    id: attached.id, file, dataUrl, mimeType: "text/plain", filename: attached.filename,
    size: file.size, source: "local", agentPath: result.path, serverPath: result.path,
   }
   if (attached.saveCopyOnSend) {
    const { saveCopyOnSend: _copy, saveOnSend: _reference, ...original } = attached
    prepared.push(original, { ...note, id: `${attached.id}-saved-copy` })
   } else {
    prepared.push({ ...note, original: { mimeType: attached.mimeType, dataUrl: attached.dataUrl, saveOnSend: true } })
   }
  } catch {
   assertCurrent()
   failed.push(attached.filename)
  }
 }
 assertCurrent()
 if (failed.length > 0) throw new HeldAttachmentSaveError(failed)
 return prepared
}
