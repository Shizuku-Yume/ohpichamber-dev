# 33: Modernize chat and timeline test contracts

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** e1be47c36

**Delivers:** Chat, message-part, turn-state, composer, and `SyncProvider` test fixtures exercise the canonical client and DTO contracts without OpenCode model/schema imports.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/`, `packages/ui/src/components/session/`, `packages/ui/src/providers/`, `packages/ui/src/**/*.test.*` for chat/timeline/composer fixtures, and the smallest directly paired test helpers
**Read first:** `.workflow/specs/omp-through-m3.md` W7-W10; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; the canonical client and DTO owners introduced by Tasks 13 and 32; current UI test-project diagnostics
**Covers:** W7, W8, W10

**Change:**

- Inventory the current diagnostics in the named chat/timeline/composer slice and group them by stale model shape, stale client call, fixture adapter, or missing canonical state.
- Replace stale OpenCode-shaped fixtures with the existing canonical records/events and test-only builders; do not add production aliases or compatibility adapters.
- Preserve observable coverage for streaming ordering, turn completion, reasoning/tool/attachment/error rendering, composer submission, abort/retry, and stale-runtime protection where those tests already cover the behavior.
- Keep tests deterministic and scoped; remove dead fixture helpers only when their callers are migrated.

**Check:** `bun run --cwd packages/ui type-check` and the focused chat/timeline test command from the package scripts. The changed slice has no `@opencode/client`, `@opencode/schema`, or `lib/opencode/model` import except explicit historical data fixtures that are not runtime contracts.

**Acceptance:**

- [ ] Chat and timeline tests compile against canonical DTOs and client APIs.
- [ ] Existing behavior tests still prove ordered parts, turn completion, and stale-runtime rejection where applicable.
- [ ] No OpenCode adapter, field alias, or defensive fallback is introduced.
- [ ] Record the exact focused command and result in the task artifact before archive.
