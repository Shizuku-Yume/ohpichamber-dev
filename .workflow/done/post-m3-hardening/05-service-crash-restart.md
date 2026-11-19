# 05: Restart the Agent Service after an unexpected exit

**Effort:** post-m3-hardening
**Task type:** bugfix
**Base commit:** d09f2282952cb68cbab05d6e9bf548356ec51e69
**Started:** 2026-10-23T12:51:45+08:00
**Finished:** 2026-10-23T14:28:00+08:00

**Delivers:** After the Agent Service crashes, the Host restarts it with bounded backoff, health reports each state, and a crash loop ends in a visible failed state.

**Blocked by:** None
**Files:** `packages/web/server/lib/host/agent-service-supervisor.js` (`onExit` at 262-268, `restart` at 319); `packages/web/server/lib/host/agent-runtime.js`; the Runtime Status/health owner

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``AgentServiceReview.md` finding 2; `.workflow/omp-migration/architecture.md` lines 387-392 (restart and backoff); `.agents/skills/sync-state-invariants/SKILL.md`
**Covers:** H4

**Check:** A supervisor regression with a fake spawn: an exit after readiness schedules a restart, repeated exits back off, and the configured limit leaves `phase: failed`. Fails before the change. Real path: `bun run dev`, `kill -9` the Agent Service PID, `/api/agent/v1/ready` returns 200 again within the backoff window, and a new prompt completes.

Root cause at `842a48adc`: `onExit` only marks `phase = 'failed'`; `restart()` has no production caller (only `agent-service-supervisor.skill-source.test.js` calls it), and `agent-runtime.js` calls `service.start()` once.

## Done when

- [x] An unexpected exit after readiness clears stale scopes (as today) and schedules a bounded restart; an explicit `stop()` never restarts.
- [x] Pending approvals and questions from the dead service expire as the contract requires; nothing is replayed.
- [x] The UI shows unavailable while restarting and recovers without a page reload.
- [x] Easier after 04: both edit the spawn path in the same file.

## Progress

Dirty at start: none.

Check before: the pre-change supervisor marked a post-readiness exit `failed` and never restarted; `restart()` had no production caller. The new regression exercises exactly that behaviour and fails without the restart loop.

Check after:
- `bun run --cwd packages/web test -- server/lib/host/agent-service-supervisor.restart.test.js` → 5 pass / 0 fail. Covers restart after readiness, `restarting` during backoff with null pid/port, bounded attempts ending in `failed`, explicit stop during backoff never restarting, and a failed recovery attempt scheduling the next one.
- Full supervisor suite → 5 files / 31 tests pass.
- Real path: `bun run dev`; `kill -9` on the ready service (pid 1131011) produced health `restarting null` for ~1 s, then `starting <new pid>`, then `ready 1131926` within ~2.7 s. A new prompt in the managed Chats workspace then completed with `CLIProxyAPI/deepseek-v4.1-flash`, text `pong`, usage input 8749 / output 4. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-hardening-task04-2026-10-23/restart-smoke.log`.
- Retry budget survives a short ready->crash cycle: attempts reset only after `restartStabilityMs` (60 s) of readiness, or on an explicit start/stop. A crash loop therefore terminates in visible `failed`.
- Pending approvals/questions: `bun test packages/agent-service/src/interaction` → 11 pass / 0 fail (existing restart-expiry/CAS coverage); the supervisor clears scopes and closes the authorization channel before the restart, so old handles cannot be replayed.
- UI unavailable/recovery: `/health` reports `agentService.phase` `restarting`/`starting` (ready=false) and returns to `ready` with a new pid; the existing readiness poll recovers without a reload.
