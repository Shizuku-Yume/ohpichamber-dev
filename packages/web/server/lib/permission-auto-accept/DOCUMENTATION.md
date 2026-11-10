# Permission Auto-Accept Runtime

This module owns the authoritative Host-side per-session permission policy (`ask`, `safety`, `auto`) and the seam the Agent Service uses to have tool execution approvals answered without a card.

## Modes

- `ask`: every tool execution request waits for the user.
- `safety`: the Host safety net (`routingRuntime.evaluatePermission`, Jev) decides. Only an `accept` verdict answers the request; `hold`, a missing classifier, a timeout and any error leave the card on screen.
- `auto`: tool execution requests are approved immediately.

An explicit workspace or session deny always wins: it rejects at request time and is re-checked immediately before every programmatic approval, including after an asynchronous safety verdict.

## Which approvals participate

Only tool execution approvals. The Agent Service marks them with `permissionRequest: true`, set by the native ACP permission gate and by the native approval extension's shared `requestApproval` path (`approveBash`, `ui.approve`, an observed `ui.select`). Questions, plan review, unobserved `ui.select`, `confirm`/`input`/`askDialog`, native-grant re-authorization and provider/Host authorization never reach that path, so this module never answers them.

## State and persistence

The policy lives under the `permissionAutoAccept` settings key:

```json
{ "permissionAutoAccept": { "sessions": { "ses_root_1": "auto", "ses_root_2": "safety" }, "revision": 3 } }
```

<<<<<<< HEAD
Pre-modes `true`/`false` entries are converted on first read; `true` becomes `safety` when the old global safety net was on, otherwise `auto`. Writes are serialized and each one increments `revision`.
=======
## Fork inheritance

On `session.forked`, the runtime copies the source session's effective mode into the fork's own policy, including an implicit `ask`. The Settings default applies to ordinary new sessions. A fork keeps its copied mode when the source changes, and an explicit policy already set on the fork wins. Duplicate events do not replace that policy. Permission resolution waits for pending inheritance, including when the source is itself a new fork.

Source lookup or persistence failure leaves the fork unconfigured and logs the failure; unknown policy remains `ask`. Failed writes preserve the previous policy and do not block later writes. Existing forks are not backfilled.

### Why fork permissions are copied rather than linked

The fork event's `parentID` identifies the source transcript, not subagent lineage. Copying the effective mode gives the fork an independent policy and covers forks made by any connected client without relying on a `session.created` event, which OpenCode does not emit for forks.

## Runtime
>>>>>>> bc50ba56a

A new top-level session enrolls once, at creation, in the `permissionDefaultMode` setting (default `ask`); a mode the creating flow already set wins. Subagents inherit the nearest explicit ancestor mode through `parentSessionId` lineage. A failed lineage lookup is unknown lineage: it writes nothing and does not cache a root, so a transient error cannot stop inheritance.

`GET /api/permission-auto-accept` returns `{ sessions, modes, revision }`, where `sessions` is the boolean compatibility map (`isAutoAnsweringMode`) and `modes` the typed modes.

`PUT /api/permission-auto-accept/sessions/:sessionId` takes `{ mode, directory? }` or, from pre-modes clients, `{ enabled }`. It persists the write, broadcasts `openchamber:permission-auto-accept.updated` with the snapshot, and pushes the new mode to the Agent Service at `POST /internal/sessions/:sessionId/permission-mode` so approvals already waiting are reconsidered. An invalid mode is a 400.

Events published by this module:

- `openchamber:permission-auto-accept.updated` — `{ sessions, modes, revision }`.
- `openchamber:permission-auto-accept.left-for-user` — `{ permissionId, sessionId, directory }`, emitted once per held safety request so the UI can explain why a card appeared.

## Supervisor seam (`host-channel.js`)

The supervisor is constructed before this runtime and is built elsewhere, so it cannot import it. `host-channel.js` carries the registration instead:

- `registerHostPermissionRuntime(runtime)` — called from `index.js` right after construction.
- `resolveHostPermissionMode(sessionId)` — the mode this session's lineage resolves to.
- `evaluateHostPermission(approval)` — the safety verdict for one request.

<<<<<<< HEAD
Before registration and on any thrown error every answer fails closed: `mode: 'ask'`, `verdict: 'unavailable'` / no verdict. Nothing is ever accepted without a live policy runtime.
=======
## Routes

- `GET /api/permission-auto-accept` answers `{ sessions, modes, revision }`. `modes` is the policy; `sessions` is its on/off view (`ask` is off) for clients from before the modes.
- `PUT /api/permission-auto-accept/sessions/:sessionId` takes `{ mode, directory }`; a body with only `enabled` (older clients, VS Code's bridge shape) means `auto` or `ask`.

These are normal authenticated OpenChamber runtime routes. They must not be added to browser URL-token allowlists.

## UI ownership

`packages/ui/src/stores/permissionStore.ts` is a projection of server policy and does not persist an independent policy. A session in an isolated space has its mode in this module inside that space, which sees the space's OpenCode and answers there; the host's runtime sees the host's events only and never answers into a space. The host forwards the space's `updated` and `left-for-user` events to the browsers, see "Sessions and events" in `packages/web/server/lib/spaces/DOCUMENTATION.md`. The server is the sole responder and the UI renders pending requests until the authoritative `permission.replied` event arrives. The composer's shield button cycles ask → safety → auto, skipping `safety` while no classification provider can run it (a `safety` session then shows as `ask`).

VS Code retains its foreground-only responder because it does not run the web server runtime. Its extension host persists and broadcasts an on/off policy across webviews, so VS Code has only `ask` and `auto` and no default mode. The active UI handles live events plus startup, reconnect, and enablement reconciliation. With all OpenChamber webviews closed or suspended, permissions are not auto-accepted; this is an intentional VS Code limitation.

For forks initiated in the VS Code UI, the shared fork action refreshes the extension host's policy and saves the source mode onto the fork through the existing permission bridge. A fork policy already present is preserved. A failed read or write is logged and leaves the created fork usable at `ask`, while metadata cleanup and goal objective copying continue. Runtime changes stop subsequent inheritance work.

## Tests

`runtime.test.js` covers restart persistence, on/off requests, the one-time conversion of pre-modes policies, the default mode on new sessions, independent fork modes and nested forks, explicit fork choices during inheritance, failed fork reads and writes, nearest explicit subagent inheritance, missing-lineage lookup (including a subagent first seen through a partial update, and a failed lookup), retry/deduplication, reconnect reconciliation, the safety net's hold and accept, and which outcomes notifications may skip.
>>>>>>> bc50ba56a
