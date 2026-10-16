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

Production cutover baseline remains integrated through `a76afadc6`, `3ea7b1e1d`, `9b4477362`, `de59dda11`, and `3f4afa751`, with the Web repair packet committed as `e1b4b7d62`. Host startup tests pass; Electron package tests pass 43/43 files; Electron syntax type-check passes; the UI OpenCode startup gate is removed; and the full Web Vitest suite passes (386 files, 6,441 tests; 9 files, 136 tests skipped).

The sessionless workspace MCP backend (`7ab670325`) and legacy retirement (`3c4b8e7a6`) are manually integrated in this worktree:
- Task 16 `authorizationRootId` is preserved in `CompletionWorkerBootstrapSchema` and propagated through stateless worker completion bootstrap.
- Task 32 `WorkerReplySchema` optional `subagent.toolCallId`, `worker/index.ts` parent tool-call forwarding, and supervisor `onSubagent` callbacks are preserved.
- Canonical workspace MCP is the sole configuration and settings authority. Obsolete `/api/config/mcp*` routes, `packages/web/server/lib/opencode/mcp.js`, and unused list/connect/disconnect SDK wrappers are removed. Public DTOs use precise `connected`/`failed` discriminators, and UI store narrowings are aligned.
- Focused verification passed:
  - Agent contract build passed.
  - Agent Service type-check passed (preparing 13 source-derived SDK declarations, before final lint-only edits).
  - 19 native session+MCP tests passed (123 assertions).
  - 68 contract/stateless tests passed (254 assertions).
  - MCP UI isolated runner passed (3/3 files).
  - 3 Web config/shared regression files passed (`server/lib/opencode/config-v2.test.js`, `server/lib/opencode/shared.test.js`, `server/lib/opencode/provider-model-shared.test.js`), retaining `cleanStringMap` for still-used provider conversion.
  - Real `AgentService` + subprocess worker HTTP smoke passed: workspace registration, config write/read, local MCP handshake with 1 tool and 0 sessions, restart/persisted config, stale CAS 409, unauthenticated 403, and no-worker reconnect with a second handshake. The smoke used a controlled allow policy callback only; temporary probe scripts and runtime state were removed. This proves the private service boundary, not connected Host/Web/Electron production behavior.
  - Authored backend oxlint errors were repaired in three files (`catalog.ts` conditional spread, `catalog-mcp.test.ts` request parameter type, `worker/mcp.ts` headers widening); final scoped recheck is pending.

Packaged staging status:
- Commits `7d0cfa7a6` (staging pinned Bun runtime outside ASAR) and `f3a7c17f0` (dependency resolution from installed owner directories) are in `m1-integration` ancestry.
- In an earlier isolated packaged-closure tree, `bun run --cwd packages/electron prepare:agent-runtime` and 4/4 staging tests passed (not rerun here). This supersedes "staging absent", but is distinct from full packaged Electron certification without OpenCode.

Isolated-space archive status:
- Native OMP transfer is now implemented across the space bridge, Host catalog and Agent Service. The space returns a complete parent-first manifest; Host quarantines raw uncompressed bounded ustar bundles and selects the private destination and opaque `archive_<spaceId>` workspace identity.
- The Agent Service owns transcript/artifact/subagent serialization, structured native image/blob references, SHA-256 verification, cold projection and persistent deleted-space provenance. Host does not parse or synthesize JSONL or import SDK objects. Compressed hostile bundles and direct archive extraction are refused.
- Archive admission is catalog-owned and rollback is limited to newly registered imports; prior entries and shared global blobs remain intact. Imported roots/children are browsable and deletable after restart without live workers and reject run, mutation, reopen, branch, fork and relocation with canonical `SESSION_READ_ONLY` 409. Non-native-owned non-image attachment bytes are explicitly refused; no attachment preview proof is claimed.
- This source phase has not run integrated checks or live Docker/packaged certification. Focused native transfer/cold-read/delete/rollback smoke and final type/lint/test verification remain parent-owned.

Task 17 remains active:
- Existing UI type-check, unrelated lint baseline and connected Web/Electron acceptance items remain as recorded above; zero diagnostics is not claimed.
- Packaged Electron certification and remaining legacy execution/lifecycle consumer cutovers are not complete.

## Integrated wave landed (2026-10-16)

The uncommitted lane work is now committed on `omp-through-m3/recovery-20261013` in this worktree: `752207d61` (canonical workspace MCP and session archive as the sole owners; contract/service/web/electron), `3cee89866` (retained UI callers cut to the canonical client; legacy compatibility client, update toast, CLI settings, restart helpers and background-subagent projections removed), `1c17409d4` (web test repairs), `2be70dd12` (Electron suite stops scanning the staged `resources/agent-runtime` dependency tree; dead `session-activity.js` probe and its documentation section removed), `43de9070d` (first pass of the `packages/ui` test-fixture migration), `730fd764b` (Electron README documents the staged agent runtime instead of the removed OpenCode CLI), `e99f52ca7` (pending-request badge test drives canonical approval/question events), `5154b24c1` (seventeen UI renderers with no importer left, plus `openchamber-sessions/opencode-client.js` and `lib/opencode/{prompt-response,response-envelope}.js`, deleted with their tests and document sections), `10ded522b` (the OpenCode CLI upgrade surface: `/api/opencode/upgrade`, `/api/opencode/upgrade-status`, `/api/opencode/version`, `cli-upgrade.js`, `upgrade-capability.js` and their wiring removed). The worktree is clean at `10ded522b`.

Verified here, Linux x64, Node 24.18.0 / Bun 1.4.2:
- `bun run --cwd packages/web test`: 386 files / 6430 tests pass (the three failures in `space-opencode.test.js` and `fs/routes.test.js` were repaired).
- `bun run --cwd packages/electron test`: 43/43 files pass after the exclusion. Before it, the staged runtime's own dependency tests reported 133 false failures.
- `bun run --cwd packages/sdk test`: 23/23 files. `bun test packages/agent-service/src`: 101 pass. `bun run --cwd packages/agent-contract build` then agent-service/web/electron type-checks pass; `packages/ui` build fails only on its test project.
- Real startup smoke: `bun server/index.js --port 3111` starts the Host, supervises `bun --no-env-file packages/agent-service/dist/index.js --port 0`, and `GET /api/agent/v1/ready` answers `{"ready":true,"engine":"omp","version":"1.0.0"}`; `/api/agent/v1/sessions` answers 401 without UI auth.
- `bun run docs:validate` 696 pages / 58 sidebar links; `.workflow/bin/workflow validate` 42 task files.

Measured remaining work (not estimates):
- `packages/ui` production sources type-check clean; the **test project does not**. The migration pass took the test-project error count from 1016 to 498 and the suite to 729 of 807 files passing. The remaining errors are fixture migrations, not shim gaps: canonical `Session` fixtures still written with `id` (sidebar group, 46), `ChatMessageEntry.info` (42), the removed `sdk` prop on `SyncProvider` in 18 chat tests (20), store `rehydrate`, and `sessionID`/`modelID`/`title` stragglers.
- `packages/ui/src/types/bun-test.d.ts` is the UI's own declaration of `bun:test` (no `@types/bun` in this package). It now declares the matcher, asymmetric-matcher, `each`, `Mock`/`Spy` and `jest` surface the suites use, and `tsconfig.test.json` allows `Promise.withResolvers`. Three `anti-slop` findings remain on that file because its generic mock signatures must expose `unknown` to mirror bun's real API; that is a justified deviation, not a fix-me.
- The retained UI still imports legacy modules: 31 non-test files take types from `@/lib/opencode/model`, 15 call `@/lib/opencode/client`, and 67 in total reach into `@/lib/opencode/*`, whose `{tools,websearch,session-stats,events,plugins,integration-catalog,projection,background-shell,ids}` helpers have no canonical owner yet. W7/W10 cannot pass before those callers move.
- Host legacy execution owners are still registered from `packages/web/server/index.js`: `lifecycle.js`, `env-runtime.js`, `env-config.js`, `auth-state-runtime.js`, `hmr-state-runtime.js`, `feature-routes-runtime.js`, `core-routes.js`, `server-utils-runtime.js` (proxy wiring), `bootstrap-runtime.js`, `session-runtime.js`, `shutdown-runtime.js`, `managed-config-file.js`, `opencode-resolution-runtime.js`, `compatibility.js`, `cli-options.js`, `cli-entry-runtime.js`. Each now has exactly one importer — the composition root — so they retire with the managed-OpenCode lifecycle they serve, not one at a time.
- Keep `GET /api/version` (UI `serverCompatibility.ts` and the Electron host probe read it) and `GET /api/opencode/health` (UI `lib/opencode/client.ts` reads it) until those callers move; an inventory claim that a route is dead needs a caller check first — the 2026-10-16 pass found `/api/version` live after a report called it dead.
- `packages/web/server/lib/tts/index.js` is a barrel no production module imports; `server/lib/route-module-exports.test.js` still pins its exports, so removing it means updating that guard in the same change.
- Host-owned modules still parked under `lib/opencode/`: `path-utils.js`, `models-metadata.js`, `openchamber-routes.js`, `npm-registry-config.js`, `worktree-directory.js`, `shared.js`.
- Electron: the README now documents the staged agent runtime and the Windows PATH fallback no longer probes `~/.opencode/bin`; `ssh-manager.mjs` runs remote `openchamber serve` and needs no OpenCode on the remote. Packaged Electron certification without OpenCode still belongs to Task 18/M5.
- Isolated spaces still write OpenCode container config and call the container's `/api/credential` (`space-opencode.js`), import `../opencode/auth.js` and `../opencode/proxy.js`, and expose `POST /api/spaces/:id/restart-opencode`.
- The isolated-space **archive import** is canonical now: Host selects scope and calls Agent Service `/internal/archive/import` with rollback through `DELETE /api/agent/v1/sessions/:id`; no legacy OpenCode import owner is reached.

Next concrete step: finish the `packages/ui` test-project migration, then move the 31/15 legacy UI callers to the canonical client and contract, then retire the Host execution owners above. Each of those is a separate slice; none of them may add an adapter or fallback.

Open finding (2026-10-16, discovered when `sync/first-server-connect.test.ts` became compilable again): after a rejected workspace admission, `ChildStoreManager.retryFailedBootstraps()` does not re-run the bootstrap far enough to announce the first connection, so `failed workspace admission never claims readiness and a later real bootstrap can recover` fails. Cause not yet established; treat it as a spike before changing either side. Also pre-existing `anti-slop` findings remain in `sync/event-reducer.test.ts` (fixture casts at lines 23 and 36) from the earlier migration pass.

## Packaged Agent Runtime closure (2026-10-16)

The packaged closure was rebuilt and verified in this worktree. `prepare:agent-runtime` stages the pinned Bun `1.4.2`, service/worker bundles, 158 installed packages, platform `pi-natives` assets and ONNX native assets. The staging fix links platform N-API files beside the relocated `pi-natives` loader; verifier imports each native-bearing package in a fresh Bun process so different ONNX SONAMEs cannot mask one another. Commit `40cdb932c`.

Checks passed: `node --test ./packages/electron/scripts/prepare-agent-runtime.test.mjs` (`5/5`), `bun run --cwd packages/electron prepare:agent-runtime`, `bun run --cwd packages/electron verify:agent-runtime` (`ready:true`, `engine:omp`, `version:1.0.0`), Electron architecture tests (`45/45`), Electron syntax check, package tests (`43/43` files), and touched-file oxlint (`0` warnings, `0` errors). Real Web startup via `bun server/index.js --port 3111` returned canonical readiness `200` with `{"ready":true,"engine":"omp","version":"1.0.0"}` and unauthenticated `/api/agent/v1/sessions` `401`. Full packaged Electron OpenCode-absent UI/runtime certification and remaining legacy execution/lifecycle cutovers remain open for Task 18/M5.
