# UI Stores

## Purpose

`packages/ui/src/stores` contains app-level Zustand stores for persistent UI state, runtime state, and feature caches.

Not all state in the UI belongs here.

Use a store when state is:

- shared across distant parts of the app
- needed outside a single component subtree
- cache-like and keyed by runtime identity (for example directory, branch, session id)
- updated imperatively from multiple surfaces

Do not put high-frequency local component state here just because it is convenient.

## Architecture

There are multiple store categories in this directory.

### Host filesystem and directory context

`lib/host-filesystem.ts` owns Host home/chat-root discovery, directory availability,
listing, creation, filesystem search, and the ambient directory context. It uses
`runtimeFetch` for Host routes and the registered desktop FilesAPI for local
listing/creation where the existing desktop runtime supplies it. It never loads
an agent SDK. `useDirectoryStore` owns navigation/history and persisted home
bootstrap; consumers outside React read/write the shared Host context rather
than an engine client's directory. Remaining legacy agent calls may read this
context but do not expose filesystem or directory-context methods.

Web/PWA and Electron use the active authenticated Host. Hosted mobile and
Capacitor use the same runtime URL/auth transport against their selected Host;
no client-side filesystem privileges are added. Injected desktop home applies
only to the local runtime. Cloud/chat-root defaults and home readiness remain
with `useDirectoryStore` and `lib/chatDirectories.ts`.

An unavailable home is not an authoritative empty chat root. Directory probes
return `missing` only for confirmed missing/non-directory paths; permission,
offline and malformed responses remain `unknown`. The existing 400 ms directory
listing cache and in-flight sharing belong to the Host owner and reset alongside
runtime/transport reconnection. Old completions cannot populate replacement
cache maps. Search uses the scoped Host `/api/fs/search` contract, preserves
file/directory selection and ignore flags, and bounds response/body delivery
with the existing 30-second read deadline plus caller cancellation.

### Catalog refresh

Canonical catalogs are consumed through their owning feature stores and the
Canonical Client. There is no shared OpenCode event-to-list reload adapter;
providers, models, agents, MCP, plugins, commands, skills, and web search retain
their own workspace or directory scope and explicit read state.

Native worker `catalog.updated` events carry MCP or skill catalog state for the
addressed root session. They are not provider, model, or agent reload notices;
the sync layer stores them separately from Settings catalog reads. A failed
authoritative read must remain an error and cannot clear the last known list.

Provider Settings keeps its page catalog in `useProviderSettingsStore`. Its
explicit `refresh` after provider configuration or credential/account changes
emits the existing `providers` config-change notification before rereading the
page catalog. This also invalidates and refreshes the composer's known-directory
catalogs through `useConfigStore`, even if the page reread fails. Ordinary page
loads do not emit, and reset or stale-runtime stores cannot notify a new runtime.

The agents store counts load generations: `invalidateAgentsLoadCache` starts a
new one, and a load never joins a read that began in an older generation. It
waits for that read and reads again, so a refresh after a delete cannot be
answered by the read the delete itself started.

Agent refreshes keep the ambient project and each location that raised the
catalog event in the same batch. Settings can show a different project from the
app, so refreshing only the ambient cache leaves its list stale. Invalidating a
directory retires the Settings store, the composer store and the shared client
request for that key. Their older responses cannot restore a pre-change list or
stamp a fresh TTL over the replacement request. A runtime switch clears the
directory maps and rejects loads captured from the previous runtime.

### Why command refreshes retire an in-flight read

A cold OpenCode location can answer with no commands before announcing its
completed catalog. Command events refresh the ambient project and every named
location, so an open draft's list updates even when it belongs to a worktree.
A command invalidation marks that directory's pending read
obsolete; it publishes nothing and all its callers await one replacement read.
Joining the old read would keep the empty list even after `command.updated`.
Empty answers remain visible but receive no freshness TTL, so reopening the
menu can recover immediately if the event was missed. Nonempty lists retain
their TTL, and no timer polls for commands.

A same-runtime load retired by a catalog change waits for the replacement list before it returns. A create or delete waiting for that read therefore keeps its successful result; the retired response itself publishes nothing. A runtime switch still returns failure instead of joining work for another runtime.

`usePluginsStore` owns the native plugin catalog through `canonicalClient.plugins`.
`loadedDirectory` and `loadedRuntimeKey` bind its workspace catalog to the Settings
project selection. Concurrent reads share the current request; a forced refresh
retires the previous read. Failed reads preserve the last authoritative catalog,
and stale runtime/directory completions cannot publish into a replacement owner.
Mutations serialize against the latest committed decimal revision; an older
in-flight read cannot restore a pre-mutation catalog. Runtime endpoint changes
clear server-derived state. No OpenCode plugin registry/runtime adapter remains.

Configuration persistence and active-worker apply outcomes are separate. A saved
configuration remains saved when existing workers cannot apply it. Settings offers
an explicit confirmed restart of idle sessions; plugin mutations never restart
sessions automatically. Package installs are global; marketplace installs retain
their native user/project target. Local source authoring is workspace-confined
under `.omp/extensions/`. Host policy, not UI heuristics, authorizes external egress.

### Feature cache / query stores

`useWebSearchStore` owns canonical workspace web-search settings for web/PWA,
Electron, hosted mobile and Capacitor through the same active Host transport.
It resolves the current directory with `CanonicalClient.resolveWorkspace`,
then reads `getWebSearch`; failures retain the previous authoritative snapshot
and expose a read error. Writes carry `expectedRevision`, never optimistically
apply, and retain the complete mutation result so persisted-but-partial worker
application is distinguishable from failed persistence. Runtime generations,
directory identity and mutation revisions reject stale continuations. Provider
identities are native selector strings, not integration IDs. API keys are
write-only: `credentialConfigured` reports stored-key presence independently
from native readiness (`configured`) and write capability (`credentialWritable`).
Enterprise mode disables new key entry but retains configuration and key removal.


`useSessionWarmingStore` owns per-session canonical cache-warming state keyed by
runtime (`readSessionCacheWarming` / `updateSessionCacheWarming`). Concurrent reads
share one in-flight request per session, stale reads started before a newer
mutation or eviction cannot overwrite committed state, and failed reads preserve
the last authoritative entry alongside an explicit `'read'` error. Writes
serialize per session with `expectedRevision` CAS protection, retrying once on
`409 CATALOG_CONFLICT` after a forced refresh, and runtime endpoint switches
abort pending requests and clear entries. `sync/session-warming-sync.ts`
hydrates the active root session on selection and Host reconnects and prunes
entries on confirmed session deletion.

The Stats page keeps reports in the feature-local `components/views/usage/usageStatsStore.ts`, keyed by runtime, range and project directory, in memory only. Cached keys do not refetch automatically; runtime switches abort pending reads and clear entries. Canonical usage reads resolve selected directories through `resolveWorkspace` and send canonical workspace/project IDs with explicit range, bounds and viewer IANA timezone. The initial `/api/agent/v1/usage` report omits expensive tool parsing (`tools.mode: 'none'`); `/api/agent/v1/usage/tools` loads lazily over the loaded report window. Once requested, tools follow subsequent reports. Stale tool completions cannot replace a refreshed window. Failed refreshes preserve cached reports and tools with retry feedback. Partial reports retain valid sessions and expose per-session errors; unavailable reasoning and duration metrics remain null rather than fabricated zeroes. Web/PWA, Electron, hosted mobile and Capacitor share the active Host transport.

PR status reads share the aggregate background-network budget as well as their PR-specific cap. Command discovery gates each scope/config read, including body decoding, rather than only gating the initial SDK list. Command reads have a bounded deadline and abort on runtime reset. Reset clears server-derived command caches and invalidates late reads and mutation responses while preserving unsaved command drafts.

These are the most performance-sensitive.

- `useGitStore.ts`
- `useGitHubPrStatusStore.ts`
- `useWalkthroughStore.ts`
- `useFilesViewTabsStore.ts`

These stores act like centralized keyed caches. UI should consume narrow slices from them instead of re-fetching the same data in multiple places.

`useQuotaStore` keeps the last authoritative provider results separately from
`refreshErrors`. Transport failures and configured-provider errors preserve the
last usage sample and its timestamp. An explicit unconfigured response replaces
old configuration and clears that provider's refresh error; it is not displayed
as a failure. A first-load transport failure leaves configuration unknown.
Concurrent refreshes share one request per provider. Runtime reset aborts those
requests, and generation checks prevent their completions from changing the
next runtime. `lib/quota/fetchQuota.ts` validates response payloads and bounds
the complete request, including JSON body delivery. Compact usage cards and
Settings display refresh errors alongside retained data. The Usage page renders
one card per provider whose result reports `configured`, so a provider without
a stored credential has no card at all; a configured provider keeps its visible
error and marks retained data as stale. The mobile popover
makes at most one refresh attempt per opening, so a failed first load cannot
create a retry loop.

`useSmallModelStore` derives background generation availability from the
canonical workspace model catalog and effective profile Small Model override.
It is cached for a minute by runtime, directory, workspace, and the selected
provider/model; concurrent readers share one discovery. Explicit prepared
utility scopes outrank composer selection. Configuration changes and runtime
switches invalidate answers, and generation guards reject requests completed
after invalidation (including switching away and back). Failed discovery keeps
the prior authoritative answer instead of claiming the model disappeared.
`hooks/useSmallModelAvailability` subscribes to composer provider/model changes
for open controls; prepared target controls stay pinned to their own selection.
Notes and spoken summaries keep their original text on generation failure;
`lib/smallModelRequest.ts` returns canonical completion results, never legacy
HTTP compatibility payloads. The [Small Model owner](../../../web/server/lib/small-model/DOCUMENTATION.md)
documents canonical selection, cancellation, and retained surface behavior.

### UI state stores

Sidebar visibility and its persisted width are independent. Opening or closing
the sidebar never writes a width; only resizing changes the saved choice.
The initial width is separate from the component's minimum resize width.

`useCommitSelectionStore.ts` shares the selected commit between desktop/mobile
Changes and walkthrough. Choices are session-only and keyed by runtime, directory, and
checked-out branch, with at most 100 remembered choices. The picker history
belongs to `useCommitComparison`, loads only while Commit mode is active, and
is limited to the latest 50 commits. History failure stays distinct from an
empty list; stale directory/runtime requests cannot replace current history or
selection. A refreshed list preserves an explicit selection even when newer
commits have pushed it beyond the latest 50.

`hooks/useGitComparison.ts` owns the local file-list state used by desktop and
mobile comparisons. Its key contains runtime, directory, and the complete
branch/commit/PR source. A source change hides the old list immediately; failed
reads remain errors, and manual retries cannot publish into a superseded scope.
The hook also resolves per-file patch requests, including a commit rename's
previous path. Views own their lazy patch caches through `useRangeKeyedCache`.
Mobile requests only the active detail path and suspends reads while its
keep-alive workspace pane is hidden.

`usePullRequestSelectionStore.ts` shares session-only PR choices across desktop,
mobile Changes and walkthrough, keyed by runtime, directory, checked-out branch
and full bound read context, so a rebind or account change starts without a choice. Explicit selection bounds remembered choices to 100 entries. A choice
contains the PR number and its repository, so fork and upstream PRs with equal
numbers remain distinct. `usePullRequestComparison` owns the searchable,
paginated list while PR mode is active and reads it through
`SourceControlAPI.changeRequestsList` with the bound provider context. The shared
status store, asked through that same context, supplies the initial choice,
independently of list pagination. An absent match requires selection. External walkthrough handoffs
apply once, and later picker changes
remain authoritative when a retained panel becomes visible again.

Examples:

- `useUIStore.ts`
- `useDirectoryStore.ts`
- `useUpdateStore.ts`

These stores coordinate visible app state, navigation, selected context-panel tabs, dialogs, and lightweight feature flags. Plan surfaces no longer sit behind a feature flag: `useFeatureFlagsStore` was deleted, and the rail and shortcuts treat a session's plan as available whenever it has one. `useUIStore.activeSurface` selects the primary mobile view and the few desktop views that are promoted out of the context panel. It is not a desktop tab selection. A browser tab opened by an agent (`openAgentBrowserTab`) is created in the calling session's directory and persists that session as `ownerSessionId`; tabs the user opens, and tabs saved before owners existed, have none. Agent browser actions use it to keep sessions out of each other's tabs (`packages/web/server/lib/browser-control/DOCUMENTATION.md`). Opening a new browser tab with an address (`openContextPreview`, `openContextBrowser`, `openAgentBrowserTab`) notes it, keyed by directory and tab id, in the session-only set in `lib/browser/devServerWait.ts`; the tab's first mount reads and forgets it. Only a noted tab waits for its dev server on the first load. A tab restored from saved state, or remounted later, loads once and shows the failure. When those openers hit a tab that already exists, they send it a session-only load request instead. A mounted tab that shows a failure, or has not shown a page yet, loads the address the way a typed one loads, wait included, so a failure from launch does not stay up once a project action starts the server; a tab showing a working page ignores the request and is only focused, keeping what the person had on it.

Context-panel session chats render in this app as a chat column pinned to
their session (`ChatView` `pinnedSession`, see the sync documentation's
*Pinned chat columns*). Only the active chat tab is mounted while the panel is
open; switching tabs opens the other session like a session switch.

`useDirectoryStore.ts` resolves the home directory when the module loads and
again on every runtime switch; only the newest resolution commits. On a
browser's first visit to a server with a UI password, the page-load attempt
runs before login, every source answers 401, and the home falls back to `/`
with `isHomeReady` false. After authentication the session gate calls
`ensureHomeDirectoryResolved` and keeps the app unmounted until it settles or
10 seconds pass, so the app starts in the real home rather than `/`, where a
new chat cannot even be created. A resolution still in flight is awaited, not
replaced. If the server still cannot name the home, the app starts in `/` as it
did before. A home that is already known, from storage or the desktop shell,
shows the app at once when a last directory is stored.

When no last directory is stored, no project is open, and the app works in the
managed chats root (`noProjectDirectory`), where a chat draft works anyway.
Every OpenCode read names the app's directory, and with the home there OpenCode
started a location over the whole home folder, file watcher and MCP servers
included. Until the server names the chats root the directory is empty: the
store sets no client directory, `isHomeReady` stays false and the session gate
keeps the app unmounted, because the home resolution waits for the chats root
too. Without a chats root the home stays the directory, still not ready, so a
server that answered 401 before login is asked again after it; the home is
the lasting answer only when the server cannot name the chats root after that.
The chats root comes from the
server's answer itself (`resolveChatsRootDirectory`): the cache behind
`getChatsRoot` is keyed by the runtime key at request time, which can still
change while the page starts.

That fallback is not saved as the last directory, locally or in the server
settings. Removing the last project also goes there
(`goToNoProjectDirectory`) and forgets the stored last directory: it is removed
locally and sent to the server as `''`. The server adds a stored last directory
as a project when the list is empty and warms it on every start, so either path
used to put the home, or the project just removed, back in the sidebar and
start OpenCode there on every launch.

Nothing about directories is carried from one host to another (the desktop
host switcher, a mobile instance switch). Three rules hold that:

- The home lookup for a switch starts after every subscriber of the
  endpoint-changed event has run. One of them rebinds the client; a lookup
  started earlier still reaches the previous host and takes its home for the
  new one's.
- After a switch, only the host's own answer names the home. System info (which
  derives a home from the stored last directory), the desktop shell's home, and
  the stored home all describe the host the window booted on, so they are used
  at boot only. A host that does not answer (401 before login) leaves the home
  unknown, and the post-login resolution above names it.
- `session-ui-store` restores the directory it remembers for the host being
  entered. When it remembers none and the switch comes from another real host,
  `resetForRuntimeSwitch` forgets the directory: it is unknown (`/`,
  `isHomeReady` false, no client directory; `isDirectoryUnknown`) until the home
  resolves, and `synchronizeHomeDirectory` then adopts that host's
  no-project directory whatever is stored. The reset writes nothing, so the previous host's stored last
  directory survives for its next start. Coming from no host (a cold launch
  that connects through a switch) the directory the window started with stays.
  Leaving a host records its directory unless it is unknown; a key that names
  no host (disconnected) records none. A host whose home lookup failed still
  has a directory, and it is recorded.

### Session / project coordination stores

`useMultiRunStore` creates ID-bound multi-run members. Runs are projected from
the session lists (`lib/multirun/runs.ts`), not kept in a store of their own.
Membership, fork handling, fusion and legacy compatibility are owned by
`lib/multirun/DOCUMENTATION.md`.

`useProjectsStore.hasServerSnapshot` distinguishes a server-confirmed project list from persisted startup hints; `serverSnapshotFailed` records a failed settings sync without clearing the last confirmed list. Successful settings adoption clears that failure even for an unchanged list. Runtime switching clears both flags. Extension project subscriptions consume these flags and project records without changing active selection.

Project parsing, project selection, directory navigation, mobile session paths, and the SDK adapter share `lib/pathNormalization.ts` for request paths. Tilde expansion happens before normalization. Windows drive roots retain their slash, and parent navigation stops at drive and UNC share roots. Selecting a spelling variant of the current directory preserves history and its forward entries. Bare drive-relative paths such as `C:` stay distinct from `C:/`; normalization does not guess their filesystem target.

Examples:

- `useProjectsStore.ts`
- `useGlobalSessionsStore.ts`
- `useSessionFoldersStore.ts`
- `useProjectContextStore.ts`
- `messageQueueStore.ts`
- `useRoutingStore.ts`

These stores coordinate persistent project/session metadata across multiple views.

`useProjectContextStore.ts` caches server-owned project notes, todos, and plan links, keyed by the path-derived project id. It replaced a pair of `window` CustomEvents that made every mounted notes panel re-read the whole project config. Writes are optimistic and roll back on failure; they are serialized per project, because the server's own store does a read-modify-write and two concurrent saves would otherwise race it. A load captures per-field mutation revisions and preserves fields changed by a newer write, even when that write finishes before the response arrives. A failed load sets `error` and preserves the cached snapshot. Note and plan creation are deliberately not optimistic, since ids and timestamps are assigned by the server. Notes, todos, and plans are written through separate routes and tracked by separate in-flight flags, so a todo toggle cannot clobber a note edit in the same window. Pinned notes and plans are assembled into a synthetic context part by `lib/projectContextPinning.ts` at send time; that module tracks per-session what it already sent so an unchanged pinned set is not re-sent every turn.

Ordinary loads still reuse a loaded entry. Visible-owner synchronization is owned by `lib/projectContextSync.ts`, as described in the panel's `DOCUMENTATION.md`. Forced loads wait for admitted local writes, so a notification sent before this client's save response cannot lose a peer change behind an in-flight flag. A write still pending when a forced read returns earns another read after it settles, including after rollback. Only a resolved write advances its field revision; a rejected attempt cannot hide authoritative peer data. Concurrent loads share one promise; refresh demand received during a read earns one trailing authoritative read. Runtime reset retires those promises and their generation, so an older success or failure cannot populate or alter a same-id entry on the new host.

`useRoutingStore.ts` projects the server's Jev routing state (whether the Auto
model may be offered, the config Settings → Routing edits, the last decision
per session, permissions the safety net is holding). Nothing is persisted; a
failed read keeps what was known and records `loadError` instead of reading as
"routing is off". See `packages/web/server/lib/routing/DOCUMENTATION.md`.

`messageQueueStore.ts` projects the server-owned queue on web/PWA, Electron,
hosted mobile, and Capacitor. The server delivers it independently of the UI;
the store projects authoritative snapshots and revisioned session updates.
Scheduled queue items also retain their `scheduledTask` provenance. An inherited
scheduled item has no pinned send config; ordinary items keep their captured
provider and model. Both appear in the same queue. Scheduled items allow reorder
and removal, but not editing or manual send. Bulk take leaves them queued.
`sync/message-queue-sync.ts` receives queue events through the shared control SSE
stream at `/api/openchamber/events`, including while OpenCode uses SSE fallback.
It adds no poller or per-session connection. Either stream reconnecting requests
`resync()`, independently of directory-bootstrap suppression.

Hydration and recovery share one in-flight request per runtime. A recovery edge
during its snapshot read earns one trailing read; legacy uploads are attempted
once per runtime rather than repeated on reconnect or snapshot failure. Snapshot
reads have a 15-second deadline. Failure preserves the projection and runtime
switches reject stale completions. Full-snapshot revisions also cover omitted
sessions, so a delayed mutation response cannot resurrect a cleared queue;
session events newer than that snapshot survive reconciliation.

Mutations are optimistic and then settled on the server's copy; failed
round-trips re-read instead of guessing. Empty legacy events without a directory
clear all projections of their session in that runtime. Projection items carry
attachment metadata only, so `popToInput()` and `takeForSend()` asynchronously
remove the message on the server and retrieve its complete captured payload.

`lib/messages/queuedMessagePreview.ts` derives the queue row from typed text,
then attached comments/context, then the first filename. The store sends a
bounded `contextPreview` with the captured item so server projections can show
context-only messages without carrying full quotes or diffs. Preview text is
display-only; editing and delivery use the original content and captured context.

A queued message is captured whole, so whoever delivers it sends exactly what the composer would have: `text` (the content with its agent mention stripped and `@file` mentions already resolved into `attachments`), `agentMention`, and `context` — every chip the composer had attached (inline comments, terminal selections, browser annotations, PR comments/checks, quotes, linked issue/PR/Linear references, pending synthetic parts) plus the skill instruction derived from the text. `QueuedContextPart` distinguishes attached items (restored to the chips when the message is edited) from derived instructions (re-derived on send, never restored) and from synthetic parts other surfaces handed the composer (restored as pending). Context is captured by `buildComposerContext` and delivered by `queuedContextToParts` (`components/chat/composer/submit/buildOutgoingMessage.ts`), the same functions the composer uses for its own send. Nothing is re-resolved at delivery: the server has no agent list, no confirmed mentions, and no draft store. Messages a previous build left in this browser are uploaded once on the first hydration of a runtime and then dropped from persistence for that runtime (`partialize` skips server-owned runtime keys). `useMessageQueueHoldSync` tells the server to hold a session's queue while a UI-driven auto-review run is going.

`sendingIds` mirrors the server's in-flight item and is not persisted. `clearQueue()` retains in-flight entries while clearing pending items; completion or recovery reconciles them against the server. Runtime switches retire the previous server projection, and reconnect hydration restores the authoritative queue.

`useGlobalSessionsStore.ts` owns cold/global active and archived coverage using native `Session` DTOs from `@openchamber/agent-contract`. Arrays, the `sessionId` entity map, native `parentSessionId` hierarchy, and directory indexes commit together. Direct mutations update only affected hierarchy/directory buckets; metadata-only changes preserve structural references. This cache complements directory sync stores; live status and message ownership remain in sync.

Canonical session discovery lists roots only. Global loads and directory refreshes discover active roots' children through bounded `listSubagents(rootSessionId)` reads. Child rows inherit workspace routing and stable root timestamps/counters, use the subagent role as their title, and map running activity to a stable non-null run marker. This projection is not a child snapshot or journal cursor. Failed child reads preserve known children; directory refresh may remove an omitted child only after a successful list for its parent. Runtime generations reject late child responses. Opening a known child uses history only, without snapshot, metadata, queue, or journal requests.

Session ordering belongs to `sync/session-ordering.ts`, not the global array order. Surfaces use its shared comparator with native `createdAt`/`updatedAt` fallbacks.

Global refresh rules:

- `canonicalClient.listSessions(workspaceId?)` returns native records and explicit discovery `errors`; the store does not recreate SDK paging or sanitize records into legacy shapes. Global discovery and native command loads (including workspace resolution) use `STARTUP_RETRY` for transient Host/Agent Service warmup failures. The bounded policy preserves non-retryable and exhausted failures instead of publishing empty success; runtime generations retire pending retries. Session workspace binding starts only after discovery answers. Native `archivedAt` presence distinguishes archived from active sessions. Restores omit the field; zero is a valid timestamp, not an unarchive sentinel. Archive/restore actions remain Host metadata operations through the canonical client and the retained `/api/openchamber` routes.
- Global discovery also retries successful HTTP 200 pages containing `SERVICE_UNAVAILABLE` scope errors within the same `STARTUP_RETRY` budget as thrown failures. Each page reconciles complete scopes immediately and retains failed scopes' records. While retrying, `status` remains `loading`, initial completeness is not granted, and only non-transient errors enter `discoveryErrors`. The final page publishes remaining errors, including exhausted transient scopes. The code-only discovery error contract has no per-entry retryable flag; Host partial-result semantics are unchanged.
- `hasLoaded` means global discovery finished its bounded attempt sequence with server session data in the current runtime. Once established it survives background loading/failure until runtime reset. `status` describes the global store state: settled scoped per-workspace discovery errors populate `discoveryErrors` and degrade only their respective workspace groups in the sidebar without poisoning the global status to `error`, so healthy siblings remain `ready`. Transport-level or whole-store failures transition `status` to `error`.
- Discovery errors identify a native `sessionId` or `workspaceId`. Failed entities/scopes retain their prior records; healthy siblings, including successful empty scopes, reconcile independently. An uncached failed identity remains partial discovery but never blocks unrelated missing records from reconciling; the canonical API has no source-wide error sentinels.
- A global head refresh replaces stale root-listing errors even when session records are unchanged. Successful workspace listings from directory refresh or SyncProvider clear only that workspace's root-listing errors and known session errors through `clearWorkspaceDiscoveryErrors`; unrelated workspace failures and global completeness remain untouched. Failed `listSubagents` reads additionally populate runtime-local `failedChildDiscoveryParents`: root-only listings cannot clear these parent errors. A head poll with pending child failures delegates to the existing full discovery path to retry the child reads. Full and directory discovery retire a parent failure only after a successful child list (including empty); failed retries preserve known children and their errors. Runtime reset clears the pending set and rejects stale responses.
- `globalSessions.ts` owns runtime-local workspace-directory bindings. `registerWorkspaceDirectory(workspaceId, directory)` accepts the existing directory passed to successful `resolveWorkspace(directory)` admission; `resolveWorkspaceDirectory` returns that path or `null`. Global loads admit configured project paths, known worktree paths, directory history/current-directory hints, and the managed-chat root. Unknown records stay unresolved. `displayPath`, names, and legacy `path_*` project identifiers never become Host filesystem paths or native `pro_*` IDs. Adopting a binding rebuilds directory indexes once, not at streaming frequency.
- Directory refresh resolves each requested directory to its native workspace first, then lists that workspace. Both operations share a two-request cap across callers and prioritize the current directory. A failed directory cannot clear its records or block successful siblings; per-session failures inside a readable workspace preserve only the affected owners.
- Full and directory refreshes capture a mutation revision and overlay newer creates, metadata updates, workspace moves, archive/restore changes, and deletions at commit. No-op deletions still record tombstones. Methods return reconciled committed records, not stale raw responses. Host metadata and archive revisions merge independently as decimal uint64 strings without precision-losing numeric conversion.
- Live sessions offered as fallback fill unlisted active gaps only: they never override a known active/archived record or reinterpret an archived record as active.
- Startup snapshots are schema-checked, runtime-keyed native sessions, never proof of current existence/activity. The global snapshot keeps bounded recent active sessions plus ancestors; managed chats use their explicit persistence scope. The store classifies only known workspace-directory bindings before writing and retains unknown saved managed-chat owners in that scope. Before complete discovery, persisted snapshots retain saved records plus explicit local mutations rather than being overwritten by an incomplete list.
- Runtime reset invalidates old global/directory loads, clears workspace-directory bindings, resets completeness, and reads only the incoming runtime's non-authoritative seed. Late work cannot restore old sessions or old path bindings, including an A→B→A endpoint transition.

The same shared client/cache runs on web/PWA and Electron against the active Host, and on hosted mobile/Capacitor through shared authenticated runtime transport. No platform-local execution or new native privilege is introduced. VS Code is retired; these native global stores add no support for it.

Permission auto-accept policy is authoritative in the active OhPiChamber server. Owner snapshots carry a monotonic revision; the UI rejects lower revisions and any hydration or mutation completion captured before a runtime reset. Persisted UI policy is not live authority. The version-2 store retains an old unscoped policy only as a one-runtime legacy migration candidate, then removes it after successful migration.

Shared safe storage treats durable failures per key. A quota or access failure creates an ephemeral override or tombstone for that key without disabling reads and writes for unrelated keys; later writes retry the durable backend. Deferred adapters retain failed operations for a later flush, and malformed Zustand JSON is removed and treated as missing so hydration can recover.

Settings fields are declared once in the settings registry (`packages/ui/src/lib/settings/DOCUMENTATION.md`); the sync described here iterates that registry rather than naming keys. Project and UI settings use successful settings synchronization as authority for the fields the snapshot supplies. A field the server omits is "unset", not "reset": the window keeps whatever value it already holds and nothing is written back — a bootstrap never seeds the server from local state. The one exception is the project list, whose omission still means an empty list (`useProjectsStore`). Theme fields follow the same keep-what-you-hold rule and additionally adopt only on bootstrap-grade syncs; settings save echoes never adopt a theme. A write reaches the server only because a person changed something in this window: the theme context writes only from its user-facing setters (never on mount or on adoption), and the store-subscribing auto-savers (`appearanceAutoSave`, `modelPrefsAutoSave`) treat changes made while `isApplyingServerSettings()` is true as a new baseline rather than a change to send. `updateDesktopSettings` additionally drops any key whose value equals the last value the server was seen holding for this runtime, so an echo or a toggle back to the server's value inside the debounce window produces no request. Device-scoped registry fields (window controls, mobile keyboard mode, input bar offset) never leave the install: they are dropped from writes, persisted only locally, and adopted from a pre-split server document once per runtime as a seed. Per-surface profile fields arrive already resolved for this client's surface kind (`lib/settings/surface.ts`); the stores never see another kind's value. Transport or settings-load failure dispatches no synchronization event and preserves current state. Settings save responses are partial patches and must not clear unrelated in-memory preferences or local mirrors. Debounced settings writes flush best-effort on page hide, document hidden, app freeze, and unload — canceling the pending timer so the write happens exactly once — because a write lost inside the debounce window lets the stale server snapshot override the change on next startup; a hard process kill can still lose the in-flight request. The unload flush uses `keepalive: true` on the HTTP write, because a plain fetch started from `pagehide`/`beforeunload` is cancelled with the document; `navigator.sendBeacon` is not used, as it cannot carry the runtime bearer header. On Capacitor neither `pagehide` nor `beforeunload` fires when the OS suspends the app, so the flush also runs on `App.appStateChange` going inactive.

Session defaults belong to the active runtime. Switching instances clears the in-memory defaults and directory config snapshots; persisted config hydrates only when its recorded runtime matches. Legacy snapshots without an owner are refetched. Initialization, health checks, and directory activation reject obsolete continuations, including A to B to A switches.

Persisted config (`config-store`) holds selections only. The provider and agent catalogs and their `*Loaded` flags stay in memory, both top level and per directory. Persisting only selections keeps localStorage writes bounded. A cold start therefore paints the pickers once `initializeApp` / `activateDirectory` load the catalogs; an empty hydrated snapshot reports not-loaded, never an authoritative empty list. The synchronous mirror fills that gap: `configCatalogCache.readLocalCatalogSnapshot` is read at module scope for the boot directory key, and again inside `persist.merge` for the *persisted* `activeDirectoryKey` when that key differs from the boot key and the merged state carries no live or persisted catalog. The merge path is validated against the record's own runtime and directory identity and publishes providers plus `providersLoaded: true` in the first merged state, so the model trigger renders the persisted model before any `/models` or `/providers` response; a present catalog, even an empty one, always wins and the live answer replaces the mirror. Boot-key providers are dropped when the persisted scope differs, because they describe another directory. The last live catalogs are kept instead in IndexedDB (`configCatalogCache.ts`, which fires no `StorageEvent`), keyed by runtime and config directory, bounded to 24 directories, with a schema version; a record that fails its shape check or names another schema is deleted on read. Records hold only what the pickers and composer show, built field by field from an allowlist and read through strict schemas: provider, model and variant `settings`/`headers`/`body`, an agent's request (apart from its numeric `temperature`/`topP`) and its system prompt are never written, because they carry API keys and authorization headers. At startup and on a directory switch the cached catalog fills a directory whose live catalog has not loaded, without setting `*Loaded`: the composer pickers render from it, Settings pickers and recovery loops keep waiting for a live load. Only live loads write the cache, 3 s after they apply and only when no catalog event for that directory arrived since the load began (the re-read the event triggers writes instead), so a starting location's partial first answer is never stored; an empty answer is written only by a re-read. A location OpenCode is still starting answers empty, then partial, so the first live answer for a directory shown from the cache is held back when it lists fewer models or agents than the cache, and re-read once after 2.5 s; that re-read replaces the cache whatever it holds. Older blobs that still carry catalogs hydrate as before. The slim format is persist version 1: a build without it has no `migrate` for version 1 and skips the blob, so it gets a cold start instead of reading `snapshot.agents` on a snapshot that has none. The persist middleware writes after every `set()`, including one whose updater returns the same state, so selection setters (`setProvider`, `setModel`, `setAgent` and the model it resolves) check for an unchanged selection before calling `set()`.

Configured project and global model identifiers remain selected through provider discovery gaps. A draft can display its configured identifier before model metadata arrives. Catalog absence never selects Big Pickle in its place. An unknown settings document defers fallback selection; a successful document with no configured model permits the normal OpenCode fallback. Before that fallback comes the model last picked in a chat composer (`lastSelectedModel`, a synced profile setting written only by the composer's model picker and the favorite-model shortcuts, never by other model pickers or session restores), so a new session starts where the user last chose when nothing configured names a model. Like a configured identifier it survives catalog gaps; a model hidden since is skipped, and so is an Auto pick the server cannot honour. The fallback itself (Big Pickle, else the first model) skips models hidden in the picker, on the client and in the server's session routes; a configured project, settings, agent, or OpenCode model is honoured even when hidden, and with every model hidden the unfiltered pick stands. Saved thinking preferences stay in settings; an OpenCode config `model` carries its effort as a `#variant` suffix, and a discovered model's supported variants determine the effective thinking level.

### Why a removed provider's model is skipped, not cleared

A configured model whose provider is gone is skipped each time the cascade runs, and the setting stays as it is. Clearing it when the provider is disconnected was the alternative. That only catches a removal made through OhPiChamber, misses `opencode auth logout`, a removed environment key or a config edit, and loses the choice for someone who disconnects to sign in again. Skipping needs an authoritative catalog: OpenCode 2.2 answers a directory's first provider and model read only after its plugins activate (a 503 after 5 s, never a partial list), so a live load is complete. Before one arrives, or when it is empty, nothing counts as missing, which keeps the protection against starting a session on Big Pickle while providers load. Settings shows a warning under a model new sessions skip (`selectIsModelMissingFromCatalog`). A model the user picked by hand is never replaced, even once its provider is gone; the composer marks it with the warning icon and says why in its tooltip, the way it marks a missing agent, and the send is left to fail with OpenCode's error.

Project defaults include `defaultAgent`, `defaultModel`, and `defaultVariant`.
The project agent precedes the global agent, then OpenCode's default and the
primary-agent fallback. Settings parsers retain all three fields on every read
and save echo. The project editor loads agents, models, and effort options for
the edited project without changing the active chat's configuration.
Manual model and effort selections survive catalog gaps too. A missing catalog
entry is not a request to replace a user's choice. Directory snapshots retain
the effort override separately from its inherited value, including explicit
`Default`. Fresh drafts inherit their project's effort before the global one.

The agent and the model carry separate provenance. `setAgent` records the agent
as picked (`agentSelectionSource: 'manual'`) and leaves `selectionSource` to
describe the model alone, so an agent's pinned model stays inherited and is
never saved as a per-agent session override. Every path that re-resolves
defaults (`loadAgents`, the config-defaults reconcile, `loadSessionDefaults`,
the draft re-apply after activation, the Defaults settings page) keeps a picked
agent together with the model `setAgent` resolved for it. Only
`applyDefaultModelAgentSelection` and activating a directory with no snapshot
clear the pick. An effort picked in a draft is a choice of its own: those same
paths leave the draft alone while `currentVariantSelection.override` is set.

An open session's agent goes both ways. A pick applies to the session when the
next message is sent (`switchAgent` before the prompt). Every switch, whoever
made it (this composer, another client, a plugin), lands on OpenCode's session
record through `session.agent.selected`, and `ModelControls` follows the
record through `useSelectionStore.followSessionAgent`. That store remembers,
per session and persisted, the record agent the composer last followed: a
record agent it has not followed yet is a newer switch and replaces the pick,
an unchanged record leaves a pick made after it in place across session
switches and reloads. Following moves the agent only (`setAgent(name, {
keepModel: true })`): the session keeps running on its own model, so neither
the agent's pinned nor its remembered model is applied, and Auto stays.

The model follows the same rule through `isSessionModelSwitched` /
`markSessionModelFollowed`, keyed `provider/model#variant`. A record model the
composer has not reconciled with yet outranks a manual model and its effort
(an effort only when the record carries one); with nothing reconciled yet,
a manual model that disagrees with the record keeps winning, as before. A
saved Auto is never replaced: the router itself switches the session's model
every turn, so those switches are only recorded as reconciled.

Project-default editing is available in desktop web and Electron. Hosted mobile
and Capacitor consume those defaults through the shared composer but have no
project-default editor.

`loadSessionDefaults` publishes preferences independently of OpenCode health and catalog requests. Cold directory activation starts providers and agents concurrently. Agent selection uses the latest committed preferences without waiting for providers or issuing a second settings read. Explicit preference edits update a draft immediately, and late settings responses preserve newer edits. Agent-pinned and OpenCode-config model identifiers can be selected before their catalog entries arrive.

Provider and agent catalogs carry separate successful-load flags in directory snapshots, including successful empty responses. Pickers become interactive when their own catalog is available. A known selected identifier can be displayed earlier. The composer keeps a loading label until it knows the choice or has the inputs to establish an empty selection; providers arriving alone cannot reveal an empty agent picker.

Provider reads share one request per directory, both in `loadProviders` and in the client's `getProvidersForConfig`. A read prompted by a change (a catalog event, a provider mutation) passes `fresh`: it never joins a request already in flight, because that one can carry the catalog from before the change, say a worktree opened before OpenCode registered its plugin providers. It waits that request out and reads again. When every attempt for the active directory fails and it has never loaded, one delayed retry follows; without it nothing re-reads that directory until something unrelated, such as Settings → Providers, asks.

OpenCode 2 does not wait for a directory to start before answering: the first provider read of a cold directory returns an empty or partial list, and the plugin providers arrive later with `provider.updated` for that directory. The catalog refresh re-reads only the active directory, so every catalog event also calls `markConfigCatalogStale(kind, directory)`, which takes that directory's providers or agents out of the 30-second freshness window (`null`, for a server-wide event such as a credential change, takes out all of them). Switching back to a worktree left mid-start therefore re-reads it instead of keeping the incomplete snapshot. Meanwhile the composer labels the selected model, its efforts and the agent with `selectKnownCatalogModel` / `selectKnownAgent`, which fall back to any other directory's snapshot, so a cold directory shows the name it already knows rather than a raw id or "Select agent". That fallback is display only: selection, effort resolution and validation read the active catalog, and a model or agent no catalog knows is shown as before.

An effort picked in a project draft travels to another worktree of the same project (`activateDirectory` with `preserveManualModel`), also while the model is still the automatic one. `currentVariant` is what a send carries, so every loader that keeps a pick in `currentVariantSelection` also writes that pick to `currentVariant` (`variantAfterResolve`) instead of the default it resolved for the model; otherwise the picker showed the pick and the send used the default. Marks carry a revision, and a load that began before the latest mark for its directory does not make that directory fresh again.

Settings reads retain overlapping local mutations until the read settles, including writes that finish before the older GET returns and toggles that cancel a pending write. Both the returned document and GET cache use that reconciled result. An older GET cannot replace newer server-value knowledge used to deduplicate writes.

Project ordering defaults to manual. Session display persistence v3 migrates the previously shipped `recent` project order to `manual` while preserving every other explicit sort mode.

Session display persistence keeps a hydrated local cache for the independent all-projects/single-project mode, session grouping, project sort, and Recent preference; successful server settings snapshots are authoritative for the fields they carry, and a field the server omits leaves the local cache untouched (it is not seeded back to the server). The last confirmed or manually selected project and sticky-header preference stay local to the device. Draft target changes do not write the picker selection; materialized session navigation updates it from the resolved project directory.

Session folders persist in runtime-specific v2 browser keys without silently evicting older runtime namespaces. Runtime switch, page hide, app freeze, and unload synchronously flush the pending browser snapshot before lifecycle suspension or namespace replacement. A runtime switch then cancels stale old-runtime disk work and starts generation-owned disk hydration. Missing or malformed server files are not authoritative empty snapshots; disk data may replace browser state only when it carries a real revision and no newer local folder mutation occurred. Server writes are serialized and merged per scope instead of replacing the file: a device that never saw a scope or folder cannot erase it, the incoming copy wins per folder id, and the writer's collapse state wins for the folders it sends. Because absence is not deletion, a deleted folder travels as a tombstone (`deletedFolderIds`, folder id to deletion time). The client keeps unacknowledged tombstones in runtime-scoped storage until a write succeeds, the server keeps them for 30 days and drops a tombstoned id even when a stale device sends it again, and hydration removes tombstoned folders from the browser copy whichever side is newer. File-search cache and in-flight keys include runtime plus directory and are cleared on endpoint reset.

Persisted session todos use a bounded composite key of runtime, normalized directory, and session ID. Ambiguous legacy todo entries are discarded rather than claimed by whichever runtime starts first. Authoritative deletion uses an explicit runtime identity, and session-folder deletion scans every scope in the active runtime so archived assignments cannot survive after their session is gone.

Chat composer drafts, confirmed mentions, inline-comment drafts, and pinned sessions use the same runtime/directory/session ownership rule. Chat drafts use a bounded shared envelope and notify mounted composers when authoritative deletion clears their identity, preventing unmount autosave from resurrecting deleted text. Inline drafts enforce per-session, global-session, and serialized-byte bounds. Pins retain every valid composite key across runtimes without silent age/count eviction and are never pruned from the first startup list. Confirmed local deletion and routed deletion events clear immediately; after an authoritative baseline exists, a later complete omission also cleans persisted state. Ambiguous session-only legacy drafts and pins are not claimed.

Input history keeps both runtime-wide and runtime/directory/session buckets in one bounded browser-storage envelope. The per-bucket cap is configurable from 1 through 100 and defaults to 40. Recall defaults to the current session's bucket merged with the visible transcript's user prompts; the runtime-wide bucket is opt-in through the Chat setting. Lowering the limit trims older entries from every bucket at once and cannot restore what it discards. Every scope change, limit change, append, and session cleanup rereads the latest durable envelope before applying its mutation, so a stale tab preserves history written by another tab. A failed write retains bounded before/after snapshots. The next mutation applies that local delta to the latest durable data, preserving pending appends and session deletions together with unrelated changes from other tabs. A successful durable write clears the pending delta.

Server-owned queue acceptance records the original prompt and restorable attachments against its captured runtime/directory/session identity. Rejection records nothing. Automatic delivery and manual take do not record the accepted item again.

Composer draft edits remain immediate in memory and use a trailing durable-write debounce. Pending text and confirmed mentions flush synchronously when the document becomes hidden, freezes, receives `pagehide`, switches identity, or unmounts; authoritative deletion cancels pending work before any lifecycle flush can run. The shared chat-draft envelope reuses its parsed snapshot until the storage value changes. Inline-comment draft byte accounting indexes serialized buckets and recalculates only the changed session bucket during normal edits; deferred storage still performs the final full-envelope serialization and lifecycle flush.

### `useTerminalStore.ts`

`useTerminalStore` owns terminal tab arrangement per directory plus PTY scrollback.

Scrollback is deliberately **not** stored on the tab. `buffers` is a separate map keyed by
directory and tab id, and `getBuffer()` returns a shared frozen empty buffer for tabs that
have produced no output. PTY output arrives at streaming frequency, so keeping it inside
`sessions` made every output chunk allocate a new tab, a new directory entry and a new
`sessions` map. That invalidated every tab-strip subscription, re-ran the project-action
run monitor, and made Zustand persist rewrite the session-storage snapshot per chunk.

Invariants to preserve when editing:

- Directory keys come from `normalizeTerminalDirectory` (`lib/pathNormalization.ts`) and
  nothing else. Server `cwd` strings, sidebar project paths and the panel's own directory
  all pass through it, so a folder has exactly one entry on every platform. Read `sessions`
  through `getDirectoryState`, never by indexing the map with a path normalized elsewhere.
- Output actions (`appendToBuffer`, `replaceBuffer`) must leave `sessions` referentially
  unchanged; only `buffers` and `nextChunkId` may change.
- Buffer entries are owned by their tab. `closeTab`, `removeDirectory`, `clearAll`, and
  rebinding a tab to a different terminal session must drop the entry.
- Output for an unknown tab is ignored rather than creating an orphan buffer.
- Only `sessions` and `nextTabId` are persisted. `partialize` reuses its previous
  projection while both are referentially unchanged, and the storage adapter skips a write
  for an unchanged projection, so streaming output performs no persistence work.
- Consumers that react to output must subscribe to `buffers`, not `sessions`.
- Action tab IDs remain stable while each command execution receives a fresh terminal ID.
  Starting or adopting a different execution resets its buffer sequence and preview together;
  reconnecting to the same execution and observing its exit preserve scrollback.
- Reconciliation selects one record per action before updating tabs. A running execution wins
  over retained exited records independently of listing order. An in-progress stop remains
  stopping until the same execution exits or explicit termination failure restores running.
- `terminalSessionObserver` shares one five-second refresh loop per terminal adapter across
  the visible sidebar, headers and panels. The existing empty-cwd listing returns all server
  sessions in one request; directory subscribers receive only their own records. A sidebar
  subscriber reconciles the complete list, including omitted known action directories.
  Focus and online recovery refresh immediately. Hidden/offline clients pause, failed reads
  preserve state, and the last consumer stops the loop. Replaced runtimes cannot publish old
  responses. Mutation revisions are captured for every subscribed scope before the request.
- Passive action adoption may restore output but has no launch-time authority to open browser
  tabs. Preview navigation belongs to the initiating host directory even for a parent action.
- Server session listings capture the directory's per-action mutation revisions when the
  request starts. Coalesced callers share that first snapshot. A response cannot replace or
  remove an action execution mutated after its request began, while a fresh successful empty
  response still clears an omitted run.

## Git / PR Stores

The Git and PR stores are the most important stores to understand before editing this directory.

### `useGitStore.ts`

`useGitStore` is a centralized active-runtime, per-directory Git cache.

Core model:

- active runtime owns one `directories` map keyed by directory
- each directory entry contains:
  - repo detection
  - status
  - branches
  - log
  - identity
  - diff cache
  - per-directory loading flags
  - freshness timestamps

Important properties:

- `directories: Map<string, DirectoryGitState>` is the source of truth
- loading state is per-directory, not global
- `ensureStatus()` and `ensureAll()` are the preferred entry points for consumers
- a non-repository answer is cached for the repository-check window; `recheckRepository()` is the one way past it, for a directory that just became a repository (Initialize Git in the shared not-a-repository state, `views/git/InitializeGitButton.tsx`). It invalidates adapter caches through `notifyGitStatusInvalidated` and forces a fresh probe and status
- in-flight dedupe exists for status and `ensureAll()`; status dedupe is scoped to the per-directory status mutation revision, so a refresh requested after a mutation never joins a pre-mutation in-flight request
- nested repository discovery (`nestedReposByRoot`, `nestedRepoSelection`, `ensureNestedRepos`) is per-root state for roots that are not themselves git repositories; discovery failure is a `null` marker (never a valid empty result), and an in-flight discovery whose runtime switched is discarded at commit time instead of repopulating the cleared map. Selections are persisted per runtime + root, and `useEffectiveGitDirectory(root)` resolves the directory git surfaces operate on (`root` when the root is a repository, the selected nested repository otherwise). A selection whose repository fails its probe is dropped and remembered session-only (`staleClearedSelections`) so auto-select does not re-pick it and loop walk+probe; manual picker picks bypass the memory. `hooks/useNestedGitDirectory.ts` owns the resolution flow (root probe, discovery, auto-select, stale-selection recovery) for every consuming surface (Git tab, diff view, pull-request view, walkthrough view, mobile changes, work-status project readout), and `git/NestedRepoResolutionStates.tsx` renders the shared pending/failed/unsupported/empty states
- worktree bootstrap polling and session/worktree machinery stay keyed on the project root even while a nested repository is selected; only git data and actions follow the selection
- runtime reset replaces all live entries with that runtime's persisted branch seeds and invalidates old completions
- status, branches, log, identity, repository probes, and prefetch diffs commit through runtime and per-channel generations
- status mutations advance a revision so older refreshes cannot undo optimistic or confirmed index changes
- a successful status-affecting git mutation also advances that revision: the HTTP adapter's cache invalidation notifies the store through `lib/gitStatusInvalidation.ts`
- `fetchStatus({ force: true })` and `fetchAll({ force: true })` cross both the store and runtime transport caches; a forced reconciliation must reach the active runtime rather than reuse an unexpired browser status snapshot
- status requests do not start while a managed worktree bootstrap is pending, and a response admitted before bootstrap began is discarded if it completes after the directory enters `pending`; the `--no-checkout` population window is not user working-tree state
- branch persistence is versioned, bounded (50 directories, 8 runtimes) and runtime-scoped: one storage key per runtime and directory plus an index, holding only local branches; earlier layouts are removed unread
- diff data has per-directory and aggregate count/UTF-8-byte limits; oversized single entries are rejected

Diff prefetch admits at most two outstanding transport requests per runtime and directory across overlapping batches. Its 15-second deadline stops waiting for a result; it does not cancel server work. A timed-out request retains its path and concurrency slot until the transport settles, including across cache resets, so later batches cannot repeat it or exceed the limit. Saturated prefetch skips further work instead of queueing retries. Late timed-out results never enter the cache, and successful or rejected transport completion releases capacity. Duplicate or saturated demand does not invalidate a batch already running. The Git view schedules prefetch only while active; explicit file opens remain independent of background prefetch capacity.

`useGitIdentitiesStore.ts` owns the active runtime's author profile inventory, global author summary, default author, and temporary selection. Runtime endpoint reset clears all of them synchronously. Every load and mutation captures the runtime key and store generation before awaiting; profile mutations also carry per-profile generations, so a completion from another runtime or an older same-ID edit cannot publish. Profile responses pass the shared strict public DTO parser and cannot contain legacy authentication fields.

### Source-control stores

`useSourceControlAuthStore`, `useChangeRequestContextStore`, and the transitional `useGitHubPrStatusStore` own provider-neutral source-control state. Bound status keys include runtime, provider instance, immutable account ID, repository ID, binding revision, directory, branch, and primary remote. Context keys include their directory and change-request identity. Despite its transitional name and legacy display aliases, `useGitHubPrStatusStore` performs network reads only through `SourceControlAPI.changeRequestStatus` with an exact `SourceControlReadContext`; it has no ambient `RuntimeAPIs.github` fallback.

Core model:

- each entry stores:
  - current PR status payload
  - loading / error state
  - whether initial status was resolved
  - refresh timestamps
  - watch count
  - runtime params
  - resolved identity

Important properties:

- `ensureEntry()` initializes a key lazily
- `setParams()` attaches runtime context
- parameter changes advance an entry revision; stale queued, successful, and failed requests cannot update a newer authority
- `startWatching()` / `stopWatching()` are for true live PR consumers only. Nothing polls a watched entry: `noteBranchActivity(directory)` (an agent turn finished there) and `noteWindowReturned()` (answers older than `60s`) refresh it, both wired by `lib/trackedItems/interest.ts`
- `refreshTargets()` supports one-shot multi-target bootstrap without turning on live watching
- an entry's open pull or merge request is a tracked item read with the bound account (`getBranchTrackedPull`, `useBranchTrackedPulls`); the server pushes its live state and `applyTrackedPulls` lays it on every entry of that request, skipping entries whose full refresh is newer and leaving semantically unchanged entries untouched.
- PRs, merge requests and issues linked to sessions (GitHub, GitLab, Linear) are not in this store. The server follows them (`packages/web/server/lib/tracked-items/`) and pushes changes over the OhPiChamber event stream; `useTrackedItemsStore` holds what it sent, persisted for 12 h (at most 300 records, re-parsed on hydration, an older answer never replaces a newer one), keyed by runtime and item key. Surfaces declare what they show with `useTrackedItems` (`lib/trackedItems/interest.ts`), which sends the union only when it changes and again after a reconnect, and reads with `useTrackedPullVisualSummaries` / `useTrackedIssueStates` / `useTrackedLinearStates`. Pull and merge request badges go through `getLinkedChangeRequestVisualSummary`, the same colour rule as a branch's PR.
- runtime reset disposes timers, watchers, API references, and request ownership while inert namespaced snapshots remain isolated
- auth and context requests are deduplicated per provider instance and reject completions from an older runtime generation
- context failures preserve the last complete cached result instead of becoming authoritative empty data
- persisted status cache is versioned, TTL-filtered, and bounded for page refresh continuity, not broad background syncing
- status hydration accepts only entries carrying account, repository, and binding-revision authority; legacy entries cannot seed a bound request
- hydration verifies every serialized key authority dimension against the embedded identity; a current-shaped mismatch is discarded rather than re-keyed
- simultaneous bindings for one provider instance retain independent entries; bound selectors require the exact account, repository, revision, directory, branch, and primary remote
- a successful missing or `needs-attention` binding read clears prior status for that directory and invalidates in-flight completion; a failed binding read preserves prior cache
- a closed/merged PR is the branch's history, not live status: it is displayed and persisted, but never treated as authority
- closed/merged associations use the same `5m` discovery cadence as missing PRs so a newer open PR (or authoritative `pr: null`) replaces them without a manual refresh
- hydrate restores a persisted closed/merged PR but resets its `lastDiscoveryPollAt`, so revalidation runs on the first watcher tick after a reload
- a successful refresh that returns `pr: null` replaces any previously cached PR authoritatively; a failed refresh keeps the previous one

`useWalkthroughStore.ts` keys entries, model and language choices, active requests, and progress pollers by runtime plus the full walkthrough target. Working-tree and branch targets need only their Git source. A pull-request target also carries the immutable `SourceControlReadContext` that discovered it, so equal PR numbers under different accounts, repositories, bindings, or provider instances cannot share client state. The client sends that context on every PR walkthrough operation and rejects successful read or generation responses unless they echo the exact authority tuple. Runtime reset aborts active requests, stops pollers, and clears pending entry-point targets before the new endpoint can reuse them.

## Boot hydration and load phases

Every store whose content is the instance's answer (permission policy, Git
identities, quota settings and samples, agent memory, session folders, web
search, MCP, skills and the skills catalog) is registered in
`serverStateBoot.ts`. The registry owns two things the app used to keep by
hand:

- `bootServerStateStores()` runs each hydrator once on every app root (web,
mobile, mini-chat) after the instance reports itself initialised, and again
when the control stream (re)connects. A store is no longer read by whichever
page happened to mount first; the permission policy in particular had no
production reader at all, so a restart with default mode `auto` still showed
`ask` in the composer.
- `resetServerStateStores(runtimeKey)` is what `apps/runtimeEndpointReset.ts`
calls on a runtime switch. A store that projects the instance joins the
registry instead of being added to that function's list, so a switch cannot
leave one behind.

Each store declares a `phase` (`stores/loadPhase.ts`) with the same three
values: `unknown`, `ready` and `error`. `unknown` means the value was never
read and must never be rendered as the answer; `error` means the read failed,
in which case the previous value stays and the surface says it could not load.
Consumers therefore render a neutral affordance while `unknown` rather than
`ask`, `0` or `false`, and a failed read never produces an empty list.
Event-only projections (`useAdvisorStore`, `useCleanseStore`) are reset by the
registry without a hydrator: they have nothing to read until the server
announces something.

`usePermissionStore.getSessionMode` keeps returning a concrete mode for callers
that must act (the composer, review inheritance) by falling back to the
instance's configured `permissionDefaultMode` while the policy is unread;
`getCurrentPermissionMode` returns `null` in that case, and
`resolvePermissionMode` returns `null` instead of inventing `ask`.
`resolvePermissionModeOrDefault` is the variant for callers that need the
configured default. The composer's new-session draft takes that default too.

## Ownership Rules

These rules are important. Breaking them tends to reintroduce idle CPU churn, stale UI, or rerender fanout.

1. No broad `directories` or `entries` subscriptions in normal UI components.
2. No root pollers for Git or PR.
3. No broad idle sweeps across many directories.
4. Prefer store `ensure*` methods over direct runtime API calls from views.
5. Visible consumers should drive refresh. Hidden consumers should not.
6. Header should not depend on PR store.
7. A closed context panel (or hidden git surface) should not create live PR work.
8. File tree Git status should update only when the file tree is visible.
9. Global session refresh must remain bounded and failure-isolated per directory.
10. Global session cache must not drive live activity indicators or message-loading state.

### Configuration stores and the Settings directory

`useAgentsStore`, `useCommandsStore`, `useSkillsStore`, `useMcpConfigStore` and
the provider half of `useConfigStore` describe directory-scoped configuration.
Provider and agent catalogs use the actual worktree directory when selected;
the parent project still supplies its OhPiChamber project defaults.
Two surfaces read them at once: the app (chat, autocompletes, pickers), which
wants the active project, and Settings, whose own project selector may point
somewhere else.

Each of them therefore keeps two things:

- a per-directory map (`agentsByDirectory`, `commandsByDirectory`,
  `skillsByDirectory`, `serversByDirectory`, `directoryScoped`);
- a flat mirror (`agents`, `commands`, `skills`, `mcpServers`, `providers`) that
  tracks the **active** directory only.

`config-store` hydrates provider catalogs only for the matching runtime, and only from blobs written before the selections-only format (persist version 1), which carry no catalogs and are never treated as incompatible. Since 1.x and 2.x used the same unversioned key, a cached list whose models lack 2.x variant arrays is discarded for its directory and marked unloaded; the active mirror is checked separately. Valid 2.x lists, other directories, agents, and saved model and effort selections remain available. A successful provider read replaces the discarded list.

A project whose OpenCode config OpenCode rejects (`ConfigInvalidError` and the
other `Config*Error` names) is recorded in `useConfigStore.projectConfigErrors`,
keyed by config directory, runtime-only. `loadAgents` stops retrying on it and a
successful load clears it. `initializeApp` treats it as that project's failure,
not the app's: startup completes so other projects stay reachable, and
`ProjectConfigErrorToast` shows the file and message while that project is
active.

Any other failed `initializeApp` attempt records `lastInitFailure` (runtime-only,
cleared on success and on runtime switch): which step failed —
`serverUnreachable` (no answer or a gateway error), `agentServiceUnavailable`
(the server answered but the Agent Service is not ready), `loadAgents`, or
`unexpected` — plus the error text when there is one. The startup recovery
screen reads it, so only a real network failure tells the user to check that
the server is running.

#### Native agent profiles and retained Host configuration

`useAgentsStore` owns native workspace agent profiles. Web/PWA, Electron,
hosted mobile and Capacitor all resolve the settings directory with
`CanonicalClient.resolveWorkspace` and read `getAgents(workspaceId)` through
the active Host transport. An unavailable workspace/catalog is a failed read,
not an empty catalog; the previous list remains available and the settings UI
shows the failure. Runtime switches clear catalog revisions and drafts.

The dependency is one-way at the store level: `useConfigStore` imports
`useAgentsStore` and owns the readiness subscription. A small
`agentConfigBridge` module carries the selection reader and readiness listener
registrations, so neither store calls into the other while a module is
evaluating, even though the import graph stays cyclic through
`session-ui-store`.

A retryable read failure during cold start or reconnect is not left as a
permanent `error`: once the config catalog reports `isInitialized` and
`connectionPhase === 'connected'`, the store waits for the canonical Agent
Service readiness probe and retries that same directory at most three times
with short backoff. Success publishes the roster and clears the error; an
exhausted retry keeps the real failure visible. A directory or runtime change
retires the old recovery before another probe or load, request coalescing stays
per directory, and runtime switches clear recovery state. A non-retryable
ProblemDetails is left visible without automatic retry.

Agent create/update/delete use native `Agent` records and catalog
`expectedRevision`. Mutation acknowledgements update the scoped list and its
revision without waiting for a second read. Retired reads cannot resurrect a
deleted agent, and older revisions cannot replace newer state. The page keeps
the revision that hydrated its draft until a successful mutation returns the
next revision, so background refreshes cannot silently authorize a stale edit.
Agent IDs remain stable across rename; duplicate creates a new ID. Native
profiles have no legacy scope, mode, hidden, color, sampling or file metadata.

Native profiles expose `allowedTools` directly; that field is edited through
canonical `updateAgent`. There is no store read or patch for the retired Host
permissions subresource: execution authorization belongs to the native SDK/Host
approval path.

Retained command and MCP configuration still use their Host entity routes.
Command editors read their own stored `…/config` entries rather than resolved
runtime defaults; whole-block PATCH values must preserve untouched keys.
Their legacy/path notes describe existing files, not native agent profiles.
SDK agent visibility helpers live with the retained OpenCode model and are
used only by unmigrated config/chat consumers, not settings agent catalogs.


Thinking variants keep the effective value in `currentVariant` so existing send
paths capture a stable configuration. `currentVariantSelection` says where that
value came from: a string is an effort chosen in the picker or by the shortcut,
`null` is an explicit `Default`, and `undefined` is automatic initialization,
which lets the inherited default apply.

`Default` sends no effort at all. It cannot resolve back to the inherited
default: the settings default would take effect again, and the next assistant
reply echoes that effort back as an explicit choice, so the picker jumps off
`Default` one message after the user chose it. For the same reason the
per-session selection store records an explicit `Default` (as `null`) instead of
clearing the entry — a cleared entry is indistinguishable from never having
chosen, and the settings default wins again on the next agent or session switch.

Only a place where the user chose may write `null`. Restore paths — message
history, a preserved manual override — pass their own "found nothing" through
as `undefined`, because a session whose history carries no effort is not a
session where `Default` was picked. A restore that manufactures `null` latches
the session onto `Default`: `null` outranks the agent and settings defaults by
design, so the concrete effort it displaced can never come back.

Every write of `currentVariant` writes `currentVariantSelection` with it. They
are one selection; updating only the effective value leaves the picker showing
one effort while sends carry another.

Every loader and mutation takes an explicit directory; omitting it means the
active project, which is what non-Settings callers pass. A load for another
directory writes the map and leaves the mirror alone, so browsing another
project in Settings cannot change what chat sees. Components select through
`selectAgentsForDirectory` / `selectCommandsForDirectory` /
`selectAvailableSkillsForDirectory` / `selectMcpServersForDirectory` /
`selectProvidersForDirectory`, which return stored arrays.

Command discovery compares responses only with the requested directory's cache.
A first successful response always creates that entry, even when empty or
identical to another project's commands. Cached and unchanged loads restore the
active-project mirror; asynchronous completions check the active directory at
commit time. Failed loads leave the current cache untouched. Discovery passes
its directory directly to the SDK wrapper without changing the client's shared
directory context.

Settings resolves its directory through `useSettingsDirectory`, backed by
`useUIStore.settingsProjectPath`. That selection is Settings-local and not
persisted: it follows the active project until the user picks another one. The
Settings project selector must never call `setActiveProject` — that relocates
the chat, the session list and the file tree.

Failure is still not empty: a failed load restores that directory's previous
list rather than clearing it.

## Selector Rules

Use leaf selectors.

Good:

- `useGitStatus(directory)`
- `useGitBranches(directory)`
- `useGitBranchLabel(directory)`
- `useGitRepoStatusMap(directories, enabled?)` (disabled holds its last result)

Bad:

- `useGitStore((state) => state.directories)` in feature components
- `useGitHubPrStatusStore((state) => state.entries)` in feature components
- render-time scans over every PR entry for a single project/group badge

Why this matters:

- Zustand reruns selectors on every `set`
- rerenders are avoided only if the selected result stays referentially stable
- broad subscriptions magnify fanout even when only one directory changed

## Performance Rules

### 1. Preserve references for unaffected entities

If directory `A` changes, directory `B` should keep the same derived reference where possible.

### 2. Keep loading state per entity

Do not add new global `isLoadingWhatever` flags for keyed cache work.

### 3. Avoid hidden work

If a surface is not visible, it should not keep refreshing Git/PR state.

Examples:

- `PullRequestSection` may watch a PR while visible
- `SessionSidebar` may bootstrap missing PR data for expanded visible groups
- hidden sidebar should not watch PRs

### 4. Prefer one-shot event hints over polling

Example already in use:

- successful mutating tools emit a centralized Git refresh hint through `sessionEvents`
- visible `GitView` / `DiffView` consume the hint and refresh current-directory status

This is preferred over background polling.

### 5. Treat `diffStats` carefully

`GitStatus.diffStats` may be omitted by light status fetches.

Rules:

- do not erase richer existing `diffStats` with a lighter payload
- if a UI surface requires per-file `+/-` stats, it must ensure a full enough status payload exists

### 6. Keep diff cache bounded

Diff cache has explicit limits because large repos can otherwise blow up memory.

Do not raise limits casually.

## Refresh Model

### Git

Expected model:

- `GitView` / `DiffView` ensure current-directory Git state when visible
- the Git view gates its status-derived content and actions while a managed worktree bootstrap is pending, then keeps the gate closed until one forced fresh status read succeeds; refresh failure exposes retry without revealing the cached bootstrap snapshot
- explicit Git actions refresh status/branches/log as needed
- every status-affecting git mutation invalidates the HTTP adapter's status cache on its success path (failed mutations invalidate nothing), so the follow-up refresh is authoritative instead of the pre-mutation cache entry
- the sync event handler issues one Git refresh hint when a live file-mutating tool first reaches `completed`; this does not depend on `ToolPart` mounting, and duplicate terminal events do not replay the hint
- tool hints are coalesced per directory: the first completion opens a 250 ms window and every completion in that directory during it is answered by one pathless hint at its end, so a burst of parallel or back-to-back tool calls costs one status read. Direct hints (editor saves, reverts, explicit actions) are delivered at once. A runtime switch drops hints still waiting (`sessionEvents.cancelPendingGitRefreshes`)
- every Git refresh hint invalidates the store request generation and the HTTP status cache before visible consumers request status, so they share one post-mutation read instead of accepting a cached or pre-mutation response
- a successful dirty save from the in-app file editor issues a path-scoped Git refresh hint; clean autosave checks remain no-ops
- refresh hints with authoritative file paths invalidate only those cached and currently rendered diffs before status refresh; pathless tools request status reconciliation without broadly remounting DiffView
- targeted diff remounts preserve the user's current file-section anchor and intra-file offset before paint instead of resetting the stacked view to the top
- no root-level background Git polling

### PR

Expected model:

- `PullRequestSection` is the only true live PR watcher
- `SessionSidebar` may do one-shot bootstrap for expanded visible project/worktree groups if PR info is missing
- sidebar bootstrap reads the authoritative repository binding for each demanded directory; missing and `needs-attention` bindings issue no status request
- sidebar status keys include the bound account, repository, revision, provider instance, and primary remote, so rebinding cannot overwrite or reuse another authority's result
- source-control status and detailed-context caches use soft count targets: watched or loading entries remain protected, and failed unique-context churn evicts older inactive entries instead of growing without bound
- no live PR work for header
- no background PR sweeps outside visible demand

## Known Intentional Fallbacks

There is still one explicit fallback path worth knowing about:

- `SessionSidebar` may call `checkIsGitRepository(...)` during initial worktree/project discovery when store state is not populated yet

This is currently acceptable as a narrow bootstrap fallback.

Do not widen it into a polling or broad refresh system.

## Native prompt templates

`useSnippetsStore` owns native prompt-template catalogs and settings drafts. Web/PWA,
Electron, hosted mobile, and Capacitor all use `CanonicalClient.fileResources`
through the active authenticated Host Gateway; only the Bun worker loads and
expands native templates. The renderer never imports the native SDK.

- `Snippet` is the canonical `PromptTemplateEntry`, not a legacy file/alias shape.
  Existing selection and mutations address opaque `templateId` values. The
  `selectedSnippetName` field holds that identity for an existing entry and the
  proposed name for an unsaved draft.
- `catalogsByDirectory` preserves independent admitted workspace catalogs;
  `selectSnippetsForDirectory` returns the stored array or a stable empty array.
  Explicit composer reads do not replace a different settings directory.
- Writes carry the viewed decimal-string catalog revision. Create is not an
  upsert. Failures preserve the current catalog and draft; successful mutations
  publish the returned catalog, preserving scope, grouping, agent and model
  bindings. A load begun before a mutation cannot overwrite that result.
- Settings edit Markdown bodies without renderer substitution. External and
  inherited entries remain visible but expose no writable or delete controls;
  store mutation guards also reject noneditable entries.
- Invocation is native leading `/name` with arguments, not `#name`, aliases,
  prepend/append blocks, or inline token replacement. `expandText` sends the
  original invocation to the worker and throws on expansion failure. It returns
  content for comment/context consumers; send routing consumes the canonical
  expansion result directly to preserve execution bindings.
- Runtime switching retires in-flight work and clears catalogs, revisions,
  selection, and drafts. Authoritative read failure is not an empty catalog.

## Native skill files and discovery

`useSkillsStore` uses `CanonicalClient.fileResources` through the authenticated Host
Gateway on web/PWA, Electron, hosted mobile, and Capacitor. Only the Bun worker
loads native skills and builds invocation messages; the Host owns source files,
revision CAS, and apply fanout.

- `skills` and `skillsByDirectory` contain only native `FileResourceSkillEntry`
  records. Their opaque `skillId` identifies native discovery, never an authoring
  path. Settings browsing another directory leaves the ambient composer list alone.
- `filesByDirectory` independently retains the Host's authored-file catalog. The
  settings sidebar explicitly distinguishes native entries from authored-only
  entries absent from native discovery. Invalid `SKILL.md` files therefore remain
  editable without inventing executable IDs or advertising them to the composer.
- Existing native selection uses `selectedSkillName` as an opaque native ID;
  drafts use their proposed name. Authored-only selection instead uses
  `selectedAuthoredSkill: { scope, authoredSkillId }`. Authoring methods accept
  that explicit reference or resolve a native record's separate `authoredSkillId`.
  Host catalog membership and native read-only flags gate mutations; external
  roots retain native raw content for read-only viewing.
- The editor reads and writes complete raw `SKILL.md` text. It does not reconstruct
  YAML, trim bodies, expand arguments, or interpret metadata such as `allowedTools`
  as authorization. Supporting files use the same captured source revision.
- Writes use the viewed `expectedSourceRevision`, never silently retry with a
  newer revision after conflicts. Source commit results retain per-root apply
  outcomes separately; partial/failed application shows a translated saved-source
  warning instead of claiming that all active sessions applied the change.
- Native discovery and Host source catalog failures preserve their respective
  previous successful state independently. Runtime switching drops catalogs,
  source revisions, selections, drafts, and obsolete async completions. Loads
  started before a mutation cannot replace newer source state.

## When Editing These Stores

Before changing store shape or selectors, ask:

1. Is this keyed by the right identity (directory, branch, session, root)?
2. Will this force unrelated consumers to rerender?
3. Should this be visible-demand-driven instead of background-driven?
4. Is there already a store cache for this data?
5. Am I duplicating fetch ownership in a component when it should live in a store action?

## Validation Checklist

After meaningful Git/PR store changes, verify manually:

1. Idle desktop app stays quiet on draft/chat screen.
2. Git view still loads status, branches, log, identity.
3. Diff view still opens the correct file and stays in sync.
4. Worktree sessions still show branch labels in header.
5. Expanded sidebar projects/worktrees can show PR state without requiring prior selection.
6. Hidden surfaces do not reintroduce live background work.

## Invariants

### Catalog and configuration ownership

- Catalog refresh is best-effort per resource. A failed read retains its last list so a later event or page visit can recover it independently of other resources.
- Policy readers refresh after catalog writes reach OpenCode. A config event covers every catalog kind because one config file can declare providers, agents, commands and injected plugins together; project registration remains the sync layer's responsibility.
- Provider refresh retains the shown catalog, including effort labels in message footers, until its replacement arrives. Credential changes schedule a second read because provider plugins can finish model discovery after the immediate read without announcing another model change.
- Refresh ownership includes SDK identity and the captured runtime so an intervening A-to-B-to-A switch cannot revive obsolete refresh work.
- Provider and agent IndexedDB writes serialize per record so simultaneous saves preserve both halves. IndexedDB unavailability leaves the live-loading path intact.
- The agents store resolves the directory store lazily because importing it at module scope forms a cycle through configuration reload. Ambient config resolution and invalidation use the same active-project-first key so a worktree's session directory cannot invalidate the wrong Settings catalog.
- Hidden agents remain editable only when their config lookup confirms `native === false`. A failed lookup leaves built-in status unknown, so internal agents cannot become editable custom entries by inference. Config sub-resource failure stays distinct from a confirmed absent config.
- Command metadata uses one bulk read when supported and per-command reads on older servers and the VS Code bridge. The composer suppresses OpenCode's built-in `goal` command because Goal Mode already owns it; user-defined commands with that name and commands whose metadata read fails remain available.
- Global OhPiChamber defaults share one settings request across nearby directory activations. A failed settings read gains no success TTL, so the next activation can retry.
- Agent permission arrays retain their evaluation order because the last matching rule wins. Agent request-body edits preserve unrelated keys that the form does not own.
- A model the directory does not list cannot disprove a remembered effort. Inherited choices remain until a known model contradicts them. An inherited `null` is an explicit Default and outranks lower-priority defaults.
- Equal selection setters still perform session-memory and model-resolution work even when they skip the persistence-producing `set` call. The unchanged check includes the directory snapshot because a missing snapshot still needs creation.
- Running OpenCode limits override models.dev limits because authentication can change a model's usable context window. For uncatalogued models, the base untiered price is quoted and reasoning stays unknown without variants or compatibility evidence. Metadata enrichment waits for idle time because it is optional startup work.
- Worktree project-default mapping can resolve from persistence before async discovery finishes. An isolated-space directory inherits no host-project defaults. Config catalogs remain scoped to the worktree's own directory.
- Startup can finish with a missing or untrusted project so other projects remain reachable. An unchanged rejected config is not retried. Health probes that the server already held do not add the old polling delay again.
- Voice credentials stay on the server. Legacy browser keys migrate before key-status reads, which coalesce per runtime because every read-aloud button asks. A runtime without the route exposes unset status. An unchosen local dictation model remains server-resolved.

### Skills, MCP and plugins

- Settings retains switched-off skills absent from OpenCode's inventory, including built-ins absent from disk scans, so the user can turn them back on. An exact-denied id retains a known row or a noneditable id-only row until its rule disappears.
- A skill switch cannot lift a wildcard deny or remove a deny without an editable file. Its recheck ultimately uses OpenCode's statements even if another rule overrides the accepted switch write. Skill policy ids derive from the containing folder or loose filename and can differ from display names.
- Skill discovery uses server-reported environment flags because the browser cannot read them and the upstream list omits project skills the agent can use. External-skill disable excludes `.claude` and `.agents`; Claude-specific disable excludes only `.claude`. Name collisions prefer `.agents`, including symlinked copies. Unknown flags preserve the list, and Windows paths normalize before root matching.
- A disk-only skill response is incomplete. It preserves previously known built-ins and config-discovered skills, while absence of a managed-root skill is authoritative.
- The server's skill-catalog list is authoritative even when empty because machine policy can hide every built-in catalog. Freshness alone governs empty-list reuse.
- MCP forms rebuild config objects, so an emptied field removes its key. Entries require `type`; startup timeout applies only to spawned local servers. Code Mode Default and legacy negotiation remove their keys so OpenCode's per-server defaults apply.
- MCP runtime-only classification waits for the directory's first config read so configured servers do not flash as runtime-only. Status refresh touches only previously demanded directories, because reading an unused directory starts its service graph.
- Forgetting stopped MCP status retires pending reads too. Otherwise a late response makes the shutdown announcement refresh that directory and start it again. Runtime switches retire status reads because identical paths can name different hosts.
- Config-read failure prevents guessing whether an MCP server has a file to keep it off. Switching off also disconnects a server started manually against disabled config. Connection tests restore off only when the user had turned the server off; disconnecting a previously failed, unauthorized, pending or unread server would disable the server the test just started.
- Plugin runtime-read failure means unknown status for every plugin. A successful update check supersedes older inventory reads; a failed check preserves them and the inventory already shown. An update row stays running through its post-update read so a stale update flag cannot offer another run.

### Session authority and unsent content

- A stalled or cycling session page is incomplete and must reject. Returning partial coverage as complete permits destructive reconciliation and recovery-cache overwrite.
- Session signatures include fields patched without advancing `time.updated`. Turn-end unread markers, views and selection changes publish immediately; spend-only and updated-only turn changes wait for turn end because the sidebar does not display per-step spend. Deferred changes still advance mutation protection without publishing a list.
- Isolated-space marks apply before a global snapshot publishes because snapshot consumers resolve ownership immediately. Persisted seeds cannot establish an unchanged-record head boundary. Recent-only reads merge without completeness authority.
- Legacy synthetic queue instruction parts deliver exactly as captured even though new messages no longer create them. A queued goal's explicit objective overrides its delivered text; otherwise that text supplies the objective. Legacy `immediate` delivery normalizes to `steer` because upstream offers only `steer` and `queue`.
- Legacy and VS Code permission on/off payloads map enabled to `auto`. Without a classification provider safety behaves as ask. Inherited modes follow the nearest explicit lineage setting. A space also receives the composer's shown new-session default explicitly for compatibility with older space servers; `undefined` sends no override.
- Enterprise policy is runtime-authoritative and enforced outside UI visibility. Only a 404 permits the older routing-only policy fallback; other failures retain known policy and report failure. Its responses cannot cross runtime generations.
- Agent-memory writes serialize, and only the newest load publishes, so an older disabled answer cannot latch a newly enabled feature off. Failed loads preserve entries; a confirmed disabled feature clears entries while retaining the refresh path. Project deletes and undo operations stay pinned to their requested project, and another project's entries never appear under the current heading.
- A `/btw` panel's identity comes from parent-session metadata; its store owns only transient presentation. Saved model validation waits for a usable live catalog and otherwise keeps the saved choice. A live missing model falls back before forking so the fork cannot start with an unusable model slug.
- External inline-comment owners can supply ids for correlation. Collisions are rejected so edits cannot retarget an unrelated draft. Browser screenshot bytes stay in memory while the draft carries the attachment name. A short note replacing a desktop-file reference may stay in input history; the file content does not.
- Project-context write coordination stays outside rendered state to avoid rerendering consumers on every write transition. Individual todo changes send only that change so concurrent agent additions survive; whole-list writes carry their source-store identity and reject after a store switch. Pin writes send only the pin so concurrent body edits survive. Creation adopts the server's complete result because the caller can act before the panel loads.
- Project labels preserve literal folder spelling, including dot-directories. A settings reconciliation preserves this window's valid active-project choice because another window's active pointer carries no navigation intent here. VS Code workspace folders override a persisted registry and receive additions through the extension host.
- Project removal stops idle isolated spaces while preserving those with working agents. Space teardown loads lazily to keep it out of the store's module graph.
- Server drafts serialize writes per draft and retain failed-save local text as newer than the server. Final removal prevents pending saves from resurrecting sent or discarded drafts. Loads started before writes cannot overwrite them; failed deletion restores a still-server-owned draft. Stored attachments travel by id and load bytes when another device opens the draft.
- Folder snapshot reads bypass the browser request cache so a hanging write cannot block them. Batches preserve changes queued after dispatch, and a failing write retains its own backoff. Malformed pending entries drop individually; malformed tombstones remove nothing.
- Session pins derive from server-shared metadata with optimistic clicks and unmigrated local pins overlaid. Unknown session ids stay in tab sets until absence is authoritative because a partial list cannot destroy the user's working set. Closing a tab never deletes its session.
- Pin intent can precede creation of its tab and remains transient. Moving a tab or sending pins a preview. Multi-run members reuse their shared tab slot without changing its preview state, and opening the newest pinned tab never evicts that new tab.
- Multi-run lanes receive standing project context like ordinary sends. A lane's goal starts before its prompt; goal failure leaves it unstarted, and prompt failure stops that goal because a goal without a turn never settles and blocks auto-fusion. A failed unpopulated checkout is removed with its branch.
- A folded work has no selectable child rows, so range selection cannot include its hidden sessions. A selected session shown in another scope toggles the same session off.
- Snippet registry authority expires with its directory's load cache because files can change outside this client. Only a complete fresh list can rule out expansion locally. Post-mutation reads bypass pre-mutation requests, and retired callers receive the replacement list. Rename and move update list and editor selection together.

### Git and linked-item caches

- Branch-base overrides include runtime, directory and branch because Git cannot always establish a parent and a choice for one checkout must not shadow another branch's detection. Remembered comparison choices are bounded on explicit selection, never while acquiring a view.
- PR status concurrency preserves sockets for interactive requests and participates in the aggregate network budget. Separate caps can otherwise occupy every socket. Failed live-summary attempts still advance cadence so outages do not cause a tight retry loop.
- Passive PR readers use the freshest entry across remote keys for the same binding; newly selected remote keys seed from known status to avoid a checking flash. Registered contexts, including an empty registration, decide authority. Without registration only one unambiguous repository binding is trusted because freshness cannot distinguish bindings.
- Older server PR snapshots cannot regress fresher local status, and live updates keep both change-request and CI aliases consistent. Bootstrap retries apply only before any PR is known; a cached historical or open PR uses normal discovery signals.
- Canonical linked-PR URLs use the instance's origin and a case-folded path through the request number, dropping query, fragment and trailing view routes. Equivalent links must produce stable selector objects; alternating spellings in a shared cache can loop React subscriptions.
- Git System identity remains selectable without a configured author because it means no override and cloning still works. Source-control credential metadata supports account management; connected-account checks require credentials the descriptor can actually use for transport. Refresh includes instances referenced only by identities so removal of an instance's last account cannot leave a false connected state.
- Forced auth refresh follows a credential mutation and cannot join an ordinary older read. Forced readers share a replacement; older completions cannot overwrite newer writes, and unchanged identity lists retain their reference. In-flight ownership is registered before notifications so reentrant readers join it.
- An unsupported nested-discovery answer replaces only unknown or failed state, preserving successful discovery. A first commit invalidates repository-resolution assumptions even if ordinary status fields stay equal. A newer local branch read still incorporates never-fetched remote branches obtained by an explicit remote read.
- Diff bytes are measured once at insertion so eviction cannot repeatedly encode the cache. Prefetch skips large files and runtimes without per-file reads, and isolates individual failures. Optimistic whole-file stage/unstage moves known line stats with the row until authoritative reconciliation.
- Disabled Git selectors hold their last result and stop following updates so surfaces retain branch lines during exit animations without rerendering after closure. Discussion-to-issue projections retain object identity per held state because fresh objects on every selector read loop subscriptions.

### Device state, panels and storage

- Deep-link trust is device-local security state and never roams through server settings.
- Favicons cache per origin so same-site navigation and additional tabs avoid placeholder flicker. Data URLs stay in memory because persisting them costs more storage than the saved request warrants; insertion-order eviction is sufficient for a cheap refetch. Requests use the reporting view's session so isolated-space icons traverse that space's proxy. Failure retains the placeholder silently. Browser history includes runtime and directory because equal paths on different hosts expose different servers.
- Context-panel tab budgets apply per surface because each surface has its own strip. The tab being opened or viewed survives even if protection leaves 1 extra tab. Each zone closes and selects independently; closing its last tab does not jump to an unrelated surface.
- File preview replacement removes the old editor entry too, and closing files keeps panel tabs and editor state aligned. Closing the last real file retains the empty editor/tree placeholder; closing that placeholder closes the surface. A move rebuilds path-derived ids and replaces stale destination tabs. The tree and editor can each hide, but at least 1 remains, and selecting a file shows its editor.
- Terminals, pinned chats, tracker items and PR comparisons can target other directories without changing app navigation. Cross-project Changes and walkthrough targets persist as the panel's own directory because their requested PR selection is memory-only. The rail returns to the panel's project when opening those surfaces.
- Agent browser tabs always allocate in the background, even when another tab has the same URL, preserving the user's panel visibility and selection. User-requested new tabs also preserve existing tabs; labels follow navigation. Tracker item tabs retain the branch tab beside them, including after the last item closes.
- Context-panel persistence drops modes the runtime cannot render, including browser tabs in VS Code. A saved-plan tab requires its owner; an unowned legacy saved-plan descriptor cannot revive as an openable plan. Zone sizes migrate from the last-used directory, and preview-to-browser migration rebuilds mode-derived ids and resolves URL collisions.
- Docked and expanded zone sizes are independent and shared across directories and surfaces. Persistence applies only a sanity bound; actual maximum size depends on available space and minimum chat width. Expanded-zone sidebar closure remains distinguishable from a manual toggle so collapse can restore it. A Work Status overlay closes when inline layout fits again to avoid duplicate content.
- Layout eligibility and actual Work Status visibility are transient frame state. Server-owned availability flags are nonpersistent because another runtime may lack those services. Link-driven Settings requests are consumed once.
- Hidden-section sets preserve visibility of newly introduced sections. The last visible mobile drawer tab cannot be removed because the drawer still needs content. Full-page surfaces remain mutually exclusive, and disabling a feature closes any corresponding open surface.
- Archived buckets begin hidden until preferences hydrate so archived sessions cannot flash at startup. VS Code keeps its compact inline archive behavior while other runtimes use the Archive page. Shared sections and pin lists reset to built-ins on runtime changes; the boot-time ownership check waits for runtime selection so a restored host keeps its own saved sections.
- UI migrations distinguish old defaults from explicit choices where the stored format allows it. Synced choices restore after local default migration. Shortcut overrides reset when their previous prefix system collides with the current one. Removed main-area fields cannot rehydrate a blank desktop page.
- Interface scaling changes the root rem unit so utilities, icons, spacing and semantic type scale together. Memory-review timestamps never move backwards because a stale unmount must not restore cleared new-content badges. The Settings dialog's open state remains transient.
- Source-board project and nested-repository choices are independent of app navigation and Git-view selection. Project/team ids stay scoped to their runtime; screen widths remain device-wide. External tracker, board and PR handoffs are consumed once, including across retained-panel remounts.
- Terminal snapshot chunks replay at their captured PTY width before fitting the viewport; otherwise wrapping fragments survive. Composite directory/tab keys use NUL because neither component can contain it. Default labels increase from the highest remaining numbered label so closes and reloads cannot produce duplicates; custom labels are untouched. An older finished action listing cannot cancel a newly allocated run whose server session is not yet visible.
- Native-mobile server update checks describe the connected server separately from the app build and do not report a second web-client usage event. Failure stays distinct from up-to-date. Background checks use the shared network budget; desktop installer errors, unavailable-update reasons and richer sidecar release notes survive lesser responses. Restart stays locked while the app shuts down and a failed install remains retryable.
- Walkthrough keys separate revisions and repositories, including repositories behind one binding, so a refusal for an unbound repository cannot poison another repository's cache. Its default small-model choice stays on the composer's provider, falling back to the composer's model when that provider offers no small model.
- Web-search reads retain same-scope state on failure and only the newest load commits. Writes outrank earlier reads, rollback applies only without a newer choice, and catalog refresh runs only after a consumer has demanded data. Unknown integration access is not no-key; an unreadable project override stays unknown without disabling the page.
- Bulk safe-storage key enumeration uses the adapter's one-pass listing because repeated `key(index)` rebuilds the full visible list. Debug fetch tracking stays opt-in, lives on `window` across HMR and exposes polled snapshots rather than streaming store subscriptions; repeated enable tears down prior tracking before wrapping fetch again.
- Extracted document attachments share a group id, and removing 1 entry removes the whole group. The message limit controls fetch, active ceiling and Load More together; background trimming derives from that limit.
- Context-fill accounting prefers the server's final-round-trip `tokens.total` because turn breakdowns accumulate repeated prompt reads across tool calls. Older servers fall back to the breakdown sum. Completed compaction makes context size unknown until a later measured response, since its own request describes pre-compaction input and omits retained context from its output; running or failed compaction preserves the prior measurement.
- Prefix-cache hit rate uses noncached input plus cache reads and writes as its denominator because upstream `input` excludes cached tokens. No positive inclusive input means no meaningful percentage, so consumers hide that reading.
