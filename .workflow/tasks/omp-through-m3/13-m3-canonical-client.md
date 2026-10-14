# 13: Replace Web/Electron agent data access with the Canonical Client

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** f5624ac7fb3d902b5f6ed091ad22baeb74ade525
**Started:** 2026-10-14T09:07:39+08:00
**Status:** active

**Delivers:** Shared Canonical Client transport, session stream handling, and sync core for Web and Electron data access with cursor bootstrap, reconnect, and runtime switching, without OpenCode-shaped adapters; full visible session, settings, and residual UI migration remain in downstream tasks.

**Blocked by:** 23
**Files:** `packages/ui/src/`, `packages/web/`, `packages/electron/`, canonical client package and sync documentation/tests

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W7/W8; UI API and sync-state skills; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; `packages/ui/src/sync/sync-context.tsx`; `packages/ui/src/lib/opencode/client.ts`; contracts and Host Gateway architecture
**Covers:** W8

**Check:** Focused core sync/session-loader/bootstrap/event-reducer/selection tests run in separate `bun test <resolved files>` processes (the runner script accepts a directory only), connected CanonicalClient transport proof, authored oxlint, and core-only typecheck findings → bootstrap/reconnect/runtime switching handles snapshot/cursor and stale responses correctly; fetch failure preserves prior authoritative state. The broad sync runner currently includes leaf consumer/model/token/permission tests owned by Task 14 (`lib/messages/userModelChoice`, `stores/utils/tokenUtils/issue2404/session-leaf-subscriptions`) and Host directory-recovery helper extraction owned by Task 16, which cannot pass before downstream tasks land. Full `node scripts/run-isolated-tests.mjs packages/ui/src/sync` and cross-workspace checks remain mandatory after Tasks 14–17 at Gate 18 (W7–W10 integrated), neither waived nor silently reduced.

- [ ] Implement one transport-facing Canonical Client for Web and Electron consumers.
- [ ] Migrate sync context, client helpers, session stores/actions and global state without an OpenCode-shaped adapter.
- [ ] Preserve host-owned RuntimeAPIs, runtimeFetch and realtime transport where they are not agent data access.
- [ ] Define cursor bootstrap/reconnect and runtime-switch reset behavior in the owning sync module.
- [ ] Remove obsolete Task 13-owned sync and client-helper boundaries, leaving remaining old execution client removal to Tasks 16 and 17 after consumer migration.

## Progress

Dirty at start: unavailable (no original dirty-at-start record survived). Dirty at resume: none at `da6eec253` (integration HEAD on `omp-through-m3/recovery-20261013`). Base commit `f5624ac7fb3d902b5f6ed091ad22baeb74ade525` restored (M2 gate before core migration); started `2026-10-14T09:07:39+08:00`, status active.

### Integrated core commits

The parent integration worktree (`/home/shizuku/Project/ohpichamber-worktrees/m1-integration`, branch `omp-through-m3/recovery-20261013`) contains the following core commits:
- Canonical transport: `a02ef8a2228f8721148637ab2ddacb83b41de1e3` (first transport timestamp `2026-10-14T09:07:39+08:00`).
- Canonical session: `6efda48df`.
- Canonical sync: `afffdda79`.
- Transport/sync follow-up: `eab022c3d` (resolves missing canonical MCP imports, non-OK SSE ProblemDetails, unexpected stream EOF, and workspace dependency).
- Canonical sync compile repairs: `c7a07e6b1` (from `d0df520`, restoring sync compile contracts and missing type exports).
- Transport fixes & SSE lifecycle: `e5a4c610d` (from `0b6fcafaf`, binding canonical transport identities and SSE lifecycle).
- Semantic transport regression tests: `793a4f444` (from `94a793cc7`).
- Host direct-command admission: `90e96dc35` (from `41bcf9f35`, durably admitting direct session commands).
- Native sync test repairs: `d22cc58b8` (from `b5b5101b3`, repairing 9 test suites across DOM mock, loader, and event reducer contracts).
- Host fixture repair: `6686ab640` (from `a17ba65c8`, avoiding asserting private delivery receipt shape).
- Parent composition: `b776e51a2` (integrates `directCommandAdmissionStore` into `packages/web/server/index.js` and updates `canonicalClient.forkSession(snapshot.session, ...)` to use authoritative scoped session objects in `packages/ui/src/sync/session-actions.ts`).
- Sync spy lifecycle follow-up: `5601698fb` (from `6a74f9376`, restoring issue regression spy cleanup).
- Subagent plan amendment: `f84cc6fac` / `da6eec253` (adding Task 32 for native subagent projection and refining M2 receipt phrasing).
- Native controls contract: `1dd58aa29` (from `f824e9674`, defining canonical native branch and relocation controls).
- Native controls SDK service: `71cfc9e24` (from `1ebe84468`, implementing durable native branch controls and session relocation in SDK worker and session registry).
- Native controls Host, client, and UI actions: `0204db004` (from `181392684`, wiring native controls through Host routes, canonical client, and session actions).
- Authored sync lint cleanup: `1d4ac3ac8` (from `2c1d673e7`, clearing authored anti-slop findings in session actions).
- Native fixture admission: `3ae891c70` (wiring durable admission in native control fixture).
- Host authored native lint repairs: `473d75e95` (from `2bd49c047`, repairing authored native control lint findings in Host).

### Observed integration checks and verified receipts

- Standalone check observations & historical baselines:
  - Earlier unchanged transport, client boundary, and 33-file suite baselines are preserved as historical evidence (`m313-canonical-client-proof-receipt.json`, `m313-client-boundary-after-receipt.json`, `m313-focused-core-check-results.json`).
  - Production module composition receipt verified on `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-production-composition-receipt.json`: real Node import of production `packages/web/server/index.js` (isolated `HOME` and data root) exited 0 (`{"probe":"production-module","status":"imported"}`) after fix commit `fbae4eafb`, resolving the prior exit 1 failure observed at HEAD `6d3f9239e` caused by the nonexistent `registerSessionScope` member on `hostAgentRuntime` at line 648 (generic probe message reports missing owners, actual verified cause was `hostAgentRuntime.registerSessionScope` corrected to `agentScopeRuntime.registerSessionScope`). Limits: module construction only, not running listener, visible UI, or SDK worker certification.
  - Review quality and security passes: transport boundary review (`eab..2bf6`) passed quality review (old blocking URLs closed; client backend idempotency outside quality scope). Security pass passed with no findings on transport and durable admission auth binding; corrected real correctness defect at `packages/web/server/index.js:648` (nonexistent `hostAgentRuntime.registerSessionScope` changed to existing `agentScopeRuntime.registerSessionScope` in commit `fbae4eafb`).
  - Workflow validation: `.workflow/bin/workflow validate --no-color` passed across 42 task files.
- Native integration check receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-native-integration-checks-20261014.json`:
  - Package builds & service typecheck passed: `packages/agent-contract` build, `packages/agent-service` build, and `packages/agent-service` typecheck all pass (`bg_38`).
  - Host native controls routes: `packages/web/server/lib/openchamber-sessions/routes-native-controls.test.js` passes 5/0 (`bg_40`).
  - Host native and scope core: `bg_54` passes 9/0 across 2 files.
  - Host authored lint: `bg_55` exits 0 (clean across 3 changed files).
  - Canonical client native controls: `packages/ui/src/api/canonicalClient-native-controls.test.ts` passes 11/0 (16 assertions, `bg_41`).
  - Dedicated worker session native: `packages/agent-service/src/worker/session-native.test.ts` passes 10/0 (85 assertions, `bg_43`).
  - Sync selection boundary: `packages/ui/src/sync/sync-context-selection-boundary.test.tsx` passes 4/0 (11 assertions, `bg_46`).
  - Native leaf subscriptions: `packages/ui/src/sync/native-leaf-subscriptions.test.tsx` passes 3/0 (18 assertions, `bg_47`).
  - Native integration check regressions and pending items:
    - `packages/ui/src/sync/session-actions.test.ts`: 60 pass / 2 fail (output `artifact://2542`, repair owner `RepairNativeActionCache`), invalidating earlier 62/0 observation after native integration.
    - `packages/agent-service/src/sessions/registry-native.test.ts`: 2 pass / 3 fail (output `artifact://2535`, repair owner `ImplementNativeSessionControls` / `RepairNativeRegistryRecovery`), pending source fix.
    - Authored oxlint: failed with 36 findings across 20 paths (`bg_48`, repair owners `ImplementNativeSessionControls`, `RepairNativeActionCache`, `RepairNativeHostLint`; inherited findings attributed to exact Base and retained).
    - Dead-code inventory: nonblocking audit (`bg_50`), 3 unused files, 63 unused exports, 28 unused exported types.
  - Connected native controls proof: `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-native-controls-proof-receipt.json` (`bg_44`): failed setup with 'The Host workspace projection is unavailable' (0 provider requests, 0 assertions); cleanup all true; it is NOT a privacy failure before observation since provider never ran.
  - Public/private-root leak invariant: known source-confirmed private-bootstrap-root disclosure in public worker projection remains blocking, under repair by native owner, with no user transcript path waiver.
- Active Task 13 blockers pending: authored lint fixes, native controls source and proof repairs, and full core A/B review remain pending. No green Task 13 claim is made.

### Active repair worktrees and native controls

- Explicit git worktrees avoid snapshot budget issues without modifying configuration.
- Core production compile repairs (`m313-sync-compile`), native test repairs (`m313-sync-tests`, `m313-test-repair`), fixture updates (`50a7e0f8c` / `bcc3a35d4`), and native session controls source (`1dd58aa29`, `71cfc9e24`, `0204db004`, `1d4ac3ac8`, `3ae891c70`, `473d75e95`) are integrated in parent.
- Active focused repairs underway across delegated workstreams:
  - `ImplementNativeSessionControls`: projection and session privacy repairs, and child `RepairNativeRegistryRecovery` for registry/worker test failures.
  - `RepairNativeActionCache`: archive 2-fail repair, authored client lint, and reviewer native redo / snapshot bypass bugs.
  - `PrepareNativeControlsProof`: Host workspace projection composition for connected native controls proof.
  - Ongoing reviews: core B review (`ReviewM313CoreQuality`) and Host native security review (`ReviewM313NativeSecurity`); full A + worker B/security still required after proof.
- Task 32 plan (`f84cc6fac` / `da6eec253`) is integrated into the workflow; native backend subagent capability remains absent and unverified (`subagents: false`), with no premature true claim.

### Dependency and surface boundaries

- **Task 13 ownership and closure criteria:** Task 13 owns the core transport-facing Canonical Client, session stream handling, sync core, and root-session controls. Task 13 can close once its focused core checks, connected transport proof, and reviews pass. Integrated visible Web/Electron/full UI checks (W7–W10) remain Task 18.
- **Downstream dependency sequence:**
  - Task 32 (native subagent projection and navigation) is blocked by Task 13.
  - Task 16 (utility generation and residual callers) is blocked by Tasks 12 and 13 (independent of Task 32).
  - Tasks 14 (session/composer timeline) and 15 (settings/sidebar hierarchy) are blocked by both Task 13 and Task 32.
  - Task 17 (cutover) is blocked by Tasks 14, 15, 16, and 22.
  - Task 18 (integrated acceptance) is blocked by Tasks 10, 11, 14, 15, 16, 17, and 32.
  - Because Tasks 32 and 16 depend on Task 13, and Tasks 14 and 15 depend on Task 13 and Task 32, requiring Task 13 to remain active until Gate 18 creates a cyclic dependency. Task 13 does not stay active until Gate 18.
- **Future Task 17 lifecycle ownership:** In `packages/web/server/index.js`, lines 1793 and 2614 call `hostAgentRuntime.start()` and `.stop()`, but `agent-runtime` returns `{ service, resolveHostSessionScope, ... }` without `start`/`stop` methods. These calls are currently deferred activation/cutover paths, not Task 13 module construction. Task 17 owns actual startup and lifecycle wiring/repair during cutover; start/stop are not claimed as verified.
- **Surface boundaries:**
  - Web/PWA: active Host transport.
  - Electron main/mini: shares the same canonical client through runtime transport.
  - Hosted/Capacitor mobile: remote Host canonical state, no local service.
  - Guest: separate SDK unchanged.
  - VSCode: retired.

### Next action

Parent integrates active repairs from `ImplementNativeSessionControls` / `RepairNativeRegistryRecovery`, `RepairNativeActionCache`, and `PrepareNativeControlsProof`. Re-verify focused core suites in separate `bun test` processes, authored oxlint, and core-only typecheck. Task 13 closes after its focused core checks, connected native proof, and full core A/B reviews pass, handing off to Task 32 and downstream consumer tasks (Tasks 14, 15, 16); full visible Web/Electron UI checks W7–W10 remain Task 18. Task 13 remains active while authored lint fixes, native controls, and full core A/B review remain pending; checkboxes remain unticked and no archive move occurs.
