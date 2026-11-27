# Native session Host helpers

## Ownership

This directory owns Host metadata and archive persistence, linked-item helpers,
task naming, unread/duration projections and worktree-move coordination. Agent
execution, history and live status belong to the Canonical Agent API and its
separate Agent Service, not an OpenCode client or session record. Git owns
checkout creation, bootstrap and removal.

## Persistence

- Canonical metadata patches may include `expectedRevision`. The Host compares
  it inside the same SQLite transaction as the update and returns
  `409 METADATA_CONFLICT` without changing or announcing stale writes. Omission
  retains unconditional merge-patch behavior for non-read/modify/write callers.

- `host/session-state.ts` composes the stores with one explicit SQLite
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

## Admission and liveness lifecycle

- Session-scoped operations always resolve through the workspace-admitting
  scope resolver, including roots this process confirmed live. The supervisor's
  workspace scope capture is era-scoped to the service child and dies with it;
  re-admission is what re-captures it, so no in-memory liveness confirmation
  may bypass admission. A post-restart cold retry depends on this: the reopen's
  service-side skill-source reconcile authorizes against the captured scope.
- A verified refusal — a well-formed Agent Service problem document — completes
  a `reopen` admission at any status, because reopen is idempotent worker
  restoration and the refusal proves the service decided the outcome; the
  caller keeps the verified refusal itself. `create` and `fork` admissions are
  not idempotent, so a 5xx cannot prove non-commit for them: those still strand
  as uncertain and settle through the workspace-listing recovery.
- Stranded `create` and `reopen` admissions share one recovery path: the
  service's complete workspace listing settles the row. A reopen creates no
  native state, so a listed root settles it exactly like a create, and an
  absent root can never be restored.
- A direct-command delivery claim (`host_direct_command`) is released only on a
  verified refusal — a well-formed Agent Service problem document proving
  admission never accepted the command. Transport loss and uncertain failures
  leave the row pending as `COMMAND_IN_FLIGHT`; an accepted row is never
  released.

## Domain boundaries

- Prepared sessions remain speculative until create claims them or an authorized
  operation addresses their session ID. Inventory alone does not adopt them
  and omits them until they are adopted, so another client never lists an
  unused draft that its owner may still discard.
  Adoption cancels their timer and takes the same pool entry that timeout,
  discard and shutdown must claim before deleting. A cleanup already waiting
  for preparation rechecks that entry; if deletion has already claimed it,
  addressed operations fail with `COMMAND_IN_FLIGHT` rather than using a
  session being deleted. Unused preparations are still removed.
  This Host ownership rule is shared by web, Electron, hosted mobile and
  Capacitor clients; it does not depend on native quit behavior.

- Snapshot and inventory reads accept an optional cancellation signal. Failed
  workspace reads remain explicit inventory errors, never confirmed empty
  workspaces. Host cleanup must reject partial inventories before removing files.

- Linked-item updates operate on the authoritative record at write time rather
  than replacing it with a client snapshot. Stable link identity and provider
  matching preserve unrelated fields and reject ambiguous unlink requests.
- Worktree moves carry explicitly named files. They do not infer ownership
  from a whole-worktree diff, and Git setup remains in the Git owner.
  The session service captures its mover on first use, after Git registration
  fills the Host bridge. Before that it refuses with 503 without caching missing
  dependencies. The cached mover retains setup-wait retries across calls.
- Unread baselines and turn-duration data are persisted projections, not
  sources of live activity. Shared UI uses the Canonical unread mutation.
- Session creation, dispatch, status and waiting in the control service use
  its injected Canonical session service. No SDK archive/list/get helper or
  OpenCode folder-trust authority is part of this module.
