# MCP backend integration

The Agent Service owns workspace MCP configuration and routes sessionless workspace MCP operations through stateless workers. Workspace configuration is persisted by the catalog coordinator; worker operations remain authorized against the workspace root session.

## Native session archives

`SessionRegistry.archiveManifest()` is the host-authorized, read-only inventory of native chats. `exportArchive()` emits a bounded uncompressed ustar bundle containing the selected transcript, descendants, tool artifacts, subagent outputs, and referenced blobs; it never parses transcripts in Node. `importArchive()` validates the complete manifest before staging and installs immutable deleted-space references. Imported roots and descendants remain cold until explicitly reopened, and deleted-space mutations return `SESSION_READ_ONLY` (HTTP 409). Archive transfers are bounded to 256 MiB and five minutes per operation; save/restore uses a thirty-minute host window.

## Native web search

`GET`/`PUT /api/agent/v1/workspaces/:workspaceId/web-search` and credential `PUT`/`DELETE .../web-search/credentials/:providerId` use the strict canonical web-search schemas. Credential path and body identities must match. The workspace must be registered by the authenticated Host; no session is required to read or persist settings. These HTTP operations serve web/PWA, Electron, hosted mobile, and Capacitor through the existing canonical Host transport.

`WebSearchCoordinator` serializes reads, mutations, and root admission by the registered native `agentDirectoryId`, not by workspace. The stateless worker owns native settings persistence and revision CAS; the supervisor never imports SDK objects or exposes credentials in public responses. A successful durable mutation fans out `apply` to every active root sharing that native settings owner across all workspaces, using the captured worker generation. Unrelated native owners remain unchanged. Admission uses the same barrier, so a concurrent opening either joins the mutation's fanout or starts after its durable commit.

Persistence failure returns `failed` without applying uncommitted settings. Persisted mutations with any worker failure return `partial` even when every application failed; persisted mutations without failures (including zero live roots) return `applied`. Worker errors expose codes, never native exception text or secrets. A revision conflict returns HTTP 409 `CATALOG_CONFLICT` with `details.currentRevision` and the current authorized redacted `details.state`; failed reads never masquerade as empty settings.

The worker derives the search catalog from the native registry's web-role/model selectors and native readiness. Settings use the process singleton backed by the owner's `agentDirectory/config.yml`; credential writes and removals use `AuthStorage.credentials.set/remove` with the native transport's exact namespaces. Revision CAS uses a durable mode-0600 sidecar under the native OS file lock. It reserves a uint64 revision token before mutating native state, so a failed native write still consumes that token. A failed pending SDK save quarantines the worker against later writes, replay, and search egress.

Every cached native search transport checks the enabled setting and then requests Host authorization with `{ type: 'web-search' }` immediately before searching. This includes explicit provider selectors and the XAI transport chain; cached transport objects do not bypass the live authorization boundary.

## Historical usage

`GET /api/agent/v1/usage` and `/usage/tools` are Host-authenticated historical reads. The Host supplies its authorized opaque workspace/project scope set over private transport; the supervisor intersects it with registered root and child session references. "All" means this intersection, not native home-directory discovery. No client path or global OMP statistics database participates.

A dedicated cold usage worker loads exact registered native transcripts, validates loader diagnostics, and inspects native branch lineage without constructing an active agent, provider registry, or model loop. Native SDK imports remain worker-private. Summary reports and lazy tool reports use the same inclusive/exclusive window and viewer IANA timezone. Reasoning and execution durations absent from persistence remain null. Unfinished calls remain unfinished; historical activity never establishes current runtime status.

Failures are per canonical source: valid siblings survive with partial status and sanitized error codes. Failure of every selected source is an error, not an authoritative empty report. The UI retains its existing runtime-keyed cache and reset/abort lifecycle; this feature adds no polling or cache framework.

## Native workspace cache warming

`GET` and `PUT /api/agent/v1/workspaces/:workspaceId/cache-warming` use the existing authorized workspace catalog owner and uint64 revision CAS. The canonical contract is `agent-contract/src/warming.ts`. PUT returns `persisted` configuration separately from generation-qualified active-root outcomes (`applied`, `partial`, `failed`, or `no-active-workers`). Stateless configuration workers are not active-session execution proof; stopped roots are not started for fanout.

Only Bun SDK workers read native Settings, persist `cfgProvidersCacheWarming`, flush, and call `AgentSession.setCacheWarmingMode`. Native typed setting writes are global, so the stateless writer scopes its isolated writable Settings to the workspace `.omp/config.yml`; authoritative reads use the real agent directory to preserve inherited native settings. Session startup reapplies the latest effective workspace mode before readiness. Live application uses a session-only override and does not rewrite configuration. Native `CacheWarmer` owns scheduling and provider traffic; no Host/UI keep-alive loop is added.

Web/PWA, Electron, hosted mobile and Capacitor use the same authenticated selected Host route. Mobile remains UI-only. Warming stays with the session's provider and creates no provider-entry or network-exposure capability. Configured mode is not proof that a request ran or a cache hit occurred.

Native Settings flush precedes the existing service catalog-revision file commit. If persisting the service revision file fails after native Settings have flushed, the native configuration remains saved on disk while the supervisor restores the previous service revision in memory, skips live application (`liveApplication: 'not-started'`), and returns HTTP 503 `SERVICE_UNAVAILABLE` with typed `CacheWarmingPartialWriteDetails` (`{ workspaceId, configuredMode, currentRevision, nativeConfigurationCommitted: true, liveApplication: 'not-started' }`). The system does not claim atomic rollback across the native file write and service revision file. The UI checkbox catches this 503, displays the saved mode alongside a partial-write error message, and disables further writes until reload. An authoritative GET reports the effective native mode with the service's last committed revision. This follows the existing catalog durability boundary rather than introducing a second transaction protocol.
