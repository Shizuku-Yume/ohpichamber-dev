# 01: Eliminate inherited dead files, unused exports/types, and knip configuration hints

**Effort:** tech-debt-sweep
**Task type:** refactor
**Base commit:** 923e864b7
**Started:** 2026-11-07T13:56:00+08:00
**Finished:** 2026-11-07T14:40:00+08:00
**Blocked by:** None
**Covers:** W1
**Files:** `knip.json`; the 18 files reported by `bun run dead-code` (including `components/sections/agents/AgentSelector.tsx`, `lib/settings/vscodeNavigation.ts`, `components/chat/workflows/WorkflowRunCard.tsx`, `sync/workflow-activity.ts`, `components/desktop/DesktopInstanceMenu.tsx`, `web/src/api/github-references.ts`); the modules that held the 65 unused value exports and 69 unused exported types (`packages/agent-service/src/worker/catalog-settings.ts`, `packages/ui/src/lib/api/types.ts`, and the UI modules listed in the task's Progress section); `packages/ui/src/lib/ime.escapeSurfaces.test.ts`; `packages/ui/src/components/session/sidebar/DOCUMENTATION.md`; `packages/web/server/lib/workflows/DOCUMENTATION.md`
**Read first:** `.workflow/specs/tech-debt-sweep.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/m6-gate-2026-11-07/receipts/gate-deadcode.log`; `.agents/skills/openchamber-change-discipline/SKILL.md`
**Check:** `bun run dead-code && bun run type-check && bun run --cwd packages/ui test` → exits 0 with 0 unused files, 0 unused exports, 0 unused types, and 0 configuration hints.

## Done when

- [x] Audit and delete genuinely unused files reported by `bun run dead-code` (18 files, verifying no dynamic/runtime imports or tests rely on them) and delete associated orphaned dead tests if any.
- [x] Audit and un-export or remove the 65 unused value exports and 69 unused exported types reported by `bun run dead-code` (without touching `IntegrationsCatalogView.tsx`, `useTextareaInlinePicker.tsx`, `useSidebarGroupStatus.ts`, `ChatInput.tsx`, or `DiffWorkerProvider.tsx`).
- [x] Fix the 3 `knip.json` configuration hints (`packages/mobile`, `fix-deprecation.js`, `packages/web/bin/cli.js`) without adding blanket ignore masks, so `bun run dead-code` exits `0`.

## Progress

### Check before
- Baseline `923e864b7` on `tech-debt-sweep/01-dead-code-zero`, worktree `/home/shizuku/Project/ohpichamber-worktrees/debt-w1`.
- `bun install --frozen-lockfile`: exit 0.
- `bun run dead-code`: exit 1 — 18 unused files, 65 unused value exports, 69 unused exported types, 3 configuration hints, identical to `gate-deadcode.log`.

### Work
- `knip.json`: dropped the redundant `fix-deprecation.js` entry (inferred from the root `postcss`/scripts graph and `package.json` scripts), the redundant `packages/web` `bin/cli.js` entry (inferred from its `bin` field), and narrowed `packages/mobile`'s `project` pattern to `scripts/**` where its sources actually live. Added `src/components/chat/MarkdownRendererImpl.tsx` as an entry because `markdownRendererLoader.ts` loads it through a dynamic `import()`, so no ignore mask was needed.
- Deleted the 18 dead files after confirming nothing imports them by module specifier, dynamic `import()`, string path, or test fixture: `usePinnedSessionDirectory.ts`, `work-status/touchContext.ts`, `workflows/WorkflowRunCard.tsx`, `desktop/DesktopInstanceMenu.tsx`, `layout/useSidebarPeek.ts`, `sections/agents/AgentSelector.tsx`, `sections/integrations/{GitHubIntegration,LinearProjectMapping,LinearSessionComments}.tsx`, `sidebar/projects/useGroupOrdering.ts`, `views/git/authorSelection.ts`, `lib/{nativeShortcutRequests,renderPageAnswer,sessionWorkTitle,sidebarSessionRows}.ts`, `lib/settings/vscodeNavigation.ts`, `sync/workflow-activity.ts`, `web/src/api/github-references.ts`.
- Second-order cleanups the deletions surfaced: dropped `ime.escapeSurfaces.test.ts`'s sidebar-peek entry (its file is gone), the peek paragraph in the sidebar `DOCUMENTATION.md` loading rules, and the `sync/workflow-activity.ts` sentence in the workflows `DOCUMENTATION.md`.
- Value exports: kept only what a module uses itself and removed the `export` keyword for internal helpers (`isToolRowShown`, `isActivityRowPart`, `LeaveWorkStatusContext`, `useWorkStatusHiddenSections`, `workDraftIdOfComposerKey`, `pinQueues`, `setPendingPin`, `withWorkbenchViewedAt`, `setPendingPin` re-export, `OMP_CATALOG_SETTING_IDS`, `isGuestIconName`, `guestToolHeaderReadsOutput`, `spaceOfCreationRequest`, and the render-page constants/helpers); deleted declarations with no caller at all (`subscribeRuntimeUrlAuthToken`, `useSessionAdvisorNotes`, `useSourceControlProviderServing`, `readSourceControlProvider`, `linkProjectPlanSession`, `writeProjectTodo`, `selectEntryVisualSummary`, `clearSessionCleanse`, `workDraftComposerKey`, `isNewSessionDraftIdentity`, `readChatDraftClaimingFolderDraft`, `configuredAgentColor`, `isDesktopSafeStart`, `diffCommentOriginFromWalkthroughTarget`, `describeDiffCommentOrigin`, `subscribeSpacePermissionModes`, `isAbsoluteReferencePath`, `forgetSpaceCreationRequest`, `isSpaceCreationRequest`, `openGuestUrl`, `postGuestStatusAction`, `repositoryIssueLinkMime`, `useWorkflowRun`, `sessionLinkText`, `dispatchFrameScroll`, `glueChipPunctuation`, `useRecentSessionCollection`, `getParentId`, `getSessionTimestamp`, `formatRelativeShort`, `createSessionDraftId`, `projectSettingsTabForSearchTarget`, `dirtySwitchPushTarget`, `renderPageGuestService`-family exports, and their now-unused imports/constants).
- Type exports: the GitHub/Linear API response cluster in `lib/api/types.ts` had no reader outside the module once its dead consumers went, so 36 declarations left, together with the three unused `Tracker*` re-exports. Types still read inside their own module stay module-private (`GitHubPullRequestRef`, `GitHubRepoSelector`, `SidebarSessionProjection`, `UseSessionProjectCollectionResult`, `StatusViewPoller`, `ReviewCommentExcerpt`, `CleanseProgressStatus`, and the component `Props` interfaces).
- Second-order: removed `CHIP_TRAILING_PUNCTUATION`, `MIGRATED_COLOR_PLACEHOLDER`, `EMPTY_ADVISOR_NOTES`, `SEARCH_TARGET_TABS`, `SEARCH_RETIRED_PLACEHOLDER`-style leftovers, the `actionFailureSchema`/`GuestStatusActionResult` pair, and the imports they alone used.

- **Check after:** (2026-11-07)
  - `bun run dead-code`: exit 0, no findings.
  - `bun run type-check`: exit 0 across 5 projects (3,235 files).
  - `bunx oxlint <changed files>`: exit 0, no findings.
  - `bun run --cwd packages/ui test`: 1,028/1,028 test files pass.
  - `bun test packages/agent-service/src/worker/catalog-settings.test.ts`: 6 pass.
  - `bun run --cwd packages/web test server/lib/openchamber-control server/lib/guests`: 278 pass across 33 files.
  - `bun run lint`: exit 0; the 5 pre-existing `react-hooks` warnings in lane 2's files remain and are untouched here.
  - `bun run docs:validate`: exit 0 (672 pages, 56 sidebar links).
