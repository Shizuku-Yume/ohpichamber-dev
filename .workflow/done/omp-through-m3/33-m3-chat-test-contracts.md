# 33: Modernize chat and timeline test contracts

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** e1be47c36
**Started:** 2026-10-16
**Finished:** 2026-10-17

**Delivers:** Chat, message-part, turn-state, composer, and `SyncProvider` test fixtures exercise the canonical client and DTO contracts without OpenCode model/schema imports.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/`, `packages/ui/src/components/session/`, `packages/ui/src/providers/`, and directly paired UI fixtures/helpers
**Read first:** `.workflow/specs/omp-through-m3.md` W7-W10; sync/store documentation; canonical client and DTO owners
**Covers:** W7, W8, W10

**Check:** `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0; the consolidated 21-file packet passes 264 tests / 984 assertions; the four final lint-repaired files pass 72 tests / 145 assertions.

- [x] Chat and timeline fixtures compile against canonical DTOs and client APIs.
- [x] Existing behavior tests prove ordered parts, turn completion, and stale-runtime rejection where applicable.
- [x] No OpenCode adapter, field alias, or fallback is introduced.
- [x] Focused commands and results are recorded.

## Progress

The canonical chat cutover is exercised in retained chat fixtures. `MessageBody` no longer accepts or branches on legacy `messageFinish`; final-answer behavior derives from canonical completion and turn-grouping state. `LiveTurnActivity` fixtures use `CanonicalClient`, `@openchamber/agent-contract` parts, native `ChatMessageEntry`, and canonical changed-file projections.

The strict test-project check exits 0. Nine anti-slop findings introduced by the fixture edits were removed; unchanged baseline findings remain under the repository ratchet policy. No production adapter, field alias, or fallback was introduced.
