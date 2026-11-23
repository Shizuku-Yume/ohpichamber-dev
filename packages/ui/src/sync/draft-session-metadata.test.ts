import { describe, expect, test } from "bun:test"
import { SessionMetadataSchema } from "@openchamber/agent-contract"
import { draftSessionMetadata } from "./draft-session-metadata"

describe("Canonical draft project metadata", () => {
 test("an absent or empty project-pin selection produces no metadata", () => {
  expect(draftSessionMetadata({})).toBeUndefined()
  expect(draftSessionMetadata({ projectContextPins: { notes: [], plans: [] } })).toBeUndefined()
 })

 test("selected notes and plans use the Host-owned metadata contract", () => {
  const projectContextPins = { notes: ["note-1"], plans: ["plan-1"] }
  const metadata = draftSessionMetadata({ projectContextPins })
  expect(SessionMetadataSchema.parse(metadata)).toEqual({ openchamber: { project_context_pins: projectContextPins } })
  expect(projectContextPins).toEqual({ notes: ["note-1"], plans: ["plan-1"] })
 })
})
