# 13: Replace Web/Electron agent data access with the Canonical Client

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** f5624ac7fb3d902b5f6ed091ad22baeb74ade525
**Started:** 2026-10-14T09:07:39+08:00

**Delivers:** Shared Canonical Client transport, session stream handling, and sync core for Web and Electron data access with cursor bootstrap, reconnect, and runtime switching, without OpenCode-shaped adapters; full visible session, settings, and residual UI migration remain in downstream tasks.

**Blocked by:** 23
**Files:** `packages/ui/src/`, `packages/web/`, `packages/electron/`, canonical client package and sync documentation/tests

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W7/W8; UI API and sync-state skills; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; `packages/ui/src/sync/sync-context.tsx`; `packages/ui/src/lib/opencode/client.ts`; contracts and Host Gateway architecture
**Covers:** W8

**Check:** Focused core sync/session-loader/bootstrap/event-reducer/selection tests run in separate `bun test <resolved files>` processes (the runner script accepts a directory only), connected CanonicalClient transport proof, authored oxlint, and core-only typecheck findings → bootstrap/reconnect/runtime switching handles snapshot/cursor and stale responses correctly; fetch failure preserves prior authoritative state. The broad sync runner currently includes leaf consumer/model/token/permission tests owned by Task 14 (`lib/messages/userModelChoice`, `stores/utils/tokenUtils/issue2404/session-leaf-subscriptions`) and Host directory-recovery helper extraction owned by Task 16, which cannot pass before downstream tasks land. Full `node scripts/run-isolated-tests.mjs packages/ui/src/sync` and cross-workspace checks remain mandatory after Tasks 14–17 at Gate 18 (W7–W10 integrated), neither waived nor silently reduced.

- [x] Implement one transport-facing Canonical Client for Web and Electron consumers.
- [x] Migrate sync context, client helpers, session stores/actions and global state without an OpenCode-shaped adapter.
- [x] Preserve host-owned RuntimeAPIs, runtimeFetch and realtime transport where they are not agent data access.
- [x] Define cursor bootstrap/reconnect and runtime-switch reset behavior in the owning sync module.
- [x] Remove obsolete Task 13-owned sync and client-helper boundaries, leaving remaining old execution client removal to Tasks 16 and 17 after consumer migration.

## Progress

Dirty at start: unavailable (no original dirty-at-start record survived). Dirty at resume: none at `da6eec253` (integration HEAD on `omp-through-m3/recovery-20261013`). Base commit `f5624ac7fb3d902b5f6ed091ad22baeb74ade525` restored (M2 gate before core migration); started `2026-10-14T09:07:39+08:00`. Task 13 implementation and root-session controls are now closure-ready; downstream visible UI migration and final OpenCode retirement remain outside this task.

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

- Focused native controls suites passed on current integration HEAD `ea408172b`: `bun test packages/agent-service/src/sessions/registry-native.test.ts packages/agent-service/src/worker/session-native.test.ts packages/ui/src/api/canonicalClient-native-controls.test.ts packages/web/server/lib/openchamber-sessions/routes-native-controls.test.js` → 31 tests passed, 170 assertions, 0 failures, 84.31s.
- Agent Service build and typecheck, Host native route/scope checks, sync selection/leaf checks, and authored oxlint passed in the integrated native check receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-native-integration-checks-20261014.json`. The broad UI type-check remains an inherited/in-migration diagnostic set and is owned by downstream Tasks 14–17, not a Task 13 closure criterion.
- Connected native controls proof passed on current HEAD: `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-native-controls-proof-receipt.json`, observed `2026-10-14T10:23:51.068Z`, 6 provider requests, 15 assertions, clean Node Host/service/provider/temporary-data cleanup. It exercised branch selection/restore, cached idempotent admission while approval was pending, stale-owner rejection, source/destination native cwd markers, relocation, old-epoch invalidation, cold service/Host reopen, scope revocation and public path redaction.
- Source quality and Host native security reviews passed with no remaining blocking findings; the real production module composition proof passed earlier at `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-production-composition-receipt.json`. Full Web/Electron UI and old-client removal remain Task 18/17 acceptance, not this task.
- `.workflow/bin/workflow validate --no-color` passed across 42 task files after the closure record was prepared.

### Repair outcomes

- Fixed native public/private workspace projection so public DTOs do not disclose private bootstrap roots.
- Fixed registry recovery and optional persisted MCP scope reopening.
- Fixed native action-cache semantics: a duplicate accepted command with the same payload returns its cached admission while the original run is pending; a different payload remains an idempotency conflict.
- Fixed UI terminal history cursor behavior and focus detection in the affected test environment.
- Rechecked the focused suites and connected proof after these repairs; no Task 13 blocker remains.

### Dependency and surface boundaries

- **Task 13 ownership:** transport-facing Canonical Client, session stream handling, sync core, and root-session controls are complete. Task 13 does not own full visible Web/Electron UI acceptance or final OpenCode retirement.
- **Downstream sequence:** Task 32 and Task 16 may proceed in parallel. Tasks 14 and 15 consume Task 32's native subagent contract; Task 17 follows Tasks 14–16 and Task 22; Task 18 is the integrated W1–W10 acceptance gate.
- **Surface boundaries:** Web/PWA uses Host transport; Electron shares the canonical client through runtime transport; hosted/Capacitor mobile uses remote Host state; Guest SDK remains separate; VS Code remains retired.


### Closure

Task 13 is complete and ready to archive. Proceed with Task 32 and Task 16 in parallel; Task 14 and Task 15 follow the native subagent contract, then Task 17 and Task 18 complete the M3 cutover and acceptance.
