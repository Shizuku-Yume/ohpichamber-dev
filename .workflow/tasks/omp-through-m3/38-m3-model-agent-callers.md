# 38: Cut multirun AgentSelector to the canonical roster

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** The multirun AgentSelector consumes the directory-scoped canonical Agent roster, using native `agentId` and `name` fields without ConfigStore's duplicate catalog.

**Blocked by:** 37
**Files:** `packages/ui/src/components/multirun/AgentSelector.tsx`, directly invalidated tests and UI type definitions

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; `.workflow/tasks/omp-through-m3/37-m3-chat-agent-callers.md`; `packages/ui/src/stores/useAgentsStore.ts`; `packages/agent-contract/src/session.ts`
**Covers:** W9, W10

**Check:** Run the focused multirun AgentSelector checks, verify the UI package build, and run oxlint on the touched file. If no focused test exists, use the nearest existing multirun test only. Do not edit ModelControls: its permission, sampling, mode, and legacy model-shape presentation fields lack a canonical owner and remain an explicit Task 39 contract gap.

- [ ] Read the native roster from `useAgentsStore`.
- [ ] Load the catalog through the existing canonical store owner and preserve explicit unavailable behavior.
- [ ] Validate selection against native `agentId` and default to the native current agent or first roster entry.
- [ ] Remove ConfigStore agent catalog calls without aliases, adapters, or fallback paths.
- [ ] Verify focused checks, UI build, and touched-file oxlint.

**Status:** active

## Progress

`AgentSelector.tsx` now reads `useAgentsStore` through `selectAgentsForDirectory`, loads the native catalog, validates native `agentId` values, and preserves the current native agent/first-entry selection behavior. The UI build passes, the strict UI test-project type-check exits 0, touched-file oxlint passes with `0` warnings / `0` errors, and workflow validation passes with 49 task files. ModelControls remains on the explicit Task 39 contract-gap boundary; no adapter or fallback was added.

Follow-up (2026-10-20): Task46 resolved the ModelControls contract gap and owns its native control migration. Task38's multirun roster slice remains independent; no ModelControls source change is needed here.
