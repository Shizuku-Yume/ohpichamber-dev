# OMP migration through M3

**Status:** in progress
**Priority:** high

## What this is for

The adopted application executes through the Host-supervised Bun Agent Service. The compiled Canonical contract, M1 Host boundaries, the M2 service and credential-handoff gates, and the M3 Canonical Client cutover with task 17 legacy retirement are implemented. The final root gate passed at `8d179c4e2` on 2026-10-22 (all seven phases exit 0; `.workflow/omp-migration/m3/task18-gate-final-2026-10-22.json`), and the a92 matrix PASS covers W7 visual sanity, W8, W9 child/Board/Guest, W10 and PWA. The technical W1-W10 gate is complete and Task18/Task57 technical work is archived; final maintainer acceptance is pending. M4 orchestration and M5 packaged/mobile/Docker release certification remain open and are not passed by this effort. The maintainer requested migration through M3 acceptance, using concurrent OMP sessions where task boundaries permit and avoiding repeated checks or speculative defensive code.

[Development progress](../development.md) remains the owner of observed evidence, accepted limits and the exact next step. This effort continues that work rather than acquiring upstream source or repeating accepted probes.

## What it does

Web and Electron use OMP through the Host Gateway. A user can create a session, submit an attached prompt, observe reasoning and tool execution, answer approvals and questions, abort, retry, reload and reopen the transcript. Reconnecting obtains an authoritative snapshot and resumes from its cursor without duplicating parts. A runtime switch cannot publish responses from the previous runtime.

Retained consumers use canonical commands and records. This includes the sidebar and Board launch, composer commands and skills, provider/model/agent/MCP settings, Guest Shell observation, and utility generation. Host filesystem, Git, worktree, PTY, authentication, pairing, relay, notification and voice capabilities keep their existing owners.

M3 acceptance does not claim M4 autonomous-feature certification or M5 packaged/mobile/Docker release certification. Their existing callers still require a coherent canonical execution dependency where needed to retire the old client. No retained caller may rely on an OpenCode fallback.

## How it is built

### Authorities

Product decisions remain in [scope](../omp-migration/scope.md), protocol behavior in [contracts](../omp-migration/contracts.md), topology in [architecture](../omp-migration/architecture.md), and milestone gates in the [implementation plan](../omp-migration/implementation-plan.md). This spec owns execution boundaries and checks through M3, not a second protocol definition.

The existing prerequisite was closed at its source/document boundary by `decisions.md: 2026-10-11 - Rebaseline task closes at source and document boundary`. Its unexercised certification is not silently marked passed.

### M0 evidence and contract reconciliation

Use the pinned official OMP 18.8.9 source and existing identity/evidence records as the comparison input. Task 19 observed that the published package and exercised first-party owners differ from that source. Task 24 established an installable source-derived dependency closure; its strict probe exit 1 remains recorded and no prompt was submitted. Task 08 must preserve those identities and re-establish application owners before dependency acceptance. Keep authored TypeScript, generated assets, native wrappers and prebuilt addon identities distinct; a matching version number is not source identity.

Task 01 completed the real SDK Guest Shell command probe through the OMP execution owner, observing start, output, exit status, cancellation and retention limits. Service reconnect, byte cursors, retained terminal history and capability-enforced scope isolation remain task 12 acceptance, not SDK guarantees. Reuse existing lifecycle, completion, MCP and isolation reports only for unchanged exercised owners.

Before exporting types, reconcile draft contradictions and unsupported assumptions with source and measurements. These include public absolute directory paths, event naming, snapshot/cursor atomicity, stream error status before versus after headers, metadata ownership, credential and skills storage paths, and question/approval resolution versions. Service-only behavior such as stale reply rejection still needs service evidence; a direct SDK fixture is not a substitute.

Task 19 measured isolated default/XDG AuthStorage paths separately from explicit agent-directory override; task 24 established the source-derived installed identity. Neither proves stored-credential conversion or model discovery. Task 02's [evidence boundaries](../omp-migration/implementation-plan.md#evidence-boundaries-for-gate-03) identify remaining original M0 requirements for task 03 to judge.

Tasks25-28 filled reachable M0 public-factory/auth/skills/permission, MCP configuration/transport and actual Linux Host PTY gaps. Task29 is archived with its valid corrected custom-proxy stored-key execution receipt and its defective disposable source discarded without reuse; [development.md](../development.md#additional-m0-reachable-evidence) owns the precise run and review state. These investigations reuse task24's immutable inputs and preserve all failures, partials and unavailable results. `decisions.md: 2026-10-12 - Enter M1 with the observed provider path and explicit OAuth limitation` accepts missing official-provider/OAuth feasibility for M1 only. `decisions.md: 2026-10-12 - Leave unavailable platform evidence outside the M0 release condition` withdraws task30 as a mandatory pass; no platform run occurred. Task31 supplied the final required real public installed-SDK online discovery evidence, its reviews passed and its disposable source was deleted without reuse. Gate03 accepts this M0 handoff for M1 after validation and archival. No completion rerun, provider/platform status upgrade or M1/runtime implementation is claimed.

### M1 host boundary

Move the 19 Host modules named by [scope](../omp-migration/scope.md#preserving-host-infrastructure-in-libopencode) out of `lib/opencode`, updating callers without re-exports. Preserve modules already owned by filesystem, Git, terminal, environment, guests and source-control integrations. Legacy SSE `watcher.js`, `.opencode` snippet CRUD `snippets.js` and mixed execution `shutdown-runtime.js` are not generic Host extraction; retain still-used execution owners until replacement dependencies and coordinated M3 retirement are ready.

Inventory VS Code references before retirement. Remove extension entrypoints, package/build/release paths and UI-specific bridges while preserving external editor launching and VS Code theme import. Generated release notes remain read-only.

Expose canonical health/capability state through the Host, preserving authentication and per-window runtime URLs. M1 task 05 implements authenticated explicit credential-handoff intent/preflight and provider-specific boundaries. Without the real service it reports unavailable, reads/stages no secrets and claims no import; no Node SDK AuthStorage write or ad-hoc pre-M2 worker is allowed. Actual handoff remains mandatory in task 22 after M2 SDK integration.

Deletion follows replacement dependencies. Task 21's M1 gate proves Host extraction, metadata/handoff ownership and extension retirement, not final execution-owner deletion. Task 22 migrates server execution consumers before M2 gate 23. Task 17 performs coordinated M3 lifecycle/proxy/config/auth retirement only after service, server and UI consumers plus explicit credential handoff are ready. M1 extraction cannot require the service whose implementation it unlocks; final retirement acceptance remains mandatory at M3.

### M2 service and host integration

The Node Host Gateway supervises a private Bun Agent Service. Dedicated SDK workers own their session cwd, resolved environment and cleanup. OMP remains the only transcript writer. Host-owned metadata and SQLite delivery state do not duplicate conversation history.

A shared canonical contract package contains JSON-safe records, command responses and ordered events without SDK or OpenCode types. A single service projector supplies history and live records with stable IDs. Host authorization applies to host-tool access independently of client visibility.

Before enabling the canonical runtime, migrate server execution consumers and browser callers; no second authority remains. Move goals/recap/context cursor/pins to Host metadata before removing their source. M2 task 22 completes the explicit credential handoff through the real Bun service, proving SDK AuthStorage write/read-reload and provider-specific imported/unsupported/re-authentication outcomes. Host obtains only selected credentials after service readiness, sends them privately, stages no secrets and never imports at startup. Gate 23 requires actual handoff evidence; task 17 removes importer and legacy readers at cutover.

Implement actual approval/question request handles and versioned resolution. A worker restart invalidates old requests; an old response cannot resolve a new request. Implement the durable Host queue cutover, scoped Shell projection, catalogs/configuration, and stateless completion through their verified owners. No empty-success stand-ins.

### M3 client cutover

Replace OpenCode input to sync and loaders with the Canonical Client. Migrate records, reducers and all dependent components directly; do not disguise legacy fields behind aliases. Preserve useful rendering and directory/global scope separation.

Cut over composer submission, attachments, abort, retry, steering, follow-up and queue operations. Update registry/settings consumers and remove engine-specific controls. Cut over Board, Guest Shell, utility-generation and execution-dependent retained callers. Host-owned user filesystem APIs stay separate from agent tools.

After dependent callers move, remove the old UI client, translators, runtime selectors, config/auth/lifecycle routes and imports made obsolete by the cutover. Later M5 work remains explicit rather than represented as passed by a Linux development run.

### Parallel ownership

Each implementation task owns an isolated worktree and one bounded set of files. The coordinator owns shared package manifests, lockfile, gateway composition, shared protocol changes and integration. Read-only sessions may share a tree.

Implementation advances through gates 03 (M0), 21 (M1 extraction/preflight), 23 (M2 real service/server consumers/credential handoff), then 18 (M3). Tasks 01/19 are independent investigations; task 24 resolves source-install identity before task 02; independent evidence tasks 25, 26, 27 and 28 follow 02 before gate 03. M1 extension retirement can run independently of extraction; metadata and health/preflight follow extraction, without premature SDK import. M2 interaction (10), queue owner/dispatcher source (11) and catalogs/Shell (12) follow projection (09); task 22 follows tasks 10 and 12 acceptance to compose server consumers and explicit credential handoff using the committed task 11 queue source, task 11 then completes its final composed queue acceptance, and gate 23 requires both tasks 11 and 22 (`decisions.md: 2026-10-13 - Remove the M2 queue and consumer acceptance cycle`). M3 shared client/sync core is delivered by task 13; native child subagent projection, session registry, and history navigation are delivered by task 32 (blocked by 13); task 16 remains independent of 32 after 13; consumer UI slices 14 (session/composer timeline navigation) and 15 (sidebar subagent hierarchy) advance in parallel once 13 and 32 land; task 17 activates and retires obsolete owners (blocked by 14, 15, 16, 22, transitively requiring 32 via 14 and 15); and task 18 acceptance requires 32 explicitly. No stage advances past an unmet gate; coordinator resolves shared-contract changes before dependent slices land.
### M3 continuation breakdown (historical, completed)

Task 17 was the owner of residual production UI caller migration, Host lifecycle retirement, and packaged Agent Runtime closure. The remaining work was split into isolated test-contract slices followed by one connected acceptance run:

- **Task 33** modernizes chat, message, turn, and `SyncProvider` test fixtures against canonical DTOs.
- **Task 34** modernizes sidebar, session-collection, worktree, and remaining UI fixture contracts. Tasks 33 and 34 are independent and may run in separate worktrees.
- **Task 35** converges the UI test project after Tasks 33/34 and Task 17, fixing only directly evidenced residual contract drift.
- **Task 36** runs the single connected Web/Electron W7-W10 packet, including packaged Electron behavior and durable receipts; Task 18 assembles the final gate from that packet and the unchanged W1-W6 evidence.

### Current status (2026-10-22)

The M3 implementation is complete through the a92 matrix on artifact `a92fbb36…` at source `8d179c4e2`: W7 visual sanity, W8, W9 packaged child/Board/Guest, W10 and PWA pass; W1-W6 reuse archived M0/M1/M2/Task36 receipts (`.workflow/omp-migration/m3/task57-a92-matrix-2026-10-22/`). The W8 fix is `f4e609dc1`: the old raw trace showed seq7 `part.started` content `w8` plus seq8 delta `w8`; a92 records an empty start, one delta and a stable one-token final body. Child snapshot 404 is the intentional history-only contract. Limits: packaged live-region at 400 ms is inconclusive while the Web announcement was observed; PWA auth proof is the Web Host with existing packaged state, not packaged Electron password auth. The final root gate passed at `8d179c4e2` on 2026-10-22 (all seven phases exit 0; `.workflow/omp-migration/m3/task18-gate-final-2026-10-22.json`); Task18 and Task57 technical work is archived; the technical W1-W10 gate is complete and final maintainer acceptance is pending. M4 orchestration and M5 packaged/mobile/Docker release certification remain open; this closure does not select or claim an M4 implementation. The earlier `b9fbb4bb0` gate and `068a` artifacts remain historical evidence.

### Remaining effort and exit order (2026-10-17) — historical planning snapshot, superseded 2026-10-22

The four implementation packets and the final gate are complete (a92 matrix plus final root gate PASS at `8d179c4e2`); the technical M3 gate is complete and final maintainer acceptance is pending. This snapshot remains only as history; M4/M5 remain open.

The E1–E5 table and E2 sub-slices below are the 2026-10-17 planning snapshot, retained for history. Their remaining-work wording is not a current claim or open work; current status is the technical-gate-complete state above.

| Packet | Evidence at plan time | Planned deliverable | Planned effort |
|---|---|---|---|
| E1 — UI fixture convergence | The strict UI test-project check exits 0; the 21-file packet passes 264 tests / 984 assertions. The direct lint run reports 19 findings, classified as 9 introduced and 10 pre-existing baseline findings. | Remove the 9 introduced findings, preserve the 10 unchanged baseline findings under the anti-slop ratchet policy, and archive Tasks 33–35 with the clean check and focused result. | 1 focused coordinator session |
| E2 — retained caller closure | The source inventory identifies 31 non-test `@/lib/opencode/model` type consumers, 15 `@/lib/opencode/client` call sites, and 67 total legacy helper reach-ins. | Move each remaining production consumer to an existing canonical owner, or create a separate task only when the current contract lacks a real owner. No aliases or fallback paths. | 2–4 bounded owner slices, parallel where files do not overlap |
| E3 — Host lifecycle retirement | The Host composition root still registers the legacy execution owner set; routes remain only while verified callers use them. | Remove the managed-OpenCode lifecycle/proxy/config/auth owners after E2, preserving Host services and live `/api/agent/v1` readiness/auth boundaries. | 1 integration slice |
| E4 — connected acceptance | The a92 matrix supplies connected W7–W10/PWA evidence on artifact `a92fbb36…` (source `8d179c4e2`); W1–W6 reuse archived receipts. | One connected Web plus packaged Electron packet covering W7–W10, with durable sanitized receipts. | Complete |
| E5 — final gate | The final root gate passed at `8d179c4e2` (all seven phases exit 0; `.workflow/omp-migration/m3/task18-gate-final-2026-10-22.json`); Task18/Task57 technical work is archived. | Run the workspace checks once, inspect dead-code output, update development/task/spec evidence, and close only evidenced W1–W10 items. | Technical gate complete; final maintainer acceptance pending |

**E2 sub-slices (historical 2026-10-17 planning snapshot; superseded):** (a) canonical model/helper types for chat, layout, multirun and provider presentation; (b) runtime endpoint, health and connection state for `runtimeEndpointReset`, `useConfigStore` and connection polling; (c) provider integration/configuration mutations and session-warming controls; (d) retained tool, web-search, plugin, stats and ID helpers with canonical owners; (e) Git initialization and remaining host capability callers; (f) Electron path/remote management imports; (g) Host composition, proxy and route retirement after all callers land. Each slice had to name its exact current owner and prove the affected behavior; a missing canonical owner blocked that slice instead of producing an adapter.
**2026-10-17 execution update:** The first E2(b) slice is implemented: `CanonicalClient.checkReady()` validates `GET /api/agent/v1/ready`; `useConfigStore`, startup recovery diagnostics, and configuration refresh polling now use the canonical Agent Service readiness owner. The retained OpenCode client remains bound only where other uncut callers still require it, so runtime endpoint rebinding and legacy `/api/opencode/health` retirement stay open. Focused readiness tests pass; the full canonical transport file retains one unrelated pre-existing MCP fixture failure. Remaining E2 is the owner-by-owner cutover of the 31/15 callers, followed by E3 lifecycle retirement, E4 connected acceptance, and E5 final checks.
**2026-10-18 execution update:** E2(a/c) now includes the bounded `AgentSelector` store cutover: `packages/ui/src/components/sections/commands/AgentSelector.tsx` consumes `useAgentsStore` and `selectAgentsForDirectory` instead of issuing component-level `canonicalClient.resolveWorkspace/getAgents` requests. Existing native agent store and catalog-refresh suites pass (`21` tests / `103` assertions); the UI build and touched-file oxlint pass. The broader ConfigStore duplicate agent catalog and legacy chat consumers remain open; this slice intentionally does not claim the agent catalog cutover complete.
**2026-10-18 provider slice:** Canonical provider disconnect now treats any stored canonical credential (`api-key` or `oauth`) as eligible for the existing revision-checked `deleteProviderCredential` path; the UI no longer gates that action on the legacy API-key method. Provider auth tests pass (`24` tests / `62` assertions). OAuth handshake, multi-account actions, and custom integration form fields remain explicitly blocked by missing canonical contracts; no compatibility path was added.
**2026-10-18 refresh continuation:** `catalogRefresh.ts` no longer invalidates or reloads the duplicate ConfigStore agent catalog; agent events refresh only `useAgentsStore` for the ambient and addressed directories. The canonical refresh regression file passes (`4` tests / `18` assertions), the UI build and touched-file oxlint pass. ConfigStore still owns legacy agent loading for startup/chat consumers and remains the next cutover boundary.
**2026-10-18 DefaultsSettings continuation:** The default-settings pinned-agent read now uses the canonical `useAgentsStore` profile fields (`providerId`/`modelId`) instead of the duplicate ConfigStore OpenCode-shaped agent fields. The focused DefaultsSettings test passes (`1` test / `6` assertions), native catalog refresh tests remain green (`4` tests / `18` assertions), UI build and strict UI test-project type-check pass. The touched production file's oxlint output contains only existing baseline findings; no new adapter or fallback was added.
**2026-10-18 chat utility slice:** `mobileControlsUtils.ts` now anchors its agent utility types to `@openchamber/agent-contract`; the optional legacy `mode` input remains only as a shape-neutral cycling rule, with native agents treated as primary by the existing `isPrimaryMode` behavior. The focused utility suite passes (`4` tests / `11` assertions), UI build passes, and touched-file oxlint is clean. Full ModelControls/ChatInput catalog migration remains open because their selection cascade still belongs to ConfigStore.
**2026-10-18 mobile caller slice:** `MobileAgentButton` now reads its label source from `useAgentsStore`, matching the canonical `useAgentColors` owner; it no longer calls ConfigStore's legacy `getVisibleAgents`. The supporting native-contract utility suite passes (`4` tests / `11` assertions), UI build passes, and MobileAgentButton oxlint is clean. Composer-wide agent selection remains on the explicitly open ConfigStore boundary.

**Stop conditions (historical):** Do not repeat historical M0/M1/M2 probes. Do not run workspace-wide checks after every fixture edit. Do not add defensive retries, compatibility adapters, or new abstractions unless a current connected failure identifies the missing owner. M3 closed after E4 supplied current W7–W10 evidence and E5 verified the assembled state; this historical condition no longer marks it open.

No task adds an OpenCode adapter, broad defensive fallback, repeated historical smoke, or a new contract without an observed missing owner.

The maintainer has authorized all future local Git operations for this repository and the necessary OMP SDK dependencies. GitHub commands and pushing remain outside this request. Pre-existing worktree changes remain separate until their ownership/landing is settled.

### M3 continuation plan (2026-10-18) — historical, superseded 2026-10-22

This section is the historical 2026-10-18 planning record. The technical M3 gate is complete and final maintainer acceptance is pending; packet statuses and remaining-work wording below are not open work.

#### Historical baseline at plan time

The migration baseline at the start of this planning wave is:
- UI test-project type-check exits 0 (`bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json`).
- Bounded agent, provider, mobile, and BTW caller slices passed their focused checks:
  - Commands/Settings `AgentSelector` reads the canonical `useAgentsStore` directory projection (`21` tests / `103` assertions pass).
  - Provider bare-key and stored-key disconnect uses revision CAS (`24` tests / `62` assertions pass).
  - Catalog refresh invalidates only `useAgentsStore` for ambient and addressed directories (`4` tests / `18` assertions pass).
  - DefaultsSettings pinned-agent read uses native `useAgentsStore` profile fields (`1` test / `6` assertions pass).
  - Chat mobile controls utility anchors to `@openchamber/agent-contract` (`4` tests / `11` assertions pass).
  - `MobileAgentButton` reads its label from `useAgentsStore` (`4` tests / `11` assertions pass).
  - BTW utility anchors agent input to `@openchamber/agent-contract`.
- W7–W10 are verified by the a92 matrix (W7 visual sanity, W8, W9 child/Board/Guest, W10) with W1–W6 reused from archived evidence:
  - Task 17 (Host integration and legacy retirement), Task 36 (connected Web/Electron acceptance), and Task 18 (integrated acceptance gate) are archived.
  - The final root gate passed at `8d179c4e2`; the technical M3 gate is complete and final maintainer acceptance is pending, with M4/M5 remaining open.

#### Remaining packets

| Packet | Scope | Execution stage | Dependencies | Stop conditions |
|---|---|---|---|---|
| **Packet A: ChatInput + FileMentionAutocomplete cutover** (Task 37) | Move the two chat callers and agent-mention parser to the directory-scoped canonical Agent roster. | Implementation migration (complete) | None. | Native `name`/`description` only; no legacy presentation fields, aliases, adapters, or fallbacks. |
| **Packet B: Multirun AgentSelector cutover** (Task 38) | Move the contract-complete multirun selector to the canonical roster. | Implementation migration (complete) | Task 37. | Native `agentId`/`name`/`description`; no compatibility path or fallback. |
| **Packet C: Native agent selection & ModelControls cutover** (Task 39, Task 46) | End-to-end native agent selection closure: ModelControls + App readiness + ConfigStore remove duplicate legacy agent catalog and migrate consumers to `useAgentsStore`. | Intentional contracts & implementation migration | None. | Native `allowedTools` tool availability and `permissionPresetId`; Host approval edit mode unchanged; native SDK owns authorization policy; no legacy `PermissionRuleset` simulation or sampling adapters. |
| **Packet D: Diagnostics location caller** (Task 40) | Replace `debug.ts` location/project probes with `canonicalClient.resolveWorkspace` and Host/project state. | Implementation migration (complete) | None. | Focused evidence only; no connected acceptance claim. |
| **Packet E: Git initialization Host cutover** (Task 41) | Replace OpenCode VCS initialization with the Host Git API and preserve root refusal/failure semantics. | Implementation migration (complete) | None. | Focused evidence only; no connected acceptance claim. |
| **Packet F: Message and tool helpers cutover** (Task 45 complete, Task 47 active) | Cut message preview, freshness, session events, file-tree changes, background shell, and tool descriptions to canonical `Part` and Host invalidation. | Implementation migration | None. | Canonical `Part.content`, `tool_call`/`tool_result` fields; preserve user-visible previews, diffs, and Host invalidation batching; no fake legacy `Part`. |
| **Packet G: Managed chat directory admission bugfix** (Task 48) | Restore authenticated managed-root directory admission in Host filesystem routes when no active project exists. | Bugfix | None. | Admits managed chat roots with zero configured projects; preserves path containment and refusal of unmanaged paths. |
| **Packet H: Native provider management** (Task 49) | End-to-end native provider management: non-secret account roster, opaque `credentialRef` tokens, account labels in private config, default account selection, transactional OAuth lifecycle, and custom provider discovery. | Intentional contracts & implementation migration | None. | Worker owns `AuthStorage` and OAuth secrets; Host auth/enterprise policy at every route; tokens commit under revision CAS; no SDK in Node/UI. |
| **Packet I: Native SDK investigation & canonical mutation contracts** (Task 43) | Investigate installed native SDK owners and define intentional contracts and implementation tasks across commands, plugins, websearch, usage, and config policies. | Native SDK investigation → intentional contracts → implementation tasks | None. | Missing contracts are implementation work, not an external blocker or zero effort; no shims or deleted features. |
| **Packet J: Native session cache warming** (Task 50) | Retained SessionWarmingCheckbox state read/write to canonical `/api/agent/v1/workspaces/:workspaceId/cache-warming`, backed by native SDK `cfgProvidersCacheWarming` persistence and active-root `session.setCacheWarmingMode`. | Intentional contracts & implementation migration | None. | Worker owns native SDK; Host auth/workspace authorization at every route; revision CAS; explicit active-worker apply outcomes; no OpenCode config or custom timer loop. |
| **Packet K: Native file resources** (Task 51) | Canonical `/commands`, `/prompt-templates`, and `/skills/files` workspace endpoints under revision CAS, backed by native SDK loaders (`loadSlashCommands`, `loadPromptTemplates`, skill discovery/builder) in Bun worker. Preserves Host skill source commit authority and active fanout; confines files to `.omp/commands/`, `.omp/prompts/`, `.omp/skills/` and agent directories; owns `useCommandsStore`, `useSkillsStore`, and `useSnippetsStore`. | Intentional contracts & implementation migration | None. | Worker owns SDK; Host owns source commits; revision CAS; explicit per-root outcomes; no client command expansion incompatible with SDK; no OpenCode shims. |
| **Packet L: Native plugins & extensions** (Task 52) | Canonical `/plugins` workspace endpoints backed by native `PluginManager` and `MarketplaceManager` in Bun worker. Retains listing, install, uninstall, enable/disable, updates, doctor, and local extension authoring under revision CAS with Host enterprise egress controls and explicit live apply outcomes; owns `usePluginsStore`. | Intentional contracts & implementation migration | None. | Worker owns PluginManager; Host enforces enterprise egress/credentials; revision CAS; explicit persisted vs live reload outcomes; no fake reload success. |
| **Packet M: Native web search** (Task 53) | Canonical `/web-search` workspace endpoints backed by native search provider catalog, selection, fallback chain, timeouts, and write-only credentials via native `AuthStorage` in Bun worker with Host enterprise egress controls; owns `useWebSearchStore`. | Intentional contracts & implementation migration | None. | Worker owns web search settings & AuthStorage; Host enforces enterprise egress/credentials; write-only credentials; revision CAS; explicit live apply outcomes. |
| **Packet N: Native historical usage statistics** (Task 54) | Canonical `/usage` and `/usage/tools` endpoints scoped by date range, timezone, and Host-authorized registered canonical session references; cold transcript scanning and cold `SessionManager` in Bun service worker; owns `UsageStatsView`, `usageStatsStore`, and `usageStatsModel` while retiring `session-stats.ts`. | Intentional contracts & implementation migration | None. | Worker owns cold transcript parsing; Host scopes all queries to authorized references; no global `~/.omp` stats DB leaks; no live session or model launch; honest null metrics; no double-counting across forks. |
| **Packet O: Host lifecycle retirement** (Task 17/44) | Retire managed OpenCode lifecycle/proxy/config/auth owners after reachable callers are cut over. | Host retirement | Required callers and contracts resolved or intentionally retained. | Preserve Host services and verify canonical readiness/auth. |
| **Packet P: Connected Web/Electron acceptance** (Task 36) | One real Web plus packaged Electron W7-W10 scenario and sanitized receipt using available `chrome-devtools` CLI and Google Chrome. | One connected packet | Task 17/44 and supported UI cutover. | Pre-fix discovery on port 3127 confirmed real UI render and canonical 200s; resolve remaining 404s; retain sanitized receipts. |
| **Packet Q: Final acceptance gate** (Task 18) | Final workspace checks and W1-W10 evidence assembly. | Final checks | Task 36 and all required packets. | Close only observed W1-W10 items. |

The ModelControls gap is design work, resolved in Task 46 and grounded by `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster` and `decisions.md: 2026-10-18 - Native agent controls and ConfigStore catalog retirement`. Native agent profiles define tool availability via `allowedTools` and `permissionPresetId`, rather than legacy `PermissionRuleset` or HTTP sampling metadata. Host approval edit controls remain unchanged, and the native SDK owns authorization policy.

The canonical `Agent` contract (`packages/agent-contract/src/session.ts`) intentionally has no legacy visibility/role/display fields. The settled decision `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster` makes the replacement behavior explicit: the enabled native catalog is the roster, `name` is the label, and no hidden/mode/display adapter is introduced.

### Residual caller closure plan (2026-10-18) — historical, superseded 2026-10-22

The remaining issues follow the execution progression: `native SDK investigation → intentional contracts → implementation migration then Host retirement → one connected packet → final checks`. Missing canonical contracts and browser test tooling are implementation work, not external blockers or zero-effort tasks. The plan preserves all retained scope and exact W1–W10 acceptance criteria without adapters, fallbacks, or shrinking gates.

| Packet | Scope and current issue | Deliverable | Gate impact |
|---|---|---|---|
| R1 | ModelControls reads legacy permission rules, request-body sampling, mode, and pinned-model identifiers. | Task 46 delivers end-to-end native agent selection closure: ModelControls + App readiness + ConfigStore migrate to `useAgentsStore`. Native `allowedTools` specifies tool availability; Host approval and native SDK own authorization policy without client-side `PermissionRuleset` simulation. Task 39 remains open until implementation and evidence are delivered. | W7, W9, W10 |
| R2 | ConfigStore and startup paths own a duplicate OpenCode-shaped agent catalog and trigger `/api/agent` polling loops. | Task 46 removes the duplicate legacy agent catalog from `useConfigStore` and App readiness polling, eliminating legacy `/api/agent` startup loops while preserving empty-catalog versus error state distinctions. | W9, W10 |
| R3 | Residual message, tool, and file-tree helpers import legacy model and tool types. | Task 45 closed safe labels/diagnostics; Task 47 cuts `rawMessagePreview`, `messagePreview`, `messageFreshness`, `sessionEvents`, `fileTreeChanges`, `backgroundShellPart`, and `contextParts` to canonical `Part` contracts and Host Git/file-tree invalidation. | W7, W9, W10 |
| R4 | Primary send fails on fresh isolated home without configured projects. | Task 48 fixes `packages/web/server/lib/fs/routes.js` `resolveWorkspacePathFromContext` to evaluate independent `managedRoots` admission, allowing directory creation and session startup on managed roots. | W2, W7, W10 |
| R5 | Provider OAuth, multi-account, and custom provider discovery lack complete canonical models. | Task 49 delivers end-to-end native provider management, transactional OAuth under revision CAS, and custom provider model discovery without OpenCode shims. | W6, W9, W10 |
| R6 | Warming, commands, plugins, websearch, usage, and config policies lack settled canonical schemas. | Task 43 investigates native SDK owners; Task 50 delivers native session cache warming; Task 51 delivers native file resources (commands, prompt templates, authored skills); Task 52 delivers native plugins and extensions; Task 53 delivers native web search configuration and credentials; Task 54 delivers native historical usage statistics. Missing contracts represent implementation work, not external blockers or zero implementation effort. | W6, W9, W10 |
| R7 | The Host composition root still wires managed-OpenCode lifecycle/proxy/config/auth owners after reachable callers are removed. | Retire only the unreferenced lifecycle set, preserve Host FS/Git/PTY/source-control/auth boundaries, and retain canonical readiness/auth routes (Task 17/44). | W2, W10 |
| R8 | No connected Web or packaged Electron W7-W10 receipt existed at plan time. | Resolved by the a92 connected packet (Web reused plus packaged Electron W7-W10/PWA) and the final root gate. | W7–W10 |
| R9 | Task 18 had not assembled the current evidence at plan time. | Resolved by the final root gate PASS at `8d179c4e2`; Task18/Task57 archived. | M3 gate |

**Execution sequence:** Work proceeds strictly across six phases: `native SDK investigation → intentional contracts → implementation migration then Host retirement → one connected packet → final checks`.
- Native SDK investigation inspects installed native SDK capabilities and owners for agent controls, provider authentication, resources, helpers, and connected execution.
- Intentional contracts establish complete schemas and boundaries: Task 43 maps native owners to concrete contracts and implementation tasks; Task 46 establishes native agent selection and ModelControls cutover design; Task 49 defines native provider management and OAuth lifecycle; Task 50 defines native session cache warming; Task 51 defines native file resources; Task 52 defines native plugins and extensions; Task 53 defines native web search; Task 54 defines native historical usage statistics.
- Implementation migration cuts callers to native stores (`useAgentsStore`), canonical `Part` contracts (Task 47), managed directory admission (Task 48), and settled mutation endpoints without shims or compatibility adapters.
- Host retirement (Task 17/44) unregisters legacy execution routes from `packages/web/server/index.js` once all callers have migrated.
- Connected acceptance (Task 36) executes the integrated Web and packaged Electron acceptance scenario using available `chrome-devtools` CLI and Google Chrome, capturing durable receipts.
- Final checks (Task 18) run the single workspace verification pass and assemble evidence for all W1–W10 acceptance criteria.

No compatibility adapters, field dropping, or defensive fallbacks are budgeted or permitted. All retained scope and exact W1–W10 checks are preserved without shrinking gates. No effort estimates are budgeted.

### Verification policy

Each boundary gets one focused proof that exercises its real path. Keep permanent regression tests for plausible observable failures, especially duplicate parts, stale responses, cross-worker environment, request resolution and queue recovery. Do not add tests for imports, forwarding or incidental wording.

Run package checks after a slice lands, not from each concurrent worker. Run workspace type-check, lint, affected builds and dead-code once after the cross-workspace integration. Re-run only the checks invalidated by a subsequent fix. Final Web and Electron scenarios may cover multiple acceptance IDs in one connected run.

## What it must not do

- Add OpenCode-shaped adapters, field aliases, dual-engine selectors, a fallback engine or automatic transcript/credential import.
- Reimplement unrelated host services, redesign the UI, add unrequested frameworks, or change release notes.
- Add speculative retry, cache, pooling or policy abstractions. Preserve required process, state, authorization and data-loss invariants with the existing owner.
- Claim a provider, OS, relay, packaged updater, mobile or Docker boundary passed without running it.
- Replace retained functionality with unsupported flags merely to obtain a green M3 check. SDK limitations require explicit product handling through the existing scope hierarchy.

## What was considered and rejected

- **Replace only the primary chat client.** It yields an early chat demo, but leaves settings, Board, Shell, utility generation and retained execution callers on the old engine. It cannot satisfy the M3 unreachable-old-client gate.
- **Keep an OpenCode adapter during cutover.** It reduces immediate component edits, but conflicts with the selected clean cutover and embeds legacy types in the new contract.
- **Repeat every historical smoke after each task.** It produces more runs without proving new behavior. Focused owner checks and one integrated acceptance run provide evidence at the boundary that changed.
- **Serialize independent implementation in one shared tree.** It avoids merge coordination, but does not use the requested concurrency. Isolated worktrees with a single integration owner preserve both concurrency and ownership.

## How we will know it works

Each task Check names the existing package runner or the new executable owned by that task. Temporary real-path smoke scripts are removed after recording their observations; do not add permanent smoke command infrastructure solely to make planning checks look concrete. Resolve focused file selections from the actual changed owners. Documentation validation is not behavioral acceptance.

- **W1.** M0 evidence identifies the exercised installable SDK, answers scoped Shell and contract-freeze questions, and retains every failed/partial/unavailable observation without fabricated passage. Only unresolved prerequisites required by the authoritative gate block freezing.
- **W2.** The running host preserves settings/theme/project/auth/FS/Git/PTY owners after extraction. VS Code extension runtime/build/release references are removed; external editor and theme import remain.
- **W3.** Through authenticated Host routes, create a session in a temporary workspace, stream a prompt, abort another run, read/reopen history and close the worker. Observe ordered canonical records, sibling-worker isolation and no publication after closure.
- **W4.** Resolve one real pending approval and question through canonical requests; competing replies cannot both succeed, reconnect preserves pending state, and a restart expires old handles without executing the rejected action.
- **W5.** Busy/offline queue commands survive a host restart, preserve attachments/order/revisions, dispatch once through their delivery owner and report storage failure without erasing unrelated valid queues.
- **W6.** Service-backed model/provider/agent/MCP/skill commands and Shell/completion operations work through the Host Gateway. Configuration failure stays distinct from empty/unconfigured state; secrets stay off public responses.
- **W7.** Web and Electron can create, stream, abort, reload and reopen a session using the actual Canonical Client. Timeline reasoning/tool/attachment/error rendering and composer inputs use canonical types.
- **W8.** A disconnected client recovers snapshot plus cursor without duplicate parts. Epoch gaps force resync; stale responses from a previous runtime cannot mutate the selected runtime.
- **W9.** Settings/composer catalogs, sidebar metadata/folders/retention, Board session launch, Guest Shell and every utility-generation caller use the canonical owner. Host FS editing and dirty-file moves remain independent of agent execution.
- **W10.** The integrated affected package checks pass, retained UI cannot reach the old OpenCode client, and the host has no obsolete agent lifecycle/proxy consumer. Record remaining M4/M5 work separately. Workflow and local documentation validation pass.

W7-W10 require the integrated application and are rerun at effort closure. Earlier focused runs can satisfy multiple IDs; do not duplicate them solely because several task files mention the same evidence.

## Trial follow-ups (2026-10-22)

The installed M3 trial exposed two follow-up defects that stay in this effort rather than becoming M4 scope:

- Task 75 (quota lane): an unconfigured provider's usage request is `configured: false` with no error; configured failures stay visible.
- Task 76 (this lane): the workspace `ModelCatalog` exposes only providers the native SDK reports as executable (configured `models.yml`, credential, oauth or native keyless), while `ProviderCatalog` stays the complete Settings directory. No provider-ID special cases. Live evidence already shows the running Host reading `/home/shizuku/.omp/agent/models.yml` and publishing CLIProxyAPI, so no agent-directory rewrite is part of this scope.

Integration, packaging and the final M3 gate remain coordinator-owned, not a product task. These are defects in current behavior, not a new design. Tasks 1-74 remain archived and their evidence unchanged.

## Open questions

Official-provider/OAuth feasibility and non-Linux/macOS resource measurements remain explicitly unverified under the two accepted M0 release-limit entries cited above. Required online model discovery was measured and reviewed in task31, not waived. Actual M2 credential handoff and per-provider outcomes, service resources, Host Gatekeeper, CAS and restart evidence remain required at their owning gates; the accepted M0 limits waive none of them.

The maintainer authorized the assembled migration baseline in `decisions.md: 2026-10-11 - Continue from the assembled migration baseline`. M0 worktrees use the committed workflow and probe inputs. Later application worktrees must also include the assembled application source; the old HEAD does not contain it.

## Notes

Planning read the root manifest, host composition imports and host module documentation, sync imports and sync/store documentation, Web/Electron READMEs, existing M0 spec/fixtures/runner, migration design and development record. The known UI search returned 460 matching files including tests, not 460 production call sites.

Tasks are under `../tasks/omp-through-m3/`. This effort is complete only when its checks and the authoritative M3 gate have current-state evidence. Planning or partial M0 progress does not complete the maintainer's objective.

Execution order and gate tasks:

1. M0: 01 and 19; 24 follows 19; then 02; evidence tasks 25-28 and archived provider task 29; task 30 withdrawn from the mandatory release condition with platform evidence unverified; required online model discovery task 31; gate 03 review and archive before M1.
2. M1: 04 and 06; 05 and 20 follow 04; gate 21 follows all M1 work.
3. M2: 07, 08, 09; 10 and 12 acceptance follow 09 alongside committed 11 queue source; server consumers 22 (blocked by 10 and 12) composes using committed 11 source; 11 final composed acceptance (blocked by 09 and 22); then full gate 23 (blocked by 11 and 22). No tasks are deleted or renumbered, and W1–W10 coverage is unchanged.
4. M3: shared client/sync contracts in 13; native child subagent backend and navigation projection in 32 (blocked by 13); independent consumer slice 16 (blocked by 13); consumer slices 14 and 15 (blocked by 13 and 32) in separate worktrees; chat agent callers 37 (blocked by 15); model and multirun agent callers 38 (blocked by 37); diagnostics caller 40; Git initialization Host cutover 41; residual helper ownership spike 42; safe caller slice 45; canonical mutation contract spike 43; native agent controls and ModelControls cutover 46; native message and tool helpers 47; managed chat directory admission bugfix 48; native provider management 49; native session cache warming 50; native file resources 51; native plugins and extensions 52; native web search 53; coordinated runtime cutover 17/Host composition retirement 44 (blocked by the reachable caller and contract packets, 14, 15, 16, 22, 37, 38, 45, 46, 47, 48, 49, 50, 51, 52, 53; transitively requiring 32 via 14 and 15); independent test-contract slices 33 and 34; UI test-project convergence 35 (blocked by 17, 33 and 34); connected Web/Electron W7-W10 acceptance 36; then the M3 completion packets: live service session reopen 64; live-run snapshot/reconnect continuity 65; workspace-admission diagnosis spike 66; bounded directory startup catalog recovery/retry 67 (blocked by 65 and 66, appending to the documentation Task 65 lands); native Web Search provider-catalog fix 68; live-run abort latency/ordering spike 69 (answers the live abort gap Task 65 recorded and names the fix test); live-run abort cancellation fix 70 (blocked by 69; Task 65 is blocked by 70 and keeps its unchanged live Check); native plugins 52 (blocked by 64); visual restoration 56-59 (blocked by 65 and 67); settings restoration 60 (blocked by 65, 67 and 68); provider restoration 61 (blocked by 65 and 67); Task 15 resumes on archived Task 36 evidence after 65 and 67 land; then final acceptance gate 18 (blocked by every open M3 deliverable: 15, 52, 56, 57, 58, 59, 60, 61, 64, 65, 66, 67, 68, 69 and 70). The consumer slices share tasks 13 and 32's native canonical contracts, not each other's implementation; Tasks 33 and 34 share no implementation files; connected UI evidence is recorded once after assembly without repeating unchanged checks. Task 18 owns one integrated Web/Electron run that includes the Settings Commands/Skills routes and composer command/skill use, and it must correct every consumer-visible gap that run exposes rather than opening a separate Task 51 UI packet or deferring the gap to M4/M5.

Existing M0 evidence and reviews are reused only for unchanged SDK behavior. Gate03 accepts the handoff after task31 resolved the final required discovery gap and the cited maintainer decisions retained provider/platform limits; an unavailable observation never becomes passed. Gates21,23 and18 remain unarchived on any unresolved required item, and a well-written blocker report cannot replace their actual Host, service/handoff or client-cutover acceptance.
