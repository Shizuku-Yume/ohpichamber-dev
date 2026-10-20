# Event Stream Module Documentation

## Purpose
This module owns the Host's session event WebSocket and replay hub. Canonical Agent Service events flow through the shared contract. Isolated-space OpenCode events remain a separate M5 path.

## Migration status

The Host's canonical session stream connects to the private Agent Service. Only event records from isolated OpenCode spaces use the OpenCode-specific translation in `translate-v2.js`; the browser receives those raw space payloads. Space-engine retirement remains a separate migration boundary.

## Entrypoints and structure
- `packages/web/server/lib/event-stream/index.js`: public entrypoint re-exporting protocol and runtime helpers.
- `packages/web/server/lib/event-stream/global-hub.js`: shared Host event hub for canonical Agent Service sessions and opted-in isolated-space events.
- `packages/web/server/lib/event-stream/delta-coalescer.js`: coalesces the inherited OpenCode delta shapes used by isolated-space streams before fan-out.
- `packages/web/server/lib/event-stream/global-ws-bridge.js`: browser-facing global WS bridge that subscribes clients to the shared global hub.
- `packages/web/server/lib/event-stream/directory-ws-bridge.js`: browser-facing per-session WS bridge attached to the Host hub.
- `packages/web/server/lib/event-stream/protocol.js`: path constants, SSE envelope parsing, and WebSocket frame serialization helpers.
- `packages/web/server/lib/event-stream/translate-v2.js`: maps isolated-space OpenCode 2.x event payloads for Host consumers; canonical Agent Service events bypass it.
- `packages/web/server/lib/event-stream/upstream-reader.js`: reusable upstream SSE reader with event-id tracking, stall recovery, and reconnect handling.
- `packages/web/server/lib/event-stream/runtime.js`: thin WebSocket server runtime for upgrade handling and path dispatch to the global/directory bridges.
- `packages/web/server/lib/event-stream/protocol.test.js`: unit tests for protocol helpers.
- `packages/web/server/lib/event-stream/upstream-reader.test.js`: unit tests for upstream SSE reader behavior.
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
- `createGlobalMessageStreamHub(...)`: reads canonical session events from the Host-supervised Agent Service and owns bounded cursor replay and per-session recovery.
- `createGlobalUiEventBroadcaster({ sseClients, wsClients, writeSseEvent })`: returns a broadcaster that fans out the same synthetic UI event to SSE and WS clients.
- `createMessageStreamWsRuntime(...)`: mounts the Host WebSocket server and connects browser clients to the shared event hub.

### Event translation
### Isolated-space event translation
- `translateWireEvent(payload)`: maps one OpenCode 2.x space event to zero or more retained Host-consumer events.
- `wireEventDirectory(payload)`: reads the event directory from the space payload.
- `forwardTranslatedWireEvent(payload, handle)`: translates and forwards an isolated-space event to one consumer.

### Coalescing helpers
- `createDeltaCoalescer(...)`: coalesces OpenCode 2.x text, reasoning, and tool-input deltas for isolated-space streams. Canonical Agent Service events bypass it.
- `resolveDeltaCoalesceWindowMs(env)`: reads `OPENCHAMBER_EVENT_DELTA_COALESCE_MS`. Unset means 50ms, `0` turns coalescing off, and anything that is not a whole number from 0 to 1000 keeps the default with a warning.

### Upstream reader helpers
- `DEFAULT_UPSTREAM_STALL_TIMEOUT_MS`: default idle timeout before an attached upstream SSE fetch is aborted for reconnect.
- `DEFAULT_UPSTREAM_RECONNECT_DELAY_MS`: default delay between upstream reconnect attempts.
- `createUpstreamSseReader(...)`: reads/reconnects an isolated-space OpenCode SSE stream and reports its events through callbacks.

## Runtime behavior
- Browser clients receive canonical session events from the Host stream. The UI parses Canonical API records directly.
- Isolated spaces still fetch OpenCode event streams over SSE. Their raw payloads join the Host stream for clients that subscribe to space events and are translated only for Host server consumers.
- The space translator adapts OpenCode 2.x event forms for retained server-side consumers. It does not translate or adapt the canonical Agent Service protocol.
- A space session's event id and directory come from that space's payload. Host stream replay and per-directory routing preserve them.
- Global canonical streams use Host-issued cursors, bounded replay, snapshot repair and reconnect handling; they do not depend on OpenCode SSE ids.
- The shared Host hub multiplexes canonical Agent Service events and explicitly opted-in space events. Canonical session subscribers and space-event subscribers remain separately scoped.
- Browser transport concerns live in the WS bridge modules; server-side global stream ownership lives in `global-hub.js`.

## Delta coalescing
This coalescer is used only for inherited OpenCode space streams. A historical 5.7 KB OpenCode answer measured 3,402 small delta events before coalescing; the reported reduction to 483 frames is not a measurement of Canonical Agent Service traffic.

Merging is lossless because of three rules. Change one only with the randomized test in `delta-coalescer.test.js` still passing.

- Every event that is not a well-formed delta is a barrier. All pending text is emitted before it, so a delta never crosses a part snapshot or a status change.
- Deltas of different part fields commute, so several stay pending at once. They are emitted in the order their latest fragment arrived, which keeps event ids in upstream order.
- A merged event carries the id of its last fragment. A client cursor is the id of the last frame it received, so it always names a boundary between merged events.

Pending text is bounded by time (the 50ms window), by size (64 KiB), and by part fields (64). Reaching a bound emits early. Nothing is dropped. The first delta after a quiet spell is emitted at once, so time to first text does not grow.

The space coalescer flushes pending deltas before a stream stops so they reach the retained replay suffix. Canonical Agent Service events already use Host cursor, epoch invalidation, and replay semantics.

The directory WS bridge and SSE proxy forward isolated-space payloads. Canonical session clients receive their separately validated contract events.

## Notes for contributors
- Keep protocol helpers pure and small so they can be unit tested without spinning up a server.
- Keep `runtime.js` focused on WebSocket upgrade and endpoint dispatch. Put global browser-client lifecycle in `global-ws-bridge.js`, directory stream lifecycle in `directory-ws-bridge.js`, and upstream stream sharing in `global-hub.js`.
- Preserve isolated-space OpenCode assumptions only inside the M5 space boundary. Canonical Agent Service sessions use the shared event contract.
- Keep canonical replay bounded; do not turn it into an unbounded event log.

## Testing
- Run `bunx vitest run server/lib/event-stream` from `packages/web` for the whole module, including `delta-coalescer.test.js` and the resume-from-any-cursor cases in `global-hub.test.js`.
- Run `bun test packages/web/server/lib/event-stream/protocol.test.js`
- Run `bun test packages/web/server/lib/event-stream/translate-v2.test.js`
- Run `bun test packages/web/server/lib/event-stream/upstream-reader.test.js`
- Run `bun test packages/web/server/lib/event-stream/runtime.test.js`
- Run repo validation before finalizing: `bun run type-check`, `bun run lint`, `bun run build`
