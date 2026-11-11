# 31: Make the merged Settings sections compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/sections/**`; `packages/ui/src/components/snippets/**`; their tests and i18n modules; slice 31 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); `decisions.md: 2026-11-10 - OMP TUI parity…`; the archived task 17 record; `packages/ui/src/components/sections/PATTERNS.md`; skills `ui-api-decoupling`, `locale-ui-patterns`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 31 files (about 298 errors in 39 files at scaffold `93a3c7549`; largest: `mcp` 76, `providers` 56, `openchamber` 35, `plugins` 30, `agents` 23, `skills` 20, `snippets` 26, `commands` 13); `bun scripts/upstream-drift.mjs --check --slice 31` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/sections` → exit 0

- [ ] Fix every type error in slice 31 files by porting the merged upstream callers onto the fork's existing Canonical Client, Host and store contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them); when a caller needs data the contract does not provide, record it in `## Progress` and keep the upstream UI behaviour behind the closest existing call.
- [ ] Plugins, Agents, Commands and OMP Settings pages get the minimum change that compiles and keeps current behaviour; tasks 25-26 rebuild them, so do not redesign them here.
- [ ] Test files: fix tests that cover behaviour the merged code keeps; delete tests that pin OpenCode-engine behaviour the fork retired (name each in `## Progress`).
- [ ] Give every slice 31 `unexplained` path a reason: adopt upstream content, or add an `upstream-deltas.tsv` row citing a decision.
- [ ] Deletes: imports of removed OpenCode modules and dead branches that only existed for them.
