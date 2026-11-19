# Host Runtime Documentation

## Purpose

`packages/web/server/lib/host/` owns Host Gateway infrastructure that is retained independently of the OpenCode integration. These modules keep settings, themes, projects, networking, tunnels, startup, static serving, canonical execution routing, and managed-process cleanup available to Web, PWA, Electron, and hosted mobile surfaces.

## Modules

- `settings-runtime.js`, `settings-files.js`, `settings-helpers.js`, `settings-normalization-runtime.js`, `settings-registry.json`, and `input-history-scope.js` implement the four-tier Host settings document, normalization, persistence, and input-history policy. `settings-routes.js` registers `GET`/`PUT /api/config/settings`; Host composition owns that registration so the route does not depend on the OpenCode integration directory.
- `theme-runtime.js`, `theme-catalog.js`, and `theme-archive.js` validate custom themes, discover remote theme packages, and import selected VS Code palette data from bounded `.vsix` archives. Theme import consumes data only; it never executes extension code.
- `tunnel-auth.js` and `tunnel-wiring-runtime.js` protect and compose retained development-tunnel and relay routes.
- `pwa-manifest-routes.js` generates the dynamic install manifest. Recent-session shortcuts are read only for authorized callers from `openChamberSessionService.list()`, scoped by the preferred directory to registered Host workspace scope IDs (exact or descendant); titles never appear in an unauthorized manifest and failures leave only the fixed shortcuts.
- `project-directory-runtime.js` resolves and validates workspace roots; `project-icon-routes.js` owns project icon upload, discovery, and serving. Discovery treats a project with no favicon as a successful empty result (`200 { skipped: true, reason: 'no-favicon-found' }`), so adding a project never surfaces a console error for the ordinary case; an unknown project and a failed favicon read stay 404/500.
- `path-utils.js` owns shared PATH heuristics and merge utilities used by Electron's login-shell environment setup and Host command environment resolution. It is Host infrastructure, not an OpenCode lifecycle owner.
- `executable.js` checks that a path names a regular executable file. The retained terminal shell resolver uses this Host-owned probe without importing legacy OpenCode environment utilities.
- `sse-stream.js` owns response backpressure for Host event streams. The allowlisted session-list projection was deleted with the removed proxy and space session merge.
- `server-startup-runtime.js`, `startup-pipeline-runtime.js`, and `static-routes-runtime.js` own Host HTTP startup, static assets, SPA fallback, and manifest wiring.
- `agent-service-supervisor.js` and `agent-service-supervisor.d.ts` start the separate Bun service, discover its loopback endpoint, supervise lifecycle, verify Linux process birth identity, handle worker operation authorization, route native approval policy IPC, and answer the service's private spawn-IPC request for the internal token (never via the environment).
- `agent-runtime.js` integrates the supervisor, scope runtime, approval policy store, and worker operation authorizer, resolving authorized workspace and session scopes for Host operations.
- `agent-scope-store.js` and `agent-scope-runtime.js` manage project, directory, workspace, and session containment in Host SQLite, validating roots against configured projects, Git worktrees, and managed chats.
- `session-state.js` opens `host-metadata.sqlite` and returns `sessionMetadataStore`, `archiveStore`, `sessionFoldersStore`, `agentScopeStore`, `attachmentStore`, `initialize()`, `flush()`, `close()`, and `databasePath`.
- `metadata-sqlite.js` supplies the SQLite schema, typed errors, transactions, table management (`session_metadata`, `session_archive`, `session_folders`, `session_folder_scopes`, `host_agent_projects`, `host_agent_directories`, `host_agent_workspaces`, `host_agent_sessions`, `host_attachments`, `metadata_conversion`), and lifecycle admissions.
- `attachment-store.js` and `attachment-routes.js` store attachment binaries (`0600`) and metadata in SQLite, providing scoped upload, validation, retrieval, and prompt-delivery resolution.
- `private-credential.js` implements explicit selected credential handoff to Bun `AuthStorage` and private credential resolution for quota, TTS, and routing consumers.
- `approval-policy-store.js` owns `host-approval-policies.sqlite` for persistent tool-input allow and deny decisions.
- `worker-operation-authorizer.js` and `worker-authorization-channel.js` authorize worker operations against Host workspace policies and approval store records.
- `canonical-routes.js` registers `/api/agent/v1` routes: status, ready, capabilities, projects, workspaces, queue, sessions, attachments, credentials preflight, and proxied agent routes with strict schema validation and scope authorization.
- `mcp-oauth-callback.js` owns the public `GET /api/agent/v1/mcp/oauth/callback` page a browser returns to when a remote or mobile session signs in to an MCP server. The Host records the pending flow's `state` (read from the `start` response's authorization URL) in a bounded in-memory map; the callback consumes that entry and hands the rebuilt callback URL to the same endpoint's `complete` action. Unknown, expired and replayed states render a readable error page and never reach the Agent Service. Enterprise mode refuses the page with `403 enterprise_mode`. The map is process memory: a Host restart ends in-flight remote sign-ins, which the UI reports as a failed flow.
- Native plugin routes in `canonical-routes.js` keep package managers, marketplace fetches and extension source operations behind production Host authentication, origin checks, workspace authorization and canonical request/response schemas. The Bun service alone owns native SDK instances. Enterprise authority is read for every package install/update/removal and marketplace fetch; refusals are HTTP 403 `enterprise_mode`. Catalog reads, enable/disable, settings and workspace-confined local extension authoring remain available. Web/PWA, Electron, hosted mobile and Capacitor share this gateway; no native plugin execution is added to Node or the UI. Legacy `/api/config/plugins` route registration is retired; unrelated provider/MCP `/api/integration` callers are unchanged.
- Explicit `POST /workspaces/:workspaceId/plugins/apply` uses the same canonical gateway schema, origin and workspace gates and remains available in enterprise mode. It requests a deliberate restart of idle native sessions at the existing persisted revision; the Bun supervisor rejects busy or pending selected roots before retiring any worker and reports actual new generations or individual failures. Mutations alone never trigger session restarts.
- `bootstrap-runtime.js`: Composes base Host routes, UI authentication, canonical agent endpoints, notification channels, TTS, and OpenChamber management routes.
- `cli-options.js`: Parses command-line flags and environment variables for server startup.
- `cli-entry-runtime.js`: Detects direct CLI entry execution and starts the server runtime with parsed arguments.
- `core-routes.js`: Registers server status and system endpoints, browser session authentication, WebAuthn passkeys, device pairing, theme endpoints, and common request body parsing middleware.
- `feature-routes-runtime.js`: Registers Host feature route domains (filesystems, environments, quotas, walkthroughs, git, dev servers, session folders, project context, scheduled tasks, tracked items).
- `models-metadata.js`: In-process cache and client projection helper for the `models.dev` catalog.
- `openrouter-model-info.js`: In-process cache and local id matching for OpenRouter's public model list, behind `POST /api/openchamber/openrouter/model-info` for Models-dialog auto-fill; refused in enterprise mode before any request.
- `openchamber-routes.js`: Registers OpenChamber update checks, update installations, enterprise policy, and model catalog endpoints.
- `server-utils-runtime.js`: Utility helpers for PATH augmentation, executable resolution, and SSE data payload parsing.
- `session-runtime.js`: In-memory state machine for session activity phases, attention status, and blocking requests, driven by Canonical `/api/agent/v1` events and snapshots.
- `shared.js`: File and path utility helpers for Markdown/YAML frontmatter operations and Git ancestor/worktree resolution.
- `shutdown-runtime.js`: Coordinates graceful shutdown across Host services, HTTP connections, the Bun Agent Service runtime, and SQLite stores.

## Ownership boundary

The Host modules do not own OpenCode lifecycle, proxying, SSE watching, snippets, agent configuration, legacy credentials, filesystem APIs, Git, PTY, or guest services. Those remain in their existing modules until their coordinated migration tasks. Private SDK objects, `SessionManager`, and `AuthStorage` exist inside Bun workers only; the Node Host never imports or loads the OMP SDK. Host SQLite retains authority over opaque root, workspace, and session scopes, operational metadata, attachments, and approval policies. Canonical credential preflight owns explicit user-selected handoff to Bun `AuthStorage` and private lookups for Host consumers, with zero startup import or credential enumeration. The OpenCode integration may compose Host routes and inject retained engine dependencies, but Host modules do not provide path aliases or compatibility re-exports for the old directory.

## Retained behavior

Settings are persisted atomically with profile/device/surface scope handling. `GET`/`PUT /api/config/settings` are registered by Host composition through `settings-routes.js`, before the OpenCode integration's feature routes; `feature-routes-runtime.js` no longer registers them. The routes read and persist through the injected Host settings owner and keep their existing query/header surface selection, response shape, and 500 error payloads. Theme imports validate package identity, checksums, archive bounds, and authored palette data. Project and network routes preserve path validation and rebinding protections. Startup continues to publish the listener before managed lifecycle work, serves static/PWA routes, and records the same diagnostic phases. Managed-process cleanup remains asynchronous and verifies process identity before reaping.

The production startup pipeline starts only the canonical Agent Service after publishing the Host listener, publishing Git's credential-helper endpoint and attaching process handlers. Web and Electron share this pipeline; Electron still embeds the Node Host in its main process. Terminal, dictation, message-stream and static/FS routes remain registered before the listener. The supervisor marks service readiness only after an internal-secret-authenticated `/api/agent/v1/ready` response validates against the canonical schema. Service startup failure is reported and leaves canonical operations unavailable rather than redirecting them to OpenCode. Production startup no longer bootstraps or detects an OpenCode server; legacy lifecycle controls remain reachable only through unmigrated explicit callers.

`createHostAgentRuntime` exposes `start()` and `stop()` for supervisor lifecycle and `close()` for final Host teardown. Stopping the service preserves the approval policy store for a later start; final close stops the service and closes that store, and prevents another start.

The embedded desktop supplies the selected Bun interpreter and service entrypoint before Host import; the Host does not repeat auto-detection for that explicit pair. An OMP executable selected as the Bun interpreter travels with `BUN_BE_BUN=1` from the selector through the Host to the service and its workers. A plain Bun override does not require the flag.

`createAgentServiceSupervisor` exposes refcounted `holdRestarts()`/`resumeRestarts()`. While a hold is active, `scheduleRestart` returns without consuming a restart attempt and `start(true)` spawns nothing; any pending restart timer is cleared. `resumeRestarts` drops one hold; when the count reaches zero without an active child process, it reuses the existing `start(true)`. An explicit stop clears all active holds. Host composition installs one hold around a worktree archive: it acquires the Agent Service lease using a Host-generated ID, then releases the ID and resumes restarts in the matching `finally` block. If the service crashes during an archive operation, no replacement generation spawns until removal finishes and the lease is released; the supervisor then starts a single restart generation.

The agent-service registry records the actual Linux process birth identity when registering it. Reaping requires that identity and the recorded binary/entrypoint, checked again before signalling; an assigned ephemeral port is not compared with the literal `--port 0` command. Missing birth verification leaves the process untouched. Non-Linux agent orphan reaping remains unverified and refuses to guess identity. Legacy managed registrations remain until task17 retires their callers.

On Linux x64 and arm64, the process-cleanup helper can call the same kernel pidfd operations through libc's `syscall` when glibc lacks the named wrappers. An unsupported kernel still fails closed; cleanup never falls back to numeric PID signalling.

## Operational session state

`createHostSessionState({ dataDir, fsPromises?, path?, now? })` opens `host-metadata.sqlite` under the Host data directory and returns `sessionMetadataStore`, `archiveStore`, `sessionFoldersStore`, `agentScopeStore`, `attachmentStore`, `initialize()`, `flush()`, `close()`, and `databasePath`. Composition injects these stores into the sessions service, feature routes, canonical gateway, and session projections. Route registration does not create hidden connections.

SQLite is the durable authority for operational metadata, workspace associations, archive timestamps, folder membership, agent scopes, and attachments. Session titles come from OMP: the Host composes `RuntimeSession.title`, and title changes go through the Agent Service title route. Legacy `session_metadata.payload.title` values are ignored on read. SQLite is not a transcript store. Legacy Host goal metadata may remain in stored session metadata but is ignored by native OMP goals; assist recaps, delivered-knowledge and obligatory-context markers, project-context pins, linked issues, work lineage, side-thread links, and multirun grouping remain ordinary metadata fields. Cross-device pins (`pinned`), the unread watermark (`workbench`), and the last run's length (`turn`) are the same kind of field: `openchamber-sessions/turn-duration.js` writes `workbench.lastIdleAt`/`lastTurnOutcome` and `turn` from canonical `run.completed`/`run.failed`/`run.cancelled` events, matched to the run's own `run.started` by `runId`, and skips subsessions whose runs roll up into the root. Any committed metadata write broadcasts `openchamber:session-metadata` on the UI event stream. `unread-baseline.js` stays dormant: it exists only to migrate marks from the retired runtime. Metadata archive records remain independent. Legacy `SpaceArchive` remains until task17 retires it; task17 must retire legacy space archive rather than deferring it to M5.

Worktree archive session associations and operation progress reside in Host SQLite, while Git refs enumerate archives. The Host session owner captures admitted checkout sessions, preserves previously archived state, and coordinates restore and deletion through a claimed binding and per-session progress. Unbound legacy refs have no authoritative session association. If restore or ref finalization is ambiguous, the Host retains the binding and refuses to infer success from an absent ref. This implementation remains subject to task 35's real Host/browser and full-gate proof; see the task record for recovery and acceptance requirements.

Worktree capture, restore claims, and target pins refuse overlapping session admissions, generic deletions, and relocation intents. In-flight session creation, forking, and reopening retain a Host SQLite admission until native execution and Host registration finish; directory discovery uses a transient reservation. An uncertain native outcome fences subsequent admissions and archives in that scope across Host restart, returning a non-retryable 409 without recording completion. Because native fork IDs are generated internally by the SDK, existing owners cannot identify partially initialized children after a lost response. No automatic retry, deletion, or manual clearance is permitted without verified native outcome evidence. The one verified recovery is a root `create` admission left by an earlier Host process: the Host chose its root id, so before the next admission in that scope the Host reads the Agent Service's complete session listing for the admission's workspace, registers any listed session with that root, and then releases the admission. An absent root can leave only an empty native session file, which the Agent Service listing excludes everywhere; a native file with content appears in the same listing and is registered by ordinary discovery. A listing with per-session errors leaves the fence in place. Fork and reopen admissions, and uncertain admissions of the current process, stay fenced. A worker initialization refusal carries its projection status (for example 422 `MODEL_UNAVAILABLE`), so a refused create never becomes uncertain. Settled admissions release their fence normally.

Metadata merge patches are serialized per session. Their read, decision, merge and revision increment commit inside one SQLite transaction. Revisions are decimal strings, independent of wall-clock time. `get(id)` returns metadata or `null`; `getState(id)` returns `{ metadata, revision }` or `null`. Missing is not corrupt: malformed payloads and SQLite read/write failures throw `METADATA_CORRUPT`, `METADATA_READ_FAILED`, or `METADATA_WRITE_FAILED`. Metadata writes return `{ metadata, revision, changed }`; an unchanged conditional decision does not publish a change.

The database file is created at `0600` before SQLite opens it. New database directories use `0700`; existing database, WAL and SHM files are tightened to `0600` on reopen without changing an existing data root's permissions.

Metadata and archive `listAll()` return `{ entries, errors, conversion }`: valid entities remain available beside per-entity error codes. `conversion` carries its status and, for source-wide failure, a code. An absent entry under a source-wide conversion error is unknown, not authoritative empty state. Folder scopes are separate rows; the folder read returns `{ snapshot, revision, errors, conversion }`, so one corrupt scope does not hide valid siblings. Archive `null` timestamps are durable restore tombstones. Folder deletion tombstones keep their existing 30-day retention and merge policy.

Canonical session projections omit the `archivedAt` field for an unarchive tombstone but retain `archiveRevision`. A failed session enrichment remains a per-session error beside healthy items; it does not erase the complete workspace page or prevent those sessions from being observed.

### Canonical agent scope and containment

`createHostAgentScopeRuntime` and `createAgentScopeStore` manage directory and session authority in `host-metadata.sqlite`. Configured Host projects (`readSettings().projects`), their registered Git worktrees (`getWorktrees()`), and managed chats (`managedChatsScope`) define canonical containment. Client path hints are unverified.

The configured managed chats namespace takes precedence over overlapping configured projects and worktrees during directory resolution. Resolving a previously admitted chat therefore retains its managed workspace identity after settings changes and Host restart; existing explicit projects and historical SQLite rows are not pruned or rewritten. Managed admission failures are not retried as project admission. The settings runtime receives the same configured `managedChatsRoot` (`OPENCHAMBER_CHATS_DIR`) from Host composition and excludes canonically contained directories from automatic legacy `lastDirectory` promotion only. Root and candidate aliases are resolved on disk; ordinary legacy directories still migrate and explicit configured projects remain intact.

All directories are resolved through `fsPromises.realpath` and validated through `validateDirectoryPath`. A declared workspace must be contained within its validated project root or registered worktree. Managed chat directories must be contained within `managedChatsScope.root`. Scope mapping records rows in `host_agent_projects`, `host_agent_directories`, `host_agent_workspaces`, and `host_agent_sessions`. Offline known sessions authenticate against pure Host metadata without contacting external runtimes. When a session or workspace is accessed, `createHostAgentRuntime` resolves the scope, resolves environment variables via `getEnvironmentForDirectory(cwd)` (omitted in enterprise mode), and registers the workspace with the supervisor before admitting operations. That overlay is passed to worker admission, not into the service environment. The supervisor and worker registry build their environments from explicit allowlists; a worker receives the authorized overlay plus OMP `AuthStorage` but no ambient Host credentials, and the overlay cannot supply the internal secret, the managed-process token, the worker's `PI_CODING_AGENT_DIR`, `OMP_PROFILE` or `PI_PROFILE` (case-insensitive).

Historical usage (`GET /api/agent/v1/usage` and `/usage/tools`) validates optional inclusive `from` and exclusive `to` bounds (omitted `to` defaults to now), viewer IANA timezone, and optional opaque project/workspace IDs. The Host resolves and authorizes both global and filtered scope sets before sending a private usage query to Bun. The service may read only registered native references in that set; client filesystem paths and the process-global OMP statistics database are never query sources. Node performs no transcript parsing or native SDK imports. Partial source failures retain healthy siblings; total source failure remains an error.

### Attachment store and routes

`createAttachmentStore` stores binary files under `attachments/` in the data directory with `0600` permissions (`att_[A-Za-z0-9_-]{24}.bin`). Metadata is committed transactionally to `host_attachments` in `host-metadata.sqlite` with `attachmentId`, `projectId`, `workspaceId`, `agentDirectoryId`, `name`, `mediaType`, `size`, `storageName`, and `createdAt`.

Attachment uploads pass scope validation, media type checks, and byte-length verification against submitted metadata. Downloads verify that the requesting scope matches the recorded row. For prompt delivery, `resolveAttachments` verifies each attachment reference against the authorized scope and resolves absolute filesystem paths for private handoff to Bun workers.

### Conversion and consent

Initialization converts `sessions-metadata.json`, `sessions-archive.json`, and `sessions-directories.json` as operational sidecars. Valid records and durable completion receipts commit together. Originals remain byte-for-byte intact; successful receipts prevent stale replay after restart. Partial folder conversion has per-scope receipts so a repaired missing scope can be imported without replaying already-converted deletions. Existing SQL records take precedence over legacy source records.

Inherited execution projections are a separate, explicit conversion capability, never an initialization read or metadata fallback. `POST /api/openchamber/sessions/metadata/import` requires Host authentication, the injected `isRequestOriginAllowed(req)` gate, `intent: "operational-metadata-conversion"`, `consent: true`, a source identifier, and 1–200 selected `{ id, directory? }` entries. The injected `readLegacySessionProjection(id, { directory })` retrieves only each selected session projection. No message or transcript endpoint is involved. The response contains per-ID outcomes and code-only errors; receipts are keyed by both source and selected session ID, so later selections under the same source still convert.

Each selected directory passes the existing Host directory validator before the reader runs. Its canonical target is checked again so an allowed alias cannot bypass a refused target. Every declared source directory must resolve to that same authorized directory. Missing, refused or conflicting scopes return per-ID `METADATA_READ_FAILED` without a committed row or receipt; valid siblings continue.

### Lifecycle and retained surfaces

Every store read, conversion, explicit import, and write is admitted through its lifecycle owner. `close()` fences new admissions immediately, drains admitted work, and closes the sole connection only after all stores finish. It is idempotent. Composition stops HTTP admission and producers before closing the owner; `flush()` alone does not fence producers.

- Web/PWA uses the Host routes and SQLite owner.
- Electron uses the same Host routes and owner in its retained server process, without importing the OMP SDK in main or renderer processes.
- Hosted mobile uses the active Host through shared runtime transport.
- Capacitor mobile uses the active Host through shared runtime transport and its existing origin allowlist. Local workers and credential stores are absent.
- Guest scope actions remain capability-scoped; scoped asset tokens do not authorize the canonical gateway namespace, and opaque-origin mutations are refused.
- VS Code is retired; this change adds no support for it.

The composed Node Host/Bun scenario has verified these boundaries on Linux, including cold service reopen, scoped Guest actions, metadata/archive access while the service is stopped, explicit credential handoff, and canonical completion notification fan-out. Owning evidence is recorded in `.workflow/development.md`. Task 17 now wires production service startup and final shutdown ownership; integrated Web/Electron launch certification and final legacy retirement remain blocked by unmigrated callers and packaged Agent Service staging.

## Canonical gateway and credential handoff

`registerCanonicalHostRoutes(app, { express, service, uiAuthController, tunnelAuthController, isRequestOriginAllowed, enterprisePolicyOptions, resolveWorkspaceScope, resolveWorkspaceDirectory, resolveSessionScope, resolveHostSessionScope, listProjects, listWorkspaces, resolveCredentialHandoff, queueRoutes, sessionRoutes, attachmentRoutes })` registers the `/api/agent/v1` namespace.

### Status and authentication

- `GET /health` is optional-auth and returns `{ "status": "ok", "engine": "omp", "agent": { "status": phase, "ready": phase === "ready" } }`, reflecting Host liveness and supervisor phase.
- `GET /ready` is optional-auth. If the supervisor phase is not `ready`, or the private service `/api/agent/v1/ready` check fails, it returns HTTP 503 `SERVICE_UNAVAILABLE`. When ready, it returns `AgentServiceReadySchema`.
- `GET /capabilities` requires Host authentication. It queries service capabilities and exposes `RuntimeCapabilitiesSchema`, setting `followUpQueue: true`, `credentialHandoff: true`, `documentExtraction: false`, and omitting internal attachment flags.
- `GET /projects` returns `listProjects()`.
- `GET /workspaces` returns `listWorkspaces(projectId)`.
- Locally owned queue routes are mounted under `/sessions/:sessionId/queue` with an authenticated 1 MiB strict JSON parser, running delivery before any SDK proxy. Attachment uploads keep their separate 20 MiB parser.
- Locally owned session routes are mounted under `/sessions`.
- Locally owned attachment routes are mounted under `/attachments`.

Authentication requires a validated UI cookie (`ui-session` or signed `ui-passwordless`), a paired bearer token, or a tunnel session. URL/Guest asset tokens and `X-Internal-Secret` are not external credentials. Protected routes use `allowAnonymousSession: false`. Mutations and requests with an explicit `Origin` header require `isRequestOriginAllowed(req)`; disallowed or opaque `Origin: null` headers are refused with 403 `INVALID_ORIGIN`. Enterprise mode policy is read at use time and returns 403 `enterprise_mode` for provider entry operations. Responses use `Cache-Control: no-store`.

### Speculative session preparation

`POST /api/agent/v1/sessions/prepare` and `DELETE /api/agent/v1/sessions/prepare` manage bounded speculative preparation for fast new-chat latency:
- `POST /prepare` accepts `{ projectId, workspaceId }` and starts background session admission and worker warmup. If an admission is already in flight or prepared for the workspace, the existing promise is returned (at most 1 prepared session per workspace).
- `POST /sessions` checks for an existing preparation in the workspace. If preparation is in flight, `create` joins the in-flight promise and adopts the prepared session once resolved, ensuring single ownership and preventing concurrent admission 409 conflicts. If preparation rejected or does not exist, `create` falls back to normal session creation.
- Prepared sessions are idle-reaped after 5 minutes using unreferenced timers (`timer.unref?.()`).
- `DELETE /prepare` discards the speculative session and tears down its admitted worker when the composer draft is closed.
- Canonical session service lifecycle `close()` clears all pending timers and discards remaining prepared sessions during host shutdown.

### Explicit credential handoff and private resolution

`POST /api/agent/v1/credentials/preflight` accepts `application/json` (up to 256 KiB) matching `SelectedCredentialHandoffRequestSchema`:
- `intent: "credential-handoff"`
- `consent: true`
- `workspaceId`: EntityId
- `selections`: 1–16 unique provider items.

Each selection contains `providerId`, `source`, and `credentialType`. Descriptors use sources `stored-credential`, `managed-environment`, or `external-environment` with types `key` or `oauth`. Selected file inputs use `source: "selected-file"`, `credentialType: "key"`, and a bounded `file: { format: "opencode-auth-entry", content: string }` payload (up to 16 KiB). No unselected file paths, background directory scans, or automatic startup imports are accepted.

The route validates workspace scope, confirms service readiness, and executes handoff via `createSelectedCredentialHandoff`. It returns HTTP 207 Multi-Status with `SelectedCredentialHandoffResultSchema`. Provider results:

| Selected descriptor | Result status | Result code | Grounding |
|---|---|---|---|
| `providerId: opencode` | `unsupported` | `CONSOLE_CREDENTIAL_UNSUPPORTED` | Legacy Console stores server/org metadata; no OMP mapping is established. |
| Stored OAuth for `anthropic`, `openai-codex`, `github-copilot`, `google-gemini-cli` | `re-auth-required` | `OAUTH_REAUTH_REQUIRED` | Historical OAuth records require fresh authentication; stored tokens are not converted without user re-auth. |
| Other OAuth provider/source combinations | `unsupported` | `CREDENTIAL_FORMAT_UNSUPPORTED` | No verified conversion shape exists; environment connections are keys, not OAuth records. |
| External-environment key | `unavailable` | `LEGACY_ENVIRONMENT_UNAVAILABLE` | Legacy Host does not own the external runtime's environment values. |
| Key for `anthropic`, `openai`, `google` | `unavailable` | `PROVIDER_CONVERSION_UNVERIFIED` | Historical official-provider records remain unverified and are not claimed as success. |
| `selected-file` with valid entry | `imported` or `unavailable` | `CREDENTIAL_WRITE_FAILED` / `SERVICE_UNAVAILABLE` | Forwarded privately to Bun Agent Service `/internal/workspaces/:workspaceId/credentials/handoff`, which writes to worker-owned `AuthStorage` and re-reads. Success returns `imported` with `credentialRef`. |
| Other key descriptors | `unavailable` | `SELECTED_SOURCE_UNAVAILABLE` or `SERVICE_UNAVAILABLE` | Unverified sources or service absence return unavailable; genuine service absence never returns empty success. |

For Host consumers (quotas, TTS, routing), `createSelectedCredentialResolver` resolves stored secrets through private `/internal/workspaces/:workspaceId/credentials/resolve`. Secret material is returned directly to the authorized Node caller and is never exposed through browser routes.

### Proxied agent routes and Native Host Action bridge

Authorized requests for models, providers, agent profiles, completions, session history, SSE events, run abort, approvals, questions, MCP, skills, and shell jobs are forwarded to the Bun Agent Service. Path parameters (`workspaceId`, `sessionId`, `projectId`) are validated against authorized Host scopes. Queries and bodies are validated against strict `@openchamber/agent-contract` schemas. SSE event streams use `node:stream/promises` pipeline to preserve backpressure; client disconnect triggers request abort.

Shell observation - `GET /shell/jobs` at session, workspace, project and global scope, `GET /sessions/:sessionId/shell/jobs/:jobId/output`, and `POST /sessions/:sessionId/shell/jobs/:jobId/stop` - resolves session scope through `resolveHostSessionScope`, the already-authorized Host session scope also used by queue routes, instead of running `resolveSessionScope`'s workspace admission. Authorization still requires the Host session/workspace binding, and the Agent Service still validates root ownership, epoch and worker generation. Shell start (`POST /sessions/:sessionId/shell/jobs`) and every non-shell canonical route keep the admitting session resolver.

The Guest Host bridge bounds `readShellOutput` and `stopShell` below the Guest request deadline, aborts that canonical work when the frame, pane or runtime goes away, and answers `HOST_TIMEOUT` rather than letting the Guest timer expire silently. A completed reply is posted to the captured port while it is still current; a replaced port, endpoint switch or disposed frame never receives it.

Native file-resource gateway projections live in `file-resource-agent-routes.js`. Commands, prompt templates, native skill discovery and expansion execute only in Bun workers; the Host never imports the native SDK. UI-visible expansion is submitted through the ordinary canonical delivery owner.

`skill-file-owner.js` is the authoritative authored-skill source owner. Workspace writes stay under `.omp/skills/`; agent writes stay under the selected agent directory's `skills/`. Relative names reject traversal and every managed path component rejects symbolic links. External discovery roots remain read-only. Raw Markdown and supporting files are preserved without interpreting legacy tool policies.

`skill-file-routes.js` exposes workspace `/skills/files` list/detail, file PUT/DELETE, skill DELETE, rename, and explicit apply. Mutations compare the selected source's decimal revision before committing. One opaque Host operation ID binds the authorized workspace, selected agent directory, source scope and expected revision; no filesystem paths cross the private source IPC. Under its existing catalog serialization boundary, the supervisor invokes a trusted `host.skill-source` callback, publishes the returned committed source revision, and runs its existing captured-generation fanout. Only the Host callback writes source bytes and its durable journal. It never re-enters service publication or invokes an SDK.

Before source capture or new root admission, a supervisor-serialized reconciliation callback completes any durable Host source intent and returns the authoritative workspace/agent revision pair. A Host source read requests that same reconciliation before reading a complete source snapshot. Reopening and service-only restart therefore cannot label new files with an old source pair. Reconciliation never retries worker application: committed sources, active applied revisions and partial failures remain separate.

After a committed source is published privately, explicit application uses the supervisor's existing captured-generation/admission-hold fanout. `SkillInstallResult` reports persisted source state separately from `SkillsApplyResult`; partial/failed application returns `SKILL_APPLY_FAILED` with committed result details. A valid empty/no-active-workers response does not claim that a root applied the source. Prepared trusted repository installations preserve binary supporting files and reject linked sources before source commit.

Workspace web search uses `GET`/`PUT /workspaces/:workspaceId/web-search` and separate `PUT`/`DELETE /workspaces/:workspaceId/web-search/credentials/:providerId` routes. Strict canonical schemas reject credential fields in configuration writes and secret-bearing responses. Credential writes are provider entry and refused in enterprise mode; deletion and configuration remain available. Each actual native query separately requests `{ type: 'web-search' }` through worker authorization, which checks the current enterprise policy after captured workspace/source validation. Enterprise mode refuses all native search egress without endpoint pins or policy knobs. Web/PWA, Electron, hosted mobile, and Capacitor use this Host boundary; no mobile-local search runtime is introduced.

The Native Host Action bridge enables workers to invoke Host capabilities across private child IPC (`action.request`, `action.result`, `action.cancel`):
- `openchamber`: project/model discovery, session operations, schedules, and `file.open`.
- `web`: browser navigation, inspection, capture, and interaction. Browser credentials remain with the Host.
- `memory`: session memory read, list, save, and delete.
- `notify`: notification delivery.

Invocations execute through `invokeHostAction` within the captured workspace root.

Regression tests in `../ui-auth/canonical-host-routes.test.js` preserve historical M1 baseline verifications for Host authentication, origin validation, and enterprise policy without re-pinning obsolete refusal contracts.

## Approval policies

`approval-policy-store.js` owns `host-approval-policies.sqlite`. It persists exact native tool-input targets with stable opaque IDs and monotonic decimal revisions. The Node supervisor captures root, project, and workspace scope from Host session bootstrap before forwarding, rejecting scope changes.

Child IPC uses `approval.policy.commit` and `approval.policy.list`. The service reserves request CAS, awaits a committed revision, and resolves the worker handle. Failed writes return `APPROVAL_POLICY_WRITE_FAILED`, leaving requests pending. Policies load before reopening a session and apply to future exact native targets, with workspace denial taking precedence over session allowance.

A session created inside the service by `/internal/sessions/:id/fork` has no Host bootstrap of its own. The Supervisor issues a one-child fork ticket for the in-flight request, sends its opaque id in the private fork body, and accepts the child's `approval.policy.list` claim only when that id and source match; the child scope is the already-captured source project, workspace, cwd, and agent directory with the child's session identity. It never widens the workspace, rebinds an existing session, or copies source-session policies, and a missing ticket, malformed acknowledgement, or acknowledgement outside the ticket's child removes the derived scope. Policy list and commit for every other session still require a captured bootstrap scope.

The ticket trusts the service's claimed child id for the lifetime of that one in-flight request: the derived scope is bounded by the source's captured project/workspace/cwd, and a mismatched or failed fork removes it. The Node Host never accepts an arbitrary session or a different workspace from the claim.

Native Bash descriptors include their working directory as a source path. The Host represents the exact workspace root as `.` for containment validation, so a command at that root reaches the consent decision rather than failing as an empty path. An ungranted command still requires approval; outside paths and symlink escapes remain refused.

### Worker operation authorization and native questions

`worker-operation-authorizer.js` authorizes native worker operations against Host workspace scopes, path containment rules, and approval policies by capability tier without relying on external permission state machines. After evaluating scope, path containment, agent profile, and explicit policy denials, the authorizer evaluates tool calls by tier:
- **Read tier** (`read`, `grep`, `glob`, `find`, `ast_grep`, `checkpoint`, `rewind`, `think`, `recall`, `reflect`, `memory_edit`, plus read-only `context_notes`, `retain`, `learn`, and read-only sub-actions of `debug`, `ida`, and `github`): allowed after the path check, requiring `policy.fileTools` read permission. A read targeting an outside workspace path returns `approvalRequired` (becoming an approval card auto-answered under `auto` mode, and allowed when approved with a matching approval grant).
- **Write tier** (`write`, `edit`, `ast_edit`, `new_context`, `manage_skill`, plus text-bearing `context_notes`, global `retain`/`learn`, and LSP mutations): requires `policy.fileTools` write permission and workspace containment. Writes and edits outside the workspace stay hard-denied regardless of mode or grants. The one internal-target exception is a `write` whose descriptor names `local://` plan-artifact URLs in `internalWriteUrls` instead of `destinationPaths`: those are admitted under the same write grant, every other tool and every other internal scheme stays denied, and a `write` naming neither a destination nor such a URL remains refused.
- **Exec tier** (`bash`, `eval`, `debug`, `ida`, `github`, `security_scan`): returns `approvalRequired` unless an authoritative approval grant matches the root session, worker generation, approval ID, and tool call ID. `bash` also checks policy shell commands and exact persistent approval policies.
- **MCP tools** (`mcp__*`): validated against `policy.mcpServers`; unconfigured servers are hard-denied. Configured servers return `approvalRequired` per call, allowed when accompanied by an approval grant.
- Session-local tools (`ask`, `yield`, `goal`, `todo`, `wait`): allowed without machine capability grants. `task` admits safe non-isolated child delegation; isolated delegation is refused because it bypasses authorization hooks.

Native LSP operations require an action-specific descriptor. Read-only query methods (`hover`, `definition`, `type_definition`, `implementation`, `references`, `symbols`, `diagnostics`, `status`, `capabilities`, and `code_actions` without apply) require workspace-contained target paths and `read` permission in `policy.fileTools`. Mutations (`rename`, `rename_file`, `format`, and `code_actions` with `apply: true`) require `write` permission in `policy.fileTools`, exact destination file targets within the workspace, and an authoritative approval grant matching the root session, worker generation, approval ID, and tool call ID. Unsupported methods, escaped paths, malformed parameters, and ungranted mutations fail closed.


### Permission mode IPC channel and the supervisor bridge

`agent-service-supervisor.js` answers two permission families on the child's private IPC channel. Both are flat on the wire (`{ type, requestId, sessionId, ... }`), parsed with `HostPermissionModeLoadRequestSchema` / `HostPermissionEvaluateRequestSchema`; a nested envelope fails the parse and is treated as unauthorized.

- `permission.mode.load`: requires `child === launched` and an admitted captured scope whose `rootSessionId` is the requested session (the service always asks about the worker's root session), then replies `HostPermissionModeReplySchema`. Unadmitted sessions, parse failures, timeouts and errors all reply `mode: 'ask'`.
- `permission.evaluate`: same scope check, then the `ApprovalRequest` goes to the Host policy, which replies `HostPermissionVerdictSchema`. Missing classifier, timeout, malformed reply and thrown errors all reply `verdict: 'unavailable'`, so the card stays.

The supervisor reaches the policy through `packages/web/server/lib/permission-auto-accept/host-channel.js` because it is constructed before the policy runtime exists. `index.js` registers the runtime there after construction; until that happens every query fails closed to `ask`/`unavailable`, never to an accept.

The reverse direction is a Host-initiated `POST /internal/sessions/:sessionId/permission-mode` carrying `{ mode }`, which makes the service reconsider approvals already waiting in that session.

## Retained Host Infrastructure Contracts

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
    9. OpenChamber release-notes and model catalog routes (`registerOpenChamberRoutes`)
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
- `isRequestAuthorized(req, res, { tunnelAuthController, uiAuthController })`: Returns a boolean indicating if a request carries credentials accepted by `/api`, without rejecting unauthorized calls.
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
- `registerCommonRequestMiddleware(app, dependencies)`: Shared middleware applying body size limits, bypassing parsed bodies for isolated space requests (`skipBodyParsing`), protecting `/api/agent/v1` from urlencoded tampering, and handling request logging.

### feature-routes-runtime.js
- `createFeatureRoutesRuntime()`: Composes feature route modules.
- Returned API:
  - `registerRoutes(app, routeDependencies)`: Wires filesystem, environment, quota, walkthrough, source control, linear, guest plugins, git, dev server, magic prompts, session folders, project context, agent memory, session knowledge, message search, permission auto-accept, message queue, routing, themes, project icons, scheduled tasks, tracked items, and markdown image grant routes. Host settings routes are not registered here; Host composition registers `GET`/`PUT /api/config/settings` from `lib/host/settings-routes.js` before this method runs.
  - `getSkillRepositoryDependencies()`: Provides Git credential helper dependencies for skill repository operations.
  - `publishRepositoryCredentialEndpoint()`: Publishes Git credential helper IPC endpoint.

### models-metadata.js
- `getModelsMetadata({ url, ttlMs, timeoutMs } = {})`: Fetches and caches the `models.dev` model catalog in memory (default 10-minute TTL), with fallback to stale cache on network failures.
- `toClientModelsMetadata(metadata)`: Projects the raw catalog to provider IDs and client-needed model capabilities (`id`, `name`, `tool_call`, `reasoning`, `temperature`, `attachment`, `structured_output`, `modalities`, `cost`, `limit`, `knowledge`, `release_date`, `last_updated`).

### openrouter-model-info.js
- `registerOpenRouterModelInfoRoute(app, { fetchImpl, enterprisePolicyOptions, url, ttlMs, timeoutMs, now } = {})`: Registers `POST /api/openchamber/openrouter/model-info` for the Models dialog's auto-fill. The body is `{ modelIds }` (1–200 trimmed ids, ≤256 characters, strict schema). The route fetches OpenRouter's public model list with `fetchImpl` (a bare `GET https://openrouter.ai/api/v1/models`, no body, no auth, no cookies, 8 s timeout, 8 MiB cap) and matches ids locally — exact id first, then a base id that only one publisher owns (the segment after the last `/`, lowercased, with `:` read as `-` and a `free`/`cloud` variant suffix dropped; two publishers sharing a basename get no bare-name match). The response lists only known ids as `{ models: [{ modelId, catalog }] }`, where `catalog` is `{ source: 'openrouter', input, contextWindow, maxTokens, cost: { input, output, cacheRead, cacheWrite }, reasoning, toolsSupported }` and `cost` uses the catalog's USD-per-million-token unit, rounded to six decimals, with 0 for a cache price the public list omits. Models without a positive context window, a positive `max_completion_tokens`, a usable input modality or usable input/output prices are omitted rather than invented. Every refusal is an `application/problem+json` document: 400 `INVALID_REQUEST` (also for a malformed or oversized body), 403 `enterprise_mode` before any outbound request, and 502 `PROVIDER_UNAVAILABLE` when the upstream fetch fails, times out or returns an oversized payload — never an empty success.
- `createOpenRouterModelCatalog({ fetchImpl, url, ttlMs, timeoutMs, now } = {})`: Internal (not exported) in-memory cache behind the route (default 10-minute TTL). Its `lookup(modelIds)` returns the same matched projections; failures are not cached. The route is the only caller, so the cache is exercised through `registerOpenRouterModelInfoRoute`.

### openchamber-routes.js
- `registerOpenChamberRoutes(app, dependencies)`:
  - `GET /api/openchamber/enterprise-policy`: Returns public enterprise mode policy.
  - `GET /api/openchamber/release-notes`: Returns the bundled changelog's release notes for `version`, or for the range since `since`. Nothing is fetched; a missing bundle answers 503.
  - `GET /api/openchamber/models-metadata`: Returns projected `models.dev` metadata.
  - `POST /api/openchamber/openrouter/model-info`: Registers through `openrouter-model-info.js`; see that module.

### server-utils-runtime.js
- `createServerUtilsRuntime({ os, path, process, getLoginShellPath? })`:
  - `buildAugmentedPath()`: Merges process `PATH` and login shell `PATH`, prioritizing user-configured directories.
  - `searchPathFor(binaryName, searchPath?)`: Locates an executable file on the PATH.
  - `isExecutable(filePath)`: Verifies file existence and executable permissions.

### session-runtime.js
- `createSessionRuntime({ broadcastEvent, now = Date.now })`: Maintains session activity and attention state.
- Returned API:
  - `applySnapshot(snapshot)`: Ingests canonical session snapshot from the Bun Agent Service, updating session status, active run ID, and blocking approval/question entries.
  - `processCanonicalEvent(event)`: Ingests canonical stream events, transitioning status, attention flags, and busy/cooldown/idle activity phases.
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
- `createGracefulShutdownRuntime(dependencies)`: Coordinates graceful server teardown across all Host Gateway subsystems, HTTP sockets, and child processes.
