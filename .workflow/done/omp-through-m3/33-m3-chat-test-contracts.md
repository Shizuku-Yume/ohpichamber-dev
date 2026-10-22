# 33: Modernize chat and timeline test contracts

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** e1be47c36
**Started:** 2026-10-16
**Finished:** 2026-10-17

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

- [x] Chat and timeline tests compile against canonical DTOs and client APIs.
- [x] Existing behavior tests still prove ordered parts, turn completion, and stale-runtime rejection where applicable.
- [x] No OpenCode adapter, field alias, or defensive fallback is introduced.
- [x] Record the exact focused command and result in the task artifact before archive.

## Progress

**Dirty at start:** unrelated archive moves for Tasks 14 and 32; preserved.

The canonical chat cutover is now exercised in the retained chat fixtures. `MessageBody` no longer accepts or branches on legacy `messageFinish`; final-answer behavior derives from canonical completion and turn-grouping state. `LiveTurnActivity` fixtures use `CanonicalClient`, `@openchamber/agent-contract` parts, native `ChatMessageEntry`, and canonical changed-file projections.

Focused commands and observed results:

- `bun test packages/ui/src/components/chat/RevertedMessagesStrip.test.tsx`: 1 passed, 0 failed.
- `bun test packages/ui/src/components/chat/SessionErrorNotice.test.ts`: 4 passed, 0 failed.
- `bun test packages/ui/src/components/chat/TimelineDialog.test.tsx`: 2 passed, 0 failed.
- `bun test packages/ui/src/components/chat/chatPromptReadOnly.test.ts`: 4 passed, 0 failed.
- `bun test packages/ui/src/components/chat/components/LiveTurnActivity.test.tsx`: 9 passed, 0 failed.
- `bun test packages/ui/src/components/chat/components/TurnMessageWindow.test.tsx`: 17 passed, 0 failed.
- `bun test packages/ui/src/components/chat/composer/ui/MobilePillComposer.test.tsx`: 8 passed, 0 failed.
- `bun test packages/ui/src/components/chat/revertedMessageDockState.test.ts`: 1 passed, 0 failed.
- `bun test packages/ui/src/sync/__tests__/issue-2404.test.ts`: 2 passed, 0 failed.
The current strict test-project command `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0. The consolidated 21-file changed-slice packet passed 264 tests / 984 assertions; the four files changed by final lint repairs passed 72 tests / 145 assertions on rerun. Nine introduced anti-slop findings were removed; unchanged baseline findings remain governed by the ratchet. Task33's chat/timeline slice has no remaining evidence blocker, and no OpenCode adapter, field alias or fallback was introduced.
