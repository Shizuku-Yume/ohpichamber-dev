# Canonical Agent API v1 contract

This document defines the Canonical Agent API v1 protocol (`/api/agent/v1`) between client surfaces and the OMP-backed Agent Service.

Wire DTOs and Zod schemas live in `packages/agent-contract`. The endpoint behavior below remains an implementation requirement until its owning M2/M3 task exercises it; schema acceptance is not proof of SDK, provider or transport behavior. `packages/sdk` continues to own the separate Guest extension contract, not the canonical agent contract.

The [latest-upstream rebaseline](../specs/upstream-rebaseline.md), accepted M0 SDK evidence and completed M1 Host extraction precede this contract. [Development progress](../development.md) records their evidence and provider/platform limits. The [refreshed-source traceability](scope.md#refreshed-source-traceability) identifies retained consumers.

Related migration documents:
- Scope and boundaries: [scope.md](scope.md)
- Deployment and process architecture: [architecture.md](architecture.md)
- Staged migration plan: [implementation-plan.md](implementation-plan.md)
- Baseline inventory and gap analysis: [feature-inventory.md](feature-inventory.md)
- Migration roadmap index: [README.md](README.md)

## Authority and precedence

When requirements conflict, documents follow this strict hierarchy:
1. Explicit user instructions.
2. [scope.md](scope.md) (product boundaries and retained surfaces).
3. [contracts.md](contracts.md) (protocol semantics and wire contracts).
4. [architecture.md](architecture.md) (process topology and deployment ownership).
5. [implementation-plan.md](implementation-plan.md) (milestone sequencing).
6. [feature-inventory.md](feature-inventory.md) (historical baseline analysis).

## Core invariants

1. **OMP Target Only.** The protocol targets OMP directly. It contains no OpenCode compatibility layer, no legacy OpenCode field aliasing, and no dual-engine selectors.
2. **Single State Authority.** OMP owns the conversation transcript and execution artifacts. The Host Gateway owns durable delivery, routing and operational session metadata. The Agent Service owns runtime projection, pending request handles and canonical event cursors. It projects Host metadata without becoming its writer. OpenChamber never builds a duplicate transcript store.
3. **Fail-Closed Security.** Task 28 observed public-factory built-in write approval/deny, bash selector cancellation and headless refusal. This is not complete tool-approval or Host Gatekeeper coverage. Any tool execution or capability request with missing, ambiguous, or incomplete permission definitions must halt and require explicit approval.
4. **No Silent Empty Success.** Unsupported endpoints, missing sessions, or invalid capability negotiations return explicit HTTP errors using the top-level Problem Details schema below. A server never returns HTTP 200 with an empty body (`{}` or `[]`) to mask unsupported features.
5. **JSON-Safe Projections.** Raw OMP SDK objects, Circular references, Symbols, and Node.js or Bun stream handles must never cross process or network boundaries. The Agent Service projects SDK state into plain, JSON-serializable Data Transfer Objects (DTOs).
6. **Path Isolation.** Client-facing payloads, attachments, and internal URIs must never expose host absolute filesystem paths. All files use opaque identifiers or repository-relative paths.

## Refreshed-source implementation obligations

- Guest Shell execution is worker-local OMP `BashTool`/native `executeBash`, retained by `AsyncJobManager` and inspected/cancelled through `AgentSession`. The [Guest Shell artifact](m0/guest-shell.json) establishes real start, output, exits, stop, retention and disposal. The separate Guest SDK contract remains in `packages/sdk`; it is not an agent transcript or an interactive PTY. See [Guest Shell projection](#guest-shell-projection-and-ownership) for intentional service requirements.
- Stateless completion serves Git/PR generation, titles, goals and walkthrough. Reuse the M0 controlled text, structured, cancellation and failure observations; task 12 must exercise the canonical service commands without turning Host services into a second provider engine. Real-provider structured conformance remains separate from the controlled SDK evidence. [M0 capability artifact](m0/capabilities-fixture.json)
- SourceBoard session/worktree launch and environment overlays need directory-bound execution. The M0 isolation fixture passed dedicated workers but failed all shared-process cwd/env modes. Shared process is unsafe for ambient cwd/env in this observed fixture, so dedicated workers are the current evidence-backed boundary direction. This evidence does not change ADR-03 or any API schema. [M0 isolation artifact](m0/isolation-artifact.json)
- The inherited bridge translates OpenCode text, reasoning, tool and execution events. Their names and 50 ms delta batching are not canonical contracts. Measure OMP ordering and fragment density; retain canonical cursors and authoritative resync semantics regardless of transport batching.
- Isolated-space dispatch currently forwards the inherited runtime. Its tokens, untrusted identity/events, quarantined code transfer, and gatekeeper grants need an OMP mapping with live boundary evidence. Source import alone does not establish it.
- Atomic JSON queue persistence is current source behavior. The target SQLite queue and its leases are a deliberate migration. Neither queue may duplicate the engine transcript or reinterpret fetch failure as authoritative empty state.
- The exercised installable input is the pinned-source artifact set in [source-install.json](m0/source-install.json), not registry 18.8.9. Reuse prior observations only for unchanged exercised owners and retain the factory probe's exit 1. Installed identity and its limits are recorded in [development.md](../development.md#guest-shell-and-installable-sdk-evidence); task 08 must re-establish application resolutions.


---

## Route matrix

All agent endpoints reside under the canonical prefix `/api/agent/v1`.

Clients reach this API through the Host Gateway (Node.js/Electron), which authenticates and authorizes the session/workspace before dispatch. The Host handles metadata and queue routes locally, including their durable writes and HTTP responses; it never forwards those operations to the Agent Service. Session list/detail responses are Host-composed runtime records plus separately revisioned Host metadata. Health/readiness/capabilities are Host-composed. Prompt commands pass through the Host delivery owner before internal dispatch. Only remaining Agent-owned operations are proxied over private loopback using internal credentials; the Agent Service is never externally exposed. Both response paths use the same canonical JSON/Problem Details contract.

### Endpoints

| Method | Path | Summary | Auth | Idempotent | Mode |
|---|---|---|---|---|---|
| `GET` | `/api/agent/v1/health` | Service health status | Optional | Yes | JSON |
| `GET` | `/api/agent/v1/ready` | Readiness and OMP SDK probe | Optional | Yes | JSON |
| `GET` | `/api/agent/v1/capabilities` | Negotiate capabilities and features | Required | Yes | JSON |
| `GET` | `/api/agent/v1/workspaces/:workspaceId/models` | Authorized workspace model catalog | Required | Yes | JSON |
| `GET` | `/api/agent/v1/workspaces/:workspaceId/providers` | Provider configuration and non-secret credential presence | Required | Yes | JSON |
| `GET` | `/api/agent/v1/workspaces/:workspaceId/agents` | Agent profile catalog | Required | Yes | JSON |
| `POST` | `/api/agent/v1/workspaces/:workspaceId/agents` | Create an agent profile | Required | Yes (Revision) | JSON |
| `PUT` | `/api/agent/v1/workspaces/:workspaceId/agents/:agentId` | Replace an agent profile | Required | Yes (Revision) | JSON |
| `DELETE` | `/api/agent/v1/workspaces/:workspaceId/agents/:agentId` | Delete an agent profile | Required | Yes (Revision) | JSON |
| `PUT` | `/api/agent/v1/workspaces/:workspaceId/providers/:providerId/config` | Persist provider configuration | Required | Yes (Revision) | JSON |
| `DELETE` | `/api/agent/v1/workspaces/:workspaceId/providers/:providerId` | Delete provider configuration | Required | Yes (Revision) | JSON |
| `PUT` | `/api/agent/v1/workspaces/:workspaceId/providers/:providerId/models/:modelId` | Persist model configuration | Required | Yes (Revision) | JSON |
| `DELETE` | `/api/agent/v1/workspaces/:workspaceId/providers/:providerId/models/:modelId` | Delete model configuration | Required | Yes (Revision) | JSON |
| `PUT` | `/api/agent/v1/workspaces/:workspaceId/providers/:providerId/credential` | Explicit credential write | Required | Yes (Revision) | JSON |
| `DELETE` | `/api/agent/v1/workspaces/:workspaceId/providers/:providerId/credential/:credentialRef` | Explicit credential deletion | Required | Yes (Revision) | JSON |
| `GET` | `/api/agent/v1/sessions` | List sessions for an authorized opaque workspace identity | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions` | Create a new session | Required | Yes (Key) | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId` | Get session metadata and status | Required | Yes | JSON |
| `PATCH` | `/api/agent/v1/sessions/:sessionId` | Update Host-owned session metadata through the Host writer | Required | Yes | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/metadata` | Host-owned metadata and its independent revision | Required | Yes | JSON |
| `DELETE` | `/api/agent/v1/sessions/:sessionId` | Delete session and child sessions | Required | Yes | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/history` | Paginated message and turn history | Required | Yes | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/snapshot` | Atomic runtime state snapshot and matching event cursor | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/runs` | Start a new agent execution run | Required | Yes (Key) | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/runs/:runId/abort` | Abort an active run | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/steer` | Inject prompt into running turn | Required | Yes (Key) | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/follow-up` | Stage prompt for next turn | Required | Yes (Key) | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/queue` | List durable queued prompts | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/queue` | Append prompt to durable queue | Required | Yes (Key) | JSON |
| `DELETE` | `/api/agent/v1/sessions/:sessionId/queue/:queueItemId` | Remove prompt from queue | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/queue/reorder` | Reorder queued prompts | Required | Yes | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/approvals` | List pending tool approvals | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/approvals/:approvalId/respond` | Resolve approval (CAS versioned) | Required | Yes (CAS) | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/questions` | List pending human questions | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/questions/:questionId/respond` | Answer or cancel question with generation identity and CAS version | Required | Yes (CAS) | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/events` | SSE event stream | Required | Yes | SSE |
| `POST` | `/api/agent/v1/attachments` | Upload attachment or media file | Required | No | Multi/JSON |
| `GET` | `/api/agent/v1/attachments/:attachmentId` | Download attachment content | Required | Yes | Binary |
| `GET` | `/api/agent/v1/subagents` | List subagents for a session | Required | Yes | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/mcp/catalog` | Workspace MCP configuration and addressed root worker's active catalog | Required | Yes | JSON |
| `PUT` | `/api/agent/v1/sessions/:sessionId/mcp/config` | Persist workspace MCP config, then apply across its active root workers | Required | Yes (Revision) | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/mcp/apply` | Apply current workspace config across its active root workers without restart | Required | Yes (Revision) | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/mcp/servers/:serverId/reconnect` | Reconnect one configured server in the addressed root worker | Required | Yes (Key) | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/mcp/servers/:serverId/oauth` | Read MCP server OAuth status and any active pending flow for the addressed root worker | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/mcp/servers/:serverId/oauth` | Start, complete, cancel or disconnect MCP server OAuth in the addressed root worker | Required | Yes (Revision/Generation) | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/skills/catalog` | Addressed root worker's installed-source revisions and active skill catalog | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/skills/install` | Host source commit plus scoped root-worker discovery outcomes | Required | Yes (Key) | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/skills/apply` | Apply installed workspace or selected-agent source revision across affected roots | Required | Yes (Revision) | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/skills/expand` | Expand from addressed root worker's generation/catalog; does not submit a prompt | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/shell/jobs` | Start a worker-local Shell job | Required | No | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/shell/jobs` | Authorized session-tree Shell snapshot | Required | Yes | JSON |
| `GET` | `/api/agent/v1/workspaces/:workspaceId/shell/jobs` | Authorized workspace Shell snapshot | Required | Yes | JSON |
| `GET` | `/api/agent/v1/projects/:projectId/shell/jobs` | Authorized project Shell snapshot | Required | Yes | JSON |
| `GET` | `/api/agent/v1/shell/jobs` | Shell snapshot within the full granted scope | Required | Yes | JSON |
| `GET` | `/api/agent/v1/sessions/:sessionId/shell/jobs/:jobId/output` | Bounded UTF-8 output range | Required | Yes | JSON |
| `POST` | `/api/agent/v1/sessions/:sessionId/shell/jobs/:jobId/stop` | Stop and observe actual job termination | Required | Yes | JSON |
| `POST` | `/api/agent/v1/workspaces/:workspaceId/completions` | Stateless text or structured completion | Required | No | JSON |
| `POST` | `/api/agent/v1/workspaces/:workspaceId/completions/:completionId/cancel` | Cancel the matching active completion | Required | Yes | JSON |

### Capability negotiation

Because OMP capabilities, model providers, and platform plugins vary, clients must negotiate capabilities at startup.

Examples describe the target response, not an observed SDK guarantee. The service reports implemented behavior only. A false capability does not waive a retained requirement in `scope.md` or satisfy an implementation gate.

Endpoint: `GET /api/agent/v1/capabilities`

The client may send query parameters or headers describing client-supported features:
`GET /api/agent/v1/capabilities?clientFeatures=streaming,cas_approval,subagents`

Response payload:
```json
{
  "version": "1.0.0",
  "engine": "omp",
  "capabilities": {
    "streaming": true,
    "casApprovals": true,
    "midTurnSteering": true,
    "followUpQueue": true,
    "subagents": true,
    "sessionBranching": true,
    "reasoningParts": true,
    "documentExtraction": true
  },
  "limits": {
    "maxAttachmentSizeBytes": 20971520,
    "maxQueueDepth": 50,
    "streamCatchupBufferSize": 1000
  },
  "experimental": {}
}
```

If a client attempts an action requiring an unsupported capability, the server returns HTTP 501 (`NOT_IMPLEMENTED`) or HTTP 400 (`UNSUPPORTED_CAPABILITY`). It never accepts the call silently.

### Standard error schema

All Canonical API HTTP errors use top-level RFC 7807 Problem Details with `Content-Type: application/problem+json`. Required standard members are `type`, `title`, `status` and `detail`. `type` is a stable URI of the form `urn:ohpichamber:problem:<CODE>`, and `status` equals the actual HTTP status. Optional `instance` identifies a sanitized request occurrence, never a host path or secret. There is no nested `error` wrapper or `message` alias.

The intentional extensions are `code`, the stable machine-readable error code; `retryable`, whether retrying the same operation may succeed without changing input; and optional `details`, JSON-safe, authorized context such as the current CAS record. Extensions never contain credentials, absolute paths or raw SDK exceptions.

```json
{
  "type": "urn:ohpichamber:problem:APPROVAL_CONFLICT",
  "title": "Approval conflict",
  "status": 409,
  "detail": "Approval request was already resolved by another client.",
  "code": "APPROVAL_CONFLICT",
  "retryable": false,
  "details": {
    "expectedVersion": "2",
    "actualVersion": "3",
    "currentRecord": {
      "approvalId":"appr_9872","sessionId":"sess_alpha","turnId":"turn_1","toolCallId":"tool_1",
      "toolName":"bash","actionType":"bash_command","commandSummary":"run project checks","details":{},
      "version":"3","epoch":"ep_1a","workerGeneration":"worker_g1","status":"approved",
      "requestedAt":1774201000000,"resolvedAt":1774201001000,"resolvedBy":"desktop-client-main",
      "resolution":{"decision":"approve"}
    }
  }
}
```

Standard error codes:
- `SERVICE_UNAVAILABLE`, `UNAUTHORIZED`, `INTERNAL_ERROR`, `INVALID_ORIGIN`, `enterprise_mode`, `UNSUPPORTED_MEDIA_TYPE` and `INVALID_REQUEST` retain the implemented Host readiness, authentication and request-boundary failures. `NOT_IMPLEMENTED` covers the deliberate unsupported-endpoint response.
- `SESSION_NOT_FOUND`: Session does not exist or was deleted.
- `RUN_ACTIVE`: Cannot start a new run while another run is active. Use `/steer`, `/follow-up`, or `/queue`.
- `RUN_NOT_FOUND`: Referenced run ID does not exist.
- `APPROVAL_NOT_FOUND` / `QUESTION_NOT_FOUND`: Request identity is unknown.
- `APPROVAL_CONFLICT` / `QUESTION_CONFLICT`: CAS version mismatch or request already resolved, HTTP 409.
- `APPROVAL_EXPIRED` / `QUESTION_EXPIRED`: Request expired due to timeout or runtime restart, HTTP 410.
- `IDEMPOTENCY_CONFLICT`: Command ID reused with conflicting payload parameters.
- `RESYNC_REQUIRED`: Event or Shell output cursor is outside retained coverage or belongs to a retired epoch/generation, HTTP 410. Event-stream rejection happens before headers.
- `INVALID_CURSOR`: Pagination or stream cursor cannot be parsed, HTTP 400.
- `UNSUPPORTED_CAPABILITY`: Requested feature is not enabled or supported.
- `SESSION_RESTORE_FAILED`: Saved model is unavailable or incompatible.
- `PAYLOAD_TOO_LARGE`: Upload or input exceeds its limit.
- `METADATA_CONFLICT` / `QUEUE_CONFLICT` / `CATALOG_CONFLICT`: Owning revision mismatch, HTTP 409 with the current authorized state.
- `APPROVAL_POLICY_WRITE_FAILED`: Host policy persistence failed; request remains pending, HTTP 503.
- `MCP_CONFIG_READ_FAILED` / `MCP_CONFIG_WRITE_FAILED` / `MCP_APPLY_FAILED` / `MCP_RECONNECT_FAILED` / `MCP_CREDENTIAL_UNAVAILABLE` / `MCP_OAUTH_FAILED` / `MCP_OAUTH_CANCELLED` / `MCP_OAUTH_NOT_FOUND` / `WORKER_GENERATION_CONFLICT` / `SKILL_INSTALL_FAILED` / `SKILL_APPLY_FAILED`: Explicit persistence, credential, OAuth, generation or runtime failure with sanitized state, never empty success.
- `METADATA_CORRUPT` / `METADATA_READ_FAILED` / `METADATA_WRITE_FAILED`: Explicit Host metadata failures; preserve previously committed state.
- `MODEL_UNAVAILABLE` / `PROVIDER_UNAVAILABLE` / `PROVIDER_FAILURE` / `CONTEXT_LIMIT` / `STRUCTURED_OUTPUT_INVALID`: Completion/model selection failures, without provider secrets or raw exceptions.
- `COMPLETION_NOT_FOUND`: No matching active completion exists for cancellation.
- `PROVIDER_CONFIG_WRITE_FAILED` / `MODEL_CONFIG_WRITE_FAILED` / `CREDENTIAL_WRITE_FAILED`: Configuration or credential persistence failed; no success revision is published.
- `SHELL_NOT_FOUND` / `SHELL_OUTPUT_UNAVAILABLE` / `SHELL_STOP_TIMEOUT`: Missing current job, unreadable retained output or failure to observe stop before its deadline.

---

## Identity and domain models

[`packages/agent-contract/src/index.ts`](../../packages/agent-contract/src/index.ts) exports each wire type and its `<Type>Schema`. These strict schemas are the field-level authority; this document owns protocol semantics rather than a second copy of their TypeScript declarations.

| Domain | Schema owner | Contract |
|---|---|---|
| IDs, counters and cursors | `primitives.ts` | Opaque identities; unsigned-64 canonical decimal counters; epoch-qualified stream cursors; separate opaque pagination cursors |
| Errors | `errors.ts` | Top-level RFC 7807 Problem Details and deliberate failure codes |
| Projects, agent profiles and sessions | `session.ts` | Opaque project/workspace mappings; model binding, tool whitelist, optional prompt override and permission preset; live runtime status and active outer-run identity |
| Host metadata | `metadata.ts` | Nullable metadata paired with its exact revision; typed `openchamber` operational fields and null-deletion patches |
| Runs, turns, messages and parts | `session.ts`, `messages.ts` | One outer run may contain several turns; `Turn.runId` identifies that run; tool termination does not terminate it |
| Captured prompts and attachments | `prompt.ts` | Independently nullable captured selection; ordered context; Host-owned `attachment://` references |
| Approvals and questions | `requests.ts` | Positive CAS versions, epoch and worker generation; explicit terminal resolution or cancellation |
| Atomic recovery and pages | `snapshot.ts`, `pagination.ts` | Runtime snapshot/cursor/active-run identity; complete pending replacement; branch-aware history and model/session pages |
| Durable delivery | `queue.ts` | Host revision and ordered queued/leased items; immutable captured delivery configuration |
| Provider, model, MCP and skill catalogs | `catalogs.ts` | Configuration/source revisions separate from per-root applied revisions; explicit mutation and partial-failure results |
| Guest Shell | `shell.ts` | Scope-qualified jobs, observed termination, bounded UTF-8 output cursors and restart invalidation |
| Stateless completion | `completion.ts` | Explicit selected model; text/JSON format; distinct completed, cancelled and failed results |
| Events | `events.ts` | Positive data-event sequence and unsequenced stream invalidation |

The Host privately maps `projectId` and `workspaceId` to validated cwd roots and worktrees. Session create/list commands accept those identities, not a public absolute `directory`. `displayPath` is a repository-relative display hint, never authorization. Private paths and SDK objects remain behind the Host/service boundary on every retained surface.

`RuntimeSession` contains `runtimeStatus` and nullable `activeRunId`, but no Host archive or metadata. Host-composed `Session` adds `archivedAt`, `archiveRevision`, nullable `metadata` and `metadataRevision`; confirmed missing metadata is exactly `null` at revision `"0"`. An operational record may omit `title`. Goals, work status, delivery receipts, context pins and multi-run membership stay under typed `openchamber` metadata, not a second scalar `goal` field. The Host projects a legacy multi-run private scope to an opaque identity before publication.

Agent profile mutations replace the complete profile at an expected owning revision. Omitted `systemPromptOverride` and `permissionPresetId` use the default prompt and policy; a preset ID selects an owning policy, not an unvalidated allow-mode shortcut. Provider/model mutations likewise carry their owning revision. Credential values occur only in an authenticated `ProviderCredentialWriteRequest`; catalogs, mutation results and events expose non-secret credential presence/references, never those values. Configured presence does not prove provider reachability.


## Streaming protocol and catch-up

The Agent Service owns canonical projection, ordering, replay and snapshot/cursor atomicity. OMP subscription events supply inputs; their probe-local sequence numbers are not resumable service cursors. None of the guarantees below has been exercised against a service.

### Canonical event vocabulary

SSE names and WebSocket `type` values use the same vocabulary. SDK events and inherited OpenCode aliases remain private inputs, never additional public event names.

| Events | Meaning |
|---|---|
| `session.updated`, `session.deleted`, `session.status` | Authoritative session projection or runtime state change |
| `run.started`, `run.completed`, `run.failed`, `run.cancelled` | Outer user-request lifecycle |
| `turn.started`, `turn.completed` | One model cycle inside a run, never outer-request completion |
| `message.created` | Stable message identity and role |
| `part.started`, `part.delta`, `part.completed` | Stable part identity, append delta and settled part |
| `tool.started`, `tool.completed` | Tool execution and its terminal result, including failure/denial/cancellation |
| `approval.requested`, `approval.resolved` | Versioned approval creation and resolution/expiry |
| `question.requested`, `question.resolved` | Versioned question creation and resolution/expiry |
| `queue.updated` | Host delivery-owner queue projection |
| `catalog.updated` | Successfully applied catalog/configuration revision |
| `shell.updated` | Service-owned Shell observation projection |
| `stream.invalidated` | Unsequenced control frame requiring authoritative resnapshot |

### Event format

Each data event has `sessionId`, `epoch`, `sequence` and `timestamp`, plus its canonical payload. SSE `id` equals `${epoch}:${sequence}`. WebSocket data frames carry these same fields and a `type` equal to the SSE event name.

`CanonicalEvent` is the transport-normalized record: its `type` comes from the SSE `event` name or the WebSocket JSON `type`. An SSE decoder combines that name with the JSON payload before schema validation. `part.started` includes `messageId`; `part.completed` carries the settled `part`. Deltas retain `{partId, delta}`. Runtime status publishes `{runtimeStatus, activeRunId}`, and outer-run terminal events contain no singular `turnId`.

```text
id: ep_98a7:42
event: part.delta
data: {"sessionId":"sess_102","epoch":"ep_98a7","sequence":"42","timestamp":1774201002000,"partId":"prt_4","delta":"Updating"}
```

### Cursor and epoch semantics

- An epoch identifies one session stream generation. The service creates a fresh epoch on service restart, worker replacement or projection/replay reset. An epoch never resumes after its ownership ends.
- Every epoch transition expires its old pending handles, including a projection/replay reset. The service cancels/invalidates those handles before exposing the replacement epoch; a new pending record must match the snapshot's current epoch. Resetting replay is not permission to keep an old-epoch live approval that collective recovery declares expired.
- Sequence is a monotonically increasing unsigned 64-bit counter per session and epoch, starting at 1. JSON encodes it as a canonical decimal string to avoid JavaScript number rounding. `"0"` means the snapshot precedes the first event. Compare counters numerically, not lexically. Before exhausting the counter, invalidate the stream and start a fresh epoch.
- Cursor is `${epoch}:${sequence}`. Epoch identifiers contain no colon. `Last-Event-ID` or `?cursor=` supplies it; conflicting values return HTTP 400 `INVALID_CURSOR`.
- Replay retains the newest 1,000 canonical events per active session, as advertised by `streamCatchupBufferSize`. A cursor at head is valid. A cursor immediately preceding the oldest retained event is valid only if every following event through head is available. Older cursors, other epochs and positions beyond head require resnapshot. Missing cursor also requires the snapshot-first flow.

### Atomic snapshot and replay handoff

`GET /api/agent/v1/sessions/:sessionId/snapshot` returns `SessionSnapshot`. The runtime session's `epoch` and `headSequence` encode exactly `cursor`. `branchId` and `branchVersion` identify the captured history selection; `leafMessageId` is its selected leaf, or null for an empty branch. The window contains a contiguous tail of turns, including an active turn when present, and every currently projected message/part in those turns on that branch, in history order. Its first/last IDs are inclusive array bounds, all null when empty. `hasEarlier` says older turns exist outside this window. This is not a global session list or all paginated history. Pending request arrays cover the whole session independently of the history window; `requestRecovery` makes their replacement and prior-epoch expiry authoritative.

The service captures runtime records and cursor at one serialized projection boundary. The snapshot contains every covered mutation through sequence N and none after N. It then serves every retained event after N in order and joins live delivery without a gap or replay/live race. If N falls out of replay before connection, the stream refuses it and the client takes another snapshot. A separate paginated `/history` response is not an atomic recovery snapshot.

Host metadata and queue are deliberately excluded from `SessionSnapshot`. Recovery reads `GET .../metadata` → `SessionMetadataState` and `GET .../queue` → `QueueState` separately. Each Host state has its own unsigned-64 decimal `revision`; they are not ordered by the service cursor or atomically captured with it. Install each successful Host read by its own revision, ignore lower-revision results and preserve prior valid data on failure. `session.updated` carrying Host metadata includes `{metadata, metadataRevision}`; `queue.updated` carries `{queue: QueueState}`. A projected event cannot overwrite a newer Host read. Session detail/list composition includes the exact `metadataRevision` but promises no cross-owner atomicity. All CAS versions and revisions use `Counter` numerically, never lexically; counter exhaustion requires an explicit failure, never wrapping or rounding.

For example, an empty captured branch returns:

```json
{
  "session": {"sessionId":"sess_alpha","projectId":"project_1","workspaceId":"workspace_1","displayPath":".","rootSessionId":"sess_alpha","createdAt":1774201000000,"updatedAt":1774201000000,"epoch":"ep_2","headSequence":"0","runtimeStatus":"idle","activeRunId":null},
  "cursor":"ep_2:0",
  "activeRun":null,
  "branch":{"branchId":"branch_1","branchVersion":"1","leafMessageId":null},
  "window":{"firstTurnId":null,"lastTurnId":null,"firstMessageId":null,"lastMessageId":null,"hasEarlier":false},
  "turns":[],"messages":[],"approvals":[],"questions":[],
  "requestRecovery":{"pendingSet":"replace","priorEpochs":"expired"}
}
```

Clients key reconciliation by runtime identity, session and epoch. They install a successful snapshot and its cursor together, reconcile optimistic records by stable identity, and apply only the next sequence. Same-epoch duplicates at or below the committed sequence are ignored; any forward gap triggers recovery. Old-runtime responses cannot publish after a switch. Failed or partial reads preserve the last valid state, not an empty authoritative replacement.

### Stream rejection and invalidation

Cursor syntax, authorization, epoch and replay coverage are checked before SSE headers. An invalid syntax returns HTTP 400 `INVALID_CURSOR`; a stale/uncovered cursor returns HTTP 410 `RESYNC_REQUIRED`, both with top-level `application/problem+json`. No stream is opened in either case.

After `200 OK`/stream headers, HTTP status cannot change. If the active stream loses replay continuity, changes epoch or cannot deliver within its bounds, send this control frame and close the stream. It has no SSE `id` or data-event `sequence` and does not advance the client's cursor:

```text
event: stream.invalidated
data: {"sessionId":"sess_102","epoch":"ep_b120","reason":"EPOCH_CHANGED"}
```

Reasons are `EPOCH_CHANGED`, `REPLAY_UNAVAILABLE` or `DELIVERY_OVERFLOW`. A transport that closes before delivering the control frame still enters cursor validation on reconnect; it does not invent a successful HTTP 410 after headers. WebSocket recovery uses the same control payload before close. Clients stop applying that stream, fetch an authoritative snapshot, then resume after its cursor. They never retry the invalid cursor indefinitely or silently discard missing deltas.

---

## Commands, idempotency, and delivery guarantees

Clients issue mutating commands to initiate runs, steer active execution, or manage the queue.

### No Distributed Exactly-Once Delivery

In distributed systems and multi-process architectures, crashes can occur at three distinct points:
1. Before the request reaches the server (action never executes).
2. During server execution before disk commit or state save (partial failure).
3. After server execution and commit, but before the network acknowledgment reaches the client (action executed, but client receives network error or timeout).

Because network acknowledgments and server crashes are decoupled, physical **exactly-once execution is impossible**. The Canonical protocol provides **at-least-once transport with at-most-once execution** via persistent idempotency keys.

### Idempotency Key Semantics

Delivery commands (`/runs`, `/steer`, `/follow-up`, queue append and session creation) require an `Idempotency-Key` UUIDv4; MCP reconnect and skill installation use that same mechanism. Metadata/queue revision mutations and catalog config/apply use their explicit revision preconditions; approval/question replies use CAS. These preconditions are not interchangeable: an idempotency replay cannot bypass authorization or apply to a replacement worker generation.

1. **Storage.** The Gateway records processed idempotency keys in persistent storage with an expiration window of 24 hours.
2. **Replay Detection.** If a request arrives with an existing key:
   - If the original request is still processing, the server returns HTTP 409 (`CONFLICT`) with `code: "COMMAND_IN_FLIGHT"`.
   - If the original request completed successfully, the server returns the cached response status and payload without re-running the command.
   - If the original request failed with a deterministic client error (HTTP 4xx), the server returns the same error response.
3. **Payload Mismatch.** If the incoming payload differs from the recorded payload for the same key, the server rejects the call with HTTP 400 (`IDEMPOTENCY_CONFLICT`).

### Single Delivery Owner

Prompt delivery has one single owner: the Host Gateway.

```
Client UI ---> Host Gateway (Single Delivery Owner) ---> Agent Service (OMP)
                   |
                   +-- Durable Prompt Queue (FIFO)
                   +-- Mid-Turn Steering Router
                   +-- Follow-Up Stage
```

- **Immediate Run (`/runs`)**: Sent to the Agent Service only if the session runtime is idle.
- **Mid-Turn Steer (`/steer`)**: Injects guidance into an active OMP execution step. Only valid when the session turn status is `running` or `awaiting_approval`.
- **Follow-Up (`/follow-up`)**: Held by the Gateway and dispatched to the Agent Service immediately when the current run transitions to a terminal state.
- **Durable Queue (`/queue`)**: Persisted by the Gateway in disk storage. Items are dequeued sequentially only when the session is completely idle and no follow-up is pending.

Immediate runs and queue admission use the same `PromptRequest`, never a guessed SDK argument shape. Queue append accepts `{content: string, contextPreview?: string, request: PromptRequest}`. Host authorization binds the path session to its opaque workspace; the Host atomically captures and persists the entire request with provider/model/agent/variant/reasoning options, resolved text, server-backed attachment records, ordered context text/metadata/instructions and any agent mention before acknowledging. Explicit null provider/model values mean no override: the addressed session/agent/runtime owner's normal selection remains authoritative, not the currently displayed Composer selection. Null is retained as null, not a fake sentinel or a new fallback; a partially specified provider/model pair is evaluated through that same owner's existing selection rules and reports incompatibility explicitly. Other null options likewise retain their no-override meaning. Fixed captured selections remain fixed on dispatch/retry; an unavailable fixed model is an explicit send failure retaining the item. No queued send re-reads mutable UI choices or substitutes a newly selected provider/model/agent/thinking option.

`QueueItem` is the compact authorized projection of that durable item: options are complete, attachments contain immutable Host references/metadata, and context descriptors retain order/kind/instruction presence/receipt identity without broadcasting large context payloads or attachment bytes on every `queue.updated`. Host storage retains the full `PromptRequest`; a projection is never sufficient to reconstruct delivery by re-reading mutable state. `contextPreview` is bounded to 100 characters plus ellipsis and cannot replace captured text/context. Context instructions precede their corresponding context entry; captured receipt identities are marked delivered only after canonical prompt acceptance. Host-owned pending session knowledge may be appended at dispatch through its existing delivery/receipt owner, as retained queue behavior, without replacing the captured Composer context or selections. Existing Host auto-routing may resolve a captured auto-model selector under its policy at dispatch; it must not reinterpret a fixed captured model or read current Composer choices.

`QueueState.items` is the single delivery-order authority. Reorder supplies a complete permutation of current item IDs and cannot move/remove a leased item; conflicting revisions or leases return an explicit conflict. Lease identity/expiry describe the current Host dispatch claim, not a second execution queue or a persisted “sending forever” flag. Task 11 must prove lease/restart recovery and captured configuration/attachment/context preservation through SQLite. Queue storage and events contain no transcript copy or secret/absolute-path fields. Any future canonical prompt option must be added to this common captured shape and persisted at admission, never resolved from mutable current state at send time.

A queue read/event returns the captured options even after the Composer selects a different model; heavy context remains in the Host-owned item:

```json
{
  "sessionId":"sess_alpha","revision":"7",
  "items":[{
    "queueItemId":"queue_1","content":"Review the attached issue","text":"Review the attached issue",
    "attachments":[{"attachmentId":"att_8812","name":"auth-error.txt","mediaType":"text/plain","size":128,"uri":"attachment://att_8812"}],
    "context":[{"index":0,"kind":"context","hasInstructions":true,"deliveryReceiptId":"context_receipt_1"}],
    "contextPreview":"Captured issue context",
    "options":{"providerId":"anthropic","modelId":"claude-3-7-sonnet","agentId":null,"variant":null,"reasoningEffort":"medium"},
    "status":"queued","createdAt":1774201000100
  }]
}
```

The Agent Service never implements a secondary queue. It processes runs dispatched by the Gateway.

### Host metadata and queue response ownership

After authentication and authorization, the Host intercepts `PATCH .../sessions/:sessionId`, `GET .../metadata`, and every `/queue` route before the Agent proxy. Metadata PATCH accepts only `{changes: Partial<SessionMetadata>}`; there is no top-level writable title alias. The Host atomically commits a valid patch and increments that metadata revision, then returns `SessionMetadataState`. Queue reads/mutations return `QueueState` after the Host's queue transaction; no acknowledgement precedes the durable write. Writes require `If-Match: "<revision>"` for their owning metadata or queue revision. A mismatch returns HTTP 409 `METADATA_CONFLICT` or `QUEUE_CONFLICT` with the current authorized state; failed writes preserve the prior state/revision and return an error, never success or empty data.

The Host sends committed Host state to the service projector for `session.updated` / `queue.updated`; delayed or failed event projection cannot roll back the Host HTTP result or alter its revision. Reconnect reads the independent Host state even if projection lagged. Host metadata/queue APIs remain usable while Agent execution is unavailable; dispatch waits for readiness. Session detail/list is composed by the Host from service runtime records and its metadata; independent `.../metadata` remains the read path when runtime composition is unavailable. No Host metadata/queue operation becomes an Agent-owned durable writer merely because its public path uses `/api/agent/v1`.

---

## Lifecycle and terminal state separation

A critical invariant of the Canonical protocol is the strict separation between **Run terminal states** and **Tool terminal states**.

### Tool Failure Does Not Fail the Run

A tool call failure (e.g. non-zero bash exit code, missing file, or permission denial) terminates only that tool call:
- Tool terminal states: `completed`, `failed`, `denied`, `cancelled`.

When a tool finishes with `failed` or `denied`, the Agent Service injects a `tool_result` part containing the failure details back into the agent context. The LLM observes the error and can choose to explain the issue to the user, try a different approach, or ask a question. The outer Run remains active and in state `running`.

### Run Terminal States

A Run represents the entire multi-step conversation cycle initiated by a user prompt.
- Run terminal states: `completed`, `failed`, `cancelled`.

The Run reaches `failed` only if the model execution itself crashes unrecoverably (e.g. context window exhaustion, provider quota error, or internal agent panic).

### OMP turn_end semantics

OMP emits `turn_end` internally at the end of each reasoning cycle. In an agentic loop, one user request may generate multiple internal reasoning cycles, multiple tool calls, and multiple OMP turns.

**Observed fixture distinction:** OMP emits `turn_end` internally at the end of each reasoning cycle, and terminal `agent_end` is a distinct event. The canonical `run.completed` event remains proposed until an Agent Service projection exists. Clients and gateway adapters must never treat OMP's internal `turn_end` as completion of the outer user request. [M0 lifecycle artifact](m0/lifecycle.json)

---

## Approvals, questions, and human-in-the-loop

Tool approvals and human questions halt model execution until a user or automated rule provides feedback.

### Multi-client compare-and-swap (CAS)

The Agent Service owns real SDK pending handles and an atomic resolution registry for both approvals and questions. This is an intentional service contract, not SDK-provided CAS.

Each record carries a decimal-string CAS `version`, its creation `epoch` and opaque `workerGeneration`. Request IDs are never reused. `ApprovalReply` and `QuestionReply` supply these fields to the existing `/respond` routes. The service verifies the current epoch/generation before request lookup: prior-owner replies return HTTP 410 `APPROVAL_EXPIRED` / `QUESTION_EXPIRED` even when a restart discarded the old registry. Unknown IDs in the current owner return HTTP 404. The current owner's pending status and expected version are selected atomically; exactly one responder may resolve that live handle. Competing replies return HTTP 409 with `{expectedVersion, actualVersion, currentRecord}` in sanitized Problem Details `details`.

Approval decisions are the four retained values, not record statuses: `approve` and `always-allow` finish as `approved`; `reject` and `always-deny` finish as `rejected`. `always-allow` persists the request's service-derived tool/pattern target for this session; `always-deny` persists it for the authorized workspace across sessions/restarts. The client cannot invent a wider target or scope. Policy persistence belongs to the Host's retained settings/approval-policy boundary and authorization, not a new SDK policy framework. A request without a safe `policyTarget` cannot accept an always decision; it returns an explicit error and remains pending. One-shot choices persist no policy.

For an always decision, the service reserves the CAS winner without invoking the SDK handle, asks the Host to atomically commit the fixed target/scope, and only then increments the request version and resolves the live handle. Host failure returns HTTP 503 `APPROVAL_POLICY_WRITE_FAILED`, with the unchanged pending record, releases the reservation and executes nothing. Committed policy may survive a crash before acknowledgement; that crash still expires the old request and never replays its action. Host policy `revision` and `persistence: "committed"` appear in `ApprovalResolution`; there is no reported committed policy on a failed write. Success returns the full resolved `ApprovalRequest` and publishes `approval.resolved` with `{approval: ApprovalRequest}`, including `resolution`. This event/response are the CAS result, not a second independently writable policy record.

```json
{"decision":"always-allow","policyScope":"session","version":"1","epoch":"ep_1a","workerGeneration":"worker_g1"}
```

Question answering uses `{action:"answer", response, version, epoch, workerGeneration}`; cancellation uses `{action:"cancel", version, epoch, workerGeneration}` and forbids `response`. Both share the same CAS checks. An answer must satisfy the pending question's schema before selection; invalid input leaves it pending. Cancellation terminates the SDK ask without an answer and never auto-continues with a fabricated value. Success increments the version, returns the full `QuestionRequest` with `answered` or `cancelled`, and publishes `question.resolved` with `{question: QuestionRequest}`. Cancellation sets `resolvedAt` but not `answeredAt` or `response`. SDK failure is explicit, never a fake successful resolution; task 10 must implement the real handle transition.

### Pending requests on reconnect and restart

A connection loss alone preserves pending records/versions. Recovery atomically replaces the client's complete pending set from snapshot arrays. `requestRecovery.priorEpochs: "expired"` is a collective terminal-expiry declaration for every handle created in a different epoch: clients dismiss those dialogs and mark their locally known requests expired, never infer approval or an answer. A pending same-epoch request absent from the complete replacement set is no longer pending and must be dismissed; the snapshot does not guess whether it was answered, rejected or cancelled. New-epoch events are not needed to discover old-owner expiry.

Worker replacement, service restart or Host restart first invalidates the old epoch/handles, then exposes the new epoch and its complete pending set. No live handle, question answer or request descriptor is durably persisted for this recovery rule; the snapshot's collective expiry and generation-first HTTP 410 work even when the old registry is gone. A timeout/explicit expiry within the current epoch increments the record version and publishes its terminal resolved event. Never auto-approve or apply an old answer across restart; a resumed action/question gets a fresh ID/generation. Old worker events/replies cannot mutate the replacement. Task 10 must prove CAS, cancellation, policy-write failure, reconnect and restart through the actual service; direct SDK fixtures cannot satisfy these proposed guarantees.

### Fail-closed tool approval

OMP permission rule evaluation is not assumed to be fully verified.
- If a tool requires approval and no matching rule explicitly allows it, execution halts.
- If approval configuration is corrupt, missing, or references an unknown tool name, the system fails closed and prompts the user for approval.

### Interactive questions via OMP ask tool

The M0 capability fixture observed direct approval/question request, resolve and cancel behavior that supports fail-closed fixture semantics. The separate restart-pending fixture observed pending requests, worker termination, a distinct fresh OMP session, and measured tool/answer/event counts. Its direct UI seam exposes no cross-worker response handle, so stale resolution is explicitly unavailable and approval/question parent probes remain partial. Neither fixture verifies CAS, RPC stale replies, durable request recovery or Agent Service restart semantics. The CAS and restart rules above remain proposed. See the [capability artifact](m0/capabilities-fixture.json), [restart-pending artifact](m0/restart-pending.json), and [development evidence](../development.md#m0-fixture-evidence).
---

## Session topology, branching, and deletion

### Branching versus filesystem rewind

The protocol treats conversation history branching and filesystem modifications as completely separate concerns:

1. **Branching.** Branching forks the message transcript at an earlier turn. The Agent Service creates a new linear history path from that turn.
2. **No Filesystem Rollback.** Branching does not rewind files, delete created files, or revert Git commits made by tools in abandoned turns.
3. **Explicit Host Operations.** If a user wishes to restore previous file states, they must execute explicit Host Git operations (e.g. `git restore` or worktree branch switching) through Host APIs.

### History Pagination Across Branch Versions

The history endpoint retrieves linear history leading up to a specific branch leaf:

`GET /api/agent/v1/sessions/:sessionId/history?leafTurnId=turn_881&limit=50&cursor=cur_10`

Query parameters:
- `leafTurnId` (optional): Identifies the leaf turn of the desired branch. If omitted, the session's active head is used.
- `limit` (optional): Number of messages to return (default 50, maximum 100).
- `cursor` (optional): Opaque pagination cursor.

The response returns messages ordered chronologically along the selected branch path, ensuring sibling branch messages are never interleaved.

### Session Deletion Hierarchy

Session deletion follows a strict hierarchy without heuristic guessing:

```
Project
  └── Worktree
        └── Root Session (sessionId)
              └── Subagent Session A (childSessionId)
              └── Subagent Session B (childSessionId)
```

Rules:
1. **Cascade to Children.** Deleting a Root Session automatically cascades to delete all associated child subagent sessions and active runs.
2. **Worktree Protection.** Deleting a session never deletes repository files or worktree directories on disk unless an administrative parameter `purgeWorkspaceFiles: true` is explicitly provided.
3. **Active Run Guard.** Attempting to delete a session with an active run returns HTTP 409 (`RUN_ACTIVE`) unless `force: true` is set, which aborts the run first.

---

## Attachments, media, and URI privacy

To preserve privacy across remote web surfaces, mobile connections, and cloud relays:

1. **Zero Host Path Leakage.** File attachments must never include absolute host paths (e.g. `/home/user/code/file.txt` or `C:\Users\...`).
2. **Opaque URIs.** Uploaded files receive an opaque identifier and URI format: `attachment://att_a8f902`.
3. **Workspace-Relative Paths.** Files referenced from the active repository use `workspace://relative/path/to/file.ts`.
4. **Content Negotiation.** Large documents (Office documents, PDFs) are validated and converted to sanitized text projections by the Host before submission to OMP, respecting the 500,000 character limit.

---

## Metadata sidecar and transcript ownership

The Host Gateway is the sole durable writer for custom titles, goals, assist recaps/suggestions, context delivery cursors/receipts, pinned notes, pins, folders, retention and workspace associations. `SessionMetadata.title` is the only canonical title; `Session.metadata` and `metadataRevision` are Host-composed projections, not permission for the Agent Service to persist or patch them. Runtime snapshots omit them and use independent Host reads. A context delivery cursor is Host metadata, distinct from a service event cursor.

OMP alone writes messages, reasoning, tool results and compaction history. The service reads/projects OMP state and owns transient execution handles and replay state. Host metadata stores no duplicate transcript or tool-output history. Task 20 migrates applicable existing Host metadata and every accessor before removing its OpenCode source. Missing, corrupt and failed metadata reads/writes remain distinct; failure preserves valid prior data and does not clear unrelated sessions.

---

## Stateless completion

`POST /workspaces/:workspaceId/completions` accepts `CompletionRequest`; route identities are under `/api/agent/v1` and must match any body identity. The Host authorizes the workspace and selects the full provider/model before dispatch. The service uses the OMP completion API without creating an Agent session or transcript, switching providers, or falling back to a Host direct-provider client.

The client supplies `completionId` so cancellation can address an active HTTP request. Format is text or a JSON schema; captured variant/reasoning selections and explicit overflow policy are independent of UI state. `CompletionResult` is exactly completed with output/usage, cancelled with a reason, or failed with a sanitized typed error. Failure/cancellation cannot carry successful output. Cancel returns `CompletionCancelResult` only after actual cancellation; unknown or terminal identities do not produce a fake acknowledgement. Dynamic JSON-schema conformance and provider support are task 12's runtime obligations, not guarantees supplied by parsing the request.

## Guest Shell projection and ownership

The real SDK owner and observation limits are in [guest-shell.json](m0/guest-shell.json). `getAsyncJobSnapshot`, `inspectAsyncJob` and `cancelAsyncJob` are worker-local. Successful bash inspection synthesizes exit 0; nonzero exit 42 was observed. Inline strings can elide the middle, and an optional raw artifact is not a byte-cursor protocol. Configured retention was exercised; default retention and disk-overflow caps remain source-only.

Task 12 owns the service registry/project/session index and Host/Guest capability checks, scoped running/ended snapshots, output tails/cursors with skipped-byte detection, terminal exit and stop/timeout reasons, restart invalidation and reconnect. Preserve the Guest newest-200 ended history independently of SDK time-based expiry. Agent-owner filtering alone is not project authorization. No canonical OpenCode Shell route or field alias is retained, and no empty lifecycle store substitutes for execution.

The route matrix exposes session-tree, workspace, project and full-granted-scope `ShellSnapshot` reads. Public jobs identify an opaque scope, observation epoch and root worker generation, never a PID or SDK artifact path. The service separates running jobs from the newest 200 ended observations and returns explicit prior-epoch invalidation after restart.

`ShellOutput` counts bytes in the service's emitted UTF-8 text stream: `requestedCursor + skippedBytes == startCursor`, then `startCursor + UTF8(output).byteLength == cursor`. Reads are bounded to 65,536 bytes; retained gaps and stale epochs/generations require recovery, not silent truncation or empty success. Output is merged, not a guessed stdout/stderr split. Stop succeeds only after an observed stopped termination; already-ended jobs and missed stop deadlines do not return a fabricated stop acknowledgement.

The interrupted native descendant reproduction and dedicated Linux runner cleanup in [task 01](../done/omp-through-m3/01-m0-guest-shell.md) do not prove process cleanup for a shared Host or service supervisor. That owner needs its own M2 evidence.

## MCP and skills service boundary

### MCP configuration and runtime operations

The [capability artifact](m0/capabilities-fixture.json) observed workspace `.omp/mcp.json` discovery, one real local stdio tool call, explicit tool-list refresh, manual reconnect replacing the process, and shutdown clearing tools/exiting children. It did not observe config file watching, changed configuration/schema reload, automatic crash recovery, HTTP/SSE transports or remote OAuth.

Task 26's [installed MCP artifact](m0/mcp-transports-config.json) additionally observed HTTP/SSE, explicit configuration/schema application, a local authentication challenge, manual reconnect and transport-close recovery. Remote OAuth, default config watching and abrupt network outage remain unverified. Gate 03 accounts for those limits separately from task 12's required service behavior.

The service owns connect/disconnect/reconnect, dynamic enable/disable, configuration application and catalog revision publication. It uses verified OMP manager/runtime operations, not a guessed `mcpManager` factory parameter or assumed global filename. The operations/DTOs below are intentional canonical contracts, not observed SDK API signatures. A write acknowledgement and successful runtime apply are distinct. `scope.md` retains live refresh without whole-server restart and stdio/SSE/HTTP/OAuth; task 12 must implement and prove those requirements. Missing required M0 evidence stays with gate 03, and unsupported flags cannot green either gate.

### Skill storage and expansion

The lower-level fixture observed agent-directory global skills, workspace `.omp/skills`, filtering and explicit `buildSkillPromptMessage` followed by `AgentSession.prompt`. Its direct slash expansion was unsupported, not proof that the full factory/CLI supports or rejects it. Task 25's [public-factory artifact](m0/public-factory-auth-skills.json) additionally observed system-prompt generation, `.agents/skills` discovery and public skill delivery. CLI slash handling remains unexercised.

Global installation targets the selected OMP agent directory's `skills/`, defaulting to `~/.omp/agent/skills/`; do not claim `~/.config/omp/skills/` is the observed SDK default. Task 25 observed project `.agents/skills/` discovery; the earlier lower-level fixture used `.omp/skills/`. The Host owns catalog downloads, trusted source policy and filesystem installation; the service owns discovery/filtering and prompt expansion using the OMP skill builder. The Canonical Client receives catalog projections and never reads SDK files directly. Task 12 proves runtime application and task 15 proves Composer mentions/slash expansion. No unsupported direct SDK slash assumption may silently retire the product behavior.

### Catalog records and operations

Every catalog route is authorized against the path session's opaque workspace and private selected agent-directory mapping. A subagent resolves to its root's worker; it is not a separate apply target. One service-owned `MCPConfigurationState` persists config/revision per workspace. Applied catalogs/revisions belong to each root worker generation, including separate roots sharing one workspace; there is no workspace-wide applied-success flag. The service handles MCP operations and skill catalog/discovery/expansion. Host `skills/install` owns source trust/download/filesystem commits, then requests service discovery across the affected roots. Session-scoped paths identify the authorization/source context, not permission to leave sibling root workers stale.

```typescript
export type MCPTransport =
  | { type: "stdio"; command: string; args: string[]; envCredentialRefs?: Record<string, EntityId> }
  | { type: "http" | "sse"; url: string; credentialRef?: EntityId };

export interface MCPServerConfig {
  serverId: EntityId;
  label: string;
  enabled: boolean;
  transport: MCPTransport;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
}

export interface MCPTool {
  serverId: EntityId;
  toolId: EntityId;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CatalogWorkerIdentity {
  rootSessionId: EntityId;
  workspaceId: EntityId;
  workerGeneration: string;
}

export interface MCPConfigurationState {
  workspaceId: EntityId;
  persistedRevision: Counter; // One service-owned workspace config revision
  config: MCPConfig;
}

export interface MCPAppliedRevisions {
  runtimeStatus: "ready" | "unavailable";
  appliedRevision: Counter | null;
  catalogRevision: Counter;
}

export interface MCPCatalogState extends MCPAppliedRevisions {
  worker: CatalogWorkerIdentity;
  activeServers: EntityId[];
  tools: MCPTool[]; // This root's last valid catalog, not a failed partial tool list
}

export interface MCPCatalogRead {
  configuration: MCPConfigurationState;
  workerCatalog: MCPCatalogState;
}

export interface SkillSourceRevisions {
  workspace: Counter;
  agent: Counter; // Selected agent directory, never an absolute public path
}

export interface SkillEntry {
  skillId: EntityId;
  name: string;
  description: string;
  scope: "workspace" | "agent";
}

export interface SkillsAppliedRevisions {
  runtimeStatus: "ready" | "unavailable";
  persistedSources: SkillSourceRevisions; // Host source pair for this root's mappings
  appliedSources: SkillSourceRevisions | null;
  catalogRevision: Counter;
}

export interface SkillsCatalogState extends SkillsAppliedRevisions {
  worker: CatalogWorkerIdentity;
  agentDirectoryId: EntityId; // Opaque authorized selected-source identity, never a path
  skills: SkillEntry[]; // This root's last successfully discovered/filtered catalog
}

export type CatalogUpdate =
  | { kind: "mcp"; state: MCPCatalogState }
  | { kind: "skills"; state: SkillsCatalogState };

export interface CatalogOperationError {
  code: string;
  detail: string;
  retryable: boolean;
}

export type WorkerApplyOutcome<Revisions> =
  | { worker: CatalogWorkerIdentity; outcome: "applied"; revisions: Revisions }
  | { worker: CatalogWorkerIdentity; outcome: "failed"; revisions: Revisions; error: CatalogOperationError }
  | { worker: CatalogWorkerIdentity; outcome: "retired" };

export type CatalogApplyStatus = "applied" | "partial" | "failed" | "no-active-workers";

export interface MCPApplyResult {
  kind: "mcp";
  status: CatalogApplyStatus;
  configuration: MCPConfigurationState;
  workers: WorkerApplyOutcome<MCPAppliedRevisions>[];
}

export type SkillSourceScope =
  | { kind: "workspace"; workspaceId: EntityId }
  | { kind: "agent"; agentDirectoryId: EntityId };

export interface SkillsApplyResult {
  kind: "skills";
  status: CatalogApplyStatus;
  scope: SkillSourceScope;
  sourceRevision: Counter;
  workers: WorkerApplyOutcome<SkillsAppliedRevisions>[];
}

export interface SkillInstallResult {
  scope: SkillSourceScope;
  sourceRevision: Counter;
  persistence: "committed";
  apply: SkillsApplyResult | null; // null means no service result, never applied success
}
```

MCP `command` is resolved inside the authorized private runtime. Command/args/config projections cannot expose absolute Host paths or secrets; credential fields contain only opaque authorized references resolved privately under existing enterprise/credential policy. Remote URLs must pass the existing network boundary and contain no embedded credentials. Tool schemas/descriptions and skill descriptions are sanitized before projection. These DTOs do not guess OMP factory parameters, disk layout, OAuth mechanism or live-operation implementation.

#### Authoritative fan-out and generation boundary

For workspace MCP writes/apply and workspace skill discovery, the service supervisor captures **all admitted live root workers for that authorized workspace** from its authoritative lifecycle registry, keyed by `(rootSessionId, workerGeneration)`. Skill installation/discovery in the selected agent directory captures all admitted live roots using that same private source mapping, even across workspaces. The Host's existing source/target authorization governs global installation and the full affected scope; deny an unauthorized operation before committing, rather than silently applying to a visible subset. Results expose only caller-authorized opaque worker/workspace/source identities, revisions and sanitized errors, never other session/workspace metadata, tool lists or agent-directory paths. Catalog content remains on each addressed authorized catalog read/stream.

Workspace MCP mutations serialize by workspace; Host skill source commits and service discovery serialize by their workspace/selected-agent source scope. Skill operations affecting the same root also serialize source capture and discovery/publication, so concurrent global/workspace installs cannot overwrite a newer component with an older source pair. Within that supervisor lifecycle boundary, fan-out captures target generations and holds **new root-worker readiness admission** for the affected scope until its result is finalized. Existing workers may close or be replaced during apply. An ended captured generation is `retired` and cannot publish late success. Its replacement is not substituted under the old identity: every new worker loads the latest persisted MCP config and current Host skill source pair before admission/readiness. Admission is serialized with source changes; a worker cannot announce ready on superseded revisions. Subagents use their root's applied catalog. This is ordinary in-memory supervisor/source coordination, not a durable registry, background retry system or whole-server restart.

Each live captured target applies the operation's captured current revision using real OMP operations. For skills, each target captures its own workspace/selected-agent source pair; a global source update does not replace that root's workspace sources with the initiating session's sources. Finalization rechecks target lifetime in the same lifecycle registry: ended generations are retired; every remaining required live target is `applied` or `failed`. Successful roots keep their new usable catalogs; a failed root keeps its previous valid catalog/revisions, or explicitly becomes `unavailable` if no usable runtime remains. There is no fictitious all-or-nothing rollback across roots. `workers` contains one outcome per captured generation, including retired ones, and no subagent duplicates.

Aggregate `status` is `applied` only when at least one target remains live and every required live target applied; `partial` when live applied and failed targets coexist; `failed` when all remaining live targets failed; `no-active-workers` when none remain live. The latter acknowledges only persisted configuration/source state, not a runtime apply. Success/no-active-workers returns HTTP 200 with the aggregate DTO; partial/failed returns HTTP 503 Problem Details (`MCP_APPLY_FAILED` / `SKILL_APPLY_FAILED`) with `details: {result: MCPApplyResult | SkillsApplyResult}`. No outcome is silently deferred or auto-retried; an explicit later apply operation can retry current state. If the service cannot produce outcomes after a Host source commit, report its committed `SkillInstallResult` with `apply:null` in the failure, never fabricate an empty successful fan-out.

For example, `POST .../mcp/apply` for persisted revision `"2"` can fail partially while preserving the successful sibling's publication:

```json
{
  "type":"urn:ohpichamber:problem:MCP_APPLY_FAILED",
  "title":"MCP application incomplete","status":503,
  "detail":"One active root worker could not apply the workspace configuration.",
  "code":"MCP_APPLY_FAILED","retryable":true,
  "details":{"result":{
    "kind":"mcp","status":"partial",
    "configuration":{"workspaceId":"workspace_1","persistedRevision":"2","config":{"servers":[{"serverId":"server_1","label":"Workspace tools","enabled":true,"transport":{"type":"stdio","command":"mcp-tool","args":[]}}]}},
    "workers":[
      {"worker":{"rootSessionId":"root_a","workspaceId":"workspace_1","workerGeneration":"worker_a1"},"outcome":"applied","revisions":{"runtimeStatus":"ready","appliedRevision":"2","catalogRevision":"5"}},
      {"worker":{"rootSessionId":"root_b","workspaceId":"workspace_1","workerGeneration":"worker_b1"},"outcome":"failed","revisions":{"runtimeStatus":"ready","appliedRevision":"1","catalogRevision":"4"},"error":{"code":"MCP_APPLY_FAILED","detail":"Runtime application failed.","retryable":true}}
    ]
  }}
}
```

The aggregate reports failure, root A keeps its applied revision/event, and root B's prior usable catalog remains explicitly revision 1. The outcome list does not include either root's transcript, tool payloads or other session metadata.

#### MCP operations

`GET .../mcp/catalog` returns `MCPCatalogRead`: the single workspace configuration plus the addressed root's applied state. `PUT .../mcp/config` accepts `{expectedPersistedRevision: Counter, config: MCPConfig}`. `enabled` is part of this config, avoiding a redundant toggle route. On a matching workspace revision, the service atomically persists config and advances `persistedRevision`, then fans that same revision out to every target above and returns `MCPApplyResult`. Write failure returns `MCP_CONFIG_WRITE_FAILED` with the unchanged configuration and does not attempt apply. Apply failure leaves the new persisted revision visible and each target's real applied outcome explicit; it does not revert successful siblings or claim the workspace is fully applied.

`POST .../mcp/apply` accepts `{persistedRevision: Counter}` and fans out only the current workspace revision; mismatch returns HTTP 409 `CATALOG_CONFLICT`. Neither workspace operation takes one initiating worker's catalog revision/generation as if it described siblings. Within a successful target, active servers/tools switch together, `appliedRevision` becomes the captured workspace revision and `catalogRevision` advances on active publication. Failure before a root's first valid apply has `appliedRevision:null`/`runtimeStatus:"unavailable"`, distinct from a valid empty applied config. Successful disable disconnects that server and removes its tools in each target's applied publication.

`POST .../mcp/servers/:serverId/reconnect` remains **single-root-worker**. It accepts `{persistedRevision, expectedCatalogRevision, workerGeneration}` plus `Idempotency-Key`, rejects stale generation first, and requires this root to have applied the current configuration with that enabled server. Otherwise return explicit conflict/unavailability rather than reconnecting under an unapplied config. It serializes with relevant workspace apply, does not advance persisted config, and returns `MCPCatalogRead` for the addressed root. Successful refresh advances that root's active catalog revision; failed reconnect reports `MCP_RECONNECT_FAILED` with its retained read state and emits no success for that root. Existing valid runtime remains until replacement is usable; actual loss is explicitly unavailable, never stale tools advertised as executable. Reconnect does not claim to refresh another root.

`GET .../mcp/servers/:serverId/oauth` and `POST .../mcp/servers/:serverId/oauth` are **single-root-worker** operations for remote (`http` or `sse`) servers in the current persisted workspace configuration; subagent session IDs resolve to their root worker. `GET` returns `MCPOAuthResult` (`status: "pending"` with `authenticated` and `pendingFlow: {flowId, authorizationUrl, launchUrl?, instructions?}`, `status: "authenticated"` with `authenticated: true`, or `status: "unauthenticated"` with `authenticated: false`). `POST` accepts `MCPOAuthRequest` with `{persistedRevision: Counter, workerGeneration: EntityId}` and discriminated `action`: `start` (optional `oauth: MCPOAuthConfigInput`, where `authorizationUrl` and `tokenUrl` are supplied together or discovered together, and `clientSecret` stays input-only off `MCPOAuthPublicConfiguration`), `complete` (`flowId` and optional `callbackInput`, required for non-local redirects), `cancel` (`flowId`), or `disconnect`. Stale `workerGeneration` returns HTTP 409 `WORKER_GENERATION_CONFLICT`; a mismatched `persistedRevision` or a second concurrent `start` on the same server returns HTTP 409 `CATALOG_CONFLICT`; an unknown or settled `flowId` on `complete`/`cancel` returns HTTP 404 `MCP_OAUTH_NOT_FOUND`; cancelled flows return HTTP 409 `MCP_OAUTH_CANCELLED`; discovery, callback or persistence failures return HTTP 422 or 502 `MCP_OAUTH_FAILED`. `disconnect` aborts any pending flow, removes the stored OAuth credential from the worker's `AuthStorage`, disconnects the active server transport if applied so a revoked bearer cannot remain in use, and returns the updated `MCPOAuthResult`.

#### Skill operations

`GET .../skills/catalog` returns the addressed root's `SkillsCatalogState`. `POST .../skills/install` accepts `{sourceId: EntityId, skillId: EntityId, scope: "workspace" | "agent", expectedSourceRevision: Counter}` plus `Idempotency-Key`. Host-authorized IDs identify the trusted catalog/source, not arbitrary URLs or client filesystem paths. Host commits installation atomically and advances only the selected source's revision, then requests workspace or selected-agent-directory fan-out as above. The resulting `SkillInstallResult` always identifies that source commit separately from per-root apply results. Install failure preserves source files/revision and returns `SKILL_INSTALL_FAILED`; partial/failed discovery returns `SKILL_APPLY_FAILED` with `details: {result: SkillInstallResult}` retaining the committed source and all outcomes. Service absence after commit returns the same committed result with `apply:null` and explicit unavailability. No source commit masquerades as applied runtime success.

`POST .../skills/apply` accepts `{scope: "workspace" | "agent", sourceRevision: Counter}`. The authorized path session determines that source identity; service verifies the current Host source revision, captures affected roots and each root's own current source pair, then returns `SkillsApplyResult`. Each successful root atomically publishes its filtered skill list, sets `appliedSources` to its captured pair and advances its catalog revision. A failed root preserves its previous valid applied pair/catalog; first-apply failure has `appliedSources:null` and is unavailable, not an empty success. Other successful roots remain applied.

`POST .../skills/expand` is not a fan-out or source mutation. It accepts `{skillId, catalogRevision: Counter, workerGeneration, arguments: string}`, checks the **addressed root's** current generation/revision/readiness and requires the skill in that active catalog. Success returns `{worker: CatalogWorkerIdentity, skillId, catalogRevision, message: string}` from the OMP builder; unavailable skill/runtime or revision conflict is explicit, never empty expansion. It neither reads another root's active revision nor submits a prompt/bypasses the Host delivery owner. Composer submits the result through its normal canonical command.

#### Per-worker publication and partial failure

`catalog.updated` payload remains `{catalog: CatalogUpdate}` in the existing session/epoch/sequence envelope; its `state.worker` identifies the publishing root/generation, including when projected to its subagent streams. Only that root's successful active apply/reconnect/discovery publishes its usable catalog/revisions. Failed application emits **no success event for that target**; a retired generation cannot publish after its lifetime ends. An event legitimately published before retirement is not retroactively erased. Successful siblings may publish their own `catalog.updated` even when the aggregate returns partial failure. Persistence-only commits publish no active success; applied revisions never advance before usable publication. Reads show `runtimeStatus:"ready"` or `"unavailable"`; retained tools/skills from an unavailable root are not executable. Compare active counters only within the same root/generation; source/config counters belong to their persisted owners. This is intentional service fan-out required by multi-worker live refresh, not an observed SDK signature or waiver of remaining M0 evidence. Task 12 must implement and prove it.

---

## Representative JSON payloads

### 1. Capabilities Response

`GET /api/agent/v1/capabilities`
Status: 200 OK

```json
{
  "version": "1.0.0",
  "engine": "omp",
  "capabilities": {
    "streaming": true,
    "casApprovals": true,
    "midTurnSteering": true,
    "followUpQueue": true,
    "subagents": true,
    "sessionBranching": true,
    "reasoningParts": true,
    "documentExtraction": true
  },
  "limits": {
    "maxAttachmentSizeBytes": 20971520,
    "maxQueueDepth": 50,
    "streamCatchupBufferSize": 1000
  },
  "experimental": {}
}
```

### 2. Run Creation Request and Response

`POST /api/agent/v1/sessions/sess_alpha/runs`
Headers:
- `Idempotency-Key: c9a3e264-9721-4f9e-a81d-8f2e604f3219`
- `Content-Type: application/json`

Request body:
```json
{
  "input": {
    "text": "Analyze why the authentication middleware fails on expired tokens.",
    "attachments": [
      {
        "attachmentId": "att_8812",
        "name": "auth-error.txt",
        "mediaType": "text/plain",
        "size": 128,
        "uri": "attachment://att_8812"
      }
    ],
    "context": []
  },
  "options": {
    "providerId": "anthropic",
    "modelId": "claude-3-7-sonnet",
    "agentId": null,
    "variant": null,
    "reasoningEffort": "medium"
  }
}
```

Response:
Status: 202 Accepted
```json
{
  "runId": "run_9012",
  "sessionId": "sess_alpha",
  "status": "pending",
  "createdAt": 1774201000100
}
```

### 3. Server-Sent Events Sequence

`GET /api/agent/v1/sessions/sess_alpha/events`
Headers:
- `Last-Event-ID: ep_1a:10`

Stream output:
```text
id: ep_1a:11
event: session.status
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"11","timestamp":1774201000200,"runtimeStatus":"running","activeRunId":"run_9012"}

id: ep_1a:12
event: turn.started
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"12","timestamp":1774201000250,"turnId":"turn_301","runId":"run_9012","userMessageId":"msg_u1"}

id: ep_1a:13
event: message.created
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"13","timestamp":1774201000300,"messageId":"msg_a1","turnId":"turn_301","role":"assistant"}

id: ep_1a:14
event: part.started
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"14","timestamp":1774201000350,"messageId":"msg_a1","part":{"type":"text","partId":"prt_t1","content":""}}

id: ep_1a:15
event: part.delta
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"15","timestamp":1774201000400,"partId":"prt_t1","delta":"Checking the token expiration logic in src/auth.ts."}

id: ep_1a:16
event: tool.started
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"16","timestamp":1774201001000,"toolCallId":"tc_read1","toolName":"read","input":{"path":"src/auth.ts"}}

id: ep_1a:17
event: tool.completed
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"17","timestamp":1774201001200,"toolCallId":"tc_read1","status":"completed","isError":false,"output":"export function verifyToken..."}

id: ep_1a:18
event: part.completed
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"18","timestamp":1774201001800,"part":{"type":"text","partId":"prt_t1","content":"Checking the token expiration logic in src/auth.ts."}}

id: ep_1a:19
event: turn.completed
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"19","timestamp":1774201001900,"turnId":"turn_301","runId":"run_9012"}

id: ep_1a:20
event: run.completed
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"20","timestamp":1774201002000,"runId":"run_9012","finishedAt":1774201002000}
```

### 4. Approval Request and CAS Resolution

Event from a separate active run, not the completed run above:
```text
id: ep_1a:23
event: approval.requested
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"23","timestamp":1774201002100,"approval":{"approvalId":"appr_55","sessionId":"sess_alpha","turnId":"turn_302","toolCallId":"tc_sh1","toolName":"bash","actionType":"bash_command","commandSummary":"npm test auth","details":{"command":"npm test auth"},"policyTarget":{"toolName":"bash","pattern":"npm test auth"},"version":"1","epoch":"ep_1a","workerGeneration":"worker_g1","status":"pending","requestedAt":1774201002100}}
```

Resolution request:
`POST /api/agent/v1/sessions/sess_alpha/approvals/appr_55/respond`
Request body:
```json
{
  "decision": "always-allow",
  "policyScope": "session",
  "version": "1",
  "epoch": "ep_1a",
  "workerGeneration": "worker_g1"
}
```

Success response:
Status: 200 OK
```json
{
  "approvalId":"appr_55","sessionId":"sess_alpha","turnId":"turn_302","toolCallId":"tc_sh1",
  "toolName":"bash","actionType":"bash_command","commandSummary":"npm test auth","details":{"command":"npm test auth"},
  "policyTarget":{"toolName":"bash","pattern":"npm test auth"},
  "status":"approved","version":"2","epoch":"ep_1a","workerGeneration":"worker_g1",
  "requestedAt":1774201002100,"resolvedAt":1774201003500,
  "resolution":{"decision":"always-allow","policy":{"policyId":"policy_1","scope":"session","revision":"3","persistence":"committed"}}
}
```

Conflict response (if already resolved):
Status: 409 Conflict
Content-Type: application/problem+json
```json
{
  "type": "urn:ohpichamber:problem:APPROVAL_CONFLICT",
  "title": "Approval conflict",
  "status": 409,
  "detail": "Approval request was already resolved.",
  "code": "APPROVAL_CONFLICT",
  "retryable": false,
  "details": {
    "expectedVersion": "1",
    "actualVersion": "2",
    "currentRecord": {
      "approvalId": "appr_55",
      "sessionId": "sess_alpha",
      "turnId": "turn_302",
      "toolCallId": "tc_sh1",
      "toolName": "bash",
      "actionType": "bash_command",
      "commandSummary": "npm test auth",
      "details": {"command": "npm test auth"},
      "version": "2",
      "epoch": "ep_1a",
      "workerGeneration": "worker_g1",
      "status": "approved",
      "requestedAt": 1774201002100,
      "resolvedAt": 1774201003500,
      "policyTarget": {"toolName":"bash","pattern":"npm test auth"},
      "resolution": {"decision":"always-allow","policy":{"policyId":"policy_1","scope":"session","revision":"3","persistence":"committed"}}
    }
  }
}
```

Terminal approval event for the winning result uses the same complete record as the response:

```text
id: ep_1a:24
event: approval.resolved
data: {"sessionId":"sess_alpha","epoch":"ep_1a","sequence":"24","timestamp":1774201003500,"approval":{"approvalId":"appr_55","sessionId":"sess_alpha","turnId":"turn_302","toolCallId":"tc_sh1","toolName":"bash","actionType":"bash_command","commandSummary":"npm test auth","details":{"command":"npm test auth"},"policyTarget":{"toolName":"bash","pattern":"npm test auth"},"status":"approved","version":"2","epoch":"ep_1a","workerGeneration":"worker_g1","requestedAt":1774201002100,"resolvedAt":1774201003500,"resolution":{"decision":"always-allow","policy":{"policyId":"policy_1","scope":"session","revision":"3","persistence":"committed"}}}}
```

Question cancellation uses the same response route and identity/version checks:

```json
{"action":"cancel","version":"1","epoch":"ep_1a","workerGeneration":"worker_g1"}
```

Its successful response and `question.resolved` payload's `question` are the same complete terminal record:

```json
{"questionId":"question_1","sessionId":"sess_alpha","turnId":"turn_303","prompt":"Continue?","version":"2","epoch":"ep_1a","workerGeneration":"worker_g1","status":"cancelled","requestedAt":1774201004000,"resolvedAt":1774201004500}
```

### 5. Structured Error: Unsupported Capability

Request to an unsupported experimental endpoint:
`POST /api/agent/v1/sessions/sess_alpha/fork-replay`

Response:
Status: 501 Not Implemented
Content-Type: application/problem+json
```json
{
  "type": "urn:ohpichamber:problem:UNSUPPORTED_CAPABILITY",
  "title": "Unsupported capability",
  "status": 501,
  "detail": "Fork replay is not supported by the active OMP runtime.",
  "code": "UNSUPPORTED_CAPABILITY",
  "retryable": false,
  "details": {
    "requestedFeature": "fork-replay",
    "engine": "omp"
  }
}
```
