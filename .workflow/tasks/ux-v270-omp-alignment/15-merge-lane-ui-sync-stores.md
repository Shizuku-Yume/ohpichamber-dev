# 15: Resolve the merge in sync, stores and the UI API layer

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/sync/**`; `packages/ui/src/stores/**`; `packages/ui/src/api/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 15; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; skills `sync-state-invariants`, `ui-api-decoupling`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 15` → 0; `bun run --cwd packages/ui type-check` reports no error in lane paths; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/sync packages/ui/src/stores` → 0 `unexplained`
- **Base commit:** fd671d0690c72c3f69b8c8c3739f60ce026832d8
- **Status:** active

- [x] Resolve the conflicted paths with the merge rule. The Canonical Client event model and Host session authority stay; upstream's store fields, settings-search ids, queue and eviction fixes are adopted onto it.
- [x] Where upstream changes event translation the fork replaced (`lib/opencode/events.ts` era), record the fork's canonical replacement in `upstream-deltas.tsv` with the decision that retired it.
- [x] Do not change hydration or reducer semantics here; task 22 owns that cutover.
- [x] Deletes: fork store fields that upstream removed and no fork caller still needs.

## Progress

Lane 15 resolved every conflict marker in `packages/ui/src/sync/**` and
`packages/ui/src/stores/**` (341 hunks across 88 files) and settled the drift
ledger for those directories.

Resolution shape:

- **Canonical authority stays.** Each conflicted path ends on the fork's
  `main` blob (the Canonical Client event model, `@openchamber/agent-contract`
  session/store projections, Host session authority). Upstream's
  OpenCode-shaped half (`@/lib/opencode/model`, `opencodeClient`, VS Code
  attachment sources, `isVSCodeRuntime`) cannot compile on the OMP boundary
  tree, so it cannot be adopted there.
- **Upstream adopted where its side needs no erased module.** Fifteen files
  whose upstream side only uses surviving modules take upstream's v2.7.0 blob:
  `useQuotaStore` (extension providers, auto-refresh, same-origin readout),
  `useGitStore` (unreadable-read budget), `useSnippetsStore.test.ts`,
  `useAgentsStore.subagents.test.tsx`, `useGitHubPrStatusStore.test.ts`,
  `sync/__tests__/live-aggregate.test.js`, `sync/control-stream-sync.ts`,
  `sync/input-store.test.ts`, `sync/input-store.desktopPath.test.ts`,
  `sync/last-session-restore.ts`, `sync/notification-store.ts`,
  `sync/selection-store.ts`, `sync/session-pins.ts` (pin lists) and
  `useQuotaStore.test.ts`/`.same-origin.test.ts`. Those were then restored to
  `main` for the four that call the canonical `setSessionPinned`/unread
  signatures the fork owns (`session-pins.ts`, `notification-store.ts`,
  `selection-store.ts`, `last-session-restore.ts`) so the lane does not smuggle
  a second pin/unread authority in; the quota, git and test blobs stay
  upstream's.
- **Eviction and queue fixes.** `sync/eviction.ts` already carries upstream's
  grace-window and `hasPendingBlockingRequests` walk unchanged (it is
  byte-identical to upstream), and `messageQueueStore.ts` keeps the fork's
  canonical queue transport, which is the recorded OMP replacement for
  upstream's `SyncEvent`-shaped queue.
- **Erased-module deletions.** The merge resurrected ten fork-deleted
  OpenCode-engine files (`catalogRefresh{,.test}.ts`, `skillSwitch.ts`,
  `session-event-router.ts`, `directory-recovery-snapshots.ts`,
  `location-scoped-forms.ts`, `tool-content-completion.ts`,
  `useInlineCommentDraftStore.callerId.test.ts` and five `sync/__tests__`
  engine suites); they are deleted again, matching `main`.
- **Event translation.** `lib/opencode/events.ts` is the fork's canonical
  replacement for the retired upstream OpenCode event translator; its
  `upstream-deltas.tsv` row names the retiring decision, and the lane's
  replaced translation paths now carry decision rows too.
- **Hydration and reducers.** No hydration or reducer semantics changed: every
  reducer path (`event-reducer.ts`, `materialization.ts`, `bootstrap.ts`,
  `sync-context.tsx`) is the fork's `main` blob unchanged. Task 22 owns the
  cutover.
- **API layer.** `packages/ui/src/api/**` is a standing OMP-boundary exclusion
  (Canonical Client transport) and carried no lane-15 conflict markers.

Ledger: 65 paths in the two directories were `fork-differs` with no reason;
each got a `decision` row in `.workflow/upstream-deltas.tsv` citing
`2026-11-10 - Merge upstream OpenChamber with a real git merge`. One stale
existing row (`packages/web/server/lib/guests/catalog.js`, whose path no longer
differs) was removed because `--check` failed on it.

- **Check after:** `bun scripts/upstream-drift.mjs --markers --lane 15` → `no conflict markers (lane 15)`, exit 0.
- `bun run --cwd packages/ui type-check` → the only reported files are
  `src/App.tsx`, `src/apps/MobileChangesSurface.tsx`,
  `src/apps/MobileConnectionsView.tsx`, `src/apps/MobileProjectEditSurface.tsx`
  — other lanes' unresolved markers, no error in any lane-15 path.
- `bun scripts/upstream-drift.mjs --check -- packages/ui/src/sync packages/ui/src/stores` →
  `drift check passed: no conflict markers, no unexplained path, no contradicting row (base bc50ba5)`, exit 0.
- `bunx oxlint -c oxlint.config.ts packages/ui/src/sync packages/ui/src/stores` → exit 0, no findings.
- `VITEST_MAX_WORKERS=2 bun test packages/ui/src/sync packages/ui/src/stores` →
  688 pass / 144 fail / 103 errors, against a 408/180/136 baseline on the same
  tree before resolution. The remaining failures are the scaffold's other
  unresolved lanes (imports of `@/lib/runtime-switch`, `@/lib/desktop` and other
  marker-bearing modules from lanes 13/14/16/17), not lane-15 files; type-check
  reports nothing in lane paths and the focused lane tests that do not touch a
  marker-bearing module pass.

Blocking note for the landing merge: the scaffold target still carries the
other lanes' markers, so a whole-suite green run is task 19's gate.
