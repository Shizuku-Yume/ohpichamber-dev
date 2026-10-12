# OhPiChamber agent guide

## Purpose

OhPiChamber is an OpenChamber fork. The pinned upstream application baseline and source-based documentation audit are complete; unavailable runtime certification remains explicit. M0 evidence is accepted for entry into M1. [Development progress](.workflow/development.md) owns implementation evidence and remaining gates. The target is Oh My Pi (OMP) as the only agent runtime, retaining Web/PWA, Electron, hosted and Capacitor mobile, and the Guest SDK. OpenCode compatibility and the VS Code extension are not final target features.

This file contains only always-on repository rules and routing. Detailed workflows belong to project skills and module documentation.
<!-- workflow:start -->
# Project workflow

Before non-trivial work, read `.workflow/standards.md` (this project's commands, layout
and landing) and `.workflow/STYLE.md` (how to write). Read only the `.workflow/CONVENTIONS.md`
sections named by the skill you are using; do not preload the whole rulebook. The steps are
skills in `.agents/skills/`; when the next step isn't obvious, start with `flow-start`.

When rules disagree: the user's current instruction, then `.workflow/standards.md` and
the repository's existing conventions (commit style in `git log`, lint and formatter
config, CONTRIBUTING), then CONVENTIONS.md, then STYLE.md.

Always:
1. Find facts yourself; ask the user only what they own, in batches (CONVENTIONS §0, §1).
2. Run it and observe the result before saying it is done.
3. A plan that turns out wrong is fixed in the plan (CONVENTIONS §5).
4. One task at a time per working tree; parallel tasks get separate worktrees.
<!-- workflow:end -->

## Conversation entrypoint

At each new conversation or after lost context, load `flow-start` first and use `.workflow/bin/workflow next --no-color` to recover the active task. Classify even a small request through that entrypoint; classification does not require creating a task for trivial work. During an ongoing task, continue its earliest incomplete workflow step rather than starting a second process.

The workflow is the default, not an optional appendix. Its project facts live in `.workflow/standards.md`; migration authority remains with the scope hierarchy below. Read-only investigations may run in parallel in one tree. Parallel implementation requires separate worktrees and explicit Git authorization. Landing mode never authorizes Git commands by itself.


## Migration direction and status

The [OMP migration documents](.workflow/omp-migration/README.md) define the target, not completed implementation. Existing OpenCode code, package names, skills, and upstream documentation describe the inherited baseline. Verify implementation status in the affected source and gate evidence before claiming a milestone is complete.

The active effort is [OMP migration through M3](.workflow/specs/omp-through-m3.md). Continue M1 Host extraction and VS Code extension retirement from the assembled application baseline; do not reacquire upstream or repeat accepted M0 probes. The [rebaseline spec](.workflow/specs/upstream-rebaseline.md) records the closed source/document prerequisite and unverified runtime limits. Still-used OpenCode execution owners remain until the coordinated M3 cutover; they are not a fallback engine. Preserve earlier investigations as dated inputs, not current implementation evidence.

- Build agent execution around the Canonical API at `/api/agent/v1`, backed by the OMP SDK in a separate Bun Agent Service. Keep SDK objects private to the service and its workers.
- Preserve the existing host services and their security boundaries. Extract host-owned code from legacy OpenCode directories before removing the agent integration.
- Cut over migrated callers without OpenCode-shaped adapters, configuration readers, dual-engine selectors, or fallback engines.
- Retiring the VS Code extension does not retire external editor launching or VS Code theme import.

### Required migration reading

Before planning or editing, read the [migration index](.workflow/omp-migration/README.md) and [scope](.workflow/omp-migration/scope.md). Then load the documents for the affected boundary:

| Task | Required reference |
|---|---|
| Implementation or milestone selection | [Implementation plan](.workflow/omp-migration/implementation-plan.md). Identify the work package and required gate evidence; unverified OMP behavior remains an M0 gate. |
| Process lifecycle, runtime integration, module ownership, persistence, or security | [Architecture](.workflow/omp-migration/architecture.md). Read the relevant ownership rules, ADRs, and verification gates. |
| API, client data access, session state, commands, events, approvals, or queues | [Contracts](.workflow/omp-migration/contracts.md) and the relevant architecture sections. Proposed schemas need verification before becoming exported contracts. |
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
- `packages/vscode`: inherited extension scheduled for removal. Inventory retained callers before removing package, build, release, or documentation references; do not extend its support.
- `packages/mobile`: Capacitor iOS/Android shell; bundles the mobile web surface and connects to an existing OpenChamber server.
- `packages/docs`: product documentation; not a Bun workspace.
- `packages/sdk`: guest contract for third-party panels. Manifest parse, iframe envelope, `connectHost`. Host and guest import from here; do not copy these types into `packages/ui`.
- `packages/extensions`: app-owned SDK extensions and their build registry, not a Bun workspace. See its `DOCUMENTATION.md` for trust, packaging, and migration rules.

The inherited shared UI uses `@opencode/client` and `@opencode/schema`; those dependencies are later cutover targets, not the API for new agent functionality. Migrated agent data uses the Canonical Client through the Host Gateway. Host-owned capabilities keep `RuntimeAPIs`, `runtimeFetch`, and shared browser/realtime transport helpers. `packages/sdk` remains the Guest contract, not the canonical agent contract. Consult the architecture for proposed package locations rather than assuming they already exist.

Electron keeps the Node.js Host Gateway in-process. The target Bun Agent Service and SDK workers are separate processes; the inherited prohibition on a backend sidecar applies to the host, not the Agent Service. Development may load loopback/HMR UI; packaged builds load staged assets through `openchamber-ui://` while the loopback host remains the API entrypoint. Keep domain backends in their owning host or agent modules unless behavior is inherently native.

Shared contracts must define intentional behavior for every retained surface listed in the scope matrix. Mobile connects to the host and does not run local Agent Service or Guest service processes.

## Always-On Constraints

- Do not modify `../opencode`; it is a separate repository.
- Do not run GitHub commands unless the user explicitly asks.
- Do not add dependencies unless explicitly requested.
- Never add or log secrets, bearer tokens, pairing credentials, or sensitive user data.
- Keep changes minimal and preserve unrelated worktree changes.
- Release notes are the maintainer's release-time work: they get written once, as one story, in `changelog/unreleased.md` when the maintainer asks to update the changelog. Until that request, treat `changelog/` as read-only — a fix, feature, or merged PR lands without a changelog line. `packages/vscode/CHANGELOG.md` and `changelog/index.json` are generated from `changelog/*.md` by `oc-dev create-release`, and `CHANGELOG.md` is a legacy copy for older installs: never edit or regenerate any of them; an agent's only changelog output is `changelog/unreleased.md`.
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
- VS Code removal and legacy bridge inventory only: `packages/vscode/src/DOCUMENTATION.md`
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



