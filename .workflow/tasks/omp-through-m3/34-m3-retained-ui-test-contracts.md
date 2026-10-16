# 34: Modernize sidebar and retained UI test contracts

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** e1be47c36

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

- [ ] Sidebar and retained UI fixtures compile against canonical contracts.
- [ ] Existing behavior tests still cover hierarchy, retention/folder metadata, Board/Guest boundaries, and relevant failure states.
- [ ] No OpenCode adapter, field alias, or unsupported fallback is introduced.
- [ ] Record the exact focused command and result in the task artifact before archive.
