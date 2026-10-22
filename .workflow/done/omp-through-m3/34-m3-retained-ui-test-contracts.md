# 34: Modernize sidebar and retained UI test contracts

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** a41d5d6514b101b5effed97ec8aad6a855781fa2
**Started:** 2026-10-16
**Finished:** 2026-10-17

**Delivers:** Sidebar, session collection, worktree, Board, Guest, and remaining retained UI test fixtures use canonical metadata, client, and command contracts.

**Blocked by:** None
**Files:** `packages/ui/src/components/session/sidebar/`, `packages/ui/src/components/session/`, `packages/ui/src/components/board/`, `packages/ui/src/components/guest/`, `packages/ui/src/**/*.test.*` for sidebar/session/worktree/Board/Guest fixtures, and the smallest directly paired test helpers
**Read first:** `.workflow/specs/omp-through-m3.md` W9-W10; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; the canonical session, catalog, Guest, and Board owners; current UI test-project diagnostics
**Covers:** W9, W10

**Change:**

- Inventory the current diagnostics in the named retained-UI slices and separate stale OpenCode shapes from test-only data that intentionally models historical content.
- Replace stale fixtures and mocked client calls with the canonical session metadata, catalogs, Guest shell, Board launch, folder/retention, and worktree contracts already owned by the application.
- Preserve tests for sidebar hierarchy, metadata/folder/retention behavior, Board launch, Guest scope, and utility-generation error handling where those behaviors are present.
- Do not broaden the task into production caller migration owned by Task 17; report any production gap with its owning file and leave it for that task.

**Check:** `bun run --cwd packages/ui type-check` and the focused sidebar/session/Board/Guest test command from the package scripts. The changed slice has no OpenCode client/schema/model import used as a runtime contract.

**Acceptance:**

- [x] Sidebar and retained UI fixtures compile against canonical contracts.
- [x] Existing behavior tests still cover hierarchy, retention/folder metadata, Board/Guest boundaries, and relevant failure states. Separate-file execution remains the reliable focused mode where Bun's process-wide mock loader collides.
- [x] No OpenCode adapter, field alias, or unsupported fallback is introduced.
- [x] Record the focused commands and their observed results below; the package-wide runtime and connected surface gates remain owned by Tasks 17, 35 and 36.

## Progress

- Dirty at start: `.workflow/tasks/omp-through-m3/14-m3-session-composer.md` (deleted), `.workflow/tasks/omp-through-m3/32-m3-native-subagent-navigation.md` (deleted), `.workflow/tasks/omp-through-m3/33-m3-chat-test-contracts.md`, `.workflow/done/omp-through-m3/14-m3-session-composer.md` (untracked), `.workflow/done/omp-through-m3/32-m3-native-subagent-navigation.md` (untracked), and Task 33 chat/sync test and helper paths reported by `git status --porcelain`; they remain outside Task34 changes.
- Canonical fixture audit repaired all changed Task34 sidebar/worktree fixtures: `Session` fields now use string epoch/counters, metadata plus independent metadata/archive revisions, and authorized workspace bindings; prefetch callbacks use the canonical `{ directory, sessionId }` request.
- Focused behavior command: seven changed tests run separately from `packages/ui`: `sessionCollection.test.ts` (16), `SessionSidebarFolderItem.test.tsx` (1), `useSessionPrefetch.test.tsx` (4), `useAuthoritativeSessionCleanup.test.ts` (7), `useAuthoritativeSessionCleanup.reconcile.test.ts` (1), `sessionWorktreeMove.test.ts` (24), and `relocateRestoredSession.test.ts` (5). Result: 58 tests passed, 0 failed, 151 assertions.
- The current strict test-project command `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0. The consolidated 21-file changed-slice packet passed 264 tests / 984 assertions; the four files changed by final lint repairs passed 72 tests / 145 assertions on rerun.
- The seven retained-UI tests above remain the direct Task34 behavior evidence: 58 tests passed, 0 failed, 151 assertions. Nine introduced anti-slop findings were removed from the final fixture wave; unchanged baseline findings remain governed by the ratchet.
- No OpenCode runtime contract import, adapter, field alias or fallback remains in the repaired fixture files. Production legacy callers and connected Board/Guest/sidebar observation remain Task17/36 work; do not claim W10 from this fixture evidence alone.
