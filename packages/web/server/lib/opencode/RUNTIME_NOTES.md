# Inherited OpenCode runtime notes

These notes describe the current inherited OpenCode 2.x integration only, not the API or design for new OMP functionality. The [root migration direction](../../../../../AGENTS.md#migration-direction-and-status) and [scope hierarchy](../../../../../.workflow/omp-migration/scope.md#document-hierarchy) take precedence. Use affected sections for baseline diagnosis, preservation or retirement; new agent behavior follows the OMP Canonical API contracts.

OpenChamber moved from the OpenCode 1.x API to 2.x in one cutover (PR #3837,
2026-09). Everything OpenCode-facing speaks 2.x: routes under `/api/*`, one
global `/api/event` stream of `session.*` events, sessions as cursor-paged
lists, messages with their parts inline, plugins hot-reloaded from watched
config, `@opencode/client` + `@opencode/schema` as the only SDK. A bug report
that mentions 1.x behaviour (`/session` without `/api`, `message.updated`
events, `auth.json`, `@opencode-ai/sdk`) describes the old world; answer from
the 2.x code, not from memory of 1.x.

## Where the boundary lives

- `packages/ui/src/lib/opencode/client.ts` — every official OpenCode call the
  shared UI makes; `projection.ts` turns wire shapes into the OpenChamber
  domain model in `model.ts`; `events.ts` translates wire events;
  `plugins.ts` translates the experimental plugin routes; `websearch.ts`
  translates web search (providers, the `websearch` config choice, keys, the
  tool's text result and its first-use consent form). These files are the
  only place that knows 2.x wire shapes. Rendering and stores
  read the domain model; fix a missing field there, never with a shim.
- Historical usage no longer crosses the OpenCode boundary. Shared UI uses
  CanonicalClient usage endpoints through the Host; exact registered native
  sources are inspected cold in the Bun usage worker.
- `packages/web/server/lib/opencode/proxy.js` forwards `/api/*` as-is (2.x
  serves under `/api` itself) and folds OpenChamber-owned session state into
  the records it serves. `env-runtime.js` launches `opencode serve`.
- Plugins OpenChamber generates for OpenCode: `plugin-spec.js` and
  `agent-tool/runtime.js`. Only the binary, port and external toggle restart.

## Every directory-scoped read starts a location

On 2.x a read through the location middleware builds that directory's
location, and the build starts every configured local MCP server for it. The
location then lives until an hour without session events. So each read names
a directory, and only one the user is working in:

- **Which routes:** agent, plugin, model, provider, integration, mcp, project,
  form, permission request list, fs, command, skill, rpc, pty, shell,
  reference, vcs, websearch, config, location (`protocol/src/api.ts` lists the
  groups with `locationMiddleware`). Session routes resolve the session's own
  location; `GET /api/session`, `/api/session/active` and `/api/credential`
  are global and start nothing.
- **How the directory travels:** the `x-opencode-directory` header,
  percent-encoded, or a `location[directory]` query. A `?directory=` query is
  ignored.
- **A read without one** answers for OpenCode's own working directory, the
  user's home for a managed OpenCode, and starts a fleet there. The UI reads
  through `opencodeClient` with the current directory; server code with no
  directory of its own uses the lifecycle's `getDefaultOpenCodeDirectory()`,
  the last-used directory it warmed at startup.
- **Fan-out is the failure:** a loop over every project, worktree or store
  directory starts one fleet each. A refresh after a catalog event re-reads
  only the directories the events named; they are already running.

For processes multiplying, memory climbing with MCP servers enabled, or servers
starting in unopened projects, [the scoped MCP-start probe](references/mcp-spawn-probe.md)
can identify the triggering requests and stacks when this diagnostic branch applies.

## Workarounds for what 2.x cannot do

These describe gaps in the inherited integration. Check the installed pin and
matching source before relying on a gap or retiring its workaround.

- **Operational session state**: Host SQLite owns archive state, custom titles,
  workspace associations, folders, and operational metadata. The retained
  execution runtime is not a metadata accessor or fallback. Named legacy JSON
  sidecars convert transactionally; selected execution projections require
  explicit conversion intent and consent through the Host route. Neither path
  imports transcripts. Provider credentials remain execution-owned:
  `opencode/auth.js` reads `GET /api/credential`.
- **1.x sessions created after the one-shot migration**:
  `v1-migration-topup.js` rewinds the migration cursor before a managed start,
  only when no revisited session has 2.x activity.
- **Error bodies**: the generated client drops the body of an HTTP status a
  route does not declare, so session update/delete/archive report the status
  without OpenCode's message or log `ref`.

## Behaviour to expect

Inherited observations from live 2.x servers, not checks performed by this
documentation move. Confirm against the installed pin and affected source when relevant.

- **A cold location's catalog is not authoritative.** The first provider/model
  read for a directory not started yet answers an empty list, then a partial
  one without plugin providers, and the full list about two seconds later,
  announced by `provider.updated` / `model.updated` with that
  `location.directory`. Recovery rides on those events (`markConfigCatalogStale`).
- **Plugin providers exist only in the running OpenCode.** Nothing about them
  reaches `opencode.json` or `auth.json`; `/api/provider` is the only view, and
  it strips `options.fetch`, so nothing tells a directly callable provider from
  one that only works through OpenCode. Without a zen login OpenCode sets
  `options.apiKey = "public"` on zen and trims it to free models: those run on
  OpenCode's infrastructure and are called only through OpenCode.
- **A session whose directory was deleted** still reads, but location-scoped
  requests answer 404 `LocationNotFoundError`. `STATUS_BY_TAG` does not map it
  to 404 on purpose: `fetchPermission` reads 404 as "settled", which would let
  auto-accept fail open. `POST /api/session/:id/move` works on such a session.
- **A background shell or a subagent has no clean cancel.** `shell.remove`
  kills the process but hands the agent a `Shell.NotFoundError`; interrupting a
  subagent's child session (no job-cancel route) reports "Subagent cancelled".
  Agents relaunch either, so `stopBackgroundShell` and `stopSubagent` post a
  cancellation note to the agent first.
- **`opencode run --agent X` uses the default model**, not the agent's: pass
  `-m provider/model#variant` in batch runs.
- **A scratch `opencode serve` started from the app's shell answers 401**:
  the shell inherits the desktop's `OPENCODE_PASSWORD`, which wins over
  `OPENCODE_SERVER_PASSWORD`. Start it with `env -u OPENCODE_PASSWORD` (Basic
  auth user `opencode`).

## Sources of truth

- Read the pinned package manifests and generated client/schema in this checkout first. A separately available OpenCode reference checkout is read-only; do not assume a workstation-specific path. Follow the [local-work rules](../../../../../.workflow/standards.md) for Git authorization. Where reference source is unavailable, use published SHA-addressed source and official release/API references, and state the evidence limit. OpenCode 2.x source boundaries are `packages/core/src`, `packages/server/src/handlers/*`, `packages/schema/src` and `packages/protocol/src/groups`.
- Minimum supported version lookup: `MINIMUM_OPENCODE_VERSION` in
  `packages/web/server/lib/opencode/compatibility.js`. This is an inherited
  compatibility boundary, not permission to change runtime requirements.
- Pinned version: `opencodeCli.version` in `packages/electron/package.json`
  (the bundled binary) and `@opencode/client` / `@opencode/schema` in the
  root, ui and web manifests, plus `@opencode/cli@` in the
  Dockerfile. These are coordinated inherited pins, not an automatic bump instruction.
- Wire-type lookup: `model.ts` and `events.ts` at the UI boundary classify inherited message types and events. Preserve complete classification when maintaining that boundary; do not use these shapes for new OMP functionality.

