# 66: Diagnose failed workspace admission before changing startup retry

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** <commit-sha>

**Question:** Why does the committed `packages/ui/src/sync/first-server-connect.test.ts` case "failed workspace admission never claims readiness and a later real bootstrap can recover" fail at HEAD, and what is the smallest correct change to make that recovery path announce readiness?

**Time box:** One clean-HEAD test run plus one diagnostic trace through `notifyFirstCanonicalBootstrap`/`retryFailedBootstraps`; no implementation.

**Delivers:** Answer to: what exact branch in the startup bootstrap/retry path prevents a rejected workspace admission from being retried far enough to announce the first connection, and what minimal fix should Task 67 build?

**Blocked by:** None
**Files:** `packages/ui/src/sync/first-server-connect.test.ts`, `packages/ui/src/sync/first-server-connect.ts`, `packages/ui/src/sync/child-store.ts`, `packages/ui/src/sync/bootstrap.ts`, `packages/ui/src/sync/retry.ts` (read-only investigation)

**Read first:** `.workflow/specs/omp-through-m3.md` W7, W8; the open finding in `.workflow/done/omp-through-m3/17-m3-host-integration.md` (2026-10-16, `sync/first-server-connect.test.ts`); `.workflow/spike-tasks.md`; `packages/ui/src/sync/first-server-connect.test.ts` around the named case
**Covers:** W7, W8

**Check:** From `packages/ui`, `bun test src/sync/first-server-connect.test.ts` on a clean Base worktree reproduces the named failure; record the exact command, exit code and first assertion/failure output. `## Findings` names the concrete code path and file:line that swallows the retry or prevents the notification, distinguishes the workspace-admission failure from the environment-read retry already implemented in `bootstrap.ts`, and recommends the minimal change with its expected test effect. No source file is modified by this spike.

- [ ] Record the clean-Base failing command and exact failure text for the named test; do not run the baseline in the dirty integration tree.
- [ ] Trace the rejected admission through `ChildStoreManager` initialization and `retryFailedBootstraps()`: identify whether the failed entry is absent, not requeued, requeued without re-running `resolveWorkspace`, or runs without reaching `notifyFirstCanonicalBootstrap`.
- [ ] State whether the cause overlaps the environment-read retry in `bootstrap.ts`/`retry.ts` or is independent of it; do not claim the startup retry fixes this without evidence.
- [ ] Recommend the smallest fix and the test that should become green; name any behavior that must remain unchanged (single readiness notification per owner/runtime, no readiness after a non-retryable admission rejection until a real bootstrap succeeds).
- [ ] Leave HEAD source unchanged; if any throwaway diagnostic is kept, name it and remove it from the deliverable.

**Starting state:** No user-owned dirty edit in these files; investigate a clean detached worktree at the task Base commit. Do not modify production source in this spike.
