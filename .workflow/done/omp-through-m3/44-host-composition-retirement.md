# 44: Retire the managed OpenCode Host composition

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** e84850460
**Started:** 2026-10-20
**Finished:** 2026-10-21T01:31:17+08:00

**Delivers:** After all reachable UI callers and contract gaps are resolved or intentionally retained outside the M3 target, the Web Host and Electron startup composition no longer registers the managed OpenCode agent lifecycle, proxy, config and auth owners. Canonical `/api/agent/v1` readiness/auth, Host filesystem/Git/PTY/source-control, relay, pairing, notifications, editor and theme capabilities remain available.

**Blocked by:** 41, 42, 43, 14, 16, 22
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/host/`, `packages/web/server/lib/opencode/`, `packages/electron/main.mjs`, package scripts/manifests and owning documentation

**Read first:** Task17; residual caller and mutation contract receipts; desktop-shell, enterprise-boundary and UI API boundary references; Host architecture; Web/Electron READMEs.

**Covers:** W2, W10

**Change:** Remove only composition-root owners whose production callers are gone. Preserve explicit Host routes and capabilities, canonical readiness/auth and required route ordering. Update package staging to the existing Bun Agent Runtime closure. Retain external editor launching and VS Code theme import; do not restore the retired extension runtime.

**Check:** A focused Host/Electron test packet, syntax/type checks for touched source, packaged Agent Runtime preparation/verification, and a real Web startup with canonical readiness and auth boundary. Connected session behavior is consumed by Task36, not fabricated here.

## Progress
Dirty at start: none; prior split receipts and Task55 are already committed in `e84850460`.
Check before: Web/Electron type checks, Electron package tests, Web build, packaged Agent Runtime verification, and live Web readiness/auth passed; the canonical plugin Host packet failed with Agent Service exit 9 and subsequent 503 responses, so the full Task44 Check did not pass.

- [x] Confirm the residual caller inventory and contract decisions are complete. Task42's receipt classifies the remaining callers and Task43 is archived; production searches under `packages/ui/src`, `packages/web/src` and `packages/electron` find no `opencodeClient`, `@opencode/client`, `@opencode/schema` or `lib/opencode/*` import outside tests.
- [x] Remove obsolete composition imports and dead lifecycle/proxy/config/auth registration. `packages/web/server/index.js` registers no OpenCode agent lifecycle/proxy/config/auth owner, and searches for `setupProxy`, `restartOpenCode`, `bootstrapOpenCodeAtStartup`, `startOpenCode`, `createOpenCodeAuthStateRuntime`, `registerConfigEntityRoutes`, `registerOpenCodeRoutes`, `scheduleOpenCodeApiDetection` and `opencode serve` have no production hits. `proxy.js` remains an unmounted test fixture, not a composition owner.
- [x] Preserve Host capability routes, auth/origin/internal-secret boundaries and canonical readiness. The recorded focused Host packet and a fresh isolated Web start on 2026-10-21 observed `/api/agent/v1/ready` 200 (`ready:true`, `engine:omp`, `version:1.0.0`), `/health` 200, unauthenticated `/api/agent/v1/sessions` 401 `UNAUTHORIZED`, and retired `/api/agent` and `/api/command` 404, then stopped cleanly with no Agent Service child left.
- [x] Verify Web/Electron startup and packaged runtime staging. Recorded Electron package tests (`43/43` files), Agent Runtime preparation/verification (`158` packages; readiness above), Web build, Web/Electron type checks, and the current focused process packet are unchanged by the final pidfd correction. The AppImage is intentionally superseded for process cleanup and is Task36/55's rebundle, not this staging proof.
- [x] Update ownership docs and Task17 evidence; keep Task36/18 open until their own receipts exist. `packages/web/README.md` and the development record describe the retired composition; Task36 and Task18 remain open.
- Task17 follow-up: Removed the unreferenced `getAgentSources` and `deleteAgent` exports from `agents.js` after repository-wide caller search. Focused config tests passed 3 files / 56 tests; Web type-check passed. Focused oxlint reports existing findings in unchanged `listDisabledAgents`; workflow validation passed. Full Host retirement, packaged staging, and connected acceptance remain open.

**2026-10-20 split-slice verification:** Task43 is archived and its route/owner comparison is recorded in `.workflow/omp-migration/contracts.md`; Task44 is unblocked. Web type-check passed, Electron syntax/type-check passed, Electron package tests passed `43/43` files, Web build passed, Agent Service rebuild passed, packaged Agent Runtime preparation and verification passed (`158` packages; readiness `ready:true`, `engine:omp`, `version:1.0.0`), and the live Web Host returned readiness `200` plus unauthenticated sessions `401`. The focused supervisor skill-source packet initially exposed stale numeric revision fixtures; after aligning those fixtures with the string `CounterSchema`, it passed `16/16` tests. The canonical plugin Host packet then failed under Vitest because its `bunPath: process.execPath` launched Node, which rejected Bun's `--no-env-file` switch with exit 9; Bun's default 5-second per-test timeout also cancelled three scenarios that require longer. The fixture now explicitly invokes `bun`, all five integration tests have 60-second budgets where needed, and the redundant `PI_CODING_AGENT_DIR` test override was removed because worker composition owns that field. `bun test packages/web/server/lib/host/canonical-plugins.test.js` passed all five tests (96 assertions, 110.59 seconds). The source inventory and ownership review remain open; Task36 and Task18 remain separate gates.

**Review finding and repair:** Security review blocked the first registry repair despite its 32 focused tests and Linux orphan/sibling smoke: identity checks followed by numeric PID/process-group signalling permit reuse between check and signal. The correction signals through a short-lived Bun pidfd helper that opens the kernel handle before checking birth identity. Tree discovery additionally requires the service's inherited per-child ownership token; missing ownership or unavailable pidfd/Bun fails closed. The final focused packet, plugin integration packet (`5/5`, 119.63 seconds), Web type-check, syntax checks and real orphan/token-worker/sibling smoke passed; `.workflow/omp-migration/m3/task44-process-cleanup-2026-10-20.json` owns the exact results and limitations. Final security recheck remains open. AppImage `71f97b41…` predates this correction and needs a final rebundle; its unrelated Task55 auth and Task36 composer observations remain bound to that hash.

**Check after (2026-10-21):** Reused the recorded final-code focused packet and receipt rather than rerunning unchanged checks: 40 process tests across registry/pidfd/supervisor suites, canonical plugin `5/5`, Web type-check, syntax and oxlint evidence in `.workflow/omp-migration/m3/task44-process-cleanup-2026-10-20.json`. Ran one current live Web path after the final pidfd correction because that lifecycle code changed after the earlier split-slice run:

`HOME=<tmp> OPENCHAMBER_DATA_DIR=<tmp>/data XDG_CONFIG_HOME=<tmp>/.config node packages/web/bin/cli.js serve --port 3155 --host 127.0.0.1`

Observed `/api/agent/v1/ready` 200 `{"ready":true,"engine":"omp","version":"1.0.0"}`, `/health` 200, unauthenticated `/api/agent/v1/sessions` 401 `UNAUTHORIZED`, `/api/agent` and `/api/command` 404, and a per-data-directory `managed-processes` registry directory. `cli.js stop -p 3155` stopped the daemon and the supervised Agent Service with no remaining child or listener; the isolated root was removed.

**Review status:** Requirements/quality review found zero findings. The independent security review returned zero blocking findings: no path signals a process the reaper/supervisor does not own, and the pidfd helper receives only PATH plus validated pid/start-ticks/signal. Four nonblocking hardening items are recorded for future cleanup: registry token files use default rather than 0600/0700 modes; `OPENCHAMBER_MANAGED_PROCESS_REGISTRY` is used unresolved and can escape per-dataDir scoping; a record is dropped when live `/proc` metadata is unreadable even if the pid is alive; and pid-only `unregisterManagedProcess` can race a same-pid record from another Host sharing a dataDir. None authorizes a wrong-process signal. The AppImage built before the pidfd correction remains intentionally superseded; Task36/55 own the rebundle and connected Electron evidence.

**Stop condition:** Any remaining production caller or route dependency blocks deletion. Do not leave a compatibility selector or fallback engine to make startup green.
