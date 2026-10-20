# 64: Reopen a healthy live session without re-admitting its worker

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** A reopen request for a healthy, already-live Agent Service session returns that worker's existing runtime transcript without re-admitting the directory, creating a new worker generation, or changing history IDs. Admission remains mandatory for cold or unavailable sessions, and a scope mismatch still returns the existing unauthorized response.

**Blocked by:** None
**Files:** `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/sessions/registry-native.test.ts`, `packages/agent-service/src/supervisor/service.ts`, `packages/agent-service/src/sessions/DOCUMENTATION.md` or the nearest sessions document, focused supervisor route coverage if the harness supports it

**Read first:** `.workflow/specs/omp-through-m3.md` W3, W7, W8; `packages/agent-service/src/sessions/registry.ts`; `packages/agent-service/src/supervisor/service.ts` reopen/admission paths; `packages/agent-service/src/sessions/registry-native.test.ts`
**Covers:** W3, W7, W8

**Check:** `bun test packages/agent-service/src/sessions/registry-native.test.ts` and `bun run --cwd packages/agent-service type-check` pass; `bun run --cwd packages/agent-service lint` is clean for touched files; one real Host/Agent Service reopen of a live session returns the same `workerGeneration`, journal/history content and runtime session, with no admission or generation change. A clean-Base test-only patch must fail before the change, and the same test must pass after it.

- [ ] Reopen a live, opened session through the private reopen route without calling admission; preserve the captured agent-directory/scope comparison and fail closed on any mismatch.
- [ ] Keep cold and journal-`unavailable` sessions on the existing `admit()` + `sessions.reopen()` path with a new worker generation.
- [ ] Preserve the existing unauthorized/scope-rejection response and do not publish history from a previous runtime.
- [ ] Replace the removed raw transcript-byte assertions with parsed journal/history-content equality, or record why raw bytes are not stable; do not silently reduce coverage.
- [ ] Cover healthy reopen, each scope mismatch, missing root, and unavailable-to-cold reopen in `registry-native.test.ts`; add the route-level live-versus-fallback branch test if the supervisor harness can mount it.

**Starting state:** The integration worktree currently has user-owned uncommitted edits in `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/sessions/registry-native.test.ts` and `packages/agent-service/src/supervisor/service.ts` that implement this behavior. Record them as `Dirty at start` in `## Progress`; never stash, restore, clean, discard or blindly stage them. Establish the before result in a clean detached worktree at the task Base commit (apply only test hunks there if needed), then land the behavior through this task's own committed change set, staging only the task's exact paths.
