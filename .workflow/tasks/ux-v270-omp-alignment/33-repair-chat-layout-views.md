# 33: Make the merged chat, layout, views and app shells compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/{chat,layout,views,multirun,ui,onboarding,projects,sourceBoard,desktop,comments,references}/**`; `packages/ui/src/apps/**`; `packages/ui/src/App.tsx`; their tests; slice 33 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); `decisions.md: 2026-11-11 - Chat presentation is ported onto the canonical contract…`; the archived task 13 and 16 records; skills `ui-api-decoupling`, `sync-state-invariants`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 33 files (about 190 errors at scaffold `93a3c7549`: chat 54, layout 46, views 28, multirun 13, apps 13, ui 11, the rest small); `bun scripts/upstream-drift.mjs --check --slice 33` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/chat packages/ui/src/components/layout packages/ui/src/components/views packages/ui/src/apps` → exit 0

- [ ] Fix every type error in slice 33 files by porting merged upstream callers onto the fork's contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them).
- [ ] Chat: keep the presentation ported onto the canonical contract as lane 13 decided; do not start the R3 redesign (tasks 23-24).
- [ ] Every app root (`App`, `MobileApp`, `ElectronMiniChatApp`) compiles with the merged action sets.
- [ ] Tests: fix kept behaviour, delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [ ] Give every slice 33 `unexplained` path a reason.
- [ ] Deletes: imports of removed OpenCode modules and their dead branches.
