# 37: Cut chat agent callers to the canonical roster

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** d796864148dc60cd33d68ae282e3473f298a569e
**Finished:** 2026-10-21T02:17:40+08:00

**Delivers:** ChatInput and FileMentionAutocomplete consume the directory-scoped canonical Agent roster. Every enabled native profile is selectable; `name` is the visible label and `description` is supporting text. The components no longer depend on ConfigStore's duplicate agent catalog or OpenCode agent presentation fields.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/ChatInput.tsx`, `packages/ui/src/components/chat/FileMentionAutocomplete.tsx`, `packages/ui/src/lib/messages/agentMentions.ts`, directly invalidated tests and UI type definitions

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; the named components; `packages/ui/src/stores/useAgentsStore.ts`; `packages/agent-contract/src/session.ts`; `packages/agent-service/src/worker/catalog-agents.ts`; UI store and styling documentation
**Covers:** W9, W10

**Check:** Run focused chat input/mention checks, verify the UI package build, and run oxlint on touched files. Do not run source tests, broad builds, or unconstrained smoke suites.

- [x] Read agents through `useAgentsStore` with the existing directory scope.
- [x] Use native `Agent.name` and `Agent.description` directly; do not recreate `hidden`, `mode`, or `displayName` fields.
- [x] Make agent mention parsing use the canonical Agent contract and the explicit all-enabled-profiles roster decision.
- [x] Remove ConfigStore legacy agent catalog and `@/lib/opencode/model` presentation dependencies from the named callers.
- [x] Update directly invalidated fixtures only where the source contract requires it.
- [x] Verify focused checks and UI build pass, and touched-file oxlint adds no new findings beyond unchanged baseline.

## Progress

The canonical roster decision is resolved by `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`. `ChatInput.tsx` and `FileMentionAutocomplete.tsx` now read `useAgentsStore` through the existing directory selector; `agentMentions.ts` accepts the native Agent contract and matches every enabled profile. `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0, `ChatInput.keystroke.test.tsx` passes, the UI build passes, and the touched-source lint packet reports only unchanged baseline findings in the surrounding files.

2026-10-21 archive-only closure: the original task-start baseline was never recorded. This task was first added in `93d5192` already `Status: active` with `Base commit: <commit-sha>`, and no commit records a real start or source baseline. The `Base commit` above is the current pre-edit HEAD `d79686414`, used only for this resumed record/archive closure; it is not a historical code baseline. Implementation landed in `66fbdec99`, and the named source files and tests have no changes from `66fbdec99` to `HEAD`. Reused unchanged evidence: strict UI test-project type-check (`bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json`) exit 0, `ChatInput.keystroke.test.tsx` pass, UI build pass, and focused changed-file oxlint with only unchanged baseline findings; the accessible classification is the 2026-10-18 Task37 development record, with no separate lint receipt retained. Checkbox 6 wording now matches that classification. No source, test, or build was rerun for this record closure.

Review boundary: archive-only record closure from `d79686414`; implementation boundary `66fbdec99`; requirements and quality pass, no blocking findings; security not triggered.
