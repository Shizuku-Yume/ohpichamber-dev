# 43: Define the remaining canonical mutation contracts

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740
**Started:** 2026-10-18
**Finished:** 2026-10-20

**Delivers:** Contract decisions for the retained UI mutations that cannot be migrated by the current read/catalog owners: session warming, provider OAuth and multi-account operations, custom provider integration fields, command configuration, and ModelControls permission/sampling/mode/pinned-model presentation. Each decision names the service/Host owner, public request/result shape, authorization and failure semantics, or records why the caller remains blocked.

**Blocked by:** None
**Files:** `packages/agent-contract/src/`, `packages/agent-service/src/`, `packages/ui/src/components/chat/ModelControls.tsx`, provider/settings callers, command store, `.workflow/omp-migration/contracts.md`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`

**Read first:** residual packets R1–R4; Task39 blocker receipt; canonical catalogs and mutation schemas; architecture ownership rules; current provider, command and warming callers.

**Covers:** W6, W9, W10

**Question:** Which missing canonical owners are required to retire the remaining OpenCode SDK callers, and what exact behavior must each owner expose?

**Method:** Compare every legacy mutation/read with an existing canonical schema and service owner. Record `resolved` only when request, result, failure, revision/CAS and runtime-surface behavior are complete. Record `blocked` when the canonical system lacks the behavior. Do not implement a compatibility adapter or silently remove a user-visible operation.

**Check:** Contract comparison receipt plus updated canonical contract/decision/development records. No source implementation, tests or builds unless a separate implementation task is created after the contract is settled.

## Progress

Continuation: missing Canonical schemas are implementation and design work, not external blockers. Native SDK research demonstrates that the installed `@oh-my-pi/pi-coding-agent` directly supports session warming (`cfgProvidersCacheWarming`, `AgentSession.setCacheWarmingMode`, `CacheWarmer`), provider OAuth and credentials, plugins, websearch, and resources. Actionable implementation tasks split out as contracts are settled:

- **ModelControls & Agent Selection:** Resolved and owned by Task 46 (`.workflow/tasks/omp-through-m3/46-native-agent-controls.md`).
- **Provider OAuth, Multi-Account, Custom Providers:** Defined and owned by Task 49 (`.workflow/tasks/omp-through-m3/49-native-provider-management.md`).
- **Session Warming:** Defined and owned by Task 50 (`.workflow/tasks/omp-through-m3/50-native-cache-warming.md`). Delivers canonical workspace cache-warming contract (`GET/PUT /api/agent/v1/workspaces/:workspaceId/cache-warming`), native SDK `cfgProvidersCacheWarming` persistence + active-root `session.setCacheWarmingMode`, and explicit active-worker apply outcomes.
- **Native File Resources (Commands, Prompt Templates, Authored Skills):** Defined and owned by Task 51 (`.workflow/tasks/omp-through-m3/51-native-file-resources.md`). Delivers canonical workspace endpoints (`/commands`, `/prompt-templates`, `/skills/files`) under revision CAS, backed by native SDK loaders (`loadSlashCommands`, `loadPromptTemplates`, skill discovery/builder) in Bun worker. Preserves Host source-commit authority for skills with active fanout; confines files to `.omp/commands/`, `.omp/prompts/`, `.omp/skills/` and agent directories; owns `useCommandsStore`, `useSkillsStore`, and `useSnippetsStore`.
- **Native Plugins & Extensions:** Defined and owned by Task 52 (`.workflow/tasks/omp-through-m3/52-native-plugins-extensions.md`). Delivers canonical workspace `/plugins` endpoints backed by native `PluginManager` and `MarketplaceManager` in Bun worker. Retains install, uninstall, enable/disable, updates, doctor, and local extension authoring under revision CAS with Host enterprise egress controls and explicit live apply outcomes; owns `usePluginsStore`.
- **Native Web Search:** Defined and owned by Task 53 (`.workflow/tasks/omp-through-m3/53-native-web-search.md`). Delivers canonical workspace `/web-search` endpoints backed by native search provider catalog, selection, fallback chain, timeouts, and write-only credentials via native `AuthStorage` in Bun worker with Host enterprise egress controls; owns `useWebSearchStore`.
- **Native Historical Usage Statistics:** Defined and owned by Task 54 (`.workflow/tasks/omp-through-m3/54-native-historical-usage.md`). Delivers canonical endpoints (`GET /api/agent/v1/usage` and `GET /api/agent/v1/usage/tools`) scoped by date range, viewer IANA timezone, and Host-authorized registered canonical session references. Backed by cold session transcript scanning and cold SessionManager in Bun service worker; preserves `UsageStatsView`, `usageStatsStore`, and `usageStatsModel` while replacing `packages/ui/src/lib/opencode/session-stats.ts` and all its consumers.
- **OpenCode policy projections:** Retired. `provider.use` and `integration.use` projection helpers had no production consumers outside their own tests; no Canonical replacement is added. Host enterprise egress remains enforced at the existing Host boundary, and tool authorization remains owned by Host approval policy and the native SDK.
- [x] Inventory ModelControls fields and all retained mutation callers.
- [x] Map provider and command operations to existing service owners or record gaps.
- [x] Specify that unused OpenCode `provider.use`/`integration.use` projections are retired without a replacement contract; preserve existing Host enterprise and approval-policy owners.
- [x] Keep Task17, Task36 and Task18 open until callers and connected acceptance are verified. M3 gate remains open.

- 2026-10-20 contract comparison closure (documentation only): the canonical `contracts.md` route matrix now carries the live Task 46 and Task 49-54 workspace/usage routes, schema names and revision owners; the earlier session `skills/install` row was removed because no live route implements it. Corrected four audit findings: restored the full `/skills/repositories` prefix in `contracts.md` prose (`POST .../skills/repositories/source`, `/scan`, `/install`); added `catalogs.ts` as schema owner for `AgentCatalog` (alongside `session.ts`) and `SkillInstallResult` (alongside `file-resources.ts` and `skill-repositories.ts`); and distinguished agent collection routes (`GET/POST /workspaces/:id/agents`) from member entity routes (`PUT/DELETE /workspaces/:id/agents/:agentId`). `contracts.md` owns the shared semantics, this task's `## Findings` owns the owner/route closure map, and `development.md` records the superseding status. No tests, build, lint, type-check, docs or workflow validation ran; Task 18 owns those checks and Task 36 owns connected W6-W10 evidence. The task remains active and unarchived.

**Stop condition:** No field dropping, fake success, pass-through adapter, or unverified contract export.

### 2026-10-18 Prior Canonical-schema gap audit (superseded as blocker authority)

*Classification note (2026-10-18):* This historical read-only audit evaluated production callers against the initial Canonical contract export and recorded gaps where Canonical schemas were not yet authored. This audit is preserved below for traceability, but its earlier conclusion that missing schemas constitute an external blocker is superseded. Missing schemas represent our implementation work rather than external blockers. Installed native SDK research confirms that native support exists for plugins, websearch, warming, and resources. Actionable owners (Task 46 for agent controls, Task 49 for provider management, Task 50 for session warming) resolve these boundaries with intentional contracts; remaining areas proceed under active native design.

**Superseded 2026-10-20:** the route/schema gap is closed in source and in the canonical contract route matrix. Its dated `/api/config/*`, `session.stats`, `plugin.*` and similar operation names are historical inputs, not current routes. The closure map and current owner routes are under `## Findings` below.

### Prior finding: Initial audit of Canonical schema coverage (historical)

No evaluated caller across the nine functional areas maps to an existing canonical schema and service owner with complete request, result, failure, and revision/CAS behavior. Because project rules forbid compatibility adapters, pass-through shims, or deleting user-facing functionality, none of these callers can be safely migrated at this time. All nine areas remain explicitly blocked on canonical contract specifications.

### Missing canonical semantics by area (no invented APIs)

1. **Provider OAuth (`ProviderOAuthMethods.tsx`, `provider-oauth.ts`):** Canonical contracts only define OAuth for MCP servers (`MCPOAuthRequestSchema`); `ProviderCredentialWriteRequestSchema` accepts pre-obtained tokens (`accessToken`, `refreshToken`, `expiresAt`) without lifecycle flow endpoints. Missing canonical semantics: interactive browser authorization flows, authorization URL generation and instructions, status polling (`sdk.integration.oauth.status`), authorization code exchange (`complete`), and cancellation endpoints in Agent Service.
2. **Multi-Account Management (`ProvidersPage.tsx`, `ProviderAccounts.tsx`, `providerAuth.ts`):** Canonical `ProviderSchema` models provider authentication strictly 1:1 via `ProviderAuthStateSchema` (`missing` | `configured`). Missing canonical semantics: multiple stored credentials per provider, credential labels/naming (`sdk.credential.update`), active credential selection/activation (`sdk.credential.activate`), and per-credential removal.
3. **Custom Provider Integration (`CustomProviderForm.tsx`, `custom-provider-form.ts`, `ProvidersPage.tsx`):** Canonical `ProviderConfigurationSchema` only defines basic `{ providerId, name, endpoint, protocol, credentialRef }`. Missing canonical semantics: arbitrary HTTP headers (`headers: Record<string, string>`), model discovery proxy (`/api/provider/discover-models`), custom reasoning variant overlays, configuration layer scoping (`user` vs `project` vs `custom`), and atomic upsert operations.
4. **Session Warming Keep-Alive (`SessionWarmingCheckbox.tsx`):** Prompt cache keep-alive / warming is absent from `@openchamber/agent-contract` and `packages/agent-service`. Missing canonical semantics: warming state schema, persistence route (`PUT /api/config/warming`), and Agent Service background keep-alive lifecycle management.
5. **Slash / Custom Commands (`useCommandsStore.ts`):** Canonical contract defines no command catalog. Missing canonical semantics: command catalog schema, command file persistence, and mutation endpoints (`POST/PATCH/DELETE /api/config/commands/:name`).
6. **Plugin Management (`usePluginsStore.ts`, `plugins.ts`):** OpenCode plugin architecture (npm packages and local JS plugin files) has no equivalent in OMP, where extensibility is governed by MCP and Skills. Missing canonical semantics: plugin package installation, local plugin file authoring, runtime listing (`plugin.list`), update checks (`plugin.check`), and package updates (`plugin.update`).
7. **Web Search Configuration (`useWebSearchStore.ts`, `websearch.ts`):** Web search is treated as an OpenCode-specific tool integration. Missing canonical semantics: web search provider catalog, provider selection persistence (`GET/PUT /api/config/websearch`), and API key credential routes.
8. **Historical Usage Statistics (`UsageStatsView.tsx`, `usageStatsStore.ts`, `session-stats.ts`):** Canonical contract defines single-message token counts (`TokenUsageSchema`) and completion token counts (`CompletionUsageSchema`). Missing canonical semantics: aggregated historical usage/activity API (`sdk.session.stats`) across sessions, projects, date ranges, and tool breakdowns. Resolved and owned by Task 54 (`.workflow/tasks/omp-through-m3/54-native-historical-usage.md`).
9. **Config Mutations & Policies (`ProviderGrid.tsx`, `useIntegrationPolicyBlock.ts`, `useAgentsStore.ts`, `useSkillsStore.ts`, `useSnippetsStore.ts`):** Provider and integration policy checks evaluate OpenCode configuration layer trees (`provider.use`, `integration.use`). Missing canonical semantics: canonical policy evaluation schemas, agent permission ruleset mutation schemas (`PATCH /api/config/agents/:name`, blocked on Task 39), and skill/snippet source file authoring/CRUD endpoints (`/api/config/skills/*`, `/api/config/snippets/*`).

Existing blockers remain open: Tasks 17, 36, 39, and 18 are not closed. No W7–W10 or M3 completion is claimed.

## Findings


**Answer (2026-10-20):** No additional implementation owner is missing. The installed native SDK and the Agent Service/Host boundary already own every area this task compared. The canonical contract now records each current route family, revision boundary and failure semantics, so the remaining work is verification and caller evidence, not contract invention.

### Owner and route closure map

| Area | Retained caller replaced | Current canonical owner | Implementation | Recorded contract |
|---|---|---|---|---|
| Agent selection and ModelControls | Legacy ConfigStore agent record, `mode`/`hidden`/`displayName` filtering, `/api/agent` startup polling, sampling tooltip metadata | `GET/POST /workspaces/:id/agents, PUT/DELETE /workspaces/:id/agents/:agentId`; `AgentCatalog`, `Agent*Request`, `AgentMutationResult` | Task 46 | Agent roster/controls section; `session.ts`, `catalogs.ts` |
| Provider OAuth | `ProviderOAuthMethods.tsx`, `provider-oauth.ts` | `GET .../providers/oauth-methods`; `POST .../providers/:providerId/oauth`; `ProviderOAuthMethods`, `ProviderOAuthRequest`, `ProviderOAuthResult` | Task 49 | Provider accounts/OAuth section; `provider-management.ts` |
| Multi-account management | `ProvidersPage.tsx`, `ProviderAccounts.tsx`, `providerAuth.ts` | `GET/POST .../providers/:providerId/accounts`; `ProviderAccounts`, `ProviderAccountMutationRequest` | Task 49 | Provider accounts/OAuth section; `provider-management.ts` |
| Custom providers | `CustomProviderForm.tsx`, `custom-provider-form.ts`, `/api/provider/discover-models` | `GET/PUT .../providers/:providerId/config`, `POST .../providers/discover`; `ProviderConfigurationRead`, `ProviderConfigureRequest`, `ProviderModelDiscoveryRequest/Result` | Task 49 | Provider accounts/OAuth section; `provider-management.ts`, `catalogs.ts` |
| Session cache warming | `SessionWarmingCheckbox.tsx`, `/api/config/warming` | `GET/PUT .../cache-warming`; `CacheWarmingState`, `CacheWarmingUpdateRequest`, `CacheWarmingApplyResult` | Task 50 | Cache warming section; `warming.ts` |
| Slash/custom commands | `useCommandsStore.ts`, `/api/config/commands/*` | `GET/POST /commands`, `PATCH/DELETE /commands/:commandId`, `POST /commands/expand`, `POST /commands/expand-text`; `CommandCatalogState`, `Command*Request`, `FileResourceExpandResult`, `FileResourcePromptInputResult` | Task 51 | Commands/templates/skills section; `file-resources.ts` |
| Prompt templates/snippets | `useSnippetsStore.ts`, `/api/config/snippets/*` | `GET/POST /prompt-templates`, `PATCH/DELETE /prompt-templates/:templateId`, `POST /prompt-templates/expand`, `POST /prompt-templates/expand-text`; `PromptTemplateCatalogState`, `PromptTemplate*Request` | Task 51 | Commands/templates/skills section; `file-resources.ts` |
| Authored skills and trusted installation | `useSkillsStore.ts`, `/api/config/skills/*` | `/skills/catalog`, `/skills/expand`, `/skills/files...`, `/skills/repositories...`; `FileResourceSkillCatalog`, `SkillFile*`, `SkillInstallResult`, `SkillRepository*` | Task 51 | Commands/templates/skills section; `file-resources.ts`, `skill-repositories.ts`, `catalogs.ts` |
| Plugins and extensions | `usePluginsStore.ts`, `/api/config/plugins`, `/api/integration` plugin routes | `/plugins`, `/plugins/install`, `/plugins/uninstall`, `/plugins/apply`, `/plugins/marketplace`, `/plugins/doctor`, `/plugins/:pluginName`, `/plugins/:pluginName/update`, `/plugins/local/:extensionId`; `Plugin*` schemas and `LocalExtension*` schemas | Task 52 | Plugins section; `plugins.ts` |
| Web search | `useWebSearchStore.ts`, `/api/config/websearch`, `/api/websearch/provider` | `GET/PUT .../web-search`, `PUT/DELETE .../web-search/credentials/:providerId`; `WebSearchConfigState`, `WebSearchUpdateRequest`, `WebSearchCredential*Request`, `WebSearchMutationResult` | Task 53 | Web search section; `websearch.ts` |
| Historical usage | `UsageStatsView.tsx`, `usageStatsStore.ts`, `session-stats.ts` | `GET /usage`, `GET /usage/tools`; `UsageStats`, `UsageToolsResponse` | Task 54 | Historical usage section; `usage.ts` |
| Config mutations and policies | `PATCH /api/config/agents/:name`, `/api/config/skills/*`, `/api/config/snippets/*`, `provider.use`/`integration.use` helpers | Agent profile routes carry `allowedTools`/`permissionPresetId`; command and skill routes replace file CRUD; policy projections retired without replacement | Tasks 46, 51, 43 | Agent/files sections; Host enterprise and native-SDK approval owners |
| OpenCode policy projections | `provider.use` / `integration.use` helpers | None; retired without replacement | Task 43 | Policy boundary resolution below |

### Route-matrix corrections and ownership notes

- The stale `POST /sessions/:sessionId/skills/install` row was removed: no live Host or service route implements it. Trusted installation now commits through workspace `/skills/files` (authored files) and `/skills/repositories/install`; session `.../skills/apply` only reapplies an existing Host source revision. Session `.../skills/catalog` and `.../skills/expand` remain.
- Provider OAuth route `:providerId` is the native login-method identity; the stored provider identity is the result's `providerId`/`storeCredentialsAs`. Account routes use the stored provider ID.
- Revision owners differ deliberately: provider/agent/command/template/warming use the workspace or selected-agent catalog revision; authored skills and repository installs use the independent Host source revision; plugins use the actual native plugin/profile root; web search uses the native settings owner. None of these is a workspace-wide applied-success flag.
- Task 46 adds no new route. Its missing semantics were roster authority, native `providerId`/`modelId` binding, tool availability versus authorization, and client-side selection/favorites, now recorded in the contract.
- No new `decisions.md` entry is required. These owners implement decisions already settled for the canonical agent roster, native agent controls, provider ownership and enterprise boundaries; route names follow live source rather than a new product choice.

### Evidence boundary and remaining uncertainty

- This is a source-contract comparison and documentation deliverable. I ran no tests, build, lint, type-check, docs validation or workflow validation; Task 18 owns final checks. Focused results recorded by owners (for example Task 50's 27 tests, Task 53's 29 tests, Task 54's 37 tests plus Host route tests) remain their evidence and were not rerun here.
- Connected W6-W10 evidence remains Task 36's. Task 49, 52 and any unticked owner acceptance items stay with their task files; this record does not advance an M3 gate or close Tasks 17/18/36.
- Task 49's real official-provider OAuth grants remain unexercised; the documented lifecycle is source-level behavior plus controlled fixtures.
- Skill repository routes are attributed to Task 51 through its shared Host skill-source owner; Task 51's file list names the authored-file/provenance modules rather than the repository catalog route files.
- The comparison covers the Task 46 and Task 49-54 families. Other live workspace route families (for example MCP) have separate migration owners and are not reopened by this task.
