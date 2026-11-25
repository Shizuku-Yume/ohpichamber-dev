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
- `parseCanonicalEvent(input)` / `safeParseCanonicalEvent(input)` (`validated-event.ts`): canonical event validation memoized by object identity. The hub validates once at the upstream SSE boundary and marks the parsed object; downstream Host consumers reuse that proof instead of re-running zod per subscriber per event. Anything that did not cross the boundary is validated in full.

### Runtime helpers
- `createGlobalMessageStreamHub(...)`: reads canonical session events from the Host-supervised Agent Service and owns bounded cursor replay and per-session recovery. Provides reference-counted session lease management (`retainSession(sessionId, leaseKey)`, `releaseSession(sessionId, leaseKey)`) that shares active per-session SSE streams across concurrent consumers (runs, browser SSE/WS, initial observation) and tears down the stream once all leases release.
- `createGlobalUiEventBroadcaster({ sseClients, wsClients, writeSseEvent })`: returns a broadcaster that fans out the same synthetic UI event to SSE and WS clients.
- `createMessageStreamWsRuntime(...)`: mounts the Host WebSocket server and connects browser clients to the shared event hub.
### Legacy translation
- `translateWireEvent(payload)`: maps one legacy OpenCode wire payload to zero or more retained Host-consumer events. The hub uses it only for the `translated()` view of an injected space-scoped payload; no current space produces such a payload.
- `wireEventDirectory(payload)` and `forwardTranslatedWireEvent(payload, handle)` remain beside the translation table for its historical tests. The removed per-space event feed was their only production consumer.

## Runtime behavior
- Browser clients receive canonical session events from the Host stream. The UI parses Canonical API records directly.
- Fanout frames embed the upstream SSE `data` bytes verbatim instead of re-serializing the parsed event; the payload is byte-identical content and JSON.parse treats both the same.
- No space event connection is made and no OpenCode SSE stream is read. The removed `space-events.js` and its upstream reader were the last production path for that traffic.
- A space's journey progress events are injected by `host.js` into the hub for space-scoped subscribers. They are Host events, not session events, and they carry no OpenCode wire id.
- Global canonical streams use Host-issued cursors, bounded replay, snapshot repair and reconnect handling; they do not depend on OpenCode SSE ids.
- The shared Host hub multiplexes canonical Agent Service events and explicitly opted-in space-scoped injected events. Canonical session subscribers and space-event subscribers remain separately scoped.
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
