# 13: Replace Web/Electron agent data access with the Canonical Client

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** f5624ac7fb3d902b5f6ed091ad22baeb74ade525
**Started:** 2026-10-14T09:07:39+08:00
**Finished:** 2026-10-14T10:23:51+08:00

**Delivers:** Shared Canonical Client transport, session stream handling, sync core, and root-session controls for Web and Electron data access with cursor bootstrap, reconnect, runtime switching, branch controls, and workspace relocation, without OpenCode-shaped adapters. Full visible session, settings, residual UI migration, and final OpenCode retirement remain downstream tasks.

**Blocked by:** 23
**Files:** `packages/ui/src/`, `packages/web/`, `packages/electron/`, canonical client package and sync documentation/tests
**Covers:** W8

**Check:** Focused native controls suites, the connected Canonical Client/Host/Bun/SDK proof, authored checks, and workflow validation. Full Web/Electron UI checks W7–W10 remain Task 18.

- [x] Implement one transport-facing Canonical Client for Web and Electron consumers.
- [x] Migrate sync context, client helpers, session stores/actions and global state without an OpenCode-shaped adapter.
- [x] Preserve host-owned RuntimeAPIs, runtimeFetch and realtime transport where they are not agent data access.
- [x] Define cursor bootstrap/reconnect and runtime-switch reset behavior in the owning sync module.
- [x] Remove obsolete Task 13-owned sync and client-helper boundaries, leaving remaining old execution client removal to Tasks 16 and 17 after consumer migration.

## Progress

Dirty at start: unavailable (no original dirty-at-start record survived). Dirty at resume: none at `da6eec253` on `omp-through-m3/recovery-20261013`. The task's implementation commits were integrated before closure; the final closure record is separate from downstream caller work.

### Integrated implementation

The integration branch contains the Canonical transport/session/sync series and native controls series, including commits `a02ef8a2228f8721148637ab2ddacb83b41de1e3`, `6efda48df`, `afffdda79`, `eab022c3d`, `c7a07e6b1`, `e5a4c610d`, `793a4f444`, `90e96dc35`, `d22cc58b8`, `b776e51a2`, `5601698fb`, `1dd58aa29`, `71cfc9e24`, `0204db004`, `1d4ac3ac8`, `3ae891c70`, `473d75e95`, and the final native repair commits through `ea408172b`.

### Verified evidence

- Focused current-HEAD check: `bun test packages/agent-service/src/sessions/registry-native.test.ts packages/agent-service/src/worker/session-native.test.ts packages/ui/src/api/canonicalClient-native-controls.test.ts packages/web/server/lib/openchamber-sessions/routes-native-controls.test.js` → 31 tests passed, 170 assertions, 0 failures, 84.31s.
- The integrated native check receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-native-integration-checks-20261014.json` records Agent Service build/typecheck, Host native route/scope checks, sync selection/leaf checks, and authored oxlint passing.
- Connected proof `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-native-controls-proof-receipt.json` passed at `2026-10-14T10:23:51.068Z`: 6 provider requests, 15 assertions, and clean Node Host/service/provider/temporary-data cleanup. It exercised branch selection/restore, cached idempotent admission during pending approval, stale-owner rejection, source/destination native cwd markers, relocation, old-epoch invalidation, cold service/Host reopen, scope revocation, and public path redaction.
- Production module composition passed at `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-production-composition-receipt.json`. Source quality and Host native security reviews passed with no remaining blocking findings.
- `.workflow/bin/workflow validate --no-color` passed across 42 task files before archive editing.

### Repair outcomes

- Fixed native public/private workspace projection so public DTOs do not disclose private bootstrap roots.
- Fixed registry recovery and optional persisted MCP scope reopening.
- Fixed native action-cache semantics: a duplicate accepted command with the same payload returns its cached admission while the original run is pending; a different payload remains an idempotency conflict.
- Fixed UI terminal history cursor behavior and focus detection in the affected test environment.

### Boundaries and handoff

Task 13 owns the transport-facing Canonical Client, session stream handling, sync core, and root-session controls. It does not own full visible Web/Electron UI acceptance or final OpenCode retirement. Task 32 and Task 16 may proceed in parallel; Tasks 14 and 15 consume Task 32's native subagent contract; Task 17 follows Tasks 14–16 and Task 22; Task 18 is the integrated W1–W10 acceptance gate. No broad workspace check is repeated before those callers land.

Task 13 is complete and archived. Remaining M3 work is downstream implementation and integrated acceptance.
