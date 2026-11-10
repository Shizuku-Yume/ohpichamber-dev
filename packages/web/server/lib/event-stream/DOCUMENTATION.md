# Event Stream Module Documentation

## Purpose
This module owns the Host's session event WebSocket and replay hub. Canonical Agent Service events flow through the shared contract. No in-space event upstream is read any more: the per-space OpenCode SSE feed and its upstream reader went with the removed space runtime. The delta coalescer remains as a historical helper with no production caller. A space's own journey progress events are injected by the Host and are not session events.

## Migration status

The Host's canonical session stream connects to the private Agent Service. `translate-v2.js` remains for the hub's `translated()` compatibility view of legacy space-scoped payloads; no current space sends OpenCode wire events, so the current journey progress events do not depend on it. The OMP space runtime will bring its own session and event contract. Canonical Agent Service events never pass through the translator.

## Entrypoints and structure
- `packages/web/server/lib/event-stream/index.js`: public entrypoint re-exporting protocol and runtime helpers.
- `packages/web/server/lib/event-stream/global-hub.js`: shared Host event hub for canonical Agent Service sessions and injected space-scoped progress events.
- `packages/web/server/lib/event-stream/delta-coalescer.js`: historical OpenCode delta coalescer retained with its tests; no production path uses it after the in-space event feed was removed.
- `packages/web/server/lib/event-stream/global-ws-bridge.js`: browser-facing global WS bridge that subscribes clients to the shared global hub.
- `packages/web/server/lib/event-stream/directory-ws-bridge.js`: browser-facing per-session WS bridge attached to the Host hub.
- `packages/web/server/lib/event-stream/protocol.js`: path constants, SSE envelope parsing, and WebSocket frame serialization helpers.
- `packages/web/server/lib/event-stream/translate-v2.js`: legacy translation table used only by the hub's `translated()` compatibility view; canonical Agent Service events bypass it.
- `packages/web/server/lib/event-stream/runtime.js`: thin WebSocket server runtime for upgrade handling and path dispatch to the global/directory bridges.
- `packages/web/server/lib/event-stream/protocol.test.js`: unit tests for protocol helpers.
- `packages/web/server/lib/event-stream/runtime.test.js`: unit tests for runtime-side broadcaster behavior.

## Public exports

### Protocol helpers
- `MESSAGE_STREAM_GLOBAL_WS_PATH`: `/api/global/event/ws`
- `MESSAGE_STREAM_DIRECTORY_WS_PATH`: `/api/event/ws`
- `MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS`: heartbeat interval for browser-facing WS connections.
- `parseSseEventEnvelope(block)`: parses an SSE block into `{ eventId, directory, payload }`.
- `sendMessageStreamWsFrame(socket, payload)`: serializes and sends a JSON WS frame.
- `sendMessageStreamWsEvent(socket, payload, options)`: sends an event frame with optional `eventId` and `directory`.
- `serializeMessageStreamWsEvent(payload, options)` and `sendSerializedMessageStreamWsFrame(socket, frame)` separate encoding from per-socket delivery. Delivery retains ready-state and backpressure checks.

### Runtime helpers
- `createGlobalMessageStreamHub(...)`: reads canonical session events from the Host-supervised Agent Service and owns bounded cursor replay and per-session recovery. Provides reference-counted session lease management (`retainSession(sessionId, leaseKey)`, `releaseSession(sessionId, leaseKey)`) that shares active per-session SSE streams across concurrent consumers (runs, browser SSE/WS, initial observation) and tears down the stream once all leases release.
- `createGlobalUiEventBroadcaster({ sseClients, wsClients, writeSseEvent })`: returns a broadcaster that fans out the same synthetic UI event to SSE and WS clients.
- `createMessageStreamWsRuntime(...)`: mounts the Host WebSocket server and connects browser clients to the shared event hub.
### Legacy translation
- `translateWireEvent(payload)`: maps one legacy OpenCode wire payload to zero or more retained Host-consumer events. The hub uses it only for the `translated()` view of an injected space-scoped payload; no current space produces such a payload.
- `wireEventDirectory(payload)` and `forwardTranslatedWireEvent(payload, handle)` remain beside the translation table for its historical tests. The removed per-space event feed was their only production consumer.

## Runtime behavior
<<<<<<< HEAD
- Browser clients receive canonical session events from the Host stream. The UI parses Canonical API records directly.
- No space event connection is made and no OpenCode SSE stream is read. The removed `space-events.js` and its upstream reader were the last production path for that traffic.
- A space's journey progress events are injected by `host.js` into the hub for space-scoped subscribers. They are Host events, not session events, and they carry no OpenCode wire id.
- Global canonical streams use Host-issued cursors, bounded replay, snapshot repair and reconnect handling; they do not depend on OpenCode SSE ids.
- The shared Host hub multiplexes canonical Agent Service events and explicitly opted-in space-scoped injected events. Canonical session subscribers and space-event subscribers remain separately scoped.
=======
- Browser clients connect to the WS endpoints above.
- OpenChamber still fetches OpenCode upstream event streams over SSE, now from `/api/event`.
- OpenCode 2.x sends no `id:` SSE lines: the event id is `payload.id` and the directory is `payload.location.directory`. Replay and per-directory routing read both out of the payload.
- Browser clients receive the RAW wire payload and translate it themselves. Server-side subscribers read `event.translated()` instead, so the translation happens once per event and only when something listens.
- `session.archived` and `session.unarchived` translate to events of their own. Extension session events announce the first as `session-archived`; session work waits for the second to open a session a message reached while it was archived. Neither is folded into `session.updated`, whose consumers (goal mode kickoff, lineage, notifications) would read an archive or a restore as an edit of the record.
- `session.forked` translates its `data.sessionID` and `data.parentID` into the fork and source ids in `properties`. Permission inheritance consumes this translated event; OpenCode emits no `session.created` for the fork. Tests of server fork behavior must pass the wire event through this translator.
- v2 emits no `session.status` and no `session.idle` of its own: live status is synthesized from `session.execution.started|succeeded|interrupted|failed`, plus `session.retry.scheduled` (status `retry` while a provider error waits for the next attempt) and `session.step.started` (back to `busy`, which clears `retry` once the attempt begins). Only the status from `session.execution.started` carries `turnStartedAt` (the event's `created`): it is the one event that marks where a turn begins, and the synthetic `openchamber:session-status` frames forward that start, or the session runtime's, beside a busy or retry status. A user abort arrives as `session.idle` with `aborted: true`, not as an assistant message carrying `MessageAbortedError`. A `session.execution.interrupted` with `reason: "shutdown"` translates to nothing: OpenCode keeps the execution claim across a shutdown and resumes the turn after restart, so the session stays busy for server consumers (goal, queue, notifications) until the real terminal event arrives.
- The web server creates one shared global message-stream hub. OpenCode watcher side effects and global WS clients subscribe to that hub, so there is one upstream `/global/event` SSE reader for both server-side processing and browser fan-out.
- The global hub keeps a bounded replay buffer keyed by SSE `eventId` so reconnecting browser clients can receive buffered events after their requested `Last-Event-ID`.
- Replay retains at most 2,048 events and 8 MiB of UTF-8 wire frames. It stores encoded frames rather than retaining parsed payloads as well. Encoding is shared with live WS fanout. An oversized event still reaches live clients in full, but clears the retained suffix so replay cannot cross its gap. A missing replay cursor returns `null`, distinct from a complete empty tail; the bridge sends `ready` with `replayReset: true` and no partial replay. The client retires its cursor and requests authoritative repair, including during the early-boot reconnect grace period. A stopped hub retains its bounded suffix for clients reconnecting after the last socket closed.
- The hub numbers every event that arrives without an SSE id (`oc-<process>-<sequence>`). OpenCode 1.18 sends no ids at all, and an event without an id used to skip the replay buffer, so reconnecting clients had no cursor and lost whatever fell into the gap. The process prefix makes a cursor from before a server restart miss, which reports `replayReset`, instead of matching an unrelated sequence number.
- Directory WS clients still attach one upstream `/event?directory=...` SSE reader per connection because directory streams are scoped.
- If an upstream SSE stream stalls after the browser WS is already ready, the reader aborts that upstream fetch and reconnects upstream with `Last-Event-ID`, keeping the browser WS alive when recovery is fast.
- When the shared global upstream reconnects after it was previously ready, the global WS bridge sends a fresh `ready` frame to already-ready browser clients. The browser treats this as a reconnect edge and can run scoped state repair without requiring the browser WS to close.
- Health checks are reserved for initial upstream connect failures and explicit upstream-unavailable responses, not for ordinary stall recovery on an already-established stream.
- Global synthetic events such as `openchamber:session-status`, `openchamber:session-activity`, `openchamber:notification`, and `openchamber:heartbeat` are preserved on the WS path, but heartbeat frames are emitted only while an upstream SSE stream is actively attached.
- Global UI broadcasts are fan-out capable across both SSE and WS clients.
- Global UI broadcasts serialize once per wire format, irrespective of client count. The SSE writer accepts an optional pre-serialized payload; isolated callers keep the two-argument contract. Failed or backpressured clients cannot block delivery to healthy clients.
- The reusable upstream reader centralizes SSE fetch/parsing/reconnect behavior for the WS runtime and OpenCode watcher. Additional event consumers should move to it only with parity tests for their lifecycle and error semantics.
>>>>>>> bc50ba56a
- Browser transport concerns live in the WS bridge modules; server-side global stream ownership lives in `global-hub.js`.
- Per-session event streams follow an explicit lease-counted lifecycle: active prompt runs, browser WebSocket/SSE connections, and transient session-creation snapshots acquire named leases. Leases are ref-counted per key to safely support concurrent dispatches and repeat subscriptions without underflow. When the last lease is released (`leases.size === 0`), the hub immediately aborts the stream and cancels the reader, preventing background reader leaks.
## Notes for contributors
- Keep protocol helpers pure and small so they can be unit tested without spinning up a server.
- Keep `runtime.js` focused on WebSocket upgrade and endpoint dispatch. Put global browser-client lifecycle in `global-ws-bridge.js`, directory stream lifecycle in `directory-ws-bridge.js`, and stream sharing in `global-hub.js`.
- Do not add a new in-space event feed or OpenCode SSE dependency. Canonical Agent Service sessions use the shared event contract; the OMP space runtime owns its own session and event contract.
- Keep canonical replay bounded; do not turn it into an unbounded event log.

## Testing
- Run `bunx vitest run server/lib/event-stream` from `packages/web` for the whole module, including `delta-coalescer.test.js` and the resume-from-any-cursor cases in `global-hub.test.js`.
- Run `bun test packages/web/server/lib/event-stream/protocol.test.js`
- Run `bun test packages/web/server/lib/event-stream/translate-v2.test.js`
- Run `bun test packages/web/server/lib/event-stream/runtime.test.js`
- Run repo validation before finalizing: `bun run type-check`, `bun run lint`, `bun run build`
