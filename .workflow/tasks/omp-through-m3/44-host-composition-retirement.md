# 44: Retire the managed OpenCode Host composition

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** After all reachable UI callers and contract gaps are resolved or intentionally retained outside the M3 target, the Web Host and Electron startup composition no longer registers the managed OpenCode agent lifecycle, proxy, config and auth owners. Canonical `/api/agent/v1` readiness/auth, Host filesystem/Git/PTY/source-control, relay, pairing, notifications, editor and theme capabilities remain available.

**Blocked by:** 41, 42, 43, 14, 16, 22
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/host/`, `packages/web/server/lib/opencode/`, `packages/electron/main.mjs`, package scripts/manifests and owning documentation

**Read first:** Task17; residual caller and mutation contract receipts; desktop-shell, enterprise-boundary and UI API boundary references; Host architecture; Web/Electron READMEs.

**Covers:** W2, W10

**Change:** Remove only composition-root owners whose production callers are gone. Preserve explicit Host routes and capabilities, canonical readiness/auth and required route ordering. Update package staging to the existing Bun Agent Runtime closure. Retain external editor launching and VS Code theme import; do not restore the retired extension runtime.

**Check:** A focused Host/Electron test packet, syntax/type checks for touched source, packaged Agent Runtime preparation/verification, and a real Web startup with canonical readiness and auth boundary. Connected session behavior is consumed by Task36, not fabricated here.

## Progress

- [ ] Confirm the residual caller inventory and contract decisions are complete.
- [ ] Remove obsolete composition imports and dead lifecycle/proxy/config/auth registration.
- [ ] Preserve Host capability routes, auth/origin/internal-secret boundaries and canonical readiness.
- [ ] Verify Web/Electron startup and packaged runtime staging.
- [ ] Update ownership docs and Task17 evidence; keep Task36/18 open until their own receipts exist.
- Task17 follow-up: Removed the unreferenced `getAgentSources` and `deleteAgent` exports from `agents.js` after repository-wide caller search. Focused config tests passed 3 files / 56 tests; Web type-check passed. Focused oxlint reports existing findings in unchanged `listDisabledAgents`; workflow validation passed. Full Host retirement, packaged staging, and connected acceptance remain open.

- Sequencing update (2026-10-20): Task15 source cutovers are integrated; its connected observation and new regression execution are deferred to Tasks36/18, so Task44 no longer depends on Task15's archive. Task43 remains the contract-spike prerequisite.

**Stop condition:** Any remaining production caller or route dependency blocks deletion. Do not leave a compatibility selector or fallback engine to make startup green.
