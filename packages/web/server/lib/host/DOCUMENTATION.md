# Host Runtime Documentation

## Purpose

`packages/web/server/lib/host/` owns Host Gateway infrastructure that is retained independently of the OpenCode integration. These modules keep settings, themes, projects, networking, tunnels, startup, static serving, and managed-process cleanup available to Web, PWA, Electron, and hosted mobile surfaces.

## Modules

- `settings-runtime.js`, `settings-files.js`, `settings-helpers.js`, `settings-normalization-runtime.js`, `settings-registry.json`, and `input-history-scope.js` implement the four-tier Host settings document, normalization, persistence, and input-history policy.
- `theme-runtime.js`, `theme-catalog.js`, and `theme-archive.js` validate custom themes, discover remote theme packages, and import selected VS Code palette data from bounded `.vsix` archives. Theme import consumes data only; it never executes extension code.
- `tunnel-auth.js` and `tunnel-wiring-runtime.js` protect and compose retained development-tunnel and relay routes.
- `pwa-manifest-routes.js` generates the dynamic install manifest and recent-session shortcuts.
- `project-directory-runtime.js` resolves and validates workspace roots; `project-icon-routes.js` owns project icon upload, discovery, and serving.
- `network-runtime.js` builds the managed OpenCode connection URL and performs readiness checks. Compatibility parsing is supplied by composition as required dependencies so this Host module does not import the legacy integration path.
- `login-shell-env.js` provides the login-shell environment snapshot used when embedding the server in Electron and when starting host commands.
- `server-startup-runtime.js`, `startup-pipeline-runtime.js`, and `static-routes-runtime.js` own Host HTTP startup, static assets, SPA fallback, and manifest wiring.
- `managed-process-registry.js` and its declaration file track managed child processes and reap only verified orphaned processes. `startup-performance.js` records opt-in startup diagnostics shared by lifecycle, proxy, and startup callers.
- `session-state.js` owns the SQLite connection shared by session metadata, archive state, and session folders. `metadata-sqlite.js` supplies the schema, typed errors, transactions, and admitted-operation lifecycle; `metadata-conversion.js` converts only named operational sidecar sources.
- `canonical-routes.js` owns minimal canonical Host status and authenticated credential intent/preflight. It has no legacy credential, OMP SDK, staging, or process dependency.

## Ownership boundary

The Host modules do not own OpenCode lifecycle, proxying, SSE watching, snippets, agent configuration, legacy credentials, filesystem APIs, Git, PTY, guest services, or environment stores. Those remain in their existing modules until their coordinated migration tasks. Canonical credential preflight owns refusal and nonsecret descriptors only, not credential reads or import. The OpenCode integration may compose Host routes and inject retained engine dependencies, but Host modules do not provide path aliases or compatibility re-exports for the old directory.

## Retained behavior

Settings are persisted atomically with profile/device/surface scope handling. Theme imports validate package identity, checksums, archive bounds, and authored palette data. Project and network routes preserve path validation and rebinding protections. Startup continues to publish the listener before managed lifecycle work, serves static/PWA routes, and records the same diagnostic phases. Managed-process cleanup remains asynchronous and verifies process identity before reaping.

## Operational session state

`createHostSessionState({ dataDir, fsPromises?, path?, now? })` opens `host-metadata.sqlite` under the Host data directory and returns `sessionMetadataStore`, `archiveStore`, `sessionFoldersStore`, `initialize()`, `flush()`, `close()`, and `databasePath`. Composition injects these stores into the sessions service, feature routes, and session projections. Route registration does not create hidden connections.

SQLite is the durable authority for operational metadata, custom titles, workspace associations, archive timestamps, and folder membership. It is not a transcript store. Goal state, assist recaps, delivered-knowledge and obligatory-context markers, project-context pins, linked issues, work lineage, side-thread links, and multirun grouping remain ordinary metadata fields. Goal objective files retain their existing objective-text owner.

Metadata merge patches are serialized per session. Their read, decision, merge and revision increment commit inside one SQLite transaction. Revisions are decimal strings, independent of wall-clock time. `get(id)` returns metadata or `null`; `getState(id)` returns `{ metadata, revision }` or `null`. Missing is not corrupt: malformed payloads and SQLite read/write failures throw `METADATA_CORRUPT`, `METADATA_READ_FAILED`, or `METADATA_WRITE_FAILED`. Metadata writes return `{ metadata, revision, changed }`; an unchanged conditional decision does not publish a change.

The database file is created at `0600` before SQLite opens it. New database directories use `0700`; existing database, WAL and SHM files are tightened to `0600` on reopen without changing an existing data root's permissions.

Metadata and archive `listAll()` return `{ entries, errors, conversion }`: valid entities remain available beside per-entity error codes. `conversion` carries its status and, for source-wide failure, a code. An absent entry under a source-wide conversion error is unknown, not authoritative empty state. Folder scopes are separate rows; the folder read returns `{ snapshot, revision, errors, conversion }`, so one corrupt scope does not hide valid siblings. Archive `null` timestamps are durable restore tombstones. Folder deletion tombstones keep their existing 30-day retention and merge policy.

### Conversion and consent

Initialization converts `sessions-metadata.json`, `sessions-archive.json`, and `sessions-directories.json` as operational sidecars. Valid records and durable completion receipts commit together. Originals remain byte-for-byte intact; successful receipts prevent stale replay after restart. Partial folder conversion has per-scope receipts so a repaired missing scope can be imported without replaying already-converted deletions. Existing SQL records take precedence over legacy source records.

Inherited execution projections are a separate, explicit conversion capability, never an initialization read or metadata fallback. `POST /api/openchamber/sessions/metadata/import` requires Host authentication, the injected `isRequestOriginAllowed(req)` gate, `intent: "operational-metadata-conversion"`, `consent: true`, a source identifier, and 1–200 selected `{ id, directory? }` entries. The injected `readLegacySessionProjection(id, { directory })` retrieves only each selected session projection. No message or transcript endpoint is involved. The response contains per-ID outcomes and code-only errors; receipts are keyed by both source and selected session ID, so later selections under the same source still convert.

Each selected directory passes the existing Host directory validator before the reader runs. Its canonical target is checked again so an allowed alias cannot bypass a refused target. Every declared source directory must resolve to that same authorized directory. Missing, refused or conflicting scopes return per-ID `METADATA_READ_FAILED` without a committed row or receipt; valid siblings continue.

### Lifecycle and retained surfaces

Every store read, conversion, explicit import, and write is admitted through its lifecycle owner. `close()` fences new admissions immediately, drains admitted work, and closes the sole connection only after all stores finish. It is idempotent. Composition stops HTTP admission and producers before closing the owner; `flush()` alone does not fence producers.

- Web/PWA uses the Host routes and SQLite owner.
- Electron uses the same Host routes and owner in its retained server process.
- Hosted mobile uses the active Host through shared runtime transport.
- Capacitor mobile uses the active Host through shared runtime transport and its existing origin allowlist.
- VS Code is retired; this change adds no support for it.

These are source contracts, not a claim that runtime checks were executed. The integration owner performs the combined close/reopen, partial-corruption, authorization, and lifecycle proof.

## Canonical status and credential preflight

`registerCanonicalHostRoutes(app, { express, uiAuthController, tunnelAuthController, isRequestOriginAllowed, enterprisePolicyOptions })` registers `/api/agent/v1`. Production composition supplies the existing controllers and origin-security operation; `enterprisePolicyOptions` is optional input to the existing enterprise policy reader for isolated policy tests, not a service callback. No readiness, legacy-credential, AuthStorage, staging, or worker callback is accepted.

### Status and authentication

- `GET /health` within this prefix is optional-auth and returns exactly `{ "status": "ok", "engine": "omp", "agent": { "status": "unavailable", "ready": false } }`. This proves Host liveness only.
- `GET /ready` is optional-auth and returns HTTP 503 `SERVICE_UNAVAILABLE` Problem Details. The real Agent Service does not exist in M1. Inherited `runtime.isReady()`, an OpenCode health response, or an advertised port cannot make this ready.
- `GET /capabilities` requires external Host authentication. It returns `version: "1.0.0"`, `engine: "omp"`, the same unavailable agent record, and `capabilities` with `streaming`, `casApprovals`, `midTurnSteering`, `followUpQueue`, `subagents`, `sessionBranching`, `reasoningParts`, `documentExtraction`, and `credentialHandoff` all `false`. It publishes no illustrative limits or SDK claims. `clientFeatures` describes client support, not a demand to enable a service feature. False values do not waive retained implementation gates.
- All other paths/methods within the prefix require external Host authentication and terminate with HTTP 503 Problem Details while the service is absent. They never fall through to the OpenCode proxy. Unrelated legacy `/api` routes keep their original guard.

External authority is a validated UI cookie, paired bearer token, or the tunnel session selected by the existing tunnel request scope. URL/Guest asset tokens and `X-Internal-Secret` are not external credentials. Default passwordless Web/PWA still boots through `/auth/session`, which now issues a signed `ui-passwordless` cookie using the existing jose/JWT-secret owner; arbitrary raw identity cookies are not verified credentials. Canonical protected routes use `allowAnonymousSession: false`: they validate an existing signed cookie without minting one. Password-protected/passkey cookies use `ui-session`, and enabling password protection rejects old `ui-passwordless` cookies. This preserves the passwordless deployment policy, not password authentication where none was configured.

### Strict preflight request

`POST /api/agent/v1/credentials/preflight` is the sole M1 intent seam. It accepts only `application/json`, at most 16 KiB, with this strict schema:

```json
{
  "intent": "credential-handoff",
  "consent": true,
  "selections": [
    { "providerId": "anthropic", "source": "stored-credential", "credentialType": "oauth" }
  ]
}
```

`intent` and literal `consent: true` are required. `selections` contains 1–16 unique triples. Each selection contains exactly `providerId` (1–64 characters matching `^[a-z][a-z0-9-]{0,63}$`), `source` (`stored-credential`, `managed-environment`, or `external-environment`), and `credentialType` (`key` or `oauth`). No keys, tokens, account metadata, endpoints, filenames, absolute paths, secret fields, or arbitrary extra fields are accepted. Descriptors are user selections, not verified source discovery. Startup and preflight never enumerate legacy credentials. Historical file selection/import belongs to the real task22 handoff; no file path is accepted by this M1 route.

Cookie and tunnel mutations require an allowed origin using the existing request-security owner, including packaged Electron/Capacitor origins and configured development/public origins. A validated paired bearer client alone may omit `Origin`; an explicit disallowed or opaque `Origin: null` is refused even with a token. Enterprise provider-entry policy is read at use time and refuses preflight with HTTP 403 `enterprise_mode`. These checks run before the bounded JSON parser.

### Refusal result and evidence boundaries

A valid non-enterprise preflight returns HTTP 503 `application/problem+json`, never success or imported. The exact top-level fields are `type`, `title`, `status`, `detail`, `code`, `retryable`, and `details.results`. `type` is `urn:ohpichamber:problem:SERVICE_UNAVAILABLE`, `status` is 503, `code` is `SERVICE_UNAVAILABLE`, and `retryable` is `true` (the same intent can be retried after the real service is implemented). Every result contains only the three parsed selection fields plus `status` and `code`:

| Selected descriptor | Result status | Result code | Grounding |
|---|---|---|---|
| `providerId: opencode` | `unsupported` | `CONSOLE_CREDENTIAL_UNSUPPORTED` | Legacy Console stores server/org metadata; no OMP mapping is established. |
| Stored OAuth for `anthropic`, `openai-codex`, `github-copilot`, `google-gemini-cli` | `re-auth-required` | `OAUTH_REAUTH_REQUIRED` | M0 syntactic storage is not conversion/refresh/scopes/account-selection proof. This is a refusal policy requiring fresh authentication, not a claim that the selected token was inspected or expired. |
| Other OAuth provider/source combinations | `unsupported` | `CREDENTIAL_FORMAT_UNSUPPORTED` | No verified M0 conversion shape exists; environment connections in the legacy source are keys, not OAuth records. |
| External-environment key | `unavailable` | `LEGACY_ENVIRONMENT_UNAVAILABLE` | Legacy Host does not own the external runtime's environment values. |
| Key for `anthropic`, `openai`, `google` | `unavailable` | `PROVIDER_CONVERSION_UNVERIFIED` | Historical official-provider records remain authentication-unavailable/migration-unknown. |
| Other key descriptors, including a selected custom proxy | `unavailable` | `AGENT_SERVICE_UNAVAILABLE` | The narrow M0 custom OpenAI-compatible proxy completion is not a Host importer or proof for arbitrary providers. |

The source semantics are recorded in `lib/opencode/auth.js`: stored API values are `key`; the old projection renamed these to `api`, and stored OAuth has `access`, `refresh`, `expires`, and selected metadata. M1 accepts no projected secret values or optional OAuth fields. Its production Host module does not import that owner. M0 evidence stays in `.workflow/omp-migration/m0/capabilities-real-provider.json` and `provider-oauth-feasibility.json`; all seven historical records remain unchanged.

Errors use sanitized top-level RFC 7807 Problem Details, without a nested `error` or `message` alias: 401 `UNAUTHORIZED`, 403 `INVALID_ORIGIN`/`enterprise_mode`, 400 `INVALID_REQUEST`, 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `PAYLOAD_TOO_LARGE`, or 500 `INTERNAL_ERROR`. No validation issues, raw exception, path, credential, or input body is echoed. Responses are `Cache-Control: no-store`.

### Composition and retained surfaces

`bootstrap-runtime.js` registers these routes after common request middleware and before `registerAuthAndAccessRoutes` installs the legacy `/api` rejection. Canonical JSON is parsed locally; the common urlencoded parser skips only this canonical namespace so body errors remain RFC 7807. The reserved index integration must supply the existing `isRequestOriginAllowed` in `bootstrapRuntime.setupBaseRoutes(app, options)`; no new dependency or service substitute is needed.

| Surface | M1 behavior |
|---|---|
| Web / PWA | Same Host routes; configured password/passkey cookie or default signed passwordless bootstrap. Allowed-origin explicit intent only; absent service refuses without credential access. |
| Embedded Electron | Same Node Host routes; signed session or existing desktop-local/paired bearer. Packaged UI origin allowed by the existing owner; no SDK imports in main/renderer. |
| Hosted mobile | Browser policy is the same as Web/PWA; paired clients keep bearer authentication. No local Agent Service. |
| Capacitor remote | Existing paired bearer and packaged iOS/Android origins; the remote Host refuses absent service. No local worker or credential store. |
| Guest | No privileged credential action or Guest bridge method; scoped asset tokens do not authorize this namespace and opaque-origin mutations are refused. |

Task22 must replace the refusal with the actual private Bun service handoff after authoritative internal readiness/authentication. It must obtain only selected secrets, prove AuthStorage write/read-reload and real provider-specific outcomes, and retain zero startup import/staging. Task05 does not waive task22 or gate23. Regression tests in `../ui-auth/canonical-host-routes.test.js` exercise real Host/auth boundaries and instrument the retained legacy source without adding an engine import to `host/`. Private full Node Host runs also verified canonical status, passwordless and password-protected authentication, explicit preflight refusal, origin validation and use-time enterprise policy, with zero observed legacy credential calls. Task05 records the check and cleanup evidence.
