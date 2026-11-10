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
<<<<<<< HEAD
owned by the OpenChamber web backend and therefore is not available to clients without the server.
=======
owned by the OpenChamber web backend and therefore is not available in
extension-only VS Code mode.

### Why root sessions keep inherited pins

User forks keep their existing pin inheritance. Copied messages receive new ids,
so remapping inherited pins needs a separate change. Filtering by the source
owner or the fork's creation time would hide those pins and stop their restore
after compaction.
>>>>>>> bc50ba56a
