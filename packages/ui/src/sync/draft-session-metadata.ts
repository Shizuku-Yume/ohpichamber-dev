import type { SessionMetadata } from "@openchamber/agent-contract"
import type { NewSessionDraftState } from "./session-ui-store"

export const draftSessionMetadata = (draft: Pick<NewSessionDraftState, "projectContextPins">): SessionMetadata | undefined => {
  const draftPins = draft.projectContextPins ?? { notes: [], plans: [] }
  const pins = draftPins.notes.length > 0 || draftPins.plans.length > 0 ? { project_context_pins: draftPins } : null
  return pins ? { openchamber: pins } : undefined
}
