# 01: Native run lifecycle and SDK consumers

**Effort:** omp19-integration
**Blocked by:** None
**Covers:** W1, W4
**Check:** `bun test src/worker/projection.test.ts src/worker/mode.test.ts src/worker/session-native.test.ts src/supervisor/service-worktree-lease.test.ts --timeout 15000` in packages/agent-service → passes
**Base commit:** a416b13b28

- [x] Use OMP 19 lifecycle authority, including async pause and wake.
- [x] Replace removed SDK imports and seance handling; classify commit.
- [x] Diagnose worker startup and detached-service readiness.

## Progress

Check after: the focused lifecycle, native-session, mode, readiness, settings and policy run passed 206 tests, zero failures. Evidence: `/home/ubuntu/omp19-artifacts/logs/stage2-focused-final2.log`.

Native run activity survives `agent_pause`; native `agent_end` alone settles the run and armed Plan transition. Tests exercise queued prompts, todo changes and a real AsyncJobManager wake.

The Stage 1 worker entrypoint fails on the removed `task/seance` import. A Stage 1 service probe with the real IPC secret handshake announces a port, then emits `Worker initialization failed (WORKER_INIT_FAILED)` and shuts down. `AgentService.start()` requires an actual SDK worker to initialize before setting readiness; failure stops the server. See the authoritative diagnosis in development.md.

Review: skipped — this environment has no reviewer-subagent tool; fresh workflow/security review remains for effort close.
