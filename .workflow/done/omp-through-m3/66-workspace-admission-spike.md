# 66: Diagnose failed workspace admission before changing startup retry

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 84b3d4046d4d31f18b0f5c0ff3c050195885f4e6
**Started:** 2026-10-21T04:41:00+08:00
**Finished:** 2026-10-21T04:44:24+08:00

**Question:** Why does the committed `packages/ui/src/sync/first-server-connect.test.ts` case "failed workspace admission never claims readiness and a later real bootstrap can recover" fail at HEAD, and what is the smallest correct change to make that recovery path announce readiness?

**Time box:** One clean-HEAD test run plus one diagnostic trace through `notifyFirstCanonicalBootstrap`/`retryFailedBootstraps`; no implementation.

**Delivers:** Answer to: what exact branch in the startup bootstrap/retry path prevents a rejected workspace admission from being retried far enough to announce the first connection, and what minimal fix should Task 67 build?

**Blocked by:** None
**Files:** `packages/ui/src/sync/first-server-connect.test.ts`, `packages/ui/src/sync/first-server-connect.ts`, `packages/ui/src/sync/child-store.ts`, `packages/ui/src/sync/bootstrap.ts`, `packages/ui/src/sync/retry.ts` (read-only investigation)

**Read first:** `.workflow/specs/omp-through-m3.md` W7, W8; the open finding in `.workflow/done/omp-through-m3/17-m3-host-integration.md` (2026-10-16, `sync/first-server-connect.test.ts`); `.workflow/spike-tasks.md`; `packages/ui/src/sync/first-server-connect.test.ts` around the named case
**Covers:** W7, W8

**Check:** From `packages/ui`, `bun test src/sync/first-server-connect.test.ts` on a clean Base worktree reproduces the named failure; record the exact command, exit code and first assertion/failure output. `## Findings` names the concrete code path and file:line that swallows the retry or prevents the notification, distinguishes the workspace-admission failure from the environment-read retry already implemented in `bootstrap.ts`, and recommends the minimal change with its expected test effect. No source file is modified by this spike.

- [x] Record the clean-Base failing command and exact failure text for the named test; do not run the baseline in the dirty integration tree.
- [x] Trace the rejected admission through `ChildStoreManager` initialization and `retryFailedBootstraps()`: identify whether the failed entry is absent, not requeued, requeued without re-running `resolveWorkspace`, or runs without reaching `notifyFirstCanonicalBootstrap`.
- [x] State whether the cause overlaps the environment-read retry in `bootstrap.ts`/`retry.ts` or is independent of it; do not claim the startup retry fixes this without evidence.
- [x] Recommend the smallest fix and the test that should become green; name any behavior that must remain unchanged (single readiness notification per owner/runtime, no readiness after a non-retryable admission rejection until a real bootstrap succeeds).
- [x] Leave HEAD source unchanged; if any throwaway diagnostic is kept, name it and remove it from the deliverable.

**Starting state:** No user-owned dirty edit in these files; investigate a clean detached worktree at the task Base commit. Do not modify production source in this spike.

## Progress

Dirty at start: none. Work ran in a fresh worktree at `84b3d4046` on branch `omp-through-m3/66-workspace-admission-spike`; the shared integration tree was read only. No source file was modified.

Check before: skipped (`Task type: spike`). Clean-Base evidence:

```
$ cd packages/ui && bun test src/sync/first-server-connect.test.ts
bun test v1.4.2
 5 pass
 0 fail
 13 expect() calls
Ran 5 tests across 1 file. [124.00ms]
exit 0
```

The premise does not reproduce at Base: the named case passes. Dependency/build setup was satisfied from ignored local links (`node_modules`, `packages/ui/node_modules`, workspace `dist/`) copied read-only from the existing base worktree; no tracked file changed (`git status --porcelain` empty).

Check after: same command, exit 0, 5 pass / 0 fail. No throwaway diagnostic remains in the deliverable.

Historical diagnostic (outside the time box' clean-HEAD run, read-only, temporary detached worktree at `7f1cbee54`, removed afterwards): the same command exits 1 with the first failure at `first-server-connect.test.ts:106` —

```
error: expect(received).toEqual(expected)
- ["first-connect-a"]
+ []
Expected - 3  Received + 1
(fail) ... > failed workspace admission never claims readiness and a later real bootstrap can recover
 4 pass
 1 fail
```

`7f1cbee54` (2026-10-16) is the commit that made the suite compilable again and recorded the Task 17 finding. `66fbdec99` (2026-10-20, "refactor(ui): cut retained callers to the canonical client") is an ancestor of Base and adds the missing requeue branches.

Review: no production boundary changed; the two runs above are the whole evidence. No security pass or `flow-verify` boundary applies to a read-only spike record.

## Findings

**Result:** The named test does not fail at Base `84b3d4046`; it passes 5/5. The open Task 17 finding was accurate at `7f1cbee54` (first assertion `first-server-connect.test.ts:106`, received `[]` instead of `['first-connect-a']`) and was already fixed at Base by `66fbdec99`, which is an ancestor of the Base commit.

**Exact cause and owner.** `ChildStoreManager.retryFailedBootstraps()` in `packages/ui/src/sync/child-store.ts` is the swallow point, not `notifyFirstCanonicalBootstrap`. At `7f1cbee54` its failed-state loop only requeued a directory when a non-background demand still existed (`child-store.ts:611-614` there). After the rejected admission the run is current, so `pumpBootstrapQueue`'s `.finally` deletes the manual demand entry (`child-store.ts:857-858` at Base), making `aggregateBootstrapDemand('/repo')` undefined. The old loop then took only `this.staleDirectories.add(directory)` (`child-store.ts:616` there): a marker that waits for a later foreground demand. No demand arrives, so `bootstrapDirectory` is never re-entered and the sessions lane never reaches the `status === "complete"` branch in `sync-context.tsx:319` that calls `notifyFirstCanonicalBootstrap`. The failed entry is **present but not requeued** — it is not requeued-without-`resolveWorkspace`, and it is not a run that fails to notify: a fresh run creates a new `resolved` promise in `bootstrap.ts:59-67`, re-calls `resolveWorkspace`, and on success reaches the notification. The passing retry case confirms this: the spy's `mockResolvedValue` is only seen by a second `resolveWorkspace` call.

The same `66fbdec99` diff also covers the settlement race: `retryFailedBootstraps` now handles `state === "running"` for a workspace-less run by setting `running.rerunRequested`, which `.finally` turns into one forced requeue (`child-store.ts:616-620, 860-862` at Base). Without it, a connection signal arriving after `.catch` recorded `failed` but before `.finally` cleared `runningBootstraps` was dropped. The named test does not exercise that interleaving; the failed-without-demand branch at `child-store.ts:630-634` is what makes it green.

**Overlap with the environment-read retry: none.** `bootstrapDirectory` resolves admission first; models/providers/agents/shell reads run only after `resolved` succeeds. On a rejected admission only the `resolveWorkspace` `retry()` is entered, and `isTransientError` returns `error.problem.retryable` (`retry.ts:28-30`), so the test's non-retryable 400 throws on the first attempt by design. Task 67's dirty startup-retry work (a wider `STARTUP_RETRY` around the four environment reads plus a failed-initialization requeue) is independent: that requeue skips directories whose `bootstrapStates` is `failed`, so it cannot recover a failed admission, and it does not regress the existing admission retry.

**Smallest safe fix:** none remains for Task 67 to add; keep `66fbdec99`'s two branches intact in `retryFailedBootstraps`:
1. `running` + no workspace → `running.rerunRequested = true`;
2. `failed` + no non-background demand + no workspace → `queueBootstrap({ directory, priority: "selected", reason: "server-connected", force: true })`.

Expected test effect: the named case is green at line 106 (observed at Base); the other four cases stay green, and `notifyFirstCanonicalBootstrap` still announces once per owner/runtime via its `WeakMap`. Behavior that must remain unchanged: no listener fires while admission is rejected; complete stores and failed stores that already have a workspace are not requeued from this path (environment failures belong to the initialization lane); a non-retryable rejection keeps failing on the first attempt.

**Recorded in:** this archived task file. No spec, glossary, or decision change: Base behavior is unchanged and no option was chosen. The Task 17 finding is superseded by this answer; Task 67 must read these Findings before touching `retryFailedBootstraps`.

**Result:** Already fixed at Base by `66fbdec99`; test passes 5/5.
**Recommendation:** Task 67 keeps the existing admission-requeue branches and must not fold them into the environment-initialization requeue.
**Recorded in:** `.workflow/done/omp-through-m3/66-workspace-admission-spike.md`
