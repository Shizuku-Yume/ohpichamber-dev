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

**Check:** `bun test packages/agent-service/src/catalogs packages/agent-service/src/shell` plus a temporary authenticated service scenario → catalog/config writes and reads are scoped/redacted, stateless completion supports cancellation/provider errors, shell start/output/status/stop/reconnect obey ownership and output bounds, and MCP reconnect is explicit. Record commands and remove temporary smoke code.

- [ ] Project model/provider/auth capability data without returning credentials or SDK objects.
- [ ] Implement retained configuration mutations, agent profiles and stateless text/structured completion, not read-only catalogs or tab-completion stand-ins.
- [ ] Implement retained MCP enable/disable, changed configuration/schema, HTTP/SSE/OAuth and explicit reconnect. Scoped apply/fan-out follows the contract across independent root workers; persistence alone is not applied-runtime success, and partial failure preserves successful siblings.
- [ ] Build and inject the supported skill prompt at the service boundary.
- [ ] Map AsyncJobManager states/output retention to Guest Shell with bounded tails and ownership checks.
- [ ] Keep one failed provider, MCP server or job from erasing unrelated complete results.

## Progress

The committed native catalogs, MCP, skills, stateless completion and Shell modules are restored in `/home/shizuku/Project/ohpichamber-worktrees/m1-integration` on `omp-through-m3/recovery-20261013`, with central committed source/routing and the native `AsyncJobManager` observer (`observeBashJobs` via the explicit source-tracked `@oh-my-pi/pi-coding-agent` `patchedDependencies` delta, keeping the 13 vendored tarballs byte-identical) now integrated. The original main tree remains untouched, and both trees retain the identical 276-line `packages/web/server/lib/opencode/shutdown-runtime.test.js` (including the two preserved user tests at lines 226–275) through task17 retirement. Temporary worktree loss did not remove Git commits or user work; historical queue and native Shell receipts were recovered verbatim from the persistent session record into `/home/shizuku/Project/ohpichamber-omp-artifacts/`. M0 evidence remains reusable only for unchanged SDK owners; the patched native Bash observation path still requires re-proof in the mandatory M2 canonical HTTP scenario.

Check before: on restored commit `c4a5c866b` (`/home/shizuku/Project/ohpichamber-omp-artifacts/m212-bootstrap-recovery-receipt.json`), the built service completed the real pinned SDK readiness probe and orderly disposal (HTTP 503 to 200 in 6.5 s, exit 0). After integrating the central routing and native observer changes, `packages/agent-service` `type-check` (preparing 13 SDK packages) and `build` passed, `bun install --frozen-lockfile --ignore-scripts` reported no changes, Node production Host import passed after replacing `RuntimeSessionSchema.pick` on a refined schema with `DisplayPathSchema` (`d61a89f31` / `719b5eca6`), and `bun run --cwd packages/web test server/lib/host/worker-operation-authorizer.test.js` went from 3 passed / 7 failed (`INVALID_URL` 400 vs 503) to 10/10 passed in 406 ms after parser fix `a26cb7d8` (`edb951ccd`). Six authored `oxlint` violations remain in `worker-operation-authorizer.js` (HostPolicy owner), the canonical MCP OAuth seam and other lint fixes remain in flight, and the actual catalog/Shell and native interaction proof runs still fail at 15.2 s in startup readiness (`exitCode: 1`, `providerRequests: 0`, cleaned fixtures; under `NativeBootstrapRecovery` investigation without widening the deadline). All acceptance boxes remain open.
