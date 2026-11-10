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
