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

The native public factory enables concrete interactive prompts before prompt admission. `WorkerInteraction` initializes the native `pi-tui` theme synchronously (`ensureThemeSync`) so builtin `ask` formatting can access `ui.theme`, while typed tool-call and approval observers retain execution inputs and native choice labels, and the native extension initializer and builtin tool UI context share the worker Promise bridge (`c70ca29a7`, `332ebf271`). Question IDs, option membership, single/multi constraints, single-choice mutual exclusion between `selectedOptions` and `customInput`, and custom input are validated before a native handle is consumed.

The service owns pending records, epoch/generation/version CAS reservations, timeout/abort/restart invalidation, and journal/snapshot projection. Private authenticated answer/cancel/list routes use the Canonical contract, checking expired/stale owner identity (`410`) before CAS (`409` with `{ expectedVersion, actualVersion, currentRecord }`, `3b1a914c4`). Node-supervisor child IPC loads and commits exact-target policies through Host-owned SQLite after authorizing captured root/project/workspace bootstrap scope; failed persistence leaves pending requests unchanged. Production public authorization remains task22.

Verification on integrated source `c31546428` (docs `519480671`): `bun test packages/agent-service/src/interaction` passed 8/8 tests (0 failures, 26 `expect()` calls in 67 ms), covering concurrent CAS, cross-session denial, terminal question cancellation, worker generation expiry (`410`), restart during policy persistence, stale-owner-before-CAS precedence, and the short timer-callback expiry edge; `packages/agent-service` 13-package SDK `type-check`, `oxlint` (`lint`) and 35-module `build` from `c31546428` passed unchanged and were reused without package rechecks. The earlier `m2-task10-interaction-diagnostics-fixed-receipt.json` `NATIVE_ASK_ANSWER_NOT_OBSERVED_BY_PROVIDER` omission marker was caused by the disposable acceptance fixture configuring `contextWindow: 4096` (smaller than builtin prompt/tool overhead, causing native rescue compaction to elide tool results), not a production `ask` defect; disposable fixture commit `02bf587a` set `contextWindow: 65536` and added explicit canonical `/internal/sessions` reopen after direct `/internal/workers/:rootSessionId/restart`, with no production `ask` code change. The connected acceptance run (`OHPICHAMBER_ROOT=/home/shizuku/Project/ohpichamber-worktrees/m1-integration OHPICHAMBER_ARTIFACTS=/home/shizuku/Project/ohpichamber-omp-artifacts OHPICHAMBER_M2_RECEIPT=/home/shizuku/Project/ohpichamber-omp-artifacts/m2-task10-interaction-context-budget-fixed-receipt.json node /home/shizuku/Project/ohpichamber-worktrees/m2-acceptance/scripts/.m210-interaction-acceptance.mjs`) passed in 18.40 s (`/home/shizuku/Project/ohpichamber-omp-artifacts/m2-task10-interaction-context-budget-fixed-receipt.json`, `status: "passed"`, `providerRequests: 11`, `nativeToolCallsEmitted: 6`, `distinctNativeToolResults: 5`, `providerRejections: []`, two clean service exits with code `0`, and all `cleanup` flags `true`), verifying `built-private-service-ready` (`realHostOwner: true`), `approval-cas-reconnect` (`winners: 1`, `conflicts: 1`, `staleVersionStatus: 409`, `crossSessionStatus: 404`, `nativeExecutionCount: 1`, `requestedAndResolvedEvents: true`, `snapshotRecovery: true`), `native-ask-question` (`canonicalQuestion: true`, `concurrentWinners: 1`, `nativeAnswerObserved: true`, with the provider receiving and retaining the exact native tool result `User selected: first`, `exactAskSingleSelected: true`, `hasOmissionMarker: false`, `includesKnownChoice: true`), `worker-restart-expiry` (`oldReplyStatus: 410`, `oldActionExecutionCount: 0`, `snapshotCollectiveExpiry: true`), `session-always-allow-durability` (`actualNativeExecutions: 2`, `reopenedWorkerUsesCommittedPolicy: true`), and `workspace-always-deny-durability` (`sqliteColdReopen: true`, `newSessionNativeAttempt: true`, `deniedExecutionCount: 0`). No five-minute live timer wait was run (`focused-permanent-edges` is `reference-only-not-run`, backed by `manager.ts:expirePending` and the 8 permanent unit tests), and this private Host-supervisor/service run does not prove public Host authentication/route activation (`task22`) or general OS sandbox/tool-target parser coverage. Task10 remains `active` with all acceptance boxes open pending independent requirements, quality and security reviews.

