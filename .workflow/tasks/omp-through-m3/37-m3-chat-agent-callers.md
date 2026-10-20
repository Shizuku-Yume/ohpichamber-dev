# 37: Cut chat agent callers to the canonical roster

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** ChatInput and FileMentionAutocomplete consume the directory-scoped canonical Agent roster. Every enabled native profile is selectable; `name` is the visible label and `description` is supporting text. The components no longer depend on ConfigStore's duplicate agent catalog or OpenCode agent presentation fields.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/ChatInput.tsx`, `packages/ui/src/components/chat/FileMentionAutocomplete.tsx`, `packages/ui/src/lib/messages/agentMentions.ts`, directly invalidated tests and UI type definitions

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; the named components; `packages/ui/src/stores/useAgentsStore.ts`; `packages/agent-contract/src/session.ts`; `packages/agent-service/src/worker/catalog-agents.ts`; UI store and styling documentation
**Covers:** W9, W10

**Check:** Run focused chat input/mention checks, verify the UI package build, and run oxlint on touched files. Do not run source tests, broad builds, or unconstrained smoke suites.

- [ ] Read agents through `useAgentsStore` with the existing directory scope.
- [ ] Use native `Agent.name` and `Agent.description` directly; do not recreate `hidden`, `mode`, or `displayName` fields.
- [ ] Make agent mention parsing use the canonical Agent contract and the explicit all-enabled-profiles roster decision.
- [ ] Remove ConfigStore legacy agent catalog and `@/lib/opencode/model` presentation dependencies from the named callers.
- [ ] Update directly invalidated fixtures only where the source contract requires it.
- [ ] Verify focused checks, UI build, and touched-file oxlint pass cleanly.

**Status:** active

## Progress

The canonical roster decision is resolved by `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`. `ChatInput.tsx` and `FileMentionAutocomplete.tsx` now read `useAgentsStore` through the existing directory selector; `agentMentions.ts` accepts the native Agent contract and matches every enabled profile. `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0, `ChatInput.keystroke.test.tsx` passes, the UI build passes, and the touched-source lint packet reports only unchanged baseline findings in the surrounding files. The packet remains active until the coordinator records the final focused lint classification and archives the task; no connected W7-W10 evidence is claimed.
