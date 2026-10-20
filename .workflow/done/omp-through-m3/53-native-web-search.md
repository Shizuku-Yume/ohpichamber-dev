# 53: Native web search provider configuration and credential management

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 93d519221527e15cf52a5dde0d6ddf011c7527bb

**Finished:** 2026-10-21T03:46:00Z

**Delivers:** Canonical workspace web search configuration wired to the native search subsystem in the Bun Agent Service worker. Exposes canonical `/api/agent/v1/workspaces/:workspaceId/web-search` endpoints for web search provider catalog discovery, active provider selection, fallback chains, timeouts, and write-only credential storage via native `AuthStorage` and settings. Enforces Host enterprise egress controls and authentication, retires legacy `/api/config/websearch` and `/api/websearch/provider` routes, and migrates `useWebSearchStore` to `CanonicalClient` without OpenCode compatibility adapters.

**Blocked by:** None
**Files:** `packages/agent-contract/src/catalogs.ts`, `packages/agent-contract/src/websearch.ts`, `packages/agent-service/src/worker/catalog-websearch.ts`, `packages/agent-service/src/worker/catalogs.ts`, `packages/agent-service/src/supervisor/workspace-routes.ts`, `packages/web/server/lib/host/canonical-routes.js`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/stores/useWebSearchStore.ts`, `packages/ui/src/components/sections/websearch/`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `packages/agent-contract/src/catalogs.ts`; installed native SDK `@oh-my-pi/pi-coding-agent/src/web/settings.ts`, `src/web/search/query.ts`, and `src/web/search/types.ts`; `packages/ui/src/stores/useWebSearchStore.ts`; Host enterprise network boundary policies
**Covers:** W6, W9, W10

## Native SDK References & Implementation Verification Requirements

Web search provider execution, configuration, and credentials reference native capabilities in `@oh-my-pi/pi-coding-agent`:
- `web/settings.ts`: registers native settings for web search services (e.g. `cfgExaEnabled`, `cfgExaSearchDelayMs`, `cfgSearxngEndpoint`, `cfgSearxngToken`, `cfgSearxngCategories`, `cfgSearxngEngines`).
- `web/search/types.ts`: defines `SearchProviderId`, `DEFAULT_WEB_SEARCH_TIMEOUT_SECONDS` (60s), `MAX_WEB_SEARCH_TIMEOUT_SECONDS` (300s), and provider error models.
- `web/search/providers/`: implements individual search engine transports (e.g. Tavily, SearXNG, Kagi, Jina, Perplexity, OpenAI, Ollama, OpenRouter, Exa).
- `security/auth-storage.ts`: manages write-only secure credentials for provider API tokens and keys.
- **Implementation verification requirement:** Implementing agents must verify exact settings identifiers, provider keys, and runtime behaviors against installed SDK source before exporting public contract definitions. Speculative Host SDK proposals are rejected; SDK execution remains strictly within the Bun Agent Service worker.
## Architecture & Boundaries

- **Worker ownership:** Dedicated Bun Agent Service worker owns web search settings, `AuthStorage` credentials, and search provider executions. All search queries and token handling execute within the worker runtime. UI and Node Host never import or execute native web search modules.
- **Host authentication & enterprise boundary:** Host Gateway enforces user authentication, workspace authorization, and existing `enterprise-mode.js` policy on all web search routes.
- **Canonical API & wire contract:**
  - `GET /api/agent/v1/workspaces/:workspaceId/web-search` returns `WebSearchConfigState`:
    - `workspaceId`: string
    - `revision`: uint64 decimal string
    - `enabled`: boolean
    - `selectedProviderId`: string | null
    - `fallbackProviderIds`: string[]
    - `timeoutSeconds`: number
    - `providers`: `WebSearchProviderEntry[]` (each containing `providerId`, `name`, `configured: boolean`, `requiresCredential: boolean`, `endpoint?: string`, `searchDelayMs?: number`, `categories?: string`, `engines?: string`, `options?: JsonObject`)
  - `PUT /api/agent/v1/workspaces/:workspaceId/web-search` accepts `WebSearchUpdateRequest` (configuration only, avoiding bulk credential+setting partial commits):
    - `expectedRevision`: uint64 decimal string
    - `enabled?`: boolean
    - `selectedProviderId?`: string | null
    - `fallbackProviderIds?`: string[]
    - `timeoutSeconds?`: number
    - `providerEndpoint?`: string
    - `providerSearchDelayMs?`: number
    - `providerCategories?`: string
    - `providerEngines?`: string
    - `providerOptions?`: JsonObject
  - `PUT /api/agent/v1/workspaces/:workspaceId/web-search/credentials/:providerId` writes provider credential under revision CAS:
    - `expectedRevision`: uint64 decimal string
    - `apiKey`: string (write-only secret committed to `AuthStorage`)
  - `DELETE /api/agent/v1/workspaces/:workspaceId/web-search/credentials/:providerId` removes provider credential under revision CAS:
    - `expectedRevision`: uint64 decimal string
- **Credential safety & route separation:**
  - Secret API keys are strictly write-only via dedicated credential routes, preventing undocumented bulk key+settings partial commits.
  - Public records in `GET` responses expose only boolean `configured: true | false` and opaque provider identity; keys are never read back.
- **Persistence & live apply outcomes:**
  - Persists settings via native `Settings.flush()` and credentials via `AuthStorage`.
  - Active session workers adopt new configuration immediately.
  - Responses report explicit persistence and active-worker apply outcomes: `{ status: "applied" | "partial" | "failed", workers: WebSearchWorkerApplyOutcome[] }`.
  - The service never reports fake reload success when an invalid configuration is supplied.
- **Route clean cutover:**
  - Legacy routes `/api/config/websearch` and `/api/websearch/provider` are removed.
  - No OpenCode compatibility shims or adapters.
- **Module ownership:**
  - Task 53 owns `useWebSearchStore.ts`, canonical client web search methods, and web search Settings UI panels.
  - Does not touch plugins, session warming, provider management, or file resource UI.

## Check

- Unit and contract tests for `WebSearchConfigStateSchema` and `WebSearchUpdateRequestSchema`.
- Worker tests verifying deterministic settings persistence, revision CAS conflict rejection (HTTP 409), and credential write-only masking.
- Host enterprise tests verifying adherence to `enterprise-mode.js` policies.
- UI store tests verifying migration of `useWebSearchStore` to CanonicalClient and removal of legacy `/api/config/websearch` endpoints.
- Parent runs focused tests plus controlled provider search against a mock or loopback endpoint without requiring external third-party API keys.

## Acceptance

- [x] Canonical contract defines `WebSearchConfigStateSchema` and `WebSearchUpdateRequestSchema` with uint64 decimal revision counters.
- [x] Agent Service and Host Gateway implement `/web-search` workspace endpoints under revision CAS.
- [x] Provider catalog and selection bind to native SDK search providers.
- [x] Dedicated write-only credential routes (`PUT/DELETE .../credentials/:providerId`) operate under revision CAS without bulk key+settings partial commits.
- [x] Host enterprise boundaries guard network requests per existing `enterprise-mode.js` policy.
- [x] `useWebSearchStore` cuts over to CanonicalClient; legacy `/api/config/websearch` and `/api/websearch/provider` routes are retired.
- [x] Node Host and UI remain free of native SDK imports.

## Progress

Focused verification passes: agent-contract and Agent Service web-search suites pass 29 tests / 147 assertions; UI Canonical Client/store coverage is included in that packet; Host web-search boundary tests pass within a 5-test packet. Worker tests exercise native provider discovery, Settings persistence/reopen, file-lock CAS conflicts, write-only AuthStorage credentials, exact identity, failed-write quarantine, and live authorization refusal immediately before native `runSearchQuery`. A separate successful `searchSearXNG` run against an ephemeral loopback HTTP server returned the controlled result and closed the listener. Source review confirms Node Host/UI have no native SDK imports and legacy search routes are absent. Connected W6/W9/W10 UI acceptance remains open.

2026-10-21 history audit and connected Web Search attempt: the task file was originally added in `55d9a4f60` with the real base `93d519221527e15cf52a5dde0d6ddf011c7527bb`; the stale placeholder was replaced with that base. In the isolated authenticated Web run on dist `c438247e…`, the Settings → Web search UI successfully selected SearXNG, removed Parallel leaving Tavily as the sole fallback, saved a 3-second timeout, and saved a Tavily key through the write-only password control. The authoritative GET showed revision 6 with SearXNG endpoint `http://127.0.0.1:4620`, fallback `web/tavily`, timeout 3, and Tavily `credentialConfigured: true`; the secret was absent from the DOM, GET response, settings/workspace config, Host log and search log, and the key input was cleared/Saved. **Search execution is blocked:** a chat `web_search` call failed with `Tool execution failed` / `Host policy refused the tool operation`, and the loopback SearXNG fixture received zero requests. Root cause is outside Task53's files: `packages/agent-service/src/worker/session.ts` authorizes the generic tool name `web_search`, but `packages/web/server/lib/host/worker-operation-authorizer.js` only admits native tool names or exact `policy.toolRequests`, so the native provider's own `authorize({type:'web-search'})` is never reached. Task53 remains open; owner is the Host tool-authorization boundary (Task44/Task17 or a focused follow-up), not the provider settings/store. Reused focused 29/147, Host 5, and the prior direct loopback proof without rerunning. Receipt: `.workflow/omp-migration/m3/task53-websearch-2026-10-21.json`.

Task63 landed (`88f13bf38`): the native `web_search` tool now reaches Host `{type:'web-search'}` authorization instead of the generic tool gate. The prior failed connected scenario was rerun on the fixed Agent Service dist and rebuilt Web dist: normal session `a0d7e7b1…` performed exactly one loopback SearXNG request (`task63 loopback`), completed the `web_search` tool and rendered `Task63 Loopback Result`; enterprise Host session `0bcb07f3…` was refused with `Host policy refused the tool operation` and produced zero new loopback requests. The original Task53 focused 29/147 and Host 5 evidence remains reused; Task63 added worker 15/114, Host 18/18, focused tsc and changed-file lint. Settings UI, write-only credential, scope filter, lazy tools and partial-retention evidence remain in the receipt. Task53 archived.
