# 69: Trace live run abort latency and terminal-status ordering

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** <commit-sha>

**Question:** Why does a control abort for a live run sometimes return `200` with `run.status: "cancelled"` after about 13 seconds, sometimes return `404 RUN_NOT_FOUND` after the run already settled, and sometimes not reply within 60 seconds — and why does the interrupted turn settle as `completed` instead of `cancelled` with the same `runId`? Which hop introduces the delay or the stale decision: the Host control route and `scopeFor`, the supervisor fetch, the Agent Service registry `activeRunId` check, worker dispatch and abort handling, or event projection and turn finalization? What is the smallest ordering fix?

**Time box:** One already-warm worker/session, one 30-second fixture run, one abort control `POST` for that run; a control-only HTTP probe, no browser; source trace only. No implementation.

**Delivers:** Answer to: the exact abort latency/ordering cause, the native run and turn terminal status for a live interrupted run, and the smallest fix plus the focused test Task 70 must make pass.

**Blocked by:** None
**Files:** read-only investigation of `packages/web/server/lib/openchamber-sessions/routes.js`, `packages/web/server/lib/host/agent-service-supervisor.js`, `packages/web/server/lib/host/agent-runtime.js`, `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/supervisor/service.ts`, `packages/agent-service/src/supervisor/workers.ts`, `packages/agent-service/src/worker/session.ts`, `packages/agent-service/src/worker/projection.ts`, `packages/agent-service/src/projection/journal.ts`; a throwaway probe under `/tmp`; no production edit

**Read first:** Task 65 `## Progress` "Abort investigation (final, bounded probes)" and its handoff; `.workflow/specs/omp-through-m3.md` W7, W8; `packages/web/server/lib/openchamber-sessions/routes.js` `request` (line 74), `scopeFor` (line 80), `control` (line 365) and the control route (line 469); `packages/agent-service/src/sessions/registry.ts` `runtime`, `abort` (line 706) and `prompt`; `packages/agent-service/src/worker/session.ts` `case 'prompt'` and `case 'abort'`; `packages/agent-service/src/worker/projection.ts` `finish`/`cancelRun`/`completeRun` and the `agent_end` branch; `packages/agent-service/src/projection/journal.ts` `run.started`/`run.cancelled`/`settleRun`; `packages/web/server/lib/openchamber-sessions/routes-native-controls.test.js`

**Check:** The bounded probe plus source trace answer the Question with evidence: `## Findings` records the control `POST` status and response body, elapsed time at each hop, the live `runId`, and the native run/turn terminal status from a snapshot or history read. Findings name the file:line where the delay or ordering decision occurs, the smallest fix, and the focused test that should fail at Base and pass after Task 70. No production source is modified.

- [ ] Start from a warm worker (avoid the slow first session create) and create one 30-second fixture run; record the warm-up evidence and the exact `runId` before aborting.
- [ ] Timestamp the abort at each hop: Host route entry after `scopeFor`, supervisor fetch dispatch and response, Agent Service route entry, `registry.abort` `activeRunId` comparison, `workers.request` dispatch, worker `case 'abort'` start, `session.abort()` completion, `promptTask` settlement, projection terminal event, and native snapshot/history availability. Record where elapsed time accumulates.
- [ ] Record `POST /api/openchamber/sessions/:sessionId/control` status and body and the native run/turn terminal status with the same `runId`; distinguish `cancelled` from natural `completed`, and state whether the 404 and no-reply observations are late delivery, a stale registry binding, or a race with natural completion.
- [ ] Trace how an abort can end with a `completed` turn: `projection.cancelRun` versus `completeRun`, the `agent_end` `stopReason` branch, the `promptTask` `.then`/`.catch`, and `finish()` nulling `this.run`; name the branch where natural completion or a late reply can win, and whether the response can acknowledge one status while the turn records another.
- [ ] Recommend the smallest fix and the focused contract/route/service/worker test that should fail at Base and pass after Task 70; state behavior that must remain (unknown/already-settled `runId` still `RUN_NOT_FOUND`, non-abort control rejected, Host scope/auth checks unchanged).
- [ ] Leave production source unchanged; name and remove any throwaway probe artifact.

## Findings

<Filled in after the spike>
