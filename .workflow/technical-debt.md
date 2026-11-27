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

## Chat transcript still renders through ChatContainer instead of upstream ChatViewport

- **Where:** `packages/ui/src/components/chat/ChatContainer.tsx`, `MessageList.tsx`, `ChatMessage.tsx`, `message/MessageBody.tsx`, `message/parts/ToolPart.tsx`; upstream `column/ChatViewport.tsx`, `timeline/*`, `message/body/*`, `message/parts/toolRow/*`
- **Added:** 2026-11-20
- **Priority:** worth-doing
- **Problem:** upstream OpenChamber moved the transcript to `column/ChatViewport` with split `timeline/*` rows, `message/body/*` and `message/parts/toolRow/*` owners. Those modules read OpenCode message and part shapes (`Message.info`, `Part.state`, `sessionID`, `@/lib/opencode/*`). The 2026-11-20 upstream sync kept the fork's monolithic `ChatContainer → MessageList → ChatMessage → MessageBody → ToolPart` path on Canonical parts and removed the unwired upstream viewport/timeline/tool-row modules instead of porting them. Several live files also stay at the fork version where upstream's delta needed those owners (`MessageBody`, `ToolPart`, `ToolOutputDialog`, `MarkdownCode`, `MarkdownLink`, `UserTextPart`, `openChamberToolEnvelope`, `toolDiffUtils`, `lib/turns/*`, `work-status/*`).
- **Impact:** every later upstream sync conflicts on the transcript tree and re-adds the removed modules as modify/delete conflicts; upstream transcript features (message selection, shared-page cards, turn footers, row virtualization, tool-row expansion) do not reach the fork until the cutover.
- **Solution:** port `ChatViewport` and the `timeline/*`, `message/body/*` and `message/parts/toolRow/*` owners onto Canonical session, message and part records from `@openchamber/agent-contract`, then switch `ChatContainer` callers to `ChatViewport` and delete the monolithic path in the same change.
- **Cost:** large; it touches every transcript renderer and needs the Canonical part projections those modules expect (tool state, subagent child sessions, background shells, prompt origin). Do it as its own effort after the sync lands, with transcript parity checks against the current path.

## A user-scope credential reference breaks every other workspace's MCP save

- **Where:** `packages/agent-service/src/worker/mcp-credentials.ts:12-20` (provider name hashes the writing workspace), `packages/agent-service/src/worker/mcp.ts:313-393` (the user MCP file is shared by every workspace), `packages/agent-service/src/worker/stateless.ts:220-223` (save resolves every reference before writing)
- **Added:** 2026-11-16
- **Effort:** ux-feedback-2026-11-15
- **Priority:** worth-doing
- **Problem:** a catalog entry installed at user scope writes its token as a workspace credential (`mcp_<uuid>`) and stores that reference in `~/.omp/agent/mcp.json`, which every workspace shares. `NativeMcpCredentials` prefixes the stored provider with a hash of the writing workspace, so another workspace that loads and saves that file fails the resolution check with 403 `MCP credential does not belong to this workspace`. Task 06 hit this for environment values and now forces project scope when any `envInputs` value is filled (`.workflow/decisions.md` 2026-11-16); token entries at user scope are unchanged and keep the hazard.
- **Impact:** installing any token catalog entry (Linear, Sentry, …) at user scope can make unrelated workspaces unable to save MCP configuration until the reference is removed by hand.
- **Solution:** either force project scope for every credential-carrying catalog install, or make user-file references resolvable from any workspace (workspace-independent provider name) while keeping project-file references workspace-scoped. Whichever path is chosen, add a save-from-another-workspace test.
- **Cost:** small in the UI (same scope guard as env installs); the credential-name change touches the store's provider naming and needs a migration story for existing refs.
