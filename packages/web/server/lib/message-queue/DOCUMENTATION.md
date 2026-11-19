# Message Queue

## Purpose

Owns the messages a user queued while a session was busy, and sends them the
moment the session goes idle. The queue lives in the web server so a closed
tab, a locked phone, or a dropped connection no longer strands it. Structural
template: `permission-auto-accept` — the server is authoritative and the shared UI
renders a projection.

## Invariants

- Raw JSON from client bodies, the queue file, OpenCode responses and hub
  events is read only in the boundary readers (`asNonEmptyString`, `asText`,
  `asRecord`, `asList`, `asCount`, `parse*`); everything below them branches on
  the domain values those return.
- The tick re-reads the queue after every await. A user can remove, reorder or
  clear items while idleness is being checked, and only the same head item may
  be sent.
- The queue file holds conversation content, so it is readable by its owner
  only (`0o600`).

## TypeScript boundaries

`runtime.ts` owns the parsed queue item and public snapshot contracts. Its input
types come from boundary schemas, which retain the existing defaults and
TypeError refusals. Context metadata is checked only as a non-array object and
passed through by reference; its properties remain unchecked until read.
Scheduled items may omit their provider and model to retain the session's
selection. Goal creation accepts numeric budgets and omitted unused fields
through the declaration on `../session-goal/create.js`.

### Why active-map lookups retain their object check

A session id can name an inherited property such as `constructor`. Only a
non-array object from the active-map lookup blocks delivery; comparing the
lookup with `undefined` would also block on inherited functions.

### Why internal invariant checks throw

A retained queue has a directory and a head item, a validated reorder resolves
every id, and synthetic admission follows id persistence. Checks at indexed
reads enforce these invariants without casts or non-null assertions.

## Files

- `runtime.ts` — `createMessageQueueRuntime(...)` (state, persistence,
  dispatch loop, event handling) and `registerMessageQueueRoutes(app, runtime)`.
- `runtime.test.js` — delivery, idleness gates, retries, held delivery, persistence,
  concurrency with in-flight sends, slash commands, and project knowledge.

Wiring: created in `server/index.js` after the global event hub and the
session-knowledge runtime; routes registered in
<<<<<<< HEAD
`host/feature-routes-runtime.js` (before the generic OpenCode proxy) with
JSON bodies enabled in `host/core-routes.js`; stopped by
`host/shutdown-runtime.js`.

## Canonical delivery owner

`sqlite-store.js` persists captured `PromptRequest` records in the Node Host's
`host-metadata.sqlite`. Queue revisions are unsigned-64 decimal strings. Append
commands retain their idempotent response for 24 hours; reorder and delete compare
the authorized queue revision. Only the head can be claimed, and a claim prevents
another delivery or a conflicting edit. Projections omit context payloads and
retain Host attachment references, never SDK objects or provider credentials.

`canonical-runtime.js` sends the captured request and Host-resolved files to the
private Bun service with the claim's run ID. Acceptance removes the queue item;
the next item still waits for authoritative session idleness. Expired unsent
claims can retry. A submitted claim is reconciled against live state or native
history before acknowledgement. A lost generation without proof of acceptance
fails explicitly rather than resending an action whose side effects are unknown.
Shutdown aborts outstanding HTTP requests, drains admitted operations and closes
the owned SQLite connection.

The explicit `convertLegacy` operation imports `message-queue.json` by owner.
Its Host callbacks resolve workspace scope, retain uploaded files and capture
scheduled-task selection. Successful owner receipts prevent replay after a queue
is emptied. Failed owners remain failures, not empty queues; valid SQLite owners
remain readable. The source bytes are retained unchanged.

These owners are implemented and exercised independently of the application
composition. Task22 must wire the authenticated canonical routes, scope and
attachment owners, accepted context receipts and service events, then remove the
inherited `runtime.js` callers. The application still uses that inherited owner;
task11 and the M2 gate are not closed by the storage proof alone.

The focused Node regressions cover durable claims, idempotent replay, revisions,
retry/failure, failed writes, malformed sibling records and partial conversion.
A disposable scenario ran two separate Node Hosts, the actual Bun service and
the pinned public SDK against one loopback provider. It recovered the first
accepted-but-unacknowledged claim through native history, delivered the second
captured request and observed exactly two provider requests. Attachments,
context and captured model selection survived both Host and service restart.
No application UI, Electron packaging or remote surface was exercised here.

||||||| bc50ba56aa
`opencode/feature-routes-runtime.js` (before the generic OpenCode proxy) with
JSON bodies enabled in `opencode/core-routes.js`; stopped by
`opencode/shutdown-runtime.js`.
=======
`server-frame/feature-routes-runtime.js` (before the generic OpenCode proxy) with
JSON bodies enabled in `server-frame/core-routes.js`; stopped by
`server-frame/shutdown-runtime.js`.
>>>>>>> upstream/main

## Auto routing

`resolvePromptBody` (the routing runtime) runs on the assembled body right
before the prompt or command send, turning a queued `openchamber/auto` model
into a real one. The queue captures the sentinel like any other send config.

## Item

An item is what the UI would have sent itself, captured at queue time so the
send never re-resolves mutable UI state:

```
{
  id, createdAt,
  content,        // raw text for display and editing
  contextPreview?, // bounded display-only summary captured by the UI
  text,           // text to deliver (agent mention stripped, file mentions resolved); defaults to content
  agentMention?,  // delivered as an `agent` part
  attachments: [{ id, filename, mimeType, size, source, serverPath?, agentPath?, dataUrl }],
  context: [      // what the composer had attached, in send order
    { kind: 'context', text, metadata, instructions? },  // a draft chip or linked issue/PR; metadata is the UI's structured payload
    { kind: 'instruction', text },                       // derived from the text (skill instruction)
    { kind: 'synthetic', text },                         // handed to the composer by another surface
  ],
  sendConfig: { providerID, modelID, agent?, variant?, reasoningEffort? } // required; captured at queue time
}
```

The server is a courier for `context`: it validates the shape (a kind it
knows, a `metadata` object on `context` entries) and delivers each entry as a
synthetic text part, an entry's `instructions` going out as its own part just
before it and its `metadata` riding the part verbatim so the timeline renders
the context block back. The payload inside `metadata` is the UI's contract
(`lib/messages/contextParts.ts`), parsed by the UI on the way back.

An attachment's `agentPath` — the file's on-disk location the desktop client
resolved at intake — travels to OpenCode as the prompt file's `name`, the
field the model reads as the file identity, falling back to `filename` when
absent. `filename` itself still rides the attachment unchanged for the UI's
own display.

`parseQueuedItemInput` rejects anything the server could not deliver later
(no text, attachments, or context; missing model; malformed attachment or
context entry). Public snapshots and broadcasts strip the payloads —
attachment `dataUrl` (megabytes of base64) and `context` (a PR diff, say) —
so they do not ride every update; the only way to get them back is a `take`.
`syntheticIds` comes only from the queue file: `parseQueuedItemInput` drops it
from client input, and snapshots leave it out.

Snapshots retain `contextPreview`, capped at 100 characters plus an ellipsis.
It carries the attached comment or context label when `content` is empty and
never replaces editable text or delivered parts. Older items without a summary
derive one from the attached comment metadata or the first non-instruction
context text. This optional field needs no queue-file migration.

## Persistence

`<data-dir>/message-queue.json` (`OPENCHAMBER_DATA_DIR` or
`~/.config/ohpichamber`): `{ version, revision, sessions: { [sessionId]:
{ directory, items } } }`, written atomically (temp file + rename) through a
serialized write chain. A missing file is an empty queue. A malformed file is
a failure, not an empty queue: it is moved aside as
`message-queue.json.corrupt-<timestamp>` before the runtime starts empty, so
the next write cannot overwrite the user's data. A failed read leaves writes
disabled until a later load succeeds. `revision` is a global monotonic counter
bumped on every mutation; clients use it to reject stale snapshots.

In-memory only, deliberately: the in-flight item (`sendingId`), retry
backoff, and abort timestamps. A restart has no in-flight sends; a
persisted "sending" flag would strand a message forever.

## Delivery loop

1. `start()` subscribes to the global upstream hub and loads the file; on
   load and on every hub `connect` it arms every session that has items.
2. `session.status` for a queued session: `idle` arms a short quiet timer
   (500 ms, coalescing the burst around a turn boundary), `busy`/`retry`
   clears it. A `message.updated` for a completed assistant reply arms as
   well, so a missed idle event cannot strand the queue. `session.deleted`
   drops the session's queue. An aborted idle (`session.idle` with
   `aborted: true`, translated from v2's `session.execution.interrupted`)
   records an abort.
3. `tick(sessionId)` bails when the queue is empty, an item is in flight, or
   the session is held. It re-arms after a 2 s post-abort hold (the UI's
   old behavior: a stop is not immediately followed by the next prompt) or
   while the head item is in retry backoff.
4. Idleness is re-verified against OpenCode before sending, because
<<<<<<< HEAD
   `prompt_async` into a running turn steers into it instead of starting the
   next one: `GET /session/status` must not list the session as busy/retry,
   and the trailing message must not be an unfinished assistant reply (the
   status map only lists busy sessions, so a missed busy event leaves no
   entry while a turn still streams). An unfinished reply created before this
   runtime started does not block: its run died with the previous server and
   will never complete, so a restored queue would wait on it forever. A reply
   with no `created` time still blocks. A failed fetch is unknown, never idle:
   the tick re-arms with backoff.
5. The head is marked in flight (broadcast), then sent:
||||||| bc50ba56aa
   a prompt into a running turn steers into it instead of starting the
   next one: `GET /api/session/active` must not list the session, and the
   trailing message must not be an unfinished assistant reply (that route
   lists only running sessions, so a missed busy event leaves no entry while
   a turn still streams). An unfinished reply created before this
   runtime started does not block: its run died with the previous server and
   will never complete, so a restored queue would wait on it forever. A reply
   with no `created` time still blocks. A failed fetch is unknown, never idle:
   the tick re-arms with backoff.
   The turn must also be over for the session's subagents: a parent idles
   while a background subagent works and runs again when OpenCode hands the
   result back. While `../opencode/session-activity.js` finds a running descendant
   the head waits (the rerun's idle event re-arms it, a 5 s recheck covers a
   missed one); a failed check is unknown and backs off like the rest.
   The descendant check follows live active sessions through at most 8 parent
   links, including idle intermediate subagents; a deeper chain counts as
   unrelated, as in the UI. Unreadable lineage, cycles and the shared fetch
   deadline keep the queue held with the existing retry policy. It does not scan historical child pages.
5. The head is marked in flight (broadcast), then sent. The captured model and
   agent are switched onto the session first (`POST /session/:id/model`,
   `/agent`), because v2 holds both on the session rather than in the body; a
   captured `openchamber/auto` is resolved into a real pair by the routing
   runtime beforehand. The session's project knowledge is written into its
   instruction entries (`sessionKnowledgeRuntime.sync`, which never fails the
   send). Then the captured context goes ahead as synthetic messages
   (`POST /session/:id/synthetic` with `resume: false`, an attached item's
   metadata riding along). An item with a `goal` starts it the way a
   scheduled goal does: `createSessionGoal` (`../session-goal/create.js`)
   saves the goal through the injected `persistSessionGoal` before anything is
   admitted, so a failed save leaves nothing for the retry to duplicate, and
   the goal briefing goes as the last synthetic message. Before the goal save
   and the first synthetic message, the item's `syntheticIds` are minted and
   saved, and a revert staged on the session (`revert` on its record) is
   committed (`POST /session/:id/revert/commit`): OpenCode's commit deletes
   everything admitted past the revert's boundary, so committing at the prompt
   would delete the context admitted just before it. An item with nothing to
   admit ahead of its message mints no ids and reads no record; a failed save
   or an unreadable record fails the send. Then the message itself:
=======
   a prompt into a running turn steers into it instead of starting the
   next one: `GET /api/session/active` must not list the session, and the
   trailing message must not be an unfinished assistant reply (that route
   lists only running sessions, so a missed busy event leaves no entry while
   a turn still streams; the shared unwrap hands over the status map, and an
   older `{ data }` envelope is accepted too). The tail is read newest first,
   with the same trailing-message gate the UI uses. An unfinished reply
   created before this runtime started does not block: its run died with the
   previous server and will never complete, so a restored queue would wait on
   it forever. A reply with no `created` time still blocks. A failed fetch is
   unknown, never idle: the tick re-arms with backoff.
   Background work does not hold the head: a parent idle while its
   background subagents or commands run gets the next queued message, the
   same as a message the user sends from the composer then.
5. The head is marked in flight (broadcast), then sent. The captured model and
   agent are switched onto the session first (`POST /session/:id/model`,
   `/agent`), because v2 holds both on the session rather than in the body; a
   captured `openchamber/auto` is resolved into a real pair by the routing
   runtime beforehand. The session's project knowledge is written into its
   instruction entries (`sessionKnowledgeRuntime.sync`, which never fails the
   send); the response style is left out, because the queued message is the
   user's own and the entry the session already holds stays as it is
   (`../session-knowledge/DOCUMENTATION.md`). Then the captured context goes
   ahead as synthetic messages
   (`POST /session/:id/synthetic` with `resume: false`, an attached item's
   metadata riding along). An item with a `goal` starts it the way a
   scheduled goal does: `createSessionGoal` (`../session-goal/create.js`)
   saves the goal through the injected `persistSessionGoal` before anything is
   admitted, so a failed save leaves nothing for the retry to duplicate, and
   the goal briefing goes as the last synthetic message. Before the goal save
   and the first synthetic message, the item's `syntheticIds` are minted and
   saved, and a revert staged on the session (`revert` on its record) is
   committed (`POST /session/:id/revert/commit`): OpenCode's commit deletes
   everything admitted past the revert's boundary, so committing at the prompt
   would delete the context admitted just before it. An item with nothing to
   admit ahead of its message mints no ids and reads no record; a failed save
   or an unreadable record fails the send. Then the message itself:
>>>>>>> upstream/main
   - text starting with `/` that names a command in OpenCode's `/command`
     list (skills included) and carries no captured context goes to
     `POST /session/:id/command` with the captured model, agent, variant, and
     file parts. That route accepts file parts only, so a command queued
     **with** context takes the prompt route instead, the same rule the
     composer applies: the command's template is expanded with its arguments
     (`$ARGUMENTS`, `$1..$N`, or appended), a skill keeps its `/name args` text
     and gets an explicit "the user invoked this skill" synthetic part after
     the context;
   - otherwise `POST /session/:id/prompt_async` with the parts in the same
     order a UI send uses: text, files, the captured context, the skill
     invocation when there is one, pending project knowledge
     (`sessionKnowledgeRuntime.resolvePendingForSession`, synthetic, recorded
     as delivered only after the prompt is accepted), then the agent mention.
   Success removes the item, persists, broadcasts, and marks the user
   message sent for notifications. Failure keeps the item, backs off
   2 s → 60 s (doubling per consecutive failure of that item), and re-arms.
   A retry, also after a restart, reuses the `syntheticIds`: OpenCode answers a
   second admission of an id with the first one, so a failure between the
   context and the message leaves each synthetic record in the session once.
   The ids end at the mint time, one millisecond apart, so they sort in
   admission order and ahead of the message, whose id OpenCode assigns.
6. The next item goes out after the next busy → idle cycle.

<<<<<<< HEAD
## Holds
||||||| bc50ba56aa
A 2xx HTML app-shell response is a failed dispatch, not acceptance. The queued item stays persisted and uses the existing retry backoff.

## Held delivery
=======
A 2xx HTML app-shell response is a failed dispatch, not acceptance. The queued item stays persisted and uses the existing retry backoff.

### Why background work does not hold the queue

The queue used to wait for a session's running subagents, treating the
parent's idle as a pause in one turn. Users read the idle parent as free: the
composer sends to it directly at that point, while a message queued a moment
earlier sat until every subagent finished. Delivering on the parent's own idle
keeps both paths the same; OpenCode hands the background result back to the
session whether or not a new turn started meanwhile.

## Held delivery
>>>>>>> upstream/main

An auto-review run (`../auto-review`) bounces the reviewed session through
idle between its steps, and a queued follow-up must not land in the middle.
The runtime takes `isDeliveryHeld(sessionId)`, the auto-review runtime's
`holdsDelivery`, and the tick delivers nothing while it is true. The run calls
`release(sessionId)` when it ends, which arms a dispatch. `deliveryHoldReady`
(the auto-review's `startupLoad`) gates the first `reconcileAll` after start:
until the auto-review has loaded its runs every session is held, and a tick
that bailed then has nothing to re-arm it.

## Routes (`/api/message-queue`)

Normal authenticated OpenChamber runtime routes; never on browser URL-token
allowlists.

| Route | Purpose |
|---|---|
| `GET /api/message-queue` | Full snapshot `{ revision, sessions[] }` |
| `POST .../sessions/:id/items` | Append `{ directory, item }`; returns `{ revision, session, itemId }` and arms a dispatch (the session may already be idle) |
| `DELETE .../sessions/:id/items/:itemId` | Remove; `409` while that item is in flight |
| `POST .../sessions/:id/items/:itemId/take` | Remove and return the full item (payloads included); `404`/`409` |
| `POST .../sessions/:id/take` | Remove and return every item not in flight, in order |
| `PUT .../sessions/:id/order` | `{ itemIds }` must be a complete permutation |
| `DELETE .../sessions/:id` | Clear; the in-flight item stays, because its send resolves later and must still find its entry |

Every mutation broadcasts `openchamber:message-queue.updated` with
`{ revision, session }` to all connected clients (SSE and WS), so several
devices on one server see one queue. SSE uses the shared control stream at
`/api/openchamber/events`; `/api/global/event` carries no OpenChamber events.
The UI subscribes independently of its OpenCode transport and re-reads the
snapshot whenever either stream reconnects. The session in that payload always names
its `directory`, including the broadcast that removes the last item: the UI
keys its projection by directory, and a broadcast without one left the
delivered message on screen (a session's directory is remembered until the
session is deleted or evicted).

Limits: 20 items per session, 50 sessions (oldest evicted, never one with an
item in flight), 200k characters of content; attachment payloads are bounded
by the route family's 50 MB JSON limit.

## A session that moves

A queued message belongs to the session, not to the directory it was queued
in. The wire translator's move event is `session.updated` with
`info.projectID`; the runtime rekeys that session's entry to the new directory
and broadcasts before the next idle tick, so the delivery and every client
follow the session. Usage and title updates also carry a directory but no
`projectID`, so an in-flight event from the old location cannot move a queue
back. The UI drops the session's other directory keys when the server speaks
for one directory, so the queued row moves instead of appearing twice.

## UI ownership

`packages/ui/src/stores/messageQueueStore.ts` is the projection: see its
