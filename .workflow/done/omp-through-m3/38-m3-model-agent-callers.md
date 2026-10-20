# 38: Cut multirun AgentSelector to the canonical roster

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 81e616ed74813f80c8a20f61e5279724814e43bc
**Finished:** 2026-10-21T02:20:21+08:00

**Delivers:** The multirun AgentSelector consumes the directory-scoped canonical Agent roster, using native `agentId` and `name` fields without ConfigStore's duplicate catalog.

**Blocked by:** 37
**Files:** `packages/ui/src/components/multirun/AgentSelector.tsx`, directly invalidated tests and UI type definitions

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; `.workflow/tasks/omp-through-m3/37-m3-chat-agent-callers.md`; `packages/ui/src/stores/useAgentsStore.ts`; `packages/agent-contract/src/session.ts`
**Covers:** W9, W10

**Check:** Run the focused multirun AgentSelector checks, verify the UI package build, and run oxlint on the touched file. If no focused test exists, use the nearest existing multirun test only. Do not edit ModelControls in this task; Task46 owns its native control migration under the 2026-10-18 canonical roster decision. This task covers only the multirun AgentSelector.

- [x] Read the native roster from `useAgentsStore`.
- [x] Load the catalog through the existing canonical store owner and preserve explicit unavailable behavior.
- [x] Validate selection against native `agentId` and default to the native current agent or first roster entry.
- [x] Remove ConfigStore agent catalog calls without aliases, adapters, or fallback paths.
- [x] Verify focused checks, UI build, and touched-file oxlint.

## Progress

`AgentSelector.tsx` now reads `useAgentsStore` through `selectAgentsForDirectory`, loads the native catalog, validates native `agentId` values, and preserves the current native agent/first-entry selection behavior. The UI build passes, the strict UI test-project type-check exits 0, touched-file oxlint passes with `0` warnings / `0` errors, and workflow validation passes with 49 task files. ModelControls is Task46's scope; no adapter or fallback was added here.

Follow-up (2026-10-20): Task46 resolved the ModelControls contract gap and owns its native control migration. Task38's multirun roster slice remains independent; no ModelControls source change is needed here.

2026-10-21 archive-only closure: the original task-start baseline was never recorded. This task was first added in `93d5192` already `Status: active` with `Base commit: <commit-sha>`, and no commit records a real start or source baseline. The `Base commit` above is the current pre-edit HEAD `81e616ed7`, used only for this resumed record/archive closure; it is not a historical code baseline. Implementation landed in `66fbdec99`; `AgentSelector.tsx`, the directly relevant test/type-check inputs, and package scripts have no changes from `66fbdec99` to `HEAD`. Reused evidence: UI build, strict UI test-project type-check (`bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json`) exit 0, touched-file oxlint `0` warnings / `0` errors, and workflow validation with 49 task files. No dedicated AgentSelector test exists; the nearest existing multirun tests are library-level and were not rerun because source and inputs are unchanged. No source, test, build, or lint was rerun for this record closure. The ModelControls gap text is corrected because Task46 owns that migration.

Review boundary: archive-only record closure from `81e616ed7`; implementation boundary `66fbdec99`; requirements and quality pass, no blocking findings; security not triggered.
