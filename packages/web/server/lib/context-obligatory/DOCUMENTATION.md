# Context Obligatory Messages

Messages explicitly pinned by the user are stored under
`session.metadata.openchamber.context_obligatory_messages` as `{ id, createdAt,
role, sessionID }`. The UI uses a fresh-read metadata merge when pinning or
unpinning and requires an owner for every new pin. The runtime only re-injects
into root sessions. A session with a `parentID` is skipped before its metadata
is read, so child and subagent sessions cannot restore parent pins. Root
sessions, including user forks, retain the existing handling of inherited pins
and the compaction cursor, whether pins have an explicit owner or are legacy
ownerless entries.

The server runtime reads the newest completed `compaction` message through the
canonical Agent Service (`sessionService.history`), fetches every pinned message
by ID, keeps non-empty text, sorts them by the stored creation time, and sends
one synthetic user part through the session service. Missing individual
messages are skipped without discarding the remaining context. Ordinary idle
events perform no work and make no requests.

Project knowledge rides along with the pinned messages: compaction takes both
away and both are restored for the same reason, so they travel as one message —
two synthetic turns back to back would read as the agent being interrupted
twice. The delivered knowledge signature is cleared in the same patch that
writes the cursor, because the summary removed the block the signature
described (`../session-knowledge/DOCUMENTATION.md`).

After a successful send, the runtime merge-writes
`context_obligatory_last_compaction_message_id`. This cursor prevents a
replayed compaction event from reinjecting the same summary. The runtime is
owned by the OpenChamber web backend and therefore is not available to clients without the server.

<<<<<<< HEAD
### Why a fork starts without inherited pins
||||||| bc50ba56aa
### Why root sessions keep inherited pins
=======
## Invariants

- The runtime stays inert without both metadata read and cursor persistence
  dependencies. Cursor writes merge only their fields into the OpenChamber
  namespace, preserving concurrent goal and assist changes.
- Metadata pins are checked for a string id, numeric creation time and user or
  assistant role. Other metadata fields remain unchecked. The compaction cursor
  preserves the upstream id after its existing truthiness check, so its type
  remains unknown.
- OpenCode JSON responses are read as records with unchecked optional fields.
  Non-record responses have no usable session, page or message fields and are
  treated as absent. Text parts require a text type and string text.

## OpenCode response contract

The [`@opencode/client` 2.3.0 contract](https://www.npmjs.com/package/@opencode/client/v/2.3.0)
uses newest-first message pages with data and cursor fields. Completed compaction
messages have their own role, completed status and `time.created`. User messages
carry text, while assistant messages carry content arrays. Synthetic context is
a separate message; model and agent selection belongs to the session.

### Why root sessions keep inherited pins
>>>>>>> upstream/main

The Canonical API creates a fork with its own session id and its own metadata record, and the copied messages receive new ids. Remapping inherited pins would need the source's message ids on the fork, which the contract does not carry, so the fork starts with no obligatory pins and restores only what the user marks in it.
