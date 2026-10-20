# 17: Integrate Electron, host proxy and final legacy removal

**Effort:** omp-through-m3
**Task type:** feature
**Finished:** 2026-10-20

**Delivers:** Web and Electron launch paths proxy the same authenticated `/api/agent/v1` boundary, host lifecycle owns Agent Service supervision, and obsolete OpenCode agent integration files/routes/config readers are removed after caller cutover.

**Blocked by:** 14, 16, 22
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/host/`, `packages/electron/main.mjs`, package manifests, runtime/build docs and legacy agent integration paths

**Read first:** `.workflow/specs/omp-through-m3.md` M1/M3/W2/W7/W10; desktop-shell and UI API skills; `packages/web/server/index.js`; `packages/electron/main.mjs`; Electron README; Host architecture and proxy/auth contracts
**Covers:** W2, W10

**Check:** Launch the real Web and packaged Electron entrypoints with OpenCode absent; confirm canonical readiness/auth boundaries, retained Host capabilities, and Agent Service start/stop/restart child cleanup. Run the existing focused Host/Electron suites and packaged runtime preparation/verification. Task36 owns connected session create/stream/abort/reopen and W8 stale-runtime recovery; reuse its receipt without repeating that scenario.

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
- Host legacy execution owners still registered from `packages/web/server/index.js`: `lifecycle.js`, `env-runtime.js`, `env-config.js`, `auth-state-runtime.js`, `hmr-state-runtime.js`, `feature-routes-runtime.js`, `core-routes.js`, `server-utils-runtime.js` (proxy wiring), `bootstrap-runtime.js`, `session-runtime.js`, `shutdown-runtime.js`, `managed-config-file.js`, `compatibility.js`, `cli-options.js`, and `cli-entry-runtime.js`. These owners retire with the managed-OpenCode lifecycle they serve, after retained Host callers and side effects are cut over.
- Keep `GET /api/version` (UI `serverCompatibility.ts` and the Electron host probe read it); the retired UI client was the only retained UI caller found for `GET /api/opencode/health`. The 2026-10-16 inventory found `/api/version` live after a report called it dead; route retirement still requires a separate server-caller check.
- `packages/web/server/lib/tts/index.js` is a barrel no production module imports; `server/lib/route-module-exports.test.js` still pins its exports, so removing it means updating that guard in the same change.
- Host-owned modules still parked under `lib/opencode/`: `models-metadata.js`, `openchamber-routes.js`, `npm-registry-config.js`, `worktree-directory.js`, `shared.js`. `path-utils.js` moved to `lib/host/path-utils.js`; Web env/server-utils and Electron now import the Host owner, and the original 12-case path test passes.
- Electron: the README now documents the staged agent runtime and the Windows PATH fallback no longer probes `~/.opencode/bin`; `ssh-manager.mjs` runs remote `openchamber serve` and needs no OpenCode on the remote. Packaged Electron certification without OpenCode still belongs to Task 18/M5.
- Isolated spaces still write OpenCode container config and call the container's `/api/credential` (`space-opencode.js`), import `../opencode/auth.js` and `../opencode/proxy.js`, and expose `POST /api/spaces/:id/restart-opencode`.
- The isolated-space **archive import** is canonical now: Host selects scope and calls Agent Service `/internal/archive/import` with rollback through `DELETE /api/agent/v1/sessions/:id`; no legacy OpenCode import owner is reached.

Next concrete step: finish the `packages/ui` test-project migration, then move the 31/15 legacy UI callers to the canonical client and contract, then retire the Host execution owners above. Each of those is a separate slice; none of them may add an adapter or fallback.
**2026-10-17 continuation:** The first E2(b) caller slice is now integrated. `CanonicalClient.checkReady()` validates the existing `/api/agent/v1/ready` contract; ConfigStore startup/connection checks, startup recovery diagnostics, and configuration-refresh polling no longer use the OpenCode health probe. The OpenCode client and runtime rebinding remain because other uncut callers still depend on them. Focused readiness tests and the strict UI test-project type-check pass; Task 17 remains open for the remaining caller inventory, Host owner retirement, and connected Web/Electron certification.
**2026-10-18 continuation:** The bounded Commands/Settings `AgentSelector` caller now reads `useAgentsStore` through `selectAgentsForDirectory`; its component-level Canonical Client fetch is removed. Native agent store/catalog-refresh tests pass (`21` tests / `103` assertions), the UI build passes, and touched-file oxlint is clean. The duplicate ConfigStore agent catalog and remaining chat/session callers still block full agent-owner retirement.
**2026-10-18 provider continuation:** The existing canonical provider disconnect path now admits stored OAuth credentials as well as stored API keys through revision-checked `deleteProviderCredential`; provider auth tests pass (`24` tests / `62` assertions). Interactive OAuth, multi-account lifecycle, and custom form-answer paths remain contract gaps, so legacy integration ownership stays only on those explicit paths.
**2026-10-18 refresh continuation:** Agent catalog events now refresh only `useAgentsStore`; duplicate ConfigStore agent invalidation and reload were removed from `catalogRefresh.ts`. The canonical refresh regression file passes (`4` tests / `18` assertions), the UI build and touched-file oxlint pass. ConfigStore's startup/chat agent consumer path remains open.
**2026-10-18 DefaultsSettings continuation:** The settings page now resolves a manually selected agent's pinned model from `useAgentsStore` native profiles, removing its dependency on ConfigStore's legacy `providerID`/`id` fields. The focused DefaultsSettings test passes (`1` test / `6` assertions); UI build and strict test-project type-check pass. Remaining chat/startup ConfigStore agent consumers still block full retirement.
**2026-10-18 chat continuation:** `mobileControlsUtils.ts` now imports the canonical Agent contract; its focused cycling tests pass (`4` tests / `11` assertions), UI build passes, and touched-file oxlint is clean. The composer and ModelControls still depend on ConfigStore selection cascades and remain open.
**2026-10-18 mobile continuation:** `MobileAgentButton` now sources labels from canonical `useAgentsStore`, removing its split-brain call to ConfigStore `getVisibleAgents`; the UI build passes and its oxlint is clean. Composer-wide selection and startup agent loading remain open.
**2026-10-18 Host proxy utility continuation:** `writeSseChunkWithBackpressure` now lives in `lib/host/sse-stream.js`, and the allowlisted session-list projection now lives in `lib/host/session-list.js`; OpenCode proxy, spaces dispatcher, and space session index use those Host owners. The focused dispatcher/session-index packet passes (`28` session tests plus the dispatcher suite), new Host utility oxlint passes with `0` warnings / `0` errors, and syntax checks pass. This removes cross-subsystem imports into proxy ownership only; legacy lifecycle/proxy routes, packaged Electron UI certification, and connected W7-W10 evidence remain open.

Open finding (2026-10-16, discovered when `sync/first-server-connect.test.ts` became compilable again): after a rejected workspace admission, `ChildStoreManager.retryFailedBootstraps()` does not re-run the bootstrap far enough to announce the first connection, so `failed workspace admission never claims readiness and a later real bootstrap can recover` fails. Cause not yet established; treat it as a spike before changing either side. Also pre-existing `anti-slop` findings remain in `sync/event-reducer.test.ts` (fixture casts at lines 23 and 36) from the earlier migration pass.

## Packaged Agent Runtime closure (2026-10-16)

The packaged closure was rebuilt and verified in this worktree. `prepare:agent-runtime` stages the pinned Bun `1.4.2`, service/worker bundles, 158 installed packages, platform `pi-natives` assets and ONNX native assets. The staging fix links platform N-API files beside the relocated `pi-natives` loader; verifier imports each native-bearing package in a fresh Bun process so different ONNX SONAMEs cannot mask one another. Commit `40cdb932c`.

Checks passed: `node --test ./packages/electron/scripts/prepare-agent-runtime.test.mjs` (`5/5`), `bun run --cwd packages/electron prepare:agent-runtime`, `bun run --cwd packages/electron verify:agent-runtime` (`ready:true`, `engine:omp`, `version:1.0.0`), Electron architecture tests (`45/45`), Electron syntax check, package tests (`43/43` files), and touched-file oxlint (`0` warnings, `0` errors). Real Web startup via `bun server/index.js --port 3111` returned canonical readiness `200` with `{"ready":true,"engine":"omp","version":"1.0.0"}` and unauthenticated `/api/agent/v1/sessions` `401`. Full packaged Electron OpenCode-absent UI/runtime certification and remaining legacy execution/lifecycle cutovers remain open for Task 18/M5.

**2026-10-19 bounded retirement continuation:** A source inventory found no retained UI production import of `packages/ui/src/lib/opencode/client.ts`; its direct references were stale tests and a ConfigStore mock. The client, its client/status tests, and the client-only config-error helper/tests were removed. Polling, Guest-status, keyboard, runtime-fetch, and ConfigStore fixtures were updated or detached from the retired client; canonical session/readiness owners remain authoritative. The public `/api/small-model` preview/generate registration and route module were removed while the injected `small-model/index.js`/`client.js` service remains for Guest/session-assist/session-goal. The obsolete parser allowlist entry was removed, and generic unknown `/api` bodies remain unparsed for proxy routing. No implementation checks were run in this slice.
**2026-10-19 diagnostics continuation:** Removed `packages/ui/src/lib/openCodeStatus.ts`; `RuntimeStatusDialog` and its state/locale keys now identify Host and Agent Service readiness, and report recent session errors and rejected sends. SessionErrorNotice, CommandPalette, the existing menu action, and debug `statusReport()` call the Host `/health` and Canonical readiness implementation. `debug.getAppStatus()` now reports Host `/health` status/supervisor state plus `CanonicalClient.checkReady()` rather than OpenCode process fields. UI type-check/build passed; the focused reporter/dialog oxlint passed. The built Web on 3205 opened the dialog with Host HTTP 200 and Agent Service ready; Chrome verified `window.__opencodeDebug.getAppStatus()` returned Host `ok`, supervisor `ready`, Canonical `ready: true`, and no `opencode` property. Full changed-path oxlint retains existing findings in other portions of `useUIStore.ts`, `debug.ts`, menu hooks, and locale dictionaries. Host owner retirement, packaged Electron certification, and connected W7-W10 remain open.
**2026-10-19 Host route retirement:** With the retained UI health caller removed, retired `GET /api/opencode/health`, its `?wait` shared-probe helper, and helper tests. Updated the OpenCode route module documentation. Focused Web tests passed (`3` files / `18` tests); Chrome-independent Host smoke confirmed `/api/opencode/health` returns 404 while `/health` and `/api/agent/v1/ready` return 200 (`ready:true`, `engine:omp`). Touched `routes.js` oxlint reports only existing `no-runtime-typeof` findings. Remaining OpenCode lifecycle routes and Host caller ownership are still open.
**2026-10-19 resolution route retirement:** The retired `/api/config/opencode-resolution` client had no remaining caller; removed its OpenCode route, proxy wait bypass, unused runtime module, and dead feature-route dependency. Removed the module and endpoint from the OpenCode module documentation. Repository search found no remaining `getOpenCodeResolutionSnapshot`, `createOpenCodeResolutionRuntime`, or `opencode-resolution` references. The focused Web packet passed (`3` files / `18` tests) and all three modified server modules passed `node --check`. On a fresh Web process, `/api/config/opencode-resolution` returned 404; `/health` and `/api/agent/v1/ready` returned 200, with `ready:true`, `engine:omp`. Remaining legacy lifecycle owners and Task36/18 acceptance stay open.
**2026-10-19 disabled-provider route retirement:** Repository-wide search showed the legacy UI helper had no callers and the sole remaining `/api/provider/disabled` handlers were the unregistered OpenCode route module; native provider disable state is owned by the Agent Service worker's `cfgDisabledProviders`. Removed `packages/ui/src/lib/disabledProviders.ts`, the two legacy route handlers, their `providers.js` read/write helpers and exports, and the isolated config test. Focused provider suites passed (`3` files / `32` tests), UI type-check passed, and a fresh Web smoke returned 404 for `/api/provider/disabled` while Canonical readiness remained 200. Existing OpenCode provider-config migration tests remain for still-present route logic; no legacy fallback was added.
**2026-10-19 orphaned auth runtime audit:** Repository-wide search found no code import, path-based load, or factory call for `createOpenCodeAuthStateRuntime`; `bun run dead-code` independently listed `auth-state-runtime.js` as unused. Removed the orphaned module and its module-doc entry/export description. This is not a Host-auth retirement: UI sessions, passkeys, pairing tokens, and Agent Service `X-Internal-Secret` keep their independent owners. The separate legacy `getOpenCodeAuthHeaders` consumers remain in lifecycle/proxy-related modules and block their coordinated retirement; the removed module was not their live provider. LSP references were unavailable (no configured language server), so the source-wide symbol/import search and dead-code report are the evidence.
**2026-10-19 native warming route retirement:** Task50 already moved `SessionWarmingCheckbox` to the canonical workspace cache-warming API. The legacy `/api/config/warming` handler was unreachable in production (`registerOpenCodeRoutes` has no production caller; the live Web endpoint returned 404 before and after cleanup). Removed its OpenCode config writer, `websearch-config.js`, obsolete `writeWarmingEnabled` export/test, and parser allowlist entry; updated module docs. Focused Web tests passed (`4` files / `69` tests), `bun run type-check:web` and changed-JS `node --check` passed, and a fresh process returned Canonical readiness 200 with the old route still 404. Targeted oxlint exited 1 with existing anti-slop findings in the legacy modules; this slice added no code. `bun run dead-code` remains non-blocking at 10 unused files / 100 exports (exit 1), down from 11 files before removing the separately orphaned auth runtime.
**2026-10-19 Host utility/type cleanup:** Source tracing showed `createServerUtilsRuntime` production callers use only Host `buildAugmentedPath`, SSE payload parsing, executable lookup and `searchPathFor`; removed its dead OpenCode proxy setup, port tracking and managed-engine PATH helpers, and simplified its fixture while preserving the two retained PATH precedence tests. Aligned `packages/web/server/index.d.ts` with `startWebUiServer()`'s actual controller, Agent Service supervisor state, CLI options and Electron callbacks; removed nonexistent OpenCode controller/top-level exports. Focused Host/terminal/startup tests passed `41` tests (`1` skipped), Web and Electron type/syntax checks passed, and declaration-only `tsc` passed with `allowImportingTsExtensions`. Targeted oxlint reports only pre-existing anti-slop findings in the retained JS utility. The source-wide reference audit found no production use of the removed APIs.
**2026-10-19 managed OpenCode config retirement:** Native Agent Service tools read Host settings through the worker authorization path; no production reader consumed `opencode.managed.json`. Removed `managed-config-file.js`, `managed-plugin-config.js`, their isolated tests, the composition state/instantiation and settings refresh callback, the obsolete settings key set/tests, and stale references in OpenCode, agent-tool, environment and runtime-note docs. Source sweep found no remaining production/test references to the deleted modules or callback symbols. The retained settings packet passed (`4` files / `63` tests, `1` skipped), Web/Electron checks passed, and native settings/tool execution owners remain unchanged.
**2026-10-20 settings cutover:** Removed the inactive `globalBehaviorPrompt` editor and settings fields across the UI registry/search, Host settings sanitizer and locales; response-style preferences remain on Host profile settings. Agent settings now expose native `allowedTools` and `permissionPresetId` without the OpenCode ordered-rule editor or store callers. The settings UI suites passed 29 tests and UI type-check passed. Focused oxlint reported authored findings in `BehaviorPage.tsx` plus inherited Host settings JS findings; no lint pass is claimed. The Web/Electron connected acceptance and broader Task17 Host retirement remain open.
**2026-10-20 unmounted route retirement:** Repository-wide search found no production call to `registerOpenCodeRoutes` or `registerConfigEntityRoutes`; the feature runtime retained only an unused import of the latter. Removed the unmounted `/api/behavior/agents-md` GET/PUT handlers and their path/CAS test, then deleted `config-entity-routes.js`, its test, and the unused import. Updated module and architecture docs to distinguish inherited handlers from production APIs. Vitest passed 4 files / 66 tests, Web type-check passed, changed JS syntax checks passed, docs validation passed, and workflow validation passed (64 tasks). `bun run dead-code` remains non-blocking at 10 unused files / 100 exports; no new deletion-related candidate appeared. No live Web route smoke was run for these already-unregistered handlers; Task17 lifecycle/auth cleanup and Task36/18 acceptance remain open.

**2026-10-20 worktree-directory config cutover:** Removed `readWorktreeDirectorySetting` and the OpenCode `worktree-directory.js` resolver (JS/declaration/test) that only Git used. The personal project config now owns `worktreeDirectory: string | null` (`personal.worktreeDirectory`), accepted by `PUT /api/projects/:projectId/config`; `null` clears it. Host composition injects `projectConfigRuntime.readWorktreeDirectory` into Git through `configureProjectWorktreeDirectory`, using the canonical path-based project id derived from the primary worktree. Git resolves relative values against the primary worktree, `~` against home, and absolute values as-is; unset falls back to `<OPENCHAMBER_DATA_DIR>/worktree/<git project id>` instead of OpenCode data. The pure resolver moved to `lib/git/worktree-directory.js`; removal safety still deletes unregistered leftovers only inside that Host default root. Project/Git module docs, focused tests, and the unreleased changelog were updated. This supersedes the preceding note's claim that Git still calls `readWorktreeDirectorySetting`. Tests/build/lint/typecheck/docs validation were not run; changed JS passed `node --check` and a project-config read/write smoke.

**2026-10-20 legacy route/config cleanup:** Repository-wide caller search found no production registrations for the removed OpenCode agent/provider routes or config-entity routes. Removed their route/provider/model-discovery/Claude CLI auth modules, isolated tests, obsolete enterprise route matchers, the VCS-init refusal matcher, and dead config-v2/agent CRUD owners. Simplified `shared.js` while retaining scheduled-task YAML helpers, Git ancestor helpers, and the read-only JSONC worktree setting projection. Git still calls `readWorktreeDirectorySetting`; the private OpenCode credential reader still serves legacy quota/voice consumers. Vitest passed 6 files / 63 tests; Web type-check and changed-JS syntax checks passed. A fresh isolated Web Host on port 3219 returned `/health` 200 and `/api/agent/v1/ready` 200 (`engine: omp`); `/api/provider/disabled` and `/api/opencode/health` returned 404. Graceful shutdown exited 0 and temporary data was removed. Docs validation passed (696 pages / 58 sidebar links); workflow validation passed (64 task files). Focused oxlint still reports two `no-runtime-typeof` findings in unchanged `shared.js` config predicates. `bun run dead-code` reports 10 unused files / 92 unused exports and exits 1. Task17 remains open for the retained legacy lifecycle/auth consumers, credential handoff retirement, and connected Web/Electron acceptance.

**2026-10-20 shared UI version-gate removal:** `App.tsx` no longer fetches `/api/version` during startup or blocks on `openchamberVersion < 2`. Removed `serverCompatibility.ts`, its test, `OutdatedServerNotice.tsx`, and the four obsolete `startup.serverOutdated.*` keys from all 13 locale dictionaries. A source search under `packages/ui/src` found no references to the retired helper, screen, or keys. The Host `/api/version` route remains for the Electron host probe's server identity/API compatibility check; AboutSettings update actions and `MobileApp.tsx` are unchanged. No checks or connected smoke ran; Task36/18 own current integrated observation and final verification.

**2026-10-20 Host auth environment documentation correction:** Source review found `OPENCODE_JWT_SECRET` is still consumed by Host UI session signing (`packages/web/server/lib/ui-auth/ui-auth.js`), not by the Agent Service. Restored a concise explanation and the global sign-out limitation in all 12 environment-reference locales. No checks ran; Task18 owns documentation validation.

**2026-10-20 Task15 source dependency:** Host settings-route ownership, explicit Host filesystem directory context, and Guest-owned item projection are integrated. New regression tests remain unrun under the Task18-only verification plan; Task36 owns the connected Board/Guest/sidebar/Host-FS observation. Task17 no longer waits for Task15's archive, but its Host retirement and Task36/18 remain open.

**2026-10-20 Task17 provider and classification documentation and localization correction:** Corrected `packages/docs/content/docs/providers.mdx` and all 11 translations (`de`, `es`, `fr`, `ja`, `ko`, `nl`, `pl`, `pt-br`, `tr`, `uk`, `zh-cn`) to accurately document native OAuth sign-in lifecycle (browser authorization link, code input when prompted, completion commit), Agent Service credential storage ownership (`AuthStorage`), multi-account selection with active default accounts rather than invented per-project credential overrides, optional custom provider API keys for keyless gateways (Ollama/LiteLLM), write-only credential persistence without obsolete `{env:VAR_NAME}` syntax, and custom model metadata JSON configuration. Corrected the matching user-visible provider strings across all 13 UI locale dictionaries (`de`, `en`, `es`, `fr`, `ja`, `ko`, `nl`, `pl`, `pt-BR`, `tr`, `uk`, `zh-CN`, `zh-TW`) removing obsolete `{env:VAR_NAME}` references and legacy OpenCode auth claims. Updated `packages/docs/content/docs/classification-providers.mdx` and all 11 translations to require stored provider credentials for Zen Key, OpenRouter, and Vercel AI Gateway, reflecting that Jev's execution resolver accepts only stored `AuthStorage` rows and does not hand off ambient environment keys. No checks or validation ran; Task18 owns docs and workflow validation. Task17, Task36, and M3 gates are not advanced.

**2026-10-20 Task17 permissions, runtime, and module documentation fact correction:** Corrected `permissions.mdx` and all 11 translations (`de`, `es`, `fr`, `ja`, `ko`, `nl`, `pl`, `pt-br`, `tr`, `uk`, `zh-cn`) to align with source realities verified in `artifact://7818` and `agent://Task17PermissionsSourceCheck`: documented Host `WorkerOperationAuthorizer` and Agent Service `WorkerPolicy` boundaries, SQLite persistent approval policies (session-allow and workspace-deny only), immediate 403 denial for paths outside the project root without prompting, standard project file access for `.env` files without special prompts, Settings → Sessions for default permission modes versus Settings → Agents for tool availability, `auto` mode auto-approval with enforced Host boundary checks, and `CanonicalApprovalCard` rendering without unrendered safety banner text. Corrected `repository-config.mdx`, `projects.mdx`, `index.mdx`, `install.mdx`, and `quickstart.mdx` across all 12 locales: separated draft starter references from definitions, documented draft starter management on the new session screen rather than in Settings → Projects, added repository config and command/skill cross-links, clarified that `--ui-password` requires authentication at the login screen before displaying the session list, and documented verified OMP prerequisites (Node.js 24.14+, Bun 1.3.14+, git). Corrected the agent setup section across `providers.mdx` and all 11 translations to reflect actual `AgentsPage.tsx` controls (`allowedTools` availability, `permissionPresetId`, model override, description, prompt) while removing promises of temperature and tool-rule editors. Corrected `packages/web/README.md` (removed stale sidecar CPU wording, deduplicated feature lists, removed `--tunnel-password-url`), updated `packages/electron/README.md:9` to reflect that packaged Agent Runtime staging has landed via `prepare:agent-runtime` and `verify:agent-runtime`, and corrected `packages/web/server/lib/quota/DOCUMENTATION.md` and `packages/web/server/lib/tts/DOCUMENTATION.md` to document live credential resolution (`selected-credential.js` -> Host `private-credential.js` -> Agent Service `AuthStorage`) and STT `voice-keys.js`. No validation, tests, or builds ran; Task 18 owns documentation and workflow validation; Task 17, Task 36, and M3 gates remain open.

**2026-10-20 Task17 TTS documentation audit and UI localization clarification:** Corrected three factual statements in `packages/web/server/lib/tts/DOCUMENTATION.md` against live source: `POST /api/voice/token` enterprise refusal responds with HTTP 403 `{ allowed: false, error: ENTERPRISE_MODE_ERROR }` with no `code` field; `POST /api/text/summarize` returns HTTP 400 for empty or non-string text, returns `'Text under threshold'` (when `text.length <= threshold`) or `'Model summarization provider unavailable'` (when `text.length > threshold`), and only the unhandled catch fallback returns `'Summarization unavailable'`; and the standard OpenAI endpoint (`https://api.openai.com/v1`) remote-URL exemption applies only outside enterprise mode, while enterprise mode blocks it. Corrected `settings.openchamber.desktopNetwork.field.allowLanAccessAria` across all 13 UI locale dictionaries to refer to LAN access to the desktop app rather than desktop sidecar or literal mistranslations, preserving existing accurate `fr` and `uk` translations. No new keys or component changes. Verification deferred to Task18; Task17, Task36, and M3 gates remain open.
**2026-10-20 Host shutdown cleanup:** Removed unused OpenCode process-stop/readiness callbacks, their test fixtures, and the stale comment from `createGracefulShutdownRuntime`; the current shutdown sequence already closes the canonical Host Agent Service directly. A reviewer confirmed no production caller supplied or read these callbacks and found no issues. No behavior change is intended. Focused tests and integrated runtime checks remain deferred to Task18; no gate advanced.

**2026-10-20 Web runtime and migration status documentation correction:** Corrected `packages/web/README.md` migration status and runtime prerequisites to align with Task 17 and `packages/electron/README.md`: Electron Agent Runtime staging is implemented and verified, while packaged Electron UI/runtime certification remains open. Clarified that although `@openchamber/web` is publicly declared on npm, running the OMP runtime inside a standalone npm installation remains unverified and out of M3 acceptance. No tests, builds, or validation ran; explicit verification is deferred to Task18; no gates advanced.
**2026-10-20 Web npm runtime distribution audit:** The public `@openchamber/web` pack remains outside M3 acceptance: its manifest names private `workspace:*` Agent Service/Contract dependencies, and `vendor/omp/c9de2b02/copy-manifest.json` retains only Linux x64 native assets. A consumer postinstall cannot repair missing registry dependencies before install completes or supply the five absent platform native packages. Do not publish the service or claim a standalone npm runtime; supported-matrix release distribution remains M5 work under `implementation-plan.md`. No runtime code changed and no gate advanced.
**2026-10-20 Host port callback cleanup:** Removed the unused `getOpenCodePort` dependency from `feature-routes-runtime.js`. Repository-wide search within `packages/web/server` now finds no `getOpenCodePort` references; `getOwnPorts` remains for Host dev-server discovery. A reviewer confirmed the removed binding was never read or forwarded and found no issues. No tests/checks run; Task18 owns validation and no gate advanced.

**2026-10-20 Web migration status proxy correction:** Corrected the migration-status statement in `packages/web/README.md` to reflect that the Host Gateway has no production proxy registration or Host-managed OpenCode lifecycle (`proxy.js` is unmounted in production in favor of the OMP Agent Service and Canonical API `/api/agent/v1`), matching `server/lib/opencode/DOCUMENTATION.md` and the Task44 audit. In a follow-up correction to line 15, replaced the residual phrase stating that proxy/config/lifecycle controls await retirement with accurate wording that some legacy Host configuration/control routes and composition owners remain. Explicitly preserved that some legacy Host configuration/control routes and composition owners remain until caller retirement, and isolated-space OpenCode behavior is a separate M5 boundary, without implying all OpenCode code is removed or M5 spaces are migrated. No tests or builds ran; no gate advanced.

**2026-10-20 UI password alias retirement and CLI docs correction:** In `packages/web/server/lib/opencode/cli-options.js`, retired the legacy `OPENCODE_UI_PASSWORD` alias so `parseServeCliOptions` reads only `OPENCHAMBER_UI_PASSWORD` (regression-tested in `cli-options.test.js`). Removed `OPENCODE_UI_PASSWORD` from the option inventory in `packages/web/server/lib/opencode/DOCUMENTATION.md`. In `packages/web/bin/lib/DOCUMENTATION.md`, corrected session command documentation to clarify Host session and control API ownership via `commands-session.js` -> `cli-control.js` `POST /api/openchamber/control` without implying CLI ownership of OpenCode lifecycle. A read-only security review found no issues: network-exposed bind without current `OPENCHAMBER_UI_PASSWORD` or `--ui-password` still fails unless explicit `OPENCHAMBER_ALLOW_UNAUTHENTICATED_LAN=true`; Enterprise network policy is independently enforced; isolated spaces use token-derived `OPENCHAMBER_UI_PASSWORD`. No tests, builds, or validation ran; no gates advanced.

**2026-10-20 Host session-created callback cleanup:** Removed the orphaned `emitSessionCreatedEvent` callback from `server/index.js` and its unused `feature-routes-runtime.js` dependency. Exhaustive repository search showed only the helper definition, wiring, and destructure; live session creation emits canonical `openchamber:session-created` from `openchamber-sessions/routes.js`, while `event-client` and `writeSseEvent` remain used by other event producers. No routes, events, or behavior intentionally changed; no tests or validation ran; Task18 owns checks and no gates advanced.

**2026-10-20 Host stall timeout callback cleanup:** `packages/web/server/index.js` no longer imports the retired OpenCode upstream stall timeout constants or defines `getActiveSessionCount`/`getUpstreamStallTimeoutMs`. Source search showed those local bindings were only connected to an upstream proxy/session stall path that no longer has live callers; isolated-space SSE reader uses of `DEFAULT_UPSTREAM_STALL_TIMEOUT_MS` remain unchanged. No active routes/events/behavior changed intentionally; no tests or validation ran; Task18 owns checks and no gates advanced.

## 2026-10-20 closure split

Task17 is a coordination umbrella, not an additional validation gate. Its remaining acceptance work is now independently owned:

- Task44 owns removal of obsolete Host composition registrations and the remaining lifecycle/proxy/config ownership after caller cutover.
- Task36 owns connected Web/Electron W7-W10 behavior, including session UI flows, recovery, Board, Guest, and Host filesystem observations.
- Task18 owns the single integrated workspace gate and final M3 decision.

This task is archived as superseded by those independently closable slices. The archive does not claim Task44, Task36, Task18, packaged Electron certification, or M3 completion; their task files and receipts remain authoritative.
