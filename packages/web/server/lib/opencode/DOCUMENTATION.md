# Host modules under lib/opencode

## Current Composition and Ownership Boundary

In production, the application operates under a split architecture:
- **Host Gateway (Node.js)**: Runs the HTTP server, UI authentication, Host services, filesystem/Git/PTY capabilities, and the route layer.
- **Agent Service (Bun)**: Runs as a separately supervised process through Canonical `/api/agent/v1` and owns OMP SDK workers, agent execution, tool invocation, provider catalogs, and root-worker supervision.

Host-owned route registrars and runtime orchestration modules remain physically located in `packages/web/server/lib/opencode/` for historical packaging reasons. They are Host infrastructure, not OpenCode process owners. Extracted modules under `packages/web/server/lib/host/` are documented in [`../host/DOCUMENTATION.md`](../host/DOCUMENTATION.md).

## Migration status

Task17 Host retirement and connected Task36/Task18 acceptance remain open.

`RUNTIME_NOTES.md` and `references/mcp-spawn-probe.md` are historical diagnostics. They do not describe current OMP behavior.

### Retired Host integration

No production OpenCode process lifecycle, credential reader, global configuration JSONC reader, configuration reload route, configuration mutation response helper, or production proxy registration exists in the Host Gateway:
- **No production Host-managed OpenCode lifecycle**: Normal agent execution uses the Bun Agent Service; isolated-space containers remain the M5 exception. The Host does not spawn or probe a local OpenCode runtime.
- **No OpenCode credential reader**: Legacy `auth.js` was removed. Provider credentials and workspace MCP OAuth are handled through Bun Agent Service contracts and Host private-credential handoff.
- **No global config JSONC reader**: `shared.js` no longer parses or writes OpenCode configuration files. It owns only Markdown/YAML frontmatter parsing and Git ancestor discovery.
- **No configuration reload route**: `POST /api/config/reload` and `config-mutation-response.js` were removed.
- **No production proxy registration**: `proxy.js` is not mounted by production bootstrap. Production session routing and event streaming use Canonical `/api/agent/v1` routes and Host SQLite state. The unmounted proxy remains exclusively as a test fixture for spaces integration tests and unit tests.
- **Isolated-space boundary**: Isolated-space container engines and configurations remain milestone M5 scope; they are not part of the production Host runtime.

For inherited OpenCode 2.x location/MCP startup, catalog, credential, and wire-shape gotchas, consult [RUNTIME_NOTES.md](RUNTIME_NOTES.md); [references/mcp-spawn-probe.md](references/mcp-spawn-probe.md) covers MCP fan-out startup diagnosis. These references are historical and do not describe current OMP Canonical APIs.

## File Inventory and Module Roles

Only the following modules physically exist in this directory:

- `bootstrap-runtime.js`: Composes base Host routes, UI authentication, canonical agent endpoints, notification channels, TTS, and OpenChamber management routes.
- `cli-entry-runtime.js`: Detects direct CLI entry execution and starts the server runtime with parsed arguments.
- `cli-options.js`: Parses command-line flags and environment variables for server startup.
- `core-routes.js`: Registers server status and system endpoints, browser session authentication, WebAuthn passkeys, device pairing, theme endpoints, and common request body parsing middleware.
- `feature-routes-runtime.js`: Registers Host feature route domains (filesystems, environments, quotas, walkthroughs, git, dev servers, session folders, project context, scheduled tasks, tracked items).
- `models-metadata.js`: In-process cache and client projection helper for the `models.dev` catalog.
- `npm-registry-config.js` (`npm-registry-config.d.ts`): Resolves npm registry endpoints and authentication headers from `.npmrc` or environment configurations.
- `openchamber-routes.js`: Registers OpenChamber update checks, update installations, enterprise policy, and model catalog endpoints.
- `proxy.js`: Unmounted legacy OpenCode HTTP/SSE proxy registrar, retained solely as a test fixture.
- `server-utils-runtime.js`: Utility helpers for PATH augmentation, executable resolution, and SSE data payload parsing.
- `session-runtime.js`: In-memory state machine for session activity phases, attention status, and blocking requests, driven by Canonical `/api/agent/v1` events and snapshots.
- `shared.js`: File and path utility helpers for Markdown/YAML frontmatter operations and Git ancestor/worktree resolution.
- `shutdown-runtime.js`: Coordinates graceful shutdown across Host services, HTTP connections, the Bun Agent Service runtime, and SQLite stores.
- `RUNTIME_NOTES.md`: Historical notes covering inherited OpenCode 2.x behaviors; retained for diagnostic reference.
- `references/mcp-spawn-probe.md`: Historical probe notes for MCP fan-out startup diagnosis.

## Module Contracts and Public Exports

### bootstrap-runtime.js
- `createBootstrapRuntime(dependencies)`: Creates the base route bootstrap runtime.
- Returned API:
  - `setupBaseRoutes(app, options)`: Registers base middleware and route sets in execution order:
    1. UI auth controller (`createUiAuth`)
    2. Server status routes (`registerServerStatusRoutes`)
    3. Common request middleware (`registerCommonRequestMiddleware`)
    4. Canonical host routes (`registerCanonicalHostRoutes`)
    5. Notification emit routes (`registerNotificationEmitRoutes`)
    6. Browser auth, passkeys, and client pairing (`registerAuthAndAccessRoutes`)
    7. TTS routes (`registerTtsRoutes`)
    8. Notification subscription and delivery routes (`registerNotificationRoutes`)
    9. OpenChamber updater and model catalog routes (`registerOpenChamberRoutes`)
  - Returns `{ uiAuthController }`.

### cli-options.js
- `parseServeCliOptions({ argv, env, defaultPort, cloudflareProvider, managedLocalMode })`: Parses command-line arguments and environment overrides into a normalized options object:
  - Port (`--port`, `-p`, `defaultPort`)
  - Host binding (`--host`, `-h`)
  - UI password (`--ui-password`, `OPENCHAMBER_UI_PASSWORD`)
  - Cloudflare tunnels (`--try-cf-tunnel`, `--tunnel-provider`, `--tunnel-mode`, `--tunnel-config`, `--tunnel-token`, `--tunnel-hostname`, and matching `OPENCHAMBER_TUNNEL_*` env vars)
  - API-only execution (`--api-only`, `OPENCHAMBER_API_ONLY`)

### cli-entry-runtime.js
- `runCliEntryIfMain(dependencies)`: Checks if `process.argv[1] === currentFilename`. When invoked directly as the CLI entrypoint, parses startup options via `parseServeCliOptions`, sets `setExitOnShutdown(true)`, and calls `startServer(...)`.

### core-routes.js
- `isRequestAuthorized(req, res, { tunnelAuthController, uiAuthController })`: Returns a boolean indicating if a request carries credentials accepted by `/api`, without rejecting unauthorized calls. Used by endpoints open before login to omit private host facts.
- `registerServerStatusRoutes(app, dependencies)`:
  - `GET /health`: Health snapshot, uptime, version, runtime name, compatibility capabilities, and server ID.
  - `GET /api/version`: Basic version and server start metadata.
  - `POST /api/system/shutdown`: Authenticated graceful server shutdown (`exitProcess: true`).
  - `POST /api/system/dev-shutdown`: Development escape hatch; terminates dev process group and loopback preview ports when `OPENCHAMBER_DEV_SHUTDOWN=true`.
  - `GET /api/system/info`: Process ID, runtime name, version, and start time; includes active port and tunnel URL when request is authorized.
  - `GET /api/system/free-port`: Allocates a best-effort free loopback TCP port hint.
- `registerAuthAndAccessRoutes(app, dependencies)`:
  - Session auth: `GET /auth/session`, `POST /auth/session`, `POST /auth/url-token`
  - Passkeys: `GET /auth/passkey/status`, `POST /auth/passkey/authenticate/options`, `POST /auth/passkey/authenticate/verify`, `POST /auth/passkey/register/options`, `POST /auth/passkey/register/verify`, `GET /api/passkeys`, `DELETE /api/passkeys/:id`
  - Reset: `POST /api/auth/reset`
  - Remote client auth & device pairing: `GET /api/client-auth/clients`, `POST /api/client-auth/clients`, `DELETE /api/client-auth/clients/:id`, `DELETE /api/client-auth/clients`, `POST /api/client-auth/pairing/sessions`, `GET /api/client-auth/connection/candidates`, `GET /api/client-auth/pairing/transports`, `GET /api/client-auth/pairing/sessions`, `DELETE /api/client-auth/pairing/sessions/:id`, `POST /api/client-auth/pairing/redeem`
  - Direct connection exchange: `GET /connect`
  - Utility URL probe: `POST /api/system/probe-url`
  - Route guard: `app.use('/api', ...)` enforcing UI session or client bearer token authentication.
- `registerSettingsUtilityRoutes(app, dependencies)`:
  - `GET /api/config/themes`: Lists custom themes from disk.
  - `POST /api/config/themes`: Saves imported theme palette into user custom themes directory.
  - `DELETE /api/config/themes/:id`: Deletes custom theme by metadata ID.
  - Registers theme catalog routes via `registerThemeCatalogRoutes(app)`.
- `registerCommonRequestMiddleware(app, dependencies)`: Shared middleware applying body size limits (`/api/config/themes`, `/api/behavior`, `/api/source-control`, general `/api` routes), bypassing parsed bodies for isolated space requests (`skipBodyParsing`), protecting `/api/agent/v1` from urlencoded tampering, and handling request logging.

### feature-routes-runtime.js
- `createFeatureRoutesRuntime()`: Composes feature route modules.
- Returned API:
  - `registerRoutes(app, routeDependencies)`: Wires filesystem, environment, quota, walkthrough, session goal, source control, linear, guest plugins, git, dev server, magic prompts, session folders, project context, agent memory, session knowledge, message search, permission auto-accept, message queue, routing, themes, project icons, scheduled tasks, tracked items, and markdown image grant routes. Host settings routes are not registered here; Host composition registers `GET`/`PUT /api/config/settings` from `lib/host/settings-routes.js` before this method runs.
  - `getSkillRepositoryDependencies()`: Provides Git credential helper dependencies for skill repository operations.
  - `publishRepositoryCredentialEndpoint()`: Publishes Git credential helper IPC endpoint.

### models-metadata.js
- `getModelsMetadata({ url, ttlMs, timeoutMs } = {})`: Fetches and caches the `models.dev` model catalog in memory (default 10-minute TTL), with fallback to stale cache on network failures.
- `toClientModelsMetadata(metadata)`: Projects the raw catalog to provider IDs and client-needed model capabilities (`id`, `name`, `tool_call`, `reasoning`, `temperature`, `attachment`, `structured_output`, `modalities`, `cost`, `limit`, `knowledge`, `release_date`, `last_updated`).

### npm-registry-config.js
- `resolveNpmRegistryRequest(packageName, metadataPath)`: Parses npm registry configuration from process environment (`npm_config_*`, `NPM_CONFIG_*`) and user `.npmrc`. Supports scoped registries (such as `@scope:registry`) and resolves Bearer token or Basic authentication headers. Exported type declarations live in `npm-registry-config.d.ts`.

### openchamber-routes.js
- `registerOpenChamberRoutes(app, dependencies)`:
  - `GET /api/openchamber/enterprise-policy`: Returns public enterprise mode policy.
  - `GET /api/openchamber/update-check`: Checks for application updates.
  - `POST /api/openchamber/update-install`: Initiates update installation (delegated to Electron `desktopUpdater`, systemd transient units, macOS launchd kickstarts, or Windows `.cmd` scripts).
  - `GET /api/openchamber/models-metadata`: Returns projected `models.dev` metadata.

### proxy.js (Unmounted Test Fixture)
`proxy.js` is not mounted by the production server bootstrap. It is retained strictly as a test fixture for spaces integration tests (`grants.docker.live.test.js`, `sessions.docker.live.test.js`) and unit test suites (`proxy.test.js`, `proxy-agent-wiring.test.js`, `proxy-host-metadata.test.js`).
- `createOpenCodeProxyAgent(target)`: Builds keep-alive `http.Agent` or `https.Agent` with connection pooling.
- `createDirectoryQueryCanonicalizer({ realpath, ...cacheOptions })`: Canonicalizes directory query parameters with caching.
- `normalizeForwardedDirectoryHeaders(headers)`: Ensures consistent directory header formatting.
- `createSseBoundaryTracker()`: Tracks SSE chunk boundaries across network frames.
- `registerOpenCodeProxy(app, deps)`: Registers legacy `/api/*` proxy middleware, SSE forwarding (`GET /api/global/event`, `GET /api/event`), session message posting (`POST /api/session/:sessionId/message`), session CRUD mutations, and session list projections.

### server-utils-runtime.js
- `createServerUtilsRuntime({ os, path, process, getLoginShellPath? })`:
  - `buildAugmentedPath()`: Merges process `PATH` and login shell `PATH`, prioritizing user-configured directories.
  - `searchPathFor(binaryName, searchPath?)`: Locates an executable file on the PATH.
  - `isExecutable(filePath)`: Verifies file existence and executable permissions.

### session-runtime.js
- `createSessionRuntime({ broadcastEvent, now = Date.now })`: Maintains session activity and attention state.
- Returned API:
  - `applySnapshot(snapshot)`: Ingests canonical session snapshot from the Bun Agent Service, updating session status, active run ID, and blocking approval/question entries.
  - `processCanonicalEvent(event)`: Ingests canonical stream events (`session.status`, `session.idle`, `session.interrupted`, `session.error`, `run.created`, `run.completed`, `run.failed`, `approval.requested`, `approval.resolved`, `question.asked`, `question.answered`), transitioning status, attention flags, and busy/cooldown/idle activity phases.
  - `getSessionState(sessionId)`: Returns current status, run ID, and metadata for a session.
  - `getSessionStateSnapshot()`: Returns map of all tracked session states.
  - `getPendingBlockingRequestsSnapshot()`: Returns map of pending approvals and questions by session ID.
  - `getSessionActivitySnapshot()`: Returns map of session activity phases.
  - `getActiveSessionCount()`: Returns count of sessions currently in `busy` phase in O(1).
  - `getSessionAttentionSnapshot()`: Returns map of session attention states.
  - `getSessionAttentionState(sessionId)`: Returns attention record for a session.
  - `markUserMessageSent(sessionId)`: Records user message timestamp for attention calculation.
  - `markSessionViewed(sessionId, clientId)`: Clears attention when viewed by a client.
  - `markSessionUnviewed(sessionId, clientId)`: Removes client from session viewer set.
  - `interruptBusySessionsAfterRestart()`: Transitions live sessions to `unavailable` with reason `agent-service-restart`, clears pending requests, settles cooldowns, and broadcasts `openchamber:session-interrupted`.
  - `dispose()`: Clears state maps and cleanup interval timer.

### shared.js
- `parseMdFile(filePath)`: Reads and parses Markdown files with YAML frontmatter, handling BOM and lenient colon parsing.
- `writeMdFile(filePath, frontmatter, body, { flag = 'w' } = {})`: Serializes frontmatter YAML and body, writing to disk.
- `getAncestors(startDir, stopDir)`: Returns array of directory paths from `startDir` ascending to `stopDir` or filesystem root.
- `findWorktreeRoot(startDir)`: Ascends directory tree to find the root containing `.git`.

### shutdown-runtime.js
- `createGracefulShutdownRuntime(dependencies)`: Coordinates graceful server teardown.
- Returned API:
  - `trackServerConnections(server)`: Tracks TCP connections on the HTTP server to enable clean socket destruction during teardown.
  - `gracefulShutdown(options = {})`: Executes phased shutdown sequence:
    1. Closes guest admission and stops relay reconcile timer.
    2. Stops guest surface runtimes, realtime proxy, and spaces host (`getSpacesHost()?.close()`).
    3. Stops relay service, dictation, auto-accept, and session runtimes (`sessionRuntime.dispose()`).
    4. Stops session assist, work, goal, context, queue, dispatch, search, and scheduled task runtimes.
    5. Shuts down terminal and message stream runtimes.
    6. Stops guest services.
    7. Closes HTTP listener and destroys remaining tracked sockets.
    8. Closes Host Agent Service runtime (`await hostAgentRuntime.close()`).
    9. Closes Host SQLite metadata connection (`await hostSessionState.close()`).
    10. Disposes UI auth controller and active tunnel controller.
    11. Exits process if configured (`exitProcess: true`).
  - Does not start, stop, or probe OpenCode child processes.

## Credential Architecture and Storage

- **Native Workspace Credentials**: Managed through Canonical `/api/agent/v1` routes:
  - Provider configurations and credentials: `/api/agent/v1/workspaces/:workspaceId/providers/...`
  - MCP server definitions and OAuth: `/api/agent/v1/workspaces/:workspaceId/mcp/...`
  - Handled by the Bun Agent Service worker/supervisor with Host origin and authorization gating.
- **Host Private Credential Handoff and Resolution** ([`../host/private-credential.js`](../host/private-credential.js)):
  - User-selected credential files are validated and passed via `POST /api/agent/v1/credentials/preflight` to `/internal/workspaces/:workspaceId/credentials/handoff`.
  - Authorized Host consumers (such as Quota in `lib/quota/routes.js` and TTS in `lib/tts/routes.js`) resolve credentials through `createCatalogCredentialSelections` querying provider catalogs and resolving secrets internally without exposing keys to the browser.
- **Durable Operational Storage**: Stored in Host SQLite (`host-metadata.sqlite`):
  - Session operational metadata (progress, assist recaps, context markers, linked issues).
  - Custom session titles and workspace association.
  - Archive status (`session_archive` table).
  - Folder hierarchy and agent scopes.
  - Tool approval policies (`host-approval-policies.sqlite`).

## Retired Components and Removed Interfaces

The following legacy components and interfaces were removed from this directory and are not current APIs or exports:
- **OpenCode Process Lifecycle (`lifecycle.js`)**: Startup, process spawning, port discovery, readiness polling, health monitoring, and restart orchestration were removed. The Bun Agent Service is managed independently via the supervisor in `../host/agent-service-supervisor.js`.
- **OpenCode Credential Reader (`auth.js`)**: Legacy OpenCode credential file reading (`readOpenCodeCredentials`, `configureOpenCodeCredentials`, `openCodeCredentialSource`, `getProviderAuth`, `projectCredentialEntries`, `projectEnvironmentKeys`) was deleted.
- **Global Config JSONC Reader**: `readConfigFile`, `readConfigLayers`, and configuration constants (`OPENCODE_CONFIG_DIR`, `CONFIG_FILE`) in `shared.js` were removed.
- **Configuration Reload Route**: `POST /api/config/reload` and `config-mutation-response.js` (`buildExternalManualRestartResponse`) were removed.
- **CLI Upgrades and Compatibility**: `cli-upgrade.js`, `upgrade-capability.js`, `compatibility.js`, and endpoints `/api/opencode/upgrade`, `/api/opencode/upgrade-status`, `/api/opencode/version`, `/api/opencode/compatibility`, and `/api/opencode/install-v2` were removed.
- **V1-to-V2 Database Migration Top-Up**: `v1-migration-topup.js` and route-only entity converters were removed.
- **Environment & Binary Runtimes**: `env-runtime.js`, `provider-env-aliases.js`, `env-config.js`, and `hmr-state-runtime.js` were removed.
- **Production Proxy Registration**: `registerOpenCodeProxy` is unmounted in production. Production session execution and events use `/api/agent/v1` routes.
- **Legacy Config Routes**: Routes `/api/config/commands`, `/api/config/snippets`, `/api/config/skills`, `/api/config/plugins`, `/api/config/websearch`, `/api/websearch/provider`, and `/api/config/warming` were deleted without aliases.
