# 13: Resolve the merge in the chat UI

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/components/chat/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 13; `research/ux-v270-systemic-review.md` R1 and R3; skills `ui-api-decoupling`, `sync-state-invariants`, `locale-ui-patterns`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 13` → 0; `bun run --cwd packages/ui type-check` reports no error located under `components/chat/`; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/components/chat` → 0 `unexplained`
- **Base commit:** eeb64ec99ed17a4611f6b951e51cbad054d79f0f
- **Status:** blocked

- [ ] Resolve the conflicted chat paths with the merge rule. Adopt upstream's message parts, including `ShownToolCard`, `HtmlRenderFrame`, `UiPageFrame`, `OpenChamberToolOutput`, `ToolResultParts`, the subagent UI block, text direction and the composer's `oc-surface-floating`/`oc-composer-sheen` surface. Keep only the OMP-boundary data access.
- [ ] Restore upstream chat files the fork silently deleted (no ledger row) unless a decision retires them; record the decision reference when one does.
- [ ] Do not redesign chat semantics here; the R3 cutover (tasks 23-24) starts from this merged state.
- [ ] Deletes: fork rewrites of chat files whose delta carries no OMP-boundary reason.

## Progress

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 13` → 1,992 markers in 129 conflicted `components/chat` paths (lane owns 162 paths); `bun run --cwd packages/ui type-check` → `TS1005`/`TS1185` syntax errors throughout `components/chat`.

**Measured partition of the lane at HEAD (`64ee70422`):** 697 chat files. 129 carry conflict markers. Of the rest, 79 are byte-identical to upstream only, 197 byte-identical to the fork only, 287 identical on both sides, 134 differ from both. Upstream has 675 chat files, the fork 628; 274 files differ between the two trees.

**Why the lane cannot finish as scoped:** the upstream chat tree is one version-coupled component, and its root is the deleted OpenCode engine.

- 180 of 675 upstream chat files import `@/lib/opencode/*` directly (`model` 152 references, `tools` 31, `client` 25, plus `ids`, `reply-command`, `background-shell`, `subagent-run`, `toolContentShells`, `session-notices`, `websearch`, `prompt-origin`, `location-errors`, `background-image`).
- `packages/ui/src/lib/opencode/` at HEAD, on `main`, and in this lane holds only `events.ts`; upstream `bc50ba56a` holds 54 files. Restoring them is a standing exclusion (`2026-11-10 - Merge upstream OpenChamber with a real git merge`: "OpenCode-engine paths" → fork side).
- Dependency closure over the differing files groups 244 of the 274 disagreements into a single component, because fork and upstream rewrote the same shared modules (`message/types.ts`, `chatColumnSession.ts`, `lib/turns/liveActivity.ts`, `message/partUtils.ts`, `message/parts/ToolPart.tsx`, `MessageBody.tsx`, `MessageList.tsx`) against different data shapes.
- Only 4 upstream-only chat files can be restored with all imports resolving and no differing chat dependency: `markdown/DOCUMENTATION.md`, `message/frameSelection.ts`, `message/parts/taskSessionIdParser.ts`, `permissionCardPatterns.ts`. The other 110 upstream-only files need the engine or a rewritten dependent.
- The components this task names — `ShownToolCard`, `HtmlRenderFrame`, `UiPageFrame`, `OpenChamberToolOutput`, `ToolResultParts`, `GeneratedImages`, `SecretRequestCard`, `PageAskStatus` — exist at HEAD byte-identical to upstream and do not compile. Their closure is 150 files and 11 missing engine modules. Their signatures take upstream's `ToolPart` (`part.tool`, `part.state.{status,input,output,metadata,time}`, `part.sessionID`, `part.messageID`); the fork's canonical contract has `ToolCallPart` (`partId`, `toolCallId`, `toolName`, `input`, `status`) and a separate `ToolResultPart`. Adopting them therefore means either the engine or an adapter plus ported engine helpers (`renderedPage`, `generatedImagePaths`, `requestedSecret`, `requestedSecretRun`, `proposedWorkflowRunId`, `isShownInPlace`).

**Verified baseline:** the fork's chat tree, checked out over the fork's non-chat tree in a scratch worktree, type-checks with 0 errors under `components/chat/` (283 errors remain elsewhere, all in other lanes' files). So a fork-side resolution is compilable today; an upstream-side resolution is not.

**Not done:** no marker resolution, no file deletions, no ledger rows, no decision, no Check, no archive, no landing. The worktree is left at its found state (`git status`: only this task file).

## Blocked

The merge rule resolves this lane two ways and the choice is not an implementation detail:

1. **Fork side wins the whole chat tree** (delete the 110 unrestorable upstream-only files, keep all 628 fork files, record a decision that chat presentation stays on the canonical contract until R3, add `upstream-excluded`/`omp-boundary` ledger rows). This contradicts the task's first acceptance box, which names upstream components to adopt, and it lands 129 marker-free rewrites the ledger then has to justify.
2. **Restore the OpenCode engine UI modules** so upstream's chat tree compiles. This contradicts the standing merge exclusion and the migration target (OMP-only, no OpenCode engine).

Per the ticket, the Check must be real; neither option can be executed without a decision the maintainer owns. The measured evidence above is what the decision needs: option 1 is a complete, compilable, canonically-correct chat UI that loses the upstream-only presentation polish; option 2 buys that polish back by reintroducing the engine the fork deleted.
