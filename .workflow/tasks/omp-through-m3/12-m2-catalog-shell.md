# 12: Add catalogs, skills, completion and Guest Shell projections

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** c51efab064ce20378a0b9aed9a00b93556710578
**Started:** 2026-10-12T20:44:40+00:00
**Status:** active
**Dirty at start:** none

**Delivers:** Agent Service commands expose verified OMP model/provider/agent/MCP/skill configuration, stateless text/structured completion and the shell owner established by task 01. Service-owned skill expansion uses the verified SDK builder; a lower-level fixture's slash limitation does not retire product commands.

**Blocked by:** 09
**Files:** `packages/agent-service/src/catalogs/`, `packages/agent-service/src/shell/`, contract fixtures, host proxy routes and tests

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W6; M0 capability/provider/MCP/skills artifacts and tasks 25/26; OMP model registry, AuthStorage, MCP and AsyncJobManager sources; contracts catalogs/completion/shell and MCP/skills apply boundaries
**Covers:** W6

**Check:** `bun test packages/agent-contract/src/catalogs.test.ts packages/agent-contract/src/errors.test.ts packages/agent-contract/src/shell.test.ts packages/agent-contract/src/completion.test.ts` plus a temporary authenticated service scenario → catalog/config writes and reads are scoped/redacted, stateless completion supports cancellation/provider errors, shell start/output/status/stop/reconnect obey ownership and output bounds, and MCP reconnect and OAuth (`start`/`complete`/`cancel`/`disconnect`) are explicit. Record commands and remove temporary smoke code.

- [ ] Project model/provider/auth capability data without returning credentials or SDK objects.
- [ ] Implement retained configuration mutations, agent profiles and stateless text/structured completion, not read-only catalogs or tab-completion stand-ins.
- [ ] Implement retained MCP enable/disable, changed configuration/schema, HTTP/SSE/OAuth and explicit reconnect. Scoped apply/fan-out follows the contract across independent root workers; persistence alone is not applied-runtime success, and partial failure preserves successful siblings.
- [ ] Build and inject the supported skill prompt at the service boundary.
- [ ] Map AsyncJobManager states/output retention to Guest Shell with bounded tails and ownership checks.
- [ ] Keep one failed provider, MCP server or job from erasing unrelated complete results.

## Progress

The committed native catalogs, MCP, skills, stateless completion and Shell modules are restored in `/home/shizuku/Project/ohpichamber-worktrees/m1-integration` on `omp-through-m3/recovery-20261013`, with central committed source/routing, canonical MCP OAuth (`1825227ae` → `be6c8ffcc` → `d748d8daa`), and the explicit 3-owner `@oh-my-pi/pi-coding-agent` `patchedDependencies` delta (`src/sdk.ts` `initialModelRefreshStrategy`, `src/async/job-manager.ts` `BashJobEvent`/`observeBashJobs`, and `src/tools/bash.ts`, keeping the 13 vendored tarballs byte-identical) integrated. The original main tree remains untouched, and both trees retain the identical 276-line `packages/web/server/lib/opencode/shutdown-runtime.test.js` (including the two preserved user tests at lines 226–275) through task17 retirement. Temporary worktree loss did not remove Git commits or user work; historical queue and native Shell receipts were recovered verbatim from the persistent session record into `/home/shizuku/Project/ohpichamber-omp-artifacts/`. M0 evidence remains reusable only for unchanged SDK owners; the patched initial model-refresh fallback and native Bash observation paths still require re-proof in the mandatory M2 canonical HTTP scenarios.

Check before: on restored commit `c4a5c866b` (`/home/shizuku/Project/ohpichamber-omp-artifacts/m212-bootstrap-recovery-receipt.json`), the built service completed the real pinned SDK readiness probe and orderly disposal (HTTP 503 to 200 in 6.5 s, exit 0). After integrating central routing, OAuth and the 3-owner SDK patch (and resolving `@oh-my-pi/pi-coding-agent/sdk` via `Bun.resolveSync` to root `node_modules` after preserving the shadowing package-local copy at `/home/shizuku/Project/ohpichamber-omp-artifacts/m2-sdk-stale-prepared-service-owner`), `packages/agent-service` full lint, 13-package SDK `type-check` and 35-module `build` passed; `packages/agent-contract` build, 63/63 affected OAuth/wire tests (345 expectations), full contract eslint and 4 authored oxlint checks passed; Node production Host import passed with `DisplayPathSchema` (`d61a89f31` / `719b5eca6`); and `bun run --cwd packages/web test server/lib/host/worker-operation-authorizer.test.js` went from 3/10 to 10/10 passed in 406 ms after parser fix `a26cb7d8` (`edb951ccd`). Security review retracted both the private-loopback auth and credential-race claims (0 findings on covered paths; deferred worker/session/policy-not-opened limitation retained). The earlier Bun-invoked catalog attempt failed the entry guard at `/home/shizuku/Project/ohpichamber-omp-artifacts/m212-catalog-original-runtime-failure.json` (`requires-real-node-host`), and the pre-offline Node v24.18.0 runs failed at 15.2 s in readiness (`m2-task10-interaction-nativeoauth-receipt.json`). With `initialModelRefreshStrategy: 'offline'`, the real Node Host interaction run (`/home/shizuku/Project/ohpichamber-omp-artifacts/m2-task10-interaction-offline-bootstrap-receipt.json`, 3.36 s) passed `built-private-service-ready` (`realHostOwner: true`, `exitCode: 0`) and then failed at `phase: "session-bootstrap"` (`providerRequests: 0`, full cleanup), and the instrumented catalog run (`/home/shizuku/Project/ohpichamber-omp-artifacts/m212-catalog-completion-shell-acceptance-receipt.json`) passed `actual-private-capability-negotiation` before failing at `stage: "catalog-crud"` (`GET` `workspace-models-read`, HTTP 503 `SERVICE_UNAVAILABLE`, cause under diagnosis). All acceptance boxes remain open.
