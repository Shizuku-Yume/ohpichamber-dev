# OhPiChamber agent guide

## Purpose

OhPiChamber is an OpenChamber fork. The pinned upstream application baseline and source-based documentation audit are complete; unavailable runtime certification remains explicit. M0-M2 gates, the technical M3 W1-W10 gate, [post-M3 hardening](.workflow/specs/post-m3-hardening.md), [upstream refresh](.workflow/specs/upstream-refresh.md), [P1 debts](.workflow/specs/p1-debts.md), and OMP-native chat/parity (`omp-native-chat`, `omp-native-parity`) are landed on `main`. The migration target remains OMP-only; the remaining milestone sequence is [M4 orchestration and OMP TUI parity](.workflow/specs/m4-orchestration.md), [M5 packaging adaptation and cleanup](.workflow/specs/m5-release-surfaces.md), [M6 full audit, UX restoration, and UI compliance](.workflow/specs/m6-audit-and-polish.md), and [M7 pragmatic platform verification and release](.workflow/specs/m7-release-verification.md). [Development progress](.workflow/development.md) owns implementation evidence and remaining gates. The target is Oh My Pi (OMP) as the only agent runtime, retaining Web/PWA, Electron, hosted and Capacitor mobile, and the Guest SDK. OpenCode compatibility and the VS Code extension are not final target features.

This file contains only always-on repository rules and routing. Detailed workflows belong to project skills and module documentation.
<!-- workflow:start -->
# Project workflow

Read `.workflow/standards.md` once per session before non-trivial edits. Open `.workflow/CONVENTIONS.md` or `.workflow/STYLE.md` only for the section you need. Unsure where to start: run `flow-start`.

Precedence: user instruction → `standards.md` and repo conventions → `CONVENTIONS.md` → `STYLE.md`.

## Sizing work (CONVENTIONS §3)
- **Question:** answer directly from code, tests, or docs.
- **Small change or bugfix:** edit, run tests and real path, commit. No task file, no `flow-verify`.
- **1–3 clear tasks:** `flow-break` → `flow-implement`. No spec, no `flow-close`.
- **Multi-task or boundary change:** `flow-spec` → `flow-break` → `flow-implement` → `flow-close`.
- **Unclear scope or trade-offs:** run `flow-grill` first, then follow the matching path.

## Rules
1. Check the repo before asking. Ask only about choices the user owns; pick defaults for reversible details (CONVENTIONS §1).
2. Work is done when verified on the real path. Skip redundant reruns when inputs haven't changed, never the task's `Check` or real entry-point run. If the user waives the `Check`, record `Check waived: <reason; who; date>` in `## Progress`.
3. When a plan assumption breaks, fix the plan with `flow-break` amend instead of working around it in code.
4. Leave pre-existing dirty files alone unless asked. Give parallel tasks separate worktrees under the `Worktrees:` root in `.workflow/standards.md` (CONVENTIONS §7).
5. Reuse before writing: repo → stdlib → platform → installed dependency. No guards for impossible cases, no unrequested wrappers (CONVENTIONS §8). Deliverables carry no trial-and-error notes or AI signatures (`STYLE.md`).
<!-- workflow:end -->

## Conversation entrypoint

At each new conversation or after lost context, load `flow-start` first and use `.workflow/bin/workflow next --no-color` to recover the active task. Classify even a small request through that entrypoint; classification does not require creating a task for trivial work. During an ongoing task, continue its earliest incomplete workflow step rather than starting a second process.

The workflow is the default, not an optional appendix. Its project facts live in `.workflow/standards.md`; migration authority remains with the scope hierarchy below. Read-only investigations may run in parallel in one tree. Parallel implementation requires separate worktrees and explicit Git authorization. Landing mode never authorizes Git commands by itself.


## Migration direction and status

The [OMP migration documents](.workflow/omp-migration/README.md) define the target and design; implementation status belongs to [development progress](.workflow/development.md) and gate evidence. M0-M2 gates and the technical M3 W1-W10 gate are complete; Task18/Task57 technical work is archived and final maintainer acceptance is pending. Verify the affected source and gate evidence before claiming a milestone complete. Legacy OpenCode package names, skills, and upstream documentation remain historical baseline references.

The active and queued milestone efforts are [M4: Orchestration adaptation, OMP TUI parity, and feature verification](.workflow/specs/m4-orchestration.md), [M5: Packaging adaptation, OpenCode build removal, and runtime bundling](.workflow/specs/m5-release-surfaces.md), [M6: Full-codebase audit, OpenChamber UX restoration, missing OMP capabilities, and UI compliance](.workflow/specs/m6-audit-and-polish.md), and [M7: Pragmatic platform verification and release distribution](.workflow/specs/m7-release-verification.md). [Post-M3 hardening](.workflow/specs/post-m3-hardening.md), [upstream refresh](.workflow/specs/upstream-refresh.md), and [P1 debts](.workflow/specs/p1-debts.md) are completed and archived. Do not reacquire upstream or repeat accepted M0 probes. The [rebaseline spec](.workflow/specs/upstream-rebaseline.md) records the closed source/document prerequisite and unverified runtime limits. Retained OpenCode-named host modules have been moved to `server/lib/host/`, and isolated spaces remain unreleased behind `ISOLATED_SPACES_RELEASED = false` with the OpenCode space runtime removed (hardening tasks 08 and 38). Preserve earlier investigations as dated inputs, not current implementation evidence.

- Build agent execution around the Canonical API at `/api/agent/v1`, backed by the OMP SDK in a separate Bun Agent Service. Keep SDK objects private to the service and its workers.
- OMP TUI parity means parity of what the user can do and see in the agent experience: status, tool intent, live streaming, tool summaries, todo, modes, goals, subagents. Present it in OpenChamber's UI idioms, not by mirroring OMP's terminal data model. Settings show only what a GUI user acts on: terminal-presentation settings, internal tuning knobs and duplicates of an existing OpenChamber control stay out (the OMP Settings page offers "open config.yml" for the rest). When OpenChamber already has a control for a concept, that control is the one surface for it.
- Keep OpenChamber's genuine frontend/Host workbench UX: never discard or degrade a useful OpenChamber UI/Host feature merely because the standalone OMP CLI has no 1:1 field; remove only OpenCode-specific workarounds, adapters, and duplicate runtime authorities.
- Upstream OpenChamber is merged with real git merges (never `-s ours` or file-level copying), so git records what was adopted. When resolving, upstream wins unless the fork's delta is required by the OMP boundary or a recorded decision.
- Every new or modified UI and Settings surface must follow OpenChamber's visual design and layout standards (`packages/ui/src/components/sections/PATTERNS.md` and `packages/ui/src/lib/theme/STYLING.md`); never ship bespoke test-only forms that ignore upstream component structure.
- Preserve the existing host services and their security boundaries. Extract host-owned code from legacy OpenCode directories before removing the agent integration.
- Cut over migrated callers without OpenCode-shaped adapters, configuration readers, dual-engine selectors, or fallback engines.
- Retiring the VS Code extension does not retire external editor launching or VS Code theme import.

### Required migration reading

Before planning or editing, read the [migration index](.workflow/omp-migration/README.md) and [scope](.workflow/omp-migration/scope.md). Then load the documents for the affected boundary:

| Task | Required reference |
|---|---|
| Implementation or milestone selection | [Implementation plan](.workflow/omp-migration/implementation-plan.md). Identify the work package and required gate evidence; unverified OMP behavior remains an M0 gate. |
| Process lifecycle, runtime integration, module ownership, persistence, or security | [Architecture](.workflow/omp-migration/architecture.md). Read the relevant ownership rules, ADRs, and verification gates. |
| API, client data access, session state, commands, events, approvals, or queues | [Contracts](.workflow/omp-migration/contracts.md) and the relevant architecture sections. Canonical schemas are implemented; verify boundary changes against the owner and evidence. |
| Feature retention, removal, or acceptance coverage | The scope traceability table and [feature inventory](.workflow/omp-migration/feature-inventory.md). Use the inventory as historical baseline, not current implementation evidence. |

Resolve migration design conflicts using the [scope document hierarchy](.workflow/omp-migration/scope.md#document-hierarchy). These fork decisions supersede inherited OpenCode integration and VS Code support requirements in skills, package READMEs, and module docs. Continue applying their non-conflicting engineering and safety rules. If a conflict is not covered by that hierarchy, resolve it before editing.

## Development memory

- Maintain this guide as development changes the fork's direction, global rules, or document entrypoints. Update or remove stale guidance in the same task; keep task logs and detailed designs out of `AGENTS.md`.
- Before implementation, read [development progress and lessons](.workflow/development.md) alongside the relevant design documents. After meaningful work, update its current status, verification evidence, remaining blockers, and next actionable step. Distinguish implemented, verified, and proposed work; never advance a migration gate without its required evidence.
- Record reusable development findings in `.workflow/`: the observed problem, cause, chosen approach, and evidence or limitation. Prefer the existing owning document. Product and operational guides stay in `docs/` or `packages/docs/`; module contracts stay beside their code.
- Keep one authoritative record per fact. Migration design stays in `.workflow/omp-migration/`; progress and cross-cutting lessons stay in `.workflow/development.md`; the historical selective upstream assessment stays in `.workflow/upstream-review.md`, and the current rebaseline scope stays in `.workflow/specs/upstream-rebaseline.md`. Workflow tasks record execution, decisions record new settled choices, glossary records vocabulary, and technical debt records actionable findings. Existing architecture ADRs remain with their design. Replace superseded status rather than accumulating transcripts or duplicate reports.
- This fork uses a maintainer-and-agent workflow. Keep documentation useful for implementation, debugging, operation, or recovery. Preserve licensing, security guidance, and build/test/release requirements; public contribution ceremonies and upstream community promotion are not development requirements.

## Instruction Order

These steps are mandatory. Before editing, you **MUST**:

1. Follow the conversation entrypoint above and read `.workflow/standards.md` and `.workflow/STYLE.md` before non-trivial work.
2. Complete the required migration reading above.
3. Load every matching project skill and every task-required reference from those skills.
4. Read the nearest `DOCUMENTATION.md` and package `README.md` when present.
5. Follow local code and test precedent.

Apply the migration precedence above when these sources conflict; resolve any remaining conflict instead of silently choosing one.
Do not start editing when a matching skill or required reference has not been
read. Skill loading is a required part of the task, not optional guidance.

## Runtime boundaries

The existing package layout is a migration starting point, not the target support matrix:

- `packages/ui`: shared React UI, state, sync, and runtime contracts.
- `packages/web`: web surfaces, host server, and CLI. Replace its inherited OpenCode lifecycle integration while preserving host-owned services.
- `packages/electron`: native desktop shell and privileged Electron boundary.
- `packages/mobile`: Capacitor iOS/Android shell; bundles the mobile web surface and connects to an existing OpenChamber server.
- `packages/docs`: product documentation; not a Bun workspace.
- `packages/sdk`: guest contract for third-party panels. Manifest parse, iframe envelope, `connectHost`. Host and guest import from here; do not copy these types into `packages/ui`.
- `packages/extensions`: app-owned SDK extensions and their build registry, not a Bun workspace. See its `DOCUMENTATION.md` for trust, packaging, and migration rules.

Retained UI uses the Canonical Client through the Host Gateway; legacy OpenCode names in historical documents describe the inherited baseline, not the API for new agent functionality. Host-owned capabilities keep `RuntimeAPIs`, `runtimeFetch`, and shared browser/realtime transport helpers. `packages/sdk` remains the Guest contract, not the canonical agent contract. Use the architecture for implemented boundaries; later-milestone paths remain design targets rather than assumed source.

Electron keeps the Node.js Host Gateway in-process. The target Bun Agent Service and SDK workers are separate processes; the inherited prohibition on a backend sidecar applies to the host, not the Agent Service. Development may load loopback/HMR UI; packaged builds load staged assets through `openchamber-ui://` while the loopback host remains the API entrypoint. Keep domain backends in their owning host or agent modules unless behavior is inherently native.

Shared contracts must define intentional behavior for every retained surface listed in the scope matrix. Mobile connects to the host and does not run local Agent Service or Guest service processes.

## Always-On Constraints

- Do not modify `../opencode`; it is a separate repository.
- Do not run GitHub commands unless the user explicitly asks.
- Do not add dependencies unless explicitly requested.
- Never add or log secrets, bearer tokens, pairing credentials, or sensitive user data.
- Keep changes minimal and preserve unrelated worktree changes.
- Release notes are the maintainer's release-time work: they get written once, as one story, in `changelog/unreleased.md` when the maintainer asks to update the changelog. Until that request, treat `changelog/` as read-only — a fix, feature, or merged PR lands without a changelog line. `changelog/index.json` is generated from `changelog/*.md` by `oc-dev create-release`, and `CHANGELOG.md` is a legacy copy for older installs: never edit or regenerate either; an agent's only changelog output is `changelog/unreleased.md`. Preserve historical extension release sections without restoring an extension output.
- Enforce security and correctness in core/runtime logic, not only UI visibility or prompts.
- Keep entrypoints and bridges thin; place domain logic in focused owning modules.
- Update owning documentation when module ownership, contracts, or invariants change, following the development-memory rules above.

## Correctness Invariants

- Prefer authoritative state over heuristics.
- Derive live activity from live channels, not persisted history.
- Scope temporary fallbacks narrowly and clear them when authoritative state arrives.
- Never let fetch failure masquerade as authoritative empty success.
- Make partial results, rollback, cleanup, and stale-data behavior explicit.
- One failed entity must not erase or block unrelated complete entities.
- Runtime-specific differences must be intentional and visible in code.

## Communication

You and the maintainer are two people solving a problem together — talk like a trusted colleague, not a report generator. Plain words, short sentences, mechanisms explained through what the user experiences. Warm and direct, never familiar. A reply is something read in minutes, not a separate reading task: put the conclusion first and stand behind it. Answer in the language the maintainer addressed you in; code, comments, and docs stay in English.

## Documentation Discovery

Before changing a module, search for the nearest `DOCUMENTATION.md`; before package-level work, read its `README.md`. Discover docs dynamically under `packages/**/DOCUMENTATION.md` rather than relying on a static exhaustive map.

High-value anchors:

- Sync: `packages/ui/src/sync/DOCUMENTATION.md`
- Stores: `packages/ui/src/stores/DOCUMENTATION.md`
- CLI: `packages/web/bin/lib/DOCUMENTATION.md`
- Performance measurement tooling: `scripts/perf/DOCUMENTATION.md`
- Electron: `packages/electron/README.md`
- Mobile: `packages/mobile/README.md`
- SDK: `packages/sdk/DOCUMENTATION.md`

### On-demand references

These are ordinary documents, not skills. Read only the section or topic reference
for the affected branch; do not bulk-load the six guides or their reference packs.

| Affected branch | Document entrypoint |
|---|---|
| Styling, tokens, shared buttons, keyboard navigation or animation; icons or theme authoring use the linked topic | [UI styling](packages/ui/src/lib/theme/STYLING.md) |
| Settings composition or save feedback; layout, controls and search use the linked topic | [Settings patterns](packages/ui/src/components/sections/PATTERNS.md) |
| iOS Simulator build/launch, preview, accessibility or interaction | [Mobile simulator workflow](packages/mobile/README.md#ios-simulator-control-and-streaming) |
| Explicit maintainer request to update release notes; the changelog write gate above still applies | [Release notes authoring](.workflow/references/release-notes.md) |
| Optional help structuring/pruning skills, agent guidance or context pointers | [Writing for agents](.workflow/references/writing-for-agents.md) |
| Diagnosing, preserving or retiring inherited OpenCode integration; not new OMP functionality | [Inherited runtime notes](packages/web/server/lib/opencode/RUNTIME_NOTES.md) |


## Project Skills

Project skills live under `.agents/skills/*/SKILL.md`. You **MUST** load every
skill matching the character of the change before editing; multiple skills may
apply, including companion skills required by another skill. Read every
task-required reference named by those skills. Skills own their detailed
workflows and checklists, subject to the fork migration precedence above.


| Trigger | Required skill |
|---|---|
| Source/dependency changes, exports or package contracts, build/generated assets, or module ownership | `openchamber-change-discipline` |
| CLI commands, prompts, terminal output, non-TTY, `--quiet`, or `--json` behavior | `clack-cli-patterns` |
| Shared UI data access, Canonical Client cutover, legacy OpenCode SDK removal, server routes, `RuntimeAPIs`, runtime auth/URLs, bridges, or runtime switching | `ui-api-decoupling` |
| Electron main/preload, IPC, native UI, updater, deep links, SSH/tunnels, packaging, or child processes | `desktop-shell` |
| Session sync, bootstrap/reconnect, reducers, polling, optimistic state, queues, live status, reconciliation, or directory-scoped caches | `sync-state-invariants` |
| Isolated-space trust boundaries: hardening, networks and gatekeeper policy, exec and lifecycle, grants and credentials, code transfer and apply, dispatcher isolation, preview content, or protection tests | `isolated-space-boundary` |
| Render/store/event hot paths, large lists, caches/indexes, or reported lag, freezes, CPU/memory, startup, or performance regressions | `performance-engineering` |
| WebSocket, SSE, streaming transport, runtime transport internals, or private relay | `relay-transport` |
| External conversation-data transfer, non-loopback listeners/tunnels/relay/pairing/share links, provider keys/endpoints, usage reporting, or enterprise policy / `enterprise-mode.js` | `enterprise-boundary` |
| User-facing or accessible UI text, labels, aria, toasts, dialogs, or navigation copy | `locale-ui-patterns` |
| Sortable or drag-to-reorder behavior, especially `@dnd-kit` and touch/wrapping layouts | `drag-to-reorder` |

Pure code-reading or explanation does not require implementation skills unless needed to interpret a specialized subsystem.

### Skill Ownership

Keep each cross-cutting rule with one canonical owner; companion skills add only domain-specific consequences and a pointer to that owner.

| Concern | Canonical skill |
|---|---|
| Change scope, abstraction discipline, and validation risk | `openchamber-change-discipline` |
| State authority, reconciliation, optimistic state, and lifecycle correctness | `sync-state-invariants` |
| Isolated-space trust boundaries and the evidence that each one holds | `isolated-space-boundary` |
| Measurement, hot-path cost, caching performance, and optimization evidence | `performance-engineering` |
| Shared UI API and runtime boundaries | `ui-api-decoupling` |
| WebSocket/SSE and private relay mechanics | `relay-transport` |
| Electron native ownership and privilege boundary | `desktop-shell` |
| Enterprise egress, exposure, provider entry and telemetry policy | `enterprise-boundary` |
| User-facing text and localization | `locale-ui-patterns` |

Before adding guidance to a skill, identify its canonical owner. If another skill owns the rule, add a precise companion pointer and only the local consequence; do not copy the rule.

Module documents own styling and Settings composition/search; the optional authoring reference owns document-structure advice. Route affected branches through the on-demand table rather than restoring skill wrappers or copying their contracts into skills.

## Validation

- Use `package.json` scripts as the command source of truth.
- Prefer focused tests and package-scoped type-check/lint for executable source changes.
- Use workspace-wide checks for cross-workspace contracts, root tooling, dependencies, or shared generated assets.
- Run `bun run dead-code` when source files are added/deleted/renamed or exports, types, entrypoints, or import shape change; inspect its report because it is non-blocking.
- Run `bunx oxlint <changed-paths>` on TypeScript/JavaScript files you created or substantially rewrote. This runs the vendored `anti-slop` plugin, which rejects low-evidence typing: unjustified type assertions, `unknown`/`object`/`Record<string, unknown>` contracts, ad hoc `typeof` narrowing, and module mocking. Fix findings in code you authored. Pre-existing findings elsewhere are a known backlog: do not mass-fix them, and never silence a rule, weaken severity, or launder types to make the check pass.
- Do not assume TypeScript/lint covers server JS, CLI JS, Electron helpers, or native behavior; run focused tests, syntax checks, builds, or runtime validation for the touched surface.
- For docs-only or isolated config changes, run the narrowest relevant validation.
- Report exactly what was and was not validated. Static checks alone do not prove runtime, relay, performance, or platform correctness.



