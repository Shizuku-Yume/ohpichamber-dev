# 70: Cancel a live run promptly and keep it cancelled

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** A Stop/abort for a live run accepted by `POST /api/openchamber/sessions/:sessionId/control` resolves as `cancelled` with the same `runId` before the run's natural completion, and the run and its turn settle once as `cancelled` — with no later `completed` reply and no stale Stop control. An unknown or already-settled `runId` still returns `RUN_NOT_FOUND`, and non-abort control operations remain rejected. The change is the ordering fix Task 69 identifies, not a generic retry or timeout. Task 65 keeps its existing live run-control Check and re-runs its live abort proof after this task.

**Blocked by:** 69
**Files:** the exact owners Task 69 names, expected among `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/worker/session.ts`, `packages/agent-service/src/worker/projection.ts`, `packages/agent-service/src/supervisor/service.ts`, `packages/web/server/lib/openchamber-sessions/routes.js`; focused tests in `packages/agent-service/src/sessions/registry-native.test.ts`, `packages/agent-service/src/worker/session-native.test.ts`, `packages/agent-service/src/worker/projection.test.ts`, `packages/web/server/lib/openchamber-sessions/routes-native-controls.test.js`, plus the contract test Task 69 names

**Read first:** Task 69 `## Findings`; Task 65 `## Progress` "Abort investigation (final, bounded probes)" and its unchanged Check; `.workflow/specs/omp-through-m3.md` W7, W8; `packages/web/server/lib/openchamber-sessions/routes.js` `request`, `scopeFor` and `control`; `packages/agent-service/src/sessions/registry.ts` `abort`; `packages/agent-service/src/worker/session.ts` `case 'abort'` and `case 'prompt'`; `packages/agent-service/src/worker/projection.ts` `finish`/`cancelRun`/`completeRun`; `packages/agent-service/src/projection/journal.ts` run settlement
**Covers:** W7, W8

**Check:** The focused reproduction Task 69 names fails at the Task 70 Base commit and passes after the change. From `packages/agent-service`, `bun test src/sessions/registry-native.test.ts src/worker/session-native.test.ts src/worker/projection.test.ts` passes; from `packages/web`, `bunx vitest run lib/openchamber-sessions/routes-native-controls.test.js` passes; `bun run --cwd packages/agent-service type-check` and `bun run --cwd packages/web type-check` pass. One real Web run stopped while streaming ends `cancelled` with the same `runId`, `activeRun: null`, Stop absent, and no later `completed` for that run; the receipt path is recorded in `## Progress`.

- [ ] Reproduce the Task 69 cause at Base through the real hop (Host control route → Agent Service registry → worker → projection), not through a mock that skips the ordering under test.
- [ ] Make a live-run abort return the terminal run with `status: "cancelled"` and the same `runId`; record the measured elapsed time and compare it with Task 69's measurement instead of adding a timeout or retry.
- [ ] Settle the run and its turn exactly once as `cancelled`; a late natural completion or a late prompt/abort reply must not overwrite that state, emit a second terminal event, or leave Stop bound to a settled run.
- [ ] Preserve `RUN_NOT_FOUND` when the `runId` is not the live run for that session (including after natural completion), keep `RUN_ACTIVE` for conflicting prompts, reject unsupported control operations with `400`, and keep Host scope, auth and deleted-space refusals unchanged.
- [ ] Run the focused contract, Host route, Agent Service registry and worker tests plus both package type-checks; record exact commands and results in `## Progress`.
- [ ] Run one real Web streaming turn, interrupt it with Stop, and record the control status/body, the same `runId`, the native terminal run/turn status, `activeRun: null`, and the absence of a later `completed` for that run.
- [ ] No generic retry, timeout, adapter or fallback; if Task 69 shows the cause needs a different owner, update this task's `Files` from the Findings rather than widening the change.
