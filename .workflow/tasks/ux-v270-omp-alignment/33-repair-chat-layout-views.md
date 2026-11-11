# 33: Make the merged chat, layout, views and app shells compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/{chat,layout,views,multirun,ui,onboarding,projects,sourceBoard,desktop,comments,references}/**`; `packages/ui/src/apps/**`; `packages/ui/src/App.tsx`; their tests; slice 33 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); `decisions.md: 2026-11-11 - Chat presentation is ported onto the canonical contract…`; the archived task 13 and 16 records; skills `ui-api-decoupling`, `sync-state-invariants`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 33 files (about 190 errors at scaffold `93a3c7549`: chat 54, layout 46, views 28, multirun 13, apps 13, ui 11, the rest small); `bun scripts/upstream-drift.mjs --check --slice 33` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/chat packages/ui/src/components/layout packages/ui/src/components/views packages/ui/src/apps` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31
- **Status:** blocked

- [ ] Fix every type error in slice 33 files by porting merged upstream callers onto the fork's contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them).
- [ ] Chat: keep the presentation ported onto the canonical contract as lane 13 decided; do not start the R3 redesign (tasks 23-24).
- [ ] Every app root (`App`, `MobileApp`, `ElectronMiniChatApp`) compiles with the merged action sets.
- [ ] Tests: fix kept behaviour, delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [ ] Give every slice 33 `unexplained` path a reason.
- [ ] Deletes: imports of removed OpenCode modules and their dead branches.

## Progress

**Check before** (whole-repo `bun check --all`, filtered to slice 33): 173 errors in 47 files (`chat/ModelControls.tsx` 27, `layout/ContextSidebarTab.tsx` 25, `multirun/ModelMultiSelect.tsx` 10, `ui/ProviderLogo.test.tsx` 10, `chat/ChatInput.tsx` 7, `views/SettingsView.tsx` 7, plus 41 smaller files). `bun scripts/upstream-drift.mjs --check --slice 33` → no markers, 56 `unexplained` paths. Slice tests: repo runner `node scripts/run-isolated-tests.mjs packages/ui/src/components/chat` → 176/232 files pass, 56 fail.

**Check after:** not reached (forced run stop).

**Measured root causes** (each read from the trees, not guessed):

- The scaffold's lane-15 resolution took upstream v2.7.0's `sync/selection-store.ts` blob and dropped the fork's `ROOT_SELECTION_AGENT` and `save/getAgentModelReasoningEffortForSession` — the fork's OMP-native effort API added in `bc2a893dc`/`393926907`. Four files still call it (`chat/{ChatInput,ModelControls,pinnedComposerSelection}`, `sync/session-ui-store.ts`). Slice 34 owns `src/sync`, so this is a cross-slice dependency I cannot fix here; restoring the fork blob is a one-command fix for task 34.
- The lane-14 resolution took upstream's `components/model-picker/ModelPickerList.tsx` (`ModelPickerEntry.providerID/modelID`, `Provider.id`) while its consumers in slice 33 (`ModelControls.tsx`, `multirun/ModelMultiSelect.tsx`) use the fork's `providerId/modelId` contract. This is the single largest fan-out (37 errors) and lives in a lane-14 path, outside slice 33.
- `bunx vitest run` cannot run at all on this tree: there is no root `vitest.config.ts` and no vitest `projects` config (the pre-merge `vitest.config.ts` at `05fe1b888` listed `packages/vscode` and `packages/relay-server`, both retired by this fork). The UI tests are `bun:test`, so the task's `VITEST_MAX_WORKERS=2 bunx vitest run …` check cannot execute as written; the repo's own runner (`scripts/run-isolated-tests.mjs`) is the working equivalent.
- The store fields the merged layout/views files read (`customProviderLogos`, `contextZoneExpandedChatSizes`, `setContextZoneExpandedChatSize`, `sessionTabsPerWorkspace`, `projectConfigErrors`) exist only in upstream's `stores/useUIStore.ts`/`useConfigStore.ts`; the scaffold kept the fork blobs. Same cross-slice shape: `src/stores` is slice 34's.
- Slice 33's own errors then split into: (a) upstream-only modules in slice-33 paths (`PluginPane` incompatibility state, `WalkthroughToc`/`WalkthroughStream` whole-file comment props, `UsageStatsView` `PartialUsageNotice`, `SettingsView` `isVSCode`/`settingsPageTitleKey`, `ContextPanelRail` unbound drag handlers) that need a port or deletion; (b) upstream test fixtures on fork shapes (`RuntimeDescriptor.isVSCode`, `MobileAppActions.openPlan`, `ChangeRequestTerm` non-null); (c) `main`-side leftovers (`FilesView` icons `menu-fold-2`/`file-transfer`/`file-check*`, `RunLaneCard` duplicate functions, `useWorktreeArchiveActions` `deleteBranch` argument).

## Blocked

Forced run stop mid-repair; the repair is incomplete. 173 slice-33 type errors remain in 47 files, 56 slice-33 drift paths are still `unexplained`, slice tests are unrun to green, and nothing was landed. The work done was measurement only: no slice-33 production file was changed, and the probe edits I had staged in cross-slice files were reverted.

The blocking shape of the remaining work:

- `sync/selection-store.ts` dropped the fork's `ROOT_SELECTION_AGENT` and `save/getAgentModelReasoningEffortForSession` APIs (lane 15 took upstream's blob). Slice 34 owns `src/sync`; four slice-33 files call them.
- `components/model-picker/ModelPickerList.tsx` carries upstream's `providerID/modelID` + `Provider.id` contract (lane 14 path, outside slice 33) while slice-33 consumers use the fork's `providerId/modelId`; 37 of the 173 errors are this one mismatch.
- The five store fields the merged layout/views files read (`customProviderLogos`, `contextZoneExpandedChatSizes`, `setContextZoneExpandedChatSize`, `sessionTabsPerWorkspace`, `projectConfigErrors`) exist only in upstream's `useUIStore`/`useConfigStore`; `src/stores` is slice 34's.
- The task's test check cannot run: there is no root Vitest project config on this tree (the retired `vitest.config.ts` named the removed `packages/vscode` and `packages/relay-server`), and the UI suites are `bun:test`. The repo runner is `node scripts/run-isolated-tests.mjs`.

Restoring the fork's `selection-store.ts`, `model-picker/ModelPickerList.tsx` and the fork/upstream store union is a prerequisite for slice 33 to reach zero; each is owned by lane/slice work outside this task's file list.
