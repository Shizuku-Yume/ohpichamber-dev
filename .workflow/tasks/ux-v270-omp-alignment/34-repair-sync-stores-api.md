# 34: Make the merged sync, stores and UI API layer compile

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/sync/**`; `packages/ui/src/stores/**`; `packages/ui/src/api/**`; `packages/ui/src/contexts/**`; their tests; slice 34 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 15 record; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; skills `sync-state-invariants`, `ui-api-decoupling`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 34 files (about 310 errors at scaffold `93a3c7549`: sync 187 in 27 files, stores 107 in 15 files, api 13, contexts 3; most are in tests); `bun scripts/upstream-drift.mjs --check --slice 34` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/sync packages/ui/src/stores packages/ui/src/api` → exit 0

- [ ] Fix every type error in slice 34 files. Production code keeps the Canonical Client event model and Host session authority; tests are brought onto the shapes production now has.
- [ ] Exported shapes other slices consume stay as they are on the scaffold. If a shape must change to fix an error here, update every caller outside this slice in the same commit and list them in `## Progress`.
- [ ] Do not change hydration or reducer semantics; task 22 owns that cutover.
- [ ] Tests: fix kept behaviour, delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [ ] Give every slice 34 `unexplained` path a reason.
- [ ] Deletes: imports of removed OpenCode modules and their dead branches.
