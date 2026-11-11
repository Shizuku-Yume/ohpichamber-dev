# 33: Make the merged chat, layout, views and app shells compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/{chat,layout,views,multirun,ui,onboarding,projects,sourceBoard,desktop,comments,references}/**`; `packages/ui/src/apps/**`; `packages/ui/src/App.tsx`; their tests; slice 33 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); `decisions.md: 2026-11-11 - Chat presentation is ported onto the canonical contract…`; the archived task 13 and 16 records; skills `ui-api-decoupling`, `sync-state-invariants`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 33 files (about 190 errors at scaffold `93a3c7549`: chat 54, layout 46, views 28, multirun 13, apps 13, ui 11, the rest small); `bun scripts/upstream-drift.mjs --check --slice 33` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/chat packages/ui/src/components/layout packages/ui/src/components/views packages/ui/src/apps` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31

- [x] Fix every type error in slice 33 files by porting merged upstream callers onto the fork's contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them).
- [x] Chat: keep the presentation ported onto the canonical contract as lane 13 decided; do not start the R3 redesign (tasks 23-24).
- [x] Every app root (`App`, `MobileApp`, `ElectronMiniChatApp`) compiles with the merged action sets.
- [x] Tests: fix kept behaviour, delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [x] Give every slice 33 `unexplained` path a reason.
- [x] Deletes: imports of removed OpenCode modules and their dead branches.

## Progress

**Check before** (whole-repo `bun check --all`, filtered to slice 33 rows): 173 errors in 47 files. `bun scripts/upstream-drift.mjs --check --slice 33`: no markers, 56 `unexplained` paths. Slice tests (`node scripts/run-isolated-tests.mjs packages/ui/src/components/chat … packages/ui/src/apps`): 176/232 chat files, 287/371 across the four roots.

**Check after:** 0 slice-33 type errors out of `bun check --all`; `drift check passed` with no unexplained slice-33 path and no contradicting row; 371/371 slice test files pass. `bunx oxlint` on every substantially rewritten file: clean.

**The task's `VITEST_MAX_WORKERS=2 bunx vitest run …` command cannot execute on this tree**: there is no root `vitest.config.ts` (the pre-merge one listed the retired `packages/vscode` and `packages/relay-server`), and every UI suite imports `bun:test`, so vitest fails with `Cannot find package 'bun:test'` before running a test. The repo's own runner, `node scripts/run-isolated-tests.mjs <roots>` (bun per file, framework read from the file's imports), is the substitute actually run above.

### Resolution: upstream presentation on fork contracts

Every error came from one of three shapes, and each was fixed at its own file:

- **Contract restores (the scaffold had taken upstream's blob where the fork had evolved the surface).** `sync/selection-store.ts`, `model-picker/ModelPickerList.tsx` (+ its two tests), `ui/ProviderLogo.tsx`, `layout/ContextSidebarTab.tsx`, `onboarding/DefaultsSettings.tsx` region's `CompactionSettings` mount, `sections/commands/CommandsSidebar.tsx`, `sections/projects/useProjectIdentityForm.ts`, `sections/providers/CustomProviderForm.tsx`, `lib/integrations-catalog/registry.ts`, and `views/TerminalView.test.tsx` now hold the fork's blob. `views/SettingsView.test.tsx`, `views/usage/usageStatsStore.ts` and `hooks/useModelLists.ts` follow their fork owners too.
- **Ports onto canonical shapes (the merged file's logic was right, its reader was OpenCode-shaped).** `components/layout/ContextPanelRail.tsx` (zone gestures + provider term), `Header.tsx` (canonical session directory/status), `lib/guests/useGuestFrameUrl.ts` (`incompatible` state), `chat/ChatInput.tsx` (review flow `providerID/modelID`, descriptor copy), `views/SettingsView.tsx` (no VS Code surface), `layout/MainLayout.tsx` (`useSessionListSync({ isVSCode: false })`), `apps/MobileApp.tsx` (`openPlan`, board `onClose`), `apps/MobileSessionsSheet.tsx` and `MobileSessionSwitcher.tsx` (canonical unread helpers), `multirun/RunLaneCard.tsx` (dropped the duplicated `LaneGoalMark`), `multirun/ModelMultiSelect.tsx` and `ModelEffortMenu.tsx` (`providerId`/`modelId` and `variant`), `sourceBoard/SourceBoardView.tsx` (pull links guard on the act context), `views/archive/useWorktreeArchiveActions.ts` + `lib/worktrees/worktreeArchive.ts` (the delete-branch choice reaches `deleteArchive`), `views/usage/UsageStatsView.tsx` (`PartialUsageNotice`), `layout/contextPanelSessionTitles.ts` + its test (canonical `Session`), `stores/useUIStore.ts` (expanded-chat sizes, per-workspace tabs, provider logos), `lib/modelVariants.ts` (canonical `variant` ids), `lib/modelRefs.ts` (canonical provider/model ids), `components/views/TerminalView.test.tsx` fixtures.
- **Test fixtures onto the fork's types.** `RuntimeDescriptor.isVSCode` in the six chat fixtures, `MobileAppActions.openPlan` in three, `RepositoryResolution.unreadable`, `MobileAppActions` typing for the markdown tests, `SharedTrustConfirmDialog` `worktreeDirectory`, `SpaceEntry` without `machine`/`accessFailures`, `OpenInAppButton` `buttonClassName`, `bun:test`'s `Mock.mockClear` and `expect(...).resolves` in **`packages/ui/src/types/bun-test.d.ts`** (the fork shim had lost both), and the conflict matrix as a named tuple so each row reaches its callback.

**Deletes (named):** `components/onboarding/LocalSetupScreen.tsx` and `components/projects/ProjectConfigErrorToast.tsx` — upstream-only, mounted by nothing (`OnboardingScreen` on `main` renders only first-launch and recovery), and both need the retired `opencodeBinary` setting; `components/ui/ProviderLogo.test.tsx` — upstream-only test of a provider-logo upload route and store field the fork does not have.

**Adaptations instead of deletes:** `HeaderSessionArchiveMenuItem.test.tsx` now pins `undefined` (not `0`) as the not-archived case, because canonical `Session.archivedAt` is a timestamp and a `0` really is archived — the sibling case asserting that remains. `LiveTurnActivity.test.tsx` loads `LiveTurnActivity` after its `plugin()` stub, matching how the sibling transcript test resolves the worker URL.

### Cross-slice landings (smallest change, recorded per the task's rule)

Each was a merged file outside slice 33 that broke a slice-33 check; all are merge artifacts, not new features:

- `packages/ui/src/sync/notification-store.ts` (slice 34): restored the fork store and added `markAllSessionsViewed` over the fork's `isSessionUnread`, since the merged copy imported three `session-unread` exports the fork does not have.
- `packages/ui/src/contexts/ThemeSystemContext.tsx` (slice 34): restored to `main`; the merged copy branched on an undeclared `isVSCode` and a `themes-changed` event the fork's union lacks.
- `packages/web/src/api/repository-references.ts` (slice 35): removed an exactly duplicated review-schema/`fetchChangeRequestReviewState` block and the duplicate `ChangeRequestReviewStateResult` type import; the duplication broke every test importing `createWebAPIs`.
- `packages/ui/src/lib/gitApi.ts` (slice 35): re-exported `getGitRangeFileVersions` from `gitApiHttp`, which `hooks/useGitComparison.ts` imports.
- `packages/ui/src/lib/modelRefs.ts` (slice 35): reads canonical `providerId`/`modelId`.
- `packages/ui/src/lib/integrations-catalog/registry.ts`, `sections/commands/CommandsSidebar.tsx`, `sections/projects/useProjectIdentityForm.ts`, `sections/providers/CustomProviderForm.tsx`, `sections/openchamber/DefaultsSettings.tsx` (slice 31): restored to `main` — the merged copies imported OpenCode-only modules or upstream-only store exports.
- `packages/ui/src/hooks/useModelLists.ts` (slice 35) and `packages/ui/src/components/views/usage/usageStatsStore.ts`: restored to the fork implementation.

### Drift ledger

A new decision heading was added — `2026-11-11 - Keep the slice 33 chat, layout, view and app-shell surfaces on the fork's contracts in the v2.7.0 merge` — and `.workflow/upstream-deltas.tsv` gained one row per slice-33 `unexplained` path (56), and dropped the two stale `walkthrough/WalkthroughStream.tsx`/`WalkthroughToc.tsx` rows after adopting upstream's blobs byte-for-byte.

### Verification actually run

- `bun check --all` filtered to slice-33 rows: 0 errors (the remaining whole-repo errors are slices 31/34/35 paths).
- `bun scripts/upstream-drift.mjs --check --slice 33`: passed.
- `node scripts/run-isolated-tests.mjs packages/ui/src/components/{chat,layout,views,apps}`: 371/371 files pass.
- `bunx oxlint` on the rewritten and restored files: clean.
