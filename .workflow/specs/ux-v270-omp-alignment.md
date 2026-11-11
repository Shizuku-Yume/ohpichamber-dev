# Upstream v2.7.0 merge and systemic UX/runtime remediation

**Status:** in progress
**Priority:** high
**Integration branch:** ux-v270-omp-alignment/integration

## What this is for

The maintainer compared OhPiChamber (`02d166300`) with upstream OpenChamber v2.7.0 (`bc50ba56a`) and the OMP 18.18.0 TUI and reported 22 defects. Several were produced by the previous remediation (`ux-and-omp-parity-remediation`), which implemented its items literally and passed a gate that checked those items rather than the product. Fixing the 22 spots the same way would repeat that.

A read-only review (`research/ux-v270-systemic-review.md`) traced the 22 reports to eight root causes that reach well beyond the reported spots:

- **R1** Upstream was never merged. The `-s ours` link and two file-level refreshes left 53/53 v2.7.0 UI commits absent, 404 baseline files silently deleted and the ledger wrong.
- **R2** GUI surfaces mirror OMP's terminal data model: 157 settings (22 GUI-meaningful), four `modelRoles` editors, 30 CLI commands, a 21-pill plugin wall.
- **R3** The chat pipeline runs OpenCode-era heuristics: tool results as `system` rows, `input.i` intent used by 0/40 tools, a 1500-character prose hold, hashed status phrases.
- **R4** UI state disagrees with authority: stores without boot hydration, unknown collapsed into defaults, events dropped for unknown sessions, cross-clock purges.
- **R5** Declared surfaces with no effect: 19 dead settings, about 20 class names without CSS, 10 telemetry fields hardcoded `null`.
- **R6** Errors lose their cause at every layer, and six authorizer checks validate a change against the state before it.
- **R7** Model-selector grammar reimplemented 14+12 times; none handles `:thinkingLevel`.
- **R8** Performance claims without measurement.

Decisions: `decisions.md: 2026-11-10 - Merge upstream OpenChamber with a real git merge` and `2026-11-10 - OMP TUI parity means function and display parity, not a mirror of OMP's settings and commands`.

## What it does

- Merges upstream v2.7.0 into the fork as one real merge commit. Upstream's UI, settings pages, render cards, context breakdown, CSS utilities and v2.7.0 features arrive through the merge, not hand ports.
- Removes each root cause as a class: one owner per concept, one parser per grammar, one presentation registry per tool, one boot path per server store. Every reported spot is fixed as a consequence.
- Adds a guardrail per class to `bun run check`, so the class fails a check instead of reappearing in the next review.
- Accepts the work by comparing whole surfaces against references: v2.7.0 for OpenChamber surfaces, the OMP TUI for agent behavior. The maintainer's 22 items run as regression rows inside that comparison.

## How it is built

**Merge (R1).** A scaffold branch records `git merge bc50ba56a` with conflict markers committed, so lanes can resolve disjoint areas in parallel worktrees. Resolution rule: upstream wins unless the fork's delta is required by the OMP boundary (Canonical Client, `@openchamber/agent-contract`, Host gateway) or by a recorded decision. Standing exclusions resolve to the fork side. Auto-merged files that reintroduce OpenCode SDK calls are cut over in the owning lane. The integration branch is then rebuilt as `main` plus one clean merge commit (parents `main`, `bc50ba56a`; tree = resolved scaffold tip), so no marker commit reaches `main`. `scripts/upstream-drift` replaces the hand-kept TSV: it derives each path's state from git blobs and lists every differing path with its reason class (OMP boundary, decision, or unexplained).

Conflict lanes could only check their own paths while other lanes still held markers, and they owned only conflicted paths. Once all lanes landed, the scaffold had 1,130 type errors in 214 files and 646 differing paths no lane owned. A repair round follows the lanes: task 30 makes the drift check reject unknown arguments and assigns every type error and unexplained path to one repair slice (31-35, split by area); the slices land on the scaffold before task 19 builds the clean merge commit.

**Class cutovers (R2-R8)** start from the merged tree:

- **R7** `packages/agent-contract` gains one model-selector module porting OMP's `parseModelString`/`splitThinkingSuffix` grammar (`:level`, `:auto`, `:max` literal guard, abbreviations, `#variant`, `@upstream`). All UI, Host and service parsers, formatters and ad-hoc comparisons route through it.
- **R6** Worker `operation.error` carries `detail`; supervisor, service, Host and Canonical Client forward it unchanged. One UI helper builds every toast/banner sentence from `detail` and falls back to the translated text. `denied()` carries a reason. Authorizers evaluate the proposed state of the operation, not the pre-operation snapshot.
- **R4** A boot-hydration registry: every store projecting server/global config declares a hydrator that runs at app boot on all app roots (main, mobile, mini-chat). Store state is `unknown | ready | error`, and consumers render a neutral affordance while `unknown`. Reducers upsert or buffer events for entities they do not hold yet. Freshness decisions compare same-source ordering only. `scheduleAutoTitle` re-arms after a superseding prompt.
- **R3** The contract places tool results with their tool call instead of a `system` row and drops synthetic empty user messages. The projection subscribes to partial tool results and records step timing (`startedAt`, first token, `completedAt`) and structured tool errors. `openchamber_render` is registered in the native host-tool protocol. In the UI, one OMP-keyed presentation registry (`label`, `icon`, `describeCall`, `describeResult`, intent from `input.i`, grouping) replaces `NATIVE_TOOLS`, `toolDescription`, `TOOL_BUCKETS`, `WORKING_PHRASES` and literal-name branches. Status shows OMP's `Working…`, thinking or the call's intent. Streaming holds only what OMP holds (an unfinished table row). The todo tray collapses to the active item plus progress.
- **R2** `OmpSettingSchema` gains `surface` (`gui | tui-only | duplicate | advanced`, with `owner` for duplicates) and OMP's `condition`, classified per id in the service. The OMP Settings page renders `gui` rows from a declarative row registry with complete translations in all 15 locales, and offers "open config.yml" for the rest. One shared role editor serves Defaults, Git and OMP settings. Synthetic `__default__`/`__inherit__`/`__none__` entries are removed, and effort defaults to the model's concrete level. The Commands page manages prompt templates; the Plugins page follows the Skills catalog layout (installed, marketplace); the Agents page has one tool-permission editor; the Usage page reads OMP credentials.
- **R5** Every settings registry entry declares its effect; dead keys are deleted or wired. Custom classes resolve to a CSS rule or a documented marker. Telemetry is derived from the R3 timings.
- **R8** Settings tab mounting, session worker start and model/provider catalogs are measured with `scripts/perf` before and after, against the budgets in W9.

**Guardrails** run in `bun run check`: upstream drift report and conflict-marker check (R1), settings surface classification, all-locale and duplicate-owner tests (R2), tool coverage and OMP stream replay tests (R3), boot-registry and unknown-entity reducer tests (R4), settings-effect and CSS-class checks (R5), sentinel error propagation test and `denied()` reason rule (R6), model-ref lint and round-trip test (R7).

**Retained surfaces.** Web/PWA and Electron get the full scope. Hosted and Capacitor mobile receive the shared UI and the boot registry on `MobileApp`. Mobile runs no local Agent Service, so R8 worker measurements apply to Web/Electron only.

**Task rules.** Every task lists what it deletes. A control added beside the one it replaces fails review. No task certifies its own UI: the gate task's reviewer compares against the references.

## What it must not do

- Reintroduce OpenCode runtime code, VS Code extension code or folder trust through the merge.
- Land a commit containing conflict markers on `main`, or reuse `git merge -s ours`.
- Keep a second editor, parser, hydration path or tool-name switch beside the one this effort makes canonical.
- Show terminal-presentation or internal tuning settings in GUI Settings (decision 2026-11-10).
- Hide a failure behind a default value or a generic sentence.

## What was considered and rejected

- **Fix the 22 items one by one.** Fastest to start. Rejected: the previous effort did exactly this and created several of today's items, and the reviewed classes contain about 150 further instances the items do not name.
- **Continue file-level ports with a drift report.** Smaller now. Rejected by the maintainer: every future sync would pay the full cost again (decision 2026-11-10).

## How we will know it works

- **W1 (Merge recorded).** `git merge-base --is-ancestor bc50ba56a ux-v270-omp-alignment/integration` succeeds; the merge commit has parents `main` and `bc50ba56a`; `scripts/upstream-drift --check` reports zero conflict markers, zero ledger rows contradicting git, and assigns every path that differs from upstream an OMP-boundary or decision reason (zero `unexplained`).
- **W2 (Merged tree green and runnable).** On the merged tree, `bun install --frozen-lockfile`, `bun run type-check`, `bun run lint` and `VITEST_MAX_WORKERS=2 bun run test` exit 0. `bun run dead-code` is inspected with no new findings attributable to the merge. The Web surface and the packaged Linux Electron app start, and a chat completes through the real provider.
- **W3 (R2 surfaces).** The OMP Settings page renders only `gui`-classified settings, hides rows whose OMP `condition` is false, shows no raw ids, and has complete keys in all 15 locales. The duplicate-owner test finds no concept edited on two pages. The Commands page lists prompt templates, while chat autocomplete still lists OMP built-ins. The mode picker has no search box. Effort pickers show no synthetic "默认" entry.
- **W4 (R3 chat).** The tool coverage test resolves every OMP 18.18.0 model-facing tool and host tool to a registry entry with label, icon, call description and result summary. An OMP stream replay shows: status text equal to the call's `input.i` intent; the first prose token visible within one 100 ms frame; no `system` row in the timeline; partial `bash` output while running; the todo tray collapsed to the active item plus progress.
- **W5 (R4 state).** The boot-registry test passes for every server-config store. The unknown-entity test applies each canonical event to an empty state with a defined result. After a restart with default mode `auto`, the composer shield shows auto before any click. A new session's generated title reaches the sidebar without reload. A next-prompt suggestion survives a later session-file touch.
- **W6 (R5 effect).** The settings-effect test finds zero keys without a consumer. The CSS-class check finds zero unresolved class names. A real turn shows populated model time, tool time, first-token latency and tok/s. The running-session spinner rotates when animation is enabled. Transcript content does not show through the composer.
- **W7 (R6 errors).** A sentinel error thrown in a worker operation appears verbatim in the reply, the problem response, `CanonicalApiError` and the UI toast. Installing and connecting an MCP server from the Integrations catalog succeeds on the real path. A refused operation names the check that refused it.
- **W8 (R7 selectors).** The model-ref lint finds no ad-hoc parsing outside the selector module. The round-trip test passes for every role value the Settings pages can write, including `provider/model:high` and `provider/model:max`. AI Rename works with a `:high` small-model role.
- **W9 (R8 measured).** `scripts/perf` records before/after: OMP Settings tab switch ≤ 100 ms; prompt dispatch on a new session ≤ 150 ms slower than on a warm session; repeated model/provider catalog reads ≤ 20 ms. Numbers are recorded in `development.md`.
- **W10 (Reference acceptance).** Every Settings page, the sidebar and the chat states are captured side by side with a v2.7.0 reference build from `bc50ba56a`; scripted prompts are run in OMP TUI and the app. A reviewer other than the implementer accepts each pair or files the difference. All 22 maintainer items pass as regression rows. `bun run check`, including the guardrails, exits 0. Results are recorded in `development.md`.
