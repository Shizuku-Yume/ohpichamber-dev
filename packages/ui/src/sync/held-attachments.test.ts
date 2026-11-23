import { afterEach, describe, expect, spyOn, test } from "bun:test"
import * as workspaceAttachments from "@/lib/workspace-attachments"
import type { AttachedFile } from "@/stores/types/sessionTypes"
import { withOriginalAttachment } from "@/stores/messageQueueAttachments"
import { HeldAttachmentSaveError, prepareAttachmentsHeldForSend } from "./held-attachments"

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

describe("Host attachment preparation at Send", () => {
 test("empty and unheld attachments do not write anything", async () => {
  const write = save()
  expect(await prepareAttachmentsHeldForSend([], undefined)).toEqual([])
  const file = attachment()
  expect((await prepareAttachmentsHeldForSend([file], undefined))[0]).toBe(file)
  expect(write).not.toHaveBeenCalled()
 })

 test("a reference saves its bytes at the selected Host and uploads a correctly sized note", async () => {
  const write = save()
  const file = attachment({ saveOnSend: true })
  const [prepared] = await prepareAttachmentsHeldForSend([file], "/workspace")
  expect(write).toHaveBeenCalledWith("/workspace", [{ filename: "report.pdf", bytes: new TextEncoder().encode("bytes") }])
  expect(prepared.id).toBe(file.id)
  expect(prepared.mimeType).toBe("text/plain")
  expect(prepared.dataUrl.startsWith("data:text/plain;x-openchamber=path-note;base64,")).toBe(true)
  expect(await prepared.file.text()).toContain("/workspace/.ohpichamber/attachments/id/report.pdf")
  expect(prepared.size).toBe(prepared.file.size)
  expect(prepared.saveOnSend).toBeUndefined()
  const edited = withOriginalAttachment(prepared)
  expect(await edited.file.text()).toBe("bytes")
  expect(edited.size).toBe(5)
  expect(edited.saveOnSend).toBe(true)
  expect(edited.serverPath).toBeUndefined()
  expect(file.saveOnSend).toBe(true)
 })

 test("a saved media copy keeps its media and adds a path note only once", async () => {
  const write = save()
  const file = attachment({ saveCopyOnSend: true })
  const prepared = await prepareAttachmentsHeldForSend([file], "/workspace")
  expect(prepared).toHaveLength(2)
  expect(prepared[0].dataUrl).toBe(file.dataUrl)
  expect(prepared[0].saveCopyOnSend).toBeUndefined()
  expect(prepared[1].id).not.toBe(file.id)
  expect(await prepared[1].file.text()).toContain("The same file is attached")
  expect(await prepareAttachmentsHeldForSend(prepared, "/workspace")).toEqual(prepared)
  expect(write).toHaveBeenCalledTimes(1)
 })

 test("per-file errors block admission without changing the caller's files", async () => {
  const write = save().mockResolvedValue([{ filename: "report.pdf", error: new Error("disk full") }])
  const file = attachment({ saveOnSend: true })
  await expect(prepareAttachmentsHeldForSend([file], "/workspace")).rejects.toBeInstanceOf(HeldAttachmentSaveError)
  expect(write).toHaveBeenCalledTimes(1)
  expect(file.saveOnSend).toBe(true)
  expect(file.mimeType).toBe("application/pdf")
 })

 test("missing workspace or Host failures block the send", async () => {
  save().mockRejectedValue(new Error("workspace required"))
  await expect(prepareAttachmentsHeldForSend([attachment({ saveOnSend: true })], undefined)).rejects.toThrow("Could not save report.pdf")
 })

 test("a runtime retired before byte loading cannot write to another Host", async () => {
  const write = save()
  let current = true
  const file = attachment({ saveOnSend: true })
  spyOn(file.file, "arrayBuffer").mockImplementation(async () => { current = false; return new ArrayBuffer(5) })
  await expect(prepareAttachmentsHeldForSend([file], "/workspace", () => current)).rejects.toThrow(/runtime changed/i)
  expect(write).not.toHaveBeenCalled()
 })

 test("a late save from a retired runtime cannot continue to the next file", async () => {
  let current = true
  const write = save().mockImplementation(async () => { current = false; return [{ filename: "report.pdf", path: "/old/report.pdf" }] })
  await expect(prepareAttachmentsHeldForSend([attachment({ saveOnSend: true }), attachment({ id: "second", saveOnSend: true })], "/workspace", () => current)).rejects.toThrow(/runtime changed/i)
  expect(write).toHaveBeenCalledTimes(1)
 })
})
