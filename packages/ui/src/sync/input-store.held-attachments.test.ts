import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as workspaceAttachments from "@/lib/workspace-attachments"
import type { AttachedFile } from "@/stores/types/sessionTypes"
import { useInputStore } from "./input-store"
import { getRuntimeKey } from "@/lib/runtime-switch"

const restores: Array<() => void> = []
afterEach(() => { while (restores.length) restores.pop()?.() })
const attachment = (fields: Partial<AttachedFile> = {}): AttachedFile => ({
 id: "file-1", file: new File(["bytes"], "report.pdf", { type: "application/pdf" }),
 dataUrl: `data:application/pdf;base64,${btoa("bytes")}`, mimeType: "application/pdf", filename: "report.pdf", size: 5, source: "local", ...fields,
})
const save = () => {
 const mock = spyOn(workspaceAttachments, "saveWorkspaceAttachments").mockImplementation(async (_directory, files) => files.map(({ filename }) => ({ filename, path: `/workspace/.ohpichamber/attachments/id/${filename}` })))
 restores.push(() => mock.mockRestore())
 return mock
}

describe("draft-owned held attachments", () => {
 beforeEach(() => useInputStore.setState({ attachmentDraftKey: null, attachedFiles: [], attachmentDrafts: new Map() }))

 test("only the captured selection is saved and repeat clicks share the same save", async () => {
  const write = save()
  const selected = attachment({ saveOnSend: true })
  const other = attachment({ id: "other", filename: "other.pdf", saveOnSend: true })
  useInputStore.getState().setAttachedFiles([selected, other])
  const pending = useInputStore.getState().saveAttachmentsHeldForSend(null, "/workspace", new Set([selected.id]))
  expect(useInputStore.getState().saveAttachmentsHeldForSend(null, "/workspace", new Set([selected.id]))).toBe(pending)
  expect(await pending).toEqual([])
  expect(write).toHaveBeenCalledTimes(1)
  expect(useInputStore.getState().attachedFiles[0].saveOnSend).toBeUndefined()
  expect(useInputStore.getState().attachedFiles[1]).toBe(other)
 })

 test("a failed save keeps the draft's original held attachment for retry", async () => {
  save().mockRejectedValue(new Error("offline"))
  const file = attachment({ saveOnSend: true })
  useInputStore.getState().setAttachedFiles([file])
  expect(await useInputStore.getState().saveAttachmentsHeldForSend(null, "/workspace", new Set([file.id]))).toEqual([file.filename])
  expect(useInputStore.getState().attachedFiles[0]).toBe(file)
 })

 test("an unnamed target updates the captured active named draft", async () => {
  save()
  const target = { runtimeKey: getRuntimeKey(), directory: "/workspace", sessionId: "active" }
  useInputStore.getState().selectAttachmentDraft(target)
  const file = attachment({ saveOnSend: true })
  useInputStore.getState().setAttachedFiles([file])
  expect(await useInputStore.getState().saveAttachmentsHeldForSend(null, target.directory, new Set([file.id]))).toEqual([])
  expect(useInputStore.getState().attachedFiles[0].saveOnSend).toBeUndefined()
 })

 test("a background draft save cannot replace the visible draft's files", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  save().mockImplementation(async () => { await gate; return [{ filename: "report.pdf", path: "/workspace/report.pdf" }] })
  const first = { runtimeKey: getRuntimeKey(), directory: "/workspace", sessionId: "first" }
  const second = { ...first, sessionId: "second" }
  useInputStore.getState().selectAttachmentDraft(first)
  const file = attachment({ saveOnSend: true })
  useInputStore.getState().setAttachedFiles([file])
  const pending = useInputStore.getState().saveAttachmentsHeldForSend(first, first.directory, new Set([file.id]))
  useInputStore.getState().selectAttachmentDraft(second)
  const visible = attachment({ id: "visible" })
  useInputStore.getState().setAttachedFiles([visible])
  release()
  expect(await pending).toEqual([])
  expect(useInputStore.getState().attachedFiles).toEqual([visible])
  useInputStore.getState().selectAttachmentDraft(first)
  expect(useInputStore.getState().attachedFiles[0].saveOnSend).toBeUndefined()
 })

 test("clearing a draft during a save cannot resurrect the removed file", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  save().mockImplementation(async () => { await gate; return [{ filename: "report.pdf", path: "/workspace/report.pdf" }] })
  const file = attachment({ saveOnSend: true })
  useInputStore.getState().setAttachedFiles([file])
  const pending = useInputStore.getState().saveAttachmentsHeldForSend(null, "/workspace", new Set([file.id]))
  useInputStore.getState().clearAttachedFiles()
  release()
  expect(await pending).toEqual([])
  expect(useInputStore.getState().attachedFiles).toEqual([])
 })
})
