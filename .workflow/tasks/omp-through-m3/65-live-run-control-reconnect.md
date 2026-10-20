# 65: Preserve live run control across in-flight snapshots and reconnects

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** A snapshot requested before a run acknowledgement can no longer erase a live run's Stop/abort control, and a disconnected Web/Electron client resumes startup recovery and stream recovery automatically on reconnect. The committed Task 62 snapshot-race regression passes at HEAD after the change, Stop remains available through the in-flight window, and abort still reaches the active run.

**Blocked by:** None
**Files:** `packages/ui/src/sync/session-message-loader.ts`, `packages/ui/src/sync/sync-context.tsx`, `packages/ui/src/sync/DOCUMENTATION.md`, `packages/ui/src/sync/run-control-snapshot-race.test.ts` (verify, do not rewrite), focused sync tests for reconnect subscription, `.workflow/omp-migration/m3/task36-recovery-guest-2026-10-20.json` (retain as Task 36 evidence, not as this task's result)

**Read first:** `.workflow/specs/omp-through-m3.md` W7, W8, W10; `packages/ui/src/sync/run-control-snapshot-race.test.ts`; `packages/ui/src/sync/session-message-loader.ts` snapshot install path; `packages/ui/src/sync/sync-context.tsx` connection/resume path; `packages/ui/src/sync/DOCUMENTATION.md` run-control invariants
**Covers:** W7, W8, W10

**Check:** From `packages/ui`, `bun test src/sync/run-control-snapshot-race.test.ts src/sync/session-message-loader.test.ts src/sync/message-ordering.test.ts` passes; `bun run --cwd packages/ui type-check` and `bun run --cwd packages/ui build` pass; one live Web run interrupted by a reconnect keeps Stop visible until the run settles and abort succeeds. The committed race test fails at clean HEAD before the change.

- [ ] Treat a snapshot as non-authoritative for run control only in the exact in-flight case: response requested before the run acknowledgement (`sessionEventRevision` greater than the requested revision), same epoch, snapshot head not newer than the previous head, snapshot `activeRunId` null, previous `activeRunId` non-null. Every other snapshot remains authoritative.
- [ ] Do not resurrect a run after it actually settled, after an epoch/runtime switch, or when the snapshot is genuinely newer; preserve stale-runtime rejection.
- [ ] On `useConfigStore` `isConnected` false-to-true, resume startup recovery, failed-bootstrap retry and stream restart once; remove the subscription on cleanup and do not resume after unmount or runtime replacement.
- [ ] Add a focused test for the reconnect-resume subscription (call count and unsubscribe) or record connected evidence with the exact observed resume; the race test alone does not prove the subscription.
- [ ] Update `packages/ui/src/sync/DOCUMENTATION.md` to state the in-flight-snapshot exception and the connection-triggered resume signal; keep the Task 62 invariants that remain true.
- [ ] Commit the untracked Task 36 recovery receipt verbatim only after validating its JSON and confirming it is cited by the tracked Task 36 acceptance record; do not present it as this task's evidence.

**Starting state:** The integration worktree currently has user-owned uncommitted edits in `packages/ui/src/sync/session-message-loader.ts`, `packages/ui/src/sync/sync-context.tsx` and `packages/ui/src/sync/DOCUMENTATION.md`, plus the untracked Task 36 receipt. Record them as `Dirty at start` in `## Progress`; never stash, restore, clean, discard or blindly stage them. The committed `run-control-snapshot-race.test.ts` is red at clean HEAD; capture that failure in a clean detached worktree, then land this behavior through the task's own change set, staging only the task's exact paths.
