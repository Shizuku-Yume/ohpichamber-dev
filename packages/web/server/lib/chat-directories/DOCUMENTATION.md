# Chat directory cleanup

## Ownership

This module removes generated managed chat folders after confirmed host session deletions. `scheduled-tasks/chats-scope.js` and the shared UI own folder creation. The filesystem routes still serve explicit file operations and draft rollback.

The Host constructs this runtime with its Canonical event hub before session
observers start. Snapshots and events retain their captured Host scope; stream
connection changes gate reclamation. Shutdown detaches all three subscriptions
and aborts outstanding cleanup before stopping the Agent Service.

## Invariants

- Only the current Host owner authorizes cleanup. An unavailable owner or
  isolated-space event cannot remove Host files. An owner change retires cached
  directories and pending cleanup.
- Canonical snapshots and full session updates supply directory evidence through
  a matching resolved Host scope, never an agent-supplied physical path. New forks
  use the same snapshot path; no SDK fork lookup or parent-directory guess exists.
  Unknown deleted sessions leave their files untouched. Canonical cascading
  deletions name every deleted session.
- The native session service owns complete global inventory. Cleanup validates
  its sessions and resolves directories through the Host scope owner, including
  archived roots, forks and subagents without filtering. Any inventory error or
  mismatched scope invalidates removal: an unresolved reference could still own
  the candidate folder. A session named by any Canonical event during inventory
  but missing from it is opened separately; only a Canonical session-not-found
  answer drops it.
- Session mutations during a read or filesystem check invalidate its deletion authority. A batch reads again before removing anything. Cascading deletions share the pending read.
- Removal needs a connected host stream and an inventory read after that connection. A stream loss invalidates every read in flight and suspends removal; the next connection reads a complete inventory before any candidate is removed.
- A remaining session in the folder or any descendant keeps the folder. Lexical descendants and filesystem-confirmed aliases count as references. An unreadable reference retains pending cleanup. Deleting the last session from a nested working directory also reclaims its generated chat folder.
- Eligible paths match the generated date and session layout under the configured or legacy chats root. Shared roots, date buckets, symlinked date buckets and symlinked session folders stay untouched. Configured root symlinks are resolved before checking ownership.
- Cleanup captures the folder and parent identities with exact device and inode values before reading references and checks them again before claiming the folder. Ownership capture and cleanup completions belong to the same process and candidate, independently of session inventory freshness. A session event causes a fresh reference read while retaining the original identities. A replacement at either path stays untouched, including after failed cleanup.
- Removal never targets the reusable pathname. A candidate is claimed by renaming it into a private `.reclaiming-*` folder under its chats root, and the claimed identity must match the captured one. A second complete inventory follows; only an unreferenced claim under unchanged authority is deleted, from the quarantine. A reference, a stream loss, an owner change, shutdown or a failed check puts every claim back. The return takes the free name with `mkdir` and renames onto that empty folder, so it never replaces anything that took the name meanwhile; when the name is in use the files stay in the `.reclaiming-*` folder and the log names it. A quarantine whose removal fails (a busy file on Windows) is logged by path and removed again on the next check, by that quarantine path only.
- Failed initial inspection leaves the files untouched and discards the automatic candidate because no original identity was established. Once identity is captured, failed reference reads or removal keep the candidate in memory for the next deletion or stream connection. Shutdown aborts reads and prevents new removal. Pending cleanup does not survive a server restart.

## Decisions

### Why cleanup follows confirmed deletions

A chat folder can belong to an unsent draft before the Agent Service has a
session for it. Scanning and deleting every unreferenced folder would remove
those drafts. Historical orphans remain outside this module's ownership.

### Why references come from the host API

Client lists may be unloaded, filtered or missing an event. The Host reads the
complete Canonical session inventory and its own directory bindings, so forks
and archived sessions keep their files.

### Why snapshots need a Host scope

Canonical sessions carry opaque project/workspace identifiers. The resolved
Host scope must match the session's project, workspace and root before its
directory can be tracked. A cached parent directory is not evidence for a fork.

### Why removal claims the folder first

Checking the identity and then deleting the original path leaves a gap: a new session, an owner change or a replacement folder after the check cannot stop a recursive delete already running there, and nothing after it brings files back. A rename into a private folder is atomic, so everything that may be destroyed has a known identity, and the fresh reference check runs while the original path is free and the files are still recoverable.

### Why cleanup does not paginate an SDK

The native session service already enumerates authorized workspace scopes and
reports per-workspace failures. Recreating the retired SDK's cursor protocol here
would add another inventory authority. Cleanup consumes that native aggregate
and rechecks after claiming the folder instead.

### Why cleanup validates API records and stream payloads

Cleanup parses Canonical inventory, snapshot and event schemas before granting
removal authority. Host scopes require absolute paths and matching identifiers.
Filesystem identities retain bigint device/inode values. The owner token is
opaque and compared only by identity.

### Why error properties remain untyped

Canonical failures and filesystem failures expose codes. Property reads preserve
inherited fields, primitive boxing and non-string messages without claiming that
every thrown value is an Error. Null and undefined retain the property-access
TypeError; the optional session-not-found check returns false for them.
