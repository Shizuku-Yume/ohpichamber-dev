# Technical Debt

Code that makes the next change expensive, one entry per finding, so reviews don't
rediscover it and the reason it wasn't fixed yet is kept. `flow-architect` adds
entries; any skill that finds debt may add one.

## Format

Each entry is a level-2 heading naming the concrete symptom, under `## Entries`.
Refer to an entry by its heading.

```markdown
## Order total computed in three places

- **Where:** <files or modules>
- **Added:** <YYYY-MM-DD>
- **Priority:** fix-now | worth-doing | only-if-grows
- **Problem:** <what is wrong, with evidence>
- **Impact:** <what gets harder while it stays>
- **Solution:** <the change, in plain terms>
- **Cost:** <what the fix risks, how big it is>
```

An entry leaves this file in one of two ways:

- Fixed: the task that fixes it deletes the entry in its own commit.
- Declined by the user: delete the entry and append a decision entry to
  `decisions.md` (Decided: not fixing <symptom>; Instead of: fixing it; Because;
  Mine: no; Revisit when), so reviews don't re-propose it.

## Entries

## Interrupted sends lack durable Canonical receipts

- **Where:** Canonical prompt submission and `packages/ui/src/sync/send-failure-classification.ts`.
- **Added:** 2026-11-20
- **Priority:** worth-doing
- **Problem:** losing the response does not prove whether a prompt was accepted; there is no durable receipt query keyed by the caller's correlation/idempotency ID.
- **Impact:** an unconfirmed send must remain pending. Automatically restoring its draft can duplicate an accepted turn.
- **Solution:** persist Canonical interrupted-send receipts keyed by caller correlation/idempotency ID and expose authoritative reconciliation. Keep unconfirmed sends pending without auto-restore until then.
- **Cost:** Agent Contract, service persistence, retry semantics and UI reconciliation tests.

## Guest marks and quota providers lack Host change producers

- **Where:** Host guest marks/quota providers and the shared UI control stream.
- **Added:** 2026-11-20
- **Priority:** worth-doing
- **Problem:** Host producers for `guest-marks-changed` and `quota-providers-changed` are not implemented.
- **Impact:** connected clients cannot receive targeted invalidation; the UI reloads on `event-stream-ready` meanwhile.
- **Solution:** emit validated, scoped change events from successful Host writes and consume them through the shared control stream.
- **Cost:** producer wiring, event contracts and cross-client tests.

## Last-turn diff lacks a Canonical per-turn diff contract

- **Where:** Canonical turn/message DTOs and Last-turn diff presentation.
- **Added:** 2026-11-20
- **Priority:** worth-doing
- **Problem:** workspace diffs are not authoritative per-turn edits; Canonical has no per-turn diff contract.
- **Impact:** Last-turn diff shows unsupported rather than substituting a workspace diff or guessing from tool history.
- **Solution:** define and implement a Canonical per-turn diff contract before restoring the surface.
- **Cost:** contract/service provenance and UI normal, empty, unsupported and failure tests.

## ChatContainer still owns the pre-ChatViewport timeline

- **Where:** `packages/ui/src/components/chat/ChatContainer.tsx` and upstream `ChatViewport`/timeline owners.
- **Added:** 2026-11-20
- **Priority:** worth-doing
- **Problem:** the full ChatContainer-to-upstream ChatViewport/timeline cutover is deferred.
- **Impact:** the retained container does not yet share upstream's extracted viewport/timeline ownership.
- **Solution:** port Canonical/Host behavior into the upstream owners, then retain the thin controller without parallel state owners.
- **Cost:** streaming, scroll anchoring, pagination, runtime-switch and visual regression verification.


## Chat transcript still renders through ChatContainer instead of upstream ChatViewport

- **Where:** `packages/ui/src/components/chat/ChatContainer.tsx`, `MessageList.tsx`, `ChatMessage.tsx`, `message/MessageBody.tsx`, `message/parts/ToolPart.tsx`; upstream `column/ChatViewport.tsx`, `timeline/*`, `message/body/*`, `message/parts/toolRow/*`
- **Added:** 2026-11-20
- **Priority:** worth-doing
- **Problem:** upstream OpenChamber moved the transcript to `column/ChatViewport` with split `timeline/*` rows, `message/body/*` and `message/parts/toolRow/*` owners. Those modules read OpenCode message and part shapes (`Message.info`, `Part.state`, `sessionID`, `@/lib/opencode/*`). The 2026-11-20 upstream sync kept the fork's monolithic `ChatContainer → MessageList → ChatMessage → MessageBody → ToolPart` path on Canonical parts and removed the unwired upstream viewport/timeline/tool-row modules instead of porting them. Several live files also stay at the fork version where upstream's delta needed those owners (`MessageBody`, `ToolPart`, `ToolOutputDialog`, `MarkdownCode`, `MarkdownLink`, `UserTextPart`, `openChamberToolEnvelope`, `toolDiffUtils`, `lib/turns/*`, `work-status/*`).
- **Impact:** every later upstream sync conflicts on the transcript tree and re-adds the removed modules as modify/delete conflicts; upstream transcript features (message selection, shared-page cards, turn footers, row virtualization, tool-row expansion) do not reach the fork until the cutover.
- **Solution:** port `ChatViewport` and the `timeline/*`, `message/body/*` and `message/parts/toolRow/*` owners onto Canonical session, message and part records from `@openchamber/agent-contract`, then switch `ChatContainer` callers to `ChatViewport` and delete the monolithic path in the same change.
- **Cost:** large; it touches every transcript renderer and needs the Canonical part projections those modules expect (tool state, subagent child sessions, background shells, prompt origin). Do it as its own effort after the sync lands, with transcript parity checks against the current path.

## Cold new-chat first token waits on OMP session construction

- **Where:** `packages/agent-service/src/supervisor/workers.ts` (spare pool), `packages/agent-service/src/worker/session.ts`
- **Added:** 2026-11-15
- **Priority:** only-if-grows
- **Problem:** a new chat that skips `prepare` reaches its first `part.delta` in ~720–800 ms against the 600 ms W11 budget (waived 2026-11-15). Even with each spare worker isolated in its own process, `createAgentSession` in `@oh-my-pi/pi-coding-agent` couples workspace graph discovery with bootstrap-bound `SessionManager` persistence/breadcrumbs/closures, `AgentRegistry.global()` `sessionFile`, `mcpManager` wiring, and construction-time `getApiKey`, memory, LSP, and skill-compression side effects, so a spare cannot prebuild the session graph before `WorkerBootstrapMessage` (`decisions.md: 2026-11-18 - Keep spare workers at runtime prewarm until OMP splits session-graph preparation from session binding`).
- **Impact:** paths that create a session without a draft (API callers, some automation) see roughly 200 ms more latency than the prepared path.
- **Solution:** add an upstream `@oh-my-pi/pi-coding-agent` two-phase session-graph seam (`prepareSessionGraph` / `hydrateSessionGraph` or late-bindable `SessionManager`, `MCPManager`, and `AgentRegistry` attachment without pre-bootstrap side effects), then prebuild the workspace session graph in spare workers (`decisions.md: 2026-11-18 - Keep spare workers at runtime prewarm until OMP splits session-graph preparation from session binding`).
- **Cost:** requires an upstream `@oh-my-pi/pi-coding-agent` SDK API change.

## A user-scope credential reference breaks every other workspace's MCP save

- **Where:** `packages/agent-service/src/worker/mcp-credentials.ts:12-20` (provider name hashes the writing workspace), `packages/agent-service/src/worker/mcp.ts:313-393` (the user MCP file is shared by every workspace), `packages/agent-service/src/worker/stateless.ts:220-223` (save resolves every reference before writing)
- **Added:** 2026-11-16
- **Effort:** ux-feedback-2026-11-15
- **Priority:** worth-doing
- **Problem:** a catalog entry installed at user scope writes its token as a workspace credential (`mcp_<uuid>`) and stores that reference in `~/.omp/agent/mcp.json`, which every workspace shares. `NativeMcpCredentials` prefixes the stored provider with a hash of the writing workspace, so another workspace that loads and saves that file fails the resolution check with 403 `MCP credential does not belong to this workspace`. Task 06 hit this for environment values and now forces project scope when any `envInputs` value is filled (`.workflow/decisions.md` 2026-11-16); token entries at user scope are unchanged and keep the hazard.
- **Impact:** installing any token catalog entry (Linear, Sentry, …) at user scope can make unrelated workspaces unable to save MCP configuration until the reference is removed by hand.
- **Solution:** either force project scope for every credential-carrying catalog install, or make user-file references resolvable from any workspace (workspace-independent provider name) while keeping project-file references workspace-scoped. Whichever path is chosen, add a save-from-another-workspace test.
- **Cost:** small in the UI (same scope guard as env installs); the credential-name change touches the store's provider naming and needs a migration story for existing refs.

## Security docs enterprise mode still mentions update checks

- **Where:** `packages/docs/content/docs/security.mdx:157` (and localized `packages/docs/content/docs/*/security.mdx`)
- **Added:** 2026-11-18
- **Effort:** rebrand
- **Priority:** worth-doing
- **Problem:** the enterprise mode section still states that "Update checks keep running, so security fixes still reach you, but they never report usage, not even the anonymous install ID", even though Phase A removed the CLI/host update check and telemetry reporting (`rebrand/03`, `rebrand/05`).
- **Impact:** readers configuring enterprise mode are told update checks run when the fork has removed that check.
- **Solution:** update or remove that bullet in `packages/docs/content/docs/security.mdx` and its localized translations.
- **Cost:** small docs-only edit across the security MDX files.
