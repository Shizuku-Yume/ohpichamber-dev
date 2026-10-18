# Host Runtime Documentation

## Purpose

`packages/web/server/lib/host/` owns Host Gateway infrastructure that is retained independently of the OpenCode integration. These modules keep settings, themes, projects, networking, tunnels, startup, static serving, canonical execution routing, and managed-process cleanup available to Web, PWA, Electron, and hosted mobile surfaces.

## Modules

- `settings-runtime.js`, `settings-files.js`, `settings-helpers.js`, `settings-normalization-runtime.js`, `settings-registry.json`, and `input-history-scope.js` implement the four-tier Host settings document, normalization, persistence, and input-history policy.
- `theme-runtime.js`, `theme-catalog.js`, and `theme-archive.js` validate custom themes, discover remote theme packages, and import selected VS Code palette data from bounded `.vsix` archives. Theme import consumes data only; it never executes extension code.
- `tunnel-auth.js` and `tunnel-wiring-runtime.js` protect and compose retained development-tunnel and relay routes.
- `pwa-manifest-routes.js` generates the dynamic install manifest and recent-session shortcuts.
- `project-directory-runtime.js` resolves and validates workspace roots; `project-icon-routes.js` owns project icon upload, discovery, and serving.
- `network-runtime.js` builds the managed OpenCode connection URL and performs readiness checks. Compatibility parsing is supplied by composition as required dependencies so this Host module does not import the legacy integration path.
- `path-utils.js` owns shared PATH heuristics and merge utilities used by Electron's login-shell environment setup and Host command environment resolution. It is Host infrastructure, not an OpenCode lifecycle owner.
- `sse-stream.js` owns response backpressure for Host and isolated-space event streams; `session-list.js` owns the allowlisted session-list projection shared by the Host proxy and spaces.
- `server-startup-runtime.js`, `startup-pipeline-runtime.js`, and `static-routes-runtime.js` own Host HTTP startup, static assets, SPA fallback, and manifest wiring.
- `agent-service-supervisor.js` and `agent-service-supervisor.d.ts` start the separate Bun service, discover its loopback endpoint, supervise lifecycle, verify Linux process birth identity, handle worker operation authorization, and route native approval policy IPC.
- `agent-runtime.js` integrates the supervisor, scope runtime, approval policy store, and worker operation authorizer, resolving authorized workspace and session scopes for Host operations.
- `agent-scope-store.js` and `agent-scope-runtime.js` manage project, directory, workspace, and session containment in Host SQLite, validating roots against configured projects, Git worktrees, and managed chats.
- `session-state.js` opens `host-metadata.sqlite` and returns `sessionMetadataStore`, `archiveStore`, `sessionFoldersStore`, `agentScopeStore`, `attachmentStore`, `initialize()`, `flush()`, `close()`, and `databasePath`.
- `metadata-sqlite.js` supplies the SQLite schema, typed errors, transactions, table management (`session_metadata`, `session_archive`, `session_folders`, `session_folder_scopes`, `host_agent_projects`, `host_agent_directories`, `host_agent_workspaces`, `host_agent_sessions`, `host_attachments`, `metadata_conversion`), and lifecycle admissions.
- `attachment-store.js` and `attachment-routes.js` store attachment binaries (`0600`) and metadata in SQLite, providing scoped upload, validation, retrieval, and prompt-delivery resolution.
- `private-credential.js` implements explicit selected credential handoff to Bun `AuthStorage` and private credential resolution for quota, TTS, and routing consumers.
- `approval-policy-store.js` owns `host-approval-policies.sqlite` for persistent tool-input allow and deny decisions.
- `worker-operation-authorizer.js` and `worker-authorization-channel.js` authorize worker operations against Host workspace policies and approval store records.
- `canonical-routes.js` registers `/api/agent/v1` routes: status, ready, capabilities, projects, workspaces, queue, sessions, attachments, credentials preflight, and proxied agent routes with strict schema validation and scope authorization.

## Ownership boundary

The Host modules do not own OpenCode lifecycle, proxying, SSE watching, snippets, agent configuration, legacy credentials, filesystem APIs, Git, PTY, or guest services. Those remain in their existing modules until their coordinated migration tasks. Private SDK objects, `SessionManager`, and `AuthStorage` exist inside Bun workers only; the Node Host never imports or loads the OMP SDK. Host SQLite retains authority over opaque root, workspace, and session scopes, operational metadata, attachments, and approval policies. Canonical credential preflight owns explicit user-selected handoff to Bun `AuthStorage` and private lookups for Host consumers, with zero startup import or credential enumeration. The OpenCode integration may compose Host routes and inject retained engine dependencies, but Host modules do not provide path aliases or compatibility re-exports for the old directory.

## Retained behavior

Settings are persisted atomically with profile/device/surface scope handling. Theme imports validate package identity, checksums, archive bounds, and authored palette data. Project and network routes preserve path validation and rebinding protections. Startup continues to publish the listener before managed lifecycle work, serves static/PWA routes, and records the same diagnostic phases. Managed-process cleanup remains asynchronous and verifies process identity before reaping.

The production startup pipeline starts only the canonical Agent Service after publishing the Host listener, publishing Git's credential-helper endpoint and attaching process handlers. Web and Electron share this pipeline; Electron still embeds the Node Host in its main process. Terminal, dictation, message-stream and static/FS routes remain registered before the listener. The supervisor marks service readiness only after an internal-secret-authenticated `/api/agent/v1/ready` response validates against the canonical schema. Service startup failure is reported and leaves canonical operations unavailable rather than redirecting them to OpenCode. Production startup no longer bootstraps or detects an OpenCode server; legacy lifecycle controls remain reachable only through unmigrated explicit callers.

`createHostAgentRuntime` exposes `start()` and `stop()` for supervisor lifecycle and `close()` for final Host teardown. Stopping the service preserves the approval policy store for a later start; final close stops the service and closes that store, and prevents another start.

The agent-service registry records the actual Linux process birth identity when registering it. Reaping requires that identity and the recorded binary/entrypoint, checked again before signalling; an assigned ephemeral port is not compared with the literal `--port 0` command. Missing birth verification leaves the process untouched. Non-Linux agent orphan reaping remains unverified and refuses to guess identity. Legacy managed registrations remain until task17 retires their callers.

## Operational session state

`createHostSessionState({ dataDir, fsPromises?, path?, now? })` opens `host-metadata.sqlite` under the Host data directory and returns `sessionMetadataStore`, `archiveStore`, `sessionFoldersStore`, `agentScopeStore`, `attachmentStore`, `initialize()`, `flush()`, `close()`, and `databasePath`. Composition injects these stores into the sessions service, feature routes, canonical gateway, and session projections. Route registration does not create hidden connections.

SQLite is the durable authority for operational metadata, custom titles, workspace associations, archive timestamps, folder membership, agent scopes, and attachments. It is not a transcript store. Goal state, assist recaps, delivered-knowledge and obligatory-context markers, project-context pins, linked issues, work lineage, side-thread links, and multirun grouping remain ordinary metadata fields. Goal objective files retain their existing objective-text owner. Metadata archive records remain independent. Legacy `SpaceArchive` remains until task17 retires it; task17 must retire legacy space archive rather than deferring it to M5.

Metadata merge patches are serialized per session. Their read, decision, merge and revision increment commit inside one SQLite transaction. Revisions are decimal strings, independent of wall-clock time. `get(id)` returns metadata or `null`; `getState(id)` returns `{ metadata, revision }` or `null`. Missing is not corrupt: malformed payloads and SQLite read/write failures throw `METADATA_CORRUPT`, `METADATA_READ_FAILED`, or `METADATA_WRITE_FAILED`. Metadata writes return `{ metadata, revision, changed }`; an unchanged conditional decision does not publish a change.

The database file is created at `0600` before SQLite opens it. New database directories use `0700`; existing database, WAL and SHM files are tightened to `0600` on reopen without changing an existing data root's permissions.

Metadata and archive `listAll()` return `{ entries, errors, conversion }`: valid entities remain available beside per-entity error codes. `conversion` carries its status and, for source-wide failure, a code. An absent entry under a source-wide conversion error is unknown, not authoritative empty state. Folder scopes are separate rows; the folder read returns `{ snapshot, revision, errors, conversion }`, so one corrupt scope does not hide valid siblings. Archive `null` timestamps are durable restore tombstones. Folder deletion tombstones keep their existing 30-day retention and merge policy.

Canonical session projections omit the `archivedAt` field for an unarchive tombstone but retain `archiveRevision`. A failed session enrichment remains a per-session error beside healthy items; it does not erase the complete workspace page or prevent those sessions from being observed.

### Canonical agent scope and containment

`createHostAgentScopeRuntime` and `createAgentScopeStore` manage directory and session authority in `host-metadata.sqlite`. Configured Host projects (`readSettings().projects`), their registered Git worktrees (`getWorktrees()`), and managed chats (`managedChatsScope`) define canonical containment. Client path hints are unverified.

The configured managed chats namespace takes precedence over overlapping configured projects and worktrees during directory resolution. Resolving a previously admitted chat therefore retains its managed workspace identity after settings changes and Host restart; existing explicit projects and historical SQLite rows are not pruned or rewritten. Managed admission failures are not retried as project admission. The settings runtime receives the same configured `managedChatsRoot` (`OPENCHAMBER_CHATS_DIR`) from Host composition and excludes canonically contained directories from automatic legacy `lastDirectory` promotion only. Root and candidate aliases are resolved on disk; ordinary legacy directories still migrate and explicit configured projects remain intact.

All directories are resolved through `fsPromises.realpath` and validated through `validateDirectoryPath`. A declared workspace must be contained within its validated project root or registered worktree. Managed chat directories must be contained within `managedChatsScope.root`. Scope mapping records rows in `host_agent_projects`, `host_agent_directories`, `host_agent_workspaces`, and `host_agent_sessions`. Offline known sessions authenticate against pure Host metadata without contacting external runtimes. When a session or workspace is accessed, `createHostAgentRuntime` resolves the scope, resolves environment variables via `getEnvironmentForDirectory(cwd)` (omitted in enterprise mode), and registers the workspace with the supervisor before admitting operations.

Historical usage (`GET /api/agent/v1/usage` and `/usage/tools`) validates explicit range bounds, viewer IANA timezone, and optional opaque project/workspace IDs. The Host resolves and authorizes both global and filtered scope sets before sending a private usage query to Bun. The service may read only registered native references in that set; client filesystem paths and the process-global OMP statistics database are never query sources. Node performs no transcript parsing or native SDK imports. Partial source failures retain healthy siblings; total source failure remains an error.

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

`registerCanonicalHostRoutes(app, { express, service, uiAuthController, tunnelAuthController, isRequestOriginAllowed, enterprisePolicyOptions, resolveWorkspaceScope, resolveSessionScope, listProjects, listWorkspaces, resolveCredentialHandoff, queueRoutes, sessionRoutes, attachmentRoutes })` registers the `/api/agent/v1` namespace.

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

Native Bash descriptors include their working directory as a source path. The Host represents the exact workspace root as `.` for containment validation, so a command at that root reaches the consent decision rather than failing as an empty path. An ungranted command still requires approval; outside paths and symlink escapes remain refused.
