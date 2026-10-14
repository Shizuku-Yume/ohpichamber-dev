# 17: Integrate Electron, host proxy and final legacy removal

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 3f4afa751888da3e0b6b795ad31534fa6c8a9c6b

**Delivers:** Web and Electron launch paths proxy the same authenticated `/api/agent/v1` boundary, host lifecycle owns Agent Service supervision, and obsolete OpenCode agent integration files/routes/config readers are removed after caller cutover.

**Blocked by:** 14, 15, 16, 22
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/host/`, `packages/electron/main.mjs`, package manifests, runtime/build docs and legacy agent integration paths

**Read first:** `.workflow/specs/omp-through-m3.md` M1/M3/W2/W7/W10; desktop-shell and UI API skills; `packages/web/server/index.js`; `packages/electron/main.mjs`; Electron README; Host architecture and proxy/auth contracts
**Covers:** W2, W7, W10

**Check:** Launch the real Web and Electron entrypoints using their package scripts, with OpenCode absent → both reach `/api/agent/v1`, stream/abort/reopen a session, preserve Host capabilities and clean owned children after stop/restart. Record concrete launch/interaction commands. Run the existing isolated runner for affected Host/Electron tests; reuse this connected run in task 18 if no relevant code changes afterward.

- [ ] Wire Host Gateway supervision and proxying through the existing Web and Electron entrypoints.
- [ ] Preserve external auth, Origin checks, internal secret boundaries and host-owned routes.
- [ ] Remove obsolete lifecycle/proxy/watcher/config/auth integration only after all callers are migrated.
- [ ] Finish the explicit credential handoff before its source disappears, then remove the one-time importer and legacy credential reader at this cutover.
- [ ] Keep external editor launch, theme import and retained host capabilities working.
- [ ] Update module ownership docs and package scripts without adding compatibility adapters.

## Bounded implementation (2026-10-14)

Production startup now launches the existing supervised Bun Agent Service after the Host listener and process handlers are ready. The Host runtime exposes the lifecycle operations its entrypoint and shutdown owner already call (`start`, `stop`, final `close`). Service-only stop drains permission, scheduled-task and queue producers before stopping the event hub and supervisor. Startup failures remain canonical unavailability; no canonical request falls back to OpenCode. The unused OpenCode `watcher.js` and its retired tests were removed; production notification/session fan-out already uses the canonical global event hub.

Surfaces:
- Web/PWA: the Node Host starts the Bun service and serves the existing authenticated `/api/agent/v1` namespace.
- Electron: the same Web startup pipeline runs inside main; the Bun service remains separate. Native privileges, per-window auth and server shutdown remain owned by Electron and the Host.
- Hosted mobile: uses the active remote Host and its authenticated canonical namespace.
- Capacitor mobile: uses the configured remote Host and existing Origin/auth policy; no local Agent Service or credential store is added.

The final retirement checkboxes above remain open. Task 15 migrated Defaults/Archive/retention only; Guest/sidebar/AgentsPage are not complete. Legacy client consumers and settings/config routes still require the OpenCode lifecycle/proxy. Isolated-space archive import still calls the OpenCode session import/remove owner. Credential handoff remains explicit and its source cannot be removed while the owning cutover is incomplete. Host FS/Git/PTY/Guest/editor/theme behavior is intentionally retained. No package selectors, compatibility adapters or fallback engines were introduced.

Implementation checks were not run; the coordinator owns integrated tests, type-check, lint, builds, dead-code and real Web/Electron launch/stream/abort/reopen/shutdown certification. Packaged Bun/Agent Service staging must be completed before packaged Electron can be certified without OpenCode.

## Startup compatibility gate retirement (2026-10-14)

Continues baseline `b064d648a` with one complete lane: remove the App/MobileApp
OpenCode gate and page-load compatibility prefetch, the UI compatibility client,
the Electron preflight-reuse IPC/helper, the Host compatibility/install-v2 routes,
and the one-time v1 CLI installer and obsolete tests/locale strings. The existing
canonical bootstrap, authentication and connection-recovery owners remain; no
replacement version gate or engine adapter is added. Backend lifecycle version
validation is deliberately retained only because legacy callers remain.

Surface decisions:
- Web/PWA: mounts the canonical client without an OpenCode version request or
  install/reconnect overlay; existing auth/bootstrap handles availability.
- Electron: same shared startup; no native OpenCode compatibility IPC. The Node
  Host stays in-process, supervising the separate Bun Agent Service.
- Hosted mobile: same canonical startup against its selected authenticated Host.
- Capacitor: always mounts connection selection/content, including with no
  endpoint; selected remote Host availability uses existing connection recovery.

The authenticated `/api/agent/v1` proxy, Origin checks, external auth and internal
secret checks are unchanged. FS/Git/PTY/Guest/editor/theme capabilities and Task 15
agent/settings files are untouched. Package scripts were inspected: Electron's
`package` still stages `resources/opencode-cli` with its prepare/verify helpers,
while Agent Service build emits external-package Bun entries. Removing those
scripts now would break retained legacy startup and would not stage the Bun
runtime, worker entry or native SDK dependencies. Packaged Agent Service staging
therefore remains an explicit blocker, not a claimed cutover.

Remaining blockers: legacy Guest/sidebar/AgentsPage and settings/config clients;
OpenCode upgrade controls; lifecycle/proxy/config/auth owners and credential
handoff/importer source; isolated-space OpenCode archive import; Web CLI
`checkOpenCodeCLI` still rejects `serve` without the inherited binary and startup
still calls `bootstrapOpenCodeAtStartup`; packaged Bun, worker and native SDK
staging; final Web/Electron OpenCode-absent acceptance and Task 18. No implementation
checks ran. Coordinator owns focused suites, type-check/lint/build/dead-code and
real HMR/bundled Web/Electron acceptance.

Independent source review (`ContinueTask17Cutover.ReviewGateRetirement`) passed
with no blocking findings after correcting its initial wrong-tree findings.
The reviewer confirmed unchanged auth/Origin/internal-secret boundaries and
intentional retained lifecycle version validation. Its unused compatibility and
installer dependency pass-through observation was removed from
`feature-routes-runtime.js`. Generated bundles are not tracked in this worktree;
coordinator rebuild/acceptance remains unperformed rather than silently claimed.

## Production startup cutover (2026-10-14)

Continues `374ab4a23` with canonical-only automatic agent startup. The shared
production pipeline no longer invokes `bootstrapOpenCodeAtStartup` or schedules
legacy API detection. The unused entrypoint bootstrap/health-monitor wrappers,
interval constant and network detection no-op are removed. Terminal, dictation,
message-stream, proxy/static route registration and listener/tunnel startup stay
in place. Git credential-helper publication still precedes process handlers and
Agent Service startup. The existing supervisor validates its private
`/api/agent/v1/ready` response with the internal secret before admitting requests;
the canonical gateway returns unavailable until that real owner is ready.

Web CLI `serve` no longer discovers/requires an OpenCode executable, writes
`OPENCODE_BINARY`, or translates the legacy skip-start variable into daemon
settings. Foreground remains in-process; daemon runtime selection, port/exposure
policy, auth, log/PID/instance handling and listener-ready IPC remain unchanged.
Startup-service generation no longer discovers a binary or overrides the existing
injected-environment filter to persist it. User-authored environment snapshots
otherwise retain their existing semantics. The now-unused executable helper is
deleted. CLI help no longer advertises an OpenCode startup engine.

Surface decisions:
- Web/PWA: production Node Host listener and retained services start without an
  OpenCode prerequisite; only the Bun Agent Service starts automatically.
- Electron: identical pipeline inside main, no added Host sidecar or native IPC;
  separate supervised Bun Agent Service is the only automatic agent process.
- Hosted mobile: its selected remote Host uses this same startup behavior.
- Capacitor: no local startup process; remote Host behavior changes as above,
  with unchanged Origin/auth policy and connection selection/recovery.

This supersedes the Web CLI prerequisite and production-bootstrap blockers listed
in the preceding lane. Remaining blockers are explicit legacy lifecycle/reload,
proxy/config/auth/credential import and upgrade consumers; Guest/sidebar/agent and
settings UI migrations; isolated-space OpenCode archive import; Electron staging
of Bun/service/worker/native dependencies; final Web/Electron OpenCode-absent
acceptance and Task 18. Legacy status fields/health routes still describe their
unmigrated owner, not canonical readiness. Removing automatic startup does not
claim those legacy operations work without their engine or complete Task 17.

Startup-order and injected-credential-environment regressions were updated, not
executed. No implementation checks ran; coordinator owns the focused suites,
type-check/lint/build/dead-code and real Web/Electron acceptance after landing.

Discovery also records retained Electron SSH remote-management prerequisites:
`ssh-manager.mjs` still requires remote OpenCode, and the dev launcher still
advises OpenCode CLI staging. These are separate retirement lanes from local
production startup. The embedded controller's unused `isReady` and managed
preflight exposure still describe legacy state; canonical readiness remains
`/api/agent/v1/ready`. Unused startup/feature readiness dependency pass-throughs
and comments implying automatic legacy bootstrap were removed in this lane.

## Current integrated verification (2026-10-15)

The production cutover is integrated through `a76afadc6`, `3ea7b1e1d`, `9b4477362`, `de59dda11`, and `3f4afa751`. Host startup tests pass `4`; Electron package tests pass `43/43` files and Electron syntax type-check passes. The UI OpenCode startup gate and its sole session-action wait are now removed. Workflow/docs validation passes. Full Web acceptance remains open: retained OpenCode proxy/worktree readiness tests fail `11` targeted cases (`20` pass) on expected `503` behavior, and credential handoff/importer, isolated-space archive, packaged Bun/worker/native SDK staging, upgrade controls and remaining legacy lifecycle/config callers are not cut over. Task 17 remains active until those owners and the W7/W10 OpenCode-absent Web/Electron proof are complete.
