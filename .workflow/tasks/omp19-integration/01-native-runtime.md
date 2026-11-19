# 01: Native run lifecycle and SDK consumers

**Effort:** omp19-integration
**Blocked by:** None
**Covers:** W1, W4
**Check:** `bun test src/worker/projection.test.ts src/worker/mode.test.ts src/worker/session-native.test.ts src/service-worktree-lease.test.ts --timeout 15000` in packages/agent-service → passes

- [ ] Use OMP 19 lifecycle authority, including async pause and wake.
- [ ] Replace removed SDK imports and seance handling; classify commit.
- [ ] Diagnose worker startup and detached-service readiness.

## Progress

Stage 1 recorded 15 type errors and 70 failed tests. Implement on devin/1795118904-omp-19; preserve the vendor pin.
