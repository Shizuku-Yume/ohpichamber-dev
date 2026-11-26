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

## Queued message editing needs preserved original drafts and atomic Host take

- **Where:** `packages/ui/src/stores/messageQueueStore.ts`, `packages/web/server/lib/message-queue/`
- **Priority:** worth-doing
- **Problem:** Canonical queue projections omit context text, and durable records retain the Host-captured request rather than a separate original UI draft. Client-side removal followed by sending races Host delivery and cannot faithfully restore the original context.
- **Impact:** editing and send-now are disabled for every queued message. The Host remains the sole delivery authority on web, Electron, hosted mobile and Capacitor.
- **Solution:** preserve the original public draft alongside the Host capture; add an authenticated, atomic Host CAS take/restore operation that rejects leased or stale items and returns the full original draft only after successful ownership transfer. Define explicit behavior for old records without recoverable originals. Preserve attachments, model options, context and delivery receipts; test concurrent delivery, failures and runtime switches.
- **Cost:** Host persistence and product API changes, plus shared UI restoration and concurrency coverage. No new API is introduced by this sync.

## Fork-owned server JavaScript awaits TypeScript conversion

The merge also carried untyped fork JavaScript bodies into upstream `.ts`
destinations. `packages/web/scripts/fork-owned-server-untyped.json` records each
retained path and its original fork path. Historical worktree measurements:
fork `881705d19b` passed its frontend-only web check (2,299 files, two projects)
and had zero server implementation TypeScript; upstream `1928155551` passed its
strict server check. Their strict compiler configurations are unchanged by this
scope repair. The explicit legacy set supplies generated declarations through a
no-check referenced project; all other roots, including new neighbors, retain
strict checking and server lint. Remove entries as their bodies gain real type
annotations and pass those checks. This is preserved prior coverage, not a
claim that the carried-over bodies have been type-verified.

- **Where:** `packages/web/scripts/fork-owned-server-javascript.mjs`, `packages/web/server/`
- **Priority:** worth-doing
- **Problem:** the upstream TypeScript-only guard conflicts with 95 retained fork-owned JavaScript modules, including excluded isolated-space modules. The explicit generated list freezes only those existing paths; new server modules still require TypeScript.
- **Impact:** the listed implementations are not covered by the server TypeScript conversion gate.
- **Solution:** convert the retained modules by owner with real types and existing runtime tests, removing each path from the explicit list. Preserve the isolated-space release exclusion and Canonical/Host boundaries.
- **Cost:** a separate server migration rather than mechanical renames or broad guard exemptions.

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

## Composer model label temporarily shows the previous model during a new-session run

- **Where:** shared composer model presentation during new-session streaming.
- **Added:** 2026-11-20
- **Priority:** minor
- **Problem:** while a devin-swe-2 reply streams in a new session, the composer label shows the previously selected gemini-3.5-flash-lite model and reverts after completion.
- **Impact:** display-only; the run uses devin-swe-2. No routing or response-loss regression is established by this report.
- **Solution:** identify the stale presentation owner and derive the streaming label from the authoritative session/run selection, preserving ordinary draft selection outside a run. Cover promotion, streaming, completion and interruption ordering.
- **Cost:** focused composer state investigation and regression coverage; the source cause is not yet verified.

## Advisor overflow compaction refusal has no behavioral test

- **Where:** SDK patch `session/session-advisors.ts` overflow compaction candidate loop; `packages/agent-service/src/worker/session-native.test.ts`
- **Added:** 2026-11-26
- **Priority:** worth-doing
- **Problem:** The advisor overflow compaction loop skips Host-refused candidates and surfaces the refusal when none remains, but no test drives advisor overflow compaction with `provider.use` denied. The identical pattern is covered for manual compaction and job widgets.
- **Impact:** A regression in that one loop would go unnoticed. The registry wrapper still blocks the credential, so a regression costs diagnosability, not egress.
- **Solution:** Drive an advisor overflow through the existing WATCHDOG.yml fixture with the compaction candidate denied; assert no provider request and a visible refusal.
- **Cost:** Involved harness setup: an asynchronous maintenance trigger and a forced context overflow.

## Image generation authorizes provider entry instead of provider use

- **Where:** `packages/agent-service/src/worker/stateless.ts` (~330), `packages/agent-service/src/worker/catalog-models.ts` (~1274)
- **Added:** 2026-11-26
- **Priority:** worth-doing
- **Problem:** `catalog.image.generate` asks only for the `provider-entry` grant before resolving a credential through the unwrapped runtime registry. It never requests a `provider.use` admission for the image model's provider, model and endpoint.
- **Impact:** Image generation is checked by a weaker rule than every agent-driven provider request: its provider, model and endpoint never pass the `provider.use` policy.
- **Solution:** Request `provider.use` for the image tuple. Decide whether image models join the workspace provider policy or get their own purpose, as embeddings did.
- **Cost:** Host policy shape for image models and its Settings presentation; focused stateless worker and authorizer tests.

## Exact slash-command matches need a second Enter

- **Where:** shared composer slash-command autocomplete
- **Added:** 2026-11-26
- **Priority:** worth-doing
- **Problem:** When typed text exactly matches a command, the autocomplete stays open. The first Enter only selects the item and appends a space; a second Enter submits. After a control command fails, the typed text is not visibly restored. Observed in the isolated browser run (`ohpichamber-omp-artifacts/omp19-close-2026-11-26/realpath/REPORT.md`); the cause has not been traced in source.
- **Impact:** Every exact slash command costs an extra keypress, and a failed command loses the typed text.
- **Solution:** Submit on Enter when the input already equals the highlighted command. Restore the draft when a control command is rejected. Cover keyboard and touch submission.
- **Cost:** Composer input state changes and regression tests across desktop and mobile layouts.
