# Message Queue

## Purpose

Owns the messages a user queued while a session was busy, and sends them the
moment the session goes idle. The queue lives in the web server so a closed
tab, a locked phone, or a dropped connection no longer strands it. Structural
template: `permission-auto-accept` — the server is authoritative and the shared UI
renders a projection.

## Files

- `sqlite-store.ts` — durable queue state in the Host metadata database
  (`host-metadata.sqlite`), the serialized write transaction every mutation
  runs in, revision compare-and-set, delivery claims and the legacy
  `message-queue.json` conversion.
- `canonical-runtime.ts` — the delivery dispatch loop: reads the runtime
  session, claims the head, resolves Host attachments, submits the captured
  prompt to the private Bun Agent Service, reconciles acknowledgements and
  publishes every mutation.
- `prompt-admission.ts` — root-session prompt admission invariants.
- `runtime.ts` — route registration for both families (below) plus the
  store/runtime construction exports.
- `runtime.test.js` — delivery, idleness gates, retries, concurrency, take
  routes and refusals, gateway authorization.
- `sqlite-store.test.js` — durable claims, idempotent replay, revisions,
  conversion, take atomicity and claim/take races.

Wiring: created in `server/runtime.ts`; product routes registered in
`server-frame/feature-routes-runtime.ts` with JSON bodies enabled in
`server-frame/core-routes.ts`; canonical routes mounted on the authenticated
canonical gateway in `host/canonical-routes.ts` through
`registerCanonicalQueueRoutes`.

## Canonical delivery owner

`sqlite-store.ts` persists captured `PromptRequest` records in the Node Host's
`host-metadata.sqlite`. Queue revisions are unsigned-64 decimal strings. Append
commands retain their idempotent response for 24 hours; reorder, delete and
take compare the authorized queue revision. Only the head can be claimed, and
a claim prevents another delivery or a conflicting mutation. Projections omit
context payloads and retain Host attachment references, never SDK objects or
provider credentials.

`canonical-runtime.ts` sends the captured request and Host-resolved files to
the private Bun service with the claim's run ID. Acceptance removes the queue
item; the next item still waits for authoritative session idleness. Expired
unsent claims can retry. A submitted claim is reconciled against live state or
native history before acknowledgement. A lost generation without proof of
acceptance fails explicitly rather than resending an action whose side effects
are unknown. Shutdown aborts outstanding HTTP requests, drains admitted
operations and closes the owned SQLite connection.

The explicit `convertLegacy` operation imports `message-queue.json` by owner.
Its Host callbacks resolve workspace scope, retain uploaded files and capture
scheduled-task selection. Successful owner receipts prevent replay after a queue
is emptied. Failed owners remain failures, not empty queues; valid SQLite owners
remain readable. The source bytes are retained unchanged.

## Stored record and the preserved original draft

An item's payload is `{ content, contextPreview?, request, draft? }`:

- `content` is the raw typed text (display and editing seed).
- `request` is the captured `PromptRequest` as admitted — after auto-routing
  resolution and any server-side context additions. It is the delivery truth.
- `draft` is the optional `QueueOriginalDraft` the UI attached at append time:
  the user's own text and delivery text before capture, the composer's full
  context entries in send order, the pre-routing model selection, the attachment
  provenance (`agentPath`, and the `original` picked-file payload behind a path
  note), the agent mention, the goal and the display preview. The server stores
  it verbatim and never delivers it; it exists solely so a `take` can hand the
  draft back for editing or an immediate send.

Records written before the draft existed — including every converted legacy
item — simply have no `draft`. Their projection marks `originalAvailable:
false`, and a take returns `draft: null` with the surviving `content`/`text`
for a partial restore. There is no payload migration: the field is optional
and old rows parse unchanged.

The public projection (`QueueItem`) keeps content, text, attachment references,
send options and context descriptors — but never full context payloads, never
the draft, and carries `originalAvailable` so clients know whether a full edit
restore exists without fetching anything.

## The take operation

`take` transfers ownership of one queued item back to the caller, atomically,
inside the same serialized write transaction as every other mutation:

1. A stale `expectedRevision` is refused `409 QUEUE_CONFLICT` with the current
   queue in the problem details; the item is untouched.
2. A missing item is `404 SESSION_NOT_FOUND` with the current queue — unlike
   delete, a silent no-op success has no meaningful body because the caller
   needs the payload.
3. A leased item (in delivery) is refused `409 QUEUE_CONFLICT`; the delivery
   proceeds undisturbed.
4. Otherwise the row is deleted and the revision bumped in the same
   transaction. A failure anywhere inside rolls everything back — the item
   stays queued; a take either succeeds completely or not at all.

The response is `{ queue, draft, text, content, createdAt }`: the authoritative
post-take queue, the preserved draft (`null` for old records) and the surviving
top-level fields. Attachment bytes are not inlined; they remain readable
through the Host attachment store (`readAttachment`) by reference. Because the
delete and the response are one transaction plus one response, ownership moves
exactly once: a client retry after a lost response sees a clean 404.

Concurrency with delivery is structural, not heuristic: the store is
single-process and synchronous, so a take and `claimHead` serialize. Whichever
commits first wins — the loser's revision check or lease check trips. There is
no interleaving and no duplicate delivery. After a successful take the runtime
re-broadcasts the queue (`openchamber:message-queue.updated`) and re-arms
dispatch, because removing a blocked head can unblock the next item.

## Delivery loop

1. Every store mutation ends in `changed(scope, queue)` → `publishQueue`, so
   all connected clients share one projection.
2. `dispatch` re-reads the runtime session first: a busy, retrying,
   continuation-pending or unavailable session re-arms instead of sending.
3. Only the head item is ever leased. `claimHead` inserts the delivery row
   (`claimed → submitting → accepted`) and sets the lease on the item row in
   one transaction. A leased item keeps its position under reorder and cannot
   be removed or taken.
4. The captured request is submitted to the Agent Service with the claim's run
   ID. Acceptance deletes the item; failure keeps it and backs off. Expired
   unsent claims recover to retry; a lost generation without acceptance proof
   fails explicitly.
5. The next item goes out after the next busy → idle cycle.

## Routes

Normal authenticated OpenChamber runtime routes; never on browser URL-token
allowlists. Both families hit the same runtime methods:

| Route | Purpose |
|---|---|
| `GET /api/message-queue` | Full snapshot `{ revision, items[], errors[] }` |
| `POST /api/message-queue/sessions/:id/items` | Append `{ commandId?, expectedRevision, content, contextPreview?, request, draft? }`; returns the authoritative `QueueState` and arms a dispatch |
| `DELETE /api/message-queue/sessions/:id/items/:itemId` | Remove `{ expectedRevision }`; `409` while leased, idempotent when absent |
| `POST /api/message-queue/sessions/:id/items/:itemId/take` | Atomic take `{ expectedRevision }` → `QueueTakeResult`; `404` when gone, `409` when leased or stale |
| `PUT /api/message-queue/sessions/:id/order` | `{ expectedRevision, queueItemIds }` must be a complete permutation; leased items keep position |
| `PUT /api/message-queue/sessions/:id/hold` | Hold or release delivery |
| `GET /api/agent/v1/sessions/:id/queue` | Canonical read of the same `QueueState` |
| `POST /api/agent/v1/sessions/:id/queue` | Canonical append (same body, optional `Idempotency-Key`) |
| `PUT /api/agent/v1/sessions/:id/queue/order` | Canonical reorder |
| `DELETE /api/agent/v1/sessions/:id/queue/:queueItemId` | Canonical remove |
| `POST /api/agent/v1/sessions/:id/queue/:queueItemId/take` | Canonical take — same `QueueTakeResult` contract |

The product routes ride the normal UI auth and directory-owner forwarding for
spaces; the canonical routes sit behind the authenticated canonical gateway
(tunnel session or UI auth context, origin check for mutations without bearer).
Item mutations cross-check route and body identity: a `queueItemId` in the body
that contradicts the route is `400 INVALID_REQUEST`.

Limits: 20 items per session, 50 sessions, 200k characters of content per item.
The product family parses JSON bodies up to 50 MB (path-note originals ride
inline within the UI's 40 MiB budget); the canonical family parses mutation
bodies up to 1 MB. Take responses are unaffected by either parser budget.

## UI ownership

`packages/ui/src/stores/messageQueueStore.ts` is the projection: see its
documentation for edit restore (take → composer), send-now (take → immediate
submit) and the partial-restore behavior for old records.
