# 52: Native plugins and extensions

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 93d519221527e15cf52a5dde0d6ddf011c7527bb
**Started:** 2026-10-18
**Finished:** 2026-10-21

**Delivers:** Canonical workspace plugin and extension management wired to the native `PluginManager` and `MarketplaceManager` in the Bun Agent Service worker. Exposes canonical `/api/agent/v1/workspaces/:workspaceId/plugins` endpoints for plugin listing, installation, uninstallation, enable/disable toggling, updates, doctor diagnostics, and local extension authoring under revision CAS. Replaces legacy `/api/config/plugins` and `/api/integration` routes in `usePluginsStore`, enforces Host enterprise egress boundaries, and reports explicit persistence versus active runtime apply outcomes without fake reload successes.

**Blocked by:** 64
**Files:** `packages/agent-contract/src/catalogs.ts`, `packages/agent-contract/src/plugins.ts`, `packages/agent-service/src/worker/catalog-plugins.ts`, `packages/agent-service/src/worker/catalogs.ts`, `packages/agent-service/src/supervisor/workspace-routes.ts`, `packages/web/server/lib/host/canonical-routes.js`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/stores/usePluginsStore.ts`, `packages/ui/src/components/sections/plugins/`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `packages/agent-contract/src/catalogs.ts`; installed native SDK `@oh-my-pi/pi-coding-agent/src/extensibility/plugins/manager.ts` (`PluginManager`), `src/extensibility/plugins/marketplace/manager.ts` (`MarketplaceManager`), and `src/extensibility/plugins/runtime-config.ts`; `packages/ui/src/stores/usePluginsStore.ts`; Host enterprise network boundary policies
**Covers:** W6, W9, W10

## Installed Native SDK Owner & Evidence

Plugin and extension lifecycle management is an implemented native subsystem of `@oh-my-pi/pi-coding-agent`, verified in installed source:
- `extensibility/plugins/manager.ts`: `PluginManager` manages global npm/git installations, dependency reconciliation (`bun install` in the native plugins directory), `omp-plugins.lock.json`, project overrides, enable/disable states (`setEnabled`), declared settings (`getPluginSettings`, `setPluginSetting`, `deletePluginSetting`), local package linking (`link`), and environment health checks (`doctor`).
- `extensibility/plugins/marketplace/manager.ts`: `MarketplaceManager` interacts with plugin registries to discover and fetch plugin manifests.
- `extensibility/extensions/loader.ts`: loads native JavaScript/TypeScript extensions and custom tool handlers.
- Source evidence: `PluginManager` methods operate on standard npm packages and local extension directories with explicit package name validation (`VALID_PACKAGE_NAME`) and shell metacharacter rejection.

## Architecture & Boundaries

- **Worker ownership:** Dedicated Bun Agent Service worker owns `PluginManager` and `MarketplaceManager` instances. All plugin installation, file loading, and extension execution occur within the worker runtime. UI and Node Host never import or execute plugin modules.
- **Host authentication & enterprise boundary:** Host Gateway enforces authentication, workspace authorization, and existing enterprise policy at use time. Native package-manager install/update/uninstall and explicit marketplace refresh are refused in enterprise mode; cached catalog reads, local extension authoring, enable/disable and declared settings remain available. No new product mode or policy knob is introduced.
- **Canonical API & wire contract:**
  - `GET /api/agent/v1/workspaces/:workspaceId/plugins` returns typed plugin entries, cached marketplace inventory, confined local extension entries and workspace runtime states under a uint64 decimal revision.
  - `POST .../plugins/install` accepts `{ expectedRevision, source }`, where package sources are `{ kind: 'package', spec }` (global-only) and marketplace sources are `{ kind: 'marketplace', name, marketplace, scope: 'user' | 'project' }`.
  - `POST .../plugins/uninstall` accepts `{ expectedRevision, target }`; targets discriminate package identity from marketplace identity and native scope.
  - `PATCH .../plugins/:name` accepts `{ expectedRevision, target, enabled?, settingsScope?: 'global', settings?: JsonObject }`; settings writes require explicit global scope, replace declared nonsecret global overrides and preserve omitted secrets. Public records distinguish saved global settings from native effective project overrides.
  - `POST .../plugins/:name/update` accepts `{ expectedRevision, target }` under revision CAS.
  - `GET .../plugins/doctor` returns typed native diagnostic checks; `GET .../plugins/marketplace` explicitly refreshes configured native marketplaces.
  - `GET/PUT/DELETE .../plugins/local/:extensionId` manages flat authored `.ts`, `.js`, `.mts`, and `.mjs` files strictly within workspace `.omp/extensions/`.
  - `POST .../plugins/apply` accepts `{ expectedRevision, strategy: 'restart-idle-sessions' }` and uses the current committed revision without another configuration write.
- **Persistence & live apply outcomes:**
  - Changes persist to native `omp-plugins.lock.json`, package metadata/lockfiles and marketplace registries. Existing native project override files remain read inputs; setting writes use real global `PluginManager` methods and never synthesize a project override.
  - The native SDK cannot add new modules to an active extension runner. Explicit Apply reserves all affected roots before retirement, rejects busy/pending-control roots, reopens the same native session files, and reports actual new worker generations.
  - Responses distinguish committed configuration from active session outcomes: `applied`, `partial`, `failed`, or `no-active-workers`, with per-worker revision/error outcomes.
  - The service never reports fake reload success when an extension fails to compile or evaluate in an active worker.
- **Path confinement & safety:**
  - Local extension source files are confined strictly to workspace `.omp/extensions/`, rejecting traversal and symbolic links and validating syntax before atomic commit.
  - Shell injection and directory traversal in plugin specifications and package names are rejected using native validators.
  - No OpenCode plugin adapters; legacy plugin routes and plugin-only configuration helpers are removed. Unrelated provider/MCP integration routes remain with their owning migration slices.
  - Unsupported or synthetic metrics are not invented; public records expose strictly typed fields backed by real native metadata.
- **Module ownership:**
  - Task 52 owns `usePluginsStore.ts`, canonical client plugin methods, and plugin Settings panels.
  - Does not touch web search, session warming, provider management, or file resource (commands/skills/snippets) UI.

## Check

- Unit and contract tests for `PluginCatalogStateSchema`, `PluginInstallRequestSchema`, and local extension schemas.
- Service tests verifying `PluginManager` operations, revision CAS conflict rejection (HTTP 409), and invalid package name rejection (HTTP 400).
- Local extension tests verifying workspace directory confinement and error reporting when extension syntax is invalid.
- UI store tests verifying migration of `usePluginsStore` to CanonicalClient and removal of legacy `/api/config/plugins` routes.
- Parent runs focused tests plus actual Web smoke with a local extension, without requiring external third-party registry grants.

## Acceptance

- [x] Canonical contract defines schemas for plugins, marketplace entries, settings, and local extensions with uint64 decimal revision counters.
- [x] Agent Service and Host Gateway implement `/plugins` workspace endpoints under revision CAS.
- [x] Package lifecycle routes through native `PluginManager`; marketplace lifecycle and native user/project scopes route through `MarketplaceManager`.
- [x] Local extension authoring is confined to workspace `.omp/` extension directories.
- [x] Existing Host enterprise policy guards package-manager and marketplace-refresh egress without a new mode or policy knob.
- [x] `usePluginsStore` uses CanonicalClient; legacy plugin-specific configuration/routes are retired while unrelated provider/MCP integration routes stay with their owning tasks.
- [x] Persistence and active worker reloads return explicit outcomes without fake reload successes.
- [x] Node Host and UI remain free of native SDK imports.

**Coordinator integration status:** Source implementation was integrated into the assembled M3 continuation at `54fbff9c78c1368853a84ab7cc86ca3517b1aacb` from base snapshot `a29e1617b65da9d6d2c07c954a0e2929d62301a2`. Parent-owned package checks, connected Web/Electron verification, and final acceptance remain pending; this record does not claim runtime certification.

## Progress

- **Dependency (2026-10-21):** `Blocked by: 64`. Task64 lands the live-reopen change in `packages/agent-service/src/sessions/registry-native.test.ts`, a file this task's four-file parent packet shares. Wait for Task64 to be archived and landed before running the parent packet; never stage, revert or stash that dirty user-owned test file from the integration tree.
- Dirty at start: none. Manual worktree: `m3-native-plugins`; branch: `m3-native/plugins-20261018`.
- Checks are intentionally not run in this worker; parent owns integrated verification.
- Shared development/spec documentation belongs to the coordinator writer and is intentionally unchanged.
- Runtime surfaces: Web, Electron, hosted mobile and Capacitor use the authenticated Canonical Host Gateway with workspace authorization; native SDK instances stay private to Bun service workers.
- Installed SDK source correction: package installs use `PluginManager.install(spec, options)` and are global-only; marketplace installs use `MarketplaceManager.installPlugin(name, marketplace, { scope: 'user' | 'project' })`. The canonical request discriminates these native sources instead of advertising unsupported generic workspace package scope. Coordinator approved this correction.
- Native configuration is `omp-plugins.lock.json`, plugin package metadata and native marketplace registries, with project overrides in `.omp/plugin-overrides.json`; no `plugins.json` or OpenCode config file is used.
- Native `AgentSession.reload()` only reloads transcript state. Running extension sets cannot load new modules in place. Explicit `POST /plugins/apply` carries `strategy: 'restart-idle-sessions'`, reserves eligible worker generations and uses the persisted session files; normal mutations separately report committed persistence and restart-required worker outcomes.
- Enterprise enforcement uses existing administrator policy only. Native package install/update/uninstall and marketplace routes are gated because package-manager operations can fetch dependencies. Local source, enable/disable and declared setting edits remain inside the local boundary. No new air-gap mode or policy knob is introduced.
- Settings wire values use existing JSON-safe schemas and native declared setting definitions; secret values and native absolute package paths are not public catalog fields.
- Native root correction: `setAgentDir` scopes only agent-specific storage and clears profile selection; it does not own `getPluginsDir`. Workers preserve native `OMP_PROFILE`/`PI_PROFILE` through `setProfile`, use the actual config/profile/XDG plugin root, and return private owner identities to the supervisor. Plugin CAS and global fanout are keyed by that actual native root, independent of provider catalog revisions. Native project fanout follows the actual nearest project registry identity.
- Coordinator decision: settings writes are explicitly global, independent of install scope. `globalSettings` and per-setting `globalConfigured` describe saved native global values; `settings`, `configured`, and `overridden` describe native effective project overrides. Project override files are not written because creating a nested `.omp` would change native project ownership and hide inherited installs.
- All plugin fixtures isolate actual native HOME/config/XDG/profile directories and restore the SDK dirs resolver. No native operation or test has run against ambient user plugin directories; all checks remain deferred to the parent.
- Implementation handoff: native contracts/client/store/UI, lifecycle writers, confined source authoring, explicit idle-session restart Apply, native root/profile ownership, shared-file CAS fanout, and legacy plugin retirement are implemented. Acceptance checkboxes remain pending the parent's integrated verification; no build, test, lint, formatter, smoke, or workflow validation ran in this worker.
- Parent validation, after integrating and rebuilding contract/service artifacts: `bun test packages/agent-contract/src/plugins.test.ts`; `bun test packages/agent-service/src/worker/catalog-plugins.test.ts packages/agent-service/src/worker/session-plugins.test.ts packages/agent-service/src/supervisor/catalog-plugins.test.ts packages/agent-service/src/sessions/registry-native.test.ts --timeout 60000`; `bun test packages/web/server/lib/host/canonical-plugins.test.js packages/web/server/lib/ui-auth/canonical-host-routes.test.js --timeout 60000`; `bun --cwd packages/ui test src/components/sections/plugins/PluginStatusBanner.test.tsx`; affected contract/service/UI/web type-check/lint/build scripts and `bun run dead-code`.
- Connected parent proof must exercise local native extension save/load/edit/delete, global settings versus existing project overrides, idle Apply transcript preservation/generation change, busy/pending-control preflight refusal, two native profiles sharing project files and stale CAS, enterprise refusal and retained-runtime parity. External package/marketplace fetches and packaged/mobile runtime behavior remain unexercised.
- Source-only integration merged core snapshot `a29e1617b65da9d6d2c07c954a0e2929d62301a2` as commit `e49a89741e884c8b6e0e67cc998660f5f825f9bd`, preserving provider49/warming50, helpers46/47, usage54 cold-worker refusal, and search53 behavior. No checks ran.
- Combined admission ordering is intentionally catalog exclusion outside the web-search owner gate. Plugin Apply already holds catalog admission/mutation exclusion across restarts and reuses captured non-reentrant admission authority; acquiring search before catalog in normal admission would invert that order and deadlock a concurrent Apply. Both exclusions and native initialization/registration remain required.
- Task51 is the next true merge dependency. Its trusted Host skill source reconciliation callback must remain inside catalog serialized admission before native launch and captured-generation registration; it is not a model-callable Host action. Final parent application uses only the net diff from the core snapshot to the final combined51+52 commit. The unrelated core websearch locale file remains unchanged for the coordinator's separate repair.

- Verification (2026-10-21, clean integration HEAD `cf18bf59a`): contract 9/9; exact service packet 22 pass / 7 skip / 0 fail (161 expects, 69.72 s; the 7 worker-fixture tests run in a fresh-HOME child and the child exit is asserted); Host plugin file 5/5 (96 expects); combined Host packet 25/28 where the three failures are pre-existing Task54 usage-range tests; PluginStatusBanner 3/3 and PluginsPage 3/3; Agent Service type-check exit 0. Two committed test defects were fixed: the worker plugin fixture now isolates native HOME/XDG state in a re-executed child, and the supervisor admission test now uses the three-argument `CatalogAdmission` contract.
- Real isolated Web smoke (API-only Host, password session, local loopback provider, no external registry): local extension create/read/edit/delete stayed in `.omp/extensions` with committed revisions and CAS; invalid syntax returned 400 without replacing the prior source; enterprise mode kept local authoring and returned 403 `enterprise_mode` for install, uninstall, update and marketplace refresh with the catalog revision unchanged; Apply refused a busy root with 409 `RUN_ACTIVE` and a stale revision with 409 `CATALOG_CONFLICT`.
- Apply fix: the first smoke exposed `SESSION_RESTORE_FAILED` because `restartIdleSessions` passed `entry.input.displayPath` into the strict `WorkerBootstrapSchema` admission, which rejected it with a ZodError. `registry.ts` now strips `displayPath` for admission while keeping it for `openResolved`/reference persistence, matching create and reopen; `registry-native.test.ts` asserts the admission input excludes it. A bounded real-AgentService reproduction then returned 200 `applied` with the worker generation changing (`2f2ea937…` → `065703f7…`), `ready` at the committed revision, the native transcript byte-identical (1297 B), and the authored extension evaluated twice (initial open and restart).
- Receipt: `.workflow/omp-migration/m3/task52-native-plugins-2026-10-21.json`. Limitations: the Web UI bundle was not served (component tests cover rendering); the full Host Apply path was not rerun after the one-line fix (the same production service route was proven); package/marketplace fetches and packaged/mobile runtime behavior remain unexercised.
