# Native session Host helpers

## Ownership

This directory owns Host metadata and archive persistence, linked-item helpers,
task naming, unread/duration projections and worktree-move coordination. Agent
execution, history and live status belong to the Canonical Agent API and its
separate Agent Service, not an OpenCode client or session record. Git owns
checkout creation, bootstrap and removal.

## Persistence

- `host/session-state.js` composes the stores with one explicit SQLite
  connection and lifecycle. Shutdown fences new admissions, drains accepted
  work, then closes the shared connection.
- `session-metadata-store.js` is the durable Host metadata authority. Its
  exported `SessionMetadata` type comes from its storage schema, including
  retained legacy projection fields. It is not the public Agent Contract
  metadata DTO; the gateway owns that validated public boundary.
- Read failures are not empty metadata and cannot authorize a write over
  unseen fields. Metadata operations preserve revision and transaction checks.
- Legacy file conversion is explicit and reports partial/error outcomes.
  Neither metadata nor archive conversion writes an SDK session record.
- `archive-store.js` preserves archive state independently of worker
  execution, checks session write authority and participates in the shared
  Host lifecycle.

## Domain boundaries

- Linked-item updates operate on the authoritative record at write time rather
  than replacing it with a client snapshot. Stable link identity and provider
  matching preserve unrelated fields and reject ambiguous unlink requests.
- Worktree moves carry explicitly named files. They do not infer ownership
  from a whole-worktree diff, and Git setup remains in the Git owner.
- Unread baselines and turn-duration data are persisted projections, not
  sources of live activity. Shared UI uses the Canonical unread mutation.
- Session creation, dispatch, status and waiting in the control service use
  its injected Canonical session service. No SDK archive/list/get helper or
  OpenCode folder-trust authority is part of this module.
