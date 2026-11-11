# 32: Make the merged session sidebar and dialogs compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/session/**`; their tests; slice 32 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 16 record; `packages/ui/src/sync/DOCUMENTATION.md`; skills `ui-api-decoupling`, `sync-state-invariants`, `drag-to-reorder`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 32 files (about 257 errors in 50 files at scaffold `93a3c7549`, 215 of them under `session/sidebar`); `bun scripts/upstream-drift.mjs --check --slice 32` → 0 unexplained (37 `components/session` paths today); `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/session` → exit 0

- [ ] Fix every type error in slice 32 files by porting merged upstream callers onto the fork's Canonical Client, Host session authority and stores. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them); record any missing data in `## Progress` instead.
- [ ] Keep upstream v2.7.0's sidebar header order, menus, sections manager, mark-all-read, worktree naming and row context menus working on the fork's session model.
- [ ] Tests: fix tests for behaviour the merged code keeps; delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [ ] Give every slice 32 `unexplained` path a reason (adopt upstream or cite a decision).
- [ ] Deletes: imports of removed OpenCode modules and their dead branches.
