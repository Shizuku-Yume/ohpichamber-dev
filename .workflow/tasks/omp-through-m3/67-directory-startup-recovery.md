# 67: Recover directory catalogs across Agent Service startup and reconnects

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** When the Agent Service is still starting or briefly unavailable, each directory catalog read (models, providers, agents, background shells) retries within one bounded startup budget, keeps sibling reads independent, and preserves distinct failed/partial/empty states. After the session list completes, failed directory initializations are requeued once and become idempotent on success; a reconnect triggers the same recovery without a page reload. The Task 66 workspace-admission finding is resolved as part of this path.

**Blocked by:** 65, 66
**Files:** `packages/ui/src/sync/bootstrap.ts`, `packages/ui/src/sync/bootstrap.test.ts`, `packages/ui/src/sync/retry.ts`, `packages/ui/src/sync/retry.test.ts`, `packages/ui/src/sync/child-store.ts`, `packages/ui/src/sync/child-store.test.ts`, `packages/ui/src/sync/first-server-connect.test.ts`, `packages/ui/src/sync/DOCUMENTATION.md` (append after Task 65)

**Read first:** `.workflow/specs/omp-through-m3.md` W7, W8, W9, W10; Task 66 `## Findings`; Task 65's landed `DOCUMENTATION.md` change; the open Task 17 finding on `first-server-connect.test.ts`; `packages/ui/src/sync/retry.ts` `STARTUP_RETRY`; `packages/ui/src/sync/bootstrap.ts` environment-read fan-out; `packages/ui/src/sync/child-store.ts` initialization queue
**Covers:** W7, W8, W9, W10

**Check:** From `packages/ui`, `bun test src/sync/bootstrap.test.ts src/sync/child-store.test.ts src/sync/retry.test.ts src/sync/first-server-connect.test.ts` passes, and `bun run --cwd packages/ui type-check` passes. One isolated Web run with Agent Service readiness delayed or returning 503 for more than 20 seconds, followed by one reconnect, loads the canonical directories without a page reload and records the receipt path in `## Progress`.

- [ ] Wrap each environment read in the bounded retry budget with the existing stale-scope guard; keep `Promise.allSettled` sibling isolation and the current `failed`/`partial` status meanings.
- [ ] Requeue failed initializations only when bootstrap state is complete or absent and no matching queue/running entry exists; make a successful retry idempotent and do not duplicate list/session reads.
- [ ] Apply Task 66's recommended minimal fix so a later successful workspace admission can announce the first connection; the named test must pass without weakening the "no readiness after rejection" assertion.
- [ ] Decide and document the behavior for permanent non-retryable environment failures on reconnect (bounded retries only, no endless requeue loop); distinguish retryable 5xx/network failures from non-retryable 4xx.
- [ ] Update `packages/ui/src/sync/DOCUMENTATION.md` (owned by Task 65 first) with the actual attempt budget, environment-initialization requeue, and connection-triggered resume; do not repeat or contradict Task 65's run-control text.
- [ ] Keep the canonical catalogs as the only owner; no OpenCode-shaped fallback or silent empty catalog on failure.

**Starting state:** The integration worktree currently has user-owned uncommitted edits in `packages/ui/src/sync/bootstrap.ts`, `bootstrap.test.ts`, `child-store.ts`, `child-store.test.ts` and `retry.ts`, and `DOCUMENTATION.md` (shared with Task 65). Record them as `Dirty at start` in `## Progress`; never stash, restore, clean, discard or blindly stage them. Run the baseline in a clean detached worktree at the Base commit. Start only after Task 65 has landed so its `DOCUMENTATION.md` change is present; append the startup-recovery text rather than reverting it.
