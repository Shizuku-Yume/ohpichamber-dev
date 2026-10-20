# 45: Cut safe agent label and diagnostics callers to current owners

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740

**Delivers:** Safe caller edges from the residual audit stop depending on legacy agent presentation and SDK base access. Agent labels use canonical `Agent.name`; the diagnostics report uses the already resolved Host runtime API base instead of reading the legacy OpenCode client singleton.

**Blocked by:** None
**Files:** `packages/ui/src/lib/agentLabel.ts`, `packages/ui/src/lib/agentLabel.test.ts`, `packages/ui/src/components/chat/ModelControls.tsx`, `packages/ui/src/components/session/ScheduledTasksDialog.tsx`, `packages/ui/src/lib/openCodeStatus.ts`, `.workflow/development.md`

**Covers:** W9, W10

**Check:** `bun test packages/ui/src/lib/agentLabel.test.ts`; `bun run --cwd packages/ui build`; strict UI test-project type-check. Touched diagnostics lint is classified against its existing baseline; no connected acceptance is claimed.

## Progress

- [x] Use canonical `Agent.name` as the label without synthesizing `displayName`.
- [x] Remove display-field fallbacks from the directly invalidated callers.
- [x] Use the resolved runtime API base in the diagnostics report instead of `opencodeClient.getBaseUrl()`.
- [x] Run focused test, UI build and strict UI test-project type-check.
- [x] Update residual evidence without claiming W7-W10.

**Finished:** 2026-10-18

## Evidence

The agent-label test passes (`2` tests / `2` assertions), UI build passes, and strict UI test-project type-check exits `0`. `openCodeStatus.ts` retains only its existing broad debug-report lint findings; the removed SDK base dependency introduces no new contract. Task39/43 gaps, Host lifecycle retirement and connected W7-W10 acceptance remain open.
