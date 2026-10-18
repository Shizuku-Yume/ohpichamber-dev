# 43: Define the remaining canonical mutation contracts

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740
**Started:** 2026-10-18
**Status:** active

**Delivers:** Contract decisions for the retained UI mutations that cannot be migrated by the current read/catalog owners: session warming, provider OAuth and multi-account operations, custom provider integration fields, command configuration, and ModelControls permission/sampling/mode/pinned-model presentation. Each decision names the service/Host owner, public request/result shape, authorization and failure semantics, or records why the caller remains blocked.

**Blocked by:** None
**Files:** `packages/agent-contract/src/`, `packages/agent-service/src/`, `packages/ui/src/components/chat/ModelControls.tsx`, provider/settings callers, command store, `.workflow/omp-migration/contracts.md`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`

**Read first:** residual packets R1–R4; Task39 blocker receipt; canonical catalogs and mutation schemas; architecture ownership rules; current provider, command and warming callers.

**Covers:** W6, W9, W10

**Question:** Which missing canonical owners are required to retire the remaining OpenCode SDK callers, and what exact behavior must each owner expose?

**Method:** Compare every legacy mutation/read with an existing canonical schema and service owner. Record `resolved` only when request, result, failure, revision/CAS and runtime-surface behavior are complete. Record `blocked` when the canonical system lacks the behavior. Do not implement a compatibility adapter or silently remove a user-visible operation.

**Check:** Contract comparison receipt plus updated canonical contract/decision/development records. No source implementation, tests or builds unless a separate implementation task is created after the contract is settled.

## Progress

Continuation: missing Canonical schemas are implementation work, not an external blocker. Five read-only sessions are checking installed native SDK owners for agent controls, provider authentication, resources, helpers, and connected browser execution. The coordinator owns contract decisions and integration; existing assembled migration edits remain in this worktree and are preserved. No additional historical smoke is required for this design step.

- [x] Inventory ModelControls fields and all retained mutation callers.
- [x] Map provider and command operations to existing service owners or record gaps.
- [ ] Specify request/result/error/revision behavior for any newly settled contract.
- [x] Split implementation tasks only for complete contracts; retain explicit blockers for the rest.
- [ ] Keep Task17, Task36 and Task18 open until callers and connected acceptance are verified.

**Stop condition:** No field dropping, fake success, pass-through adapter, or unverified contract export.

## 2026-10-18 Read-only caller and contract audit

A read-only audit evaluated production callers across the nine areas identified in Task 43: provider OAuth, multi-account management, custom provider integration, session warming, command configuration, plugin management, websearch configuration, historical usage statistics, and config mutations / policy filtering.

### Finding: No contract-complete bounded slice exists

No evaluated caller across the nine functional areas maps to an existing canonical schema and service owner with complete request, result, failure, and revision/CAS behavior. Because project rules forbid compatibility adapters, pass-through shims, or deleting user-facing functionality, none of these callers can be safely migrated at this time. All nine areas remain explicitly blocked on canonical contract specifications.

### Missing canonical semantics by area (no invented APIs)

1. **Provider OAuth (`ProviderOAuthMethods.tsx`, `provider-oauth.ts`):** Canonical contracts only define OAuth for MCP servers (`MCPOAuthRequestSchema`); `ProviderCredentialWriteRequestSchema` accepts pre-obtained tokens (`accessToken`, `refreshToken`, `expiresAt`) without lifecycle flow endpoints. Missing canonical semantics: interactive browser authorization flows, authorization URL generation and instructions, status polling (`sdk.integration.oauth.status`), authorization code exchange (`complete`), and cancellation endpoints in Agent Service.
2. **Multi-Account Management (`ProvidersPage.tsx`, `ProviderAccounts.tsx`, `providerAuth.ts`):** Canonical `ProviderSchema` models provider authentication strictly 1:1 via `ProviderAuthStateSchema` (`missing` | `configured`). Missing canonical semantics: multiple stored credentials per provider, credential labels/naming (`sdk.credential.update`), active credential selection/activation (`sdk.credential.activate`), and per-credential removal.
3. **Custom Provider Integration (`CustomProviderForm.tsx`, `custom-provider-form.ts`, `ProvidersPage.tsx`):** Canonical `ProviderConfigurationSchema` only defines basic `{ providerId, name, endpoint, protocol, credentialRef }`. Missing canonical semantics: arbitrary HTTP headers (`headers: Record<string, string>`), model discovery proxy (`/api/provider/discover-models`), custom reasoning variant overlays, configuration layer scoping (`user` vs `project` vs `custom`), and atomic upsert operations.
4. **Session Warming Keep-Alive (`SessionWarmingCheckbox.tsx`):** Prompt cache keep-alive / warming is absent from `@openchamber/agent-contract` and `packages/agent-service`. Missing canonical semantics: warming state schema, persistence route (`PUT /api/config/warming`), and Agent Service background keep-alive lifecycle management.
5. **Slash / Custom Commands (`useCommandsStore.ts`):** Canonical contract defines no command catalog. Missing canonical semantics: command catalog schema, command file persistence, and mutation endpoints (`POST/PATCH/DELETE /api/config/commands/:name`).
6. **Plugin Management (`usePluginsStore.ts`, `plugins.ts`):** OpenCode plugin architecture (npm packages and local JS plugin files) has no equivalent in OMP, where extensibility is governed by MCP and Skills. Missing canonical semantics: plugin package installation, local plugin file authoring, runtime listing (`plugin.list`), update checks (`plugin.check`), and package updates (`plugin.update`).
7. **Web Search Configuration (`useWebSearchStore.ts`, `websearch.ts`):** Web search is treated as an OpenCode-specific tool integration. Missing canonical semantics: web search provider catalog, provider selection persistence (`GET/PUT /api/config/websearch`), and API key credential routes.
8. **Historical Usage Statistics (`UsageStatsView.tsx`, `usageStatsStore.ts`, `session-stats.ts`):** Canonical contract defines single-message token counts (`TokenUsageSchema`) and completion token counts (`CompletionUsageSchema`). Missing canonical semantics: aggregated historical usage/activity API (`sdk.session.stats`) across sessions, projects, date ranges, and tool breakdowns.
9. **Config Mutations & Policies (`ProviderGrid.tsx`, `useIntegrationPolicyBlock.ts`, `useAgentsStore.ts`, `useSkillsStore.ts`, `useSnippetsStore.ts`):** Provider and integration policy checks evaluate OpenCode configuration layer trees (`provider.use`, `integration.use`). Missing canonical semantics: canonical policy evaluation schemas, agent permission ruleset mutation schemas (`PATCH /api/config/agents/:name`, blocked on Task 39), and skill/snippet source file authoring/CRUD endpoints (`/api/config/skills/*`, `/api/config/snippets/*`).

Existing blockers remain open: Tasks 17, 36, 39, and 18 are not closed. No W7–W10 or M3 completion is claimed.
