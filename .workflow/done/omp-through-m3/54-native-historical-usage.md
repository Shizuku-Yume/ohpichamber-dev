# 54: Native historical usage statistics and UsageStatsView cutover

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 93d519221527e15cf52a5dde0d6ddf011c7527bb

**Finished:** 2026-10-21T03:20:00Z

**Delivers:** Historical usage statistics and on-demand tool execution metrics wired to typed canonical endpoints (`GET /api/agent/v1/usage` and `GET /api/agent/v1/usage/tools`), backed by cold native session transcript parsing and cold `SessionManager` inspection in the Bun Agent Service worker. Strictly scopes queries to Host-authorized registered canonical session references under explicit viewer IANA timezone and optional canonical `workspaceId` / `projectId` filters, preventing process-global path leaks and rejecting uncontained filesystem access. Retains `UsageStatsView` summary tiles, activity bar chart, token composition, efficiency tiles, and on-demand tool breakdown with honest representation of unavailable reasoning or duration metrics. Prevents double-counting across session forks, branches, and subagents using native DAG lineage and message identity. Replaces `packages/ui/src/lib/opencode/session-stats.ts` and its test, migrating `useUsageStatsStore` and all usage page consumers to `CanonicalClient`.

**Blocked by:** None
**Files:** `packages/agent-contract/src/usage.ts`, `packages/agent-contract/src/index.ts`, `packages/agent-service/src/supervisor/workspace-routes.ts`, `packages/agent-service/src/worker/usage.ts`, `packages/agent-service/src/protocol.ts`, `packages/agent-service/src/sessions/references.ts`, `packages/agent-service/src/sessions/registry.ts`, `packages/web/server/lib/host/canonical-routes.js`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/components/views/usage/UsageStatsView.tsx`, `packages/ui/src/components/views/usage/usageStatsModel.ts`, `packages/ui/src/components/views/usage/usageStatsStore.ts`, `packages/ui/src/components/views/usage/usageStatsStore.test.ts`, `packages/ui/src/lib/opencode/session-stats.ts`, `packages/ui/src/lib/opencode/session-stats.test.ts`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `packages/agent-contract/src/session.ts`; `packages/agent-service/src/sessions/references.ts`; `packages/agent-service/src/sessions/registry.ts`; installed native SDK `@oh-my-pi/pi-coding-agent/src/session/session-loader.ts` (`loadSessionFile`), `@oh-my-pi/pi-coding-agent/src/session/session-manager.ts` (`SessionManager.open`, `getUsageStatistics`), `@oh-my-pi/pi-coding-agent/src/session/session-listing.ts` (`readSessionInfo`, `scanSessionFile`), `@oh-my-pi/omp-stats/src/parser.ts` (`parseSessionFile`), and `@oh-my-pi/omp-stats/src/shared-types.ts`; `packages/ui/src/components/views/usage/UsageStatsView.tsx`, `usageStatsStore.ts`, and `usageStatsModel.ts`
**Covers:** W6, W9, W10

## Installed Native SDK Owner & Evidence

Persisted session usage and tool execution metrics are built-in native capabilities of `@oh-my-pi/pi-coding-agent` (v18.8.9) and `@oh-my-pi/omp-stats`, verified in installed source:

- **Cold transcript loading without live execution (`session-loader.ts`):** `loadSessionFile(filePath, storage, options)` reads entries from JSONL transcripts without initializing model providers, starting agent loops, or holding live session locks.
- **Header and turn scanning (`session-listing.ts`):** `scanSessionFile` and `readSessionInfo(file)` read the 4 KiB prefix and 32 KiB suffix to extract `SessionInfo` (session UUID, cwd, created, modified, messageCount, assistantTurns, status) without loading full session histories into memory.
- **Cold `SessionManager` projection (`session-manager.ts`):** `SessionManager.open(file, dir, storage, { initialCwd, throwIfMissing: true, suppressBreadcrumb: true })` instantiates the session tree index. `manager.getUsageStatistics()` returns cumulative `UsageStatistics` (`input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `orchestrationInput`, `orchestrationOutput`, `cost`, `subagentCost`, `premiumRequests`) directly from the indexed tree without executing models.
- **Offline transcript parser (`omp-stats/src/parser.ts`):** `parseSessionFile(sessionFile, fromOffset, parserState)` streams JSONL records to extract assistant message usage (`MessageStatsInput`), user messages, and tool invocations (`ToolCallStats`, `ToolResultLink`).
- **Native SQLite aggregator boundary evaluation (`omp-stats/src/aggregator.ts` and `db.ts`):**
  - `@oh-my-pi/omp-stats` contains an offline SQLite aggregator syncing persisted sessions into `~/.omp/stats.db`. By design, its `syncAllSessions` method globs `~/.omp/agent/sessions/` across the entire machine.
  - In OpenChamber, sessions are scoped to Host-authorized workspaces and projects via `SessionReferences`. Relying on the global `~/.omp/stats.db` would scan sessions from unmanaged paths, leak cross-workspace activity, and bypass Host authorization.
  - To preserve strict isolation without global path leaks, historical usage aggregation is executed in the Bun Agent Service worker, scoped strictly to the exact JSONL session files authorized by the Host in `SessionReferences`.

## Architecture & Boundaries

- **Worker ownership & runtime boundary:**
  - The dedicated Bun Agent Service worker executes all transcript reads and historical usage aggregations.
  - UI and Node Host never import `@oh-my-pi/pi-coding-agent` or `@oh-my-pi/omp-stats`.
  - No models, API keys, live agent loops, or browser processes are initialized during historical stats collection. All operations rely exclusively on cold file reads and cold `SessionManager` inspection.
- **Host authorization & query containment:**
  - Host Gateway authenticates callers and validates workspace/project access before forwarding requests to the Agent Service.
  - All session resolution uses `SessionReferences` (`packages/agent-service/src/sessions/references.ts`).
  - Filtering by `workspaceId` restricts candidate sessions to that workspace; filtering by `projectId` further narrows candidates within the workspace.
  - When the request selects all projects ("all"), the query aggregates strictly over the registered canonical session references authorized for the caller.
  - Requests cannot specify arbitrary filesystem paths. The service rejects any path outside the authorized session files indexed by `SessionReferences`.
- **Canonical API & wire contract:**
  - `GET /api/agent/v1/usage` accepts `UsageQuery`:
    - `from?: number`: inclusive start timestamp in epoch milliseconds (computed from viewer local midnight).
    - `to?: number`: exclusive end timestamp in epoch milliseconds (defaults to current time).
    - `timezone: string`: viewer IANA timezone identifier (e.g. `America/New_York`, `UTC`).
    - `workspaceId?: string`: optional canonical workspace filter.
    - `projectId?: string`: optional canonical project filter.
  - Returns `UsageStats`:
    - `range`: `{ from: number; to: number }`
    - `sessions`: integer count of distinct sessions active in the range.
    - `subagents`: integer count of subagent transcripts active in the range.
    - `prompts`: integer count of user prompts.
    - `steps`: integer count of model generation turns.
    - `tokens`: `UsageTokens` (`input`, `output`, `reasoning: number | null`, `cacheRead`, `cacheWrite`, `total`).
    - `cost`: total USD cost.
    - `tools`: `UsageTools` (`mode: 'none' | 'summary' | 'detail'`).
    - `activeDays`: integer count of days with at least one model step.
    - `streak`: longest run of consecutive active calendar days within the range.
    - `activity`: `Array<{ date: string; steps: number }>` with dates formatted as `YYYY-MM-DD` in the viewer's IANA timezone.
    - `models`: `UsageModel[]` sorted descending by total tokens (`providerId`, `modelId`, `variant: string | null`, `steps`, `tokens`, `cost`).
    - `partial`: boolean flag indicating whether any candidate session could not be read.
    - `errors?: Record<string, string>`: per-session error map for failed session reads.
  - `GET /api/agent/v1/usage/tools` accepts `UsageToolsQuery` (same query parameters as `UsageQuery` with `from` and `to` matching the loaded report window).
  - Returns `UsageToolsResponse`:
    - `totals`: `UsageToolTotals` (`calls`, `succeeded`, `failed`, `unfinished`).
    - `usage`: `UsageToolUsage[]` sorted descending by call count (`name`, `calls`, `succeeded`, `failed`, `unfinished`, `durationP50: number | null`).
    - `partial`: boolean.
    - `errors?: Record<string, string>`.
- **Canonical vs. native identity translation:**
  - Canonical identities (`workspaceId`, `projectId`, `sessionId`, `rootSessionId`) are managed by the Host and Agent Service `SessionReferences`.
  - Native identities (UUIDv7 session ID, 8-hex-char entry ID, native cwd path, `--dir--` session path encoding) remain internal to the worker.
  - In `UsageStatsView`, the project filter dropdown resolves the selected directory to canonical `workspaceId` and `projectId` via `canonicalClient.resolveWorkspace(directory)`. Native directory paths are never sent as project identifiers.
- **Metric honesty & anti-fabrication:**
  - Reasoning tokens: when native transcripts or model providers do not record reasoning tokens, `tokens.reasoning` is set to `null`. It is never fabricated as `0`. `usageStatsModel.reasoningShare` returns `null`, and `UsageStatsView` renders `—`.
  - Tool durations: when native tool call records lack start/end timestamps or elapsed execution duration, `durationP50` is set to `null`. It is never fabricated as `0`. `UsageStatsView` uses `usageStats.tools.rowStatsNoDuration` to display call counts without a duration clause.
  - Unfinished tools: tool calls that were interrupted, aborted, or never returned a result entry are counted as `unfinished`, rather than marked as failed or dropped.
- **Lineage tracking & double-count prevention:**
  - Native transcripts allow branching and alternative forks off previous entries.
  - Aggregation follows proven native DAG lineage: entries are identified and deduplicated by their unique native entry ID (`messages.entry_id` or session entry ID) along the active branch lineage, never by text content hashing or line counts.
  - Subagent sessions spawned via the `task` tool are tracked via native `Subagent` child references (`SessionReferences.subagents`). Direct token counts and subagent costs (`subagentCost`) are attributed distinctly, preventing subagent executions from inflating root session prompt or turn metrics.
- **Partial failure resilience & store semantics:**
  - If one session file in an authorized batch is corrupted, unreadable, or truncated, the worker preserves valid sibling sessions, aggregates their metrics, sets `partial: true`, and records the failing session ID and error reason in `errors`.
  - Fetch failures do not overwrite existing authoritative data with zeros. `useUsageStatsStore` retains previously loaded `stats` on error, sets `loading: false`, and exposes `error`.
  - The UI presents an inline retry state when no cached data exists, or retains previous data with an error notification when a background refresh fails.
- **Retained store cache & lazy tool loading:**
  - The in-memory Zustand store cache keyed by `${runtimeKey}::${range}::${projectDirectory ?? '__all__'}` is preserved.
  - Lazy tool loading is preserved: initial reports query `GET /api/agent/v1/usage` with `tools: "none"` to avoid expensive full tool-call parsing across history. When the user requests tool metrics, `toolsRequested` is set to `true` and `loadTools` calls `GET /api/agent/v1/usage/tools`.
  - Runtime switch resets: `subscribeRuntimeEndpointChanged` triggers `reset()`, aborting in-flight `AbortController` requests and clearing all cache entries.
  - Date boundaries and DST semantics: `rangeStart(range, now)` computes local midnight epoch milliseconds. The server buckets `activity` using the viewer's explicit IANA timezone. `buildActivitySeries` handles daily and weekly binning across daylight saving transitions.
  - No new polling loops, timer intervals, or custom caching frameworks are introduced.
- **Module ownership & clean cutover:**
  - Owns `packages/ui/src/components/views/usage/UsageStatsView.tsx`, `usageStatsModel.ts`, `usageStatsStore.ts`, and `usageStatsStore.test.ts`.
  - Retires and deletes `packages/ui/src/lib/opencode/session-stats.ts` and `packages/ui/src/lib/opencode/session-stats.test.ts`.
  - Migrates all callers in `packages/ui` to `canonicalClient.getUsageStats` and `canonicalClient.getUsageTools`.
  - Removes OpenCode `session.stats` SDK dependencies without introducing compatibility shims.

## Check

- Unit and contract tests for `UsageQuerySchema`, `UsageTokensSchema`, `UsageModelSchema`, `UsageToolTotalsSchema`, `UsageToolUsageSchema`, `UsageToolsSchema`, and `UsageStatsSchema`.
- Worker tests with deterministic real native persisted session fixtures:
  - Valid multi-session fixture verifying cumulative tokens, model breakdown, prompt counts, and activity date binning.
  - Date boundary and DST transition verification with explicit IANA timezones (e.g. `America/New_York`, `Europe/London`, `UTC`).
  - Scoping tests: queries scoped by `workspaceId`, `projectId`, and "all", verifying that only Host-authorized session references are scanned.
  - Mixed failure tests: one malformed JSONL file among valid transcripts returns partial data with explicit per-session error map and preserved siblings.
  - Fork and lineage tests: branched session transcripts deduplicated by native entry ID, verifying no double-counting across fork points.
  - Tool execution tests: verifying calls, successes, failures, unfinished states, and honest null duration handling.
- Host authorization boundary tests:
  - Unauthorized workspace access is rejected with HTTP 403.
  - Arbitrary filesystem paths and uncontained paths outside `SessionReferences` are rejected.
  - Direct requests for global `~/.omp/stats.db` paths are rejected.
- UI store and component tests:
  - `useUsageStatsStore` preserves previous report data on fetch failure without zeroing metrics.
  - Runtime switch triggers cache reset and aborts pending queries.
  - `UsageStatsView` renders `—` when reasoning tokens are null and formats durationless tools with call counts only.
- Parent verifies the integrated Stats page after task delivery; no simulated performance benchmarks or unobserved performance claims.

## Acceptance

- [x] Canonical contract defines `UsageQuerySchema`, `UsageTokensSchema`, `UsageModelSchema`, `UsageToolTotalsSchema`, `UsageToolUsageSchema`, `UsageToolsSchema`, and `UsageStatsSchema`.
- [x] Agent Service implements `GET /api/agent/v1/usage` and `GET /api/agent/v1/usage/tools` in Bun worker without launching live models or agent sessions.
- [x] Queries scope strictly to Host-authorized registered session references under viewer IANA timezone; "all" never leaks global `~/.omp` stats DB or arbitrary filesystem paths.
- [x] Metrics represent actual native events; unavailable reasoning tokens and tool durations are returned as `null` and displayed honestly as `—` or unitless counts.
- [x] Forked and branched transcripts prevent double-counting via native message identity and DAG lineage.
- [x] Corrupt transcripts yield explicit per-session errors and partial status while preserving valid siblings.
- [x] `useUsageStatsStore` cuts over to `CanonicalClient`, preserving cache keys, lazy tool loading, abort signals, and error retention without zeroing previous reports.
- [x] `packages/ui/src/lib/opencode/session-stats.ts` and legacy OpenCode stats endpoints are retired with no compatibility adapters.
- [x] Node Host and UI remain free of native SDK imports.
- [x] Tests verify deterministic native transcript aggregation across date ranges, DST boundaries, scopes, and partial failures.

## Progress

Focused verification passes: contract, native worker, UI store/view/model suites pass 37 tests / 134 assertions; Host canonical usage route tests pass 5 tests. Worker fixtures cover cold native transcript/session inspection, timezone/DST ranges, workspace/project scope, partial corrupt siblings, branch lineage deduplication, honest null reasoning and duration metrics, and unfinished tools. UI tests cover Canonical Client requests, runtime reset/abort, lazy tool loading, retained reports after failure, and honest rendering. Source review confirms UI/Node contain no native SDK imports and the legacy session-stats owner is absent. Connected Stats-page observation and W6/W9/W10 acceptance remain open.

2026-10-21 history audit and connected closure: the task record was originally added in `f590395a1` already `Status: active` with `Base commit: 93d519221527e15cf52a5dde0d6ddf011c7527bb`; the later placeholder `<commit-sha>` was stale. Restored that real start base. One isolated authenticated Web Stats run on dist `c438247e…` used two real native sessions created through the canonical Host/Agent Service with local provider fixtures (isolated workspaces `/tmp/ohpi-task54/a` and `/b`). Observed summary tiles (2 sessions, 2 prompts, 4 steps, 920 tokens), 30d/7d/All time requests, New York local-midnight `from` (1791950400000 = 2026-10-14 00:00 EDT), project b filtering (`workspaceId`/`projectId`; 1 session / 460 tokens), lazy `/usage/tools` after clicking "Show tool calls" (`write`, 1 call, 100%, null duration rendered without a duration clause), and a corrupt real B transcript producing `partial: true` with explicit `USAGE_SESSION_CORRUPT` while A's data stayed visible. W6/W9/W10 Stats behavior is covered by these canonical reads; no legacy stats endpoint appeared. Tests/build were not rerun: reused focused 37/134 and Host 5. Receipt: `.workflow/omp-migration/m3/task54-stats-2026-10-21.json`. Limitations: data did not straddle local midnight; boundary/DST semantics remain from the prior worker fixtures, and failed-refresh retention remains from the store test.
