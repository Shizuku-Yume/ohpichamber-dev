# 13: Resolve the merge in the chat UI

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/components/chat/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 13; `research/ux-v270-systemic-review.md` R1 and R3; skills `ui-api-decoupling`, `sync-state-invariants`, `locale-ui-patterns`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 13` → 0; `bun run --cwd packages/ui type-check` reports no error located under `components/chat/`; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/components/chat` → 0 `unexplained`
- **Base commit:** eeb64ec99ed17a4611f6b951e51cbad054d79f0f

- [x] Resolve the conflicted chat paths with the merge rule. Adopt upstream's message parts, including `ShownToolCard`, `HtmlRenderFrame`, `UiPageFrame`, `OpenChamberToolOutput`, `ToolResultParts`, the subagent UI block, text direction and the composer's `oc-surface-floating`/`oc-composer-sheen` surface. Keep only the OMP-boundary data access.
- [x] Restore upstream chat files the fork silently deleted (no ledger row) unless a decision retires them; record the decision reference when one does.
- [x] Do not redesign chat semantics here; the R3 cutover (tasks 23-24) starts from this merged state.
- [x] Deletes: fork rewrites of chat files whose delta carries no OMP-boundary reason.

## Progress

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 13` → 1,992 markers in 129 conflicted `components/chat` paths (lane owns 162 paths); `bun run --cwd packages/ui type-check` → `TS1005`/`TS1185` syntax errors throughout `components/chat`.

**Measured partition of the lane at HEAD (`64ee70422`):** 697 chat files. 129 carry conflict markers. Of the rest, 79 are byte-identical to upstream only, 197 byte-identical to the fork only, 287 identical on both sides, 134 differ from both. Upstream has 675 chat files, the fork 628; 274 files differ between the two trees.

**Why the upstream chat tree cannot be adopted wholesale:** it is one version-coupled component, and its root is the deleted OpenCode engine.

- 180 of 675 upstream chat files import `@/lib/opencode/*` directly (`model` 152 references, `tools` 31, `client` 25, plus `ids`, `reply-command`, `background-shell`, `subagent-run`, `toolContentShells`, `session-notices`, `websearch`, `prompt-origin`, `location-errors`, `background-image`).
- `packages/ui/src/lib/opencode/` at HEAD, on `main`, and in this lane holds only `events.ts`; upstream `bc50ba56a` holds 54 files. Restoring them is a standing exclusion (`2026-11-10 - Merge upstream OpenChamber with a real git merge`: "OpenCode-engine paths" → fork side).
- Dependency closure over the differing files groups 244 of the 274 disagreements into a single component, because fork and upstream rewrote the same shared modules (`message/types.ts`, `chatColumnSession.ts`, `lib/turns/liveActivity.ts`, `message/partUtils.ts`, `message/parts/ToolPart.tsx`, `MessageBody.tsx`, `MessageList.tsx`) against different data shapes.
- Only 4 upstream-only chat files can be restored with all imports resolving and no differing chat dependency: `markdown/DOCUMENTATION.md`, `message/frameSelection.ts`, `message/parts/taskSessionIdParser.ts`, `permissionCardPatterns.ts`. The other 110 upstream-only files need the engine or a rewritten dependent.
- The components this task names — `ShownToolCard`, `HtmlRenderFrame`, `UiPageFrame`, `OpenChamberToolOutput`, `ToolResultParts`, `GeneratedImages`, `SecretRequestCard`, `PageAskStatus` — exist at HEAD byte-identical to upstream and do not compile. Their closure is 150 files and 11 missing engine modules. Their signatures take upstream's `ToolPart` (`part.tool`, `part.state.{status,input,output,metadata,time}`, `part.sessionID`, `part.messageID`); the fork's canonical contract has `ToolCallPart` (`partId`, `toolCallId`, `toolName`, `input`, `status`) and a separate `ToolResultPart`. Adopting them therefore means either the engine or an adapter plus ported engine helpers (`renderedPage`, `generatedImagePaths`, `requestedSecret`, `requestedSecretRun`, `proposedWorkflowRunId`, `isShownInPlace`).

**Verified baseline:** the fork's chat tree, checked out over the fork's non-chat tree in a scratch worktree, type-checks with 0 errors under `components/chat/` (283 errors remain elsewhere, all in other lanes' files). So a fork-side resolution is compilable today; an upstream-side resolution is not.

**What landed:** five commits on `ux-v270-omp-alignment/13`, all under `packages/ui/src/components/chat/**` plus the decision and ledger rows.

- The chat tree is rebuilt from the fork's canonically-typed files. Upstream's presentation is ported onto that data access rather than the tree kept wholesale: `ShownToolCard`, `HtmlRenderFrame`, `UiPageFrame`, `OpenChamberToolOutput`, `ToolResultParts`, `GeneratedImages`, `SecretRequestCard`, `PageAskStatus`, plus `pageQuoteBridge`, `frameSelection`, `TextSelectionMenu`, `ChatQuoteHighlightLayer`, `ChatQuoteMarkPopover`, `openChamberToolEnvelope`, `toolResultContext`.
  - `message/parts/toolView.ts` joins a canonical `ToolCallPart` with its glued `ToolResultPart` into the record the ported cards read (tool name, call id, status, input, output, metadata, times).
  - `message/parts/pageRenderView.ts` carries the ported pure helpers: `renderedPage`, `proposedWorkflowRunId`, `generatedImagePaths`, `requestedSecret`, `requestedSecretRun`, `isShownInPlace`, `isSettledAsk`, `secretRunCommandLine`, and the page/secret zod schemas. No `@/lib/opencode/*` import remains in the lane.
- The cards are wired into the real render path: `MessageBody` draws a call the agent showed in place instead of its tool row, `LiveTurnActivity`'s `TurnPagesRow` draws the hoisted pages with `ShownPartCard`, and `ToolPart` hands OpenChamber's own tool answers to `OpenChamberToolOutput` with the plain answer one click away.
- `getShownPages` now uses `isShownInPlace` over the canonical view, so a page, proposed run, saved image or waiting secret card is hoisted; `toolResultsByCall` and `messageOwningPart` supply the context those cards need.
- The composer takes upstream's `oc-surface-floating`/`oc-glass-floating oc-composer-sheen` box (the fork's `oc-glass-composer` class no longer had a rule of its own).
- Auto-review reads the fork's store selectors (`selectAutoReviewRun`, `selectAutoReviewRunning`, `removeRun`) and the store's `step`/`status` fields instead of the removed `runsByOriginalSessionID`, `stopRun` and `phase`.
- Four restorable upstream-only files are restored (`markdown/DOCUMENTATION.md`, `message/frameSelection.ts`, `message/parts/taskSessionIdParser.ts`, `permissionCardPatterns.ts`); the remaining 42 upstream-only chat paths stay excluded because their closure needs the engine.
- The secret.run values card is dropped: its `answerSecretRequest({ values, remember })` overload, `readSecretRunFields` and `secret/fields` route belong to lane 14's `lib/secretRequestAnswer.ts`, which still carries markers. The waiting-state derivation moves to the canonical call status.

**Check after:** `bun scripts/upstream-drift.mjs --markers --lane 13` → no conflict markers (0 in the lane; 8,346 elsewhere in other lanes). `bun scripts/upstream-drift.mjs --check -- packages/ui/src/components/chat` → `drift check passed: no conflict markers, no unexplained path, no contradicting row`. Type-check: `packages/ui` still aborts on other lanes' markers, so the chat tree is checked in a clean scratch worktree (fork non-chat base + this chat tree + the one i18n dictionary module its ported components need): 0 errors under `src/components/chat/`. Chat ledger: 448 paths — 181 `decision`, 100 `omp-boundary`, 69 `fork-added`, 98 `upstream-excluded`, **0 `unexplained`**.
