# @openchamber/agent-service

Private Bun Agent Service and dedicated OMP SDK worker processes. The Node Host uses `createAgentServiceSupervisor` in `packages/web/server/lib/host/agent-service-supervisor.js`; Electron keeps that Host in process. Hosted mobile and Capacitor connect to the Host and start no local worker. Guest clients do not receive access to these private routes.

Application execution is not activated by this package's presence. Task22 composes the service into the Host; task17 removes the inherited engine after replacement consumers are ready.

## Lifecycle

Build with `bun run build`. The built entrypoint is `dist/index.js`, with its worker at `dist/worker/index.js`. Development can use `bun --no-env-file src/index.ts --port 0`.

The Host injects `OHPICHAMBER_INTERNAL_SECRET` as 32 random bytes encoded in hex. It never appears in arguments, URLs or logs. Every request requires `X-Internal-Secret` and a loopback peer. The listener binds only `127.0.0.1`; stdout publishes one `{ "type": "agent-service.listening", "port": ... }` line for endpoint discovery, not readiness.

`GET /api/agent/v1/ready` returns `{ "ready": true, "engine": "omp", "version": "1.0.0" }` only after a dedicated worker initializes the real SDK public factory, disposes its session and exits successfully. The probe owns an ephemeral profile and workspace, removed after it exits. Startup is bounded to 15 seconds; orderly stop gets 5 seconds before forced termination.

## Private worker operations

- `POST /internal/workers` admits a root session.
- `GET /internal/workers` returns authoritative worker state and generation.
- `POST /internal/workers/:rootSessionId/restart` retires the old generation before launching its replacement.
- `DELETE /internal/workers/:rootSessionId` waits for its process to exit.

Bootstrap data contains opaque root/project/workspace IDs, absolute private `cwd` and `agentDirectory`, optional `sessionsDirectory`, and an optional Host-resolved environment overlay. Independent roots get separate processes even in the same workspace. Worker replacement and shutdown are serialized per root; prompt admission rejects a second active run while abort can interrupt the first. The internal secret is stripped before spawning a worker; environment values and private paths are absent from public worker observations.

Both service and worker launches pass Bun's `--no-env-file`. Project dotenv files cannot add values to the Host-resolved environment.

Only `src/worker/` imports the OMP SDK. Its session owns the supplied `SessionManager`; disposal closes that manager, then the worker closes its owned `AuthStorage`. Initial workers disable MCP, LSP and extension discovery; their retained configuration and apply behavior belong to task12, not a readiness claim. Interactive approvals and questions belong to task10.

## Sessions and recovery

`POST /internal/sessions` creates or reopens a Host-authorized root. The service persists only private bootstrap references and the SDK session filename, not resolved environment values, Host metadata or a transcript copy. A cold reference is unavailable with no active run until the Host supplies its current environment and reopens the worker.

The private `/api/agent/v1/sessions` namespace provides runtime list/detail, snapshot, history, run admission, abort, delete and SSE events. Task22 supplies public Host authorization, metadata composition and delivery ownership; these service routes are not an external client entrypoint. Host-chosen run IDs and resolved attachment paths use `/internal/sessions/:sessionId/runs`.

OMP alone writes messages. The worker stores canonical identity and per-cycle lifecycle references in native custom entries, binding message identities after SDK persistence settles. Live and reopened history retain IDs, terminal tool outcomes and each cycle's status/times. One outer run may contain several native model cycles; `turn_end` does not complete that run. Tool failure stays distinct from provider failure. A failed provider run retains partial output and does not affect another root. Projection or persistence failure stops the affected worker rather than allowing its execution to publish fabricated success.

The service journal retains the newest 1,000 ordered events and a tail of 100 turns. Snapshot and cursor are captured together. SSE validates cursor syntax and replay coverage before headers: malformed cursors return 400 `INVALID_CURSOR`; stale epochs or missing coverage return 410 `RESYNC_REQUIRED`. Live epoch changes and delivery overflow invalidate and close the stream. Reopening a worker creates a new epoch; historical messages never imply live activity.

History uses an opaque cursor bound to the selected branch version and leaf. It is not an SSE cursor. Session deletion uses the native SDK storage owner before removing its private service reference. Archive and operational metadata remain with Host SQLite.

## Package inputs

The SDK closure uses source-derived archives and patches under `vendor/omp/c9de2b02`, not matching-version registry substitutes or an external source checkout. The vendor manifest binds archive identities and parent-scoped dependency versions. Linux x64 native inputs are retained; non-Linux native behavior and native source-build equivalence remain unverified.

`bun run type-check` first emits declarations from the installed first-party SDK source with the pinned upstream publish convention, then checks this package's source strictly against them. Generated files stay in `node_modules/.cache/omp-types`; no handwritten SDK facade, runtime alias or upstream source edit is used. This avoids checking unrelated upstream CLI implementation as application code. Bun build and runtime continue to resolve the original vendored TypeScript source.
