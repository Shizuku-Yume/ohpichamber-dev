# 52: Native plugins and extensions

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Canonical workspace plugin and extension management wired to the native `PluginManager` and `MarketplaceManager` in the Bun Agent Service worker. Exposes canonical `/api/agent/v1/workspaces/:workspaceId/plugins` endpoints for plugin listing, installation, uninstallation, enable/disable toggling, updates, doctor diagnostics, and local extension authoring under revision CAS. Replaces legacy `/api/config/plugins` and `/api/integration` routes in `usePluginsStore`, enforces Host enterprise egress boundaries, and reports explicit persistence versus active runtime apply outcomes without fake reload successes.

**Blocked by:** None
**Files:** `packages/agent-contract/src/catalogs.ts`, `packages/agent-contract/src/plugins.ts`, `packages/agent-service/src/worker/catalog-plugins.ts`, `packages/agent-service/src/worker/catalogs.ts`, `packages/agent-service/src/supervisor/workspace-routes.ts`, `packages/web/server/lib/host/canonical-routes.js`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/stores/usePluginsStore.ts`, `packages/ui/src/components/sections/plugins/`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `packages/agent-contract/src/catalogs.ts`; installed native SDK `@oh-my-pi/pi-coding-agent/src/extensibility/plugins/manager.ts` (`PluginManager`), `src/extensibility/plugins/marketplace/manager.ts` (`MarketplaceManager`), and `src/extensibility/plugins/runtime-config.ts`; `packages/ui/src/stores/usePluginsStore.ts`; Host enterprise network boundary policies
**Covers:** W6, W9, W10

## Native SDK References & Implementation Verification Requirements

Plugin and extension lifecycle management references native subsystems in `@oh-my-pi/pi-coding-agent`:
- `extensibility/plugins/manager.ts`: `PluginManager` manages plugin installations, dependency reconciliation (`bun install` in plugins directory), runtime configuration in `plugins.json`, project overrides, enable/disable states (`setEnabled`), settings (`getPluginSettings`, `setPluginSetting`), local package linking (`link`), and environment health checks (`doctor`).
- `extensibility/plugins/marketplace/manager.ts`: `MarketplaceManager` interacts with plugin registries to discover and fetch plugin manifests.
- `extensibility/extensions/loader.ts`: loads native JavaScript/TypeScript extensions and custom tool handlers.
- **Implementation verification requirement:** Implementing agents must verify exact method signatures, options shapes, and configuration file locations against installed SDK source before exporting public contract definitions. Speculative Host SDK proposals are rejected; SDK execution remains strictly within the Bun Agent Service worker.
## Architecture & Boundaries

- **Worker ownership:** Dedicated Bun Agent Service worker owns `PluginManager` and `MarketplaceManager` instances. All plugin installation, file loading, and extension execution occur within the worker runtime. UI and Node Host never import or execute plugin modules.
- **Host authentication & enterprise boundary:** Host Gateway enforces user authentication, workspace authorization, and existing `enterprise-mode.js` policy on all plugin routes. Enterprise policy enforces allowed Git origins for extensions with network access (`extensions.allowedGitOrigins`), refusing unpinned external installations while permitting local workspace extensions.
- **Canonical API & wire contract:**
  - `GET /api/agent/v1/workspaces/:workspaceId/plugins` returns `PluginCatalogState`: `{ workspaceId, revision, plugins: InstalledPluginEntry[], marketplace: MarketplaceEntry[] }`.
  - `POST /api/agent/v1/workspaces/:workspaceId/plugins/install` accepts `{ expectedRevision, spec: string, scope: "workspace" | "global" }` to install from registry or git URL under revision CAS.
  - `POST /api/agent/v1/workspaces/:workspaceId/plugins/uninstall` accepts `{ expectedRevision, name: string }` under revision CAS.
  - `PATCH /api/agent/v1/workspaces/:workspaceId/plugins/:name` accepts `{ expectedRevision, enabled?: boolean, settings?: JsonObject }` under revision CAS. Declared plugin settings use JSON-safe `JsonObject` rather than untyped placeholders.
  - `POST /api/agent/v1/workspaces/:workspaceId/plugins/:name/update` triggers an upgrade under revision CAS.
  - `GET /api/agent/v1/workspaces/:workspaceId/plugins/doctor` returns diagnostic checks (`DoctorCheck[]`).
  - `GET/PUT/DELETE /api/agent/v1/workspaces/:workspaceId/plugins/local/:extensionId` manages local authored extension files within workspace `.omp/plugins/` or `.omp/extensions/`.
- **Persistence & live apply outcomes:**
  - Changes persist to native `plugins.json` and package lockfiles via `PluginManager`.
  - Applying plugins to live worker sessions reloads runtime extensions.
  - Responses distinguish committed configuration from active session outcomes: `{ status: "applied" | "partial" | "failed", workers: PluginWorkerApplyOutcome[] }`.
  - The service never reports fake reload success when an extension fails to compile or evaluate in an active worker.
- **Path confinement & safety:**
  - Local extension source files are confined strictly to workspace `.omp/plugins/` or `.omp/extensions/`.
  - Shell injection and directory traversal in plugin specifications and package names are rejected using native validators.
  - No OpenCode plugin adapters; legacy `/api/config/plugins/*` and `/api/integration/*` routes are removed.
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

- [ ] Canonical contract defines schemas for plugins, marketplace entries, settings, and local extensions with uint64 decimal revision counters.
- [ ] Agent Service and Host Gateway implement `/plugins` workspace endpoints under revision CAS.
- [ ] Plugin installation, uninstallation, updates, and enable/disable states route through native `PluginManager`.
- [ ] Local extension authoring is confined to workspace `.omp/` extension directories.
- [ ] Host enterprise policy guards extension installation via `enterprise-mode.js` (`extensions.allowedGitOrigins`).
- [ ] `usePluginsStore` cuts over to CanonicalClient; legacy `/api/config/plugins` and `/api/integration` routes are retired.
- [ ] Persistence and active worker reloads return explicit outcomes without fake reload successes.
- [ ] Node Host and UI remain free of native SDK imports.
