# Session folders

## Ownership

This module owns the chat folders of one OpenChamber Host: their storage in
the Host metadata database (`host-metadata.sqlite`), the change semantics, and
the HTTP contract every client of that Host reads and writes. A second Host
has its own data directory and its own folders. The UI keeps a cache and a
queue of unsent changes (`packages/ui/src/stores/useSessionFoldersStore.ts`).

The stored map is keyed by scope: a project root, a worktree or space
directory, or `__archived__:<project root>` for the archive's folders. Each
folder has an id unique across the store, a name, an optional parent in the
same scope, and the ids of the chats filed in it. Worktree works are filed with
the same assign and unassign changes under the opaque id `worktree:<path>`,
which the Host stores like a session id.

`routes.js` owns the HTTP contract and the stored snapshot; `folder-changes.js`
owns the change semantics (the UI applies the same changes through
`packages/ui/src/lib/sessionFolders/folderChanges.ts`).

- `GET /api/session-folders` returns the stored snapshot with `exists: true`,
  or `{ exists: false }` when nothing is stored. A corrupt scope is reported in
  `errors` and never replaces the other scopes with an empty map.
- `PATCH /api/session-folders` takes `{ changes: [...] }` (at most 1,000),
  applies them in order under the write queue, stores the result when anything
  changed and answers with the stored snapshot and its `revision`.
- `POST /api/session-folders` is the whole-copy write of clients from before
  shared folders. It stays so an older client on another device keeps working;
  current clients use it only against a server that has no `PATCH`.
- After a write that changed the stored folders the server announces
  `openchamber:session-folders-changed` with the new `updatedAt` on the
  OpenChamber control stream. The event type belongs to the UI event module
  (`packages/ui/src/lib/openchamberEvents.ts`); until it is delivered, the
  client reads on mount, on a change of its own, and on stream reconnect
  (`handleSessionFoldersStreamReady`).

## Invariants

- Writes are serialized through the metadata lifecycle; each one reads the
  current state, applies the changes, and commits in one transaction. The store
  has one header row (revision, `updatedAt`, collapsed ids, tombstones) and one
  row per scope.
- `revision` (a decimal string) grows by one per committed write, and
  `updatedAt` never goes backwards. Clients drop answers older than the one
  they show.
- A change that changes nothing writes nothing and bumps no revision.
- A change about a folder that is gone does nothing. A create whose parent is
  gone places the folder at the top level.
- A chat is in at most one folder of a scope after `assign`.
- An `assign` or `unassign` with `from` skips each chat that another client moved
  away from the folder `from` names for it. A chat left in no folder because that
  folder was deleted was not moved, and the change applies. Without `from`, which
  older clients and changes they queued send, it applies to every chat.
- Deleting a folder deletes its sub-folders. Every deleted id (by `delete` or
  `forget-scopes`) is kept as a tombstone for 30 days, so an older client that
  still holds the folder cannot bring it back with its whole copy. A `create`
  with the same id clears the tombstone; only fixed ids (the archive's
  `archived:<scope>:<name>`) are ever created twice.
- `import` keeps what the Host already has: its folders keep id, name and
  place, and a chat it already files stays where it is. The only thing it
  removes is a folder the device itself deleted, sent as a tombstone.
<<<<<<< HEAD
- A stored scope that cannot be read is failure, not empty: it is reported in
  `errors`, kept out of destructive writes, and never treated as an empty
  folder list. Only a valid whole-copy `POST` repairs it, since that is the
  only form a client can supply.
- The legacy `sessions-directories.json` file is converted once, per scope,
  with a receipt in the metadata database; the file stays as the operator's
  copy.
- Collapsing a folder is per device (`oc.sessions.folderCollapse`); the server
  stores `collapsedFolderIds` only for older clients, and current clients
  ignore it.
=======
- A file that exists but cannot be read is never treated as empty: `GET` and
  `PATCH` answer 500 and nothing is written. Only the older clients' whole-copy
  `POST` replaces it, since a valid copy is all such a file can be repaired from.
- Any write that changes the folders moves `updatedAt` past the stored value,
  the older clients' `POST` included, whose own stamp comes from its clock.
- The client applies the same changes to its own copy with the same results
  (`packages/ui/src/lib/sessionFolders/folderChanges.ts`); a change to one
  side's semantics changes the other in the same commit.

## Decisions

### Why changes and not whole copies

Clients used to send their whole folder map and the server merged it per
scope, with the incoming copy winning per folder id. A device that had not
seen another device's rename or move undid it on its next write, and a
missing scope could not be told from a deleted one. A change says what the
user did ("move these chats into this folder"), so a client that is behind
cannot undo anything it did not touch, and the server needs no merge rules
for ordinary edits.

### Why a move carries where the chat was instead of an id the server remembers

A client that timed out cannot tell whether the server stored its move, so it
sends the move again, and it may do so after a reload, long after another client
moved the same chat. Ids of applied changes would stop only the re-send of a
stored move; a move that never arrived would still undo the newer one. Comparing
the chat's place covers both and keeps the stored file as it is. The cost is
that of two clients moving one chat from the same place, the first to reach the
server wins, and a chat moved back to exactly where it started can still be
moved again by a late re-send.

### Why the server tells clients to read again instead of sending the folders

The announcement carries only the revision, like `project-context-changed`.
A client reads the folders once per change it has not seen, so an event that
arrives late or twice cannot show an old map, and the event stays small for
any number of projects.

### Why the import lets the server win

Each device's copy from before sharing is merged in once. What the server
already has is what the other devices show, so it wins; a local folder with
the same name under the same parent in the same scope joins it instead of
becoming a duplicate, any other local folder is added, and a chat only the
device had filed goes into the matching folder. Nothing on either side is
dropped except folders deleted elsewhere within the last 30 days.

### Why collapsing a folder is not shared

Which folders are open is how one screen is arranged; collapsing one on the
phone must not close it on the desktop. The client keeps it per device and
ignores `collapsedFolderIds` in the file, which only older clients still read
and write.
>>>>>>> bc50ba56a
