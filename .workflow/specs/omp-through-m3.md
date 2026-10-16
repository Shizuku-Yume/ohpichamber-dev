# OMP migration through M3

**Status:** in progress
**Priority:** high

## What this is for

The adopted application still executes through OpenCode. M1 Host boundaries and the compiled Canonical contract package are implemented; the real Bun Agent Service and coordinated execution cutover remain. The maintainer requested migration through M3 acceptance, using concurrent OMP sessions where task boundaries permit and avoiding repeated checks or speculative defensive code.

Existing M0 reports prove some SDK behavior, not an implemented service or client cutover. [Development progress](../development.md) remains the owner of observed evidence. This effort continues that work rather than acquiring upstream source or repeating accepted probes.

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
### M3 continuation breakdown

Task 17 remains the owner of residual production UI caller migration, Host lifecycle retirement, and packaged Agent Runtime closure. The remaining work is split into isolated test-contract slices followed by one connected acceptance run:

- **Task 33** modernizes chat, message, turn, and `SyncProvider` test fixtures against canonical DTOs.
- **Task 34** modernizes sidebar, session-collection, worktree, and remaining UI fixture contracts. Tasks 33 and 34 are independent and may run in separate worktrees.
- **Task 35** converges the UI test project after Tasks 33/34 and Task 17, fixing only directly evidenced residual contract drift.
- **Task 36** runs the single connected Web/Electron W7-W10 packet, including packaged Electron behavior and durable receipts; Task 18 assembles the final gate from that packet and the unchanged W1-W6 evidence.

No task adds an OpenCode adapter, broad defensive fallback, repeated historical smoke, or a new contract without an observed missing owner.

The maintainer has authorized all future local Git operations for this repository and the necessary OMP SDK dependencies. GitHub commands and pushing remain outside this request. Pre-existing worktree changes remain separate until their ownership/landing is settled.

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
4. M3: shared client/sync contracts in 13; native child subagent backend and navigation projection in 32 (blocked by 13); independent consumer slice 16 (blocked by 13); consumer slices 14 and 15 (blocked by 13 and 32) in separate worktrees; coordinated runtime cutover 17 (blocked by 14, 15, 16, 22; transitively requiring 32 via 14 and 15); independent test-contract slices 33 and 34; UI test-project convergence 35 (blocked by 17, 33 and 34); connected Web/Electron W7-W10 acceptance 36; then final acceptance gate 18 (blocked by 10, 11, 14, 15, 16, 17, 32, 35 and 36). The consumer slices share tasks 13 and 32's native canonical contracts, not each other's implementation; Tasks 33 and 34 share no implementation files; connected UI evidence is recorded once after assembly without repeating unchanged checks.

Existing M0 evidence and reviews are reused only for unchanged SDK behavior. Gate03 accepts the handoff after task31 resolved the final required discovery gap and the cited maintainer decisions retained provider/platform limits; an unavailable observation never becomes passed. Gates21,23 and18 remain unarchived on any unresolved required item, and a well-written blocker report cannot replace their actual Host, service/handoff or client-cutover acceptance.
