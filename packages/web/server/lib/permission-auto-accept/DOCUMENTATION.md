# Permission Auto-Accept Runtime

This module owns the authoritative Host-side per-session permission policy (`ask`, `safety`, `auto`) and the seam the Agent Service uses to have tool execution approvals answered without a card.

## Modes

<<<<<<< HEAD
- `ask`: every tool execution request waits for the user.
- `safety`: the Host safety net (`routingRuntime.evaluatePermission`, Jev) decides. Only an `accept` verdict answers the request; `hold`, a missing classifier, a timeout and any error leave the card on screen.
- `auto`: tool execution requests are approved immediately.
||||||| bc50ba56aa
## Policy
=======
## Invariants

- A stored session entry that is neither a mode nor a pre-modes boolean is dropped on its own. One unreadable entry never discards the rest of the policy.
- A partial `session.updated` keeps the parent and directory an earlier record established; a field the update does not name is not cleared.

## Policy
>>>>>>> upstream/main

<<<<<<< HEAD
An explicit workspace or session deny always wins: it rejects at request time and is re-checked immediately before every programmatic approval, including after an asynchronous safety verdict.
||||||| bc50ba56aa
Each session has a mode (`modes.js`):
=======
Each session has a mode (`modes.ts`, imported through `modes.js`):
>>>>>>> upstream/main

## Which approvals participate

Only tool execution approvals. The Agent Service marks them with `permissionRequest: true`, set by the native ACP permission gate and by the native approval extension's shared `requestApproval` path (`approveBash`, `ui.approve`, an observed `ui.select`). Questions, plan review, unobserved `ui.select`, `confirm`/`input`/`askDialog`, native-grant re-authorization and provider/Host authorization never reach that path, so this module never answers them.

<<<<<<< HEAD
## State and persistence
||||||| bc50ba56aa
Policies written before the modes stored booleans. The first read converts them and persists the result once: `false` becomes `ask`, `true` becomes `safety` when the old global safety-net switch in the routing config was on and `auto` otherwise (`resolveLegacyEnabledMode`). The settings sanitizer accepts both shapes so the converting write and older files pass.
=======
Policies written before the modes stored booleans. The first read converts them and persists the result once: `false` becomes `ask`, `true` becomes `safety` when the old global safety-net switch in the routing config was on and `auto` otherwise (`resolveLegacyEnabledMode`). The conversion is persisted at that first read because the old switch is gone once the routing config is next saved. The settings sanitizer accepts both shapes so the converting write and older files pass.
>>>>>>> upstream/main

The policy lives under the `permissionAutoAccept` settings key:

```json
{ "permissionAutoAccept": { "sessions": { "ses_root_1": "auto", "ses_root_2": "safety" }, "revision": 3 } }
```

Pre-modes `true`/`false` entries are converted on first read; `true` becomes `safety` when the old global safety net was on, otherwise `auto`. Writes are serialized and each one increments `revision`.

## Fork inheritance

A fork created through the Canonical API carries its source session as `parentSessionId`, so the runtime's lineage walk resolves it to the source's nearest explicit mode; a fork with no explicit ancestor resolves to `ask`. An explicit policy set on the fork wins over the inherited one. Inverse of that: the Settings default enrolls only a new top-level session, never a fork or a subagent.

A new top-level session enrolls once, at creation, in the `permissionDefaultMode` setting (default `ask`); a mode the creating flow already set wins. Subagents inherit the nearest explicit ancestor mode through `parentSessionId` lineage. A failed lineage lookup is unknown lineage: it writes nothing and does not cache a root, so a transient error cannot stop inheritance.

`GET /api/permission-auto-accept` returns `{ sessions, modes, revision }`, where `sessions` is the boolean compatibility map (`isAutoAnsweringMode`) and `modes` the typed modes.

`PUT /api/permission-auto-accept/sessions/:sessionId` takes `{ mode, directory? }` or, from pre-modes clients, `{ enabled }`. It persists the write, broadcasts `openchamber:permission-auto-accept.updated` with the snapshot, and pushes the new mode to the Agent Service at `POST /internal/sessions/:sessionId/permission-mode` so approvals already waiting are reconsidered. An invalid mode is a 400.

Events published by this module:

<<<<<<< HEAD
- `openchamber:permission-auto-accept.updated` — `{ sessions, modes, revision }`.
- `openchamber:permission-auto-accept.left-for-user` — `{ permissionId, sessionId, directory }`, emitted once per held safety request so the UI can explain why a card appeared.
||||||| bc50ba56aa
`createPermissionAutoAcceptRuntime` loads and serializes policy writes, subscribes to the global OpenCode event hub, caches session lineage, retries transient replies, and reconciles pending permissions after startup, reconnect, and when a session moves to `safety` or `auto`. It keeps handling requests without a connected UI. Startup and reconnect ask the pending list of each running session's directory (`/api/session/active`, then each session's record), never a list without a directory: OpenCode 2 answers that one for its own working directory only and starts that location, MCP servers included.
=======
`createPermissionAutoAcceptRuntime` loads and serializes policy writes, subscribes to the global OpenCode event hub, caches session lineage, retries transient replies, and reconciles pending permissions after startup, reconnect, and when a session moves to `safety` or `auto`. It keeps handling requests without a connected UI. Startup and reconnect ask the pending list of each running session's directory (`/api/session/active`, then each session's record); a pending request belongs to a turn that is still running, so its location is already started. Never a list without a directory: OpenCode 2 answers that one for its own working directory only and starts that location, MCP servers included.
>>>>>>> upstream/main

## Supervisor seam (`host-channel.js`)

The supervisor is constructed before this runtime and is built elsewhere, so it cannot import it. `host-channel.js` carries the registration instead:

- `registerHostPermissionRuntime(runtime)` — called from `index.js` right after construction.
- `resolveHostPermissionMode(sessionId)` — the mode this session's lineage resolves to.
- `evaluateHostPermission(approval)` — the safety verdict for one request.

Before registration and on any thrown error every answer fails closed: `mode: 'ask'`, `verdict: 'unavailable'` / no verdict. Nothing is ever accepted without a live policy runtime.

## Routes

- `GET /api/permission-auto-accept` answers `{ sessions, modes, revision }`. `modes` is the policy; `sessions` is its on/off view (`ask` is off) for clients from before the modes.
<<<<<<< HEAD
- `PUT /api/permission-auto-accept/sessions/:sessionId` takes `{ mode, directory }`; a body with only `enabled` (older clients) means `auto` or `ask`.
||||||| bc50ba56aa
- `PUT /api/permission-auto-accept/sessions/:sessionId` takes `{ mode, directory }`; a body with only `enabled` (older clients, VS Code's bridge shape) means `auto` or `ask`.
=======
- `PUT /api/permission-auto-accept/sessions/:sessionId` takes `{ mode, directory }`. A boolean is still accepted from callers that know only on/off: older clients and VS Code's bridge send `enabled`, and scheduled tasks pass `true` to the runtime directly. `true` is `auto`, `false` is `ask`.
>>>>>>> upstream/main

These are normal authenticated OpenChamber runtime routes. They must not be added to browser URL-token allowlists.

## UI ownership

`packages/ui/src/stores/permissionStore.ts` is a projection of server policy and does not persist an independent policy. The host runtime sees Canonical Agent Service events; the server is the sole responder and the UI renders pending requests until the authoritative event arrives. The composer's shield button cycles ask → safety → auto, skipping `safety` while no classification provider can run it (a `safety` session then behaves as `ask`).

## Tests

<<<<<<< HEAD
`runtime.test.js` covers restart persistence, on/off requests, the one-time conversion of pre-modes policies, the default mode on new sessions, explicit modes, nearest explicit ancestor inheritance, and which outcomes notifications may skip.
||||||| bc50ba56aa
`runtime.test.js` covers restart persistence, on/off requests, the one-time conversion of pre-modes policies, the default mode on new sessions, independent fork modes and nested forks, explicit fork choices during inheritance, failed fork reads and writes, nearest explicit subagent inheritance, missing-lineage lookup (including a subagent first seen through a partial update, and a failed lookup), retry/deduplication, reconnect reconciliation, the safety net's hold and accept, and which outcomes notifications may skip.
=======
`runtime.test.js` covers restart persistence, on/off requests, the one-time conversion of pre-modes policies, the default mode on new sessions, independent fork modes and nested forks, explicit fork choices during inheritance, failed fork reads and writes, nearest explicit subagent inheritance, missing-lineage lookup (including a subagent first seen through a partial update, and a failed lookup), retry/deduplication, reconnect reconciliation, the safety net's hold and accept, and which outcomes notifications may skip.

`modes.test.js` covers the ordered vocabulary, invalid external values, legacy booleans and the modes that auto-answer.

## TypeScript boundary

`modes.ts` owns `PermissionMode`. `isPermissionMode` validates raw settings and file values; mode conversion accepts modes and legacy booleans, with null or absence producing no mode.

### Runtime conversion contracts

The event hub and translator are typed, and translated properties expose `info`,
`directory` and `requestID`. Pending permissions also arrive directly from HTTP
JSON. That path checks only that the list is an array and the request ids are
truthy. `RoutingPermission` in `../routing/jev.ts` keeps these fields as JSON
values because the safety net forwards `action`, `resources` and `metadata`
unchanged. Its decision cache and broadcast contracts preserve non-string ids
and directories too.

`contracts.ts` owns policy snapshots, cached lineage and runtime dependencies.
Settings and HTTP bodies retain their JSON types until the existing checks
establish a mode, session id or directory. JSON property reads distinguish
objects from primitives and arrays, whose decoded values have none of the
named fields this runtime reads. URI components and policy keys retain
JavaScript's string conversion; permission objects and cache keys retain their
original values.

Own-property checks remain necessary on policy dictionaries: `constructor`
must not supply an inherited mode. String checks remain at the session, request
and directory boundaries. Only the event hub's already-typed directory no
longer needs a string check. OpenCode session records can put their directory
on `location`; requests scope that directory through `x-opencode-directory`,
and permission replies use the `decision` body field.
>>>>>>> upstream/main
