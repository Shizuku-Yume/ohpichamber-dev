# Sync architecture, event handling & store update rules

## Scope

Attachment intake can hold a file for saving at Send (`saveOnSend`) or keep a
copy alongside its media (`saveCopyOnSend`). `held-attachments.ts` prepares those
files through the Host-owned `saveWorkspaceAttachments`, not agent SDK temp-file
APIs. Input-store preparation updates only the captured draft's unchanged files;
native prompt and queue admission also prepare held files before uploading their
Canonical attachment identities. Failed saves block admission, and runtime
changes cannot commit an old result into a new Host. Path-note sizes describe
the actual note bytes uploaded to the Canonical API.

New-draft admission reports the acknowledged session and resolved Host directory
through `onSessionCreated` before applying the mode or sending the first prompt.
Composer reference transfer and failed-send text restoration use that captured
receipt, never a later live session selection. Runtime changes suppress stale
metadata writes and notifications.

Pending questions/forms remain in each directory child's `form[sessionId]`
bucket. Canonical snapshots and CAS-versioned question events replace only that
session's requests; subscribers observe only their session buckets. Historical
tool output is not another pending-question authority. Leads orchestration and
its draft flags remain deferred.

Canonical sessions do not carry the inherited operator-child or workflow-agent
tags. The operator-only Take Over and mark-done interception are not supported:
ordinary child-session lineage does not imply either role. Pending tool
approvals keep their existing CAS-scoped canonical response flow; taking over a
legacy permission ruleset must never become blanket approval.

This document covers the client-side session and data synchronization architecture in `packages/ui/src/sync` under the Task 13 native canonical contract, and the rules for updating stores safely.

There are two distinct session data scopes in the UI:

1. **Directory-scoped sync stores**
   - Owned by the sync layer child stores created in `sync-stores.ts` and managed by `ChildStoreManager`
   - Source for per-directory live session state, messages with inline parts, approval requests, question requests, snapshots, queue state, catalog state, shell jobs, and runtime statuses
   - Backed by single-flight SSE event streaming per session (`subscribeSessionEvents`) and directory-scoped workspace discovery (`client.listSessions(workspaceId)`)
   - Read via narrow hooks including `useSessions()`, `useSessionMessages()`, `useSessionStatus()`, `useSessionPermissions()`, `useSessionForms()`, `useSessionPartsForMessages()`, `useDirectoryStore()`, and `useDirectorySync()`

`sync-runtime-context.ts` owns the shared canonical contexts used by the provider
and extracted hooks. Canonical message selectors and record snapshots live in
`session-message-hooks.ts` and `session-message-records.ts`; `sync-context.tsx`
re-exports their public API. Pre-mount reads use the same store and loader the
provider adopts, with a 30-second expiry if no provider mounts. They do not
create an additional transcript authority.

2. **Global sessions cache**
   - Owned by `packages/ui/src/stores/useGlobalSessionsStore.ts` (Slice C)
   - Shared cache for global active and archived session lists, root and parent/child indexing, and Session Retention cleanup
   - Holds:
     - global active sessions
     - global archived sessions
     - active and archived entities indexed by ID
     - active root, parent/child, and directory indexes

### Why both exist

The directory-scoped sync stores do not provide a complete global view:

- They are created on demand per directory
- They contain state for directories initialized in the current app session
- They are optimized for live per-directory domain data and high-frequency event streaming
- They do not maintain the global active and archived session view needed by the sidebar and retention settings

Use the directory sync stores for live session, message, approval, and question state. Use the global sessions store for cold or global session coverage (archived pages and unopened directories). Use aggregated child-store sessions (`useAllLiveSessions()`) and the global session status index (`useGlobalSessionStatus()`) for live truth across initialized directories.

`session-live-work.ts` derives Guest tool intent and context fill only from reducer-admitted canonical events and adopted snapshots. Snapshot tools must belong to the current active run, never historical running parts. Terminal events clear live tools; compaction invalidates an old context reading. The bounded cache resets with the runtime, and a Host read started before that reset cannot repopulate it.

## Snapshot startup and cold-send recovery

Snapshot and workspace reads use the bounded `STARTUP_RETRY` policy; non-retryable failures stop immediately, exhausted failures preserve prior state and report a loader error, and retired loads stop before another request. Every adopted snapshot reaches `onSnapshot`, which attaches its event stream only while the session holds a stream (see stream budget below).

Discovery also recovers materialized root sessions when a newer head or epoch reports different run control than the cached snapshot. It requests a canonical snapshot through the same loader rather than replacing live activity with a list row. Older discovery cannot displace newer live state, and a failed recovery preserves the cached transcript and activity. Stop requests snapshot recovery when its authoritative read finds no active run, so an already-idle server can clear stale client controls without relaunching.

Cold snapshots remain worker-free and do not subscribe to worker-owned events. A normal send whose starting snapshot was cold or absent requests a recovery snapshot only after native acceptance. SyncProvider queues this recovery behind any in-flight load and requires an available worker snapshot within the same startup budget before attachment. Snapshot errors never replay or reject an accepted send. The pipeline attaches from the returned cursor so already-completed replies come from the snapshot and later deltas come from the stream. Manual history retry followed by send takes the same path.

Web/PWA, Electron, hosted mobile and Capacitor share this behavior through the Canonical Client; Guest SDK and transport/auth contracts are unchanged.

The canonical pipeline owns gap recovery and pending-request snapshots. There
is no parallel SDK event dispatcher, SDK active-status poller or interrupted-tool
repair layer. Session updates preserve unrelated message/request references;
Host metadata uses its own monotonic revisions. Cross-directory status seeding
reads canonical sessions and never overwrites observed live status.

Host notifications arrive on the separate control stream. The Host envelope is
validated before presentation, including desktop-delivery flags. Shared-answer
and focused plugin toasts retain their existing UI components; device delivery
uses `RuntimeAPIs.notifications`. Local desktop delivery is not duplicated, and
a remote Host's desktop delivery does not suppress notifications on this client.

## Host operational metadata authority

Read/modify/write metadata actions include the confirmed Host revision. A
`METADATA_CONFLICT` re-reads and recomputes the merge patch, up to three attempts;
read failures, other errors and runtime switches reject without another write.
This preserves concurrent context-pin edits without OpenCode metadata routes.

The Host owns session operational metadata (pins, color, icon, notes), workspace associations, archive state, and folder membership; OMP owns session titles directly in session storage. Execution session records and persisted UI caches are not metadata fallbacks. Metadata responses and change events carry decimal-string revisions; the metadata patch route (`PATCH /api/agent/v1/sessions/:sessionId/metadata`) requires a `{ changes: { ... } }` wrapper and returns `SessionMetadataState` (`{ sessionId, revision, metadata }`).

Host metadata revisions stay attached to projected sessions, HTTP write responses, and committed events. Revisions are non-negative integer decimal strings compared with uint64 numeric ordering via `compareCounters(left, right)` (length check first, then lexical). The session merger `mergeHostSession` in `event-reducer.ts` enforces monotonic revision progression:

- Rejects incoming runtime fields if `incoming.headSequence` is older than `previous.headSequence` within the same epoch
- Rejects incoming metadata if `incoming.metadataRevision` is older than `previous.metadataRevision`
- Rejects incoming archive state if `incoming.archiveRevision` is older than `previous.archiveRevision`

Discovery failures are scoped. `client.listSessions(workspaceId)` returns `{ items: Session[], errors: Record<string, string> }`. When an error is keyed by a session, workspace or project, `isSessionDiscoveryFailed` in `globalSessions.ts` preserves the cached `Session` records in that scope instead of treating their absence as an authoritative empty result. Sibling sessions outside the failed scope reconcile normally. Partial discovery failures preserve prior valid cached entities and do not produce an authoritative empty snapshot.

Web, PWA, and Electron use the retained Host owner. Hosted mobile and Capacitor use the active Host through shared runtime transport. VS Code is retired and receives no new support.

### Workbench metadata: pins, unread marks and turn length

Pins, unread marks and the last turn's length are Host workbench state in the same operational record, not device preferences: they outlive a page, so every client of one Host must see the same sidebar row. The contract (`packages/agent-contract/src/metadata.ts`) types them as `openchamber.pinned = { at }`, `openchamber.workbench = { lastIdleAt?, viewedAt?, lastTurnOutcome? }` and `openchamber.turn = { endedAt, durationMs }`.

Authority and invariants:

- **Pins.** `pinned.at` is when the user pinned. `useSessionPinnedStore` derives its ids from `openchamber.pinned` on the global store's active sessions and adds a pending overlay while a write is in flight, so a click shows before the round trip and the Host's revision is the outcome. `localStorage` (`oc.sessions.pinned.v2`) holds only pins left by the retired device-local store; `migrateLegacyPins` moves them into metadata once the list is complete, and a failed write keeps the local pin for the next complete load. `toggleSessionPin` serializes clicks per session in `pinQueues` so the last click wins on the server too.
- **Unread marks.** `workbench.lastIdleAt` is when a turn last ended and `workbench.viewedAt` is the newest ending a viewer acknowledged; a session is unread while `lastIdleAt` is newer than `viewedAt` or no view is recorded. `isSessionUnread` reports top-level, unarchived sessions only — a subtask reports to its parent. A view advances `viewedAt` optimistically in `markSessionUnreadSeen` and is confirmed by the patched metadata; a failed write restores the earlier watermark unless something newer replaced it.
- **Turn length.** The Host measures each run from canonical `run.started` to `run.completed`/`run.failed`/`run.cancelled` and writes `endedAt`, `durationMs = max(0, finishedAt - startedAt)` and the matching `lastIdleAt`/`lastTurnOutcome` in one patch. A run is matched to its own start by `runId`, and a subsession's runs are skipped because they roll up into the root. `getRecordedTurnDurationMs` shows the length only when the record's `endedAt` is within one second of the idle mark, so a record left by an older turn does not render.
- **Subtask turns.** Because the Host settles a subsession's runs on the root, a child record never carries its own idle mark. A subtask that finished is therefore known from the client's notification index, which is why the collapsed-activity selector and the tray count union metadata unread with `useNotificationStore` before honouring `notifyOnSubtasks`. That index is client state, never the authority for a top-level row.

Prompt, goal and review metadata operations retain the runtime key and switch
revision captured at submission through their asynchronous Host reads and
dispatch. A switch away and back invalidates the old operation as well as a
switch to a different Host; an accepted operation is not replayed automatically.
Session knowledge reads also recheck that owner after waiting for an earlier
delivery report and before issuing the next Host request; ordinary read failures
may omit knowledge, but stale ownership rejects the send.

## Canonical workspace resolution and directory bootstrap

Directory bootstrap operates through `CanonicalClient` consuming `@openchamber/agent-contract` DTOs.

`bootstrapGlobal` in `bootstrap.ts` resolves top-level projects and workspaces:
- Executes `client.listProjects()` and `client.listWorkspaces()` concurrently via `Promise.allSettled`
- Scoped discovery errors (`Record<string, string>`) are recorded in `discoveryErrors`
- Cached projects and workspaces whose IDs match returned errors are retained
- Partial discovery failures do not erase valid siblings

`bootstrapDirectory` in `bootstrap.ts` resolves and initializes a specific directory:
1. Resolves the caller's filesystem directory via `client.resolveWorkspace(directory)` (`POST /api/agent/v1/workspaces/resolve`). The public `Workspace` contains identifiers, a name, and a relative display path, not a Host filesystem path. Only the admitted caller directory binds the returned workspace ID for UI routing.
2. Registers the workspace-to-directory mapping with `registerWorkspaceDirectory(workspace.workspaceId, directory)`.
3. Runs two concurrent lanes:
   - `sessions`: calls `client.listSessions(workspace.workspaceId)`. Reconciles native records with `mergeHostSession`, preserving mutations and deletion tombstones newer than the request's captured `sessionRevision`. Active directory rows stay separate from the global active/archived cache. Live sessions without snapshots are materialized, newly discovered children recover already materialized parent task records, and committed rows seed scoped runtime statuses. Failed discovery preserves the previous scope instead of producing an authoritative empty result.
   - `environment`: calls `client.getModels(workspace.workspaceId)`, `client.getProviders(workspace.workspaceId)`, `client.getAgents(workspace.workspaceId)`, and executes `refreshBackgroundShells(directory, () => client.getShellSnapshot({ kind: "workspace", workspaceId: workspace.workspaceId }))` to retrieve an independent native workspace `ShellSnapshot`.

`ChildStoreManager` schedules directory bootstraps with a concurrency cap of 2:
- Priority order: `selected` > `active-project` > `expanded` > `visible` > `background`
- Demand is deduplicated by normalized directory path
- Bootstrap completion returns separate `sessions` and `environment` status results

Workspace resolution and session discovery retain bounded startup retries. Canonical `ProblemDetails.retryable` controls canonical failures; a stale runtime or directory owner stops subsequent attempts. Environment and session initialization remain separate lanes, and failed environment initialization is recorded as a failure rather than marked complete. Each environment read (models, providers, agents, background shells) runs inside `STARTUP_RETRY` (8 attempts, 1 s to 8 s backoff, about 39 s of waits) with an independent stale-scope guard, so one slow sibling does not cancel the others. After the list lane completes, a failed environment initialization is requeued once when its bootstrap state is complete or absent and no matching queue/running entry exists; a successful retry is idempotent and does not duplicate session reads. Requeueing follows `isRetryableBootstrapError`: network/transient messages, HTTP 408/429/5xx, canonical `retryable: true`, and unclassified failures get one recovery attempt per connection signal, while other 4xx and canonical `retryable: false` failures stay failed until their input changes.

## Parked admission on cold start

A routed selection (`?session=<id>`) can name a session whose directory is not yet admitted: the route applies before projects and global discovery finish. `subscribeSessionAdmission` parks that selection rather than clearing it for good, and cold start is the case it exists for:

- A selection whose directory is unadmitted is parked, and stays parked while global discovery has not indexed the session or has not resolved its directory. A project list arriving first must not discard the parked entry.
- The parked session is dropped only when discovery completed (`hasLoaded`) and the record is genuinely gone, or when any later navigation supersedes it. A session in a permanently unadmitted (removed) project therefore stays parked invisibly; nothing is selected either way.
- The parked session returns once its directory is admitted, and `adoptAuthoritativeSessionDirectory` promotes the guessed selection after the discovery snapshot commits so a route selection is not left guessing.
- Per-chat sessions live in their own workspace with a Host-relative `displayPath`; global load binds those directories from `listWorkspaces` (resolved against the project root) so the snapshot fetch addresses the workspace that owns the session.

## Ownership map

| Layer / Store | Owns | Scope |
|---|---|---|
| `ChildStoreManager` and child directory stores | Priority-scheduled directory bootstrap plus `session`, `message`, `permission`, `form`, `snapshot`, `queue`, `catalog`, `shell`, `session_status` | One runtime and one store per directory |
| `SessionMessageLoader` | Single-flight message loading, history pagination (`HistoryPage`), snapshot recovery (`SessionSnapshot`), prefetch, optimistic reconciliation, cache retention | One runtime, directory, and session ID |
| `event-pipeline.ts` | Single-flight per-session SSE event streams (`subscribeSessionEvents`), contiguous sequence gating, exponential backoff recovery, stream invalidation handling | Active session streams across all directories |
| `event-reducer.ts` | Pure canonical event reducer applying uint64 monotonic sequence checking (`compareCounters`), updating inline `message.parts`, approvals, questions, queue, catalog, shell, cleanse, advisor, and host metadata | Directory store state transitions |
| `global-session-status.ts` | Incremental non-idle session status index reconciled from canonical events and authoritative snapshots (`SessionRuntimeStatus`), plus active-ID collection | All known directories in the active runtime |
| `session-ordering.ts` | Ephemeral lifecycle rank used by session lists, comparing roots to roots and children to siblings sharing `parentSessionId` | All known sessions in the active runtime |
| `session-activity-timing.ts` | Run/turn-aware elapsed time derived from canonical events (`run.started`, `turn.started`, `turn.completed`, `run.completed`) and live activity | All known sessions in the active runtime |
| `global-blocking-requests.ts` | Cross-directory index of pending approvals and questions; `replaceGlobalBlockingRequestSnapshot` replaces pending sets on snapshot recovery | All initialized directories in the active runtime |
| `scoped-blocking-requests.ts` | Aggregates pending approvals and questions for a session and its subagent descendants | One session hierarchy |
| `background-shells.ts` | Tracks background shell executions (`ShellJob`, `RunningShell`, `ShellSnapshot`) via `shell.updated` and workspace `ShellSnapshot` bootstrap | All known sessions in the active runtime |
| `useCleanseStore.ts` | Live Cleanse diagnostic repair progress (`discovering`, `repairing`, `verifying`, `completed`, `failed`, `cancelled`) with same-epoch sequence checking and opaque epoch scoping | All known sessions in the active runtime |
| `useAdvisorStore.ts` | Live Advisor watchdog notes with same-epoch sequence checking, opaque epoch scoping, and note deduplication | All known sessions in the active runtime |
| `session-ui-store.ts` (Slice C) | Session selection, draft lifecycle, abort prompts, worktree metadata, action entrypoints | App UI state |
| `useGlobalSessionsStore.ts` (Slice C) | Global active/archived entities plus root, parent/child, and directory indexes | All opened project/worktree session lists |
| `session-warming-sync.ts` | Hydrates `useSessionWarmingStore` for the active root session (and on Host reconnect) and prunes deleted sessions after authoritative `useGlobalSessionsStore` snapshots | Active runtime via `SyncRuntimeEffects` |
| `viewport-store.ts` | Scroll anchors, session memory, loading indicators | App UI state |
| `attachment-files.ts` | Attachment picker allowlists, MIME/content validation, structured-text sanitization, HEIC conversion | Local chat attachments |
| `document-attachments.ts` | Bounded Office/OpenDocument extraction, document text serialization, embedded-image extraction, positional citations | Office chat attachments |
| `input-store.ts` | Draft input state, attached files, synthetic parts, pending guest attach | Attachments and composer input state |
| `selection-store.ts` | Model/agent/variant selections | App UI state |
| `voice-store.ts` | Voice connection and activity state | App UI state |

Task 13 establishes the native canonical sync core and freezes shared contracts. Downstream leaf consumers (chat timeline, composer, sidebar tree items, settings) are migrated in Tasks 14, 15, and 16. This documentation update describes the shared core contracts without claiming downstream leaf migration is finished.

## Native authored file resources

Commands, prompt templates, and authored skill files use the namespaced `CanonicalClient.fileResources` contract. Directory-scoped stores retain authoritative catalogs and decimal revisions; a failed read does not clear the previous catalog, and runtime switches invalidate pending publication. Native resource IDs, source, grouping, argument hints, Markdown bodies, `agentId`, and `modelSelection` remain canonical rather than OpenCode config projections. Inherited resources are read-only.

The composer and goal objective use `api/fileResourceExpansion.ts` to submit a leading `/name` input to the shared worker pipeline.
The renderer forwards raw text, never substitutes `$ARGUMENTS` or positional placeholders, and never executes the native SDK.
The worker runs native slash-command expansion followed by native prompt-template expansion exactly once, classifying the result as command, template or unmatched text—even when matched output equals the input.
Top-level native command bindings take precedence over template bindings; selected `agentId`/`modelSelection` override the captured prompt selection. Goal preparation reuses that result for delivery.
Queue admission captures expanded text, skills and bindings. Queued provenance prevents a second pass when captured output itself starts with a slash.
Context comments support leading native `/template` invocation; legacy `#snippet` syntax and aliases are not interpreted. Expansion failures remain errors instead of sending a silently unexpanded invocation.

Native session skills still expand through the addressed root's active skills catalog revision and worker generation; workspace authoring IDs are not substitutes for active-session skill IDs. Settings authoring commits remain Host-owned, with persisted source revision distinct from worker apply results. Skill links open the canonical Settings resource rather than guessing Host filesystem paths.

Runtime parity: Web/PWA and Electron use the authenticated Host Canonical gateway. Hosted mobile and Capacitor use the same configured runtime gateway and schemas. All four surfaces keep native parsing and expansion in the Bun worker; none imports SDK code or selects a localhost transport.


## Event pipeline and sequence gating

Ephemeral BTW and subagent observations consume the same per-session sequence as durable events. The directory reducer advances the live head before their dedicated stores apply them; duplicates and epoch/sequence gaps cannot mutate those stores. Omitting that advance causes false gap recovery that can lose a subagent's terminal frame.

The event pipeline (`event-pipeline.ts`) connects to the Host's canonical SSE endpoint via `canonicalClient.subscribeSessionEvents(sessionId, cursor, onEvent, onInvalidated, onError)`.

The Host SSE stream emits native `CanonicalEvent` variants directly. There is no intermediate wire-event translation layer. `CanonicalEvent` is a discriminated union of 24 variants:

- Sessions: `session.updated`, `session.deleted`, `session.status`, `session.compacted`
- Runs: `run.started`, `run.completed`, `run.failed`, `run.cancelled`
- Turns: `turn.started`, `turn.completed`
- Messages: `message.created`, `message.updated`
- Parts: `part.started`, `part.delta`, `part.completed`
- User text parts can carry typed `sessionMentions`; started/completed events and history/snapshot recovery retain those identities for the shared transcript renderers.
- Tools: `tool.started`, `tool.completed`
- Approvals: `approval.requested`, `approval.resolved`
- Questions: `question.requested`, `question.resolved`
- Catalogs, Queue & Shells: `queue.updated`, `catalog.updated`, `shell.updated`

Every data event carries the envelope fields:
```typescript
export interface DataEventEnvelope {
  sessionId: EntityId;
  epoch: Epoch;
  sequence: PositiveCounter;
  timestamp: Timestamp;
}
```

### Sequence gating invariants

The directory event reducer (`applyDirectoryEvent` in `event-reducer.ts`) enforces strict sequence gating and ownership verification against `SessionSnapshot`:

1. **Epoch match**: If `event.epoch !== snapshot.session.epoch`, the event belongs to a different execution epoch. The reducer returns `{ kind: "resnapshot", state }`.
2. **Duplicate check**: If `compareCounters(event.sequence, snapshot.session.headSequence) <= 0`, the event was already applied. The reducer returns `{ kind: "duplicate", state }`.
3. **Contiguity check**: An event is applied only if its sequence is strictly contiguous:
   ```typescript
   if (BigInt(event.sequence) !== BigInt(snapshot.session.headSequence) + 1n) {
     return { kind: "resnapshot", state };
   }
   ```
   Events are never applied across a sequence gap. Any gap triggers a snapshot recovery.
4. **Ownership mismatch and structural recovery**: If an event carries nested entity identifiers or scopes that mismatch the addressed session or workspace, the reducer flags a recovery condition and returns `{ kind: "resnapshot", state }`. This covers:
   - `approval.requested` / `approval.resolved` where `approval.sessionId !== id` or `approval.epoch !== event.epoch`
   - `question.requested` / `question.resolved` where `question.sessionId !== id` or `question.epoch !== event.epoch`
   - `queue.updated` where `queue.sessionId !== id`
   - `catalog.updated` where `worker.workspaceId !== snapshot.session.workspaceId` or `worker.rootSessionId !== snapshot.session.rootSessionId`
   - `shell.updated` where `job.sessionId !== id`, `job.epoch !== event.epoch`, or `job.workspaceId !== snapshot.session.workspaceId`
   - `part.completed` where `part.partId` has no recorded owning `messageId`
   - `part.delta` targeting a non-text and non-reasoning part
   - `tool.started` / `tool.completed` where `toolCallId` has no matching tool call in the session's messages
   - `session.compacted` events
5. **Stream invalidation**: `stream.invalidated` has no sequence or cursor. Replay exhaustion, epoch changes, and delivery overflow trigger authoritative snapshot recovery. Unexpected connection closure is reported by the Canonical Client's transport error callback; intentional teardown does not schedule recovery.
6. **Opaque cursor ownership**: Only the Host supplies a transport cursor. The pipeline forwards `SessionSnapshot.cursor` unchanged; it never parses, reconstructs, or substitutes a pagination cursor. Local event reduction advances `headSequence` while retaining the last authoritative snapshot cursor as the recovery baseline.
7. **Flush batching**: Rapid event streams are throttled to a 33 ms frame (`FLUSH_FRAME_MS`). The first event after an idle period flushes immediately. Accumulated events apply to the directory store in a single transaction, cloning only the touched state slices.

### Stream lifecycle and disconnection rules

- **Stream budget**: Browsers share six HTTP/1.1 connections per origin across all tabs, and each session stream holds one, so too many streams stall every other request (including approval responses). A session holds a stream only while it is viewed (`setActiveSession` or an external viewer), it is the off-screen live session chosen for this tab's slot, a send requested it within the last 15 s, or its BTW answer is still streaming (BTW deltas are transient and cannot be replayed). An idle session is parked: switching away from an idle chat detaches its stream at once, while an off-screen stream that is still wanted or whose run just ended is rechecked every 15 s and detached when no longer wanted, so post-run events such as suggestions still arrive and expired send requests release, and a parked session that is viewed again attaches from its snapshot head (`epoch:headSequence`). Off-screen live sessions (`running`, `awaiting_approval`, `awaiting_input`) share one origin-wide slot: the tab holding the Web Lock `openchamber:offscreen-session-stream:<runtimeKey>` streams one of them, preferring a session waiting on the user and keeping the attached one on ties; without Web Locks each tab keeps its own slot. Other off-screen live sessions, and parked sessions that start running elsewhere, update through session discovery's recovery snapshot (every 15 s).
- **Evicted stream detachment**: When a session history is evicted by `SessionCacheRetention`, the provider detaches its active SSE stream (`pipeline.detach(target)`) rather than triggering recovery or reconnecting.
- **Snapshot setup reattachment**: The provider attaches streams for existing snapshots once during lifecycle setup (iterating `childStores.children` on mount), avoiding redundant reattachments on subsequent store creations.
- **Disconnection status invalidation**: When an active SSE stream disconnects, `onDisconnect` marks `sessionStatusInvalidated` for that target in the directory store and authoritatively reports the native `"unavailable"` status to `applyGlobalSessionStatusSnapshot` for the addressed session ID, ensuring ghost active indicators are cleared immediately upon connection loss.
- **Reconnect pacing**: Recovery uses consecutive-failure exponential backoff. Offline/background waits and permanent canonical 4xx failures use the long cap; 408, 429, and resync-required responses remain transient. Duplicate callbacks and obsolete recovery completions cannot schedule a second recovery owner.
- **Resume signals**: Online, visibility becoming visible, persisted-page restore, system resume, authentication returning to `ok`, and `useConfigStore.isConnected` transitioning from false to true interrupt pending recovery once. The connection signal covers a Host restart while the browser stays online; it runs the same startup recovery as the other signals (stream reconnect, failed-bootstrap retry, and stream-restart revalidation) and its subscription is removed when the provider unmounts or the runtime is replaced. Directory bootstrap retry/revalidation uses the existing priority scheduler. Offline invalidates live status instead of leaving active indicators behind.
- **Observed run outcomes**: Accepted matching `run.completed` and `run.failed` events retain completion/error notifications and bounded error summaries. Duplicate events do not add a second notification; historical snapshots do not invent unseen activity.

### Native tool completion and Host refresh hints

Accepted live events in `sync-context.tsx` feed canonical tool parts to `sessionEvents` and `fileTreeChanges`. Calls and results keep separate `partId` identities and pair by native `toolCallId`; a call's terminal status and its later result produce one completion hint. Duplicate or sequence-gapped events do not invalidate Host state, and historical snapshot installation does not replay tool completion side effects.

An authoritative recovery snapshot that advances the addressed session's epoch or `headSequence` requests one directory-scoped file-tree invalidation after the snapshot commits, because the abandoned live event may have hidden a native write/edit. Initial hydration and unchanged recovery snapshots do not invalidate. The recovery path does not replay historical tool side effects; mounted file surfaces coalesce the notification with their normal 2 s directory batch.

Native `bash`, `edit`, and `write` completion hints invalidate Host Git status with a 250 ms per-directory debounce. Denied and read-only calls do not produce mutation hints. File-tree writes use their native `path`; raw edit modes and commands may touch unnamed paths, so their whole-tree hints coalesce until `run.completed`, `run.failed`, or `run.cancelled`. Native transcripts have no legacy step file-list snapshot. Runtime endpoint reset cancels pending refresh timers and clears file-tree pending/deduplication state, so old-runtime paths cannot refresh the new Host.


## Independent Host metadata and durable queue

The canonical snapshot (`SessionSnapshot`) contains:
- `session: RuntimeSession`: execution fields only (`sessionId`, `projectId`, `workspaceId`, `displayPath`, `parentSessionId`, `rootSessionId`, `createdAt`, `updatedAt`, `epoch`, `headSequence`, `runtimeStatus`, `activeRunId`, `mode`)
- `cursor: Cursor`: an opaque Host-issued stream recovery token
- `activeRun: Run | null`
- `branch: { branchId, branchVersion, leafMessageId }`
- `window: { firstTurnId, lastTurnId, firstMessageId, lastMessageId, hasEarlier }`
- `turns: Turn[]`
- `messages: Message[]`
- `approvals: ApprovalRequest[]`
- `questions: QuestionRequest[]`
- `requestRecovery: { pendingSet: 'replace'; priorEpochs: 'expired' }`

### Run control authority

Run control is the snapshot's `session.runtimeStatus`, `session.activeRunId`, and `activeRun`; the composer's Stop/Send choice and canonical abort target derive from it. It is a live observation, not transcript history:

- A canonical snapshot replaces run control wholesale, with one narrow in-flight exception. `installRuntimeRun` records `runControlRevision` for the session only when an accepted acknowledgement changes run control; unrelated session or metadata updates advance `sessionEventRevision` but not this marker. When the snapshot read started before such an acknowledgement (`runControlRevision` is greater than the value captured at request start), the read stays in the live epoch, its head is not newer than the live head, it reports `activeRunId: null`, and the live state still binds a run, the loader keeps the live `runtimeStatus`, `activeRunId`, and `activeRun`. Before the first snapshot exists, the projected session row supplies that previous head and binding, and the accepted acknowledgement's full run (`runControlActiveRun`) supplies `activeRun`, so the installed snapshot keeps the contract's run-identity pairing (non-null `activeRunId` always names a live `activeRun`); the loader clears that pending record once the snapshot owns run control. Transcript, cursor, branch, window, and blocking requests still install from that read.
- Every other snapshot remains authoritative: a different epoch, a newer head, a null snapshot `activeRunId` that matches a released live binding, an unrelated session update during the read, or a snapshot naming a run replaces run control. Stale-runtime rejection (`isCurrent`), the older-head guard, and deletion revisions are unchanged.
- `installRuntimeRun` accepts a live acknowledgement only while the binding is free or names the same run, and only when the session has not advanced past the request-start epoch/head baseline; a terminal acknowledgement releases only the run it names.
- `deriveSessionActivity` treats a missing or invalidated live status with an existing run binding as unknown rather than idle, so Stop stays available while status is unavailable.

Host metadata (`SessionMetadataState`) and durable queue (`QueueState`) are stored separately from runtime snapshots:

- Host metadata is fetched via `GET /api/agent/v1/sessions/:sessionId/metadata` and patched via `PATCH /api/agent/v1/sessions/:sessionId/metadata`.
- `SessionMetadataPatch` requires a `{ changes: { folder?, isPinned?, color?, icon?, notes?, openchamber? } }` structure.
- Durable queue items (`QueueItem`) are discriminated on `status: 'queued' | 'leased'`. Each item includes `context: ContextDescriptor[]` and `createdAt: number`.
- `installQueue` in `event-reducer.ts` verifies `queue.revision` monotonically before updating `state.queue`.
- Failed metadata or queue reads preserve prior authoritative data.
- Metadata and `session.updated` events for a session this directory does not
  project yet are held, not dropped. `installSessionMetadata` buffers them in
  `state.pendingMetadata` (highest revision wins) and `installHostSession`
  releases that record when the session row arrives. Buffering is opt-in
  (`installSessionMetadata(..., { bufferUnknown: true })`) and
  `applyCanonicalMetadataEvent` enables it for exactly one child store, because
  the record's directory is not stated there: every open store copying a record
  that belongs to a directory whose list never changes would leave permanent
  ghosts. A metadata-only event for a session the *global* store does not hold
  is still dropped; the next list read carries the record, and no fabricated
  session is created from metadata alone. `applyDirectoryEvent` with no snapshot
  installs a `session.updated` that carries `event.session` and accepts
  `session.deleted`, instead of forcing a resnapshot. An auto-generated
  title is announced for a session created seconds ago, so dropping it left the
  sidebar stale until a reload.

## Freshness is same-source ordering

`session.updatedAt` is the native transcript file's modification time, stamped
on the machine running the Agent Service; `metadata.openchamber.*` stamps are
`Date.now()` on the Host. Comparing the two measured the distance between two
clocks: touching a session file purged a suggestion or a done hint that still
applied, and a skewed clock purged them for good.

Freshness therefore compares one source with itself:

- `lib/sessionAssistMetadata.ts` keeps the payload while
  `generatedAt >= hostTurnEndedAt(session)`; with no Host turn stamp the payload
  is kept, since "no evidence" is not "stale".
- `lib/sessionWorkMetadata.ts` applies the same rule to `suggestDoneAt` and
  `reviewOffer.at`.
- `sync/host-session-status-seed.ts` has no client-clock age window at all: a
  running session the Host lists is seeded, and the live stream corrects it.
- `lib/sessionSourceClock.ts` owns the Host-clock readers
  (`openchamber.workbench.lastIdleAt`, `openchamber.turn.endedAt`,
  `openchamber.reviewOffer.at`).

`oxlint.config.ts` enforces this with
`tools/oxlint/openchamber/rules/no-cross-source-time-compare.ts`: a comparison
between `session.updatedAt` and another clock (a Host stamp, `Date.now()`,
`now`) is an error for `packages/ui/src`. Two `updatedAt` values, two Host
stamps, and a presentation window that spans days (`overviewModel.ts`) stay
allowed, the last with a justified inline disable.



## Approvals and Questions (CAS Interaction)

Approvals and questions use Compare-And-Set (CAS) semantics to guard against concurrent resolution:

```typescript
export interface RequestCAS {
  version: PositiveCounter; // '1' on creation, increments on resolution
  epoch: Epoch;
  workerGeneration: EntityId;
}
```

### Approvals
- `ApprovalRequest` includes `approvalId`, `sessionId`, `turnId`, `toolCallId`, `toolName`, `actionType`, `commandSummary`, `details`, `status` (`'pending' | 'approved' | 'rejected' | 'revoked' | 'expired'`), `requestedAt`, optional `resolvedAt`, and `resolution` (`ApprovalResolution`).
- Pending approvals have `status === 'pending'` and `version === '1'`.
- Terminal approvals record `resolvedAt` and `resolution` (`approve`, `reject`, `always-allow` with session policy, or `always-deny` with workspace policy).
- Resolutions are submitted via `canonicalClient.respondApproval(sessionId, approvalId, reply)`.

### Questions
- `QuestionRequest` includes `questionId`, `sessionId`, `turnId`, `prompt`, optional JSON Schema `schema`, `status` (`'pending' | 'answered' | 'cancelled' | 'expired'`), and optional `response`.
- Responses are submitted via `canonicalClient.respondQuestion(sessionId, questionId, reply)` with `{ action: 'answer', response }` or `{ action: 'cancel' }`.

### Blocking request coordination
- `scoped-blocking-requests.ts`: aggregates pending approvals and questions for a session and its subagent descendants, filtering by `status === 'pending'`.
- `global-blocking-requests.ts`: maintains cross-directory pending counts and items. `replaceGlobalBlockingRequestSnapshot` replaces the pending set authoritatively when a snapshot lands, expiring prior epoch requests without clearing items on failed reads.

## Catalog changes apply live

Native `catalog.updated` events contain `CatalogUpdate`, discriminated by `kind: 'mcp' | 'skills'`. They publish worker-applied catalog state, not a legacy model/provider/agent reload notification.

- Directory stores retain updates under the worker root-session identity and catalog kind.
- Workspace/root-session ownership is checked before publication.
- Catalog revisions advance monotonically within the same worker generation; stale generations require snapshot recovery rather than overwriting a newer worker.
- Models, providers, and agents are independent workspace reads during bootstrap. Settings and catalog leaf-consumer migration remains owned by Task 15; the sync layer does not add a second settings adapter or speculative refetch lane.


## Compaction and step summaries

A session compaction produces a canonical `session.compacted` event:
```typescript
export interface SessionCompactedEvent extends DataEventEnvelope {
  type: 'session.compacted';
  compactionId: EntityId;
  tokensBefore: number;
  completedAt: Timestamp;
}
```

Messages strictly adhere to three roles: `'user' | 'assistant' | 'system'`. There is no compaction message role. Step summaries within turns are represented as `StepSummaryPart` (`type: 'step_summary'`, `partId`, `title`, optional `durationMs`) inside `message.parts`. When a `session.compacted` event is received by the directory reducer, it marks a structural recovery condition and requests a full resnapshot.
Live compaction state (`snapshot.compacting`) is projected via `session.updated` (`compacting: { method, reason?, startedAt } | null`) and cleared either by `compacting: null` on aborted/skipped/retry endings or by authoritative snapshot recovery on `session.compacted`. OMP's active todo checklist (`snapshot.todos`) is likewise projected via `session.updated` (`todos: TodoPhase[]`, including `[]` on `todo_auto_clear`) and read directly by `TodoTray` without scanning transcript tool parts.

## Workspace lifecycle and directory eviction

Directory state is managed in `ChildStoreManager`:
- Default capacity: `MAX_DIR_STORES = 30`
- Idle directory TTL: `DIR_IDLE_TTL_MS = 20 * 60 * 1000` (20 minutes)
- Eviction grace period: `EVICTION_GRACE_MS = 30 * 1000` (30 seconds)

A directory store is pinned and protected from eviction while:
- Any React consumer is mounted with `useDirectoryStore(directory)`
- It represents the active selected session's directory
- It has pending blocking requests (approvals or questions)
- It has an active in-flight bootstrap

When an unpinned idle store exceeds the TTL, `ChildStoreManager` disposes it, triggering `EventPipeline.clearDirectory(directory)` and `SessionMessageLoader.clearDirectory(directory)` to release SSE streams and cached transcript state.

## Session message loading and cache retention

`SessionMessageLoader` is the single-flight authority for session message requests. Navigation, chat loading, sidebar prefetch, pagination, and snapshot recovery delegate to it.

### Rules

1. **Request identity**: Target is `SessionMessageTarget` (`{ directory, sessionId }`).
2. **Single-flight sharing**: Concurrent callers for the same target share a single in-flight Promise.
3. **Explicit load state**: Tracked in `SessionMessageLoadState`:
   ```typescript
   export type SessionMessageLoadState = {
     status: 'idle' | 'loading' | 'ready' | 'error';
     loadingKind: 'initial' | 'older' | 'refresh' | 'prefetch' | null;
     error: Error | null;
     resolved: boolean;
     limit: number;
     cursor: string | undefined; // HistoryPage.nextCursor only. Never an SSE cursor.
     complete: boolean;
     generation: number;
     updatedAt: number | undefined;
   };
   ```
4. **Cursor distinction**: `SessionMessageLoadState.cursor` is strictly `HistoryPage.nextCursor`. It is never used as an SSE cursor; the Host snapshot's stream cursor remains opaque.
5. **Snapshot loading**: Initial loads and resyncs retrieve `SessionSnapshot` via `client.getSnapshot(sessionId)` and commit runtime session, inline-part messages, turns, approvals, and questions together via `installSessionSnapshot`.
6. **SSE stream attachment**: On snapshot arrival, `EventPipeline.attach(target, snapshot)` opens `subscribeSessionEvents(sessionId, snapshot.cursor, ...)`.
7. **History pagination**: Older messages are paged backward via `client.getHistory(sessionId, { cursor, limit })` returning `HistoryPage`; `loadOlder` waits for pending initial materialization and remains runtime/generation guarded.
8. **Native materialization**: `materializeSessionSnapshots` accepts canonical `Message[]`; each message owns its inline `parts`. There is no split-part or `{ info, parts }` wire wrapper.
9. **Optimistic reconciliation**: `optimisticAdd` inserts pending native messages; an echoed canonical `messageId` from a snapshot or history page promotes the authoritative record in place. The review-flow send boundary (`optimisticSend`) inserts a client-generated pending user message before awaiting the transport. A definite transport failure removes only that unconfirmed record; an accepted send keeps it until the canonical user message named by the accepted run's turn (or, for callers that return no run, a new matching user message absent from the pre-send transcript) is visible in the authoritative transcript, then removes the pending record so the message is not duplicated. Rollback removes only an unconfirmed optimistic record and cannot remove a promoted echo.
10. **Generation and deletion guards**: Async completions verify loader generation and active runtime key. Snapshot, history, metadata, queue, and discovery reads preserve newer session deletion tombstones and cannot resurrect a session deleted while a request was in flight.
11. **Failure preservation**: Snapshot/history failures preserve visible authoritative state and cursor, mark the load failed, and do not report complete. Independent metadata and queue failures do not erase the other authority.
12. **Eviction authority**: Eviction drops messages, snapshot, part ownership, `sessionEpoch`, `sessionCursor`, and `sessionStatusInvalidated`, detaches the stream, and releases idle timers so stale transcript authority cannot return.
13. **Child transcript identity**: A child session is read only through the history route; its snapshot, metadata, queue and event routes are root-only. The child row is resolved from the directory store first and the global cache second, and the live subagent record supplies its activity: a running subagent on a live root is `running`, not forced `idle`. A child's `epoch` is its own identity and its `headSequence` is `"0"`, because no event stream ever addressed it — the parent's epoch and head describe the parent's stream and must never be copied onto a child. A history page establishes the transcript only; it does not overwrite a session row the projection already lists.

### Whole-session cache retention

`SessionCacheRetention`, owned by `SessionMessageLoader`, evicts entire session transcripts:
- A cached transcript is either fully present or evicted; transcripts are never trimmed.
- An unvisited session keeps its history for a 5-minute idle grace period (`SESSION_CACHE_IDLE_TTL_MS = 5 * 60 * 1000`).
- Capacity ceiling: 20 materialized sessions per directory on web/Electron (`SESSION_CACHE_LIMIT`), 6 on constrained mobile (`CONSTRAINED_SESSION_CACHE_LIMIT`).
- Protected sessions:
  - Currently viewed session (`isViewed`)
  - Externally viewed sessions (e.g. pinned in side panel)
  - Active sessions with live status (`running`, `awaiting_approval`, `awaiting_input`)
  - Sessions with pending approvals or questions
  - Sessions with in-flight optimistic sends or history loads
  - Sessions with active explicit history readers (`retainSessionHistory`)
- When capacity is exceeded, unprotected sessions are evicted in least-recently-visited order.
- Eviction execution: `evictSessionHistory` drops messages, snapshot, partOwner, `sessionEpoch`, `sessionCursor`, `sessionStatusInvalidated`, session status, permission, and form via `dropSessionCaches`, sets `entry.evicted = true`, detaches the SSE pipeline stream via `releaseDerivedCache` -> `pipeline.detach(target)`, releases idle timers, and updates the directory store.
- Prefetch admission: `admitPrefetch` prevents speculative prefetch from displacing visited sessions when the cache is near capacity.

## Cache helper native retention and batch contracts

The native cache helpers in `packages/ui/src/sync` implement specific contracts for session retention, batch operations, and cleanup:

### Session retention (`session-retention.ts`)
- `buildSessionRetentionCandidates`:
  - Filters sessions matching the scope (`onlyArchived` matches `isArchived(session)`).
  - Ranks sessions by retention timestamp (`archivedAt` if `onlyArchived`, otherwise `updatedAt`).
  - Protects the 5 most recent sessions (`RETENTION_KEEP_RECENT = 5`).
  - Protects the currently selected session, native active sessions, Host-metadata pins and directory-scoped local pins, in-work sessions, and `/btw` conversations. Local pin lookup uses the admitted workspace-to-directory binding; ID-based Host operations do not require a synthetic filesystem path.
  - Cascading parent deletion: when deleting or operating on archived sessions, protects all ancestors (`parentSessionId`) of protected sessions.
  - Deletion ordering: child sessions are ordered before their parents (`childrenLeft` topological sort) so child deletions complete before parent deletion is issued.
- `runSessionRetentionCleanup`:
  - Synchronizes execution through `useSessionRetentionRunStore` to prevent concurrent cleanup passes.
  - Captures `runtimeKey` and terminates if the runtime switches mid-cleanup.
  - Executes deletion or archiving via `deleteSession` or `archiveSession`.

### Batch archive and unarchive (`session-archive-batch.ts`)
- Communicates directly with Host batch routes:
  - `requestSessionArchiveBatch`: calls `POST /api/openchamber/sessions/archive` with `{ directory, ids, archivedAt }`, returning `{ outcome: 'archived', archived: [{ id, archivedAt }], failedIds }`.
  - `requestSessionUnarchiveBatch`: calls `POST /api/openchamber/sessions/unarchive` with `{ ids }`, returning `{ outcome: 'restored', restored: string[], failedIds }`.
- Returned stamps reconcile against native `Session` records in stores; unarchive clears `archivedAt` and resets `archiveRevision`.

### Persisted state deletion cleanup (`session-deletion-cleanup.ts`)
- `cleanupPersistedSessionState`:
  - Purges message queue targets, session folder memberships, multi-select entries, inline comment drafts, pinned sessions, input history buckets, and composer chat drafts for `{ runtimeKey, directory, sessionId }`.
  - Enforces `identity.runtimeKey === getRuntimeKey()` to prevent stale responses from altering unrelated runtimes.

### Child session discovery and fork reconciliation
- `selectNewChildSessions` in `child-session-discovery.ts`: filters newly discovered child sessions to avoid reintroducing known archived subagents as active orphans.
- `applyForkedSession` in `forked-session.ts`: loads the native `Session` for a fork event and commits it, guarded against concurrent patches and local creations.

## Live cross-directory session and status view

Live activity across directories is coordinated through specialized helpers:

- `global-session-status.ts`:
  - Maintains `statusById: Map<string, GlobalSessionStatusEntry>` and `activeSessionIds: Set<string>`
  - Updated incrementally by canonical events (`session.status`, `run.started`, `run.completed`, `run.failed`, `run.cancelled`, `turn.started`, `turn.completed`)
  - Seeded by directory status snapshots via `applyGlobalSessionStatusSnapshot`
  - Per-session snapshot updates supply `knownSessionIds` to clear only the addressed session upon absence, preserving sibling statuses
  - Token-level and part streaming events do not scan or publish global status
- `session-ordering.ts`:
  - Manages ephemeral lifecycle rank for session lists
  - Promotes sessions when activity crosses between `active` (`running`, `awaiting_approval`, `awaiting_input`) and `settled` (`idle`, `unavailable`)
  - Root sessions compare rank only with other roots; child sessions compare rank only with siblings sharing `parentSessionId`
  - Restored sessions can be promoted via `promoteRestoredSessionOrdering`
- `session-activity-timing.ts`:
  - Tracks elapsed duration of running turns
  - Records start timestamps on `active` transitions; converts to finished duration on `settled` transitions
  - Canonical run timestamps and run IDs establish elapsed time; stale run completions cannot settle a newer run. Persisted starts are scoped by runtime in the v2 namespace, bounded by a 30-second maximum absence and a 90-second restore adoption window.
- `background-shells.ts`:
  - Tracks running background commands (`ShellJob`) associated with sessions
  - Shell identity is `(sessionId, workerGeneration, jobId)`, not `jobId` alone. Terminal jobs cannot be reopened within an epoch; workspace snapshots enforce monotonic revisions, preserve newer mutations, reject stale reads, and invalidate ended records from a previous epoch.
  - Directory bootstrap environment discovery seeds background shells via `refreshBackgroundShells` and `client.getShellSnapshot({ kind: "workspace", workspaceId })`
  - Keeps session turn activity open while a background command executes
  - `useRunningShell` takes `ShellJobIdentity`; `replaceDirectoryShells` accepts a native `ShellSnapshot` only.
  - Mid-turn foreground-tool detach is not a native capability. Its button, `canBackground` derivation and shortcut are retired rather than advertised as disabled or mapped to a different operation.
  - Native background jobs, including jobs started through canonical `startShell`, retain their store, Guest observation and `BackgroundShellsStrip`. Stop addresses the owning session, epoch, worker generation and job ID through canonical `stopShell`; only the matching canonical terminal event removes the strip row. The unused legacy SDK output-polling hook and shell methods are removed.

- `runtime-live-memory.ts`:
  - Caches recent non-idle `SessionRuntimeStatus` seeds per runtime key and directory with a 15-second TTL (`LIVE_STATUS_TTL_MS`); idle transitions are ignored and do not seed memory.
- `session-title-context.ts` and `session-title-generation.ts`:
  - `collectNativeTitleTurns` uses native messages plus authoritative `Turn[]` and selects each completed turn's final assistant response. Attachment-only user prompts remain eligible; title readers supply `getTurns()` rather than infer completion from historical message anomalies.
  - Title generation validates current `Session.headSequence`, `updatedAt`, `archivedAt`, and `Session.title` before committing generated titles; the save goes through the OMP title route and the returned title is published. Automatic titles for new chats are OMP's; the small-model generator is only the manual AI-rename action.
- `session-error-log.ts`:
  - Retains the last 20 diagnostic error summaries in memory. Native run failures supply error strings; independently supplied structured transport detail is diagnostics-only. Sequence/epoch gating replaces the obsolete legacy wire freshness/router implementation.

## Session directory resolution and actions (Slice C)

`session-directory-resolution.ts` resolves directory ownership for session actions:
1. `authoritative`: The session record's own `workspaceId` mapped through `resolveWorkspaceDirectory`, or a child store containing the session
2. `selected`: Server-confirmed directory captured at selection
3. `attachment`: Worktree attachment recorded by this client
4. `worktree-metadata`: Worktree captured at creation time
5. `remembered`: Per-runtime directory persisted across restarts

### Session action rules

Session actions live in `session-actions.ts` (Slice C) and execute mutations through `CanonicalClient`:

- `createSession(input)` -> `upsertSession(session)`
- `patchSessionMetadata(sessionId, patch)` -> updates metadata with monotonic revision checking
- `archiveSessions(sessionIds)` -> calls Host archive route; updates confirmed IDs
- `unarchiveSessions(sessionIds)` -> calls Host unarchive route; restores confirmed IDs
- `deleteSession(sessionId)` -> calls Host delete route; on confirmation or `404`, removes the session and clears persisted UI state

Restoring a top-level session brings its archived subsessions back with it. A subsession under an archived or unknown parent comes back only with that parent, and its id alone fails. A subsession archived on its own while its parent stays active restores alone and brings its own archived subsessions; `isRestorableOnItsOwn` (`session-restore-rule.ts`) is the one rule, shared with the Archive page and the chat header's session menu. `undo` still puts back exactly what an archive just moved.

### Deletion and archive runtime guards

Session actions capture the active `runtimeKey` at invocation and verify it before store mutations. If the runtime changes before a deletion or archive operation completes, the mutation is rejected. This prevents stale responses from deleting or modifying state belonging to a different runtime.

## Store splitting and selector hygiene

`SyncProvider` exposes two context tiers:

1. `SyncRuntimeContext` (`useSyncRuntime()`):
   - Ref-stable container holding `childStores`, `messageLoader`, `client`, `runtimeKey`, and subscribable `currentDirectory`
   - Changes only during runtime reconfiguration or endpoint switching
2. `SyncContext` (`useSyncSystem()` / `useSync()`):
   - Adds the current directory string; updates on every directory switch

Hooks that require only runtime facilities or accept an explicit directory consume `useSyncRuntime()` to avoid re-rendering during cross-directory switches.

### Narrow subscriptions and selector scoping

Components subscribe to targeted state slices rather than broad containers:

```typescript
// Subscribe to messages for one session
const messages = useSessionMessages(sessionId, directory);

// Subscribe to messages with part-update suspension during live streaming
const messages = useSessionMessageRecords(sessionId, directory, {
  suspendPartUpdates: true,
  suspendPartUpdatesForMessageId: streamingMessageId,
});

// Subscribe to runtime status for one session
const status = useSessionStatus(sessionId, directory);

// Subscribe to pending approvals for one session
const approvals = useSessionPermissions(sessionId, directory);

// Subscribe to pending questions for one session
const questions = useSessionForms(sessionId, directory);

// Extract inline parts scoped strictly to the addressed session
const partsByMessageId = useSessionPartsForMessages(sessionId, messageIds, directory);

// Select exact session with equality comparison preserved
const sessionTitle = useSessionSelector(sessionId, directory, (session) => session?.title);
```

### Targeted subscriber optimizations

- `useSession` and `useSessionSelector`:
  - Subscriptions select the exact session: `state.session.find((s) => s.sessionId === sessionId)`.
  - Equality comparison is preserved (`isEqual = Object.is`), preventing re-renders when unrelated sessions mutate or when the derived selector output has not changed.
- `useSessionDirectory`:
  - Selects only the canonical session's `workspaceId`, not its full record. Updates to timestamps, runtime fields, or metadata do not re-render directory-only consumers when the workspace is unchanged.
  - Resolves the admitted workspace-to-directory binding through `subscribeWorkspaceDirectories`, so a binding registered or moved after the session arrives still publishes its directory without requiring another session update.
- `useSessionMessagesSelector` and `useLiveSessionsExcluding`:
  - Preserve the selected output when its equality comparison passes, including rebuilt native message lists with an unchanged primitive selection and excluded-session updates with an unchanged live gap.
  - Keep the remaining live sessions' list reference stable while excluded records change. Changes to included membership, ordering, or canonical session fields still publish; selectors that render inline parts must include those parts in their selected value.
  - Selection state belongs to the mounted hook and child-store runtime. Session/directory changes read the new owner, and a runtime-key change remounts the provider rather than reusing outgoing leaf state.
- `useSessionPartsForMessages(sessionId, messageIds, directory)`:
  - Scopes parts subscription and lookup strictly to the addressed session's messages (`store.getState().message[sessionId]`).
  - Eliminates directory-wide scans over all sessions.
  - Subscribes via `subscribeDirectorySessionMessages` to the session's message list and notifies only when message changes, resets, or part changes for the requested `messageIds` occur.

- Streaming derivation is subscribed at the directory store owner, so event, snapshot, history, and optimistic writes share the same lifecycle. A completed inner turn stops its trailing assistant stream even while the outer run remains active.
- Imperative refs expose `setSyncRefs(childStores, directory)`, native session IDs, and inline message parts. Explicit pre-discovery session routing survives directory navigation within the same manager and is rejected after a runtime change.

### Store splitting rules

State is partitioned across focused stores by update frequency:

| Store | Owns | Update frequency |
|---|---|---|
| Directory sync store (`child-store.ts`) | Per-directory domain records (`session`, `message`, `permission`, `form`, `snapshot`, `queue`, `catalog`, `shell`) | Realtime streaming flushes (100 ms) and discovery |
| `session-ui-store.ts` (Slice C) | Active selection, draft lifecycle, abort prompts, worktree metadata | User navigation and draft edits |
| `viewport-store.ts` | Scroll anchors, session memory state, timeline loading indicators | Scroll events and session switches |
| `input-store.ts` | Pending input text, synthetic parts, attached files | User typing and file attachments |
| `selection-store.ts` | Per-session model, agent, and effort overrides | User picker changes |
| `voice-store.ts` | Voice mode and connection state | Voice toggle |

In `applyDirectoryEvent`, only state slices mutated by the incoming canonical event are cloned. The store spreads only modified properties, preserving reference equality for untouched slices and preventing unnecessary React subscriber re-renders.

## Runtime endpoint switching and lifecycle scoping

The sync tree is rooted in `SyncProvider` in `sync-context.tsx`, keyed by `runtimeKey` (`useSyncExternalStore` on `subscribeRuntimeEndpointChanged`).

When the runtime identity changes:
1. `subscribeRuntimeEndpointWillChange` immediately stops the outgoing pipeline, clears global bootstrap/view scope, and makes old async completions stale.
2. React unmounts the previous provider and mounts a fresh provider under the new `runtimeKey`.
3. `bootstrapGlobal` resolves the new runtime's project/workspace baseline. Loader, persistence, and imperative-reference generation checks prevent outgoing completions from publishing into it.

A transport-only change with the same runtime key preserves child stores, selection, history, and optimistic state. The pipeline recovers snapshots through the newly active shared runtime transport; existing directory scheduling revalidates scopes without a destructive remount. All four retained surfaces—web, Electron, hosted mobile, and Capacitor—use this shared Host transport and these same state rules. No browser-origin or runtime-specific transport bypass is introduced.

## Task 13 recovery coverage and retired wire suites

Applicable state transitions remain native regression cases; deleting an OpenCode payload fixture does not establish migration completeness. The replacement map is:

| Retired suite or mechanism | Native behavior coverage |
|---|---|
| Pipeline online, permanent-error, and resume suites | `event-pipeline.test.ts`: reconnect interrupts backoff, single-flight recovery, permanent-error cap, gap recovery, stale runtime, detach, and directory eviction. |
| Legacy event reducer/freshness/router | `event-reducer.test.ts`: sequence/epoch gates, contiguous native events, snapshot recovery, metadata revisions, deletion, cancelled runs, and catalog ownership. |
| Interrupted-turn tool fixtures | `interrupted-turn-recovery.test.ts`, `event-reducer.test.ts`, and `global-session-status.test.ts`: authoritative turn outcome and matching run terminal settlement. |
| Message-completion status poll and status-snapshot fixtures | `global-session-status.test.ts`, `directory-recovery-snapshots.test.ts`, `host-session-status-seed.test.ts`, and `session-message-loader.test.ts`: scoped authoritative snapshots, newer event preservation, failed reads, and overlapping recovery. |
| Session-switch resync | `global-blocking-requests.test.ts`, `directory-recovery-snapshots.test.ts`, `composer-forms.test.ts`, and loader tests: request identity/revision races, independent recovery lanes, atomic snapshots, and stale-runtime rejection. |
| Reconnect recovery candidate/materialization fixtures | Loader, materialization, child-store, and selection-boundary suites: protected cache admission, atomic native snapshots, failed/partial reads, and mutation-preserving discovery. |
| Run-control in-flight snapshots | `run-control-snapshot-race.test.ts` (committed regression) and `session-message-loader-run-control.test.ts`: an acknowledgement published after the read began keeps Stop/abort, while a newer head, another epoch, a released binding, or no post-read acknowledgement leaves the snapshot authoritative. |
| Connection-triggered recovery resume | `sync-context-connection-resume.test.tsx`: `isConnected` false-to-true resumes failed-bootstrap retry and stream restart exactly once, a true-to-false or repeated-true transition does not, and unmount or runtime replacement removes the subscription. |
| Child discovery and sync-context event fixtures | `child-session-discovery.test.ts`, `sync-context-selection-boundary.test.tsx`, and native reducer/loader suites: archive filtering, parent/child materialization, revision ordering, runtime guards, and deletion. Canonical discovery is `listSessions(workspaceId)`, not SDK page traversal. |
| Unopened-directory status fixtures | Host status seed and global status suites: additive observed-session seed, directory ownership, scoped failures, and sibling isolation. Native request snapshots retain canonical request scope; no directory-less wire fallback is introduced. |
| Legacy session-moved wire event | Session action/directory-adoption tests owned by the session slice: Host control-plane move and authoritative directory adoption, not a wire-event translator. |
| Open-directory catalog wire events | Native reducer and catalog routing suites cover `mcp`/`skills` revisions and workspace ownership. Model/provider/settings reload behavior belongs to Task 15. |

The old split-part wire benchmark and sanitizers for fields absent from canonical DTOs have no canonical behavior to preserve. Attachment sanitization remains at its real boundary. Git/file-tree/plugin and notification-policy tests are not canonical sync ownership; retained notification rendering is not removed by this migration. No test, build, lint, or formatter result is claimed by this recovery slice; the integration owner runs those checks after all slices land.

First-connect subscribers now observe the first successful, current canonical directory session bootstrap. Failed or partial bootstrap results and obsolete runtime completions cannot claim that notification.


`seedGlobalSessionStatusFromHost()` retains its no-argument asynchronous entry point. It uses canonical `listSessions()` projections, admitted workspace-to-directory bindings, numeric `updatedAt` freshness, per-session/workspace discovery failures, and runtime generation guards (including A→B→A switches). Seeding is additive and cannot overwrite live observations. Only `awaiting_approval`/`awaiting_input` sessions fetch canonical snapshots to discover pending request DTOs; idle/unavailable discovery does not invent request payloads or native events. `buildHostStatusSeedSnapshots` replaces the old wire-event builder.

`directory-recovery-snapshots.ts` was an unreferenced OpenCode event-observer mechanism and is retired. Its retained regression suite now exercises native `installSessionSnapshot`/`applyDirectoryEvent` recovery, including stale snapshot and request revision races, rather than introducing disconnected observers into the canonical pipeline.

`agent-startup-wait.ts` tracks outstanding prompt connection waits by runtime-switch revision. Each wait owns its completion token; completing an older wait cannot clear another prompt's feedback. This is presentation state, not a source of session activity or runtime readiness.
