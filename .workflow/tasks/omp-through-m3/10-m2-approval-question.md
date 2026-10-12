# 10: Implement approval and question CAS across restarts

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** c51efab064ce20378a0b9aed9a00b93556710578
**Started:** 2026-10-13T00:00:00Z
**Status:** active
**Dirty at start:** none

**Delivers:** Approvals and questions are service-owned pending records with authenticated answer/cancel operations, compare-and-set versions, timeout/expiry handling and restart invalidation.

**Blocked by:** 09
**Files:** `packages/agent-service/src/interaction/`, host proxy routes, contract tests and service tests

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W4; contracts approval/question sections; OMP interaction APIs; architecture trust, worker and restart rules
**Covers:** W4

**Check:** `bun test packages/agent-service/src/interaction` plus one real pending request through the disposable Host/service boundary → exactly one concurrent answer wins; stale versions do not mutate state; cancel/expiry are terminal; restart invalidates old handles. Keep the consumer-visible race/restart regression, not mock forwarding assertions.

- [ ] Project OMP approval/question requests into service-owned records with stable IDs and versions.
- [ ] Enforce CAS atomically at the service boundary, not in UI state or OMP UI helpers.
- [ ] Distinguish answer, cancel, expiry, worker failure and restart invalidation.
- [ ] Prevent cross-session answer/cancel access through authenticated scope checks.
- [ ] Emit state transitions through the session event cursor.

## Source implementation

The native public factory enables concrete interactive prompts before prompt admission. Typed tool-call and approval observers retain execution inputs and native choice labels; the native extension initializer and builtin tool UI context share the worker Promise bridge. Question IDs, option membership, single/multi constraints and custom input are validated before a native handle is consumed.

The service owns pending records, epoch/generation/version CAS reservations, timeout/abort/restart invalidation, and journal/snapshot projection. Private authenticated answer/cancel/list routes use the Canonical contract. Node-supervisor child IPC loads and commits exact-target policies through Host-owned SQLite after authorizing captured root/project/workspace bootstrap scope; failed persistence leaves pending requests unchanged. Production public authorization remains task22.

Source is ready for Main integration; no build, lint, test, formatter or runtime probe was run in this branch. The acceptance boxes remain open until Main exercises the task Check, including actual native approval/question requests, policy durability and competing replies.

