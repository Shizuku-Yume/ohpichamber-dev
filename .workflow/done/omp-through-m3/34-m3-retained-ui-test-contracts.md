# 34: Modernize sidebar and retained UI test contracts

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** a41d5d6514b101b5effed97ec8aad6a855781fa2
**Started:** 2026-10-16
**Finished:** 2026-10-17

**Delivers:** Sidebar, session collection, worktree, Board, Guest, and retained UI test fixtures use canonical metadata, client, and command contracts.

**Blocked by:** None
**Files:** `packages/ui/src/components/session/sidebar/`, `packages/ui/src/components/session/`, `packages/ui/src/components/board/`, `packages/ui/src/components/guest/`, and directly paired UI fixtures/helpers
**Read first:** `.workflow/specs/omp-through-m3.md` W9-W10; sync/store documentation; canonical session, catalog, Guest and Board owners
**Covers:** W9, W10

**Check:** `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0; seven retained-UI tests pass separately for 58 tests / 151 assertions.

- [x] Sidebar and retained UI fixtures compile against canonical contracts.
- [x] Behavior tests cover hierarchy, retention/folder metadata, Board/Guest boundaries and relevant failure states.
- [x] No OpenCode adapter, field alias or unsupported fallback is introduced.
- [x] Focused commands and results are recorded.

## Progress

The canonical fixture audit repaired session epoch/counter fields, metadata and archive revisions, authorized workspace bindings and canonical prefetch callbacks. The seven direct behavior files passed 58 tests / 151 assertions in separate runs. The strict test-project check exits 0. Nine introduced anti-slop findings were removed; unchanged baseline findings remain under the repository ratchet policy. Production legacy callers and connected Board/Guest/sidebar observation remain Task17/36 work.
